import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button.jsx";
import { Input } from "@/components/ui/input.jsx";
import { cn } from "@/lib/utils.js";
import {
  clearCookieJar,
  deleteCookieJarEntry,
  getCookieJar,
  upsertCookieJarEntry,
} from "@/lib/http-client.js";

const MANAGER_PAGE_SIZE = 6;
const COOKIE_EDITOR_INPUT_CLASS =
  "h-10 border-border/35 bg-background/30 text-[12px] focus-visible:ring-0 focus-visible:border-primary";

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

export function parseSetCookieString(raw) {
  const parts = String(raw || "").split(";").map((item) => item.trim()).filter(Boolean);
  const [first, ...attrs] = parts;
  if (!first || !first.includes("=")) return null;
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
    if (key === "domain") { parsed.domain = value; parsed.hostOnly = false; }
    else if (key === "path") parsed.path = value || "/";
    else if (key === "expires") parsed.expiresAt = value;
    else if (key === "samesite") parsed.sameSite = value;
    else if (key === "secure") parsed.secure = true;
    else if (key === "httponly") parsed.httpOnly = true;
  }
  return parsed.name ? parsed : null;
}

export function cookieToRawString(cookie) {
  const segments = [`${cookie.name}=${cookie.value}`];
  if (cookie.domain) segments.push(`Domain=${cookie.domain}`);
  if (cookie.path) segments.push(`Path=${cookie.path}`);
  if (cookie.expiresAt) segments.push(`Expires=${cookie.expiresAt}`);
  if (cookie.sameSite) segments.push(`SameSite=${cookie.sameSite}`);
  if (cookie.secure) segments.push("Secure");
  if (cookie.httpOnly) segments.push("HttpOnly");
  return segments.join("; ");
}

export function CookieManagerModal({ open, onClose, workspaceName = "", collectionName = "" }) {
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
    if (!open) return;
    setManagerPage(1);
    setManageSearch("");
    setIsCookieEditorOpen(false);
    setCookieDraftMode("friendly");
    setCookieDraft(EMPTY_COOKIE_DRAFT);
    setRawCookieString("");
    loadManagerCookies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceName, collectionName]);

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
  }, [manageSearch]);

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
      /* no-op */
    }
  }

  async function handleDeleteAllCookies() {
    try {
      await clearCookieJar(workspaceName || null, collectionName || null);
      setManagerCookies([]);
    } catch {
      /* no-op */
    }
  }

  async function saveCookieDraft() {
    let next = { ...cookieDraft };
    if (cookieDraftMode === "raw") {
      const parsed = parseSetCookieString(rawCookieString);
      if (!parsed) return;
      next = { ...next, ...parsed };
    }
    if (!next.name.trim() || !next.domain.trim()) return;

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
        return [saved, ...filtered].sort((a, b) =>
          `${a.domain}${a.path}${a.name}`.localeCompare(`${b.domain}${b.path}${b.name}`),
        );
      });
      setIsCookieEditorOpen(false);
      setCookieDraft(EMPTY_COOKIE_DRAFT);
      setRawCookieString("");
    } finally {
      setIsManagerSaving(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center bg-black/65 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <div className="flex h-[430px] w-full max-w-4xl flex-col rounded-xl border border-border/30 bg-background/95 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-2xl font-semibold text-foreground">Manage Cookies</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
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
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-10 border border-border/40 bg-accent/30"
            onClick={() => openCookieEditor()}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Cookie
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-10 border border-border/40 bg-accent/30"
            onClick={handleDeleteAllCookies}
          >
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
                <div
                  key={entry.id}
                  className="grid grid-cols-[180px_minmax(0,1fr)_120px] items-center gap-2 border-b border-border/15 px-3 py-2 text-[12px] last:border-b-0"
                >
                  <div className="truncate text-muted-foreground">{entry.domain || "-"}</div>
                  <div className="min-w-0 truncate text-foreground">{cookieToRawString(entry)}</div>
                  <div className="flex items-center justify-end gap-3 text-[11px]">
                    <button
                      type="button"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => openCookieEditor(entry)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground transition-colors hover:text-red-400"
                      onClick={() => deleteCookie(entry.id)}
                    >
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
          <div>
            {filteredManagerCookies.length === 0 ? "0 of 0" : `${managerPage} of ${totalManagerPages}`}
          </div>
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
          <div className="text-[12px] italic text-muted-foreground">
            * cookies are automatically sent with relevant requests
          </div>
          <Button type="button" size="sm" className="h-9" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>

      {isCookieEditorOpen ? (
        <div
          className="fixed inset-0 z-[330] flex items-center justify-center bg-transparent p-4"
          onMouseDown={(event) => event.target === event.currentTarget && closeCookieEditor()}
        >
          <div className="flex h-[430px] w-full max-w-4xl flex-col rounded-xl border border-border/30 bg-background p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-xl font-semibold text-foreground">
                {cookieDraft.id ? "Edit Cookie" : "Add Cookie"}
              </h4>
              <button
                type="button"
                onClick={closeCookieEditor}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex items-center gap-2 border-b border-border/20 pb-2 text-[12px]">
              <button
                type="button"
                onClick={() => setCookieDraftMode("friendly")}
                className={cn("px-2 py-1", cookieDraftMode === "friendly" ? "bg-accent/40 text-foreground" : "text-muted-foreground")}
              >
                Friendly
              </button>
              <button
                type="button"
                onClick={() => setCookieDraftMode("raw")}
                className={cn("px-2 py-1", cookieDraftMode === "raw" ? "bg-accent/40 text-foreground" : "text-muted-foreground")}
              >
                Raw
              </button>
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
                    <label className="inline-flex items-center gap-1">
                      <input type="checkbox" className="accent-primary" checked={cookieDraft.secure} onChange={(e) => setCookieDraft((prev) => ({ ...prev, secure: e.target.checked }))} />
                      Secure
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input type="checkbox" className="accent-primary" checked={cookieDraft.httpOnly} onChange={(e) => setCookieDraft((prev) => ({ ...prev, httpOnly: e.target.checked }))} />
                      HttpOnly
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input type="checkbox" className="accent-primary" checked={cookieDraft.hostOnly} onChange={(e) => setCookieDraft((prev) => ({ ...prev, hostOnly: e.target.checked }))} />
                      HostOnly
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="thin-scrollbar min-h-0 flex-1 overflow-auto">
                <div className="grid gap-2 px-0.5 py-0.5">
                  <div className="text-[11px] text-muted-foreground">Raw Cookie String</div>
                  <Input
                    value={rawCookieString}
                    onChange={(event) => setRawCookieString(event.target.value)}
                    placeholder="foo=bar; Expires=Tue, 19 Jan 2038 03:14:07 GMT; Domain=domain.com; Path=/"
                    className={COOKIE_EDITOR_INPUT_CLASS}
                  />
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
    document.body,
  );
}
