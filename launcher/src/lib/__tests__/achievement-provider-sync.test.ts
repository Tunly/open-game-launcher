import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AchievementProvider } from "../achievement-providers";
import {
  persistAchievementProviderStatus,
  syncAchievementProviderGame,
} from "../achievement-provider-sync";
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
  beforeEach(() => {
    launcherMocks.updateAchievementProviderStatus.mockReset();
    launcherMocks.updateAchievementProviderStatus.mockResolvedValue(undefined);
  });

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

  it("keeps Epic provider-only status in the frontend snapshot without a native row write", async () => {
    await persistAchievementProviderStatus("epic-owned-catalog-app", {
      message: "Epic achievements synced.",
      source: "epic",
      stability: "unofficial",
      status: "available",
    });

    expect(launcherMocks.updateAchievementProviderStatus).not.toHaveBeenCalled();
  });

  it("classifies missing Epic best-effort sources as provider unavailable", async () => {
    const game: Game = {
      achievements: [],
      description: "",
      externalId: "catalog-app",
      id: "epic-owned-catalog-app",
      launcher: "epic",
      platform: "windows",
      status: "not_installed",
      title: "Epic Catalog Game",
      version: "1.0.0",
    };
    const provider: AchievementProvider = {
      isAvailable: () => true,
      message: "Epic best-effort sync available",
      provider: "epic",
      stability: "unofficial",
      status: "available",
      sync: vi
        .fn()
        .mockRejectedValue(
          new Error(
            "No local epic achievement cache found for Epic Catalog Game. Checked: cache.json. Epic public fallback failed: No public Epic achievement page matched Epic Catalog Game.",
          ),
        ),
    };

    const outcome = await syncAchievementProviderGame(game, provider);

    expect(outcome).toMatchObject({
      diagnosticMessage: expect.stringContaining("No local epic achievement cache"),
      game: { id: game.id },
      status: {
        source: "epic",
        status: "not_connected",
      },
      success: false,
    });
    expect(launcherMocks.updateAchievementProviderStatus).not.toHaveBeenCalled();
  });

  it("keeps unexpected Epic sync errors as failures", async () => {
    const game: Game = {
      achievements: [],
      description: "",
      id: "epic-local-install",
      launcher: "epic",
      platform: "windows",
      status: "installed",
      title: "Installed Epic Game",
      version: "1.0.0",
    };
    const provider: AchievementProvider = {
      isAvailable: () => true,
      message: "Epic best-effort sync available",
      provider: "epic",
      stability: "unofficial",
      status: "available",
      sync: vi.fn().mockRejectedValue(new Error("Legendary returned malformed JSON")),
    };

    const outcome = await syncAchievementProviderGame(game, provider);

    expect(outcome).toMatchObject({
      diagnosticMessage: "Legendary returned malformed JSON",
      status: { source: "epic", status: "failed" },
      success: false,
    });
    expect(launcherMocks.updateAchievementProviderStatus).toHaveBeenCalledWith({
      gameId: game.id,
      status: expect.objectContaining({ source: "epic", status: "failed" }),
    });
  });

  it("still reports native persistence failures for real local provider games", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    launcherMocks.updateAchievementProviderStatus.mockRejectedValueOnce(
      new Error("SQLite write failed"),
    );

    await persistAchievementProviderStatus("epic-local-install", {
      message: "Epic achievements synced.",
      source: "epic",
      stability: "unofficial",
      status: "available",
    });

    expect(launcherMocks.updateAchievementProviderStatus).toHaveBeenCalledWith({
      gameId: "epic-local-install",
      status: {
        message: "Epic achievements synced.",
        source: "epic",
        stability: "unofficial",
        status: "available",
      },
    });
    expect(warn).toHaveBeenCalledWith(
      "[OG-Launcher] Achievement provider status update failed:",
      expect.any(Error),
    );
    warn.mockRestore();
  });
});
