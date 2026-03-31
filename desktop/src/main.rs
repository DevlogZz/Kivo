#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod http;
mod storage;

use http::client::send_http_request;
use storage::{load_app_state, save_app_state};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![send_http_request, load_app_state, save_app_state])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
