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
  const lockedLabel =
    commandPending
      ? "Busy"
      : isExternal && /pausing|resuming/i.test(item.speed)
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

  // Cover image URL or fallback to logoUrl
  const imageUrl = game ? getGameAssetUrl(game.coverUrl || game.logoUrl) : undefined;

  // Let's determine placeholder pattern class based on index/id for variety
  const placeholderClasses = ["library-art-tokyo", "library-art-mech", "library-art-phantom"];
  const placeholderClass = placeholderClasses[index % placeholderClasses.length];

  return (
    <div className="w-full">
      <article className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] items-center gap-4 border-4 border-black bg-[#f5eedf] p-4 shadow-[4px_4px_0_#171411]">
        {/* Game Cover / Icon */}
        <div className="relative w-full h-24 md:w-36 md:h-20 bg-[#171411] border-2 border-black overflow-hidden flex-shrink-0 flex items-center justify-center">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="object-cover w-full h-full" />
          ) : (
            <div className={`w-full h-full flex flex-col items-center justify-center p-2 text-center select-none ${placeholderClass}`}>
              <span className="neo-title text-xs font-black text-white bg-black/60 px-1 uppercase tracking-tight truncate max-w-full">
                {item.title}
              </span>
            </div>
          )}
        </div>

        {/* Content & Progress */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <h2 className="text-base sm:text-lg font-black uppercase leading-none text-[#171411] truncate tracking-tight">
              {item.title}
            </h2>
            {item.platform && (
              <span className={`neo-copy border px-1.5 py-0.5 text-[8px] font-extrabold uppercase shadow-[1px_1px_0_#171411] ${platformColors[item.platform] || "bg-[#efe6d4] text-[#171411] border-black"}`}>
                {item.platform}
              </span>
            )}
            <span className={`neo-copy border-2 border-black px-2 py-0.2 text-[9px] font-bold uppercase shadow-[1px_1px_0_#171411] ${statusClass[item.status]}`}>
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
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          {/* PLAY Button for Completed */}
          {isComplete && onLaunch ? (
            <button
              onClick={() => void onLaunch(item.gameId)}
              className="neo-copy flex items-center justify-center gap-1.5 border-2 border-black bg-[#087d6d] hover:bg-[#087d6d]/90 text-white px-4 py-2 text-xs font-bold uppercase shadow-[2px_2px_0_#171411] tracking-wider active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
              type="button"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              PLAY
            </button>
          ) : null}

          {/* Pause / Resume Controls */}
          {canPause ? (
            <button
              className="neo-copy flex items-center justify-center gap-1.5 border-2 border-black bg-[#f5eedf] hover:bg-[#efe6d4] text-[#171411] px-3 py-2 text-xs font-bold uppercase shadow-[2px_2px_0_#171411] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
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
              className="neo-copy flex items-center justify-center gap-1.5 border-2 border-black bg-[#efe6d4] text-[#55504a] px-3 py-2 text-xs font-bold uppercase cursor-not-allowed"
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
              className="neo-copy flex items-center justify-center gap-1.5 border-2 border-black bg-[#c20b2f] hover:bg-[#a50826] text-white px-3 py-2 text-xs font-bold uppercase shadow-[2px_2px_0_#171411] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
              type="button"
              onClick={() => onCancel(item.id)}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          ) : null}

          {/* Archive / Clear Button */}
          {(isTerminal || isComplete) ? (
            <button
              className="neo-copy flex items-center justify-center gap-1.5 border-2 border-black bg-[#efe6d4] hover:bg-[#e2d8c3] text-[#171411] px-3 py-2 text-xs font-bold uppercase shadow-[2px_2px_0_#171411] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
              type="button"
              onClick={() => onArchive(item.id)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {archiveLabel}
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
