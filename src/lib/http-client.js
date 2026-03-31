import { invoke } from "@tauri-apps/api/core";

export function sendHttpRequest(payload) {
  return invoke("send_http_request", { payload });
}

export function loadAppState() {
  return invoke("load_app_state");
}

export function saveAppState(payload) {
  return invoke("save_app_state", { payload });
}
