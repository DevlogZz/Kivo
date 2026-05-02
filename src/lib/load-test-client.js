import { invoke } from "@tauri-apps/api/core";

export function runLoadTest(payload) {
  return invoke("run_load_test", { payload });
}
