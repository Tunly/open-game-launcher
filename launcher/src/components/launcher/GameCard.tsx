import { CloudDownload, Play, RotateCw } from "lucide-react";

import type { Game } from "../../lib/types";

interface GameCardProps {
  game: Game;
  index?: number;
  isBusy?: boolean;
  isVerifying?: boolean;
  onPrimaryAction: (game: Game) => void;
  onVerifyAction: (game: Game) => void;
}

const artClassById: Record<string, string> = {
  "starfall-outpost": "library-art-tokyo",
  "iron-vale": "library-art-mech",
  "neon-rally": "library-art-phantom",
};

function getButtonLabel(game: Game, isBusy: boolean) {
  if (isBusy) {
    return "Warten ...";
  }

  if (game.id === "embers-and-engines") {
    return "Warten ...";
  }

  if (game.status === "update_available") {
    return "Spielen";
  }

  return "Starten";
}

export function GameCard({
  game,
  index = 0,
  isBusy = false,
  isVerifying = false,
  onPrimaryAction,
  onVerifyAction,
}: GameCardProps) {
  if (index === 0) {
    return (
      <article className="relative overflow-hidden border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411] sm:col-span-2 sm:row-span-2 lg:col-span-2">
        <div className="absolute right-5 top-[-12px] z-10 h-7 w-12 rotate-3 border-2 border-black bg-[#ded8ca]" />
        <div className="grid h-full sm:grid-cols-[1.05fr_1fr]">
          <div className="library-art-tokyo relative min-h-72 border-b-4 border-black sm:border-b-0 sm:border-r-4">
            <span className="neo-copy absolute left-3 top-3 border-2 border-black bg-[#c20b2f] px-3 py-1 text-xs font-bold uppercase text-white">
              Update
            </span>
            <div className="absolute bottom-16 left-14 h-28 w-40 -skew-x-12 rounded-[45%] border-4 border-[#171411] bg-[#087d6d] shadow-[18px_20px_0_rgba(0,0,0,0.35)]" />
          </div>
          <div className="flex flex-col p-6">
            <h2 className="text-3xl font-black uppercase leading-none text-[#171411]">
              Neo-Tokyo
              <br />
              Drift
            </h2>
            <div className="neo-copy mt-4 flex gap-2 text-[10px] font-bold uppercase">
              <span className="border border-black bg-[#58d8c8] px-3 py-2">Racing</span>
              <span className="border border-black px-3 py-2">Cyberpunk</span>
            </div>
            <p className="mt-5 text-sm leading-5 text-[#55504a]">
              Zuletzt gespielt: Heute.
              <br />
              Neues Content-Pack...
            </p>
            <button
              className="neo-copy mt-auto h-10 border-2 border-black bg-[#c20b2f] px-5 text-xs font-bold uppercase text-white shadow-[2px_2px_0_#171411]"
              disabled={isBusy}
              type="button"
              onClick={() => onPrimaryAction(game)}
            >
              {isBusy ? "Warten ..." : "Spielen"}
            </button>
          </div>
        </div>
      </article>
    );
  }

  if (game.status === "not_installed") {
    return (
      <article className="overflow-hidden border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411] sm:row-span-2">
        <div className="flex h-[56%] flex-col items-center justify-center border-b-4 border-black bg-[#f5eedf]">
          <CloudDownload className="h-9 w-9 text-[#55504a]" />
          <p className="neo-copy mt-6 text-[10px] font-bold uppercase text-[#55504a]">
            Installation... 45%
          </p>
          <div className="mt-4 h-2 w-[80%] border border-black bg-[#efe6d4]">
            <div className="h-full w-[45%] bg-[#c20b2f]" />
          </div>
        </div>
        <div className="p-4">
          <h2 className="text-xl font-black uppercase text-[#6c675e]">
            {game.title}
          </h2>
          <p className="neo-copy mt-3 text-[10px] font-bold uppercase text-[#6c675e]">
            {game.description}
          </p>
          <button
            className="neo-copy mt-6 h-9 w-full border-2 border-[#6c675e] text-xs font-bold uppercase text-[#6c675e]"
            disabled={isBusy || isVerifying}
            type="button"
            onClick={() => onVerifyAction(game)}
          >
            {getButtonLabel(game, isBusy)}
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="overflow-hidden border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411] sm:row-span-2">
      <div className={`${artClassById[game.id] ?? "library-art-mech"} relative h-[54%] border-b-4 border-black`}>
        {game.status === "update_available" ? (
          <span className="neo-copy absolute right-3 top-[60%] border-2 border-black bg-[#087d6d] px-3 py-3 text-[10px] font-bold uppercase text-white">
            Neu
          </span>
        ) : null}
        {game.id === "iron-vale" ? (
          <div className="absolute bottom-7 left-1/2 h-28 w-24 -translate-x-1/2 rounded-t-full border-4 border-[#171411] bg-[#595b52]" />
        ) : null}
      </div>
      <div className="p-4">
        <h2 className="text-2xl font-black uppercase leading-tight text-[#171411]">
          {game.title}
        </h2>
        <p className="neo-copy mt-2 text-[10px] font-bold uppercase text-[#55504a]">
          {game.description}
        </p>
        <button
          className={`neo-copy mt-6 h-9 w-full border-2 border-black px-4 text-xs font-bold uppercase shadow-[2px_2px_0_#171411] ${
            game.status === "update_available"
              ? "bg-[#c20b2f] text-white"
              : "bg-[#f5eedf] text-[#171411]"
          }`}
          disabled={isBusy}
          type="button"
          onClick={() => onPrimaryAction(game)}
        >
          {isBusy ? (
            <span className="inline-flex items-center gap-2">
              <RotateCw className="h-4 w-4 animate-spin" />
              Warten ...
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Play className="h-3 w-3 fill-current" />
              {getButtonLabel(game, isBusy)}
            </span>
          )}
        </button>
      </div>
    </article>
  );
}
