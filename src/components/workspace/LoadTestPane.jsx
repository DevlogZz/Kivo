import { Zap, Play, BarChart2, CheckCircle, XCircle, Clock, AlertTriangle, Activity } from "lucide-react";
import { useLoadTest } from "@/hooks/use-load-test.js";
import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";

function StatCard({ label, value, sub, tone }) {
  const toneClass =
    tone === "green"
      ? "text-emerald-400"
      : tone === "red"
        ? "text-red-400"
        : tone === "amber"
          ? "text-amber-400"
          : "text-foreground";

  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border/30 bg-background/35 px-3.5 py-3">
      <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
      <span className={`text-[22px] font-bold leading-none tracking-tight ${toneClass}`}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground/70">{sub}</span>}
    </div>
  );
}

function LatencyBar({ label, value, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 shrink-0 text-right text-[10px] text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/30">
        <div
          className="h-full rounded-full bg-primary/70 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-[11px] font-medium tabular-nums text-foreground">
        {value}ms
      </span>
    </div>
  );
}

export function LoadTestPane({ url, method, headers, body }) {
  const { config, updateConfig, result, isRunning, progress, run } = useLoadTest(url, method, headers, body);

  return (
    <div className="thin-scrollbar flex h-full flex-col gap-0 overflow-y-auto">
      <div className="flex items-center gap-2.5 border-b border-border/25 bg-background/30 px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Zap className="h-3.5 w-3.5" />
        </div>
        <div>
          <p className="text-[12px] font-semibold tracking-tight text-foreground">Load Test</p>
          <p className="text-[10px] text-muted-foreground">Stress test this request with concurrent virtual users</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Virtual Users
            </label>
            <Input
              type="number"
              min={1}
              max={500}
              value={config.virtualUsers}
              onChange={(e) => updateConfig("virtualUsers", Number(e.target.value))}
              className="h-8 border-border/35 bg-background/35 text-[13px]"
              disabled={isRunning}
            />
            <span className="text-[9px] text-muted-foreground/60">max 500</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Duration (s)
            </label>
            <Input
              type="number"
              min={1}
              max={300}
              value={config.durationSecs}
              onChange={(e) => updateConfig("durationSecs", Number(e.target.value))}
              className="h-8 border-border/35 bg-background/35 text-[13px]"
              disabled={isRunning}
            />
            <span className="text-[9px] text-muted-foreground/60">max 300s</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Timeout (ms)
            </label>
            <Input
              type="number"
              min={500}
              max={60000}
              value={config.timeoutMs}
              onChange={(e) => updateConfig("timeoutMs", Number(e.target.value))}
              className="h-8 border-border/35 bg-background/35 text-[13px]"
              disabled={isRunning}
            />
            <span className="text-[9px] text-muted-foreground/60">per request</span>
          </div>
        </div>

        <Button
          onClick={run}
          disabled={isRunning}
          className="h-9 gap-2 text-[13px] font-semibold"
        >
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
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/30">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-1.5 border-b border-border/20 pb-2">
              <BarChart2 className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Results
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground/60">
                {(result.durationMs / 1000).toFixed(1)}s actual
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatCard
                label="Req / sec"
                value={result.requestsPerSec}
                sub={`${result.totalRequests} total`}
              />
              <StatCard
                label="Successful"
                value={result.successful}
                tone="green"
                sub={`${(100 - result.errorRate).toFixed(1)}% success`}
              />
              <StatCard
                label="Failed"
                value={result.failed}
                tone={result.failed > 0 ? "red" : undefined}
                sub={`${result.errorRate}% error rate`}
              />
              <StatCard
                label="Avg Latency"
                value={`${result.avgLatencyMs}ms`}
                tone={result.avgLatencyMs > 1000 ? "amber" : undefined}
              />
              <StatCard
                label="Min Latency"
                value={`${result.minLatencyMs}ms`}
                tone="green"
              />
              <StatCard
                label="Max Latency"
                value={`${result.maxLatencyMs}ms`}
                tone={result.maxLatencyMs > 5000 ? "red" : "amber"}
              />
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border/30 bg-background/25 p-3.5">
              <div className="mb-1 flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Latency Percentiles
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <LatencyBar label="P50" value={result.p50LatencyMs} max={result.p99LatencyMs} />
                <LatencyBar label="P90" value={result.p90LatencyMs} max={result.p99LatencyMs} />
                <LatencyBar label="P99" value={result.p99LatencyMs} max={result.p99LatencyMs} />
              </div>
            </div>

            {Object.keys(result.statusCodes).length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border border-border/30 bg-background/25 p-3.5">
                <div className="mb-1 flex items-center gap-1.5">
                  <CheckCircle className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    Status Codes
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(result.statusCodes)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([code, count]) => {
                      const isSuccess = Number(code) < 400;
                      return (
                        <div
                          key={code}
                          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium ${
                            isSuccess
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border-red-500/30 bg-red-500/10 text-red-400"
                          }`}
                        >
                          {isSuccess ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          {code}
                          <span className="font-bold">{count}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border border-red-500/25 bg-red-500/8 p-3.5">
                <div className="mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-red-400" />
                  <span className="text-[10px] uppercase tracking-[0.15em] text-red-400">
                    Errors (up to 20)
                  </span>
                </div>
                <ul className="flex flex-col gap-1">
                  {result.errors.map((err, i) => (
                    <li key={i} className="truncate font-mono text-[10px] text-red-300/80">
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
