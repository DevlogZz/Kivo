use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use chrono::Utc;
use futures_util::{FutureExt, SinkExt, StreamExt};
use rust_socketio::asynchronous::{Client as SioClient, ClientBuilder as SioBuilder};
use rust_socketio::{Event as SioEvent, Payload as SioPayload, TransportType as SioTransportType};
use rustls::{ClientConfig, RootCertStore};
use rustls_pki_types::{CertificateDer, ServerName, UnixTime};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::handshake::client::Response as WsResponse;
use tokio_tungstenite::tungstenite::http::{HeaderName as WsHeaderName, HeaderValue as WsHeaderValue};
use tokio_tungstenite::tungstenite::protocol::{CloseFrame, Message as WsMessage};
use tokio_tungstenite::Connector;
use uuid::Uuid;

use crate::http::client::{
    build_cookie_header_from_store, merge_set_cookie_headers,
};
use crate::storage::models::AppSettings;

const REALTIME_EVENT: &str = "realtime:event";
const DEFAULT_USER_AGENT: &str = concat!("kivo/", env!("CARGO_PKG_VERSION"));

#[cfg(test)]
#[path = "realtime_tests.rs"]
mod tests;

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeAuth {
    #[serde(default, rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub token: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub api_key_name: String,
    #[serde(default)]
    pub api_key_value: String,
    #[serde(default)]
    pub api_key_in: String,
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub token_type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeConnectPayload {
    pub url: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub auth: RealtimeAuth,
    #[serde(default)]
    pub workspace_name: String,
    #[serde(default)]
    pub collection_name: String,
    #[serde(default)]
    pub use_cookie_jar: Option<bool>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub disable_user_agent: Option<bool>,
    // SSE-specific
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    // Socket.IO-specific
    #[serde(default)]
    pub namespace: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeEmitSocketIoPayload {
    pub stream_id: String,
    pub event: String,
    #[serde(default)]
    pub data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeSendPayload {
    pub stream_id: String,
    #[serde(default = "default_send_kind")]
    pub kind: String,
    #[serde(default)]
    pub data: String,
}

fn default_send_kind() -> String {
    "text".to_string()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeCancelPayload {
    pub stream_id: String,
    #[serde(default)]
    pub code: Option<u16>,
    #[serde(default)]
    pub reason: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RealtimeEvent {
    pub stream_id: String,
    pub kind: String,
    pub event: String,
    pub data: serde_json::Value,
    pub at: String,
}

enum OutgoingMessage {
    Text(String),
    Binary(Vec<u8>),
    Ping(Vec<u8>),
    Close(Option<(u16, String)>),
}

struct StreamHandle {
    sender: Option<mpsc::UnboundedSender<OutgoingMessage>>,
    cancel: Option<oneshot::Sender<()>>,
    socketio: Option<SioClient>,
}

static STREAMS: OnceLock<Mutex<HashMap<String, StreamHandle>>> = OnceLock::new();

fn streams() -> &'static Mutex<HashMap<String, StreamHandle>> {
    STREAMS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn register_stream(id: String, handle: StreamHandle) {
    let mut map = streams().lock().unwrap();
    map.insert(id, handle);
}

fn take_stream(id: &str) -> Option<StreamHandle> {
    let mut map = streams().lock().unwrap();
    map.remove(id)
}

fn get_sender(id: &str) -> Option<mpsc::UnboundedSender<OutgoingMessage>> {
    let map = streams().lock().unwrap();
    map.get(id).and_then(|h| h.sender.clone())
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn emit_event(app: &AppHandle, event: RealtimeEvent) {
    let _ = app.emit(REALTIME_EVENT, event);
}

fn emit_open(app: &AppHandle, stream_id: &str, info: serde_json::Value) {
    emit_event(
        app,
        RealtimeEvent {
            stream_id: stream_id.to_string(),
            kind: "open".to_string(),
            event: "open".to_string(),
            data: info,
            at: now_iso(),
        },
    );
}

fn emit_message(
    app: &AppHandle,
    stream_id: &str,
    kind: &str,
    event_name: &str,
    data: serde_json::Value,
) {
    emit_event(
        app,
        RealtimeEvent {
            stream_id: stream_id.to_string(),
            kind: kind.to_string(),
            event: event_name.to_string(),
            data,
            at: now_iso(),
        },
    );
}

fn emit_error(app: &AppHandle, stream_id: &str, message: impl Into<String>) {
    emit_event(
        app,
        RealtimeEvent {
            stream_id: stream_id.to_string(),
            kind: "error".to_string(),
            event: "error".to_string(),
            data: json!({ "message": message.into() }),
            at: now_iso(),
        },
    );
}

fn emit_close(app: &AppHandle, stream_id: &str, code: Option<u16>, reason: Option<String>) {
    emit_event(
        app,
        RealtimeEvent {
            stream_id: stream_id.to_string(),
            kind: "close".to_string(),
            event: "close".to_string(),
            data: json!({ "code": code, "reason": reason }),
            at: now_iso(),
        },
    );
}

fn load_app_settings(app: &AppHandle) -> AppSettings {
    crate::storage::get_app_config(app.clone())
        .map(|state| state.app_settings)
        .unwrap_or_default()
}

#[derive(Debug)]
struct InsecureCertVerifier;

impl rustls::client::danger::ServerCertVerifier for InsecureCertVerifier {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        vec![
            rustls::SignatureScheme::RSA_PKCS1_SHA256,
            rustls::SignatureScheme::RSA_PKCS1_SHA384,
            rustls::SignatureScheme::RSA_PKCS1_SHA512,
            rustls::SignatureScheme::ECDSA_NISTP256_SHA256,
            rustls::SignatureScheme::ECDSA_NISTP384_SHA384,
            rustls::SignatureScheme::ECDSA_NISTP521_SHA512,
            rustls::SignatureScheme::RSA_PSS_SHA256,
            rustls::SignatureScheme::RSA_PSS_SHA384,
            rustls::SignatureScheme::RSA_PSS_SHA512,
            rustls::SignatureScheme::ED25519,
            rustls::SignatureScheme::ED448,
        ]
    }
}

fn build_tls_client_config(settings: &AppSettings) -> Result<Arc<ClientConfig>, String> {
    let _ = rustls::crypto::ring::default_provider().install_default();

    let mut roots = RootCertStore::empty();

    let include_native = !settings.use_custom_ca_certificate || settings.keep_default_ca_certificates;
    if include_native {
        let result = rustls_native_certs::load_native_certs();
        for cert in result.certs {
            let _ = roots.add(cert);
        }
    }

    if settings.use_custom_ca_certificate && !settings.custom_ca_certificate_path.trim().is_empty() {
        let bytes = std::fs::read(settings.custom_ca_certificate_path.trim())
            .map_err(|e| format!("Failed to read custom CA file: {e}"))?;
        let mut slice = bytes.as_slice();
        let mut added = 0usize;
        for entry in rustls_pemfile::certs(&mut slice) {
            match entry {
                Ok(der) => {
                    if roots.add(der).is_ok() {
                        added += 1;
                    }
                }
                Err(_) => continue,
            }
        }
        if added == 0 {
            // Try DER directly
            if let Ok(()) = roots.add(CertificateDer::from(bytes.clone())) {
                added += 1;
            }
        }
        if added == 0 {
            return Err("No usable certificates found in custom CA file.".to_string());
        }
    }

    let builder = ClientConfig::builder().with_root_certificates(roots);
    let mut config = builder.with_no_client_auth();

    if !settings.ssl_tls_certificate_verification {
        config
            .dangerous()
            .set_certificate_verifier(Arc::new(InsecureCertVerifier));
    }

    Ok(Arc::new(config))
}

fn http_to_ws_url(url: &str) -> String {
    let trimmed = url.trim();
    if trimmed.starts_with("ws://") || trimmed.starts_with("wss://") {
        return trimmed.to_string();
    }
    if let Some(rest) = trimmed.strip_prefix("http://") {
        return format!("ws://{rest}");
    }
    if let Some(rest) = trimmed.strip_prefix("https://") {
        return format!("wss://{rest}");
    }
    format!("wss://{trimmed}")
}

fn ws_to_http_url(url: &str) -> String {
    let trimmed = url.trim();
    if let Some(rest) = trimmed.strip_prefix("ws://") {
        return format!("http://{rest}");
    }
    if let Some(rest) = trimmed.strip_prefix("wss://") {
        return format!("https://{rest}");
    }
    trimmed.to_string()
}

/// Convert a user-provided Socket.IO URL into the **server base URL** expected
/// by `rust_socketio` (which appends `/socket.io/?EIO=...` itself).
///
/// Strips:
/// - `ws://` / `wss://` schemes (replaced with `http://` / `https://`)
/// - Any `/socket.io/...` path segment
/// - Engine.IO transport query params (`EIO`, `transport`, `sid`, `t`, `b64`)
///
/// Preserves any other query params the user added (auth tokens, etc.).
fn sanitize_socketio_base_url(url: &str) -> String {
    let http_url = ws_to_http_url(url);
    let parsed = match reqwest::Url::parse(&http_url) {
        Ok(p) => p,
        Err(_) => return http_url,
    };

    let mut next = parsed.clone();

    // Drop the /socket.io/... path if present, keep any prefix path.
    let path = parsed.path().to_string();
    if let Some(idx) = path.find("/socket.io") {
        let prefix = &path[..idx];
        next.set_path(if prefix.is_empty() { "/" } else { prefix });
    }

    // Strip engine.io transport query params.
    let preserved_pairs: Vec<(String, String)> = parsed
        .query_pairs()
        .filter(|(k, _)| {
            let key = k.as_ref();
            !matches!(key, "EIO" | "transport" | "sid" | "t" | "b64")
        })
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();

    {
        let mut q = next.query_pairs_mut();
        q.clear();
        for (k, v) in &preserved_pairs {
            q.append_pair(k, v);
        }
    }
    if preserved_pairs.is_empty() {
        next.set_query(None);
    }

    next.to_string()
}

fn ensure_user_agent(headers: &mut HashMap<String, String>, disable: bool) {
    if disable {
        return;
    }
    let has_ua = headers
        .keys()
        .any(|k| k.eq_ignore_ascii_case("user-agent"));
    if !has_ua {
        headers.insert("User-Agent".to_string(), DEFAULT_USER_AGENT.to_string());
    }
}

fn apply_auth_headers(headers: &mut HashMap<String, String>, auth: &RealtimeAuth) -> Option<(String, String)> {
    let has_auth = headers.keys().any(|k| k.eq_ignore_ascii_case("authorization"));
    let kind = auth.kind.trim().to_ascii_lowercase();

    match kind.as_str() {
        "bearer" if !auth.token.trim().is_empty() && !has_auth => {
            headers.insert(
                "Authorization".to_string(),
                format!("Bearer {}", auth.token.trim()),
            );
        }
        "basic" if (!auth.username.is_empty() || !auth.password.is_empty()) && !has_auth => {
            let encoded = BASE64_STANDARD.encode(format!("{}:{}", auth.username, auth.password));
            headers.insert("Authorization".to_string(), format!("Basic {}", encoded));
        }
        "apikey" if !auth.api_key_name.trim().is_empty() => {
            let api_in = auth.api_key_in.trim().to_ascii_lowercase();
            if api_in == "query" {
                return Some((auth.api_key_name.trim().to_string(), auth.api_key_value.clone()));
            }
            let already_present = headers
                .keys()
                .any(|k| k.eq_ignore_ascii_case(auth.api_key_name.trim()));
            if !already_present {
                headers.insert(auth.api_key_name.trim().to_string(), auth.api_key_value.clone());
            }
        }
        "oauth2" if !auth.access_token.trim().is_empty() && !has_auth => {
            let token_type = if auth.token_type.trim().is_empty() {
                "Bearer".to_string()
            } else {
                auth.token_type.trim().to_string()
            };
            headers.insert(
                "Authorization".to_string(),
                format!("{} {}", token_type, auth.access_token.trim()),
            );
        }
        _ => {}
    }

    None
}

fn append_query_param(url: &mut String, key: &str, value: &str) {
    let separator = if url.contains('?') { '&' } else { '?' };
    let enc_key = urlencoding_encode(key);
    let enc_val = urlencoding_encode(value);
    url.push(separator);
    url.push_str(&enc_key);
    url.push('=');
    url.push_str(&enc_val);
}

fn urlencoding_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char);
            }
            b' ' => out.push_str("%20"),
            other => out.push_str(&format!("%{:02X}", other)),
        }
    }
    out
}

fn merge_cookie_header(
    app: &AppHandle,
    headers: &mut HashMap<String, String>,
    workspace: &str,
    collection: &str,
    url_str: &str,
    use_jar: bool,
    settings: &AppSettings,
) {
    if !use_jar || !settings.send_cookies_automatically {
        return;
    }
    let has_cookie = headers
        .keys()
        .any(|k| k.eq_ignore_ascii_case("cookie"));
    if has_cookie {
        return;
    }
    if let Ok(parsed) = reqwest::Url::parse(url_str) {
        if let Ok(Some(cookie_header)) =
            build_cookie_header_from_store(app, workspace, collection, &parsed)
        {
            headers.insert("Cookie".to_string(), cookie_header);
        }
    }
}

fn store_set_cookie_headers(
    app: &AppHandle,
    workspace: &str,
    collection: &str,
    url_str: &str,
    use_jar: bool,
    settings: &AppSettings,
    set_cookie_values: &[String],
) {
    if !use_jar || !settings.store_cookies_automatically {
        return;
    }
    if set_cookie_values.is_empty() {
        return;
    }
    if let Ok(parsed) = reqwest::Url::parse(url_str) {
        let _ = merge_set_cookie_headers(app, workspace, collection, &parsed, set_cookie_values);
    }
}

#[tauri::command]
pub async fn realtime_connect_websocket(
    app: AppHandle,
    payload: RealtimeConnectPayload,
) -> Result<String, String> {
    let stream_id = Uuid::new_v4().to_string();

    let settings = load_app_settings(&app);
    let timeout_ms = payload
        .timeout_ms
        .unwrap_or_else(|| settings.request_timeout_ms);
    let use_jar = payload.use_cookie_jar.unwrap_or(true);

    let mut headers = payload.headers.clone();
    ensure_user_agent(&mut headers, payload.disable_user_agent.unwrap_or(false));

    let query_extra = apply_auth_headers(&mut headers, &payload.auth);

    let mut url = http_to_ws_url(&payload.url);
    if let Some((k, v)) = query_extra {
        append_query_param(&mut url, &k, &v);
    }

    let http_url_for_cookies = ws_to_http_url(&url);
    merge_cookie_header(
        &app,
        &mut headers,
        &payload.workspace_name,
        &payload.collection_name,
        &http_url_for_cookies,
        use_jar,
        &settings,
    );

    let mut request = url
        .as_str()
        .into_client_request()
        .map_err(|e| format!("Invalid WebSocket URL: {e}"))?;

    {
        let req_headers = request.headers_mut();
        for (k, v) in &headers {
            let name = match WsHeaderName::from_bytes(k.as_bytes()) {
                Ok(n) => n,
                Err(_) => continue,
            };
            let value = match WsHeaderValue::from_str(v) {
                Ok(val) => val,
                Err(_) => continue,
            };
            req_headers.insert(name, value);
        }
    }

    let tls_config = build_tls_client_config(&settings)?;
    let connector = Connector::Rustls(tls_config);

    let connect_future = tokio_tungstenite::connect_async_tls_with_config(
        request,
        None,
        false,
        Some(connector),
    );

    let (ws_stream, response) = if timeout_ms > 0 {
        match tokio::time::timeout(Duration::from_millis(timeout_ms), connect_future).await {
            Ok(Ok(pair)) => pair,
            Ok(Err(e)) => return Err(format!("WebSocket connection failed: {e}")),
            Err(_) => return Err(format!("WebSocket connection timed out after {timeout_ms}ms")),
        }
    } else {
        connect_future
            .await
            .map_err(|e| format!("WebSocket connection failed: {e}"))?
    };

    let response_set_cookies: Vec<String> = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();

    store_set_cookie_headers(
        &app,
        &payload.workspace_name,
        &payload.collection_name,
        &http_url_for_cookies,
        use_jar,
        &settings,
        &response_set_cookies,
    );

    let response_info = build_handshake_response_info(&response, &url);

    let (out_tx, out_rx) = mpsc::unbounded_channel::<OutgoingMessage>();
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();

    register_stream(
        stream_id.clone(),
        StreamHandle {
            sender: Some(out_tx.clone()),
            cancel: Some(cancel_tx),
            socketio: None,
        },
    );

    emit_open(&app, &stream_id, response_info);

    let app_for_task = app.clone();
    let stream_id_for_task = stream_id.clone();
    tokio::spawn(async move {
        run_websocket_loop(app_for_task, stream_id_for_task, ws_stream, out_rx, cancel_rx).await;
    });

    Ok(stream_id)
}

fn build_handshake_response_info(response: &WsResponse, final_url: &str) -> serde_json::Value {
    let mut header_map = serde_json::Map::new();
    for (k, v) in response.headers().iter() {
        header_map.insert(
            k.as_str().to_string(),
            json!(v.to_str().unwrap_or("").to_string()),
        );
    }
    json!({
        "url": final_url,
        "status": response.status().as_u16(),
        "statusText": response.status().canonical_reason().unwrap_or(""),
        "headers": serde_json::Value::Object(header_map),
    })
}

async fn run_websocket_loop<S>(
    app: AppHandle,
    stream_id: String,
    ws_stream: tokio_tungstenite::WebSocketStream<S>,
    mut out_rx: mpsc::UnboundedReceiver<OutgoingMessage>,
    mut cancel_rx: oneshot::Receiver<()>,
) where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let (mut sink, mut source) = ws_stream.split();

    let mut close_code: Option<u16> = None;
    let mut close_reason: Option<String> = None;
    let mut graceful = false;

    loop {
        tokio::select! {
            biased;
            _ = &mut cancel_rx => {
                let _ = sink
                    .send(WsMessage::Close(Some(CloseFrame {
                        code: tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode::Normal,
                        reason: "client closed".into(),
                    })))
                    .await;
                graceful = true;
                close_code = Some(1000);
                close_reason = Some("client closed".to_string());
                break;
            }
            outgoing = out_rx.recv() => {
                let Some(msg) = outgoing else {
                    break;
                };
                let send_result = match msg {
                    OutgoingMessage::Text(text) => sink.send(WsMessage::Text(text.into())).await,
                    OutgoingMessage::Binary(bytes) => sink.send(WsMessage::Binary(bytes.into())).await,
                    OutgoingMessage::Ping(bytes) => sink.send(WsMessage::Ping(bytes.into())).await,
                    OutgoingMessage::Close(detail) => {
                        let frame = detail.map(|(code, reason)| CloseFrame {
                            code: tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode::from(code),
                            reason: reason.into(),
                        });
                        let _ = sink.send(WsMessage::Close(frame)).await;
                        graceful = true;
                        close_code = Some(1000);
                        break;
                    }
                };
                if let Err(e) = send_result {
                    emit_error(&app, &stream_id, format!("Send failed: {e}"));
                    break;
                }
            }
            incoming = source.next() => {
                match incoming {
                    Some(Ok(msg)) => match msg {
                        WsMessage::Text(text) => emit_message(
                            &app,
                            &stream_id,
                            "message",
                            "text",
                            json!({ "text": text.to_string() }),
                        ),
                        WsMessage::Binary(bytes) => emit_message(
                            &app,
                            &stream_id,
                            "message",
                            "binary",
                            json!({ "bytes": BASE64_STANDARD.encode(&bytes) }),
                        ),
                        WsMessage::Ping(bytes) => {
                            let _ = sink.send(WsMessage::Pong(bytes.clone())).await;
                            emit_message(
                                &app,
                                &stream_id,
                                "message",
                                "ping",
                                json!({ "bytes": BASE64_STANDARD.encode(&bytes) }),
                            );
                        }
                        WsMessage::Pong(bytes) => emit_message(
                            &app,
                            &stream_id,
                            "message",
                            "pong",
                            json!({ "bytes": BASE64_STANDARD.encode(&bytes) }),
                        ),
                        WsMessage::Close(frame) => {
                            graceful = true;
                            if let Some(f) = frame {
                                close_code = Some(f.code.into());
                                close_reason = Some(f.reason.to_string());
                            } else {
                                close_code = Some(1005);
                            }
                            break;
                        }
                        WsMessage::Frame(_) => {}
                    },
                    Some(Err(e)) => {
                        emit_error(&app, &stream_id, format!("WebSocket error: {e}"));
                        break;
                    }
                    None => {
                        graceful = true;
                        break;
                    }
                }
            }
        }
    }

    let _ = sink.close().await;
    take_stream(&stream_id);
    emit_close(
        &app,
        &stream_id,
        close_code.or(if graceful { Some(1000) } else { Some(1006) }),
        close_reason,
    );
}

#[tauri::command]
pub fn realtime_send(payload: RealtimeSendPayload) -> Result<(), String> {
    let stream_id = payload.stream_id.trim();
    if stream_id.is_empty() {
        return Err("stream_id is required".to_string());
    }

    let sender = get_sender(stream_id).ok_or_else(|| "Stream is not active".to_string())?;
    let kind = payload.kind.to_ascii_lowercase();

    let msg = match kind.as_str() {
        "text" | "json" | "" => OutgoingMessage::Text(payload.data),
        "binary" | "base64" => {
            let bytes = BASE64_STANDARD
                .decode(payload.data.trim())
                .map_err(|e| format!("Invalid base64 binary payload: {e}"))?;
            OutgoingMessage::Binary(bytes)
        }
        "ping" => OutgoingMessage::Ping(payload.data.into_bytes()),
        "close" => OutgoingMessage::Close(None),
        other => return Err(format!("Unsupported send kind: {other}")),
    };

    sender
        .send(msg)
        .map_err(|_| "Stream channel is closed".to_string())
}

#[tauri::command]
pub async fn realtime_disconnect(payload: RealtimeCancelPayload) -> Result<(), String> {
    let stream_id = payload.stream_id.trim().to_string();
    if stream_id.is_empty() {
        return Err("stream_id is required".to_string());
    }

    if let Some(handle) = take_stream(&stream_id) {
        if let Some(sender) = handle.sender {
            let detail = match (payload.code, payload.reason) {
                (Some(c), Some(r)) => Some((c, r)),
                (Some(c), None) => Some((c, String::new())),
                _ => None,
            };
            let _ = sender.send(OutgoingMessage::Close(detail));
        }
        if let Some(cancel) = handle.cancel {
            let _ = cancel.send(());
        }
        if let Some(client) = handle.socketio {
            let _ = client.disconnect().await;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn realtime_connect_sse(
    app: AppHandle,
    payload: RealtimeConnectPayload,
) -> Result<String, String> {
    let stream_id = Uuid::new_v4().to_string();

    let settings = load_app_settings(&app);
    let timeout_ms = payload
        .timeout_ms
        .unwrap_or_else(|| settings.request_timeout_ms);
    let use_jar = payload.use_cookie_jar.unwrap_or(true);

    let mut headers = payload.headers.clone();
    ensure_user_agent(&mut headers, payload.disable_user_agent.unwrap_or(false));
    headers
        .entry("Accept".to_string())
        .or_insert_with(|| "text/event-stream".to_string());
    headers
        .entry("Cache-Control".to_string())
        .or_insert_with(|| "no-cache".to_string());

    let query_extra = apply_auth_headers(&mut headers, &payload.auth);

    let mut url = payload.url.trim().to_string();
    if let Some((k, v)) = query_extra {
        append_query_param(&mut url, &k, &v);
    }

    merge_cookie_header(
        &app,
        &mut headers,
        &payload.workspace_name,
        &payload.collection_name,
        &url,
        use_jar,
        &settings,
    );

    let mut builder = reqwest::Client::builder().redirect(reqwest::redirect::Policy::limited(10));

    if timeout_ms > 0 {
        builder = builder.connect_timeout(Duration::from_millis(timeout_ms));
    }

    if !settings.ssl_tls_certificate_verification {
        builder = builder.danger_accept_invalid_certs(true);
    }

    if settings.use_custom_ca_certificate && !settings.custom_ca_certificate_path.trim().is_empty() {
        let bytes = std::fs::read(settings.custom_ca_certificate_path.trim())
            .map_err(|e| format!("Failed to read custom CA file: {e}"))?;
        let cert = reqwest::Certificate::from_pem(&bytes)
            .or_else(|_| reqwest::Certificate::from_der(&bytes))
            .map_err(|e| format!("Invalid CA certificate: {e}"))?;
        if !settings.keep_default_ca_certificates {
            builder = builder.tls_built_in_root_certs(false);
        }
        builder = builder.add_root_certificate(cert);
    }

    if settings.proxy_enabled {
        if !settings.proxy_http.trim().is_empty() {
            let proxy = reqwest::Proxy::http(settings.proxy_http.trim())
                .map_err(|e| format!("Invalid HTTP proxy URL: {e}"))?;
            builder = builder.proxy(proxy);
        }
        if !settings.proxy_https.trim().is_empty() {
            let proxy = reqwest::Proxy::https(settings.proxy_https.trim())
                .map_err(|e| format!("Invalid HTTPS proxy URL: {e}"))?;
            builder = builder.proxy(proxy);
        }
    }

    let client = builder
        .build()
        .map_err(|e| format!("Failed to build SSE client: {e}"))?;

    let method = payload
        .method
        .as_deref()
        .map(|m| m.trim().to_ascii_uppercase())
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| "GET".to_string());

    let mut req_builder = client.request(
        reqwest::Method::from_bytes(method.as_bytes())
            .map_err(|e| format!("Invalid HTTP method '{method}': {e}"))?,
        &url,
    );

    for (k, v) in &headers {
        req_builder = req_builder.header(k, v);
    }

    if let Some(body) = payload.body.clone() {
        if !body.is_empty() && method != "GET" && method != "HEAD" {
            req_builder = req_builder.body(body);
        }
    }

    let response = req_builder
        .send()
        .await
        .map_err(|e| format!("SSE request failed: {e}"))?;

    let status = response.status();
    let response_headers: Vec<(String, String)> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let set_cookies: Vec<String> = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(|s| s.to_string()))
        .collect();

    store_set_cookie_headers(
        &app,
        &payload.workspace_name,
        &payload.collection_name,
        &url,
        use_jar,
        &settings,
        &set_cookies,
    );

    if !status.is_success() {
        let body_text = response.text().await.unwrap_or_default();
        return Err(format!(
            "SSE handshake failed with status {}: {}",
            status.as_u16(),
            body_text
        ));
    }

    let mut headers_map = serde_json::Map::new();
    for (k, v) in &response_headers {
        headers_map.insert(k.clone(), json!(v));
    }
    let response_info = json!({
        "url": url,
        "status": status.as_u16(),
        "statusText": status.canonical_reason().unwrap_or(""),
        "headers": serde_json::Value::Object(headers_map),
    });

    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    register_stream(
        stream_id.clone(),
        StreamHandle {
            sender: None,
            cancel: Some(cancel_tx),
            socketio: None,
        },
    );

    emit_open(&app, &stream_id, response_info);

    let app_for_task = app.clone();
    let stream_id_for_task = stream_id.clone();
    tokio::spawn(async move {
        run_sse_loop(app_for_task, stream_id_for_task, response, cancel_rx).await;
    });

    Ok(stream_id)
}

async fn run_sse_loop(
    app: AppHandle,
    stream_id: String,
    response: reqwest::Response,
    mut cancel_rx: oneshot::Receiver<()>,
) {
    let mut byte_stream = response.bytes_stream();
    let mut buffer = Vec::<u8>::new();
    let mut last_event_id = String::new();
    let mut graceful = false;

    loop {
        tokio::select! {
            biased;
            _ = &mut cancel_rx => {
                graceful = true;
                break;
            }
            chunk = byte_stream.next() => {
                match chunk {
                    Some(Ok(bytes)) => {
                        buffer.extend_from_slice(&bytes);
                        loop {
                            let split = find_event_boundary(&buffer);
                            let Some((end, advance)) = split else { break; };
                            let event_bytes = &buffer[..end];
                            let event_text = String::from_utf8_lossy(event_bytes).to_string();
                            if let Some(parsed) = parse_sse_event(&event_text, &mut last_event_id) {
                                emit_message(
                                    &app,
                                    &stream_id,
                                    "message",
                                    &parsed.event_name,
                                    json!({
                                        "event": parsed.event_name,
                                        "id": parsed.id,
                                        "data": parsed.data,
                                        "retry": parsed.retry,
                                    }),
                                );
                            }
                            buffer.drain(..advance);
                        }
                    }
                    Some(Err(e)) => {
                        emit_error(&app, &stream_id, format!("SSE stream error: {e}"));
                        break;
                    }
                    None => {
                        graceful = true;
                        break;
                    }
                }
            }
        }
    }

    take_stream(&stream_id);
    emit_close(
        &app,
        &stream_id,
        if graceful { Some(1000) } else { Some(1006) },
        None,
    );
}

fn find_event_boundary(buffer: &[u8]) -> Option<(usize, usize)> {
    if let Some(idx) = find_subseq(buffer, b"\n\n") {
        return Some((idx, idx + 2));
    }
    if let Some(idx) = find_subseq(buffer, b"\r\n\r\n") {
        return Some((idx, idx + 4));
    }
    if let Some(idx) = find_subseq(buffer, b"\r\r") {
        return Some((idx, idx + 2));
    }
    None
}

fn find_subseq(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    for window_start in 0..=haystack.len() - needle.len() {
        if &haystack[window_start..window_start + needle.len()] == needle {
            return Some(window_start);
        }
    }
    None
}

#[derive(Debug)]
struct ParsedSseEvent {
    event_name: String,
    data: String,
    id: String,
    retry: Option<u64>,
}

fn parse_sse_event(text: &str, last_event_id: &mut String) -> Option<ParsedSseEvent> {
    let mut event_name = String::from("message");
    let mut data_lines: Vec<String> = Vec::new();
    let mut id = last_event_id.clone();
    let mut retry: Option<u64> = None;
    let mut had_data = false;

    for raw_line in text.split('\n') {
        let line = raw_line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        if line.starts_with(':') {
            continue;
        }
        let (field, value) = match line.find(':') {
            Some(idx) => {
                let f = &line[..idx];
                let mut v = &line[idx + 1..];
                if v.starts_with(' ') {
                    v = &v[1..];
                }
                (f, v.to_string())
            }
            None => (line, String::new()),
        };
        match field {
            "event" => {
                if !value.is_empty() {
                    event_name = value;
                }
            }
            "data" => {
                data_lines.push(value);
                had_data = true;
            }
            "id" => {
                id = value.clone();
                *last_event_id = value;
            }
            "retry" => {
                if let Ok(parsed) = value.parse::<u64>() {
                    retry = Some(parsed);
                }
            }
            _ => {}
        }
    }

    if !had_data && retry.is_none() {
        return None;
    }

    Some(ParsedSseEvent {
        event_name,
        data: data_lines.join("\n"),
        id,
        retry,
    })
}

fn sio_payload_to_value(payload: &SioPayload) -> serde_json::Value {
    match payload {
        SioPayload::Binary(bytes) => json!({ "binary": BASE64_STANDARD.encode(bytes) }),
        SioPayload::String(s) => {
            serde_json::from_str::<serde_json::Value>(s)
                .unwrap_or_else(|_| serde_json::Value::String(s.clone()))
        }
    }
}

fn sio_event_name(event: &SioEvent) -> String {
    match event {
        SioEvent::Custom(name) => name.clone(),
        SioEvent::Message => "message".to_string(),
        SioEvent::Error => "error".to_string(),
        SioEvent::Close => "close".to_string(),
        SioEvent::Connect => "connect".to_string(),
    }
}

#[tauri::command]
pub async fn realtime_connect_socketio(
    app: AppHandle,
    payload: RealtimeConnectPayload,
) -> Result<String, String> {
    let stream_id = Uuid::new_v4().to_string();

    let settings = load_app_settings(&app);
    let timeout_ms = payload
        .timeout_ms
        .unwrap_or_else(|| settings.request_timeout_ms);
    let use_jar = payload.use_cookie_jar.unwrap_or(true);

    let mut headers = payload.headers.clone();
    ensure_user_agent(&mut headers, payload.disable_user_agent.unwrap_or(false));
    let query_extra = apply_auth_headers(&mut headers, &payload.auth);

    let mut url = sanitize_socketio_base_url(&payload.url);
    if let Some((k, v)) = query_extra {
        append_query_param(&mut url, &k, &v);
    }

    merge_cookie_header(
        &app,
        &mut headers,
        &payload.workspace_name,
        &payload.collection_name,
        &url,
        use_jar,
        &settings,
    );

    let raw_namespace = payload
        .namespace
        .clone()
        .unwrap_or_else(|| "/".to_string());
    let trimmed_ns = raw_namespace.trim();
    let normalized_ns = if trimmed_ns.is_empty() || trimmed_ns == "/" {
        "/".to_string()
    } else if trimmed_ns.starts_with('/') {
        trimmed_ns.to_string()
    } else {
        format!("/{trimmed_ns}")
    };

    let mut builder = SioBuilder::new(url.clone())
        .namespace(normalized_ns.clone())
        .transport_type(SioTransportType::Websocket);

    for (k, v) in &headers {
        builder = builder.opening_header(k.as_str(), v.as_str());
    }

    let app_for_any = app.clone();
    let id_for_any = stream_id.clone();
    builder = builder.on_any(move |event, payload, _client| {
        let app = app_for_any.clone();
        let id = id_for_any.clone();
        async move {
            let event_name = sio_event_name(&event);
            let data = sio_payload_to_value(&payload);
            emit_message(
                &app,
                &id,
                "event",
                &event_name,
                json!({ "event": event_name, "data": data }),
            );
        }
        .boxed()
    });

    let app_for_err = app.clone();
    let id_for_err = stream_id.clone();
    builder = builder.on(SioEvent::Error, move |payload, _client| {
        let app = app_for_err.clone();
        let id = id_for_err.clone();
        async move {
            let msg = match payload {
                SioPayload::Binary(bytes) => format!("<binary error: {} bytes>", bytes.len()),
                SioPayload::String(s) => s,
            };
            emit_error(&app, &id, msg);
        }
        .boxed()
    });

    let app_for_close = app.clone();
    let id_for_close = stream_id.clone();
    builder = builder.on(SioEvent::Close, move |_payload, _client| {
        let app = app_for_close.clone();
        let id = id_for_close.clone();
        async move {
            take_stream(&id);
            emit_close(&app, &id, Some(1000), None);
        }
        .boxed()
    });

    let connect_future = builder.connect();
    let client = if timeout_ms > 0 {
        match tokio::time::timeout(Duration::from_millis(timeout_ms), connect_future).await {
            Ok(Ok(c)) => c,
            Ok(Err(e)) => return Err(format!("Socket.IO connect failed: {e}")),
            Err(_) => return Err(format!("Socket.IO connect timed out after {timeout_ms}ms")),
        }
    } else {
        connect_future
            .await
            .map_err(|e| format!("Socket.IO connect failed: {e}"))?
    };

    register_stream(
        stream_id.clone(),
        StreamHandle {
            sender: None,
            cancel: None,
            socketio: Some(client),
        },
    );

    emit_open(
        &app,
        &stream_id,
        json!({ "url": url, "namespace": normalized_ns }),
    );

    Ok(stream_id)
}

#[tauri::command]
pub async fn realtime_emit_socketio(
    payload: RealtimeEmitSocketIoPayload,
) -> Result<(), String> {
    let stream_id = payload.stream_id.trim();
    if stream_id.is_empty() {
        return Err("stream_id is required".to_string());
    }

    let client = {
        let map = streams().lock().unwrap();
        map.get(stream_id).and_then(|h| h.socketio.clone())
    };
    let Some(client) = client else {
        return Err("Socket.IO stream is not active".to_string());
    };

    let event = payload.event.trim().to_string();
    if event.is_empty() {
        return Err("event name is required".to_string());
    }

    let json_value = serde_json::from_str::<serde_json::Value>(payload.data.trim())
        .unwrap_or_else(|_| serde_json::Value::String(payload.data.clone()));

    client
        .emit(event, json_value)
        .await
        .map_err(|e| format!("Socket.IO emit failed: {e}"))
}
