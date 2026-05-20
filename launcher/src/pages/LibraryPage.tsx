import { useState } from "react";

import { GameCard } from "../components/launcher/GameCard";
import { Badge } from "../components/ui/Badge";
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
    <section className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Badge variant="success">
          {libraryGames.filter((game) => game.status === "installed").length}{" "}
          installed
        </Badge>
        <Badge variant="warning">
          {
            libraryGames.filter((game) => game.status === "update_available")
              .length
          }{" "}
          updates
        </Badge>
        <Badge variant="muted">{libraryGames.length} owned</Badge>
      </div>

      {statusMessage ? (
        <div className="rounded-lg border border-sky-300/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {libraryGames.map((game) => (
          <GameCard
            key={game.id}
            game={game}
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
