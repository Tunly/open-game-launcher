import { eaFetchOwnedGames, eaGetToken } from "../../lib/launcher";
import {
  getProviderErrorMessage,
  installedEaKeys,
  ownedGameToGame,
} from "../../lib/library-providers";
import { clearLegacyEaTokenCopy } from "../../lib/platform-token-storage";
import type { Game } from "../../lib/types";
import type { MergeContext, ProviderResult } from "./types";

export async function mergeEaOwned(games: Game[], context: MergeContext): Promise<ProviderResult> {
  void context;
  const warnings: string[] = [];
  let statusMessage: string | null = null;

  try {
    const eaToken = await eaGetToken();
    if (!eaToken?.accessToken) {
      clearLegacyEaTokenCopy();
      return { games, warnings, statusMessage };
    }

    clearLegacyEaTokenCopy();

    const ownedRaw = await eaFetchOwnedGames();
    const ownedEaGames = ownedRaw.map(ownedGameToGame);
    if (ownedEaGames.length === 0) {
      statusMessage =
        "EA is connected but returned 0 games. Try Settings → EA App → Disconnect, then connect again.";
      return { games, warnings, statusMessage };
    }

    const installed = installedEaKeys(games);
    const uninstalledOwned = ownedEaGames.filter((og) => {
      const ownedId = og.externalId ?? og.id.replace(/^ea-owned-/, "");
      if (installed.has(og.id) || installed.has(og.title.toLowerCase())) {
        return false;
      }
      if (installed.has(ownedId) || installed.has(`ea-owned-${ownedId}`)) {
        return false;
      }
      return true;
    });

    return {
      games: [...games, ...uninstalledOwned],
      warnings,
      statusMessage,
    };
  } catch (err) {
    const msg = getProviderErrorMessage(err);
    warnings.push(`Failed to fetch owned EA games during load: ${msg}`);
    if (msg.includes("expired") || msg.includes("not connected")) {
      clearLegacyEaTokenCopy();
    }
    statusMessage =
      "EA library could not be refreshed. Open Settings > EA App to reconnect, then try again.";
    return { games, warnings, statusMessage };
  }
}
