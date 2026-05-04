//! Unit + integration tests for `http::realtime` helpers.
//!
//! Covers URL scheme conversion (ws<->http, Socket.IO base sanitization),
//! URL encoding, query param append, user-agent injection, auth header
//! mapping, SSE frame boundary + event parsing, and an end-to-end SSE
//! loopback test that spawns a local HTTP server and drives bytes through
//! the same helpers the Tauri command uses.

use std::collections::HashMap;

use super::*;

// ---------------------------------------------------------------------------
// URL scheme conversion
// ---------------------------------------------------------------------------

#[test]
fn http_to_ws_url_maps_schemes() {
    assert_eq!(http_to_ws_url("http://a/x"), "ws://a/x");
    assert_eq!(http_to_ws_url("https://a/x"), "wss://a/x");
    assert_eq!(http_to_ws_url("ws://a/x"), "ws://a/x");
    assert_eq!(http_to_ws_url("wss://a/x"), "wss://a/x");
    assert_eq!(http_to_ws_url("a/x"), "wss://a/x");
}

#[test]
fn ws_to_http_url_maps_schemes() {
    assert_eq!(ws_to_http_url("ws://a/x"), "http://a/x");
    assert_eq!(ws_to_http_url("wss://a/x"), "https://a/x");
    assert_eq!(ws_to_http_url("http://a/x"), "http://a/x");
}

#[test]
fn sanitize_socketio_strips_socket_io_path_and_transport_params() {
    let out = sanitize_socketio_base_url(
        "wss://example.com/socket.io/?EIO=4&transport=websocket&sid=abc&token=tok",
    );
    let parsed = reqwest::Url::parse(&out).expect("valid url");
    assert_eq!(parsed.scheme(), "https");
    assert_eq!(parsed.host_str(), Some("example.com"));
    assert_eq!(parsed.path(), "/");

    let pairs: HashMap<_, _> = parsed.query_pairs().into_owned().collect();
    assert_eq!(pairs.get("token").map(String::as_str), Some("tok"));
    assert!(!pairs.contains_key("EIO"));
    assert!(!pairs.contains_key("transport"));
    assert!(!pairs.contains_key("sid"));
}

#[test]
fn sanitize_socketio_preserves_prefix_path() {
    let out =
        sanitize_socketio_base_url("https://example.com/api/socket.io/?EIO=4&transport=polling");
    let parsed = reqwest::Url::parse(&out).unwrap();
    assert_eq!(parsed.path(), "/api");
    assert!(parsed.query().is_none() || parsed.query() == Some(""));
}

#[test]
fn sanitize_socketio_handles_plain_url_unchanged_semantics() {
    let out = sanitize_socketio_base_url("http://127.0.0.1:4014");
    let parsed = reqwest::Url::parse(&out).unwrap();
    assert_eq!(parsed.scheme(), "http");
    assert_eq!(parsed.host_str(), Some("127.0.0.1"));
    assert_eq!(parsed.port(), Some(4014));
}

// ---------------------------------------------------------------------------
// URL encoding + query append
// ---------------------------------------------------------------------------

#[test]
fn urlencoding_encode_unreserved_and_special() {
    assert_eq!(urlencoding_encode("abcXYZ012-_.~"), "abcXYZ012-_.~");
    assert_eq!(urlencoding_encode("a b"), "a%20b");
    assert_eq!(urlencoding_encode("a/b?c=d&e"), "a%2Fb%3Fc%3Dd%26e");
    assert_eq!(urlencoding_encode("ñ"), "%C3%B1");
}

#[test]
fn append_query_param_no_existing_query() {
    let mut u = String::from("https://a/x");
    append_query_param(&mut u, "k", "v w");
    assert_eq!(u, "https://a/x?k=v%20w");
}

#[test]
fn append_query_param_appends_with_ampersand() {
    let mut u = String::from("https://a/x?foo=bar");
    append_query_param(&mut u, "k", "v");
    assert_eq!(u, "https://a/x?foo=bar&k=v");
}

// ---------------------------------------------------------------------------
// user-agent + auth headers
// ---------------------------------------------------------------------------

#[test]
fn ensure_user_agent_injects_default_when_missing() {
    let mut h = HashMap::new();
    ensure_user_agent(&mut h, false);
    let ua = h.get("User-Agent").expect("ua inserted");
    assert!(ua.starts_with("kivo/"));
}

#[test]
fn ensure_user_agent_disabled_flag_skips_insertion() {
    let mut h = HashMap::new();
    ensure_user_agent(&mut h, true);
    assert!(h.get("User-Agent").is_none());
}

#[test]
fn ensure_user_agent_preserves_caller_supplied() {
    let mut h = HashMap::new();
    h.insert("user-agent".to_string(), "custom/9".to_string());
    ensure_user_agent(&mut h, false);
    assert_eq!(h.get("user-agent").map(String::as_str), Some("custom/9"));
    assert!(!h.contains_key("User-Agent"));
}

#[test]
fn apply_auth_bearer_adds_authorization() {
    let mut h = HashMap::new();
    let auth = RealtimeAuth {
        kind: "bearer".into(),
        token: "tok123".into(),
        ..Default::default()
    };
    assert!(apply_auth_headers(&mut h, &auth).is_none());
    assert_eq!(h.get("Authorization").unwrap(), "Bearer tok123");
}

#[test]
fn apply_auth_basic_adds_base64_encoded() {
    let mut h = HashMap::new();
    let auth = RealtimeAuth {
        kind: "basic".into(),
        username: "alice".into(),
        password: "s3cret".into(),
        ..Default::default()
    };
    apply_auth_headers(&mut h, &auth);
    assert_eq!(
        h.get("Authorization").map(String::as_str),
        Some("Basic YWxpY2U6czNjcmV0"),
    );
}

#[test]
fn apply_auth_apikey_header_mode_inserts_header() {
    let mut h = HashMap::new();
    let auth = RealtimeAuth {
        kind: "apikey".into(),
        api_key_name: "X-Api-Key".into(),
        api_key_value: "abc".into(),
        api_key_in: "header".into(),
        ..Default::default()
    };
    let q = apply_auth_headers(&mut h, &auth);
    assert!(q.is_none());
    assert_eq!(h.get("X-Api-Key").map(String::as_str), Some("abc"));
}

#[test]
fn apply_auth_apikey_query_mode_returns_pair_and_skips_header() {
    let mut h = HashMap::new();
    let auth = RealtimeAuth {
        kind: "apikey".into(),
        api_key_name: "token".into(),
        api_key_value: "xyz".into(),
        api_key_in: "query".into(),
        ..Default::default()
    };
    let q = apply_auth_headers(&mut h, &auth).expect("query pair");
    assert_eq!(q, ("token".to_string(), "xyz".to_string()));
    assert!(h.is_empty());
}

#[test]
fn apply_auth_oauth2_defaults_to_bearer_token_type() {
    let mut h = HashMap::new();
    let auth = RealtimeAuth {
        kind: "oauth2".into(),
        access_token: "accessTok".into(),
        ..Default::default()
    };
    apply_auth_headers(&mut h, &auth);
    assert_eq!(
        h.get("Authorization").map(String::as_str),
        Some("Bearer accessTok"),
    );
}

#[test]
fn apply_auth_skips_when_authorization_already_present() {
    let mut h = HashMap::new();
    h.insert("Authorization".to_string(), "Custom abc".to_string());
    let auth = RealtimeAuth {
        kind: "bearer".into(),
        token: "should-not-replace".into(),
        ..Default::default()
    };
    apply_auth_headers(&mut h, &auth);
    assert_eq!(h.get("Authorization").unwrap(), "Custom abc");
}

// ---------------------------------------------------------------------------
// SSE framing + event parsing
// ---------------------------------------------------------------------------

#[test]
fn find_subseq_basic_and_missing() {
    assert_eq!(find_subseq(b"hello world", b"world"), Some(6));
    assert_eq!(find_subseq(b"abc", b"d"), None);
    assert_eq!(find_subseq(b"", b"x"), None);
    assert_eq!(find_subseq(b"abc", b""), None);
}

#[test]
fn find_event_boundary_prefers_lf_lf_then_crlf_crlf_then_cr_cr() {
    // \n\n wins
    let (idx, next) = find_event_boundary(b"data: a\n\ndata: b").unwrap();
    assert_eq!(idx, 7);
    assert_eq!(next, 9);

    // \r\n\r\n
    let (idx2, next2) = find_event_boundary(b"data: a\r\n\r\ndata: b").unwrap();
    assert_eq!(idx2, 7);
    assert_eq!(next2, 11);

    // \r\r (rare but spec-allowed)
    let (idx3, next3) = find_event_boundary(b"data: a\r\rdata: b").unwrap();
    assert_eq!(idx3, 7);
    assert_eq!(next3, 9);

    // None when not closed
    assert!(find_event_boundary(b"data: a\n").is_none());
}

#[test]
fn parse_sse_event_basic_data_only() {
    let mut last = String::new();
    let ev = parse_sse_event("data: hello", &mut last).expect("parsed");
    assert_eq!(ev.event_name, "message");
    assert_eq!(ev.data, "hello");
    assert!(ev.id.is_empty());
    assert!(ev.retry.is_none());
}

#[test]
fn parse_sse_event_multiline_data_joins_with_newline() {
    let mut last = String::new();
    let raw = "event: update\ndata: line1\ndata: line2";
    let ev = parse_sse_event(raw, &mut last).unwrap();
    assert_eq!(ev.event_name, "update");
    assert_eq!(ev.data, "line1\nline2");
}

#[test]
fn parse_sse_event_id_persists_in_last_event_id() {
    let mut last = String::new();
    let ev = parse_sse_event("id: 42\ndata: x", &mut last).unwrap();
    assert_eq!(ev.id, "42");
    assert_eq!(last, "42");

    let ev2 = parse_sse_event("data: y", &mut last).unwrap();
    assert_eq!(ev2.id, "42");
}

#[test]
fn parse_sse_event_retry_parses_numeric() {
    let mut last = String::new();
    let ev = parse_sse_event("retry: 2500\ndata: x", &mut last).unwrap();
    assert_eq!(ev.retry, Some(2500));
}

#[test]
fn parse_sse_event_comment_and_empty_lines_ignored() {
    let mut last = String::new();
    let ev = parse_sse_event(": a comment\n\ndata: only", &mut last).unwrap();
    assert_eq!(ev.data, "only");
}

#[test]
fn parse_sse_event_without_data_or_retry_returns_none() {
    let mut last = String::new();
    assert!(parse_sse_event("event: heartbeat\n: keepalive", &mut last).is_none());
}

#[test]
fn parse_sse_event_handles_crlf_line_endings() {
    let mut last = String::new();
    let ev = parse_sse_event("event: up\r\ndata: x\r\n", &mut last).unwrap();
    assert_eq!(ev.event_name, "up");
    assert_eq!(ev.data, "x");
}

// ---------------------------------------------------------------------------
// SSE integration: local server -> helpers pipeline
// ---------------------------------------------------------------------------

/// Spawn a minimal HTTP/1.1 server on a loopback port that writes one SSE
/// response containing three events, then closes. Returns the bound port.
async fn spawn_sse_server() -> u16 {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        if let Ok((mut socket, _)) = listener.accept().await {
            // Drain request headers.
            let mut buf = [0u8; 1024];
            let _ = tokio::time::timeout(
                std::time::Duration::from_millis(500),
                socket.read(&mut buf),
            )
            .await;

            let body = "event: ping\ndata: one\n\nid: 7\ndata: two\n\nretry: 1500\ndata: three\n\n";
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}",
                body.len(),
            );
            let _ = socket.write_all(response.as_bytes()).await;
            let _ = socket.shutdown().await;
        }
    });

    port
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn sse_stream_parses_three_events_via_helpers() {
    let port = spawn_sse_server().await;
    let url = format!("http://127.0.0.1:{port}/stream");
    let resp = reqwest::get(&url).await.expect("request sent");
    assert_eq!(resp.status().as_u16(), 200);

    let bytes = resp.bytes().await.expect("body read").to_vec();
    let mut buffer: Vec<u8> = Vec::new();
    buffer.extend_from_slice(&bytes);

    let mut last_id = String::new();
    let mut events: Vec<(String, String, String, Option<u64>)> = Vec::new();
    loop {
        let Some((idx, next)) = find_event_boundary(&buffer) else {
            break;
        };
        let frame_bytes = buffer.drain(..next).collect::<Vec<u8>>();
        let frame_text = std::str::from_utf8(&frame_bytes[..idx]).unwrap_or("").to_string();
        if let Some(ev) = parse_sse_event(&frame_text, &mut last_id) {
            events.push((ev.event_name, ev.data, ev.id, ev.retry));
        }
    }

    assert_eq!(events.len(), 3, "expected 3 parsed events, got {events:?}");
    assert_eq!(events[0].0, "ping");
    assert_eq!(events[0].1, "one");
    assert_eq!(events[1].1, "two");
    assert_eq!(events[1].2, "7");
    assert_eq!(events[2].1, "three");
    assert_eq!(events[2].2, "7");
    assert_eq!(events[2].3, Some(1500));
}

// ---------------------------------------------------------------------------
// realtime_send guard paths (no AppHandle needed)
// ---------------------------------------------------------------------------

#[test]
fn realtime_send_requires_nonempty_stream_id() {
    let err = realtime_send(RealtimeSendPayload {
        stream_id: "   ".to_string(),
        kind: "text".to_string(),
        data: "x".to_string(),
    })
    .unwrap_err();
    assert!(err.to_lowercase().contains("stream_id"));
}

#[test]
fn realtime_send_rejects_unknown_stream() {
    let err = realtime_send(RealtimeSendPayload {
        stream_id: "does-not-exist".to_string(),
        kind: "text".to_string(),
        data: "x".to_string(),
    })
    .unwrap_err();
    assert!(!err.is_empty());
}
