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
      <div className="hero-art relative min-h-[420px] overflow-hidden border-4 border-black shadow-[5px_5px_0_#171411] sm:min-h-[340px] sm:shadow-[6px_6px_0_#171411]">
        <div className="absolute inset-x-0 top-0 h-24 bg-black/35" />
        <div className="relative m-4 flex min-h-[330px] items-center border-l-4 border-[#c20b2f] bg-black/62 p-5 sm:m-6 sm:min-h-[280px] sm:p-9">
          <div className="max-w-[590px]">
            <div className="neo-copy flex flex-wrap gap-2 text-[11px] font-bold uppercase">
              <span className="border-2 border-[#c20b2f] px-3 py-1 text-[#c20b2f]">
                New Release
              </span>
              <span className="border-2 border-[#087d6d] px-3 py-1 text-[#087d6d]">
                Action
              </span>
            </div>
            <h1 className="neo-title mt-4 text-[clamp(3.25rem,16vw,4.5rem)] leading-none text-[#fffaf0]">
              Neo-Strike
            </h1>
            <p className="mt-4 max-w-[560px] text-base leading-7 text-[#fffaf0] sm:text-lg">
              The ultimate cyber brawler. Fight through the neon
              canyons of Neo-Berlin. Survive the night. Break the system.
            </p>
            <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap sm:items-center sm:gap-5">
              <button
                className="neo-copy flex h-12 items-center justify-center gap-3 border-2 border-black bg-[#c20b2f] px-5 text-xs font-bold uppercase text-[#fffaf0] shadow-[4px_4px_0_#171411] sm:px-7"
                type="button"
              >
                <Play className="h-4 w-4 fill-current" />
                Buy Now - 49.99 EUR
              </button>
              <button
                className="neo-copy h-12 border-2 border-[#fffaf0] bg-black/35 px-5 text-xs font-bold uppercase text-[#fffaf0]"
                type="button"
              >
                Watch Trailer
              </button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-6 flex items-end justify-between border-b-4 border-black pb-2">
          <h2 className="neo-title bg-black px-4 pb-1 text-[clamp(2.6rem,12vw,3rem)] leading-none text-[#fffaf0]">
            Trending Now
          </h2>
          <div className="neo-copy hidden gap-2 text-[11px] font-bold uppercase sm:flex">
            <button className="border-2 border-black px-4 py-1" type="button">
              All
            </button>
            <button className="border-2 border-black px-4 py-1" type="button">
              RPG
            </button>
            <button className="border-2 border-black px-4 py-1" type="button">
              Shooter
            </button>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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
