import { useEffect, useState } from "react";
import {
  BookOpen, Code2, FileJson, FlaskConical, FolderOpen, Globe, Layers,
  Save, Share2, RotateCcw, ChevronRight, Eye, EyeOff, RefreshCw
} from "lucide-react";

import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";

import { Button } from "@/components/ui/button.jsx";
import { Card } from "@/components/ui/card.jsx";
import { Input } from "@/components/ui/input.jsx";
import { EnvHighlightInput } from "@/components/ui/EnvHighlightInput.jsx";
import { EnvEditor } from "@/components/workspace/EnvEditor.jsx";
import { OAuth2Panel } from "@/components/workspace/OAuth2Panel.jsx";
import { useCollectionConfig } from "@/hooks/use-collection-config.js";
import { useEnv } from "@/hooks/use-env.js";
import { cn } from "@/lib/utils.js";

const TABS = [
  { id: "Overview", label: "Overview" },
  { id: "Headers", label: "Headers" },
  { id: "Environments", label: "Environments" },
  { id: "Auth", label: "Auth" },
];

function createHeaderRow() {
  return { id: `hdr-${Math.random().toString(36).slice(2, 8)}`, key: "", value: "", enabled: true };
}

function HeadersTable({ rows, onChange, onDelete }) {
  function update(id, field, value) {
    onChange(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  return (
    <div className="flex flex-col">
      { }
      <div className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)_44px] border-b border-border/10 bg-accent/20 px-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <div className="py-2.5" />
        <div className="py-2.5 font-semibold">Header Name</div>
        <div className="py-2.5 font-semibold">Header Value</div>
        <div className="py-2.5" />
      </div>

      {rows.map((row, idx) => (
        <div
          key={row.id}
          className={cn(
            "group grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)_44px] items-center border-b border-border/5 transition-colors hover:bg-accent/10 px-2"
          )}
        >
          <label className="flex h-10 items-center justify-center cursor-pointer">
            <input
              type="checkbox"
              checked={row.enabled}
              onChange={(e) => update(row.id, "enabled", e.target.checked)}
              className="accent-primary w-3.5 h-3.5 opacity-70 transition-opacity hover:opacity-100"
            />
          </label>
          <Input
            value={row.key}
            onChange={(e) => update(row.id, "key", e.target.value)}
            placeholder="e.g. Authorization"
            className="h-10 border-0 bg-transparent text-[13px] font-medium shadow-none focus-visible:ring-0 focus-visible:bg-accent/20 rounded-none px-2"
          />
          <Input
            value={row.value}
            onChange={(e) => update(row.id, "value", e.target.value)}
            placeholder="e.g. Bearer {{token}}"
            className="h-10 border-0 bg-transparent text-[13px] shadow-none focus-visible:ring-0 font-mono text-muted-foreground focus-visible:text-foreground focus-visible:bg-accent/20 rounded-none px-2"
          />
          <button
            type="button"
            onClick={() => {
              const nextRows = rows.filter((r) => r.id !== row.id);
              onChange?.(nextRows);
              onDelete?.(nextRows);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all justify-self-center"
          >
            âœ•
          </button>
        </div>
      ))}

      <div className="p-2">
        <button
          type="button"
          onClick={() => onChange([...rows, createHeaderRow()])}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
        >
          <span className="text-lg leading-none mb-0.5">+</span> Add Header
        </button>
      </div>
    </div>
  );
}

function OverviewTab({ workspace, collection, storagePath, envVars, onNavigate }) {

  const isWindowsPath = /^[A-Za-z]:[/\\]/.test(storagePath ?? "");
  const sep = isWindowsPath ? "\\" : "/";
  const collectionPath =
    storagePath && workspace && collection
      ? [storagePath, workspace.name, "collections", collection.name].join(sep)
      : "Loadingâ€¦";

  const globalCount = envVars?.workspace?.length ?? 0;
  const collectionCount = envVars?.collection?.length ?? 0;
  const requestCount = collection?.requests?.length ?? 0;

  const [appVersion, setAppVersion] = useState("...");
  const [updaterStatus, setUpdaterStatus] = useState("idle");

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => { });
    
    const handleStatusChange = (e) => setUpdaterStatus(e.detail.status);
    window.addEventListener("updater-status-change", handleStatusChange);
    window.dispatchEvent(new CustomEvent("updater-status-request"));
    
    return () => window.removeEventListener("updater-status-change", handleStatusChange);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-8 gap-6 max-w-4xl">
      <div className="mb-2">
        <h2 className="text-xl font-semibold text-foreground tracking-tight">Collection Overview</h2>
        <p className="text-[13px] text-muted-foreground mt-1">Manage everything across all requests in {collection?.name}.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        { }
        <Card
          className="group relative overflow-hidden border-border/20 bg-background/50 p-6 shadow-sm transition-all hover:bg-card/80 hover:shadow-md cursor-pointer"
          onClick={() => onNavigate("Environments", "collection")}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent pointer-events-none" />
          <div className="relative z-10 flex flex-col h-full">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-green-500 shadow-inner">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-[14px]">Environments</h3>
                <p className="text-[11px] text-muted-foreground">Global & Collection variables</p>
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-2">
              <div
                className="flex items-center justify-between rounded-lg bg-accent/30 px-3 py-2 text-[12px] transition-colors hover:bg-accent/50"
                onClick={(e) => { e.stopPropagation(); onNavigate("Environments", "collection"); }}
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FolderOpen className="h-4 w-4 text-blue-400" /> Collection Scope
                </div>
                <span className="font-medium text-foreground">{collectionCount}</span>
              </div>
              <div
                className="flex items-center justify-between rounded-lg bg-accent/30 px-3 py-2 text-[12px] transition-colors hover:bg-accent/50"
                onClick={(e) => { e.stopPropagation(); onNavigate("Environments", "workspace"); }}
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-4 w-4 text-teal-400" /> Workspace Global
                </div>
                <span className="font-medium text-foreground">{globalCount}</span>
              </div>
            </div>
          </div>
        </Card>

        { }
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col flex-1 border-border/20 bg-background/50 p-5 shadow-sm transition-all hover:bg-card/80">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                <FolderOpen className="h-4 w-4" />
              </div>
              <h3 className="font-semibold text-foreground text-[13px]">Storage Path</h3>
            </div>
            <div className="mt-auto flex items-center justify-between rounded-md bg-accent/40 px-3 py-2.5 outline outline-1 outline-border/20 group-hover:bg-accent/60 transition-colors cursor-pointer" onClick={() => invoke("reveal_item", { workspaceName: workspace?.name, collectionName: collection?.name }).catch(console.error)}>
              <p className="font-mono text-[11px] text-muted-foreground truncate w-full group-hover:text-foreground transition-colors" title={collectionPath}>
                {collectionPath}
              </p>
              <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 ml-2 whitespace-nowrap">Open</div>
            </div>
          </Card>

          <Card className="flex flex-col flex-1 border-border/20 bg-background/50 p-5 shadow-sm transition-all hover:bg-card/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                  <Layers className="h-4 w-4" />
                </div>
                <h3 className="font-semibold text-foreground text-[13px]">Total Requests</h3>
              </div>
              <div className="text-2xl font-bold tracking-tight text-foreground/90">{requestCount}</div>
            </div>
          </Card>
          <Card className="flex flex-col flex-1 border-border/20 bg-background/50 p-5 shadow-sm transition-all hover:bg-card/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <RefreshCw className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-[13px]">Software Update</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Current Version: v{appVersion}</p>
                </div>
              </div>
              {updaterStatus === "available" ? (
                <Button
                  size="sm"
                  className="h-8 text-[11.5px] px-4 gap-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-500 font-medium rounded shadow-none border-0"
                  onClick={() => window.dispatchEvent(new CustomEvent('manual-update-install'))}
                >
                  <RefreshCw className="h-3 w-3" />
                  Restart to Update
                </Button>
              ) : updaterStatus === "downloading" ? (
                <Button variant="secondary" size="sm" disabled className="h-8 text-[11.5px] px-4 gap-2">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Updating...
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 text-[11.5px] border-border/40 hover:bg-accent/50 transition-colors"
                  onClick={() => window.dispatchEvent(new CustomEvent('manual-update-check'))}
                >
                  Check for Updates
                </Button>
              )}
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}

function HeadersTab({ config, updateConfig, onSave, onReset, isDirty, isSaving }) {
  const rows = (config.defaultHeaders ?? []).map((h, i) => ({
    ...h,
    id: h.id ?? `hdr-${i}`,
  }));

  return (
    <div className="flex flex-col h-full min-h-0 p-8 gap-6 max-w-4xl">
      <div>
        <h3 className="text-lg font-semibold text-foreground tracking-tight">Default Headers</h3>
        <p className="text-[13px] text-muted-foreground mt-1">
          Automatically attached to every request in this collection. Per-request headers will override these.
        </p>
      </div>
      <Card className="flex flex-col gap-4 border-border/20 bg-background/40 p-1 shadow-sm overflow-hidden flex-1 min-h-0">
        <HeadersTable
          rows={rows}
          onChange={(nextRows) => updateConfig({ defaultHeaders: nextRows })}
          onDelete={(nextRows) => onSave({ defaultHeaders: nextRows })}
        />
      </Card>
      <div className="flex items-center justify-between border-t border-border/10 pt-4 shrink-0">
        <div className="flex items-center gap-3 text-sm">
          {isDirty && (
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-amber-500">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              Unsaved changes
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button className="h-9 px-6 text-[13px] gap-2 shadow-md transition-transform active:scale-95" onClick={() => onSave()} disabled={isSaving || !isDirty}>
            <Save className="h-4 w-4" />
            {isSaving ? "Savingâ€¦" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const AUTH_MODES = [
  { value: "none", label: "No Auth" },
  { value: "basic", label: "Basic Auth" },
  { value: "bearer", label: "Bearer Token" },
  { value: "apikey", label: "API Key" },
  { value: "oauth2", label: "OAuth 2.0" },
];

const API_KEY_IN_OPTIONS = [
  { value: "header", label: "Header" },
  { value: "query", label: "Query Param" },
];

function AuthTab({ workspace, collection, config, updateConfig, onSave, onReset, isDirty, isSaving, envVars }) {
  const auth = config.defaultAuth ?? { type: "none", token: "" };
  const [showToken, setShowToken] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 p-8">
      <div>
        <h3 className="text-lg font-semibold text-foreground tracking-tight">Collection Auth</h3>
        <p className="text-[13px] text-muted-foreground mt-1">
          Requests set to <em>"Inherit"</em> will use this authentication.
        </p>
      </div>

      <Card className={cn("flex min-h-0 flex-col gap-5 border-border/20 bg-background/40 p-5 shadow-sm", auth.type === "oauth2" ? "flex-1 overflow-hidden p-0" : "")}>
        <div className="grid gap-3 text-left w-full">
          <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Authentication Type</label>
          <div className="mx-5 mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-border/20 bg-accent/30 p-1 w-fit">
            {AUTH_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => updateConfig({ defaultAuth: { ...auth, type: m.value } })}
                className={cn(
                  "px-4 py-1.5 rounded-md text-[12px] font-medium transition-all",
                  auth.type === m.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {auth.type === "bearer" && (
          <div className="grid gap-2 text-left w-full" style={{ animation: "fadeIn 0.2s ease-out" }}>
            <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Access Token</label>
            <div className="relative">
              <EnvHighlightInput
                value={auth.token ?? ""}
                onValueChange={(val) => updateConfig({ defaultAuth: { ...auth, token: val } })}
                placeholder="eyJhbG..."
                type={showToken ? "text" : "password"}
                inputClassName="h-10 border-border/40 bg-accent/20 font-mono text-[12px] shadow-inner focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/20 pr-10"
                envVars={envVars}
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground z-10"
              >
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Supports {'{{variables}}'} resolution at runtime.</p>
          </div>
        )}

        {auth.type === "basic" && (
          <div className="grid gap-4 text-left w-full" style={{ animation: "fadeIn 0.2s ease-out" }}>
            <div className="grid gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Username</label>
              <EnvHighlightInput
                value={auth.username ?? ""}
                onValueChange={(val) => updateConfig({ defaultAuth: { ...auth, username: val } })}
                placeholder="Enter username"
                inputClassName="h-10 border-border/40 bg-accent/20 font-mono text-[12px] shadow-inner focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/20"
                envVars={envVars}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Password</label>
              <div className="relative">
                <EnvHighlightInput
                  value={auth.password ?? ""}
                  onValueChange={(val) => updateConfig({ defaultAuth: { ...auth, password: val } })}
                  placeholder="Enter password"
                  type={showPassword ? "text" : "password"}
                  inputClassName="h-10 border-border/40 bg-accent/20 font-mono text-[12px] shadow-inner focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/20 pr-10"
                  envVars={envVars}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground z-10"
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Generates <code className="text-[10px] bg-primary/10 text-primary px-1 py-0.5 rounded-sm">Authorization: Basic base64(user:pass)</code>. Supports {'{{variables}}'}.
            </p>
          </div>
        )}

        {auth.type === "apikey" && (
          <div className="grid gap-4 text-left w-full" style={{ animation: "fadeIn 0.2s ease-out" }}>
            <div className="grid gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Key Name</label>
              <EnvHighlightInput
                value={auth.apiKeyName ?? ""}
                onValueChange={(val) => updateConfig({ defaultAuth: { ...auth, apiKeyName: val } })}
                placeholder="e.g. X-API-Key"
                inputClassName="h-10 border-border/40 bg-accent/20 font-mono text-[12px] shadow-inner focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/20"
                envVars={envVars}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Key Value</label>
              <EnvHighlightInput
                value={auth.apiKeyValue ?? ""}
                onValueChange={(val) => updateConfig({ defaultAuth: { ...auth, apiKeyValue: val } })}
                placeholder="Enter API key value"
                inputClassName="h-10 border-border/40 bg-accent/20 font-mono text-[12px] shadow-inner focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/20"
                envVars={envVars}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Add To</label>
              <div className="mx-5 mt-5 flex flex-wrap items-center gap-2 rounded-lg border border-border/20 bg-accent/30 p-1 w-fit">
                {API_KEY_IN_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateConfig({ defaultAuth: { ...auth, apiKeyIn: opt.value } })}
                    className={cn(
                      "px-4 py-1.5 rounded-md text-[12px] font-medium transition-all",
                      (auth.apiKeyIn ?? "header") === opt.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {(auth.apiKeyIn ?? "header") === "query"
                ? "Key-value pair will be appended to the URL query string."
                : "Key-value pair will be sent as an HTTP header."}
              {" "}Supports {'{{variables}}'}.
            </p>
          </div>
        )}

        {auth.type === "oauth2" && (
          <OAuth2Panel
            auth={auth}
            envVars={envVars}
            workspaceName={workspace?.name}
            collectionName={collection?.name}
            scopeLabel="collection"
            onChange={(nextAuth) => updateConfig({ defaultAuth: nextAuth })}
            onPersist={async (nextAuth) => {
              const nextConfig = { ...config, defaultAuth: nextAuth };
              updateConfig(nextConfig);
              await onSave(nextConfig);
            }}
          />
        )}

        {auth.type === "none" && (
          <p className="px-5 pb-5 text-[12px] text-muted-foreground/70">No authentication will be applied to inherited requests.</p>
        )}
      </Card>
      <div className="flex items-center justify-between border-t border-border/10 pt-6">
        <div className="flex items-center gap-3 text-sm">
          {isDirty && (
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-amber-500">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              Unsaved changes
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button className="h-9 px-6 text-[13px] gap-2 shadow-md transition-transform active:scale-95" onClick={() => onSave()} disabled={isSaving || !isDirty}>
            <Save className="h-4 w-4" />
            {isSaving ? "Savingâ€¦" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CollectionSettingsPage({
  workspace,
  collection,
  storagePath,
  initialTab = "Overview",
  initialEnvTab = "workspace",
  onEnvSave,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isSaving, setIsSaving] = useState(false);

  const { vars: envVars } = useEnv(workspace?.name, collection?.name);
  const { config, isDirty, updateConfig, save, reset } = useCollectionConfig(
    workspace?.name,
    collection?.name
  );

  async function handleSave(overrideConfig) {
    setIsSaving(true);
    try {
      if (overrideConfig) {
        await save({ ...config, ...overrideConfig });
      } else {
        await save();
      }
    } catch {

    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, workspace?.name, collection?.name]);

  function handleNavigate(tab, envTab) {
    setActiveTab(tab);
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      { }
      <div className="flex items-center gap-3 border-b border-border/25 bg-background/30 px-6 py-4 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <FileJson className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Collection Settings
          </div>
          <div className="text-[18px] font-semibold text-foreground leading-tight">
            {collection?.name ?? ""}
          </div>
        </div>
      </div>

      { }
      <div className="flex items-center gap-1 border-b border-border/25 bg-background/20 px-4 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2.5 text-[12.5px] border-b-2 transition-colors -mb-px",
              activeTab === tab.id
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      { }
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === "Overview" && (
          <OverviewTab
            workspace={workspace}
            collection={collection}
            storagePath={storagePath}
            envVars={envVars}
            onNavigate={handleNavigate}
          />
        )}

        {activeTab === "Headers" && (
          <HeadersTab
            config={config}
            updateConfig={updateConfig}
            isDirty={isDirty}
            isSaving={isSaving}
            onSave={handleSave}
            onReset={reset}
          />
        )}

        {activeTab === "Environments" && (
          <div className="h-full min-h-0 flex flex-col p-8 gap-4 max-w-4xl w-full">
            <div>
              <h3 className="text-lg font-semibold text-foreground tracking-tight">Environments</h3>
              <p className="text-[13px] text-muted-foreground mt-1">
                Define reusable state values. Use <code className="text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm">{"{{KEY}}"}</code> in
                URLs, headers, and payloads to interpolate them dynamically. Collection keys take priority.
              </p>
            </div>
            <Card className="flex-1 min-h-0 border-border/20 bg-background/40 shadow-sm overflow-hidden flex flex-col mt-2">
              <EnvEditor
                workspaceName={workspace?.name}
                collectionName={collection?.name}
                initialTab={initialEnvTab}
                onSave={onEnvSave}
              />
            </Card>
          </div>
        )}

        {activeTab === "Auth" && (
          <AuthTab
            workspace={workspace}
            collection={collection}
            config={config}
            updateConfig={updateConfig}
            isDirty={isDirty}
            isSaving={isSaving}
            onSave={handleSave}
            onReset={reset}
            envVars={envVars}
          />
        )}
      </div>
    </div>
  );
}


