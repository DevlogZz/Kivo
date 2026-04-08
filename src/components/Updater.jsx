import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";

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
    if (status === "downloading" || status === "ready") return;

    if (isManual) setStatus("checking");

    try {
      const update = await check();
      if (update) {
        setUpdateInfo(update);
        setStatus("downloading");
        await update.downloadAndInstall();

        setStatus("ready");
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

  if (status === "idle") return null;
  if (status === "checking") {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg border border-border/40 bg-card/95 px-4 py-3 shadow-xl backdrop-blur-md animate-in slide-in-from-bottom-5">
        <RefreshCw className="h-4 w-4 text-primary animate-spin" />
        <span className="text-[13px] font-medium">Checking for updates...</span>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className="flex flex-col gap-3 rounded-xl border border-border/40 bg-card/95 p-4 shadow-xl backdrop-blur-md min-w-[320px]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-foreground">
            <RefreshCw className={`h-4 w-4 ${status === "downloading" ? "text-primary animate-spin" : status === "error" ? "text-destructive" : status === "up-to-date" ? "text-emerald-500" : "text-primary"}`} />
            <span className="font-semibold text-[14px]">
              {status === "downloading" ? "Downloading Update..." :
                status === "ready" ? "Update Ready" :
                  status === "error" ? "Update Failed" : "Up to Date"}
            </span>
          </div>
          <button onClick={() => setStatus("idle")} className="text-muted-foreground hover:bg-accent/50 p-1 rounded-md transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="text-[12.5px] text-muted-foreground leading-relaxed">
          {status === "downloading" && `Quietly grabbing version ${updateInfo?.version}...`}
          {status === "ready" && (
            <p>
              Version <span className="font-semibold text-foreground">{updateInfo?.version}</span> is ready to install.
              <br />
              <span className="text-[11px] opacity-70">Current: v{currentVersion}</span>
            </p>
          )}
          {status === "error" && <p className="text-destructive/90">{errorMsg}</p>}
          {status === "up-to-date" && <p>You are on the latest version (v{currentVersion}). Everything is looking good!</p>}
        </div>

        {status === "ready" && (
          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-border/30">
            <Button variant="ghost" size="sm" className="h-8 text-[12px] hover:bg-red-500/10 hover:text-red-500 transition-colors" onClick={() => setStatus("idle")}>
              Remind me later
            </Button>
            <Button size="sm" className="h-8 text-[12px] gap-1.5 shadow-md active:scale-95 transition-transform" onClick={() => relaunch()}>
              <RefreshCw className="h-3 w-3" />
              Restart App
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
