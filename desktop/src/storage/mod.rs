use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const STORE_FILE_NAME: &str = "kivo-data.json";

fn default_sidebar_width() -> u16 {
    304
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedAppState {
    pub version: u8,
    pub active_workspace_id: String,
    pub active_request_id: String,
    pub sidebar_tab: String,
    #[serde(default = "default_sidebar_width")]
    pub sidebar_width: u16,
    pub workspaces: Vec<WorkspaceRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRecord {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub requests: Vec<RequestRecord>,
    #[serde(default)]
    pub history: Vec<HistoryRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestRecord {
    pub id: String,
    pub name: String,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub query_params: Vec<KeyValueRow>,
    #[serde(default)]
    pub headers: Vec<KeyValueRow>,
    pub auth: AuthRecord,
    pub body_type: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub docs: String,
    pub active_editor_tab: String,
    pub active_response_tab: String,
    pub response_body_view: String,
    pub last_response: Option<SavedResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyValueRow {
    pub id: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthRecord {
    #[serde(rename = "type")]
    pub auth_type: String,
    #[serde(default)]
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedResponse {
    pub status: u16,
    pub badge: String,
    pub status_text: String,
    pub duration: String,
    pub size: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub cookies: Vec<String>,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub raw_body: String,
    #[serde(default)]
    pub is_json: bool,
    pub meta: ResponseMeta,
    #[serde(default)]
    pub saved_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseMeta {
    pub url: String,
    pub method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRecord {
    pub id: String,
    pub request_id: String,
    pub request_name: String,
    pub method: String,
    pub status: u16,
    pub status_text: String,
    pub duration: String,
    pub size: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub fingerprint: String,
    #[serde(default)]
    pub saved_at: String,
    #[serde(default)]
    pub saved_at_ts: u64,
}

fn default_state() -> PersistedAppState {
    PersistedAppState {
        version: 1,
        active_workspace_id: String::new(),
        active_request_id: String::new(),
        sidebar_tab: "requests".to_string(),
        sidebar_width: default_sidebar_width(),
        workspaces: vec![],
    }
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data directory: {err}"))?;

    Ok(app_dir.join(STORE_FILE_NAME))
}

#[tauri::command]
pub fn load_app_state(app: AppHandle) -> Result<PersistedAppState, String> {
    let path = store_path(&app)?;

    if !path.exists() {
        return Ok(default_state());
    }

    let contents = fs::read_to_string(&path)
        .map_err(|err| format!("Failed to read local store: {err}"))?;

    serde_json::from_str(&contents).map_err(|err| format!("Failed to parse local store: {err}"))
}

#[tauri::command]
pub fn save_app_state(app: AppHandle, payload: PersistedAppState) -> Result<(), String> {
    let path = store_path(&app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("Failed to create app data directory: {err}"))?;
    }

    let serialized = serde_json::to_string_pretty(&payload)
        .map_err(|err| format!("Failed to serialize local store: {err}"))?;

    fs::write(&path, serialized).map_err(|err| format!("Failed to write local store: {err}"))
}


