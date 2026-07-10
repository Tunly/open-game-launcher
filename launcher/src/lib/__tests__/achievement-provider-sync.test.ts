import { describe, expect, it, vi } from "vitest";

import type { AchievementProvider } from "../achievement-providers";
import { syncAchievementProviderGame } from "../achievement-provider-sync";
import type { Game, SyncGameAchievementsResponse } from "../types";

const launcherMocks = vi.hoisted(() => ({
  updateAchievementProviderStatus: vi.fn(() => Promise.resolve()),
}));

vi.mock("../launcher", () => launcherMocks);

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("achievement provider sync", () => {
  it("shares one typed provider outcome across archive and library callers", async () => {
    const game: Game = {
      achievements: [],
      description: "",
      externalId: "shared-provider-game",
      id: "gog-shared-provider-game",
      launcher: "gog",
      platform: "windows",
      status: "installed",
      title: "Shared Provider Game",
      version: "1.0.0",
    };
    const pending = deferred<SyncGameAchievementsResponse>();
    const providerSync = vi.fn(() => pending.promise);
    const provider: AchievementProvider = {
      isAvailable: () => true,
      message: "GOG achievement sync available",
      provider: "gog",
      stability: "unofficial",
      status: "available",
      sync: providerSync,
    };

    const archiveOutcome = syncAchievementProviderGame(game, provider);
    const libraryOutcome = syncAchievementProviderGame(game, provider);

    await vi.waitFor(() => expect(providerSync).toHaveBeenCalledTimes(1));
    pending.resolve({
      game: {
        ...game,
        achievements: [
          {
            id: "gog-shared-achievement",
            name: "Shared Achievement",
            unlockedAt: "2026-07-10T12:00:00Z",
          },
        ],
      },
      gameId: game.id,
      message: "GOG achievements synced.",
      success: true,
      syncedAchievements: 1,
      unlockedAchievements: 1,
    });

    const [archive, library] = await Promise.all([archiveOutcome, libraryOutcome]);
    expect(archive).toBe(library);
    expect(archive).toMatchObject({
      game: { id: game.id },
      response: { gameId: game.id, syncedAchievements: 1 },
      status: { source: "gog", status: "available" },
      success: true,
    });
    expect(launcherMocks.updateAchievementProviderStatus).toHaveBeenCalledTimes(1);
  });
});
