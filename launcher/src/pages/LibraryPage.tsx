import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { GameCard } from "../components/launcher/GameCard";
import { libraryGames } from "../lib/mock-data";
import { launchGame, startDownload, verifyGameFiles } from "../lib/launcher";
import type { Game } from "../lib/types";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function LibraryPage() {
  const [busyGameId, setBusyGameId] = useState<string | null>(null);
  const [verifyingGameId, setVerifyingGameId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function handlePrimaryAction(game: Game) {
    setBusyGameId(game.id);
    setStatusMessage(null);

    try {
      if (game.status === "installed") {
        const response = await launchGame(game.id);
        setStatusMessage(response.message);
        return;
      }

      const response = await startDownload(game.id);
      setStatusMessage(response.message);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      setBusyGameId(null);
    }
  }

  async function handleVerify(game: Game) {
    setVerifyingGameId(game.id);
    setStatusMessage(null);

    try {
      const response = await verifyGameFiles(game.id);
      const missingCount = response.missingFiles.length;
      setStatusMessage(
        `${game.title}: ${response.checkedFiles} files checked, ${missingCount} missing.`,
      );
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      setVerifyingGameId(null);
    }
  }

  return (
    <section>
      <div className="mb-10 border-b-4 border-black pb-4">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="neo-copy inline-flex border-2 border-black bg-[#c20b2f] px-3 py-1 text-xs font-bold uppercase text-[#fffaf0] shadow-[3px_3px_0_#171411]">
              Netzwerk verbunden
            </span>
            <h1 className="neo-title mt-2 max-w-[440px] text-7xl leading-[0.82] text-[#171411] sm:text-8xl">
              Meine Bibliothek
            </h1>
            <p className="neo-copy mt-3 text-xs font-bold uppercase text-[#55504a]">
              42 installierte Spiele // 12 Updates verfugbar
            </p>
          </div>

          <div className="neo-copy flex gap-3 text-xs font-bold uppercase">
            <button
              className="flex h-10 items-center gap-3 border-2 border-black bg-[#f5eedf] px-5 shadow-[2px_2px_0_#171411]"
              type="button"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtern
            </button>
            <button
              className="flex h-10 items-center gap-3 border-2 border-black bg-[#f5eedf] px-5 shadow-[2px_2px_0_#171411]"
              type="button"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Sortieren
            </button>
          </div>
        </div>
      </div>

      {statusMessage ? (
        <div className="neo-copy mb-5 border-2 border-black bg-[#efe6d4] px-4 py-3 text-xs font-bold uppercase text-[#171411] shadow-[3px_3px_0_#171411]">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid auto-rows-[170px] gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {libraryGames.map((game, index) => (
          <GameCard
            key={game.id}
            game={game}
            index={index}
            isBusy={busyGameId === game.id}
            isVerifying={verifyingGameId === game.id}
            onPrimaryAction={handlePrimaryAction}
            onVerifyAction={handleVerify}
          />
        ))}
      </div>
    </section>
  );
}
