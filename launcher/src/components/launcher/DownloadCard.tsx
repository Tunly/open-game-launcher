import { Pause, Play, RotateCcw, RotateCw, X } from "lucide-react";
import { memo, useEffect, useState } from "react";

import type { DownloadItem, DownloadStatus, Game } from "../../lib/types";
import { isTerminalDownloadItem } from "../../stores/downloadStore";
import { DownloadInspector } from "./DownloadInspector";
import { getGameAssetUrl } from "../../lib/assets";
import { getGameIconCandidates } from "../../lib/formatters";

interface DownloadCardProps {
  index?: number;
  item: DownloadItem;
  game?: Game;
  pendingAction?: "pause" | "cancel" | "archive" | "launch" | "clear" | "retry";
  debugMode?: boolean;
  onArchive: (id: string) => void | Promise<void>;
  onCancel: (id: string) => void;
  onPauseToggle: (id: string) => void;
  onLaunch?: (gameId: string) => void | Promise<void>;
  onRetry?: (id: string) => void | Promise<void>;
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

function DownloadCardComponent({
  index = 0,
  item,
  game,
  pendingAction,
  debugMode = false,
  onArchive,
  onCancel,
  onPauseToggle,
  onLaunch,
  onRetry,
}: DownloadCardProps) {
  const isTerminal = isTerminalDownloadItem(item);
  const commandPending = Boolean(pendingAction);
  const canPause =
    Boolean(item.canPause) &&
    !commandPending &&
    (item.status === "downloading" || item.status === "paused");
  const canCancel = Boolean(item.canCancel) && !isTerminal;
  const isComplete = item.status === "completed";
  const isExternal = Boolean(item.external);
  const archiveLabel = isExternal && !isTerminal ? "Remove" : "Archive";
  const lockedLabel =
    pendingAction === "pause"
      ? item.status === "paused"
        ? "Resuming..."
        : "Pausing..."
      : commandPending && item.status === "downloading"
        ? "Pause"
        : commandPending && item.status === "paused"
          ? "Resume"
          : isExternal && /pausing|resuming/i.test(item.speed)
            ? "Busy"
            : item.status === "pausing" ||
                item.status === "resuming" ||
                item.status === "installing"
              ? "Busy"
              : isExternal
                ? "External"
                : "Locked";
  const phaseLabel = item.phase ? ` · ${item.phase}` : "";
  const byteLabel = formatByteProgress(item);
  const speedLabel = formatTransferRateLabel(item.speed);
  const etaLabel = formatEta(item.eta);
  const displayProgress = Number.isFinite(item.progress)
    ? Math.min(100, Math.max(0, item.progress))
    : 0;

  // Match the Achievements page: prefer cover art, then icon/logo fallbacks.
  const iconCandidates = game
    ? [game.coverUrl, ...getGameIconCandidates(game)].filter(
        (url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index,
      )
    : [];
  const [iconCandidateIndex, setIconCandidateIndex] = useState(0);
  const imageUrl = getGameAssetUrl(iconCandidates[iconCandidateIndex]);
  const isCover = iconCandidateIndex === 0 && Boolean(game?.coverUrl);
  const showImage = Boolean(imageUrl);

  useEffect(() => {
    setIconCandidateIndex(0);
  }, [game?.id, game?.iconUrl, game?.logoUrl, game?.coverUrl]);

  // Rotate deterministic art patterns when a game has no cover asset.
  const placeholderClasses = ["library-art-tokyo", "library-art-mech", "library-art-phantom"];
  const placeholderClass = placeholderClasses[index % placeholderClasses.length];

  return (
    <div className="w-full">
      <article className="grid grid-cols-1 items-center gap-4 border-4 border-black bg-[#f5eedf] p-4 shadow-[4px_4px_0_#171411] md:grid-cols-[auto_1fr_auto]">
        {/* Game Cover / Icon */}
        <div className="relative flex aspect-video w-full flex-shrink-0 items-center justify-center overflow-hidden border-2 border-black bg-[#171411] md:w-36">
          {showImage ? (
            <img
              src={imageUrl}
              alt=""
              className={`h-full w-full ${isCover ? "object-cover" : "object-contain p-2"}`}
              decoding="async"
              loading="lazy"
              onError={() =>
                setIconCandidateIndex((current) =>
                  current + 1 >= iconCandidates.length ? iconCandidates.length : current + 1,
                )
              }
            />
          ) : (
            <div
              className={`flex h-full w-full flex-col items-center justify-center p-2 text-center select-none ${placeholderClass}`}
            >
              <span className="neo-title line-clamp-2 max-w-full bg-black/60 px-1 text-xs font-black tracking-tight break-words text-white uppercase">
                {item.title}
              </span>
            </div>
          )}
        </div>

        {/* Content & Progress */}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <h3 className="neo-title text-base leading-none font-black tracking-tight break-words text-[#171411] uppercase sm:truncate sm:text-lg">
              {item.title}
            </h3>
            {item.platform && (
              <span
                className={`neo-copy border px-1.5 py-0.5 text-[8px] font-extrabold uppercase shadow-[1px_1px_0_#171411] ${platformColors[item.platform] || "border-black bg-[#efe6d4] text-[#171411]"}`}
              >
                {item.platform.replaceAll("/", "·")}
              </span>
            )}
            <span
              className={`neo-copy py-0.2 border-2 border-black px-2 text-[9px] font-bold uppercase shadow-[1px_1px_0_#171411] ${statusClass[item.status]}`}
            >
              {statusLabel[item.status]}
            </span>
          </div>

          <div
            aria-label={`${item.title} download progress`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={displayProgress}
            className="h-4 border-2 border-black bg-[#efe6d4]"
            role="progressbar"
          >
            <div
              className={`h-full transition-all duration-300 ${isComplete ? "bg-[#087d6d]" : item.status === "paused" ? "bg-[#5b403f]" : "bg-[#c20b2f]"}`}
              style={{ width: `${displayProgress}%` }}
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <span className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">
              {displayProgress}% complete{phaseLabel}
            </span>
            <span className="neo-copy text-[10px] font-bold text-[#5b403f] uppercase">
              {byteLabel ? `${speedLabel} · ${byteLabel}` : speedLabel}
              {etaLabel ? ` · ETA ${etaLabel}` : ""}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex w-full flex-wrap items-center justify-end gap-2 md:w-auto">
          {/* PLAY Button for Completed */}
          {isComplete && onLaunch ? (
            <button
              disabled={commandPending}
              onClick={() => void onLaunch(item.gameId)}
              className={`neo-copy flex items-center justify-center gap-1.5 border-2 border-black px-4 py-2 text-xs font-bold tracking-wider uppercase ${
                commandPending
                  ? "cursor-not-allowed bg-[#efe6d4] text-[#55504a]"
                  : "bg-[#087d6d] text-white shadow-[2px_2px_0_#171411] hover:bg-[#087d6d]/90 active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
              }`}
              type="button"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              {pendingAction === "launch" ? "Launching..." : "Play"}
            </button>
          ) : null}

          {isTerminal &&
          !isExternal &&
          (item.status === "failed" || item.status === "error") &&
          onRetry ? (
            <button
              disabled={commandPending}
              onClick={() => void onRetry(item.id)}
              className={`neo-copy flex items-center justify-center gap-1.5 border-2 border-black px-3 py-2 text-xs font-bold uppercase ${
                commandPending
                  ? "cursor-not-allowed bg-[#efe6d4] text-[#55504a]"
                  : "bg-[#087d6d] text-white shadow-[2px_2px_0_#171411] hover:bg-[#087d6d]/90 active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
              }`}
              type="button"
            >
              <RotateCw className="h-3.5 w-3.5" />
              {pendingAction === "retry" ? "Retrying..." : "Retry"}
            </button>
          ) : null}

          {/* Pause / Resume Controls */}
          {canPause ? (
            <button
              className="neo-copy flex items-center justify-center gap-1.5 border-2 border-black bg-[#f5eedf] px-3 py-2 text-xs font-bold text-[#171411] uppercase shadow-[2px_2px_0_#171411] hover:bg-[#efe6d4] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
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
              className="neo-copy flex cursor-not-allowed items-center justify-center gap-1.5 border-2 border-black bg-[#efe6d4] px-3 py-2 text-xs font-bold text-[#55504a] uppercase"
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
              className={`neo-copy flex items-center justify-center gap-1.5 border-2 border-black px-3 py-2 text-xs font-bold uppercase ${
                commandPending
                  ? "cursor-not-allowed bg-[#efe6d4] text-[#55504a]"
                  : "bg-[#c20b2f] text-white shadow-[2px_2px_0_#171411] hover:bg-[#a50826] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
              }`}
              disabled={commandPending}
              type="button"
              onClick={() => onCancel(item.id)}
            >
              <X className="h-3.5 w-3.5" />
              {pendingAction === "cancel" ? "Cancelling..." : "Cancel"}
            </button>
          ) : null}

          {/* Archive / Clear Button */}
          {isTerminal || isExternal ? (
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
              {pendingAction === "archive" || pendingAction === "clear"
                ? "Archiving..."
                : archiveLabel}
            </button>
          ) : null}
        </div>
      </article>
      {debugMode && <DownloadInspector item={item} />}
    </div>
  );
}

export const DownloadCard = memo(DownloadCardComponent);

function formatByteProgress(item: DownloadItem) {
  if (!item.bytesTotal || item.bytesTotal <= 0) {
    return "";
  }

  const downloaded = item.bytesDownloaded ?? 0;
  return `${formatBytes(downloaded)} of ${formatBytes(item.bytesTotal)}`;
}

function formatTransferRateLabel(value: string) {
  return value.replace(/\b(B|KB|MB|GB)\s*\/\s*S\b/gi, "$1PS").replaceAll("/", " ");
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

function formatEta(eta: number | undefined) {
  if (!eta || !Number.isFinite(eta) || eta <= 0 || eta >= 999) return "";
  const totalSeconds = Math.round(eta);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
