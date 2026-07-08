import { act, renderHook, waitFor } from "@testing-library/react";
import { isTauri } from "@tauri-apps/api/core";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Game } from "../../../lib/types";

const mocks = vi.hoisted(() => {
  const listInstalledGames = vi.fn();
  const refreshInstalledGames = vi.fn();
  const addManualGame = vi.fn();
  const fetchSteamOwnedGames = vi.fn();
  const gogGetToken = vi.fn();
  const eaGetToken = vi.fn();
  const gogRefreshToken = vi.fn();
  const fetchGogOwnedGames = vi.fn();
  const eaFetchOwnedGames = vi.fn();
  const fetchEpicOwnedGames = vi.fn();
  const fetchUbisoftOwnedGames = vi.fn();
  const openSteamScraperWindow = vi.fn();
  const normalizeSteamOwnedGames = vi.fn();
  const syncGamePlaytimeStats = vi.fn();
  const listenMock = vi.fn(() => Promise.resolve(() => undefined));
  const compressAndReadImage = vi.fn();
  const isAllowedImageType = vi.fn();
  return {
    listInstalledGames,
    refreshInstalledGames,
    addManualGame,
    fetchSteamOwnedGames,
    gogGetToken,
    eaGetToken,
    gogRefreshToken,
    fetchGogOwnedGames,
    eaFetchOwnedGames,
    fetchEpicOwnedGames,
    fetchUbisoftOwnedGames,
    openSteamScraperWindow,
    normalizeSteamOwnedGames,
    syncGamePlaytimeStats,
    listenMock,
    compressAndReadImage,
    isAllowedImageType,
  };
});

vi.mock("../../../lib/launcher", () => ({
  listInstalledGames: (...args: unknown[]) => mocks.listInstalledGames(...args),
  refreshInstalledGames: (...args: unknown[]) => mocks.refreshInstalledGames(...args),
  addManualGame: (...args: unknown[]) => mocks.addManualGame(...args),
  fetchSteamOwnedGames: (...args: unknown[]) => mocks.fetchSteamOwnedGames(...args),
  gogGetToken: (...args: unknown[]) => mocks.gogGetToken(...args),
  gogRefreshToken: (...args: unknown[]) => mocks.gogRefreshToken(...args),
  fetchGogOwnedGames: (...args: unknown[]) => mocks.fetchGogOwnedGames(...args),
  eaGetToken: (...args: unknown[]) => mocks.eaGetToken(...args),
  eaFetchOwnedGames: (...args: unknown[]) => mocks.eaFetchOwnedGames(...args),
  fetchEpicOwnedGames: (...args: unknown[]) => mocks.fetchEpicOwnedGames(...args),
  fetchUbisoftOwnedGames: (...args: unknown[]) => mocks.fetchUbisoftOwnedGames(...args),
  openSteamScraperWindow: (...args: unknown[]) => mocks.openSteamScraperWindow(...args),
  normalizeSteamOwnedGames: (...args: unknown[]) => mocks.normalizeSteamOwnedGames(...args),
  syncGamePlaytimeStats: (...args: unknown[]) => mocks.syncGamePlaytimeStats(...args),
}));

vi.mock("../../../lib/supabase/playtime", () => ({
  syncGamePlaytimeStats: (...args: unknown[]) => mocks.syncGamePlaytimeStats(...args),
}));

vi.mock("../../../library/providers", () => ({
  mergeSteamOwned: vi.fn(async (games: Game[]) => ({ games, warnings: [], statusMessage: null })),
  mergeGogOwned: vi.fn(async (games: Game[]) => ({ games, warnings: [], statusMessage: null })),
  mergeEaOwned: vi.fn(async (games: Game[]) => ({ games, warnings: [], statusMessage: null })),
  mergeEpicOwned: vi.fn(async (games: Game[]) => ({ games, warnings: [], statusMessage: null })),
  mergeUbisoftOwned: vi.fn(async (games: Game[]) => ({ games, warnings: [], statusMessage: null })),
  mergeXboxOwned: vi.fn(async (games: Game[]) => ({ games, warnings: [], statusMessage: null })),
  mergeBattlenetOwned: vi.fn(async (games: Game[]) => ({
    games,
    warnings: [],
    statusMessage: null,
  })),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) =>
    mocks.listenMock(...(args as Parameters<typeof mocks.listenMock>)),
  emit: vi.fn(),
}));

vi.mock("../../../lib/image-compress", () => ({
  compressAndReadImage: (...args: unknown[]) =>
    mocks.compressAndReadImage(...(args as Parameters<typeof mocks.compressAndReadImage>)),
  isAllowedImageType: (...args: unknown[]) =>
    mocks.isAllowedImageType(...(args as Parameters<typeof mocks.isAllowedImageType>)),
}));

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "steam-440",
    title: "Team Fortress 2",
    description: "",
    version: "1.0",
    status: "installed",
    platform: "windows",
    playtimeMinutes: 0,
    ...overrides,
  } as Game;
}

import { useLibrarySync } from "../useLibrarySync";

function renderLibrarySync() {
  return renderHook(() => {
    const [, setMsg] = useState<string | null>(null);
    return useLibrarySync({ setStatusMessage: setMsg });
  });
}

function renderLibrarySyncWithStatus() {
  return renderHook(() => {
    const [msg, setMsg] = useState<string | null>(null);
    return { sync: useLibrarySync({ setStatusMessage: setMsg }), msg };
  });
}

function setupDefaultMocks() {
  mocks.listInstalledGames.mockReset();
  mocks.refreshInstalledGames.mockReset();
  mocks.addManualGame.mockReset();
  mocks.fetchSteamOwnedGames.mockReset();
  mocks.gogGetToken.mockReset();
  mocks.eaGetToken.mockReset();
  mocks.gogRefreshToken.mockReset();
  mocks.fetchGogOwnedGames.mockReset();
  mocks.eaFetchOwnedGames.mockReset();
  mocks.fetchEpicOwnedGames.mockReset();
  mocks.fetchUbisoftOwnedGames.mockReset();
  mocks.openSteamScraperWindow.mockReset();
  mocks.normalizeSteamOwnedGames.mockReset();
  mocks.syncGamePlaytimeStats.mockReset();
  mocks.listenMock.mockReset();
  mocks.listenMock.mockImplementation(() => Promise.resolve(() => undefined));
  mocks.compressAndReadImage.mockReset();
  mocks.isAllowedImageType.mockReset();

  mocks.listInstalledGames.mockResolvedValue([]);
  mocks.refreshInstalledGames.mockResolvedValue([]);
  mocks.gogGetToken.mockResolvedValue(null);
  mocks.eaGetToken.mockResolvedValue(null);
  mocks.gogRefreshToken.mockResolvedValue(null);
  mocks.fetchGogOwnedGames.mockResolvedValue([]);
  mocks.eaFetchOwnedGames.mockResolvedValue([]);
  mocks.fetchEpicOwnedGames.mockResolvedValue([]);
  mocks.fetchUbisoftOwnedGames.mockResolvedValue([]);
  mocks.fetchSteamOwnedGames.mockResolvedValue([]);
  mocks.normalizeSteamOwnedGames.mockImplementation((raw: unknown) =>
    Array.isArray(raw) ? raw : [],
  );
  mocks.openSteamScraperWindow.mockResolvedValue(undefined);
  mocks.syncGamePlaytimeStats.mockResolvedValue(undefined);
  mocks.compressAndReadImage.mockResolvedValue("");
  mocks.isAllowedImageType.mockImplementation(
    (file: { type?: string }) =>
      typeof file?.type === "string" &&
      ["image/jpeg", "image/png", "image/webp"].includes(file.type),
  );
}

describe("useLibrarySync", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setupDefaultMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("starts with empty installedGames when no snapshot exists", async () => {
    const { result } = renderLibrarySyncWithStatus();

    await waitFor(() => {
      expect(result.current.sync.isDiscoveringGames).toBe(false);
    });

    expect(result.current.sync.installedGames).toEqual([]);
    expect(mocks.listInstalledGames).toHaveBeenCalled();
  });

  it("hydrates from a persisted library snapshot", async () => {
    const persisted: Game[] = [makeGame({ id: "steam-1", title: "Persisted" })];
    window.localStorage.setItem("launcher_library_snapshot", JSON.stringify(persisted));
    mocks.listInstalledGames.mockResolvedValue([]);

    const { result } = renderLibrarySync();

    await waitFor(() => {
      expect(result.current.installedGames.some((g) => g.id === "steam-1")).toBe(true);
    });
  });

  it("drops legacy Xbox cloud catalog entries from persisted snapshots", async () => {
    const persisted: Game[] = [
      makeGame({ id: "steam-1", title: "Persisted" }),
      makeGame({ id: "gamepass-cloud", title: "Cloud Catalog Entry", launcher: "xbox" }),
    ];
    window.localStorage.setItem("launcher_library_snapshot", JSON.stringify(persisted));
    mocks.listInstalledGames.mockResolvedValue([]);

    const { result } = renderLibrarySync();

    await waitFor(() => {
      expect(result.current.installedGames.some((g) => g.id === "steam-1")).toBe(true);
    });

    expect(result.current.installedGames.some((g) => g.id.startsWith("gamepass-"))).toBe(false);
  });

  it("does not require an Xbox cloud catalog fetch on startup", async () => {
    const persisted: Game[] = [makeGame({ id: "steam-1", title: "Persisted" })];
    window.localStorage.setItem("launcher_library_snapshot", JSON.stringify(persisted));
    mocks.listInstalledGames.mockResolvedValue(persisted);

    const { result } = renderLibrarySync();

    await waitFor(() => {
      expect(result.current.installedGames.some((g) => g.id === "steam-1")).toBe(true);
    });
  });

  it("uses refreshInstalledGames when forceRefresh is true via runAutomaticLibrarySync", async () => {
    mocks.listInstalledGames.mockResolvedValue([makeGame({ id: "steam-1", title: "Initial" })]);
    mocks.refreshInstalledGames.mockResolvedValue([
      makeGame({ id: "steam-2", title: "Refreshed" }),
    ]);

    const { result } = renderLibrarySync();

    await waitFor(() => {
      expect(mocks.listInstalledGames).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.runAutomaticLibrarySync(true);
    });

    expect(mocks.refreshInstalledGames).toHaveBeenCalled();
    expect(result.current.installedGames.some((g) => g.id === "steam-2")).toBe(true);
  });

  it("skips state updates when shouldApplyResult returns false", async () => {
    const { result } = renderLibrarySync();

    await waitFor(() => {
      expect(result.current.isDiscoveringGames).toBe(false);
    });

    await act(async () => {
      await result.current.loadInstalledGames(false, () => false, false);
    });

    expect(result.current.installedGames).toEqual([]);
  });

  it("dedupes runAutomaticLibrarySync calls while a sync is in flight", async () => {
    let resolveRefresh: (games: Game[]) => void = () => undefined;
    mocks.refreshInstalledGames.mockImplementationOnce(
      () =>
        new Promise<Game[]>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const { result } = renderLibrarySync();

    await waitFor(() => {
      expect(result.current.isDiscoveringGames).toBe(false);
    });

    await act(async () => {
      const p1 = result.current.runAutomaticLibrarySync(true);
      const p2 = result.current.runAutomaticLibrarySync(true);
      resolveRefresh([makeGame({ id: "steam-1" })]);
      await Promise.all([p1, p2]);
    });

    expect(mocks.refreshInstalledGames).toHaveBeenCalledTimes(1);
  });

  it("persists installed games to the library snapshot (debounced 300ms)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { result } = renderLibrarySync();

      await waitFor(() => {
        expect(result.current.isDiscoveringGames).toBe(false);
      });

      act(() => {
        result.current.setInstalledGames([makeGame({ id: "steam-snap" })]);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });

      const stored = window.localStorage.getItem("launcher_library_snapshot");
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored as string);
      expect(parsed[0].id).toBe("steam-snap");
    } finally {
      vi.useRealTimers();
    }
  });

  it("tracks runtime game lifecycle events without changing install status", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const handlers = new Map<string, Array<(event: { event: string; payload: unknown }) => void>>();
    mocks.listenMock.mockImplementation((...args: unknown[]) => {
      const [event, handler] = args as [
        string,
        (event: { event: string; payload: unknown }) => void,
      ];
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return Promise.resolve(() => {
        handlers.set(
          event,
          (handlers.get(event) ?? []).filter((current) => current !== handler),
        );
      });
    });
    const runtimeGame = makeGame({
      id: "steam-440",
      title: "Team Fortress 2",
      playtimeMinutes: 7,
    });
    mocks.listInstalledGames.mockResolvedValue([runtimeGame]);
    mocks.refreshInstalledGames.mockResolvedValue([runtimeGame]);

    const { result } = renderLibrarySyncWithStatus();

    await waitFor(() => {
      expect(result.current.sync.installedGames.some((game) => game.id === "steam-440")).toBe(true);
    });

    act(() => {
      handlers.get("game_started")?.forEach((handler) =>
        handler({
          event: "game_started",
          payload: {
            event: "game_started",
            gameId: "steam-440",
            lastPlayed: "2026-06-10T10:00:00Z",
            lastInputSeconds: 45,
            launcher: "steam",
            occurredAt: "2026-06-10T10:00:00Z",
            pid: 4242,
            playtimeMinutes: 7,
            processName: "hl2.exe",
            running: true,
            title: "Team Fortress 2",
            uptimeSeconds: 360,
            windowHandle: "0x1234",
            windowTitle: "Team Fortress 2 - Main Window",
          },
        }),
      );
    });

    expect(result.current.sync.runningGameIds.has("steam-440")).toBe(true);
    expect(result.current.sync.gameRuntimeById["steam-440"]?.processName).toBe("hl2.exe");
    expect(result.current.sync.gameRuntimeById["steam-440"]?.uptimeSeconds).toBe(360);
    expect(result.current.sync.gameRuntimeById["steam-440"]?.lastInputSeconds).toBe(45);
    expect(result.current.sync.gameRuntimeById["steam-440"]?.windowHandle).toBe("0x1234");
    expect(result.current.sync.gameRuntimeById["steam-440"]?.windowTitle).toBe(
      "Team Fortress 2 - Main Window",
    );
    expect(result.current.sync.installedGames[0]?.status).toBe("installed");
    expect(result.current.msg).toBe("Team Fortress 2 is now running.");
    const syncCallsAfterStart = mocks.syncGamePlaytimeStats.mock.calls.length;

    act(() => {
      handlers.get("game_runtime_updated")?.forEach((handler) =>
        handler({
          event: "game_runtime_updated",
          payload: {
            gameId: "steam-440",
            lastInputSeconds: 125,
            launcher: "steam",
            occurredAt: "2026-06-10T10:01:00Z",
            pid: 4242,
            processName: "hl2.exe",
            running: true,
            title: "Team Fortress 2",
            uptimeSeconds: 420,
            windowHandle: "0x1234",
            windowTitle: "Team Fortress 2 - Match Window",
          },
        }),
      );
    });

    expect(result.current.sync.runningGameIds.has("steam-440")).toBe(true);
    expect(result.current.sync.gameRuntimeById["steam-440"]?.lastInputSeconds).toBe(125);
    expect(result.current.sync.gameRuntimeById["steam-440"]?.uptimeSeconds).toBe(420);
    expect(result.current.sync.gameRuntimeById["steam-440"]?.windowTitle).toBe(
      "Team Fortress 2 - Match Window",
    );
    expect(result.current.msg).toBe("Team Fortress 2 is now running.");
    expect(mocks.syncGamePlaytimeStats).toHaveBeenCalledTimes(syncCallsAfterStart);

    act(() => {
      handlers.get("game_stopped")?.forEach((handler) =>
        handler({
          event: "game_stopped",
          payload: {
            event: "game_stopped",
            gameId: "steam-440",
            lastPlayed: "2026-06-10T10:02:00Z",
            lastInputSeconds: 120,
            launcher: "steam",
            occurredAt: "2026-06-10T10:02:00Z",
            pid: null,
            playtimeMinutes: 9,
            processName: null,
            running: false,
            title: "Team Fortress 2",
            uptimeSeconds: null,
          },
        }),
      );
    });

    expect(result.current.sync.runningGameIds.has("steam-440")).toBe(false);
    expect(result.current.sync.gameRuntimeById["steam-440"]).toBeUndefined();
    expect(result.current.sync.installedGames[0]?.playtimeMinutes).toBe(9);
    expect(result.current.msg).toBe("Team Fortress 2 stopped.");
  });

  it("handleLogoLoad deduplicates URLs", async () => {
    const { result } = renderLibrarySync();

    await waitFor(() => {
      expect(result.current.isDiscoveringGames).toBe(false);
    });

    act(() => {
      result.current.handleLogoLoad("https://example.com/logo.png");
    });
    const before = result.current.loadedLogoUrls;
    act(() => {
      result.current.handleLogoLoad("https://example.com/logo.png");
    });
    expect(result.current.loadedLogoUrls).toBe(before);
    expect(result.current.loadedLogoUrls.has("https://example.com/logo.png")).toBe(true);
  });

  it("handleLogoError advances the candidate index for the game", async () => {
    const { result } = renderLibrarySync();
    const game = makeGame({ id: "steam-err", logoUrl: "a", logoUrls: ["a", "b", "c"] });

    await waitFor(() => {
      expect(result.current.isDiscoveringGames).toBe(false);
    });

    act(() => {
      result.current.handleLogoError(game);
    });
    expect(result.current.logoCandidateIndexes["steam-err"]).toBe(1);
    act(() => {
      result.current.handleLogoError(game);
    });
    expect(result.current.logoCandidateIndexes["steam-err"]).toBe(2);
    act(() => {
      result.current.handleLogoError(game);
    });
    expect(result.current.logoCandidateIndexes["steam-err"]).toBe(3);
  });

  it("addGameToLibrary deduplicates by id and adds the new game", async () => {
    mocks.addManualGame.mockResolvedValue(makeGame({ id: "manual-1", title: "New" }));
    const { result } = renderLibrarySync();

    await waitFor(() => {
      expect(result.current.isDiscoveringGames).toBe(false);
    });

    await act(async () => {
      await result.current.addGameToLibrary({ title: "New", installPath: "C:/Games/New.exe" });
    });

    expect(result.current.installedGames.some((g) => g.id === "manual-1")).toBe(true);

    await act(async () => {
      await result.current.addGameToLibrary({ title: "New", installPath: "C:/Games/New.exe" });
    });
    const manual1 = result.current.installedGames.filter((g) => g.id === "manual-1");
    expect(manual1).toHaveLength(1);
  });

  it("handleSelectCustomArtwork rejects non-image files", async () => {
    const { result } = renderLibrarySyncWithStatus();

    await waitFor(() => {
      expect(result.current.sync.isDiscoveringGames).toBe(false);
    });

    const fakeFile = { type: "text/plain" } as File;
    await act(async () => {
      await result.current.sync.handleSelectCustomArtwork("steam-1", "cover", fakeFile);
    });

    expect(result.current.msg).toBe(
      "Only JPG, PNG, and WebP images can be used as custom artwork.",
    );
    expect(result.current.sync.customArtwork["steam-1"]).toBeUndefined();
  });

  it("handleSelectCustomArtwork reads the image and updates state", async () => {
    const { result } = renderLibrarySyncWithStatus();

    await waitFor(() => {
      expect(result.current.sync.isDiscoveringGames).toBe(false);
    });

    const dataUrl = "data:image/png;base64,AAAA";
    const fakeFile = { type: "image/png" } as File;
    mocks.compressAndReadImage.mockResolvedValue(dataUrl);

    await act(async () => {
      await result.current.sync.handleSelectCustomArtwork("steam-1", "cover", fakeFile);
    });

    expect(result.current.sync.customArtwork["steam-1"]?.coverUrl).toBe(dataUrl);
    expect(result.current.sync.logoCandidateIndexes["steam-1"]).toBe(0);
    expect(result.current.msg).toBe("Custom cover artwork saved.");
  });

  it("shouldShowLibraryLoading is true when discovering and there are no games yet", async () => {
    mocks.listInstalledGames.mockImplementation(
      () =>
        new Promise<Game[]>(() => {
          /* never */
        }),
    );
    const { result } = renderLibrarySync();

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    expect(result.current?.shouldShowLibraryLoading).toBe(true);
  });
});
