use crate::storage::models::{
    CollectionRecord, FolderSettingsRecord, KeyValueRow, OAuthParamRow, RequestRecord,
    RequestTextOrJson,
};
use std::collections::BTreeMap;

fn contains_template_var(value: &str) -> bool {
    let Some(start) = value.find("{{") else {
        return false;
    };
    value[start + 2..].contains("}}")
}

fn sanitize_export_text(value: &str) -> String {
    if contains_template_var(value) {
        String::new()
    } else {
        value.to_string()
    }
}

fn sanitize_json_value(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::String(text) => {
            *text = sanitize_export_text(text);
        }
        serde_json::Value::Array(items) => {
            for item in items {
                sanitize_json_value(item);
            }
        }
        serde_json::Value::Object(map) => {
            for entry in map.values_mut() {
                sanitize_json_value(entry);
            }
        }
        _ => {}
    }
}

fn sanitize_key_value_rows(rows: &mut [KeyValueRow]) {
    for row in rows {
        row.key = sanitize_export_text(&row.key);
        row.value = sanitize_export_text(&row.value);
    }
}

fn sanitize_oauth_rows(rows: &mut [OAuthParamRow]) {
    for row in rows {
        row.key = sanitize_export_text(&row.key);
        row.value = sanitize_export_text(&row.value);
    }
}

pub fn is_exportable_request_mode(mode: &str) -> bool {
    matches!(mode.trim().to_lowercase().as_str(), "http" | "graphql")
}

pub fn sanitize_request_for_export(request: &RequestRecord) -> RequestRecord {
    let mut sanitized = request.clone();

    sanitized.name = sanitize_export_text(&sanitized.name);
    sanitized.method = sanitize_export_text(&sanitized.method);
    sanitized.url = sanitize_export_text(&sanitized.url);
    sanitize_key_value_rows(&mut sanitized.query_params);
    sanitize_key_value_rows(&mut sanitized.headers);
    sanitize_key_value_rows(&mut sanitized.body_rows);
    sanitized.body_file_path = sanitize_export_text(&sanitized.body_file_path);
    sanitized.docs = sanitize_export_text(&sanitized.docs);
    sanitized.tags = sanitized
        .tags
        .iter()
        .map(|tag| sanitize_export_text(tag))
        .collect();
    sanitized.folder_path = sanitize_export_text(&sanitized.folder_path);
    sanitized.script_pre_request = sanitize_export_text(&sanitized.script_pre_request);
    sanitized.script_after_response = sanitize_export_text(&sanitized.script_after_response);
    sanitized.script_active_phase = sanitize_export_text(&sanitized.script_active_phase);
    sanitized.script_last_run_at = sanitize_export_text(&sanitized.script_last_run_at);
    sanitized.script_last_phase = sanitize_export_text(&sanitized.script_last_phase);
    sanitized.script_last_status = sanitize_export_text(&sanitized.script_last_status);
    sanitized.script_last_error = sanitize_export_text(&sanitized.script_last_error);
    sanitized.script_last_logs = sanitized
        .script_last_logs
        .iter()
        .map(|line| sanitize_export_text(line))
        .collect();
    for test in &mut sanitized.script_last_tests {
        test.name = sanitize_export_text(&test.name);
        test.error = sanitize_export_text(&test.error);
    }
    for value in sanitized.script_last_vars.values_mut() {
        sanitize_json_value(value);
    }

    sanitized.auth.auth_type = sanitize_export_text(&sanitized.auth.auth_type);
    sanitized.auth.token = sanitize_export_text(&sanitized.auth.token);
    sanitized.auth.username = sanitize_export_text(&sanitized.auth.username);
    sanitized.auth.password = sanitize_export_text(&sanitized.auth.password);
    sanitized.auth.api_key_name = sanitize_export_text(&sanitized.auth.api_key_name);
    sanitized.auth.api_key_value = sanitize_export_text(&sanitized.auth.api_key_value);
    sanitized.auth.api_key_in = sanitize_export_text(&sanitized.auth.api_key_in);

    sanitized.auth.oauth2.grant_type = sanitize_export_text(&sanitized.auth.oauth2.grant_type);
    sanitized.auth.oauth2.auth_url = sanitize_export_text(&sanitized.auth.oauth2.auth_url);
    sanitized.auth.oauth2.token_url = sanitize_export_text(&sanitized.auth.oauth2.token_url);
    sanitized.auth.oauth2.callback_url = sanitize_export_text(&sanitized.auth.oauth2.callback_url);
    sanitized.auth.oauth2.client_id = sanitize_export_text(&sanitized.auth.oauth2.client_id);
    sanitized.auth.oauth2.client_secret = sanitize_export_text(&sanitized.auth.oauth2.client_secret);
    sanitized.auth.oauth2.scope = sanitize_export_text(&sanitized.auth.oauth2.scope);
    sanitized.auth.oauth2.audience = sanitize_export_text(&sanitized.auth.oauth2.audience);
    sanitized.auth.oauth2.resource = sanitize_export_text(&sanitized.auth.oauth2.resource);
    sanitized.auth.oauth2.authorization_code =
        sanitize_export_text(&sanitized.auth.oauth2.authorization_code);
    sanitized.auth.oauth2.access_token = sanitize_export_text(&sanitized.auth.oauth2.access_token);
    sanitized.auth.oauth2.refresh_token = sanitize_export_text(&sanitized.auth.oauth2.refresh_token);
    sanitized.auth.oauth2.token_type = sanitize_export_text(&sanitized.auth.oauth2.token_type);
    sanitized.auth.oauth2.expires_at = sanitize_export_text(&sanitized.auth.oauth2.expires_at);
    sanitized.auth.oauth2.username = sanitize_export_text(&sanitized.auth.oauth2.username);
    sanitized.auth.oauth2.password = sanitize_export_text(&sanitized.auth.oauth2.password);
    sanitized.auth.oauth2.code_verifier = sanitize_export_text(&sanitized.auth.oauth2.code_verifier);
    sanitized.auth.oauth2.state = sanitize_export_text(&sanitized.auth.oauth2.state);
    sanitized.auth.oauth2.client_auth_method =
        sanitize_export_text(&sanitized.auth.oauth2.client_auth_method);
    sanitize_oauth_rows(&mut sanitized.auth.oauth2.extra_token_params);
    sanitized.auth.oauth2.last_error = sanitize_export_text(&sanitized.auth.oauth2.last_error);
    sanitized.auth.oauth2.last_warning = sanitize_export_text(&sanitized.auth.oauth2.last_warning);
    sanitized.auth.oauth2.last_status = sanitize_export_text(&sanitized.auth.oauth2.last_status);

    sanitized.grpc_proto_file_path = sanitize_export_text(&sanitized.grpc_proto_file_path);
    sanitized.grpc_method_path = sanitize_export_text(&sanitized.grpc_method_path);
    sanitized.grpc_streaming_mode = sanitize_export_text(&sanitized.grpc_streaming_mode);
    sanitized.grpc_direct_proto_files = sanitized
        .grpc_direct_proto_files
        .iter()
        .map(|path| sanitize_export_text(path))
        .collect();
    sanitized.grpc_proto_directories = sanitized
        .grpc_proto_directories
        .iter()
        .map(|entry| {
            let mut next = entry.clone();
            next.path = sanitize_export_text(&entry.path);
            next.files = entry.files.iter().map(|path| sanitize_export_text(path)).collect();
            next
        })
        .collect();

    match &mut sanitized.body {
        RequestTextOrJson::Text(text) => {
            *text = sanitize_export_text(text);
        }
        RequestTextOrJson::Json(json) => {
            sanitize_json_value(json);
        }
    }

    match &mut sanitized.graphql_variables {
        RequestTextOrJson::Text(text) => {
            *text = sanitize_export_text(text);
        }
        RequestTextOrJson::Json(json) => {
            sanitize_json_value(json);
        }
    }

    sanitized.last_response = None;

    sanitized
}

pub fn prepare_request_for_export(request: &RequestRecord) -> Result<RequestRecord, String> {
    if !is_exportable_request_mode(&request.request_mode) {
        return Err(
            "Export is supported only for HTTP and GraphQL requests. Realtime and gRPC requests are not exportable."
                .to_string(),
        );
    }

    Ok(sanitize_request_for_export(request))
}

pub fn prepare_requests_for_export(requests: &[RequestRecord]) -> Vec<RequestRecord> {
    requests
        .iter()
        .filter(|request| is_exportable_request_mode(&request.request_mode))
        .map(sanitize_request_for_export)
        .collect()
}

pub fn prepare_collection_for_kivo_export(collection: &CollectionRecord) -> CollectionRecord {
    let mut sanitized = collection.clone();
    sanitized.name = sanitize_export_text(&sanitized.name);
    sanitized.folders = sanitized
        .folders
        .iter()
        .map(|folder| sanitize_export_text(folder))
        .collect();
    sanitized.folder_settings = sanitized
        .folder_settings
        .iter()
        .map(|setting| {
            let mut next = FolderSettingsRecord {
                path: sanitize_export_text(&setting.path),
                default_headers: setting.default_headers.clone(),
                default_auth: setting.default_auth.clone(),
            };
            sanitize_key_value_rows(&mut next.default_headers);
            next.default_auth.auth_type = sanitize_export_text(&next.default_auth.auth_type);
            next.default_auth.token = sanitize_export_text(&next.default_auth.token);
            next.default_auth.username = sanitize_export_text(&next.default_auth.username);
            next.default_auth.password = sanitize_export_text(&next.default_auth.password);
            next.default_auth.api_key_name = sanitize_export_text(&next.default_auth.api_key_name);
            next.default_auth.api_key_value = sanitize_export_text(&next.default_auth.api_key_value);
            next.default_auth.api_key_in = sanitize_export_text(&next.default_auth.api_key_in);
            next.default_auth.oauth2.grant_type = sanitize_export_text(&next.default_auth.oauth2.grant_type);
            next.default_auth.oauth2.auth_url = sanitize_export_text(&next.default_auth.oauth2.auth_url);
            next.default_auth.oauth2.token_url = sanitize_export_text(&next.default_auth.oauth2.token_url);
            next.default_auth.oauth2.callback_url = sanitize_export_text(&next.default_auth.oauth2.callback_url);
            next.default_auth.oauth2.client_id = sanitize_export_text(&next.default_auth.oauth2.client_id);
            next.default_auth.oauth2.client_secret = sanitize_export_text(&next.default_auth.oauth2.client_secret);
            next.default_auth.oauth2.scope = sanitize_export_text(&next.default_auth.oauth2.scope);
            next.default_auth.oauth2.audience = sanitize_export_text(&next.default_auth.oauth2.audience);
            next.default_auth.oauth2.resource = sanitize_export_text(&next.default_auth.oauth2.resource);
            next.default_auth.oauth2.authorization_code = sanitize_export_text(&next.default_auth.oauth2.authorization_code);
            next.default_auth.oauth2.access_token = sanitize_export_text(&next.default_auth.oauth2.access_token);
            next.default_auth.oauth2.refresh_token = sanitize_export_text(&next.default_auth.oauth2.refresh_token);
            next.default_auth.oauth2.token_type = sanitize_export_text(&next.default_auth.oauth2.token_type);
            next.default_auth.oauth2.expires_at = sanitize_export_text(&next.default_auth.oauth2.expires_at);
            next.default_auth.oauth2.username = sanitize_export_text(&next.default_auth.oauth2.username);
            next.default_auth.oauth2.password = sanitize_export_text(&next.default_auth.oauth2.password);
            next.default_auth.oauth2.code_verifier = sanitize_export_text(&next.default_auth.oauth2.code_verifier);
            next.default_auth.oauth2.state = sanitize_export_text(&next.default_auth.oauth2.state);
            next.default_auth.oauth2.client_auth_method = sanitize_export_text(&next.default_auth.oauth2.client_auth_method);
            sanitize_oauth_rows(&mut next.default_auth.oauth2.extra_token_params);
            next.default_auth.oauth2.last_error = sanitize_export_text(&next.default_auth.oauth2.last_error);
            next.default_auth.oauth2.last_warning = sanitize_export_text(&next.default_auth.oauth2.last_warning);
            next.default_auth.oauth2.last_status = sanitize_export_text(&next.default_auth.oauth2.last_status);
            next
        })
        .collect();
    sanitized.requests = prepare_requests_for_export(&collection.requests);
    sanitized
}

#[derive(Default)]
pub(crate) struct ExportFolderNode<'a> {
    requests: Vec<&'a RequestRecord>,
    children: BTreeMap<String, ExportFolderNode<'a>>,
}

pub fn build_export_folder_tree<'a>(requests: &'a [RequestRecord]) -> ExportFolderNode<'a> {
    fn normalize_folder_segments(path: &str) -> Vec<String> {
        path.split('/')
            .map(|segment| segment.trim())
            .filter(|segment| !segment.is_empty())
            .map(ToString::to_string)
            .collect::<Vec<_>>()
    }

    let mut root = ExportFolderNode::default();
    for request in requests {
        let mut cursor = &mut root;
        let segments = normalize_folder_segments(&request.folder_path);
        for segment in segments {
            cursor = cursor.children.entry(segment).or_default();
        }
        cursor.requests.push(request);
    }

    root
}

fn request_to_postman_item(request: &RequestRecord) -> serde_json::Value {
    let mut body = serde_json::Map::new();
    let body_type = if request.body_type.trim().is_empty() {
        "none"
    } else {
        request.body_type.as_str()
    };
    if body_type == "json"
        || body_type == "text"
        || body_type == "xml"
        || body_type == "yaml"
        || body_type == "graphql"
    {
        body.insert(
            "mode".to_string(),
            serde_json::Value::String("raw".to_string()),
        );
        let raw = match &request.body {
            RequestTextOrJson::Text(text) => text.clone(),
            RequestTextOrJson::Json(json) => serde_json::to_string_pretty(json).unwrap_or_default(),
        };
        body.insert("raw".to_string(), serde_json::Value::String(raw));
    }

    let header = request
        .headers
        .iter()
        .filter(|h| h.enabled && !h.key.trim().is_empty())
        .map(|h| serde_json::json!({ "key": h.key, "value": h.value }))
        .collect::<Vec<_>>();

    serde_json::json!({
        "name": request.name,
        "request": {
            "method": request.method,
            "header": header,
            "url": request.url,
            "body": serde_json::Value::Object(body),
        }
    })
}

fn postman_items_from_tree(node: &ExportFolderNode) -> Vec<serde_json::Value> {
    let mut items = vec![];

    for (folder_name, child) in &node.children {
        items.push(serde_json::json!({
            "name": folder_name,
            "item": postman_items_from_tree(child),
        }));
    }

    for request in &node.requests {
        items.push(request_to_postman_item(request));
    }

    items
}

pub fn requests_to_openapi_doc(
    requests: &[RequestRecord],
    title: &str,
    version: &str,
    openapi_version: &str,
) -> serde_json::Value {
    let mut paths = serde_json::Map::new();
    for request in requests {
        let method = request.method.to_lowercase();
        let path_key = if request.url.trim().is_empty() {
            "/".to_string()
        } else {
            request.url.clone()
        };
        let entry = paths
            .entry(path_key)
            .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
        if let Some(obj) = entry.as_object_mut() {
            obj.insert(
                method,
                serde_json::json!({
                    "summary": request.name,
                    "responses": {
                        "200": { "description": "OK" }
                    }
                }),
            );
        }
    }

    if openapi_version == "2.0" {
        serde_json::json!({
            "swagger": "2.0",
            "info": { "title": title, "version": version },
            "paths": paths,
        })
    } else {
        serde_json::json!({
            "openapi": openapi_version,
            "info": { "title": title, "version": version },
            "paths": paths,
        })
    }
}

fn request_body_as_text(request: &RequestRecord) -> String {
    match &request.body {
        RequestTextOrJson::Text(text) => text.clone(),
        RequestTextOrJson::Json(json) => serde_json::to_string_pretty(json).unwrap_or_default(),
    }
}

fn default_open_collection_item_settings() -> serde_json::Value {
    serde_json::json!({
        "encodeUrl": true,
        "timeout": 0,
        "followRedirects": true,
        "maxRedirects": 5,
    })
}

fn request_to_open_collection_item(request: &RequestRecord, seq: usize) -> serde_json::Value {
    let body_text = request_body_as_text(request);
    let is_graphql = request.body_type == "graphql";

    if is_graphql {
        return serde_json::json!({
            "info": {
                "name": request.name,
                "type": "graphql",
                "seq": seq,
            },
            "graphql": {
                "url": request.url,
                "method": if request.method.trim().is_empty() { "POST" } else { request.method.as_str() },
                "body": {
                    "query": body_text,
                    "variables": "",
                },
                "auth": "inherit",
            },
            "settings": default_open_collection_item_settings(),
        });
    }

    let http_body = if body_text.trim().is_empty() {
        serde_json::Value::Null
    } else {
        serde_json::json!({
            "type": if request.body_type == "json" { "json" } else { "text" },
            "data": body_text,
        })
    };

    let mut http = serde_json::Map::new();
    http.insert(
        "method".to_string(),
        serde_json::Value::String(if request.method.trim().is_empty() {
            "GET".to_string()
        } else {
            request.method.clone()
        }),
    );
    http.insert(
        "url".to_string(),
        serde_json::Value::String(request.url.clone()),
    );
    http.insert(
        "auth".to_string(),
        serde_json::Value::String("inherit".to_string()),
    );
    if !http_body.is_null() {
        http.insert("body".to_string(), http_body);
    }

    serde_json::json!({
        "info": {
            "name": request.name,
            "type": "http",
            "seq": seq,
        },
        "http": serde_json::Value::Object(http),
        "settings": default_open_collection_item_settings(),
    })
}

fn open_collection_items_from_tree(
    node: &ExportFolderNode,
    seq: &mut usize,
) -> Vec<serde_json::Value> {
    let mut items = vec![];

    for (folder_name, child) in &node.children {
        let folder_seq = *seq;
        *seq += 1;
        items.push(serde_json::json!({
            "info": {
                "name": folder_name,
                "type": "folder",
                "seq": folder_seq,
            },
            "request": {
                "auth": "inherit",
            },
            "items": open_collection_items_from_tree(child, seq),
        }));
    }

    for request in &node.requests {
        let request_seq = *seq;
        *seq += 1;
        items.push(request_to_open_collection_item(request, request_seq));
    }

    items
}

pub fn requests_to_bruno_doc(requests: &[RequestRecord], name: &str) -> serde_json::Value {
    let tree = build_export_folder_tree(requests);
    let mut seq = 1usize;
    let items = open_collection_items_from_tree(&tree, &mut seq);

    serde_json::json!({
        "opencollection": "1.0.0",
        "info": {
            "name": name
        },
        "config": {
            "proxy": {
                "inherit": true,
                "config": {
                    "protocol": "http",
                    "hostname": "",
                    "port": "",
                    "auth": {
                        "username": "",
                        "password": ""
                    },
                    "bypassProxy": ""
                }
            }
        },
        "items": items,
        "request": {
            "auth": "inherit"
        },
        "bundled": true,
        "extensions": {
            "bruno": {
                "ignore": ["node_modules", ".git"],
                "exportedUsing": "Kivo"
            }
        }
    })
}

pub fn serialize_export_value(format: &str, value: &serde_json::Value) -> Result<String, String> {
    if format == "bruno" || format.ends_with("yaml") || format.ends_with("yml") {
        return serde_yaml::to_string(value).map_err(|e| format!("Failed to serialize YAML: {e}"));
    }
    serde_json::to_string_pretty(value).map_err(|e| format!("Failed to serialize JSON: {e}"))
}

pub fn normalize_export_format(format: &str) -> String {
    match format.trim().to_lowercase().as_str() {
        "openapi3" | "openapi3.0" | "openapi" => "openapi3.0".to_string(),
        "swagger2" | "swagger2.0" | "swagger" => "swagger2.0".to_string(),
        "postman" => "postman".to_string(),
        "kivo" | "kivo-json" | "kivo.json" => "kivo".to_string(),
        "bruno" | "bruno-yml" | "bruno.yml" | "yml" | "yaml" => "bruno".to_string(),
        other => other.to_string(),
    }
}

pub fn build_export_value(
    format: &str,
    name: &str,
    requests: &[RequestRecord],
) -> Result<serde_json::Value, String> {
    let normalized = normalize_export_format(format);
    let export_requests = prepare_requests_for_export(requests);
    if export_requests.is_empty() {
        return Err(
            "No exportable requests found. Export supports only HTTP and GraphQL requests."
                .to_string(),
        );
    }

    match normalized.as_str() {
        "kivo" => {
            if export_requests.len() == 1 {
                Ok(serde_json::json!({
                    "kivo": "1.0",
                    "type": "request",
                    "request": export_requests[0],
                }))
            } else {
                Ok(serde_json::json!({
                    "kivo": "1.0",
                    "type": "collection",
                    "collection": {
                        "name": name,
                        "folders": [],
                        "folderSettings": [],
                        "requests": export_requests,
                    }
                }))
            }
        }
        "postman" => Ok(serde_json::json!({
            "info": {
                "name": name,
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            },
            "item": postman_items_from_tree(&build_export_folder_tree(&export_requests))
        })),
        "openapi3.0" => Ok(requests_to_openapi_doc(&export_requests, name, "1.0.0", "3.0.0")),
        "swagger2.0" => Ok(requests_to_openapi_doc(&export_requests, name, "1.0.0", "2.0")),
        "bruno" => Ok(requests_to_bruno_doc(&export_requests, name)),
        _ => Err(
            "Unsupported export format. Use kivo, postman, openapi3.0, swagger2.0, or bruno.".to_string(),
        ),
    }
}
