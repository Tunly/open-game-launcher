import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { GameGroup } from "../../../lib/game-groups";
import type { Game, SyncGameAchievementsResponse } from "../../../lib/types";
import { useAchievementAutoSync } from "../useAchievementAutoSync";

const providerState = vi.hoisted(() => ({
  ingestTrustedAchievements: vi.fn(),
  emitAchievementPopup: vi.fn(),
  syncByProvider: new Map<string, ReturnType<typeof vi.fn>>(),
  updateAchievementProviderStatus: vi.fn(),
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

vi.mock("../../../lib/overlay", () => ({
  emitAchievementPopup: (...args: unknown[]) => providerState.emitAchievementPopup(...args),
}));

vi.mock("../../../lib/supabase/achievements", () => ({
  ingestTrustedAchievements: (...args: unknown[]) =>
    providerState.ingestTrustedAchievements(...args),
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
    hook: renderHook(
      (props: { selectedGroup: GameGroup }) => {
        const [games, setGames] = useState(initialGames);
        const sync = useAchievementAutoSync({
          installedGames: games,
          selectedGroup: props.selectedGroup,
          setInstalledGames: setGames as Dispatch<SetStateAction<Game[]>>,
          setStatusMessage: (message) => {
            statusMessages.push(typeof message === "function" ? message(null) : message);
          },
        });
        return { games, sync };
      },
      { initialProps: { selectedGroup } },
    ),
  };
}

describe("useAchievementAutoSync", () => {
  beforeEach(() => {
    providerState.ingestTrustedAchievements.mockReset();
    providerState.ingestTrustedAchievements.mockResolvedValue({
      achievementsSynced: 0,
      newUnlocks: 0,
      ok: true,
      persistence: "hosted",
      skipped: false,
      unlockedCount: 0,
      xpDelta: 0,
    });
    providerState.emitAchievementPopup.mockReset();
    providerState.emitAchievementPopup.mockResolvedValue(undefined);
    providerState.syncByProvider.clear();
    providerState.updateAchievementProviderStatus.mockReset();
    providerState.updateAchievementProviderStatus.mockResolvedValue(undefined);
  });

  it("does nothing without a selected group or a supported provider candidate", () => {
    const setInstalledGames = vi.fn();
    const setStatusMessage = vi.fn();
    const emptySelection = renderHook(() =>
      useAchievementAutoSync({
        selectedGroup: null,
        setInstalledGames,
        setStatusMessage,
      }),
    );

    expect(emptySelection.result.current.syncingAchievementGameId).toBeNull();
    expect(setInstalledGames).not.toHaveBeenCalled();

    const unsupportedGame = game({ id: "manual-1", launcher: "manual" });
    renderSyncHook(group([unsupportedGame]), [unsupportedGame]);

    expect(providerState.updateAchievementProviderStatus).not.toHaveBeenCalled();
    expect(setStatusMessage).not.toHaveBeenCalled();
  });

  it("does not repeat an auto-sync for the same provider identity", async () => {
    const steamGame = game({
      id: "steam-1",
      launcher: "steam",
      externalId: "123",
    });
    const steamSync = vi.fn().mockResolvedValue(syncResponse(steamGame));
    providerState.syncByProvider.set("steam", steamSync);

    const { hook } = renderSyncHook(group([steamGame]), [steamGame]);
    await waitFor(() => {
      expect(steamSync).toHaveBeenCalledTimes(1);
    });

    hook.rerender({ selectedGroup: group([{ ...steamGame }]) });

    await waitFor(() => {
      expect(steamSync).toHaveBeenCalledTimes(1);
    });
  });

  it("auto-syncs every supported provider in the selected group without user status messages", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
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

    await waitFor(() => {
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
      expect(
        hook.result.current.games.find((game) => game.id === "steam-1")
          ?.achievementProviderStatuses,
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
    expect(statusMessages).toEqual([]);
  });

  it("submits successful provider sync results to trusted achievement ingestion", async () => {
    const steamGame = game({
      id: "steam-1",
      title: "Steam Game",
      launcher: "steam",
      achievements: [syncedAchievement()],
    });
    providerState.syncByProvider.set("steam", vi.fn().mockResolvedValue(syncResponse(steamGame)));

    renderSyncHook(group([steamGame]), [steamGame]);

    await waitFor(() => {
      expect(providerState.ingestTrustedAchievements).toHaveBeenCalledTimes(1);
    });
    expect(providerState.ingestTrustedAchievements).toHaveBeenCalledWith({
      game: expect.objectContaining({
        achievements: [
          {
            id: "ach-1",
            name: "First Win",
            unlockedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        id: "steam-1",
      }),
      provider: "steam",
      providerConfidence: "official",
      syncedAt: null,
    });
  });

  it("does not submit trusted achievement ingestion when provider sync fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const steamGame = game({
      id: "steam-1",
      title: "Steam Game",
      launcher: "steam",
      achievements: [syncedAchievement()],
    });
    providerState.syncByProvider.set(
      "steam",
      vi.fn().mockRejectedValue(new Error("Steam profile is private")),
    );

    renderSyncHook(group([steamGame]), [steamGame]);

    await waitFor(() => {
      expect(providerState.updateAchievementProviderStatus).toHaveBeenCalledWith({
        gameId: "steam-1",
        status: {
          source: "steam",
          status: "failed",
          stability: "official",
          message: "Steam profile is private",
        },
      });
    });

    expect(providerState.ingestTrustedAchievements).not.toHaveBeenCalled();
  });

  it("auto-syncs providers even when local achievements already exist", async () => {
    const steamGame = game({
      id: "steam-1",
      title: "Steam Game",
      launcher: "steam",
      achievements: [syncedAchievement()],
    });
    const xboxGame = game({ id: "xbox-1", title: "Xbox Game", launcher: "xbox" });
    const steamSync = vi.fn().mockResolvedValue(syncResponse(steamGame));
    const xboxSync = vi.fn().mockResolvedValue(syncResponse(xboxGame));
    providerState.syncByProvider.set("steam", steamSync);
    providerState.syncByProvider.set("xbox", xboxSync);

    const { hook, statusMessages } = renderSyncHook(group([steamGame, xboxGame]), [
      steamGame,
      xboxGame,
    ]);

    await waitFor(() => {
      expect(steamSync).toHaveBeenCalledTimes(1);
      expect(xboxSync).toHaveBeenCalledTimes(1);
      expect(
        hook.result.current.games.find((game) => game.id === "xbox-1")?.achievements,
      ).toHaveLength(1);
    });

    expect(statusMessages).toEqual([]);
  });

  it("retries auto-sync when provider sync identity changes after a failed attempt", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const staleSteamGame = game({
      id: "steam-1",
      title: "Steam Game",
      launcher: "steam",
      externalId: "111",
      achievements: [syncedAchievement()],
    });
    const refreshedSteamGame = {
      ...staleSteamGame,
      externalId: "222",
    };
    const steamSync = vi
      .fn()
      .mockRejectedValueOnce(new Error("Steam AppID changed during library refresh"))
      .mockResolvedValueOnce(syncResponse(refreshedSteamGame));
    providerState.syncByProvider.set("steam", steamSync);

    const { hook, statusMessages } = renderSyncHook(group([staleSteamGame]), [staleSteamGame]);

    await waitFor(() => {
      expect(steamSync).toHaveBeenCalledTimes(1);
    });

    hook.rerender({ selectedGroup: group([refreshedSteamGame]) });

    await waitFor(() => {
      expect(steamSync).toHaveBeenCalledTimes(2);
      expect(steamSync.mock.calls[0]?.[0]).toMatchObject({ externalId: "111" });
      expect(steamSync.mock.calls[1]?.[0]).toMatchObject({ externalId: "222" });
      expect(
        hook.result.current.games.find((game) => game.id === "steam-1")?.achievements,
      ).toHaveLength(1);
    });
    expect(statusMessages).toEqual([]);
  });

  it("keeps locally synced achievements and exposes a manual retry when hosted ingestion fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const steamGame = game({ id: "steam-1", launcher: "steam" });
    providerState.syncByProvider.set("steam", vi.fn().mockResolvedValue(syncResponse(steamGame)));
    providerState.ingestTrustedAchievements
      .mockRejectedValueOnce(new Error("attestation required"))
      .mockResolvedValueOnce({
        achievementsSynced: 1,
        newUnlocks: 0,
        ok: true,
        persistence: "hosted",
        skipped: false,
        unlockedCount: 1,
        xpDelta: 0,
      });

    const { hook } = renderSyncHook(group([steamGame]), [steamGame]);
    await waitFor(() => {
      expect(hook.result.current.games[0]?.achievements).toHaveLength(1);
      expect(hook.result.current.games[0]?.achievementProviderStatuses?.[0]).toMatchObject({
        status: "failed",
        message: expect.stringContaining("synced locally"),
      });
    });

    await act(async () => {
      await hook.result.current.sync.syncAchievementsForGame(steamGame);
    });

    expect(providerState.syncByProvider.get("steam")).toHaveBeenCalledTimes(2);
    expect(hook.result.current.games[0]?.achievementProviderStatuses?.[0]).toMatchObject({
      status: "available",
      message: "steam synced",
    });
  });

  it("tracks concurrent loading by game id and emits a camelCase popup for a new unlock", async () => {
    const steamGame = game({ id: "steam-1", launcher: "steam" });
    let resolveSync: (response: SyncGameAchievementsResponse) => void = () => undefined;
    providerState.syncByProvider.set(
      "steam",
      vi.fn(
        () =>
          new Promise<SyncGameAchievementsResponse>((resolve) => {
            resolveSync = resolve;
          }),
      ),
    );

    const { hook } = renderSyncHook(group([steamGame]), [steamGame]);
    await waitFor(() => {
      expect(hook.result.current.sync.syncingAchievementGameIds.has("steam-1")).toBe(true);
      expect(hook.result.current.sync.syncingAchievementGameId).toBe("steam-1");
    });

    await act(async () => {
      resolveSync(syncResponse(steamGame));
    });

    await waitFor(() => {
      expect(hook.result.current.sync.syncingAchievementGameIds.has("steam-1")).toBe(false);
      expect(providerState.emitAchievementPopup).toHaveBeenCalledWith({
        achievementName: "First Win",
        description: "",
        gameTitle: "Game",
        iconUrl: null,
        rarity: "",
      });
    });
  });
});
