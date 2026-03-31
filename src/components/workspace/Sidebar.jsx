import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, Code2, Copy, FolderKanban, History, Pencil, Pin, Plus, Trash2 } from "lucide-react";

import { CodeEditor } from "@/components/workspace/CodeEditor.jsx";
import { Button } from "@/components/ui/button.jsx";
import { Card } from "@/components/ui/card.jsx";
import { Input } from "@/components/ui/input.jsx";
import { buildCurlCommand, codegenLanguageOptions, generateCodeSnippet, getMethodTone } from "@/lib/http-ui.js";
import { cn } from "@/lib/utils.js";

function getRequestRecord(workspaces, workspaceId, requestId) {
  return workspaces
    .find((workspace) => workspace.id === workspaceId)
    ?.requests?.find((request) => request.id === requestId) ?? null;
}

function formatHistoryUrl(url) {
  const value = String(url || "").trim();

  if (!value) {
    return "No URL";
  }

  const withoutProtocol = value.replace(/^https?:\/\//i, "");

  if (withoutProtocol.length <= 28) {
    return withoutProtocol;
  }

  const [host, ...segments] = withoutProtocol.split("/");
  const path = segments.join("/");

  if (!path) {
    return `${host.slice(0, 25)}...`;
  }

  const hostWithSlash = `${host}/`;
  const remaining = Math.max(2, 28 - hostWithSlash.length - 3);
  return `${hostWithSlash}${path.slice(0, remaining)}...`;
}

async function copyTextToClipboard(text) {
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
  }

  try {
    const element = document.createElement("textarea");
    element.value = text;
    element.setAttribute("readonly", "");
    element.style.position = "fixed";
    element.style.opacity = "0";
    document.body.appendChild(element);
    element.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(element);
    return copied;
  } catch {
    return false;
  }
}

function WorkspaceForm({ initialValues, submitLabel, onSubmit, onCancel }) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");

  function handleSubmit(event) {
    event.preventDefault();

    if (!name.trim()) {
      return;
    }

    onSubmit({ name: name.trim(), description: description.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 border border-border/35 bg-card/45 p-3">
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Workspace name" />
      <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" className="h-8 px-3 text-[11px]">
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-3 text-[11px]" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RequestRenameField({ value, onSubmit, onCancel }) {
  const [name, setName] = useState(value);

  return (
    <form
      className="flex items-center gap-2 px-2 py-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) {
          onSubmit(name.trim());
        }
      }}
    >
      <Input className="h-7 text-[12px]" autoFocus value={name} onChange={(event) => setName(event.target.value)} onBlur={() => onCancel()} />
    </form>
  );
}

function GenerateCodeModal({ request, language, onLanguageChange, onClose }) {
  const [copied, setCopied] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const languageMenuRef = useRef(null);
  const selectedLanguage = useMemo(
    () => codegenLanguageOptions.find((option) => option.value === language) ?? codegenLanguageOptions[0],
    [language]
  );
  const codeSnippet = useMemo(
    () => (request ? generateCodeSnippet(request, language) : ""),
    [language, request]
  );

  useEffect(() => {
    if (!request) {
      return undefined;
    }

    setCopied(false);

    function handleEscape(event) {
      if (event.key === "Escape") {
        if (languageOpen) {
          setLanguageOpen(false);
          return;
        }

        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [language, languageOpen, onClose, request]);

  useEffect(() => {
    if (!languageOpen) {
      return undefined;
    }

    function handlePointer(event) {
      if (languageMenuRef.current && !languageMenuRef.current.contains(event.target)) {
        setLanguageOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointer);

    return () => {
      window.removeEventListener("mousedown", handlePointer);
    };
  }, [languageOpen]);

  if (!request) {
    return null;
  }

  async function handleCopy() {
    const didCopy = await copyTextToClipboard(codeSnippet);
    setCopied(didCopy);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <Card className="grid h-[min(720px,92vh)] w-[min(920px,92vw)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-4 border border-border/50 bg-card/95 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Generate Code</div>
            <div className="mt-1 truncate text-[18px] font-semibold text-foreground">{request.name}</div>
          </div>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-3" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="grid gap-2 sm:max-w-[260px]">
          <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Language</label>
          <div ref={languageMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setLanguageOpen((current) => !current)}
              className="flex h-9 w-full items-center justify-between border border-border/40 bg-background/70 px-3 text-[12px] text-foreground outline-none transition-colors hover:bg-accent/35 focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span>{selectedLanguage.label}</span>
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", languageOpen && "rotate-180")} />
            </button>

            {languageOpen ? (
              <div className="thin-scrollbar absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-64 overflow-auto border border-border/60 bg-popover shadow-2xl">
                {codegenLanguageOptions.map((option) => {
                  const active = option.value === language;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onLanguageChange(option.value);
                        setLanguageOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-left text-[12px] transition-colors",
                        active ? "bg-accent/55 text-foreground" : "text-foreground hover:bg-accent/35"
                      )}
                    >
                      <span>{option.label}</span>
                      {active ? <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Selected</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <CodeEditor value={codeSnippet} readOnly language="text" className="border border-border/30" />

        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] text-muted-foreground">{copied ? "Code copied to clipboard." : "Choose a language and copy the generated snippet."}</div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="h-9 px-4 text-[12px]" onClick={handleCopy}>
              {copied ? "Copied" : "Copy Code"}
            </Button>
            <Button type="button" className="h-9 px-4 text-[12px]" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </Card>
    </div>,
    document.body
  );
}

function RequestContextMenu({ menu, onGenerateCode, onCopyCurl, onRename, onDuplicate, onTogglePin, onDelete, onClose }) {
  useEffect(() => {
    if (!menu) {
      return undefined;
    }

    function handlePointer() {
      onClose();
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menu, onClose]);

  if (!menu) {
    return null;
  }

  return createPortal(
    <div
      className="fixed z-[210] min-w-[180px] border border-border/60 bg-popover p-1 shadow-2xl"
      style={{ left: menu.x, top: menu.y }}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-foreground hover:bg-accent/45" onClick={() => { onGenerateCode(menu.workspaceId, menu.requestId); onClose(); }}>
        <Code2 className="h-3.5 w-3.5" />
        Generate Code
      </button>
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-foreground hover:bg-accent/45" onClick={() => { onCopyCurl(menu.workspaceId, menu.requestId); onClose(); }}>
        <Copy className="h-3.5 w-3.5" />
        Copy as cURL
      </button>
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-foreground hover:bg-accent/45" onClick={() => { onTogglePin(menu.workspaceId, menu.requestId); onClose(); }}>
        <Pin className="h-3.5 w-3.5" />
        {menu.pinned ? "Unpin" : "Pin"}
      </button>
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-foreground hover:bg-accent/45" onClick={() => { onRename(menu.workspaceId, menu.requestId); onClose(); }}>
        <Pencil className="h-3.5 w-3.5" />
        Rename
      </button>
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-foreground hover:bg-accent/45" onClick={() => { onDuplicate(menu.workspaceId, menu.requestId); onClose(); }}>
        <Copy className="h-3.5 w-3.5" />
        Duplicate
      </button>
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-red-500 hover:bg-accent/45" onClick={() => { onDelete(menu.workspaceId, menu.requestId); onClose(); }}>
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>
    </div>,
    document.body
  );
}

function RequestsView({
  workspaces,
  activeWorkspaceId,
  activeRequestId,
  onSelectWorkspace,
  onSelectRequest,
  onCreateWorkspace,
  onCreateRequest,
  onRenameWorkspace,
  onDeleteWorkspace,
  onRenameRequest,
  onDeleteRequest,
  onDuplicateRequest,
  onTogglePinRequest
}) {
  const [showWorkspaceForm, setShowWorkspaceForm] = useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState(null);
  const [editingRequestId, setEditingRequestId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [codegenTarget, setCodegenTarget] = useState(null);
  const [codegenLanguage, setCodegenLanguage] = useState("shell");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState(() => workspaces.map((workspace) => workspace.id));
  const codegenRequest = useMemo(
    () => (codegenTarget ? getRequestRecord(workspaces, codegenTarget.workspaceId, codegenTarget.requestId) : null),
    [codegenTarget, workspaces]
  );

  useEffect(() => {
    setExpandedWorkspaceIds((current) => {
      const valid = current.filter((id) => workspaces.some((workspace) => workspace.id === id));
      const next = new Set(valid);

      if (activeWorkspaceId) {
        next.add(activeWorkspaceId);
      }

      return Array.from(next);
    });
  }, [activeWorkspaceId, workspaces]);

  useEffect(() => {
    if (!codegenTarget || codegenRequest) {
      return;
    }

    setCodegenTarget(null);
  }, [codegenRequest, codegenTarget]);

  useEffect(() => {
    if (!feedbackMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => setFeedbackMessage(""), 2000);
    return () => window.clearTimeout(timer);
  }, [feedbackMessage]);

  function openRequestContextMenu(event, workspaceId, request) {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, workspaceId, requestId: request.id, pinned: Boolean(request.pinned) });
  }

  function startRenameRequest(workspaceId, requestId) {
    onSelectRequest(workspaceId, requestId);
    setEditingRequestId(requestId);
  }

  function showFeedback(message) {
    setFeedbackMessage(message);
  }

  async function handleCopyCurl(workspaceId, requestId) {
    const request = getRequestRecord(workspaces, workspaceId, requestId);

    if (!request) {
      return;
    }

    const didCopy = await copyTextToClipboard(buildCurlCommand(request));

    if (didCopy) {
      showFeedback(`Copied ${request.name} as cURL.`);
    }
  }

  function handleGenerateCode(workspaceId, requestId) {
    const request = getRequestRecord(workspaces, workspaceId, requestId);

    if (!request) {
      return;
    }

    onSelectRequest(workspaceId, requestId);
    setCodegenLanguage("shell");
    setCodegenTarget({ workspaceId, requestId });
  }

  function handleTogglePin(workspaceId, requestId) {
    const request = getRequestRecord(workspaces, workspaceId, requestId);

    if (!request) {
      return;
    }

    onTogglePinRequest(workspaceId, requestId);
    showFeedback(request.pinned ? `Unpinned ${request.name}.` : `Pinned ${request.name}.`);
  }

  function toggleWorkspace(workspaceId) {
    setExpandedWorkspaceIds((current) =>
      current.includes(workspaceId) ? current.filter((id) => id !== workspaceId) : [...current, workspaceId]
    );
  }

  return (
    <div className="min-h-0 space-y-3 overflow-hidden">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:text-[12px]">
        <span>Workspaces</span>
        <button className="p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => { setEditingWorkspaceId(null); setShowWorkspaceForm(true); }} type="button">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {showWorkspaceForm ? (
        <WorkspaceForm
          submitLabel="Create"
          onSubmit={(values) => {
            onCreateWorkspace(values);
            setShowWorkspaceForm(false);
          }}
          onCancel={() => setShowWorkspaceForm(false)}
        />
      ) : null}

      <div className="thin-scrollbar space-y-3 overflow-auto pr-1">
        {workspaces.length ? workspaces.map((workspace) => {
          const activeWorkspace = workspace.id === activeWorkspaceId;
          const editingWorkspace = editingWorkspaceId === workspace.id;
          const expandedWorkspace = expandedWorkspaceIds.includes(workspace.id);

          return (
            <div key={workspace.id} className="space-y-2 border border-border/30 bg-card/24 p-3">
              {editingWorkspace ? (
                <WorkspaceForm
                  initialValues={workspace}
                  submitLabel="Save"
                  onSubmit={(values) => {
                    onRenameWorkspace(workspace.id, values);
                    setEditingWorkspaceId(null);
                  }}
                  onCancel={() => setEditingWorkspaceId(null)}
                />
              ) : (
                <div className="group flex items-start gap-2">
                  <button type="button" onClick={() => toggleWorkspace(workspace.id)} className="mt-0.5 p-0.5 text-muted-foreground hover:text-foreground">
                    {expandedWorkspace ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                  <button type="button" onClick={() => onSelectWorkspace(workspace.id)} className="flex min-w-0 flex-1 items-start text-left">
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate text-[12.5px] font-medium lg:text-[14px]", activeWorkspace ? "text-foreground" : "text-foreground/90")}>{workspace.name}</div>
                      {workspace.description ? <div className="mt-0.5 text-[11px] text-muted-foreground lg:text-[12px]">{workspace.description}</div> : null}
                    </div>
                  </button>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button type="button" className="p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setEditingWorkspaceId(workspace.id)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => onDeleteWorkspace(workspace.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {expandedWorkspace ? (
                <div className="space-y-1 pl-5">
                  {workspace.requests.map((request) => {
                    const activeRequest = request.id === activeRequestId;
                    const editingRequest = editingRequestId === request.id;

                    return editingRequest ? (
                      <RequestRenameField
                        key={request.id}
                        value={request.name}
                        onSubmit={(name) => {
                          onRenameRequest(workspace.id, request.id, name);
                          setEditingRequestId(null);
                        }}
                        onCancel={() => setEditingRequestId(null)}
                      />
                    ) : (
                      <div
                        key={request.id}
                        className={cn(
                          "group flex items-center gap-2 px-2 py-1.5 text-[12px] transition-colors",
                          activeRequest
                            ? "bg-primary/10 text-foreground shadow-[inset_2px_0_0_hsl(var(--primary))]"
                            : "text-muted-foreground hover:bg-accent/35 hover:text-foreground"
                        )}
                        onContextMenu={(event) => openRequestContextMenu(event, workspace.id, request)}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectRequest(workspace.id, request.id)}
                          onDoubleClick={() => startRenameRequest(workspace.id, request.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span className={cn("px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] lg:text-[11px]", getMethodTone(request.method).split(" ")[0])}>{request.method}</span>
                          {request.pinned ? <Pin className="h-3 w-3 shrink-0 text-primary" /> : null}
                          <span className={cn("truncate lg:text-[13px]", activeRequest && "font-semibold")}>{request.name}</span>
                        </button>
                        <button
                          type="button"
                          className="p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
                          onClick={() => onDeleteRequest(workspace.id, request.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  <button type="button" onClick={() => onCreateRequest(workspace.id)} className="flex items-center gap-1 px-2 py-1.5 text-[12px] text-muted-foreground hover:bg-accent/35 hover:text-foreground">
                    <Plus className="h-3.5 w-3.5" />
                    New request
                  </button>
                </div>
              ) : null}
            </div>
          );
        }) : (
          <div className="border border-border/30 bg-card/24 p-3 text-[12px] text-muted-foreground">
            Create a workspace to start organizing requests.
          </div>
        )}
      </div>

      <RequestContextMenu
        menu={contextMenu}
        onGenerateCode={handleGenerateCode}
        onCopyCurl={handleCopyCurl}
        onRename={startRenameRequest}
        onDuplicate={onDuplicateRequest}
        onTogglePin={handleTogglePin}
        onDelete={onDeleteRequest}
        onClose={() => setContextMenu(null)}
      />

      {feedbackMessage ? (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-40 -translate-x-1/2 border border-border/50 bg-card/95 px-3 py-2 text-[12px] text-foreground shadow-xl">
          {feedbackMessage}
        </div>
      ) : null}

      <GenerateCodeModal
        request={codegenRequest}
        language={codegenLanguage}
        onLanguageChange={setCodegenLanguage}
        onClose={() => setCodegenTarget(null)}
      />
    </div>
  );
}

function HistoryView({ workspaces, onSelectRequest, onClearAllHistory, onDeleteHistoryEntry }) {
  const entries = useMemo(
    () => workspaces
      .flatMap((workspace) =>
        (workspace.history ?? []).map((entry) => ({
          ...entry,
          workspaceId: workspace.id,
          workspaceName: workspace.name
        }))
      )
      .sort((left, right) => (right.savedAtTs ?? 0) - (left.savedAtTs ?? 0)),
    [workspaces]
  );

  return (
    <div className="min-h-0 space-y-3 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">History</div>
        {entries.length ? (
          <button
            type="button"
            onClick={onClearAllHistory}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear all
          </button>
        ) : null}
      </div>
      <div className="thin-scrollbar overflow-auto pr-1">
        {entries.length ? (
          <div className="space-y-2">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelectRequest(entry.workspaceId, entry.requestId)}
                className="group grid w-full gap-1 border border-border/30 bg-card/24 px-3 py-2 text-left hover:bg-accent/30"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-[12px] font-medium text-foreground">{entry.requestName}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteHistoryEntry(entry.workspaceId, entry.id);
                      }}
                      className="p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <span className={cn("text-[10px] font-semibold uppercase tracking-[0.14em]", getMethodTone(entry.method).split(" ")[0])}>{entry.method}</span>
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2 text-[10px] tracking-[0.14em] text-muted-foreground">
                  <span className="shrink-0 bg-secondary/45 px-1.5 py-0.5 text-foreground">{entry.workspaceName}</span>
                  <span className="min-w-0 truncate normal-case">{formatHistoryUrl(entry.url)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                  <span>{entry.status} {entry.statusText}</span>
                  <span>{entry.duration}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">{entry.savedAt}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="border border-border/30 bg-card/24 p-3 text-[12px] text-muted-foreground">Run a request to start building local history.</div>
        )}
      </div>
    </div>
  );
}

export function Sidebar({
  iconSrc,
  sidebarTab,
  collapsed,
  workspaces,
  activeWorkspaceId,
  activeRequestId,
  onSidebarTabChange,
  onSelectWorkspace,
  onSelectRequest,
  onCreateWorkspace,
  onCreateRequest,
  onRenameWorkspace,
  onDeleteWorkspace,
  onRenameRequest,
  onDeleteRequest,
  onDuplicateRequest,
  onTogglePinRequest,
  onClearAllHistory,
  onDeleteHistoryEntry
}) {
  return (
    <aside
      className={cn(
        "grid h-full min-h-0 overflow-hidden border-r border-border/30 bg-border/20",
        collapsed ? "grid-cols-[52px]" : "grid-cols-[52px_minmax(0,1fr)] gap-px"
      )}
    >
      <Card className="flex min-h-0 flex-col items-center gap-2 bg-[hsl(var(--sidebar))]/96 p-2.5 shadow-none">
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden bg-card/85">
          <img src={iconSrc} alt="Kivo" className="h-6 w-6 object-contain" />
        </div>
        <Button variant={sidebarTab === "requests" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => onSidebarTabChange("requests")}>
          <FolderKanban className="h-4 w-4" />
        </Button>
        <Button variant={sidebarTab === "history" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => onSidebarTabChange("history")}>
          <History className="h-4 w-4" />
        </Button>
        <div className="mt-auto" />
      </Card>

      {!collapsed ? (
        <Card className="flex min-h-0 flex-col gap-3 overflow-hidden bg-[hsl(var(--sidebar))]/98 px-4 py-3 text-[12px] text-[hsl(var(--sidebar-foreground))] shadow-none">
          {sidebarTab === "requests" ? (
            <RequestsView
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              activeRequestId={activeRequestId}
              onSelectWorkspace={onSelectWorkspace}
              onSelectRequest={onSelectRequest}
              onCreateWorkspace={onCreateWorkspace}
              onCreateRequest={onCreateRequest}
              onRenameWorkspace={onRenameWorkspace}
              onDeleteWorkspace={onDeleteWorkspace}
              onRenameRequest={onRenameRequest}
              onDeleteRequest={onDeleteRequest}
              onDuplicateRequest={onDuplicateRequest}
              onTogglePinRequest={onTogglePinRequest}
            />
          ) : (
            <HistoryView
              workspaces={workspaces}
              onSelectRequest={onSelectRequest}
              onClearAllHistory={onClearAllHistory}
              onDeleteHistoryEntry={onDeleteHistoryEntry}
            />
          )}
        </Card>
      ) : null}
    </aside>
  );
}
