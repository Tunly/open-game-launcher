import { mergeBattlenetOwned } from "./battlenet";
import { mergeEaOwned } from "./ea";
import { mergeEpicOwned } from "./epic";
import { mergeGamePassCatalog } from "./gamepass";
import { mergeGogOwned } from "./gog";
import { mergeOglCatalog } from "./ogl";
import { mergeSteamOwned } from "./steam";
import { mergeUbisoftOwned } from "./ubisoft";
import { mergeXboxOwned } from "./xbox";
import type { ProviderMerger } from "./types";
import { mergerId } from "./types";

/**
 * The single ordered inventory-enrichment pipeline. Both the library sync and
 * the achievements page run the same mergers in the same order; keeping the
 * list here (rather than in each consumer) means adding or reordering a
 * provider touches exactly one module.
 */
export const providerInventoryPipeline: readonly ProviderMerger[] = [
  mergeOglCatalog,
  mergeBattlenetOwned,
  mergeSteamOwned,
  mergeGogOwned,
  mergeEaOwned,
  mergeEpicOwned,
  mergeUbisoftOwned,
  mergeXboxOwned,
  mergeGamePassCatalog,
];

/** Run every merger in order, collecting warnings and the last status message. */
export async function runProviderInventory(
  games: import("../../lib/types").Game[],
  context: import("./types").MergeContext,
  options: {
    onMergerApplied?: (mergerId: string, games: import("../../lib/types").Game[]) => void;
  } = {},
): Promise<{
  games: import("../../lib/types").Game[];
  warnings: string[];
  statusMessage: string | null;
}> {
  let currentGames = games;
  const warnings: string[] = [];
  let statusMessage: string | null = null;

  for (const merger of providerInventoryPipeline) {
    const result = await merger(currentGames, context).catch((error) => {
      console.warn("Provider merge threw unexpectedly:", error);
      return null;
    });
    if (!result) {
      // An unexpected provider failure must not stop the remaining mergers.
      if (!context.shouldApplyResult()) {
        return { games: currentGames, warnings, statusMessage };
      }
      continue;
    }
    if (!context.shouldApplyResult()) {
      return { games: currentGames, warnings, statusMessage };
    }
    warnings.push(...result.warnings);
    if (result.statusMessage) {
      statusMessage = result.statusMessage;
    }
    currentGames = result.games;
    options.onMergerApplied?.(mergerId(merger), currentGames);
  }

  return { games: currentGames, warnings, statusMessage };
}
