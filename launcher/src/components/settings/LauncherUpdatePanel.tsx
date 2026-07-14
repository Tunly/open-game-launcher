import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";

import {
  checkForLauncherUpdate,
  installLauncherUpdate,
  useLauncherUpdateStore,
} from "../../stores/launcherUpdateStore";
import { ConfirmDialog } from "../ui/ConfirmDialog";

interface LauncherUpdatePanelProps {
  currentVersion?: string | null;
}

const STATUS_LABELS = {
  available: "Update Ready",
  checking: "Checking GitHub",
  current: "Current",
  downloading: "Downloading",
  error: "Action Required",
  idle: "Not Checked",
  installing: "Installing",
  unsupported: "Windows Only",
} as const;

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function LauncherUpdatePanel({ currentVersion }: LauncherUpdatePanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const state = useLauncherUpdateStore();
  const busy =
    state.status === "checking" || state.status === "downloading" || state.status === "installing";
  const displayedCurrentVersion = state.currentVersion ?? currentVersion ?? "Unknown";
  const canInstall = state.status === "available" && Boolean(state.latestVersion);
  const progressPercentage = state.progress?.percentage;

  return (
    <>
      <section
        aria-label="OG Launcher update"
        className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b-4 border-black bg-[#fff9ed] p-5">
          <div>
            <p className="neo-copy text-[10px] font-black tracking-[0.14em] text-[#b7102a] uppercase">
              Signed Stable Channel / GitHub
            </p>
            <h2 className="neo-title mt-1 text-3xl leading-none text-[#171411] uppercase">
              OG Launcher Update
            </h2>
          </div>
          <div className="flex h-12 w-12 items-center justify-center border-[3px] border-black bg-[#087d6d] text-white shadow-[3px_3px_0_#171411]">
            <ShieldCheck aria-hidden="true" className="h-6 w-6" />
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <UpdateReadout
              label="Installed"
              value={`v${displayedCurrentVersion.replace(/^v/, "")}`}
            />
            <UpdateReadout
              label="Available"
              value={state.latestVersion ? `v${state.latestVersion.replace(/^v/, "")}` : "--"}
            />
            <UpdateReadout label="Status" value={STATUS_LABELS[state.status]} accent />
          </div>

          {state.status === "unsupported" ? (
            <p className="neo-copy border-2 border-black bg-[#efe6d4] p-3 text-[10px] leading-5 font-bold text-[#55504a] uppercase">
              {state.unsupportedReason ??
                "Self-update is available in the installed Windows x64 launcher only. Browser, Linux, and macOS builds remain manual downloads."}
            </p>
          ) : null}

          {state.error ? (
            <p
              role="alert"
              className="neo-copy border-2 border-black bg-[#c20b2f] p-3 text-[10px] leading-5 font-black text-white uppercase"
            >
              {state.error}
            </p>
          ) : null}

          {state.notes && state.status === "available" ? (
            <div className="border-2 border-black bg-[#fff9ed] p-3">
              <p className="neo-copy text-[9px] font-black text-[#087d6d] uppercase">
                Release Tape
              </p>
              <p className="mt-2 max-h-32 overflow-auto text-sm leading-5 whitespace-pre-line text-[#55504a]">
                {state.notes}
              </p>
            </div>
          ) : null}

          {state.progress ? (
            <div
              aria-label="Update download progress"
              className="border-2 border-black bg-[#fff9ed] p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="neo-copy text-[9px] font-black text-[#55504a] uppercase">
                  {state.status === "installing" ? "Installer Handoff" : "Download Feed"}
                </span>
                <span className="neo-copy text-[9px] font-black text-[#171411] uppercase">
                  {progressPercentage === null
                    ? formatBytes(state.progress.downloadedBytes)
                    : `${progressPercentage}%`}
                </span>
              </div>
              <div className="mt-2 h-4 border-2 border-black bg-[#efe6d4]">
                <div
                  className="h-full bg-[#087d6d] transition-[width]"
                  style={{ width: `${progressPercentage ?? 0}%` }}
                />
              </div>
              {state.progress.totalBytes !== null ? (
                <p className="neo-copy mt-2 text-[9px] font-bold text-[#55504a] uppercase">
                  {formatBytes(state.progress.downloadedBytes)} /{" "}
                  {formatBytes(state.progress.totalBytes)}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className="neo-copy flex h-11 items-center justify-center gap-2 border-2 border-black bg-[#fff9ed] px-4 text-[10px] font-black text-[#171411] uppercase shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              disabled={busy}
              type="button"
              onClick={() => void checkForLauncherUpdate()}
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${state.status === "checking" ? "animate-spin" : ""}`}
              />
              {state.status === "checking"
                ? "Checking..."
                : state.status === "error"
                  ? "Retry Check"
                  : "Check Now"}
            </button>
            <button
              className="neo-copy flex h-11 items-center justify-center gap-2 border-2 border-black bg-[#b7102a] px-4 text-[10px] font-black text-white uppercase shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#087d6d] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
              disabled={!canInstall || busy}
              type="button"
              onClick={() => setConfirmOpen(true)}
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              {state.status === "downloading"
                ? "Downloading..."
                : state.status === "installing"
                  ? "Installing..."
                  : "Install Update"}
            </button>
          </div>

          <p className="neo-copy text-[9px] leading-5 font-bold text-[#55504a] uppercase">
            Updates are accepted only when the GitHub artifact matches the public Tauri signature.
            Installation closes OG-Launcher and relaunches the new version.
          </p>
        </div>
      </section>

      <ConfirmDialog
        cancelLabel="Not now"
        confirmLabel="Download & restart"
        message={`Install OG-Launcher v${state.latestVersion?.replace(/^v/, "") ?? "latest"}? The signed update will download, close the launcher, and restart on the new version.`}
        open={confirmOpen}
        title="Install launcher update"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void installLauncherUpdate();
        }}
      />
    </>
  );
}

function UpdateReadout({
  accent = false,
  label,
  value,
}: {
  accent?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div
      className={`border-2 border-black p-3 ${accent ? "bg-[#171411] text-[#fff9ed]" : "bg-[#efe6d4] text-[#171411]"}`}
    >
      <p
        className={`neo-copy text-[9px] font-black uppercase ${accent ? "text-[#8cf5e4]" : "text-[#55504a]"}`}
      >
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-black uppercase">{value}</p>
    </div>
  );
}
