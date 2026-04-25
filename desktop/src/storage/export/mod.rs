use crate::storage::models::{RequestRecord, RequestTextOrJson};
use std::collections::BTreeMap;

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
    match normalized.as_str() {
        "postman" => Ok(serde_json::json!({
            "info": {
                "name": name,
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            },
            "item": postman_items_from_tree(&build_export_folder_tree(requests))
        })),
        "openapi3.0" => Ok(requests_to_openapi_doc(requests, name, "1.0.0", "3.0.0")),
        "swagger2.0" => Ok(requests_to_openapi_doc(requests, name, "1.0.0", "2.0")),
        "bruno" => Ok(requests_to_bruno_doc(requests, name)),
        _ => Err(
            "Unsupported export format. Use postman, openapi3.0, swagger2.0, or bruno.".to_string(),
        ),
    }
}
