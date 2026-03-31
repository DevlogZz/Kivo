import { BadgeCheck, Clock3, Cookie, FileJson2, ListTree } from "lucide-react";

import { CodeEditor } from "@/components/workspace/CodeEditor.jsx";
import { Card } from "@/components/ui/card.jsx";
import { cn } from "@/lib/utils.js";

const responseTabs = ["Body", "Headers", "Cookies", "Meta"];
const bodyViews = ["JSON", "Raw"];

function getTone(status) {
  if (status >= 200 && status < 400) {
    return "success";
  }

  if (status >= 400) {
    return "danger";
  }

  return "muted";
}

export function ResponsePane({ response, activeTab, onTabChange, bodyView, onBodyViewChange }) {
  const tone = getTone(response.status);
  const canUseJsonView = response.isJson;

  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden border-0 bg-card/84 p-0 shadow-none">
      <div className="flex items-center justify-between border-b border-border/25 px-3 py-2 text-[11px] text-muted-foreground lg:py-2.5 lg:text-[12px]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Clock3 className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
            <span>{response.duration}</span>
          </div>
          <div className="text-foreground">{response.size}</div>
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 font-medium lg:px-3 lg:py-1.5",
            tone === "success" && "status-success",
            tone === "danger" && "status-danger",
            tone === "muted" && "status-muted"
          )}
        >
          <BadgeCheck className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
          <span>{response.badge}</span>
        </div>
      </div>

      <div className="border-b border-border/25 px-3 py-2 text-[12px] lg:text-[13px]">
        <div className="flex items-center gap-1">
          {responseTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={cn("px-2 py-1 text-muted-foreground transition-colors lg:px-3 lg:py-1.5", activeTab === tab && "bg-secondary/35 text-foreground")}
            >
              {tab}
              {tab === "Headers" ? ` ${Object.keys(response.headers).length}` : ""}
              {tab === "Cookies" ? ` ${response.cookies.length}` : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {activeTab === "Body" ? (
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <FileJson2 className="h-3 w-3" />
                <span>Body</span>
              </div>
              <div className="flex items-center gap-1">
                {bodyViews.map((view) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => onBodyViewChange(view)}
                    disabled={view === "JSON" && !canUseJsonView}
                    className={cn(
                      "px-2 py-1 text-muted-foreground disabled:opacity-40",
                      bodyView === view && "bg-secondary/35 text-foreground"
                    )}
                  >
                    {view}
                  </button>
                ))}
              </div>
            </div>
            <CodeEditor
              readOnly
              value={bodyView === "JSON" && canUseJsonView ? response.body : response.rawBody}
              language={bodyView === "JSON" && canUseJsonView ? "json" : "text"}
              wrapLines
              placeholder="Response body will appear here"
            />
          </div>
        ) : null}

        {activeTab === "Headers" ? (
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Headers</div>
            <div className="thin-scrollbar min-h-0 overflow-auto bg-background/20">
              {Object.entries(response.headers).length ? (
                Object.entries(response.headers).map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[220px_minmax(0,1fr)] border-b border-border/10 text-[12px]">
                    <div className="px-3 py-2 text-muted-foreground">{key}</div>
                    <div className="px-3 py-2 text-foreground">{String(value)}</div>
                  </div>
                ))
              ) : (
                <div className="p-3 text-[12px] text-muted-foreground">No response headers</div>
              )}
            </div>
          </div>
        ) : null}

        {activeTab === "Cookies" ? (
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <Cookie className="h-3 w-3" />
              <span>Cookies</span>
            </div>
            <div className="thin-scrollbar min-h-0 overflow-auto bg-background/20 p-3 text-[12px] text-foreground">
              {response.cookies.length ? response.cookies.join("\n\n") : "No cookies were returned by this response."}
            </div>
          </div>
        ) : null}

        {activeTab === "Meta" ? (
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <ListTree className="h-3 w-3" />
              <span>Meta</span>
            </div>
            <div className="bg-background/20 p-3 text-[12px] text-muted-foreground">
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span>Method</span>
                  <span className="text-foreground">{response.meta.method}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>Final URL</span>
                  <span className="max-w-[70%] truncate text-right text-foreground">{response.meta.url}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Status</span>
                  <span className="text-foreground">{response.statusText}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Size</span>
                  <span className="text-foreground">{response.size}</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
