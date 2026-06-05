import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { GameGroup } from "../../../lib/game-groups";
import type { Game, SyncGameAchievementsResponse } from "../../../lib/types";
import { useAchievementAutoSync } from "../useAchievementAutoSync";

const providerState = vi.hoisted(() => ({
  syncByProvider: new Map<string, ReturnType<typeof vi.fn>>(),
  updateAchievementProviderStatus: vi.fn(),
}));

vi.mock("../../useActivityLogger", () => ({
  useActivityLogger: () => ({
    logAchievement: vi.fn(),
  }),
}));

vi.mock("../../../lib/achievement-providers", () => ({
  achievementProviderForGame: (game: Game) => {
    const provider = game.launcher ?? "unknown";
    const sync = providerState.syncByProvider.get(provider);
    return {
      provider,
      stability: "official",
      status: sync ? "available" : "unsupported",
      message: sync ? `${provider} achievement sync available` : `${provider} unavailable`,
      isAvailable: () => Boolean(sync),
      sync: sync ?? vi.fn(),
    };
  },
  achievementProviderStatusForGame: (game: Game) => ({
    provider: game.launcher ?? "unknown",
    status: "available",
    stability: "official",
    message: "available",
  }),
  syncableAchievementGames: (games: Game[]) =>
    games.filter((game) => providerState.syncByProvider.has(game.launcher ?? "unknown")),
}));

vi.mock("../../../lib/launcher", () => ({
  updateAchievementProviderStatus: (...args: unknown[]) =>
    providerState.updateAchievementProviderStatus(...args),
}));

function game(overrides: Partial<Game>): Game {
  return {
    id: "game",
    title: "Game",
    description: "",
    version: "1.0.0",
    launcher: "manual",
    status: "installed",
    platform: "windows",
    achievements: [],
    saveFiles: [],
    friendsPlaying: [],
    ...overrides,
  };
}

function group(variants: Game[]): GameGroup {
  return {
    id: "group",
    key: "group",
    title: "Grouped Game",
    variants,
    primaryGame: variants[0],
    displayGame: variants[0],
    sources: variants.map((variant) => variant.launcher ?? "unknown"),
    status: "installed",
    playtimeMinutes: 0,
    achievements: [{} as GameGroup["achievements"][number]],
  };
}

function syncResponse(game: Game, syncedAchievements = 10): SyncGameAchievementsResponse {
  return {
    gameId: game.id,
    success: true,
    game: {
      ...game,
      achievements: [
        {
          id: "ach-1",
          name: "First Win",
          unlockedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    },
    syncedAchievements,
    unlockedAchievements: 1,
    message: `${game.launcher} synced`,
  };
}

function syncedAchievement() {
  return {
    id: "existing-ach",
    name: "Existing Achievement",
  };
}

function renderSyncHook(selectedGroup: GameGroup, initialGames: Game[]) {
  const statusMessages: Array<string | null> = [];
  return {
    statusMessages,
    hook: renderHook(() => {
      const [games, setGames] = useState(initialGames);
      const sync = useAchievementAutoSync({
        selectedGroup,
        setInstalledGames: setGames as Dispatch<SetStateAction<Game[]>>,
        setStatusMessage: (message) => {
          statusMessages.push(typeof message === "function" ? message(null) : message);
        },
      });
      return { games, sync };
    }),
  };
}

describe("useAchievementAutoSync", () => {
  beforeEach(() => {
    providerState.syncByProvider.clear();
    providerState.updateAchievementProviderStatus.mockReset();
    providerState.updateAchievementProviderStatus.mockResolvedValue(undefined);
  });

  it("summarizes partial success across multiple achievement providers", async () => {
    const steamGame = game({
      id: "steam-1",
      title: "Steam Game",
      launcher: "steam",
      achievements: [syncedAchievement()],
    });
    const xboxGame = game({
      id: "xbox-1",
      title: "Xbox Game",
      launcher: "xbox",
      achievements: [syncedAchievement()],
    });
    providerState.syncByProvider.set("steam", vi.fn().mockResolvedValue(syncResponse(steamGame)));
    providerState.syncByProvider.set(
      "xbox",
      vi.fn().mockRejectedValue(new Error("Xbox TitleId could not be resolved")),
    );

    const { hook, statusMessages } = renderSyncHook(group([steamGame, xboxGame]), [
      steamGame,
      xboxGame,
    ]);

    await act(async () => {
      await hook.result.current.sync.handleSyncAchievements();
    });

    expect(providerState.syncByProvider.get("steam")).toHaveBeenCalledTimes(1);
    expect(providerState.syncByProvider.get("xbox")).toHaveBeenCalledTimes(1);
    expect(providerState.updateAchievementProviderStatus).toHaveBeenCalledWith({
      gameId: "steam-1",
      status: {
        source: "steam",
        status: "available",
        stability: "official",
        message: "steam synced",
      },
    });
    expect(providerState.updateAchievementProviderStatus).toHaveBeenCalledWith({
      gameId: "xbox-1",
      status: {
        source: "xbox",
        status: "failed",
        stability: "official",
        message: "Xbox TitleId could not be resolved",
      },
    });
    expect(statusMessages.at(-1)).toBe(
      "Synced 1/2 achievement providers (10 achievements). 1 provider failed: XBOX.",
    );
    expect(
      hook.result.current.games.find((game) => game.id === "steam-1")?.achievementProviderStatuses,
    ).toEqual([
      {
        source: "steam",
        status: "available",
        stability: "official",
        message: "steam synced",
      },
    ]);
    expect(
      hook.result.current.games.find((game) => game.id === "xbox-1")?.achievementProviderStatuses,
    ).toEqual([
      {
        source: "xbox",
        status: "failed",
        stability: "official",
        message: "Xbox TitleId could not be resolved",
      },
    ]);
    expect(
      hook.result.current.games.find((game) => game.id === "steam-1")?.achievements,
    ).toHaveLength(1);
  });

  it("auto-syncs providers that are missing achievements even when the group has other achievements", async () => {
    const steamGame = game({
      id: "steam-1",
      title: "Steam Game",
      launcher: "steam",
      achievements: [syncedAchievement()],
    });
    const xboxGame = game({ id: "xbox-1", title: "Xbox Game", launcher: "xbox" });
    const xboxSync = vi.fn().mockResolvedValue(syncResponse(xboxGame));
    providerState.syncByProvider.set("steam", vi.fn().mockResolvedValue(syncResponse(steamGame)));
    providerState.syncByProvider.set("xbox", xboxSync);

    const { hook, statusMessages } = renderSyncHook(group([steamGame, xboxGame]), [
      steamGame,
      xboxGame,
    ]);

    await waitFor(() => {
      expect(xboxSync).toHaveBeenCalledTimes(1);
      expect(
        hook.result.current.games.find((game) => game.id === "xbox-1")?.achievements,
      ).toHaveLength(1);
    });

    expect(providerState.syncByProvider.get("steam")).not.toHaveBeenCalled();
    expect(statusMessages).toEqual([]);
  });
});
