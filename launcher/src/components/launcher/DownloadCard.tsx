import { Pause, Play, RotateCcw, X } from "lucide-react";

import type { DownloadItem, DownloadStatus } from "../../lib/types";
import { isTerminalDownloadItem } from "../../stores/downloadStore";

interface DownloadCardProps {
  index?: number;
  item: DownloadItem;
  onArchive: (id: string) => void | Promise<void>;
  onCancel: (id: string) => void;
  onPauseToggle: (id: string) => void;
}

const statusLabel: Record<DownloadStatus, string> = {
  queued: "Queued",
  starting: "Starting",
  completed: "Completed",
  downloading: "Running",
  failed: "Error",
  paused: "Paused",
  pausing: "Pausing",
  resuming: "Resuming",
  installing: "Installing",
  cancelled: "Cancelled",
  error: "Error",
};

const statusClass: Record<DownloadStatus, string> = {
  queued: "bg-[#efe6d4] text-[#171411]",
  starting: "bg-[#087d6d] text-white",
  completed: "bg-[#087d6d] text-white",
  downloading: "bg-[#c20b2f] text-white",
  failed: "bg-[#171411] text-white",
  paused: "bg-[#efe6d4] text-[#171411]",
  pausing: "bg-[#efe6d4] text-[#171411]",
  resuming: "bg-[#087d6d] text-white",
  installing: "bg-[#c20b2f] text-white",
  cancelled: "bg-[#171411] text-white",
  error: "bg-[#171411] text-white",
};

const platformColors: Record<string, string> = {
  "Steam": "bg-[#0b1c2e] text-[#66c0f4] border-[#66c0f4]",
  "Epic Games": "bg-[#1f1f1f] text-white border-white",
  "GOG Galaxy": "bg-[#4f0c6b] text-[#fbf0ff] border-[#fbf0ff]",
  "EA App": "bg-[#f54242] text-white border-[#f54242]",
  "Ubisoft Connect": "bg-[#0070b8] text-white border-[#0070b8]",
  "Xbox Game Pass": "bg-[#107c10] text-white border-[#107c10]",
  "Battle.net": "bg-[#00aeff] text-white border-[#00aeff]",
  "OG Store": "bg-[#087d6d] text-white border-black",
};

export function DownloadCard({
  index = 0,
  item,
  onArchive,
  onCancel,
  onPauseToggle,
}: DownloadCardProps) {
  const isTerminal = isTerminalDownloadItem(item);
  const canPause =
    Boolean(item.canPause) &&
    (item.status === "downloading" || item.status === "paused");
  const canCancel = Boolean(item.canCancel) && !isTerminal;
  const isComplete = item.status === "completed";
  const isExternal = Boolean(item.external);
  const queueNumber = String(index + 1).padStart(2, "0");
  const archiveLabel = isExternal && !isTerminal ? "Remove" : "Archive";
  const lockedLabel =
    isExternal && /pausing|resuming/i.test(item.speed)
      ? "Busy"
      : item.status === "pausing" ||
          item.status === "resuming" ||
          item.status === "installing"
        ? "Busy"
      : isExternal
        ? "External"
        : "Locked";
  const phaseLabel = item.phase ? ` // ${item.phase}` : "";
  const byteLabel = formatByteProgress(item);

  return (
    <article className="grid overflow-hidden border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411] lg:grid-cols-[96px_1fr_210px]">
      <div className="flex min-h-16 items-center justify-center border-b-4 border-black bg-[#171411] text-[#f5eedf] lg:min-h-24 lg:border-b-0 lg:border-r-4">
        <span className="neo-title text-4xl leading-none lg:text-5xl">
          {queueNumber}
        </span>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                Package ID: {item.gameId}
              </span>
              {item.platform && (
                <span className={`neo-copy border px-1.5 py-0.2 text-[8px] font-extrabold uppercase shadow-[1px_1px_0_#171411] ${platformColors[item.platform] || "bg-[#efe6d4] text-[#171411] border-black"}`}>
                  {item.platform}
                </span>
              )}
            </div>
            <h2 className="mt-1 text-[clamp(1.5rem,8vw,1.875rem)] font-black uppercase leading-none text-[#171411]">
              {item.title}
            </h2>
          </div>
          <span
            className={`neo-copy border-2 border-black px-3 py-1 text-xs font-bold uppercase shadow-[2px_2px_0_#171411] ${statusClass[item.status]}`}
          >
            {statusLabel[item.status]}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="neo-copy text-xs font-bold uppercase text-[#55504a]">
            {item.progress}% complete{phaseLabel}
          </p>
          <p className="neo-copy text-xs font-bold uppercase text-[#55504a]">
            {byteLabel ? `${item.speed} // ${byteLabel}` : item.speed}
          </p>
        </div>
        <div className="mt-3 h-4 border-2 border-black bg-[#efe6d4]">
          <div
            className={`h-full ${isComplete ? "bg-[#087d6d]" : "bg-[#c20b2f]"}`}
            style={{ width: `${item.progress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 border-t-4 border-black lg:grid-cols-1 lg:border-l-4 lg:border-t-0">
        {canPause ? (
          <button
            className="neo-copy flex min-h-14 items-center justify-center gap-2 border-r-2 border-black bg-[#f5eedf] px-4 text-xs font-bold uppercase hover:bg-[#efe6d4] lg:border-b-2 lg:border-r-0"
            type="button"
            onClick={() => onPauseToggle(item.id)}
          >
            {item.status === "downloading" ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
            {item.status === "downloading" ? "Pause" : "Resume"}
          </button>
        ) : !isTerminal ? (
          <button
            className="neo-copy flex min-h-14 cursor-not-allowed items-center justify-center gap-2 border-r-2 border-black bg-[#efe6d4] px-4 text-xs font-bold uppercase text-[#55504a] lg:border-b-2 lg:border-r-0"
            disabled
            type="button"
          >
            <Play className="h-4 w-4" />
            {lockedLabel}
          </button>
        ) : (
          <button
            className="neo-copy flex min-h-14 items-center justify-center gap-2 border-r-2 border-black bg-[#087d6d] px-4 text-xs font-bold uppercase text-white lg:border-b-2 lg:border-r-0"
            type="button"
            onClick={() => onArchive(item.id)}
          >
            <RotateCcw className="h-4 w-4" />
            {archiveLabel}
          </button>
        )}
        {canCancel ? (
          <button
            className="neo-copy flex min-h-14 items-center justify-center gap-2 bg-[#c20b2f] px-4 text-xs font-bold uppercase text-white hover:bg-[#a50826]"
            type="button"
            onClick={() => onCancel(item.id)}
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        ) : !isComplete ? (
          <button
            className="neo-copy flex min-h-14 items-center justify-center gap-2 bg-[#f5eedf] px-4 text-xs font-bold uppercase text-[#171411] hover:bg-[#efe6d4]"
            type="button"
            onClick={() => onArchive(item.id)}
          >
            <X className="h-4 w-4" />
            {archiveLabel}
          </button>
        ) : (
          <button
            className="neo-copy min-h-14 bg-[#f5eedf] px-4 text-xs font-bold uppercase text-[#171411]"
            type="button"
            onClick={() => onArchive(item.id)}
          >
            Ready
          </button>
        )}
      </div>
    </article>
  );
}

function formatByteProgress(item: DownloadItem) {
  if (!item.bytesTotal || item.bytesTotal <= 0) {
    return "";
  }

  const downloaded = item.bytesDownloaded ?? 0;
  return `${formatBytes(downloaded)} / ${formatBytes(item.bytesTotal)}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 MB";
  }

  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) {
    return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  }

  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}
