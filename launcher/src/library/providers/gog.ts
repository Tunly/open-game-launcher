import { fetchGogOwnedGames, gogGetToken, gogRefreshToken } from "../../lib/launcher";
import { installedGogKeys, ownedGameToGame } from "../../lib/library-providers";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import type { Game } from "../../lib/types";
import type { MergeContext, ProviderResult } from "./types";

export async function mergeGogOwned(games: Game[], context: MergeContext): Promise<ProviderResult> {
  void context;
  const warnings: string[] = [];
  const statusMessage: string | null = null;

  try {
    const backendToken = await gogGetToken();
    const localTokenStr = localStorage.getItem(STORAGE_KEYS.GOG_TOKEN);
    const hasGogSession = Boolean(backendToken?.accessToken) || Boolean(localTokenStr);

    if (!hasGogSession) {
      return { games, warnings, statusMessage };
    }

    try {
      const refreshed = await gogRefreshToken();
      if (refreshed?.accessToken) {
        localStorage.setItem(
          STORAGE_KEYS.GOG_TOKEN,
          JSON.stringify({
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            expiresAt: refreshed.expiresAt,
            userId: refreshed.userId,
          }),
        );
      }
    } catch {
      // Token refresh failed, proceed with existing token
    }

    const ownedRaw = await fetchGogOwnedGames();
    const ownedGogGames = ownedRaw.map(ownedGameToGame);
    if (ownedGogGames.length === 0) {
      return { games, warnings, statusMessage };
    }

    const installed = installedGogKeys(games);
    const uninstalledOwned = ownedGogGames.filter((og) => {
      const ownedId = og.externalId ?? og.id.replace(/^gog-owned-/, "");
      if (installed.has(og.id) || installed.has(og.title.toLowerCase())) {
        return false;
      }
      if (installed.has(ownedId) || installed.has(`gog-owned-${ownedId}`)) {
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
    warnings.push(`Failed to fetch owned GOG games during load: ${err}`);
    return { games, warnings, statusMessage };
  }
}
