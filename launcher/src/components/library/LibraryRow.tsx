import { memo, useState, useEffect } from "react";
import { Heart } from "lucide-react";
import type { GameGroup } from "../../lib/game-groups";
import type { GameRuntimeStatus } from "../../lib/types";
import type { CustomArtworkKind } from "../../lib/custom-artwork";
import { getGameAssetUrl } from "../../lib/assets";
import { getGameIconCandidates, getGameSource, getSourceDisplayLabel } from "../../lib/formatters";
import { PlatformIcon, PlatformSourceIcon } from "./PlatformIcons";

type LibraryRowProps = {
  group: GameGroup;
  selected?: boolean;
  onSelect: (group: GameGroup) => void;
  isFavorite?: boolean;
  isRunning?: boolean;
  runtime?: GameRuntimeStatus;
  onArtworkDrop?: (gameId: string, kind: CustomArtworkKind, file: File) => void;
};

function formatRuntimeDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || seconds < 0) return null;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
}

function runtimeSummary(runtime: GameRuntimeStatus | undefined, group?: GameGroup): string {
  if (!runtime) return "Running";
  const duration = formatRuntimeDuration(runtime.uptimeSeconds);
  const runtimeSource = runtime.launcher ? getSourceDisplayLabel(runtime.launcher) : null;
  const isCrossSource = runtimeSource
    ? (group?.sources.length ?? 0) > 1 &&
      !group?.variants.every(
        (variant) => getSourceDisplayLabel(getGameSource(variant)) === runtimeSource,
      )
    : false;
  return (
    [isCrossSource ? `via ${runtimeSource}` : null, runtime.processName, duration]
      .filter(Boolean)
      .join(" / ") || "Running"
  );
}

function LibraryRowBase({
  group,
  selected,
  onSelect,
  isFavorite,
  isRunning,
  runtime,
  onArtworkDrop,
}: LibraryRowProps) {
  const game = group.primaryGame;
  const [iconCandidateIndex, setIconCandidateIndex] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const iconCandidates = getGameIconCandidates(game);
  const iconUrl = getGameAssetUrl(iconCandidates[iconCandidateIndex]);
  const isInPcGamePass = group.variants.some((variant) => variant.catalogSource === "pc_game_pass");

  useEffect(() => {
    setIconCandidateIndex(0);
  }, [game.id, game.iconUrl, game.iconUrls]);

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file && onArtworkDrop) {
      onArtworkDrop(game.id, "icon", file);
    }
  }

  return (
    <button
      className={`flex min-h-[52px] w-full min-w-0 items-center gap-2 border-2 px-3 py-2 text-left transition ${
        selected
          ? "border-black bg-[#139a82] text-[#fffaf0]"
          : isDragOver
            ? "border-[#169b83] bg-[#169b83]/10 text-[#171411]"
            : "border-transparent text-[#171411] hover:bg-[#dfd4c1]"
      }`}
      type="button"
      onClick={() => onSelect(group)}
      onDragOver={onArtworkDrop ? handleDragOver : undefined}
      onDragLeave={onArtworkDrop ? handleDragLeave : undefined}
      onDrop={onArtworkDrop ? handleDrop : undefined}
    >
      <span
        className={`grid h-[22px] w-[22px] shrink-0 place-items-center overflow-hidden border border-black text-[10px] leading-none ${
          selected ? "bg-[#e8c843] text-[#171411]" : "bg-[#d8cbb7]"
        }`}
      >
        {iconUrl ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            src={iconUrl}
            onError={() =>
              setIconCandidateIndex((currentIndex) =>
                currentIndex + 1 >= iconCandidates.length
                  ? iconCandidates.length
                  : currentIndex + 1,
              )
            }
          />
        ) : (
          <PlatformIcon platform={game.platform} className="h-3.5 w-3.5" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="block truncate text-[14px] leading-none font-black">{group.title}</span>
        {group.variants.length > 1 || isInPcGamePass ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-1">
            {group.variants.length > 1 ? (
              <span
                className={`truncate text-[9px] font-bold tracking-wider uppercase ${
                  selected ? "text-[#f4ead8]" : "text-[#087d6d]"
                }`}
              >
                {group.variants.length} Anbieter
              </span>
            ) : null}
            {isInPcGamePass ? (
              <span className="neo-copy shrink-0 border border-black bg-[#8cf5e4] px-1 py-px text-[7px] leading-none font-black tracking-[0.08em] text-[#171411] uppercase shadow-[1px_1px_0_#171411]">
                PC Game Pass
              </span>
            ) : null}
          </span>
        ) : null}
      </span>

      <span className="flex max-w-[72px] shrink-0 items-center justify-end gap-0.5 overflow-hidden">
        {(() => {
          const seen = new Set<string>();
          const uniqueVariants = group.variants.filter((variant) => {
            const source = getGameSource(variant);
            if (seen.has(source)) return false;
            seen.add(source);
            return true;
          });
          return uniqueVariants.slice(0, 4).map((variant) => (
            <span
              key={variant.id}
              className={`grid h-5 w-5 place-items-center border border-black ${
                selected ? "bg-[#fbf4e7] text-[#171411]" : "bg-[#efe3cf] text-[#171411]"
              }`}
              title={variant.launcher ?? variant.title}
            >
              <PlatformSourceIcon game={variant} className="h-3 w-3 shrink-0" />
            </span>
          ));
        })()}
      </span>

      {isRunning ? (
        <span
          className="neo-copy max-w-[112px] shrink-0 truncate border border-black bg-[#087d6d] px-1.5 py-0.5 text-[8px] font-black text-white uppercase shadow-[1px_1px_0_#171411]"
          title={`Running${runtime ? `: ${runtimeSummary(runtime, group)}` : ""}`}
        >
          {runtime ? runtimeSummary(runtime, group) : "Running"}
        </span>
      ) : null}

      {isFavorite && <Heart className="h-3 w-3 shrink-0 fill-[#b7102a] text-[#b7102a]" />}
    </button>
  );
}

export const LibraryRow = memo(LibraryRowBase);
