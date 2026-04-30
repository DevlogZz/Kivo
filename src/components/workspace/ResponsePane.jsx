import { BadgeCheck, ChevronLeft, ChevronRight, Clock3, Cookie, Copy, Download, FileJson2, ListTree, LoaderCircle, Plus, Search, Trash2, X } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { save } from "@tauri-apps/plugin-dialog";

import { CodeEditor } from "@/components/workspace/CodeEditor.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Card } from "@/components/ui/card.jsx";
import { Input } from "@/components/ui/input.jsx";
import { cn } from "@/lib/utils.js";
import { filterJson } from "@/lib/json-filter.js";
import { clearCookieJar, deleteCookieJarEntry, exportResponseFile, getCookieJar, upsertCookieJarEntry } from "@/lib/http-client.js";

import { JsonTree } from "@/components/ui/JsonTree.jsx";

const responseTabs = ["Body", "Headers", "Cookies", "Meta"];
const MANAGER_PAGE_SIZE = 6;
const COOKIE_EDITOR_INPUT_CLASS = "h-10 border-border/35 bg-background/30 text-[12px] focus-visible:ring-0 focus-visible:border-primary";

const EMPTY_COOKIE_DRAFT = {
  id: "",
  name: "",
  value: "",
  domain: "",
  path: "/",
  expiresAt: "",
  sameSite: "",
  secure: false,
  httpOnly: false,
  hostOnly: true,
};

function parseSetCookieString(raw) {
  const parts = String(raw || "").split(";").map((item) => item.trim()).filter(Boolean);
  const [first, ...attrs] = parts;
  if (!first || !first.includes("=")) {
    return null;
  }

  const [namePart, ...valueParts] = first.split("=");
  const parsed = {
    name: namePart?.trim() || "",
    value: valueParts.join("=").trim(),
    domain: "",
    path: "/",
    expiresAt: "",
    sameSite: "",
    secure: false,
    httpOnly: false,
    hostOnly: true,
  };

  for (const attr of attrs) {
    const [k, ...v] = attr.split("=");
    const key = String(k || "").trim().toLowerCase();
    const value = v.join("=").trim();
    if (key === "domain") {
      parsed.domain = value;
      parsed.hostOnly = false;
    } else if (key === "path") {
      parsed.path = value || "/";
    } else if (key === "expires") {
      parsed.expiresAt = value;
    } else if (key === "samesite") {
      parsed.sameSite = value;
    } else if (key === "secure") {
      parsed.secure = true;
    } else if (key === "httponly") {
      parsed.httpOnly = true;
    }
  }

  return parsed.name ? parsed : null;
}

function cookieToRawString(cookie) {
  const segments = [`${cookie.name}=${cookie.value}`];
  if (cookie.domain) segments.push(`Domain=${cookie.domain}`);
  if (cookie.path) segments.push(`Path=${cookie.path}`);
  if (cookie.expiresAt) segments.push(`Expires=${cookie.expiresAt}`);
  if (cookie.sameSite) segments.push(`SameSite=${cookie.sameSite}`);
  if (cookie.secure) segments.push("Secure");
  if (cookie.httpOnly) segments.push("HttpOnly");
  return segments.join("; ");
}

function getTone(status) {
  if (status >= 200 && status < 400) {
    return "success";
  }

  if (status >= 400) {
    return "danger";
  }

  return "muted";
}

function detectResponseLanguage(contentType, bodyText, isJson) {
  if (isJson) {
    return "json";
  }

  const normalizedType = String(contentType || "").toLowerCase();
  const source = String(bodyText || "").trim();

  if (normalizedType.includes("graphql")) {
    return "graphql";
  }

  if (normalizedType.includes("application/xml") || normalizedType.includes("text/xml") || normalizedType.includes("+xml")) {
    return "xml";
  }

  if (normalizedType.includes("yaml") || normalizedType.includes("yml")) {
    return "yaml";
  }

  if (source.startsWith("<?xml") || (source.startsWith("<") && source.endsWith(">"))) {
    return "xml";
  }

  if (source.startsWith("---") || /\n\s*[A-Za-z0-9_-]+\s*:\s*/.test(source)) {
    return "yaml";
  }

  return "text";
}

export function ResponsePane({
  response,
  isSending = false,
  sendStartedAt = 0,
  onCancelSend,
  workspaceName = "",
  collectionName = "",
  activeTab,
  onTabChange,
  bodyView,
  onBodyViewChange,
  onClearResponse,
}) {
  const tone = getTone(response.status);

  const contentType = Object.entries(response.headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1]?.toLowerCase() || "";
  const isHtml = contentType.includes("text/html");
  const isJson = response.isJson;
  const responseBodyLanguage = detectResponseLanguage(contentType, response.body || response.rawBody, isJson);

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
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [manageSearch, setManageSearch] = useState("");
  const [managerCookies, setManagerCookies] = useState([]);
  const [isManagerLoading, setIsManagerLoading] = useState(false);
  const [isManagerSaving, setIsManagerSaving] = useState(false);
  const [managerPage, setManagerPage] = useState(1);
  const [isCookieEditorOpen, setIsCookieEditorOpen] = useState(false);
  const [cookieDraftMode, setCookieDraftMode] = useState("friendly");
  const [cookieDraft, setCookieDraft] = useState(EMPTY_COOKIE_DRAFT);
  const [rawCookieString, setRawCookieString] = useState("");

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

  const responseCookiesPreview = useMemo(() => {
    return (response.cookies || [])
      .map((cookie) => parseSetCookieString(cookie))
      .filter(Boolean);
  }, [response.cookies]);

  const filteredManagerCookies = useMemo(() => {
    const query = manageSearch.trim().toLowerCase();
    if (!query) return managerCookies;
    return managerCookies.filter((entry) => {
      const name = String(entry?.name ?? "").toLowerCase();
      const domain = String(entry?.domain ?? "").toLowerCase();
      const path = String(entry?.path ?? "").toLowerCase();
      const value = String(entry?.value ?? "").toLowerCase();
      return name.includes(query) || domain.includes(query) || path.includes(query) || value.includes(query);
    });
  }, [managerCookies, manageSearch]);

  const totalManagerPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredManagerCookies.length / MANAGER_PAGE_SIZE));
  }, [filteredManagerCookies.length]);

  const pagedManagerCookies = useMemo(() => {
    const start = (managerPage - 1) * MANAGER_PAGE_SIZE;
    return filteredManagerCookies.slice(start, start + MANAGER_PAGE_SIZE);
  }, [filteredManagerCookies, managerPage]);

  useEffect(() => {
    setManagerPage(1);
  }, [manageSearch, isManageOpen]);

  useEffect(() => {
    if (managerPage > totalManagerPages) {
      setManagerPage(totalManagerPages);
    }
  }, [managerPage, totalManagerPages]);

  async function loadManagerCookies() {
    setIsManagerLoading(true);
    try {
      const list = await getCookieJar(workspaceName || null, collectionName || null);
      setManagerCookies(Array.isArray(list) ? list : []);
    } catch {
      setManagerCookies([]);
    } finally {
      setIsManagerLoading(false);
    }
  }

  function openManager() {
    setIsManageOpen(true);
    setManagerPage(1);
    setManageSearch("");
    setIsCookieEditorOpen(false);
    setCookieDraftMode("friendly");
    setCookieDraft(EMPTY_COOKIE_DRAFT);
    setRawCookieString("");
    loadManagerCookies();
  }

  function closeManager() {
    setIsManageOpen(false);
    setIsCookieEditorOpen(false);
  }

  function openCookieEditor(entry = null) {
    const nextDraft = entry
      ? {
        id: String(entry?.id ?? ""),
        name: String(entry?.name ?? ""),
        value: String(entry?.value ?? ""),
        domain: String(entry?.domain ?? ""),
        path: String(entry?.path ?? "/") || "/",
        expiresAt: String(entry?.expiresAt ?? ""),
        sameSite: String(entry?.sameSite ?? ""),
        secure: Boolean(entry?.secure),
        httpOnly: Boolean(entry?.httpOnly),
        hostOnly: entry?.hostOnly ?? true,
      }
      : { ...EMPTY_COOKIE_DRAFT };
    setCookieDraft(nextDraft);
    setRawCookieString(entry ? cookieToRawString(nextDraft) : "");
    setCookieDraftMode("friendly");
    setIsCookieEditorOpen(true);
  }

  function closeCookieEditor() {
    setIsCookieEditorOpen(false);
  }

  async function deleteCookie(id) {
    try {
      const removed = await deleteCookieJarEntry(id);
      if (removed) {
        setManagerCookies((prev) => prev.filter((entry) => entry.id !== id));
      }
    } catch {
      // no-op
    }
  }

  async function handleDeleteAllCookies() {
    try {
      await clearCookieJar(workspaceName || null, collectionName || null);
      setManagerCookies([]);
    } catch {
      // no-op
    }
  }

  async function saveCookieDraft() {
    let next = { ...cookieDraft };
    if (cookieDraftMode === "raw") {
      const parsed = parseSetCookieString(rawCookieString);
      if (!parsed) {
        return;
      }
      next = {
        ...next,
        ...parsed,
      };
    }
    if (!next.name.trim() || !next.domain.trim()) {
      return;
    }

    setIsManagerSaving(true);
    try {
      const saved = await upsertCookieJarEntry({
        id: next.id || null,
        name: next.name.trim(),
        value: next.value,
        domain: next.domain.trim(),
        path: next.path.trim() || "/",
        expiresAt: next.expiresAt.trim() ? next.expiresAt.trim() : null,
        sameSite: next.sameSite.trim(),
        secure: Boolean(next.secure),
        httpOnly: Boolean(next.httpOnly),
        hostOnly: Boolean(next.hostOnly),
        workspaceName,
        collectionName,
      });
      setManagerCookies((prev) => {
        const filtered = prev.filter((entry) => entry.id !== saved.id);
        return [saved, ...filtered].sort((a, b) => `${a.domain}${a.path}${a.name}`.localeCompare(`${b.domain}${b.path}${b.name}`));
      });
      setIsCookieEditorOpen(false);
      setCookieDraft(EMPTY_COOKIE_DRAFT);
      setRawCookieString("");
    } finally {
      setIsManagerSaving(false);
    }
  }

  function buildResponseExportPayload() {
    return {
      status: response.status,
      badge: response.badge,
      statusText: response.statusText,
      duration: response.duration,
      size: response.size,
      headers: response.headers,
      cookies: response.cookies,
      body: response.body,
      rawBody: response.rawBody,
      isJson: response.isJson,
      meta: response.meta,
      savedAt: response.savedAt,
    };
  }

  async function handleCopyResponse() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildResponseExportPayload(), null, 2));
    } catch {
    }
  }

  async function handleSaveResponseFile() {
    try {
      const selected = await save({
        defaultPath: "response.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!selected || typeof selected !== "string") {
        return;
      }
      await exportResponseFile(selected, buildResponseExportPayload());
    } catch {
    }
  }

  function handleClearResponse() {
    onClearResponse?.();
  }

  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden border-0 bg-background p-0 shadow-none">
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
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden pr-1">
            {responseTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => onTabChange(tab)}
                className={cn("shrink-0 whitespace-nowrap px-1.5 py-1 text-[11px] text-muted-foreground transition-colors lg:px-2.5 lg:py-1.5 lg:text-[13px]", activeTab === tab && "text-foreground")}
              >
                {tab}
                {tab === "Headers" ? ` ${Object.keys(response.headers).length}` : ""}
                {tab === "Cookies" ? ` ${response.cookies.length}` : ""}
              </button>
            ))}
          </div>
          <div className="ml-1 flex shrink-0 items-center gap-0.5 text-muted-foreground">
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center transition-colors hover:text-foreground"
              onClick={handleCopyResponse}
              title="Copy response"
            >
              <Copy className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center transition-colors hover:text-foreground"
              onClick={handleSaveResponseFile}
              title="Save response to file"
            >
              <Download className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center transition-colors hover:text-red-400"
              onClick={handleClearResponse}
              title="Clear response"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
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
                  <div className="ml-2 flex w-48 items-center gap-1.5 rounded border border-border/20 bg-transparent py-[3px] pl-2.5 pr-1.5 normal-case tracking-normal transition-colors focus-within:border-primary/50 shadow-sm">
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
                      currentView === view && "text-foreground"
                    )}
                  >
                    {view}
                  </button>
                ))}
              </div>
            </div>
            {currentView === "Tree" && parsedJson !== null ? (
              <div className="thin-scrollbar h-full overflow-auto rounded border border-border/10 bg-transparent p-4 shadow-inner">
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
                language={currentView === "JSON" && isJson ? "json" : responseBodyLanguage}
                wrapLines
                placeholder="Response body will appear here"
              />
            )}
          </div>
        ) : null}

        {activeTab === "Headers" ? (
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Headers</div>
            <div className="thin-scrollbar min-h-0 overflow-auto bg-transparent">
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
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <Cookie className="h-3 w-3" />
                <span>Cookies</span>
              </div>
              <Button type="button" variant="secondary" size="sm" className="h-7 border border-border/35 bg-accent/30 text-[11px]" onClick={openManager}>
                Manage Cookies
              </Button>
            </div>
            <div className="thin-scrollbar min-h-0 overflow-auto bg-transparent">
              {responseCookiesPreview.length ? (
                responseCookiesPreview.map((cookie, index) => (
                  <div key={`${cookie.name}-${index}`} className="grid grid-cols-[220px_minmax(0,1fr)] border-b border-border/10 text-[12px]">
                    <div className="px-3 py-2 text-foreground">{cookie.name}</div>
                    <div className="px-3 py-2 text-muted-foreground">{cookie.value}</div>
                  </div>
                ))
              ) : (
                <div className="p-3 text-[12px] text-muted-foreground">No cookies were returned by this response.</div>
              )}
            </div>
          </div>
        ) : null}

        {activeTab === "Meta" ? (
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <ListTree className="h-3 w-3" />
              <span>Meta</span>
            </div>
            <div className="bg-transparent p-3 text-[12px] text-muted-foreground">
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

      {isManageOpen ? createPortal(
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/65 p-4" onMouseDown={(event) => event.target === event.currentTarget && closeManager()}>
          <div className="flex h-[430px] w-full max-w-4xl flex-col rounded-xl border border-border/30 bg-background/95 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-2xl font-semibold text-foreground">Manage Cookies</h3>
              <button type="button" onClick={closeManager} className="text-muted-foreground transition-colors hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Input
                value={manageSearch}
                onChange={(event) => setManageSearch(event.target.value)}
                placeholder="Search cookies"
                className="h-10 min-w-[260px] flex-1 border-border/35 bg-background/40 text-[12px]"
              />
              <Button type="button" variant="secondary" size="sm" className="h-10 border border-border/40 bg-accent/30" onClick={() => openCookieEditor()}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Cookie
              </Button>
              <Button type="button" variant="secondary" size="sm" className="h-10 border border-border/40 bg-accent/30" onClick={handleDeleteAllCookies}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete All
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border/20 bg-accent/10">
              <div className="grid grid-cols-[180px_minmax(0,1fr)_120px] border-b border-border/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <div>Domain</div>
                <div>Cookie</div>
                <div className="text-right">Actions</div>
              </div>
              <div className="h-full thin-scrollbar overflow-auto">
                {isManagerLoading ? (
                  <div className="p-3 text-[12px] text-muted-foreground">Loading cookies...</div>
                ) : filteredManagerCookies.length === 0 ? (
                  <div className="p-3 text-[12px] text-muted-foreground">No matching cookies.</div>
                ) : (
                  pagedManagerCookies.map((entry) => (
                    <div key={entry.id} className="grid grid-cols-[180px_minmax(0,1fr)_120px] items-center gap-2 border-b border-border/15 px-3 py-2 text-[12px] last:border-b-0">
                      <div className="truncate text-muted-foreground">{entry.domain || "-"}</div>
                      <div className="min-w-0 truncate text-foreground">{cookieToRawString(entry)}</div>
                      <div className="flex items-center justify-end gap-3 text-[11px]">
                        <button type="button" className="text-muted-foreground transition-colors hover:text-foreground" onClick={() => openCookieEditor(entry)}>
                          Edit
                        </button>
                        <button type="button" className="text-muted-foreground transition-colors hover:text-red-400" onClick={() => deleteCookie(entry.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-[12px] text-muted-foreground">
              <button
                type="button"
                className="inline-flex items-center gap-1 disabled:opacity-40"
                onClick={() => setManagerPage((prev) => Math.max(1, prev - 1))}
                disabled={managerPage <= 1 || filteredManagerCookies.length === 0}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <div>{filteredManagerCookies.length === 0 ? "0 of 0" : `${managerPage} of ${totalManagerPages}`}</div>
              <button
                type="button"
                className="inline-flex items-center gap-1 disabled:opacity-40"
                onClick={() => setManagerPage((prev) => Math.min(totalManagerPages, prev + 1))}
                disabled={managerPage >= totalManagerPages || filteredManagerCookies.length === 0}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="text-[12px] italic text-muted-foreground">* cookies are automatically sent with relevant requests</div>
              <Button type="button" size="sm" className="h-9" onClick={closeManager}>Done</Button>
            </div>
          </div>

          {isCookieEditorOpen ? (
            <div className="fixed inset-0 z-[330] flex items-center justify-center bg-transparent p-4" onMouseDown={(event) => event.target === event.currentTarget && closeCookieEditor()}>
              <div className="flex h-[430px] w-full max-w-4xl flex-col rounded-xl border border-border/30 bg-background p-5 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-xl font-semibold text-foreground">{cookieDraft.id ? "Edit Cookie" : "Add Cookie"}</h4>
                  <button type="button" onClick={closeCookieEditor} className="text-muted-foreground transition-colors hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mb-4 flex items-center gap-2 border-b border-border/20 pb-2 text-[12px]">
                  <button type="button" onClick={() => setCookieDraftMode("friendly")} className={cn("px-2 py-1", cookieDraftMode === "friendly" ? "bg-accent/40 text-foreground" : "text-muted-foreground")}>Friendly</button>
                  <button type="button" onClick={() => setCookieDraftMode("raw")} className={cn("px-2 py-1", cookieDraftMode === "raw" ? "bg-accent/40 text-foreground" : "text-muted-foreground")}>Raw</button>
                </div>

                {cookieDraftMode === "friendly" ? (
                  <div className="thin-scrollbar min-h-0 flex-1 overflow-auto">
                    <div className="grid gap-3 px-0.5 py-0.5">
                    <div className="grid grid-cols-2 gap-3">
                      <Input value={cookieDraft.name} onChange={(e) => setCookieDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Key" className={COOKIE_EDITOR_INPUT_CLASS} />
                      <Input value={cookieDraft.value} onChange={(e) => setCookieDraft((prev) => ({ ...prev, value: e.target.value }))} placeholder="Value" className={COOKIE_EDITOR_INPUT_CLASS} />
                      <Input value={cookieDraft.domain} onChange={(e) => setCookieDraft((prev) => ({ ...prev, domain: e.target.value }))} placeholder="Domain" className={COOKIE_EDITOR_INPUT_CLASS} />
                      <Input value={cookieDraft.path} onChange={(e) => setCookieDraft((prev) => ({ ...prev, path: e.target.value }))} placeholder="Path" className={COOKIE_EDITOR_INPUT_CLASS} />
                    </div>
                    <Input value={cookieDraft.expiresAt} onChange={(e) => setCookieDraft((prev) => ({ ...prev, expiresAt: e.target.value }))} placeholder="Expires" className={COOKIE_EDITOR_INPUT_CLASS} />
                    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 text-[12px] text-muted-foreground">
                      <Input value={cookieDraft.sameSite} onChange={(e) => setCookieDraft((prev) => ({ ...prev, sameSite: e.target.value }))} placeholder="SameSite" className={COOKIE_EDITOR_INPUT_CLASS} />
                      <label className="inline-flex items-center gap-1"><input type="checkbox" className="accent-primary" checked={cookieDraft.secure} onChange={(e) => setCookieDraft((prev) => ({ ...prev, secure: e.target.checked }))} />Secure</label>
                      <label className="inline-flex items-center gap-1"><input type="checkbox" className="accent-primary" checked={cookieDraft.httpOnly} onChange={(e) => setCookieDraft((prev) => ({ ...prev, httpOnly: e.target.checked }))} />HttpOnly</label>
                      <label className="inline-flex items-center gap-1"><input type="checkbox" className="accent-primary" checked={cookieDraft.hostOnly} onChange={(e) => setCookieDraft((prev) => ({ ...prev, hostOnly: e.target.checked }))} />HostOnly</label>
                    </div>
                    </div>
                  </div>
                ) : (
                  <div className="thin-scrollbar min-h-0 flex-1 overflow-auto">
                    <div className="grid gap-2 px-0.5 py-0.5">
                      <div className="text-[11px] text-muted-foreground">Raw Cookie String</div>
                      <Input value={rawCookieString} onChange={(event) => setRawCookieString(event.target.value)} placeholder="foo=bar; Expires=Tue, 19 Jan 2038 03:14:07 GMT; Domain=domain.com; Path=/" className={COOKIE_EDITOR_INPUT_CLASS} />
                    </div>
                  </div>
                )}

                <div className="mt-5 flex justify-end">
                  <Button type="button" className="h-9" onClick={saveCookieDraft} disabled={isManagerSaving}>
                    {isManagerSaving ? "Saving..." : "Done"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>,
        document.body
      ) : null}

    </Card>
  );
}
