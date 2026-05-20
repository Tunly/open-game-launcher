import type { LibraryPreviewItem } from "../../../lib/types/profile";

export function FavoriteGamesShowcase({ games }: { games: LibraryPreviewItem[] }) {
  return (
    <div className="border border-white/10 bg-white/[0.05] p-5">
      <h3 className="text-lg font-bold text-white">Favorite Games</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {games.length > 0 ? (
          games.map((game) => (
            <div key={game.id} className="border border-white/10 bg-black/20 p-3">
              <p className="font-bold text-white">{game.title}</p>
              <p className="mt-1 text-xs text-slate-400">
                {Math.floor(game.playtimeMinutes / 60)}h played
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-400">No public library games yet.</p>
        )}
      </div>
    </div>
  );
}
