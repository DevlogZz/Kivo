import { BadgeCheck, Clock3, Cookie, FileJson2, ListTree, LoaderCircle, Search, X } from "lucide-react";
import { useState, useMemo, useEffect } from "react";

import { CodeEditor } from "@/components/workspace/CodeEditor.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Card } from "@/components/ui/card.jsx";
import { cn } from "@/lib/utils.js";
import { filterJson } from "@/lib/json-filter.js";

import { JsonTree } from "@/components/ui/JsonTree.jsx";

const responseTabs = ["Body", "Headers", "Cookies", "Meta"];

function getTone(status) {
  if (status >= 200 && status < 400) {
    return "success";
  }

  if (status >= 400) {
    return "danger";
  }

  return "muted";
}

export function ResponsePane({
  response,
  isSending = false,
  sendStartedAt = 0,
  onCancelSend,
  activeTab,
  onTabChange,
  bodyView,
  onBodyViewChange,
}) {
  const tone = getTone(response.status);

  const contentType = Object.entries(response.headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1]?.toLowerCase() || "";
  const isHtml = contentType.includes("text/html");
  const isJson = response.isJson;

  let bodyViews = ["Raw"];
  if (isJson) {
    bodyViews = ["Tree", "JSON", "Raw"];
  } else if (isHtml) {
    bodyViews = ["Preview", "Raw"];
  }

  let currentView = bodyView;
  if (!bodyViews.includes(currentView)) {
    currentView = bodyViews[0];
  }

  const parsedJson = useMemo(() => {
    if (!isJson) return null;
    try {
      return JSON.parse(response.body);
    } catch {
      return null;
    }
  }, [response.body, isJson]);

  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isSending || !sendStartedAt) {
      setElapsedMs(0);
      return undefined;
    }

    const updateElapsed = () => {
      setElapsedMs(Math.max(0, Date.now() - sendStartedAt));
    };

    updateElapsed();
    const interval = window.setInterval(updateElapsed, 100);
    return () => window.clearInterval(interval);
  }, [isSending, sendStartedAt]);

  useEffect(() => {
    if (!inputValue.trim()) {
      setSearchQuery("");
      return;
    }

    const isStructured = /[=!<>]/.test(inputValue);
    if (!isStructured && inputValue.trim().length < 2) {
      setSearchQuery("");
      return;
    }

    const timer = setTimeout(() => {
      setSearchQuery(inputValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const filteredJson = useMemo(() => {
    if (!parsedJson || !searchQuery) return parsedJson;
    return filterJson(parsedJson, searchQuery);
  }, [parsedJson, searchQuery]);

  const MAX_DISPLAY = 50;
  const displayJson = useMemo(() => {
    if (!filteredJson || !searchQuery) return filteredJson;
    if (Array.isArray(filteredJson) && filteredJson.length > MAX_DISPLAY) {
      return filteredJson.slice(0, MAX_DISPLAY);
    }
    return filteredJson;
  }, [filteredJson, searchQuery]);

  const totalMatches = filteredJson ? (Array.isArray(filteredJson) ? filteredJson.length : Object.keys(filteredJson).length) : 0;
  const isResultCapped = searchQuery && Array.isArray(filteredJson) && filteredJson.length > MAX_DISPLAY;
  const elapsedLabel = `${(elapsedMs / 1000).toFixed(1)}s`;

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

      <div className="relative min-h-0 flex-1 overflow-hidden p-3">
        {activeTab === "Body" ? (
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <FileJson2 className="h-3 w-3" />
                  <span>Body</span>
                </div>
                {currentView === "Tree" && (
                  <div className="flex items-center gap-1.5 border border-border/20 rounded pl-2.5 pr-1.5 py-[3px] w-48 bg-background/30 transition-colors focus-within:border-primary/50 shadow-sm ml-2 normal-case tracking-normal">
                    <Search className="h-[11px] w-[11px] text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      placeholder="e.g. age > 20 && status == active"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      className="w-full bg-transparent text-[11px] font-medium outline-none placeholder:text-muted-foreground/60 text-foreground"
                    />
                    {inputValue && (
                      <button onClick={() => setInputValue("")} className="text-muted-foreground hover:text-foreground shrink-0 focus:outline-none">
                        <X className="h-[11px] w-[11px]" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                {bodyViews.map((view) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => onBodyViewChange(view)}
                    className={cn(
                      "px-2 py-1 text-muted-foreground disabled:opacity-40 transition-colors",
                      currentView === view && "bg-secondary/35 text-foreground"
                    )}
                  >
                    {view}
                  </button>
                ))}
              </div>
            </div>
            {currentView === "Tree" && parsedJson !== null ? (
              <div className="h-full overflow-auto thin-scrollbar bg-background/20 rounded p-4 border border-border/10 shadow-inner">
                {(Array.isArray(displayJson) ? displayJson.length > 0 : Object.keys(displayJson || {}).length > 0) ? (
                  <div className="flex flex-col gap-0">
                    {searchQuery && (
                      <div className="text-[11px] text-muted-foreground mb-3 font-medium">
                        {isResultCapped
                          ? `Showing ${MAX_DISPLAY} of ${totalMatches} matches`
                          : `${totalMatches} match${totalMatches !== 1 ? "es" : ""}`}
                      </div>
                    )}
                    <JsonTree data={displayJson} searchQuery={searchQuery} />
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-muted-foreground/70">
                    <Search className="h-8 w-8 mb-2 opacity-20" />
                    <span className="text-[12px]">No matching keys or values found</span>
                  </div>
                )}
              </div>
            ) : currentView === "Preview" ? (
              <div className="h-full overflow-hidden rounded bg-white border border-border/10 shadow-inner">
                <iframe
                  srcDoc={response.body || response.rawBody}
                  title="HTML Preview"
                  sandbox="allow-same-origin"
                  className="w-full h-full border-0"
                />
              </div>
            ) : (
              <CodeEditor
                readOnly
                value={currentView === "JSON" && isJson ? response.body : response.rawBody}
                language={currentView === "JSON" && isJson ? "json" : "text"}
                wrapLines
                placeholder="Response body will appear here"
              />
            )}
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

        {isSending ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center backdrop-blur-md">
            <div className="flex flex-col items-center gap-3 text-center">
              <LoaderCircle className="h-7 w-7 animate-spin text-primary" />
              <div className="text-sm font-semibold text-foreground">Sending request...</div>
              <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock3 className="h-3.5 w-3.5" />
                <span>{elapsedLabel}</span>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={onCancelSend}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </div>

    </Card>
  );
}
