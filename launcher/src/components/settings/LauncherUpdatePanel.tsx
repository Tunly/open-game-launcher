import { Download, RefreshCw } from "lucide-react";
import { useState } from "react";

import {
  checkForLauncherUpdate,
  installLauncherUpdate,
  useLauncherUpdateStore,
} from "../../stores/launcherUpdateStore";
import { ConfirmDialog } from "../ui/ConfirmDialog";

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

export function LauncherUpdatePanel() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const state = useLauncherUpdateStore();
  const busy =
    state.status === "checking" || state.status === "downloading" || state.status === "installing";
  const displayedCurrentVersion = state.currentVersion ?? "Unknown";
  const canInstall = state.status === "available" && Boolean(state.latestVersion);
  const progressPercentage = state.progress?.percentage;

  return (
    <>
      <section aria-label="OG Launcher update" className="border-t-2 border-black px-3 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2 border-b-2 border-black pb-2">
          <h2 className="neo-title text-base leading-none text-[#171411] uppercase">
            OG Launcher Update
          </h2>
          <div className="flex h-6 w-6 items-center justify-center border-2 border-black bg-[#087d6d] text-white">
            <span className="text-[10px] font-black">&#x2713;</span>
          </div>
        </div>

        <div className="space-y-1.5 pb-3">
          <div className="flex items-stretch gap-1.5">
            <UpdateChip label="Installed" value={`v${displayedCurrentVersion.replace(/^v/, "")}`} />
            <UpdateChip
              label="Available"
              value={state.latestVersion ? `v${state.latestVersion.replace(/^v/, "")}` : "--"}
            />
            <UpdateChip label="Status" value={STATUS_LABELS[state.status]} accent />
          </div>

          {state.status === "unsupported" ? (
            <p className="border border-black bg-[#efe6d4] px-2 py-1 text-[9px] leading-4 font-bold text-[#55504a] uppercase">
              {state.unsupportedReason ??
                "Self-update is available in the installed Windows x64 launcher only. Browser, Linux, and macOS builds remain manual downloads."}
            </p>
          ) : null}

          {state.error ? (
            <p
              role="alert"
              className="border border-black bg-[#c20b2f] px-2 py-1 text-[9px] leading-4 font-black text-white uppercase"
            >
              {state.error}
            </p>
          ) : null}

          {state.notes && state.status === "available" ? (
            <div className="border border-black bg-[#fff9ed] px-2 py-1.5">
              <p className="text-[8px] font-black tracking-[0.08em] text-[#087d6d] uppercase">
                Release Tape
              </p>
              <p className="mt-1 max-h-24 overflow-auto text-[10px] leading-4 whitespace-pre-line text-[#55504a]">
                {state.notes}
              </p>
            </div>
          ) : null}

          {state.progress ? (
            <div
              aria-label="Update download progress"
              className="border border-black bg-[#fff9ed] px-2 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[8px] font-black tracking-[0.08em] text-[#55504a] uppercase">
                  {state.status === "installing" ? "Handoff" : "Download"}
                </span>
                <span className="text-[8px] font-black text-[#171411] uppercase">
                  {progressPercentage === null
                    ? formatBytes(state.progress.downloadedBytes)
                    : `${progressPercentage}%`}
                </span>
              </div>
              <div className="mt-1 h-2.5 border border-black bg-[#efe6d4]">
                <div
                  className="h-full bg-[#087d6d] transition-[width]"
                  style={{ width: `${progressPercentage ?? 0}%` }}
                />
              </div>
              {state.progress.totalBytes !== null ? (
                <p className="mt-1 text-[8px] font-bold text-[#55504a] uppercase">
                  {formatBytes(state.progress.downloadedBytes)} /{" "}
                  {formatBytes(state.progress.totalBytes)}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex gap-1.5">
            <button
              className="flex h-7 flex-1 items-center justify-center gap-1 border-2 border-black bg-[#fff9ed] px-2 text-[9px] font-black text-[#171411] uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={busy}
              type="button"
              onClick={() => void checkForLauncherUpdate()}
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-3 w-3 ${state.status === "checking" ? "animate-spin" : ""}`}
              />
              {state.status === "checking"
                ? "Checking..."
                : state.status === "error"
                  ? "Retry"
                  : "Check"}
            </button>
            <button
              className="flex h-7 flex-1 items-center justify-center gap-1 border-2 border-black bg-[#b7102a] px-2 text-[9px] font-black text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#087d6d] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canInstall || busy}
              type="button"
              onClick={() => setConfirmOpen(true)}
            >
              <Download aria-hidden="true" className="h-3 w-3" />
              {state.status === "downloading"
                ? "Downloading..."
                : state.status === "installing"
                  ? "Installing..."
                  : "Install"}
            </button>
          </div>
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

function UpdateChip({
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
      className={`flex min-w-0 flex-1 flex-col border-2 border-black px-2 py-1 ${
        accent ? "bg-[#171411] text-[#fff9ed]" : "bg-[#efe6d4] text-[#171411]"
      }`}
    >
      <p
        className={`text-[8px] font-black tracking-[0.08em] uppercase ${
          accent ? "text-[#8cf5e4]" : "text-[#55504a]"
        }`}
      >
        {label}
      </p>
      <p className="truncate text-[11px] leading-tight font-black uppercase">{value}</p>
    </div>
  );
}
