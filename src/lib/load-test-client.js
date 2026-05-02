import { invoke } from "@tauri-apps/api/core";

export function runLoadTest(payload) {
  return invoke("run_load_test", { payload });
}

export function cancelLoadTest(testId) {
  return invoke("cancel_load_test", { testId });
}
