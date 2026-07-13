import { act, renderHook, waitFor } from "@testing-library/react";
import { isTauri } from "@tauri-apps/api/core";
import { StrictMode, useState, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Game } from "../../../lib/types";
import type { ProviderResult } from "../../../library/providers/types";
import { activateSteamAccount } from "../../../lib/steam-owned-games-cache";

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
  const mergeSteamOwned = vi.fn();
  const mergeGogOwned = vi.fn();
  const mergeEaOwned = vi.fn();
  const mergeEpicOwned = vi.fn();
  const mergeUbisoftOwned = vi.fn();
  const mergeXboxOwned = vi.fn();
  const mergeGamePassCatalog = vi.fn();
  const mergeBattlenetOwned = vi.fn();
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
    mergeSteamOwned,
    mergeGogOwned,
    mergeEaOwned,
    mergeEpicOwned,
    mergeUbisoftOwned,
    mergeXboxOwned,
    mergeGamePassCatalog,
    mergeBattlenetOwned,
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
  mergeSteamOwned: (...args: unknown[]) => mocks.mergeSteamOwned(...args),
  mergeGogOwned: (...args: unknown[]) => mocks.mergeGogOwned(...args),
  mergeEaOwned: (...args: unknown[]) => mocks.mergeEaOwned(...args),
  mergeEpicOwned: (...args: unknown[]) => mocks.mergeEpicOwned(...args),
  mergeUbisoftOwned: (...args: unknown[]) => mocks.mergeUbisoftOwned(...args),
  mergeXboxOwned: (...args: unknown[]) => mocks.mergeXboxOwned(...args),
  mergeGamePassCatalog: (...args: unknown[]) => mocks.mergeGamePassCatalog(...args),
  mergeBattlenetOwned: (...args: unknown[]) => mocks.mergeBattlenetOwned(...args),
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

function renderLibrarySyncInStrictMode() {
  function StrictModeWrapper({ children }: PropsWithChildren) {
    return <StrictMode>{children}</StrictMode>;
  }

  return renderHook(
    () => {
      const [, setMsg] = useState<string | null>(null);
      return useLibrarySync({ setStatusMessage: setMsg });
    },
    { wrapper: StrictModeWrapper },
  );
}

type TauriEventHandler = (event: { event: string; payload: unknown }) => void;

function captureTauriListeners() {
  const handlers = new Map<string, TauriEventHandler[]>();
  mocks.listenMock.mockImplementation((...args: unknown[]) => {
    const [event, handler] = args as [string, TauriEventHandler];
    handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    return Promise.resolve(() => undefined);
  });
  return handlers;
}

function emitTauriEvent(
  handlers: Map<string, TauriEventHandler[]>,
  event: string,
  payload: unknown,
) {
  handlers.get(event)?.forEach((handler) => handler({ event, payload }));
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
  mocks.mergeSteamOwned.mockReset();
  mocks.mergeGogOwned.mockReset();
  mocks.mergeEaOwned.mockReset();
  mocks.mergeEpicOwned.mockReset();
  mocks.mergeUbisoftOwned.mockReset();
  mocks.mergeXboxOwned.mockReset();
  mocks.mergeGamePassCatalog.mockReset();
  mocks.mergeBattlenetOwned.mockReset();
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
  for (const provider of [
    mocks.mergeSteamOwned,
    mocks.mergeGogOwned,
    mocks.mergeEaOwned,
    mocks.mergeEpicOwned,
    mocks.mergeUbisoftOwned,
    mocks.mergeXboxOwned,
    mocks.mergeGamePassCatalog,
    mocks.mergeBattlenetOwned,
  ]) {
    provider.mockImplementation(async (games: Game[]) => ({
      games,
      warnings: [],
      statusMessage: null,
    }));
  }
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
    expect(result.current.sync.discoveryMessage).toBe(
      "Open the desktop app to scan installed games. This browser preview stays empty.",
    );
    expect(mocks.listInstalledGames).toHaveBeenCalled();
  });

  it("does not leave an empty library loading forever after StrictMode replays effects", async () => {
    const { result } = renderLibrarySyncInStrictMode();

    await waitFor(() => {
      expect(result.current.shouldShowLibraryLoading).toBe(false);
    });

    expect(result.current.installedGames).toEqual([]);
    expect(mocks.listInstalledGames).toHaveBeenCalled();
  });

  it("queues an account refresh requested while another library sync is in flight", async () => {
    const { result } = renderLibrarySync();
    await waitFor(() => expect(result.current.isDiscoveringGames).toBe(false));

    let resolveList: (games: Game[]) => void = () => undefined;
    mocks.listInstalledGames.mockClear();
    mocks.refreshInstalledGames.mockClear();
    mocks.listInstalledGames.mockImplementationOnce(
      () =>
        new Promise<Game[]>((resolve) => {
          resolveList = resolve;
        }),
    );
    mocks.refreshInstalledGames.mockResolvedValueOnce([
      makeGame({ id: "steam-refresh", title: "Refreshed" }),
    ]);

    let firstSync = Promise.resolve();
    await act(async () => {
      firstSync = result.current.runAutomaticLibrarySync(false);
      await Promise.resolve();
    });
    expect(mocks.listInstalledGames).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.runAutomaticLibrarySync(true);
      resolveList([]);
      await firstSync;
    });

    expect(mocks.refreshInstalledGames).toHaveBeenCalledTimes(1);
    expect(result.current.installedGames.map((game) => game.id)).toContain("steam-refresh");
  });

  it("hydrates from a persisted library snapshot", async () => {
    const persisted: Game[] = [makeGame({ id: "steam-1", title: "Persisted" })];
    window.localStorage.setItem("launcher_library_snapshot", JSON.stringify(persisted));
    mocks.listInstalledGames.mockResolvedValue(persisted);

    const { result } = renderLibrarySync();

    await waitFor(() => {
      expect(result.current.installedGames.some((g) => g.id === "steam-1")).toBe(true);
    });
  });

  it("preserves a persisted snapshot when the native library read fails", async () => {
    const persisted: Game[] = [makeGame({ id: "steam-1", title: "Persisted" })];
    window.localStorage.setItem("launcher_library_snapshot", JSON.stringify(persisted));
    mocks.listInstalledGames.mockRejectedValueOnce(new Error("cache unavailable"));

    const { result } = renderLibrarySync();

    await waitFor(() => expect(result.current.isDiscoveringGames).toBe(false));
    expect(result.current.installedGames).toEqual(persisted);
    expect(result.current.discoveryMessage).toBe(
      "Saved library could not be refreshed. The last available snapshot remains visible.",
    );
    expect(JSON.parse(window.localStorage.getItem("launcher_library_snapshot") ?? "[]")).toEqual(
      persisted,
    );
  });

  it("keeps a persisted snapshot responsive, reconciles native cache, and defers refresh", async () => {
    vi.useFakeTimers();
    try {
      const persisted: Game[] = [makeGame({ id: "steam-1", title: "Persisted" })];
      const refreshed: Game[] = [makeGame({ id: "steam-2", title: "Refreshed" })];
      window.localStorage.setItem("launcher_library_snapshot", JSON.stringify(persisted));
      mocks.listInstalledGames.mockResolvedValue(persisted);
      mocks.refreshInstalledGames.mockResolvedValue(refreshed);

      const { result } = renderLibrarySync();

      expect(result.current.installedGames.some((g) => g.id === "steam-1")).toBe(true);
      await act(async () => {
        await Promise.resolve();
      });
      expect(mocks.listInstalledGames).toHaveBeenCalledTimes(1);
      expect(mocks.refreshInstalledGames).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1499);
      });
      expect(mocks.refreshInstalledGames).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mocks.refreshInstalledGames).toHaveBeenCalledTimes(1);
      expect(result.current.installedGames.some((g) => g.id === "steam-2")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("replaces stale snapshot artwork from the native cache immediately", async () => {
    const persisted = makeGame({
      id: "ubisoft-635",
      launcher: "ubisoft",
      coverUrl: undefined,
      iconUrl: undefined,
    });
    const cached = makeGame({
      id: "ubisoft-635",
      launcher: "ubisoft",
      coverUrl: "C:/ProgramData/Ubisoft/cache/assets/banner.png",
      iconUrl: "C:/ProgramData/Ubisoft/cache/assets/icon.png",
    });
    window.localStorage.setItem("launcher_library_snapshot", JSON.stringify([persisted]));
    mocks.listInstalledGames.mockResolvedValue([cached]);

    const { result } = renderLibrarySync();

    expect(result.current.installedGames[0].coverUrl).toBeUndefined();
    await waitFor(() => {
      expect(result.current.installedGames[0]).toMatchObject({
        coverUrl: cached.coverUrl,
        iconUrl: cached.iconUrl,
      });
    });
  });

  it("reloads immediately after a Steam account changes outside the library route", async () => {
    window.localStorage.setItem("launcher.steamId", JSON.stringify("76561198000000001"));
    window.localStorage.setItem(
      "launcher_library_snapshot",
      JSON.stringify([makeGame({ id: "epic-local", title: "Residual local game" })]),
    );
    window.sessionStorage.setItem("launcher_startup_library_rescan_done", "true");
    mocks.listInstalledGames.mockResolvedValue([
      makeGame({ id: "steam-owned-20", title: "New account game" }),
    ]);

    activateSteamAccount("76561198000000002");
    const { result } = renderLibrarySync();

    await waitFor(() => expect(mocks.listInstalledGames).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(result.current.installedGames.map((game) => game.id)).toEqual(["steam-owned-20"]);
    });
  });

  it("loads the native cache before delaying the first forced startup refresh", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const cached: Game[] = [makeGame({ id: "steam-cache", title: "Cached" })];
      const refreshed: Game[] = [makeGame({ id: "steam-refresh", title: "Refreshed" })];
      mocks.listInstalledGames.mockResolvedValue(cached);
      mocks.refreshInstalledGames.mockResolvedValue(refreshed);

      const { result } = renderLibrarySync();

      await waitFor(() => {
        expect(mocks.listInstalledGames).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(result.current.installedGames.some((g) => g.id === "steam-cache")).toBe(true);
      });
      expect(mocks.refreshInstalledGames).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      await waitFor(() => {
        expect(mocks.refreshInstalledGames).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(result.current.installedGames.some((g) => g.id === "steam-refresh")).toBe(true);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("migrates legacy Game Pass snapshots to installable Xbox product IDs", async () => {
    const persisted: Game[] = [
      makeGame({ id: "steam-1", title: "Persisted" }),
      makeGame({
        id: "gamepass-9NBLGGH4R315",
        externalId: "9NBLGGH4R315",
        title: "Game Pass Entry",
        launcher: "xbox",
        cloudGamingUrl: "https://www.xbox.com/play",
        status: "not_installed",
      }),
    ];
    window.localStorage.setItem("launcher_library_snapshot", JSON.stringify(persisted));
    mocks.listInstalledGames.mockResolvedValue(persisted);

    const { result } = renderLibrarySync();

    await waitFor(() => {
      expect(result.current.installedGames.some((g) => g.id === "steam-1")).toBe(true);
    });

    expect(result.current.installedGames).toContainEqual(
      expect.objectContaining({
        id: "xbox-9NBLGGH4R315",
        externalId: "9NBLGGH4R315",
        launcher: "xbox",
        catalogSource: "pc_game_pass",
        productCategory: "game",
        cloudGamingUrl: undefined,
      }),
    );
    expect(result.current.installedGames.some((game) => game.id.startsWith("gamepass-"))).toBe(
      false,
    );
  });

  it("runs the Game Pass catalog provider when the initial library is empty", async () => {
    mocks.mergeGamePassCatalog.mockImplementation(async (games: Game[]) => ({
      games: [
        ...games,
        makeGame({
          id: "xbox-9NBLGGH4R315",
          externalId: "9NBLGGH4R315",
          launcher: "xbox",
          status: "not_installed",
          title: "Catalog Game",
        }),
      ],
      warnings: [],
      statusMessage: null,
    }));

    const { result } = renderLibrarySync();

    await waitFor(() => {
      expect(result.current.installedGames.some((game) => game.id === "xbox-9NBLGGH4R315")).toBe(
        true,
      );
    });
    expect(mocks.mergeGamePassCatalog).toHaveBeenCalled();
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

  it("queues a second forced sync while one is in flight", async () => {
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

    expect(mocks.refreshInstalledGames).toHaveBeenCalledTimes(2);
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

  it("handles sparse native runtime updates, client lifecycle, and late events safely", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const handlers = captureTauriListeners();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const runtimeGame = makeGame({
      id: "steam-sparse",
      launcher: "steam",
      lastPlayed: "2026-06-01T12:00:00Z",
      playtimeMinutes: 12,
    });
    mocks.listInstalledGames.mockResolvedValue([runtimeGame]);
    mocks.syncGamePlaytimeStats.mockRejectedValueOnce(new Error("offline"));

    const hook = renderLibrarySyncWithStatus();
    await waitFor(() => {
      expect(hook.result.current.sync.installedGames).toEqual([runtimeGame]);
      expect(handlers.get("game_runtime_updated")).toHaveLength(1);
    });

    act(() => {
      emitTauriEvent(handlers, "game_activity_updated", { gameId: "steam-sparse" });
      emitTauriEvent(handlers, "game_activity_updated", {
        gameId: "missing-game",
        lastPlayed: null,
        playtimeMinutes: null,
      });
    });
    expect(hook.result.current.sync.installedGames[0]?.lastPlayed).toBe("2026-06-01T12:00:00Z");
    expect(hook.result.current.sync.installedGames[0]?.playtimeMinutes).toBe(12);
    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        "Failed to sync playtime stats:",
        expect.objectContaining({ message: "offline" }),
      );
    });

    act(() => {
      emitTauriEvent(handlers, "game_runtime_updated", {
        gameId: "steam-sparse",
        launcher: "steam",
        occurredAt: "2026-06-01T12:01:00Z",
        running: true,
        title: "Sparse Game",
      });
    });
    expect(hook.result.current.sync.gameRuntimeById["steam-sparse"]).toMatchObject({
      pid: null,
      processName: null,
      uptimeSeconds: null,
      lastInputSeconds: null,
      windowHandle: null,
      windowTitle: null,
    });

    act(() => {
      emitTauriEvent(handlers, "game_runtime_updated", {
        gameId: "steam-sparse",
        launcher: "steam",
        occurredAt: "2026-06-01T12:02:00Z",
        running: false,
        title: "Sparse Game",
      });
      emitTauriEvent(handlers, "client_started", {
        displayName: "Steam",
        event: "client_started",
      });
    });
    expect(hook.result.current.sync.gameRuntimeById["steam-sparse"]).toBeUndefined();
    expect(hook.result.current.msg).toBe("Steam client is running.");

    act(() => {
      emitTauriEvent(handlers, "client_stopped", {
        displayName: "Steam",
        event: "client_stopped",
      });
    });
    expect(hook.result.current.msg).toBe("Steam client stopped.");

    const syncCallsBeforeUnmount = mocks.syncGamePlaytimeStats.mock.calls.length;
    hook.unmount();
    act(() => {
      emitTauriEvent(handlers, "game_activity_updated", { gameId: "steam-sparse" });
      emitTauriEvent(handlers, "game_runtime_updated", {
        gameId: "steam-sparse",
        running: true,
      });
      emitTauriEvent(handlers, "game_started", {
        event: "game_started",
        gameId: "steam-sparse",
      });
      emitTauriEvent(handlers, "client_started", {
        displayName: "Steam",
        event: "client_started",
      });
    });
    expect(mocks.syncGamePlaytimeStats).toHaveBeenCalledTimes(syncCallsBeforeUnmount);
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

  it("continues provider discovery after warnings and an unexpected provider failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const installed = makeGame({ id: "manual-provider", launcher: "unknown" });
    mocks.listInstalledGames.mockResolvedValue([installed]);
    mocks.mergeSteamOwned.mockResolvedValue({
      games: [installed],
      warnings: ["Steam metadata was incomplete."],
      statusMessage: "Steam library loaded with a warning.",
    });
    mocks.mergeGogOwned.mockRejectedValue(new Error("GOG provider crashed"));

    const { result } = renderLibrarySyncWithStatus();

    await waitFor(() => {
      expect(result.current.sync.installedGames).toEqual([installed]);
    });
    expect(result.current.msg).toBe("Steam library loaded with a warning.");
    expect(warn).toHaveBeenCalledWith("Steam metadata was incomplete.");
    expect(warn).toHaveBeenCalledWith(
      "Provider merge threw unexpectedly:",
      expect.objectContaining({ message: "GOG provider crashed" }),
    );
    expect(mocks.mergeBattlenetOwned).toHaveBeenCalled();
  });

  it("publishes repaired Battle.net artwork before slower providers finish", async () => {
    const repaired = makeGame({
      id: "battlenet-owned-17459",
      externalId: "17459",
      launcher: "battlenet",
      title: "Diablo® III",
      coverUrl: "C:\\AppData\\open-game-launcher\\battlenet-assets\\diablo.webp",
      iconUrl: "C:\\AppData\\open-game-launcher\\battlenet-assets\\diablo.png",
    });
    mocks.mergeBattlenetOwned.mockResolvedValue({
      games: [repaired],
      warnings: [],
      statusMessage: null,
    });
    let resolveSteam: ((value: ProviderResult) => void) | undefined;
    mocks.mergeSteamOwned.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSteam = resolve;
        }),
    );

    const { result } = renderLibrarySync();

    await waitFor(() =>
      expect(result.current.installedGames[0]).toMatchObject({
        id: repaired.id,
        coverUrl: repaired.coverUrl,
        iconUrl: repaired.iconUrl,
      }),
    );
    expect(mocks.mergeBattlenetOwned.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.mergeSteamOwned.mock.invocationCallOrder[0],
    );

    await act(async () => {
      resolveSteam?.({ games: [repaired], warnings: [], statusMessage: null });
    });
  });

  it("publishes repaired native GOG artwork before provider discovery finishes", async () => {
    const repaired = makeGame({
      id: "gog-Jotun: Valhalla Edition",
      externalId: "1458127099",
      launcher: "gog",
      title: "Jotun: Valhalla Edition",
      coverUrl: "C:\\AppData\\open-game-launcher\\gog-assets\\jotun-cover.jpg",
      logoUrl: "C:\\AppData\\open-game-launcher\\gog-assets\\jotun-logo.jpg",
      iconUrl: "C:\\AppData\\open-game-launcher\\gog-assets\\jotun-icon.png",
    });
    window.localStorage.setItem(
      "launcher_library_snapshot",
      JSON.stringify([
        {
          ...repaired,
          coverUrl: undefined,
          logoUrl: undefined,
          iconUrl: undefined,
        },
      ]),
    );
    mocks.listInstalledGames.mockResolvedValue([repaired]);
    let resolveBattlenet: ((value: ProviderResult) => void) | undefined;
    mocks.mergeBattlenetOwned.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBattlenet = resolve;
        }),
    );

    const { result } = renderLibrarySync();

    await waitFor(() =>
      expect(result.current.installedGames[0]).toMatchObject({
        id: repaired.id,
        coverUrl: repaired.coverUrl,
        logoUrl: repaired.logoUrl,
        iconUrl: repaired.iconUrl,
      }),
    );

    await act(async () => {
      resolveBattlenet?.({ games: [repaired], warnings: [], statusMessage: null });
    });
  });

  it("does not replace an equal library list with a new array", async () => {
    const installed = makeGame({ id: "steam-stable", launcher: "steam", title: "Stable" });
    mocks.listInstalledGames.mockResolvedValue([installed]);
    const { result } = renderLibrarySync();

    await waitFor(() => expect(result.current.installedGames).toEqual([installed]));
    const originalReference = result.current.installedGames;

    await act(async () => {
      await result.current.loadInstalledGames(false);
    });

    expect(result.current.installedGames).toBe(originalReference);
  });

  it("does not apply a provider result after the caller cancels late", async () => {
    const initial = makeGame({ id: "steam-before-cancel", launcher: "steam" });
    mocks.listInstalledGames.mockResolvedValue([initial]);
    const { result } = renderLibrarySync();
    await waitFor(() => expect(result.current.installedGames).toEqual([initial]));

    const replacement = makeGame({ id: "steam-after-cancel" });
    mocks.listInstalledGames.mockResolvedValue([replacement]);
    let checks = 0;
    await act(async () => {
      await result.current.loadInstalledGames(false, () => {
        checks += 1;
        return checks <= 7;
      });
    });

    expect(checks).toBe(9);
    expect(result.current.installedGames).toEqual([initial]);
  });

  it("reports cache and forced-refresh failures without inventing games", async () => {
    const { result } = renderLibrarySync();
    await waitFor(() => expect(result.current.isDiscoveringGames).toBe(false));

    mocks.listInstalledGames.mockRejectedValueOnce(new Error("cache unavailable"));
    await act(async () => {
      await result.current.loadInstalledGames(false);
    });
    expect(result.current.discoveryMessage).toBe(
      "Saved library is unavailable in this session. No games were loaded.",
    );

    mocks.refreshInstalledGames.mockRejectedValueOnce(new Error("scan unavailable"));
    await act(async () => {
      await result.current.loadInstalledGames(true);
    });
    expect(result.current.discoveryMessage).toBe(
      "Automatic sync is unavailable in this session. No games were added.",
    );

    mocks.listInstalledGames.mockRejectedValueOnce(new Error("cancelled cache read"));
    await act(async () => {
      await result.current.loadInstalledGames(false, () => false);
    });
    expect(result.current.discoveryMessage).toBeNull();
  });

  it("uses the desktop empty-library message when a native scan finds nothing", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const { result } = renderLibrarySync();

    await waitFor(() => expect(result.current.isDiscoveringGames).toBe(false));
    expect(result.current.discoveryMessage).toBe("No installed games were detected on this PC.");
  });

  it("ignores malformed and non-array library snapshots", async () => {
    window.localStorage.setItem("launcher_library_snapshot", "not-json");
    const malformed = renderLibrarySync();
    await waitFor(() => expect(malformed.result.current.isDiscoveringGames).toBe(false));
    expect(malformed.result.current.initialLibrarySnapshot).toEqual([]);
    malformed.unmount();

    window.localStorage.setItem(
      "launcher_library_snapshot",
      JSON.stringify({ id: "not-an-array" }),
    );
    const nonArray = renderLibrarySync();
    await waitFor(() => expect(nonArray.result.current.isDiscoveringGames).toBe(false));
    expect(nonArray.result.current.initialLibrarySnapshot).toEqual([]);
  });

  it("keeps running when browser storage rejects snapshot and artwork writes", async () => {
    const realSetItem = window.localStorage.setItem.bind(window.localStorage);
    vi.spyOn(window.localStorage, "setItem").mockImplementation((key, value) => {
      if (key === "launcher_library_snapshot" || key === "launcher_custom_artwork") {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      }
      realSetItem(key, value);
    });

    const { result } = renderLibrarySyncWithStatus();
    await waitFor(() => expect(result.current.sync.isDiscoveringGames).toBe(false));
    expect(result.current.msg).toBe("Artwork could not be saved. Try a smaller image file.");

    act(() => {
      result.current.sync.setInstalledGames([makeGame({ id: "steam-quota" })]);
    });
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    expect(result.current.sync.installedGames).toHaveLength(1);
  });

  it("applies, previews, confirms, and resets custom artwork", async () => {
    const { result } = renderLibrarySyncWithStatus();
    await waitFor(() => expect(result.current.sync.isDiscoveringGames).toBe(false));

    act(() => {
      result.current.sync.handleApplyCustomArtworkUrl("steam-art", "cover", "   ", "IGDB");
    });
    expect(result.current.msg).toBe("Artwork candidate is missing a URL.");

    act(() => {
      result.current.sync.handleApplyCustomArtworkUrl(
        "steam-art",
        "cover",
        "  https://img.example/cover.png  ",
        "IGDB",
      );
      result.current.sync.handleApplyCustomArtworkUrl(
        "steam-art",
        "icon",
        "https://img.example/icon.png",
        "SteamGridDB",
      );
    });
    expect(result.current.sync.customArtwork["steam-art"]?.coverUrl).toBe(
      "https://img.example/cover.png",
    );
    expect(result.current.sync.customArtwork["steam-art"]?.iconUrl).toBe(
      "https://img.example/icon.png",
    );

    act(() => {
      result.current.sync.handleConfirmArtwork("data:image/png;base64,ignored", "logo");
    });
    expect(result.current.sync.customArtwork["steam-art"]?.logoUrl).toBeUndefined();

    const previewFile = { type: "image/png" } as File;
    act(() => {
      result.current.sync.openArtworkPreview("steam-art", "logo", previewFile);
    });
    expect(result.current.sync.pendingArtworkGameId).toBe("steam-art");
    expect(result.current.sync.pendingArtworkKind).toBe("logo");
    expect(result.current.sync.pendingArtworkFile).toBe(previewFile);

    act(() => {
      result.current.sync.handleConfirmArtwork("data:image/png;base64,logo", "logo");
    });
    expect(result.current.sync.customArtwork["steam-art"]?.logoUrl).toBe(
      "data:image/png;base64,logo",
    );
    expect(result.current.sync.pendingArtworkGameId).toBeNull();
    expect(result.current.sync.pendingArtworkFile).toBeNull();

    act(() => {
      result.current.sync.handleResetCustomArtwork("missing", "cover");
      result.current.sync.handleResetCustomArtwork("steam-art", "cover");
    });
    expect(result.current.sync.customArtwork["steam-art"]?.coverUrl).toBeUndefined();
    expect(result.current.sync.customArtwork["steam-art"]?.iconUrl).toBeTruthy();

    act(() => {
      result.current.sync.handleResetCustomArtwork("steam-art");
    });
    expect(result.current.sync.customArtwork["steam-art"]).toBeUndefined();
    expect(result.current.msg).toBe("Custom artwork reset.");
  });

  it("handles dropped artwork and surfaces image compression errors", async () => {
    const { result } = renderLibrarySyncWithStatus();
    await waitFor(() => expect(result.current.sync.isDiscoveringGames).toBe(false));

    const image = { type: "image/webp" } as File;
    mocks.compressAndReadImage.mockRejectedValueOnce(new Error("Image is too large."));
    await act(async () => {
      await result.current.sync.handleSelectCustomArtwork("steam-art", "cover", image);
    });
    expect(result.current.msg).toBe("Image is too large.");

    mocks.compressAndReadImage.mockResolvedValueOnce("data:image/webp;base64,drop");
    await act(async () => {
      await result.current.sync.handleArtworkDrop("steam-art", "icon", image);
    });
    expect(result.current.sync.customArtwork["steam-art"]?.iconUrl).toBe(
      "data:image/webp;base64,drop",
    );
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
