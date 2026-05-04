import { Zap, Play, Square, BarChart2, CheckCircle, XCircle, Clock, AlertTriangle, Activity, TrendingUp, Database } from "lucide-react";
import { useLoadTest } from "@/hooks/use-load-test.js";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { cn } from "@/lib/utils.js";

const LIMITS = {
  virtualUsers: { min: 1, max: 10_000, label: "max 10,000" },
  durationSecs: { min: 1, max: 600, label: "max 600s" },
  rampUpSecs: { min: 0, max: 600, label: "0 = instant" },
  timeoutMs: { min: 500, max: 120_000, label: "per request" },
};

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

function StatCard({ label, value, sub, successText, dangerText }) {
  const valueClass = successText
    ? "text-[hsl(var(--success))]"
    : dangerText
      ? "text-[hsl(var(--danger))]"
      : "text-foreground";

  return (
    <div className="flex flex-col gap-0.5 border border-border/30 px-3 py-2.5">
      <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <span className={cn("text-[20px] font-bold leading-none tracking-tight", valueClass)}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-muted-foreground/60">{sub}</span>}
    </div>
  );
}

function LatencyBar({ label, value, max, tone }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const barColor =
    tone === "danger" ? "bg-[hsl(var(--danger))]" : tone === "warn" ? "bg-amber-500" : "bg-primary";
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-right font-mono text-[10px] text-muted-foreground">{label}</span>
      <div className="h-1 flex-1 bg-border/30">
        <div className={`h-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground">
        {value}ms
      </span>
    </div>
  );
}

function TimelineChart({ timeline, durationSecs }) {
  if (!timeline || timeline.length === 0) return (
    <div className="flex h-16 items-center justify-center text-[10px] text-muted-foreground/50">
      No timeline data
    </div>
  );

  const maxSec = Math.max(...timeline.map((b) => b.second), durationSecs - 1);
  const totalBuckets = maxSec + 1;
  const maxRps = Math.max(...timeline.map((b) => b.rps), 1);

  const bySecond = new Map(timeline.map((b) => [b.second, b]));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Requests / second</span>
        <span className="text-[9px] text-muted-foreground/60">peak {maxRps.toFixed(0)} req/s</span>
      </div>
      <div className="relative flex h-16 items-stretch gap-px overflow-hidden border border-border/20 px-0.5 pt-1">
        {Array.from({ length: totalBuckets }, (_, i) => {
          const b = bySecond.get(i);
          const rpsH = b ? Math.max(2, Math.round((b.rps / maxRps) * 100)) : 0;
          const errH = b && b.errors > 0 && b.rps > 0
            ? Math.round((b.errors / b.rps) * rpsH)
            : 0;
          return (
            <div
              key={i}
              className="relative flex-1"
              title={b ? `t=${i}s · ${b.rps} req/s · ${b.errors} err · ${b.avgLatencyMs}ms avg` : `t=${i}s · idle`}
            >
              {rpsH > 0 && (
                <div
                  className="absolute bottom-0 left-0 right-0 bg-primary/55 hover:bg-primary transition-colors"
                  style={{ height: `${rpsH}%` }}
                />
              )}
              {errH > 0 && (
                <div
                  className="absolute bottom-0 left-0 right-0 bg-[hsl(var(--danger))]/70"
                  style={{ height: `${errH}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[9px] text-muted-foreground/50">
        <span>0s</span>
        <span>{Math.round(totalBuckets / 2)}s</span>
        <span>{totalBuckets}s</span>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, label, right }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-border/20 pb-1.5">
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      {right && <span className="ml-auto text-[9px] text-muted-foreground/50">{right}</span>}
    </div>
  );
}

function ConfigInput({ configKey, label, value, onChange, disabled }) {
  const { min, max, label: hint } = LIMITS[configKey];
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{label}</label>
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(configKey, e.target.value)}
        onBlur={(e) => onChange(configKey, e.target.value)}
        className="h-8 border-border/35 text-[13px]"
        disabled={disabled}
      />
      <span className="text-[9px] text-muted-foreground/50">{hint}</span>
    </div>
  );
}

export function LoadTestPane({ url, method, headers, body }) {
  const { config, updateConfig, result, isRunning, progress, run, stop } = useLoadTest(url, method, headers, body);

  return (
    <div className="thin-scrollbar flex h-full flex-col overflow-y-auto">
      <div className="flex items-center gap-2.5 border-b border-border/25 px-4 py-3">
        <div className="flex h-6 w-6 items-center justify-center text-primary">
          <Zap className="h-3.5 w-3.5" />
        </div>
        <div>
          <p className="text-[12px] font-semibold tracking-tight text-foreground">Load Test</p>
          <p className="text-[10px] text-muted-foreground">High-performance concurrent request benchmarking</p>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-4">
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
          <ConfigInput configKey="virtualUsers" label="Virtual Users" value={config.virtualUsers} onChange={updateConfig} disabled={isRunning} />
          <ConfigInput configKey="durationSecs" label="Duration (s)" value={config.durationSecs} onChange={updateConfig} disabled={isRunning} />
          <ConfigInput configKey="rampUpSecs" label="Ramp-up (s)" value={config.rampUpSecs} onChange={updateConfig} disabled={isRunning} />
          <ConfigInput configKey="timeoutMs" label="Timeout (ms)" value={config.timeoutMs} onChange={updateConfig} disabled={isRunning} />
        </div>

        <div className="flex gap-2">
          <Button onClick={run} disabled={isRunning} className="h-8 flex-1 gap-2 text-[12px] font-semibold">
            {isRunning ? (
              <>
                <Activity className="h-3.5 w-3.5 animate-pulse" />
                Running…
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Run Load Test
              </>
            )}
          </Button>
          {isRunning && (
            <Button
              onClick={stop}
              variant="destructive"
              className="h-8 gap-1.5 px-3 text-[12px] font-semibold"
            >
              <Square className="h-3 w-3" />
              Stop
            </Button>
          )}
        </div>

        {isRunning && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Progress — {config.durationSecs}s test</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div className="h-1 w-full overflow-hidden bg-border/30">
              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-5">
            {result.wasCancelled && (
              <div className="border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
                Test was stopped early, partial results shown below.
              </div>
            )}

            <div className="flex flex-col gap-3">
              <SectionHeader icon={Activity} label="Throughput" right={`${(result.durationMs / 1000).toFixed(2)}s actual`} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <StatCard label="Avg req/s" value={result.requestsPerSec} sub={`peak ${result.peakRps} req/s`} />
                <StatCard label="Total requests" value={result.totalRequests.toLocaleString()} />
                <StatCard label="Data received" value={formatBytes(result.bytesReceived)} />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <SectionHeader icon={CheckCircle} label="Results" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <StatCard
                  label="Successful"
                  value={result.successful.toLocaleString()}
                  successText
                  sub={`${(100 - result.errorRate).toFixed(2)}% success rate`}
                />
                <StatCard
                  label="Failed"
                  value={result.failed.toLocaleString()}
                  dangerText={result.failed > 0}
                  sub={`${result.errorRate}% error rate`}
                />
                <StatCard
                  label="Error breakdown"
                  value={`T:${result.timeoutErrors} C:${result.connectionErrors}`}
                  sub="timeouts / connects"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <SectionHeader icon={Clock} label="Latency" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <StatCard label="Avg" value={`${result.avgLatencyMs}ms`} />
                <StatCard label="Min" value={`${result.minLatencyMs}ms`} successText />
                <StatCard
                  label="Max"
                  value={`${result.maxLatencyMs}ms`}
                  dangerText={result.maxLatencyMs > 5000}
                />
              </div>
              <div className="flex flex-col gap-2.5 border border-border/30 p-3">
                <LatencyBar label="P50" value={result.latencyHistogram.p50} max={result.latencyHistogram.p999 || result.maxLatencyMs} />
                <LatencyBar label="P75" value={result.latencyHistogram.p75} max={result.latencyHistogram.p999 || result.maxLatencyMs} />
                <LatencyBar label="P90" value={result.latencyHistogram.p90} max={result.latencyHistogram.p999 || result.maxLatencyMs} tone="warn" />
                <LatencyBar label="P95" value={result.latencyHistogram.p95} max={result.latencyHistogram.p999 || result.maxLatencyMs} tone="warn" />
                <LatencyBar label="P99" value={result.latencyHistogram.p99} max={result.latencyHistogram.p999 || result.maxLatencyMs} tone="danger" />
                <LatencyBar label="P99.9" value={result.latencyHistogram.p999} max={result.latencyHistogram.p999 || result.maxLatencyMs} tone="danger" />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <SectionHeader icon={TrendingUp} label="Timeline" />
              <div className="border border-border/30 p-3">
                <TimelineChart timeline={result.timeline} durationSecs={config.durationSecs} />
              </div>
            </div>

            {Object.keys(result.statusCodes).length > 0 && (
              <div className="flex flex-col gap-3">
                <SectionHeader icon={Database} label="Status codes" />
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(result.statusCodes)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([code, count]) => {
                      const isSuccess = Number(code) < 400;
                      return (
                        <div
                          key={code}
                          className={cn(
                            "flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] font-medium",
                            isSuccess ? "status-success border-current/30" : "status-danger border-current/30"
                          )}
                        >
                          {isSuccess ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          <span>{code}</span>
                          <span className="font-bold">{count.toLocaleString()}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="flex flex-col gap-3">
                <SectionHeader icon={AlertTriangle} label="Error log" right={`${result.errors.length} samples`} />
                <div className="border border-border/30 p-3">
                  <ul className="flex flex-col gap-1">
                    {result.errors.map((err, i) => (
                      <li key={i} className="break-all font-mono text-[10px] text-[hsl(var(--danger))]">
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
