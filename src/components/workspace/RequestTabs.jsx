import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pin, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils.js";
import { getMethodTone } from "@/lib/http-ui.js";
import { getUniqueName, REQUEST_MODES, REQUEST_MODE_OPTIONS } from "@/lib/workspace-store.js";

const REQUEST_RENAME_EVENT = "kivo:request-rename-focus";

function getRequestBaseNameByMode(mode) {
  switch (mode) {
    case REQUEST_MODES.SSE:
      return "SSE Request";
    case REQUEST_MODES.GRAPHQL:
      return "GraphQL Request";
    case REQUEST_MODES.GRPC:
      return "gRPC Request";
    case REQUEST_MODES.WEBSOCKET:
      return "WebSocket Request";
    case REQUEST_MODES.SOCKET_IO:
      return "Socket.IO Request";
    case REQUEST_MODES.HTTP:
    default:
      return "HTTP Request";
  }
}

export function RequestTabs({
  requestTabs,
  activeWorkspaceName,
  activeCollectionName,
  activeCollectionRequests,
  activeRequestName,
  selectRequest,
  closeRequestTab,
  createRequestRecord,
}) {
  const [createRequestMenu, setCreateRequestMenu] = useState(null);
  const createMenuRef = useRef(null);

  useEffect(() => {
    if (!createRequestMenu) return;

    function handlePointer(event) {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target)) {
        setCreateRequestMenu(null);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setCreateRequestMenu(null);
      }
    }

    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [createRequestMenu]);

  function openCreateRequestMenu(event) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setCreateRequestMenu({ x: rect.left, y: rect.bottom + 6 });
  }

  function handleCreateByMode(mode) {
    if (!activeWorkspaceName || !activeCollectionName) return;

    const existingNames = (Array.isArray(activeCollectionRequests) ? activeCollectionRequests : [])
      .map((request) => String(request?.name || ""))
      .filter(Boolean);
    const nextName = getUniqueName(getRequestBaseNameByMode(mode), existingNames);

    createRequestRecord(activeWorkspaceName, activeCollectionName, nextName, "", mode);
    window.dispatchEvent(new CustomEvent(REQUEST_RENAME_EVENT, {
      detail: {
        workspaceName: activeWorkspaceName,
        collectionName: activeCollectionName,
        requestName: nextName,
      },
    }));
    setCreateRequestMenu(null);
  }

  return (
    <div className="flex items-stretch overflow-x-auto border-b border-border/30 bg-card/28 px-1 thin-scrollbar lg:h-[44px]">
      {requestTabs.map((request) => (
        (() => {
          const isWebSocket = request.requestMode === REQUEST_MODES.WEBSOCKET;
          const isSse = request.requestMode === REQUEST_MODES.SSE;
          const isSocketIo = request.requestMode === REQUEST_MODES.SOCKET_IO;
          const isGraphql = request.requestMode === REQUEST_MODES.GRAPHQL
            || request.bodyType === "graphql";
          const isGrpc = request.requestMode === REQUEST_MODES.GRPC
            || Boolean(String(request.grpcMethodPath || "").trim())
            || Boolean(String(request.grpcProtoFilePath || "").trim())
            || (Array.isArray(request.headers) && request.headers.some((row) => String(row?.key || "").toLowerCase() === "content-type" && String(row?.value || "").toLowerCase().includes("application/grpc")));

          const displayMethod = isWebSocket
            ? "WS"
            : (isSse ? "SSE" : (isSocketIo ? "SIO" : (isGrpc ? "gRPC" : (isGraphql ? "GQL" : request.method))));
          const methodTone = isWebSocket
            ? "text-amber-800 bg-amber-500/20 dark:text-amber-300 dark:bg-amber-500/15"
            : (isSse
              ? "text-emerald-800 bg-emerald-500/20 dark:text-emerald-300 dark:bg-emerald-500/15"
              : (isSocketIo
                ? "text-orange-800 bg-orange-500/20 dark:text-orange-300 dark:bg-orange-500/15"
                : (isGrpc
              ? "text-cyan-800 bg-cyan-500/20 dark:text-cyan-300 dark:bg-cyan-500/15"
              : (isGraphql ? "text-fuchsia-800 bg-fuchsia-500/20 dark:text-fuchsia-300 dark:bg-fuchsia-500/15" : getMethodTone(request.method)))));

          return (
            <button
              key={request.name}
              type="button"
              onClick={() => selectRequest(activeWorkspaceName, activeCollectionName, request.name)}

              className={cn(
                "group relative flex min-w-[120px] items-center gap-2 border-r border-border/25 px-3 text-[12px] transition-colors lg:text-[13.5px]",
                request.name === activeRequestName
                  ? "bg-primary/10 text-foreground shadow-[inset_0_-2px_0_hsl(var(--primary))]"
                  : "bg-card/20 text-muted-foreground hover:bg-card/45 hover:text-foreground"
              )}
            >
              <span className={cn("px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] lg:text-[11px]", methodTone)}>{displayMethod}</span>
              {request.pinned ? <Pin className="h-3 w-3 shrink-0 text-primary" /> : null}
              <span className={cn("truncate", request.name === activeRequestName && "font-semibold")}>{request.name}</span>
              <span
                className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"

                onClick={(event) => {
                  event.stopPropagation();
                  closeRequestTab(request.name);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })()
      ))}

      <button
        type="button"
        onClick={openCreateRequestMenu}
        className={cn(
          "flex w-9 items-center justify-center text-muted-foreground hover:bg-card/45 hover:text-foreground transition-opacity",
          !activeWorkspaceName && "opacity-0 pointer-events-none"
        )}
      >
        <Plus className="h-4 w-4" />
      </button>

      {createRequestMenu ? createPortal(
        <div
          ref={createMenuRef}
          className="fixed z-[220] min-w-[220px] border border-border/60 bg-popover p-1 shadow-2xl"
          style={{ left: createRequestMenu.x, top: createRequestMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {REQUEST_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-foreground hover:bg-accent/45"
              onClick={() => handleCreateByMode(option.value)}
            >
              <Plus className="h-3.5 w-3.5" /> {option.label}
            </button>
          ))}
        </div>,
        document.body
      ) : null}
    </div>
  );
}