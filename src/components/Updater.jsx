import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button.jsx";
import { cn } from "@/lib/utils.js";

export function Updater() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [currentVersion, setCurrentVersion] = useState("");

  useEffect(() => {
    getVersion().then(setCurrentVersion).catch(console.error);
    checkForUpdates(false);

    const handleManualCheck = () => checkForUpdates(true);
    window.addEventListener("manual-update-check", handleManualCheck);

    return () => window.removeEventListener("manual-update-check", handleManualCheck);
  }, []);

  async function checkForUpdates(isManual) {
    if (status === "downloading" || status === "available") return;

    if (isManual) setStatus("checking");

    try {
      const update = await check();
      if (update) {
        setUpdateInfo(update);
        setStatus("available");
      } else {
        if (isManual) {
          setStatus("up-to-date");
          setTimeout(() => setStatus("idle"), 4000);
        }
      }
    } catch (err) {
      console.error("Update failed:", err);
      if (isManual) {
        setStatus("error");
        setErrorMsg(err?.message || "Failed to check for updates");
        setTimeout(() => setStatus("idle"), 5000);
      }
    }
  }

  async function handleInstallAndRestart() {
    setStatus("downloading");
    try {
      await updateInfo.downloadAndInstall();
      await relaunch();
    } catch (err) {
      console.error("Install failed:", err);
      setStatus("error");
      setErrorMsg(err?.message || "Failed to install update");
      setTimeout(() => setStatus("idle"), 5000);
    }
  }

  if (status === "idle") return null;
  if (status === "checking") {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-sm border border-border/45 bg-card/95 px-4 py-3 shadow-xl backdrop-blur-md animate-in slide-in-from-bottom-5">
        <RefreshCw className="h-4 w-4 text-primary animate-spin" />
        <span className="text-[13px] font-medium">Checking for updates...</span>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 panel-surface flex flex-col gap-3 rounded-sm p-5 shadow-2xl min-w-[340px] animate-in slide-in-from-right-5 fade-in duration-500">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5 text-foreground font-semibold tracking-tight">
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-sm transition-colors border border-border/10",
            status === "downloading" ? "bg-primary/10 text-primary" :
              status === "error" ? "bg-red-500/10 text-red-500" :
                status === "up-to-date" ? "bg-emerald-500/10 text-emerald-400" : "bg-primary/10 text-primary"
          )}>
            <RefreshCw className={cn("h-4 w-4", status === "downloading" && "animate-spin")} />
          </div>
          <span className="text-[14px]">
            {status === "downloading" ? "Applying Update..." :
              status === "available" ? "Update Available" :
                status === "error" ? "Update Failed" : "Up to Date"}
          </span>
        </div>
        {status !== "downloading" && (
          <button onClick={() => setStatus("idle")} className="text-muted-foreground hover:bg-accent/40 hover:text-foreground h-7 w-7 flex items-center justify-center rounded-sm transition-all focus-visible:outline-none">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="text-[12.5px] text-muted-foreground leading-relaxed px-0.5">
        {status === "downloading" && `Downloading and installing version ${updateInfo?.version}...`}
        {status === "available" && (
          <div className="space-y-1">
            <p>Restart Kivo to apply the new changes.</p>
            <p className="text-[11px] font-medium opacity-60">Currently on v{currentVersion} → New version: <span className="font-bold text-foreground">{updateInfo?.version}</span></p>
          </div>
        )}
        {status === "error" && <p className="text-red-500/90 font-medium">{errorMsg}</p>}
        {status === "up-to-date" && <p>You are on the latest version <span className="text-foreground font-medium">v{currentVersion}</span>. Everything is looking good!</p>}
      </div>

      {status === "available" && (
        <div className="flex justify-end gap-2 mt-1 pt-3 border-t border-border/15">
          <Button variant="ghost" size="sm" className="h-8 rounded-sm text-[11.5px] px-3 font-medium hover:bg-accent/40 transition-colors" onClick={() => {}}>
            Release Notes
          </Button>
          <Button size="sm" className="h-8 rounded-sm text-[11.5px] px-4 gap-2 shadow-md active:scale-95 transition-transform font-semibold font-mono" onClick={handleInstallAndRestart}>
            <RefreshCw className="h-3 w-3" />
            Restart
          </Button>
        </div>
      )}
    </div>
  );
}
