import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { runLoadTest } from "@/lib/load-test-client.js";

const DEFAULT_CONFIG = {
  virtualUsers: 10,
  durationSecs: 10,
  timeoutMs: 10000,
};

export function useLoadTest(requestUrl, requestMethod, requestHeaders, requestBody) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [result, setResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef(null);

  const updateConfig = useCallback((key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const startProgressTimer = useCallback((durationSecs) => {
    setProgress(0);
    const startTime = Date.now();
    const total = durationSecs * 1000;

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / total) * 100));
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(intervalRef.current);
      }
    }, 200);
  }, []);

  const stopProgressTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setProgress(100);
  }, []);

  const run = useCallback(async () => {
    const url = (requestUrl || "").trim();
    if (!url) {
      toast.error("Enter a URL before running a load test.");
      return;
    }

    const headers = {};
    if (Array.isArray(requestHeaders)) {
      for (const row of requestHeaders) {
        if (row.enabled !== false && row.key?.trim()) {
          headers[row.key.trim()] = row.value ?? "";
        }
      }
    }

    setResult(null);
    setIsRunning(true);
    startProgressTimer(config.durationSecs);

    const toastId = toast.loading(`Running load test for ${config.durationSecs}s…`);

    try {
      const data = await runLoadTest({
        url,
        method: requestMethod || "GET",
        headers,
        body: requestBody || null,
        virtualUsers: config.virtualUsers,
        durationSecs: config.durationSecs,
        timeoutMs: config.timeoutMs,
      });
      setResult(data);
      toast.success(`Load test complete — ${data.requestsPerSec} req/s`, { id: toastId });
    } catch (err) {
      toast.error(String(err), { id: toastId });
    } finally {
      stopProgressTimer();
      setIsRunning(false);
    }
  }, [requestUrl, requestMethod, requestHeaders, requestBody, config, startProgressTimer, stopProgressTimer]);

  return { config, updateConfig, result, isRunning, progress, run };
}
