import { memo, useState, useEffect } from "react";
import { Heart } from "lucide-react";
import type { GameGroup } from "../../lib/game-groups";
import { getGameAssetUrl } from "../../lib/assets";
import { getGameIconCandidates, getGameSource } from "../../lib/formatters";
import { PlatformIcon, PlatformSourceIcon } from "./PlatformIcons";

type LibraryRowProps = {
  group: GameGroup;
  selected?: boolean;
  onSelect: (group: GameGroup) => void;
  isFavorite?: boolean;
};

function LibraryRowBase({
  group,
  selected,
  onSelect,
  isFavorite,
}: LibraryRowProps) {
  const game = group.primaryGame;
  const [iconCandidateIndex, setIconCandidateIndex] = useState(0);
  const iconCandidates = getGameIconCandidates(game);
  const iconUrl = getGameAssetUrl(iconCandidates[iconCandidateIndex]);

  useEffect(() => {
    setIconCandidateIndex(0);
  }, [game.id, game.iconUrl, game.iconUrls]);

  return (
    <button
      className={`flex min-h-[52px] w-full min-w-0 items-center gap-2 border-2 px-3 py-2 text-left transition ${
        selected
          ? "border-black bg-[#139a82] text-[#fffaf0]"
          : "border-transparent text-[#171411] hover:bg-[#dfd4c1]"
      }`}
      type="button"
      onClick={() => onSelect(group)}
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
      <span className="min-w-0 flex-1 flex flex-col justify-center">
        <span className="block truncate text-[14px] font-black leading-none">
          {group.title}
        </span>
        {group.variants.length > 1 ? (
          <span className={`text-[9px] font-bold uppercase mt-0.5 tracking-wider ${
            selected ? "text-[#f4ead8]" : "text-[#139a82]"
          }`}>
            {group.variants.length} Anbieter
          </span>
        ) : game.id.startsWith("gamepass-") ? (
          <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-[#139a82]">
            Game Pass
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

      {isFavorite && (
        <Heart className="h-3 w-3 fill-[#b7102a] text-[#b7102a] shrink-0" />
      )}
    </button>
  );
}

export const LibraryRow = memo(LibraryRowBase);
