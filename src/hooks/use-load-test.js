import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { runLoadTest, cancelLoadTest } from "@/lib/load-test-client.js";

const DEFAULT_CONFIG = {
  virtualUsers: 10,
  durationSecs: 15,
  rampUpSecs: 0,
  timeoutMs: 15000,
};

const LIMITS = {
  virtualUsers: { min: 1, max: 10_000 },
  durationSecs: { min: 1, max: 600 },
  rampUpSecs: { min: 0, max: 600 },
  timeoutMs: { min: 500, max: 120_000 },
};

function clampValue(key, raw) {
  const v = Math.floor(Number(raw));
  if (!Number.isFinite(v)) return DEFAULT_CONFIG[key];
  const { min, max } = LIMITS[key] || { min: 0, max: Infinity };
  return Math.max(min, Math.min(max, v));
}

function generateTestId() {
  return `lt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useLoadTest(requestUrl, requestMethod, requestHeaders, requestBody) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [result, setResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef(null);
  const testIdRef = useRef(null);

  const updateConfig = useCallback((key, rawValue) => {
    const clamped = clampValue(key, rawValue);
    setConfig((prev) => ({ ...prev, [key]: clamped }));
  }, []);

  const startProgressTimer = useCallback((durationSecs) => {
    setProgress(0);
    const startTime = Date.now();
    const total = durationSecs * 1000;
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgress(Math.min(99, Math.round((elapsed / total) * 100)));
    }, 250);
  }, []);

  const stopProgressTimer = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setProgress(100);
  }, []);

  const stop = useCallback(async () => {
    if (testIdRef.current) {
      try {
        await cancelLoadTest(testIdRef.current);
      } catch {
      }
    }
  }, []);

  const run = useCallback(async () => {
    const url = (requestUrl || "").trim();
    if (!url) {
      toast.error("Enter a URL before running a load test.");
      return;
    }

    const vu = clampValue("virtualUsers", config.virtualUsers);
    const dur = clampValue("durationSecs", config.durationSecs);
    const ramp = clampValue("rampUpSecs", Math.min(config.rampUpSecs, config.durationSecs));
    const tmo = clampValue("timeoutMs", config.timeoutMs);

    const headers = {};
    if (Array.isArray(requestHeaders)) {
      for (const row of requestHeaders) {
        if (row.enabled !== false && row.key?.trim()) {
          headers[row.key.trim()] = row.value ?? "";
        }
      }
    }

    const testId = generateTestId();
    testIdRef.current = testId;

    setResult(null);
    setIsRunning(true);
    startProgressTimer(dur);

    try {
      const data = await runLoadTest({
        testId,
        url,
        method: requestMethod || "GET",
        headers,
        body: requestBody || null,
        virtualUsers: vu,
        durationSecs: dur,
        rampUpSecs: ramp,
        timeoutMs: tmo,
      });
      setResult(data);
      if (data.wasCancelled) {
        toast.info(`Stopped early ${data.totalRequests.toLocaleString()} requests · ${data.requestsPerSec} req/s`);
      } else {
        toast.success(`Done — ${data.requestsPerSec} req/s · ${(100 - data.errorRate).toFixed(1)}% success`);
      }
    } catch (err) {
      toast.error(`Load test failed: ${String(err)}`);
    } finally {
      stopProgressTimer();
      setIsRunning(false);
      testIdRef.current = null;
    }
  }, [requestUrl, requestMethod, requestHeaders, requestBody, config, startProgressTimer, stopProgressTimer]);

  return { config, updateConfig, result, isRunning, progress, run, stop };
}
