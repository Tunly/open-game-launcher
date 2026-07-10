import type { LibraryPreviewItem } from "../../../lib/types/profile";
import { EmptyShowcaseText, ShowcasePanel } from "./ShowcasePanel";

const artClasses = ["library-art-tokyo", "library-art-mech", "library-art-phantom"];

export function FavoriteGamesShowcase({ games }: { games: LibraryPreviewItem[] }) {
  return (
    <ShowcasePanel kicker="Library" title="Favorite Games">
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {games.length > 0 ? (
          games.map((game, index) => (
            <div
              key={game.id}
              className="overflow-hidden border-[3px] border-black bg-[#f6edd8] shadow-[3px_3px_0_#1f1c0f]"
            >
              {game.coverUrl ? (
                <img
                  alt=""
                  className="h-24 w-full border-b-[3px] border-black object-cover"
                  src={game.coverUrl}
                />
              ) : (
                <div
                  className={`${artClasses[index % artClasses.length]} grid h-24 place-items-end border-b-[3px] border-black p-2`}
                >
                  <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black text-[#171411] uppercase shadow-[2px_2px_0_#171411]">
                    Slot {index + 1}
                  </span>
                </div>
              )}
              <div className="p-3">
                <p className="neo-title text-2xl leading-none text-[#171411]">{game.title}</p>
                <p className="neo-copy mt-2 text-[11px] font-black text-[#5b403f] uppercase">
                  {Math.floor(game.playtimeMinutes / 60)}h played
                </p>
              </div>
            </div>
          ))
        ) : (
          <EmptyShowcaseText>No public library games yet.</EmptyShowcaseText>
        )}
      </div>
    </ShowcasePanel>
  );
}
