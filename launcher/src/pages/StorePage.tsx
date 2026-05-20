import { useState } from "react";

import { StoreGameCard } from "../components/launcher/StoreGameCard";
import { Badge } from "../components/ui/Badge";
import { storeGames } from "../lib/mock-data";

export function StorePage() {
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set());

  function handleAddToLibrary(gameId: string) {
    setAddedIds((current) => {
      const next = new Set(current);
      next.add(gameId);
      return next;
    });
  }

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-white/10 bg-launcher-panel p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <Badge variant="info">MVP Storefront</Badge>
            <h2 className="mt-3 text-xl font-bold text-white">
              Curated discovery
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Featured picks across action, racing, strategy, and co-op
              collections.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <p className="text-lg font-bold text-white">{storeGames.length}</p>
              <p className="text-xs text-slate-500">Games</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <p className="text-lg font-bold text-white">2</p>
              <p className="text-xs text-slate-500">Platforms</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <p className="text-lg font-bold text-white">1</p>
              <p className="text-xs text-slate-500">Free</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {storeGames.map((game) => (
          <StoreGameCard
            key={game.id}
            game={game}
            isAdded={addedIds.has(game.id)}
            onAddToLibrary={handleAddToLibrary}
          />
        ))}
      </div>
    </section>
  );
}
