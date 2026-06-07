import type { LibraryPreviewItem } from "../../../lib/types/profile";
import { EmptyShowcaseText, ShowcasePanel } from "./ShowcasePanel";

export function FavoriteGamesShowcase({ games }: { games: LibraryPreviewItem[] }) {
  return (
    <ShowcasePanel kicker="Library" title="Favorite Games">
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {games.length > 0 ? (
          games.map((game) => (
            <div
              key={game.id}
              className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#1f1c0f]"
            >
              <p className="neo-title text-2xl leading-none text-[#171411]">{game.title}</p>
              <p className="neo-copy mt-2 text-[11px] font-black text-[#5b403f] uppercase">
                {Math.floor(game.playtimeMinutes / 60)}h played
              </p>
            </div>
          ))
        ) : (
          <EmptyShowcaseText>No public library games yet.</EmptyShowcaseText>
        )}
      </div>
    </ShowcasePanel>
  );
}
