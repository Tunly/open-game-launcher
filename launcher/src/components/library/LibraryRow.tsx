import { useState, useEffect } from "react";
import { Heart } from "lucide-react";
import type { Game } from "../../lib/types";
import { getGameAssetUrl } from "../../lib/assets";
import { getGameIconCandidates } from "../../lib/formatters";
import { PlatformIcon, PlatformSourceIcon } from "./PlatformIcons";

export function LibraryRow({
  game,
  selected,
  onSelect,
  isFavorite,
}: {
  game: Game;
  selected?: boolean;
  onSelect: (game: Game) => void;
  isFavorite?: boolean;
}) {
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
      onClick={() => onSelect(game)}
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
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-black leading-none">
          {game.title}
        </span>
      </span>

      <PlatformSourceIcon game={game} className="h-3.5 w-3.5 shrink-0" />

      {isFavorite && (
        <Heart className="h-3 w-3 fill-[#b7102a] text-[#b7102a] shrink-0" />
      )}
    </button>
  );
}
