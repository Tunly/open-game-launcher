import { Pause, Play, RotateCcw, X } from "lucide-react";

import type { DownloadItem, DownloadStatus, Game } from "../../lib/types";
import { isTerminalDownloadItem } from "../../stores/downloadStore";
import { DownloadInspector } from "./DownloadInspector";
import { getGameAssetUrl } from "../../lib/assets";

interface DownloadCardProps {
  index?: number;
  item: DownloadItem;
  game?: Game;
  commandPending?: boolean;
  debugMode?: boolean;
  onArchive: (id: string) => void | Promise<void>;
  onCancel: (id: string) => void;
  onPauseToggle: (id: string) => void;
  onLaunch?: (gameId: string) => void | Promise<void>;
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
  queued: "bg-[#efe6d4] text-[#171411] border-black",
  starting: "bg-[#087d6d] text-white border-black",
  completed: "bg-[#087d6d] text-white border-black",
  downloading: "bg-[#c20b2f] text-white border-black",
  failed: "bg-[#171411] text-white border-black",
  paused: "bg-[#efe6d4] text-[#171411] border-black",
  pausing: "bg-[#efe6d4] text-[#171411] border-black",
  resuming: "bg-[#087d6d] text-white border-black",
  installing: "bg-[#c20b2f] text-white border-black",
  cancelled: "bg-[#171411] text-white border-black",
  error: "bg-[#171411] text-white border-black",
};

const platformColors: Record<string, string> = {
  Steam: "bg-[#171411] text-[#fbf4e7] border-black",
  "Epic Games": "bg-[#171411] text-[#fbf4e7] border-black",
  "GOG Galaxy": "bg-[#087d6d] text-white border-black",
  "EA App": "bg-[#c20b2f] text-white border-black",
  "Ubisoft Connect": "bg-[#087d6d] text-white border-black",
  "Xbox App": "bg-[#f5eedf] text-[#171411] border-black",
  "Xbox App / PC Game Pass": "bg-[#f5eedf] text-[#171411] border-black",
  "Battle.net": "bg-[#8cf5e4] text-[#171411] border-black",
  "OG Store": "bg-[#087d6d] text-white border-black",
};

export function DownloadCard({
  index = 0,
  item,
  game,
  commandPending = false,
  debugMode = false,
  onArchive,
  onCancel,
  onPauseToggle,
  onLaunch,
}: DownloadCardProps) {
  const isTerminal = isTerminalDownloadItem(item);
  const canPause =
    Boolean(item.canPause) &&
    !commandPending &&
    (item.status === "downloading" || item.status === "paused");
  const canCancel = Boolean(item.canCancel) && !isTerminal;
  const isComplete = item.status === "completed";
  const isExternal = Boolean(item.external);
  const archiveLabel = isExternal && !isTerminal ? "Remove" : "Archive";
  const lockedLabel = commandPending
    ? "Busy"
    : isExternal && /pausing|resuming/i.test(item.speed)
      ? "Busy"
      : item.status === "pausing" || item.status === "resuming" || item.status === "installing"
        ? "Busy"
        : isExternal
          ? "External"
          : "Locked";
  const phaseLabel = item.phase ? ` // ${item.phase}` : "";
  const byteLabel = formatByteProgress(item);

  // Cover image URL or fallback to logoUrl
  const imageUrl = game ? getGameAssetUrl(game.coverUrl || game.logoUrl) : undefined;

  // Rotate deterministic art patterns when a game has no cover asset.
  const placeholderClasses = ["library-art-tokyo", "library-art-mech", "library-art-phantom"];
  const placeholderClass = placeholderClasses[index % placeholderClasses.length];

  return (
    <div className="w-full">
      <article className="grid grid-cols-1 items-center gap-4 border-4 border-black bg-[#f5eedf] p-4 shadow-[4px_4px_0_#171411] md:grid-cols-[auto_1fr_auto]">
        {/* Game Cover / Icon */}
        <div className="relative flex h-24 w-full flex-shrink-0 items-center justify-center overflow-hidden border-2 border-black bg-[#171411] md:h-20 md:w-36">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              className={`flex h-full w-full select-none flex-col items-center justify-center p-2 text-center ${placeholderClass}`}
            >
              <span className="neo-title max-w-full truncate bg-black/60 px-1 text-xs font-black uppercase tracking-tight text-white">
                {item.title}
              </span>
            </div>
          )}
        </div>

        {/* Content & Progress */}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-black uppercase leading-none tracking-tight text-[#171411] sm:text-lg">
              {item.title}
            </h2>
            {item.platform && (
              <span
                className={`neo-copy border px-1.5 py-0.5 text-[8px] font-extrabold uppercase shadow-[1px_1px_0_#171411] ${platformColors[item.platform] || "border-black bg-[#efe6d4] text-[#171411]"}`}
              >
                {item.platform}
              </span>
            )}
            <span
              className={`neo-copy py-0.2 border-2 border-black px-2 text-[9px] font-bold uppercase shadow-[1px_1px_0_#171411] ${statusClass[item.status]}`}
            >
              {statusLabel[item.status]}
            </span>
          </div>

          <div className="h-4 border-2 border-black bg-[#efe6d4]">
            <div
              className={`h-full transition-all duration-300 ${isComplete ? "bg-[#087d6d]" : item.status === "paused" ? "bg-[#5b403f]" : "bg-[#c20b2f]"}`}
              style={{ width: `${item.progress}%` }}
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
              {item.progress}% complete{phaseLabel}
            </span>
            <span className="neo-copy text-[10px] font-bold uppercase text-[#5b403f]">
              {byteLabel ? `${item.speed} // ${byteLabel}` : item.speed}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto">
          {/* PLAY Button for Completed */}
          {isComplete && onLaunch ? (
            <button
              onClick={() => void onLaunch(item.gameId)}
              className="neo-copy flex items-center justify-center gap-1.5 border-2 border-black bg-[#087d6d] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-[2px_2px_0_#171411] hover:bg-[#087d6d]/90 active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
              type="button"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              PLAY
            </button>
          ) : null}

          {/* Pause / Resume Controls */}
          {canPause ? (
            <button
              className="neo-copy flex items-center justify-center gap-1.5 border-2 border-black bg-[#f5eedf] px-3 py-2 text-xs font-bold uppercase text-[#171411] shadow-[2px_2px_0_#171411] hover:bg-[#efe6d4] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
              type="button"
              onClick={() => onPauseToggle(item.id)}
            >
              {item.status === "downloading" ? (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Resume
                </>
              )}
            </button>
          ) : !isTerminal && !isComplete ? (
            <button
              className="neo-copy flex cursor-not-allowed items-center justify-center gap-1.5 border-2 border-black bg-[#efe6d4] px-3 py-2 text-xs font-bold uppercase text-[#55504a]"
              disabled
              type="button"
            >
              <Play className="h-3.5 w-3.5" />
              {lockedLabel}
            </button>
          ) : null}

          {/* Cancel Button */}
          {canCancel ? (
            <button
              className="neo-copy flex items-center justify-center gap-1.5 border-2 border-black bg-[#c20b2f] px-3 py-2 text-xs font-bold uppercase text-white shadow-[2px_2px_0_#171411] hover:bg-[#a50826] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
              type="button"
              onClick={() => onCancel(item.id)}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          ) : null}

          {/* Archive / Clear Button */}
          {isTerminal || isComplete ? (
            <button
              className={`neo-copy flex items-center justify-center gap-1.5 border-2 border-black px-3 py-2 text-xs font-bold uppercase ${
                commandPending
                  ? "cursor-not-allowed bg-[#efe6d4] text-[#55504a]"
                  : "bg-[#efe6d4] text-[#171411] shadow-[2px_2px_0_#171411] hover:bg-[#e2d8c3] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
              }`}
              disabled={commandPending}
              type="button"
              onClick={() => onArchive(item.id)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {commandPending ? "Busy" : archiveLabel}
            </button>
          ) : null}
        </div>
      </article>
      {debugMode && <DownloadInspector item={item} />}
    </div>
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
