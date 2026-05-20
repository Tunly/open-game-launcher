import { useState } from "react";
import { Play } from "lucide-react";

import { StoreGameCard } from "../components/launcher/StoreGameCard";
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
    <section className="space-y-7">
      <div className="hero-art relative min-h-[500px] overflow-hidden border-4 border-black shadow-[6px_6px_0_#171411] sm:min-h-[340px]">
        <div className="absolute inset-x-0 top-0 h-24 bg-black/35" />
        <div className="relative m-6 flex min-h-[365px] items-center border-l-4 border-[#c20b2f] bg-black/62 p-8 sm:min-h-[280px] sm:p-9">
          <div className="max-w-[590px]">
            <div className="neo-copy flex flex-wrap gap-2 text-[11px] font-bold uppercase">
              <span className="border-2 border-[#c20b2f] px-3 py-1 text-[#c20b2f]">
                Neuerscheinung
              </span>
              <span className="border-2 border-[#087d6d] px-3 py-1 text-[#087d6d]">
                Action
              </span>
            </div>
            <h1 className="neo-title mt-4 text-6xl leading-none text-[#fffaf0] sm:text-7xl">
              Neo-Strike
            </h1>
            <p className="mt-4 max-w-[560px] text-lg leading-7 text-[#fffaf0]">
              Der ultimative Cyber-Brawler. Kampfe dich durch die Neon-
              Schluchten von Neo-Berlin. Uberlebe die Nacht. Vernichte das
              System.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <button
                className="neo-copy flex h-12 items-center gap-3 border-2 border-black bg-[#c20b2f] px-7 text-xs font-bold uppercase text-[#fffaf0] shadow-[4px_4px_0_#171411]"
                type="button"
              >
                <Play className="h-4 w-4 fill-current" />
                Jetzt kaufen - 49.99€
              </button>
              <button
                className="neo-copy h-12 border-2 border-[#fffaf0] bg-black/35 px-5 text-xs font-bold uppercase text-[#fffaf0]"
                type="button"
              >
                Trailer ansehen
              </button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-6 flex items-end justify-between border-b-4 border-black pb-2">
          <h2 className="neo-title bg-black px-4 pb-1 text-5xl leading-none text-[#fffaf0]">
            Trending Now
          </h2>
          <div className="neo-copy hidden gap-2 text-[11px] font-bold uppercase sm:flex">
            <button className="border-2 border-black px-4 py-1" type="button">
              Alle
            </button>
            <button className="border-2 border-black px-4 py-1" type="button">
              RPG
            </button>
            <button className="border-2 border-black px-4 py-1" type="button">
              Shooter
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {storeGames.map((game) => (
            <StoreGameCard
              key={game.id}
              game={game}
              isAdded={addedIds.has(game.id)}
              onAddToLibrary={handleAddToLibrary}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
