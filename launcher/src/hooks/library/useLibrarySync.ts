import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import {
  addManualGame,
  isSteamScrapedGamesEventForAccount,
  isSteamScrapeErrorEventForAccount,
  listInstalledGames,
  refreshInstalledGames,
} from "../../lib/launcher";
import { normalizeSteamOwnedGames } from "../../lib/steam-owned-games";
import { normalizeLauncherKey } from "../../lib/formatters";
import { syncGamePlaytimeStats } from "../../lib/supabase/playtime";
import { hydrateGamesWithRemoteAchievements } from "../../lib/supabase/achievements";
import { readLocalStorageString } from "../../lib/library-providers";
import {
  activateSteamAccount,
  STEAM_ACCOUNT_CHANGED_EVENT,
  writeSteamOwnedGamesCache,
} from "../../lib/steam-owned-games-cache";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import type {
  Game,
  GameLifecycleEvent,
  GameRuntimeStatus,
  GameRuntimeUpdate,
  PlatformClientLifecycleEvent,
} from "../../lib/types";
import { runProviderInventory, type MergeContext } from "../../library/providers";

import { useCustomArtwork, type UseCustomArtworkResult } from "./useCustomArtwork";

type GameActivityUpdate = {
  gameId: string;
  lastPlayed?: string | null;
  playtimeMinutes?: number | null;
};

type LibraryInventoryChanged = {
  reason: string;
  gameCount: number;
};

type GameStatusSetter = Dispatch<SetStateAction<string | null>>;

function normalizeLegacyGamePassCatalogGame(game: Game): Game | null {
  if (!game.id.toLowerCase().startsWith("gamepass-")) {
    return game;
  }

  const productId = (game.externalId ?? game.id.slice("gamepass-".length)).trim().toUpperCase();
  if (!/^[A-Z0-9]{12}$/.test(productId)) {
    return null;
  }

  return {
    ...game,
    id: `xbox-${productId}`,
    externalId: productId,
    launcher: "xbox",
    catalogSource: "pc_game_pass",
    productCategory: "game",
    cloudGamingUrl: undefined,
  };
}

function normalizeLibrarySnapshotGames(games: Game[]): Game[] {
  return games.flatMap((game) => {
    const normalized = normalizeLegacyGamePassCatalogGame(game);
    if (!normalized) return [];
    const title = normalized.title.toLowerCase().replace(/[_-]/g, " ");
    if (
      ((title.startsWith("b07 ") || title.startsWith("bo7 ")) && title.includes(" dlc")) ||
      title.includes(" game stub") ||
      title.includes(" launch tracker") ||
      title.includes(" game pass pack")
    ) {
      return [];
    }
    return [normalized];
  });
}

function readLibrarySnapshot(): Game[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.LIBRARY_SNAPSHOT);
    if (!saved) {
      return [];
    }

    const games = JSON.parse(saved);
    return Array.isArray(games) ? normalizeLibrarySnapshotGames(games as Game[]) : [];
  } catch {
    return [];
  }
}

function writeLibrarySnapshot(games: Game[]) {
  try {
    localStorage.setItem(
      STORAGE_KEYS.LIBRARY_SNAPSHOT,
      JSON.stringify(normalizeLibrarySnapshotGames(games)),
    );
  } catch {
    // The native cache is authoritative; this snapshot only prevents UI flicker.
  }
}

function areGameListsEqual(left: Game[], right: Game[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((game, index) => JSON.stringify(game) === JSON.stringify(right[index]));
}

export interface UseLibrarySyncOptions {
  setStatusMessage: GameStatusSetter;
}

export type UseLibrarySyncResult = {
  installedGames: Game[];
  setInstalledGames: Dispatch<SetStateAction<Game[]>>;
  installedGamesRef: RefObject<Game[]>;
  runningGameIds: Set<string>;
  gameRuntimeById: Record<string, GameRuntimeStatus>;
  isDiscoveringGames: boolean;
  hasCompletedInitialLibraryLoad: boolean;
  discoveryMessage: string | null;
  initialLibrarySnapshot: Game[];
  runAutomaticLibrarySync: (forceRefresh?: boolean) => Promise<void>;
  requestLibraryRescanOnNextFocus: () => void;
  loadInstalledGames: (
    forceRefresh?: boolean,
    shouldApplyResult?: () => boolean,
    showLoading?: boolean,
  ) => Promise<void>;
  addGameToLibrary: (input: { title: string; installPath: string }) => Promise<Game>;
  shouldShowLibraryLoading: boolean;
} & UseCustomArtworkResult;

const STARTUP_LIBRARY_REFRESH_DELAY_MS = 1_500;

export function useLibrarySync({ setStatusMessage }: UseLibrarySyncOptions): UseLibrarySyncResult {
  const [initialLibrarySnapshot] = useState(readLibrarySnapshot);
  const installedGamesRef = useRef<Game[]>(initialLibrarySnapshot);
  const [installedGames, setInstalledGames] = useState<Game[]>(initialLibrarySnapshot);
  const [runningGameIds, setRunningGameIds] = useState<Set<string>>(() => new Set());
  const [gameRuntimeById, setGameRuntimeById] = useState<Record<string, GameRuntimeStatus>>(
    () => ({}),
  );
  const [isDiscoveringGames, setIsDiscoveringGames] = useState(initialLibrarySnapshot.length === 0);
  const [hasCompletedInitialLibraryLoad, setHasCompletedInitialLibraryLoad] = useState(false);
  const [discoveryMessage, setDiscoveryMessage] = useState<string | null>(null);
  const artwork = useCustomArtwork({ setStatusMessage });
  const automaticSyncInFlightRef = useRef(false);
  const automaticSyncPendingRef = useRef(false);
  const automaticSyncPendingForceRefreshRef = useRef(false);
  const lastFocusSyncAtRef = useRef(0);
  const libraryRescanOnNextFocusRef = useRef(false);
  const isLibrarySyncMountedRef = useRef(false);

  useEffect(() => {
    isLibrarySyncMountedRef.current = true;
    return () => {
      isLibrarySyncMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    installedGamesRef.current = installedGames;
  }, [installedGames]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      writeLibrarySnapshot(installedGames);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [installedGames]);

  async function loadInstalledGamesImpl(
    forceRefresh = false,
    shouldApplyResult: () => boolean = () => true,
    showLoading = true,
  ) {
    const applyVisibleGames = (nextGames: Game[]) => {
      if (!shouldApplyResult()) return;
      const visibleGames = normalizeLibrarySnapshotGames(nextGames);
      setInstalledGames((current) =>
        areGameListsEqual(current, visibleGames) ? current : visibleGames,
      );
      setDiscoveryMessage(
        visibleGames.length > 0
          ? null
          : isTauri()
            ? "No installed games were detected on this PC."
            : "Open the desktop app to scan installed games. This browser preview stays empty.",
      );
    };

    const publishBattlenetArtwork = (nextGames: Game[]) => {
      if (!shouldApplyResult()) return;
      const repairedGames = normalizeLibrarySnapshotGames(nextGames).filter(
        (game) => normalizeLauncherKey(game.launcher, game.id) === "battlenet",
      );
      const repairedById = new Map(repairedGames.map((game) => [game.id, game]));
      setInstalledGames((current) => {
        const currentIds = new Set(current.map((game) => game.id));
        const merged = current.map((game) => repairedById.get(game.id) ?? game);
        for (const game of repairedGames) {
          if (!currentIds.has(game.id)) merged.push(game);
        }
        return areGameListsEqual(current, merged) ? current : merged;
      });
    };

    const publishNativeArtworkRepairs = (nextGames: Game[]) => {
      if (!shouldApplyResult()) return;
      const repairedGames = normalizeLibrarySnapshotGames(nextGames);
      const repairedById = new Map(repairedGames.map((game) => [game.id, game]));
      setInstalledGames((current) => {
        const merged = current.map((game) => {
          const repaired = repairedById.get(game.id);
          if (!repaired) return game;
          return {
            ...game,
            coverUrl: repaired.coverUrl ?? game.coverUrl,
            logoUrl: repaired.logoUrl ?? game.logoUrl,
            logoUrls: repaired.logoUrls?.length ? repaired.logoUrls : game.logoUrls,
            iconUrl: repaired.iconUrl ?? game.iconUrl,
            iconUrls: repaired.iconUrls?.length ? repaired.iconUrls : game.iconUrls,
          };
        });
        return areGameListsEqual(current, merged) ? current : merged;
      });
    };

    const publishAchievementRepairs = (nextGames: Game[]) => {
      if (!shouldApplyResult()) return;
      const repairedById = new Map(nextGames.map((game) => [game.id, game]));
      setInstalledGames((current) => {
        const merged = current.map((game) => {
          const repaired = repairedById.get(game.id);
          if (!repaired) return game;
          return { ...game, achievements: repaired.achievements ?? game.achievements };
        });
        return areGameListsEqual(current, merged) ? current : merged;
      });
    };

    if (showLoading) {
      setIsDiscoveringGames(true);
      setDiscoveryMessage(null);
    }

    try {
      let games = (forceRefresh ? await refreshInstalledGames() : await listInstalledGames()).map(
        (game): Game => ({
          ...game,
          launcher: normalizeLauncherKey(game.launcher, game.id),
        }),
      );
      const nativeIds = new Set(games.map((game) => game.id));
      const canReconcileNativeOglInstalls = isTauri();
      games.push(
        ...installedGamesRef.current
          .filter((game) => game.launcher === "ogl" && !nativeIds.has(game.id))
          .map((game) =>
            !canReconcileNativeOglInstalls || game.status === "not_installed"
              ? game
              : {
                  ...game,
                  status: "not_installed" as const,
                  installPath: undefined,
                  executablePath: undefined,
                  processNames: [],
                  launchUri: undefined,
                },
          ),
      );
      publishNativeArtworkRepairs(games);

      const context: MergeContext = { forceRefresh, setStatusMessage, shouldApplyResult };
      const inventory = await runProviderInventory(games, context, {
        onMergerApplied: (mergerId, nextGames) => {
          // Battle.net hydration is entirely local and repairs stale artwork.
          // Publish it immediately so slower network providers cannot leave
          // the first-painted library stuck on placeholder art.
          if (mergerId === "battlenet") {
            publishBattlenetArtwork(nextGames);
          }
        },
      });
      for (const warning of inventory.warnings) {
        console.warn(warning);
      }
      if (inventory.statusMessage) {
        setStatusMessage(inventory.statusMessage);
      }
      games = inventory.games;

      if (!shouldApplyResult()) {
        return;
      }

      if (!shouldApplyResult()) {
        return;
      }

      applyVisibleGames(games);

      try {
        const hydratedGames = await hydrateGamesWithRemoteAchievements(games);
        if (!shouldApplyResult()) {
          return;
        }
        publishAchievementRepairs(hydratedGames);
      } catch (error) {
        // Hosted achievement data is additive enrichment. The library must not
        // wait for it: without an authenticated session every Steam game runs
        // through the slow keyless Community fallback and hides the library
        // for minutes.
        console.warn("Hosted achievement hydration skipped for library:", error);
      }
    } catch {
      if (!shouldApplyResult()) {
        return;
      }

      const hasVisibleGames = installedGamesRef.current.length > 0;
      setDiscoveryMessage(
        forceRefresh
          ? hasVisibleGames
            ? "Automatic sync is unavailable in this session. The last available library remains visible."
            : "Automatic sync is unavailable in this session. No games were added."
          : hasVisibleGames
            ? "Saved library could not be refreshed. The last available snapshot remains visible."
            : "Saved library is unavailable in this session. No games were loaded.",
      );
    } finally {
      if (showLoading && shouldApplyResult()) {
        setIsDiscoveringGames(false);
      }
    }
  }

  const loadInstalledGames = useCallback(loadInstalledGamesImpl, [setStatusMessage]);

  function claimStartupLibraryRescan() {
    try {
      if (sessionStorage.getItem(STORAGE_KEYS.STARTUP_LIBRARY_RESCAN_DONE) === "true") {
        return false;
      }

      sessionStorage.setItem(STORAGE_KEYS.STARTUP_LIBRARY_RESCAN_DONE, "true");
      return true;
    } catch {
      return true;
    }
  }

  const runAutomaticLibrarySync = useCallback(
    async (forceRefresh = false) => {
      if (automaticSyncInFlightRef.current) {
        automaticSyncPendingRef.current = true;
        automaticSyncPendingForceRefreshRef.current ||= forceRefresh;
        return;
      }

      automaticSyncInFlightRef.current = true;
      let nextForceRefresh = forceRefresh;
      try {
        while (true) {
          automaticSyncPendingRef.current = false;
          automaticSyncPendingForceRefreshRef.current = false;
          await loadInstalledGames(nextForceRefresh, () => isLibrarySyncMountedRef.current, false);
          if (!automaticSyncPendingRef.current) break;
          nextForceRefresh = automaticSyncPendingForceRefreshRef.current;
        }
      } finally {
        automaticSyncInFlightRef.current = false;
      }
    },
    [loadInstalledGames],
  );

  const requestLibraryRescanOnNextFocus = useCallback(() => {
    libraryRescanOnNextFocusRef.current = true;
  }, []);

  useEffect(() => {
    let isMounted = true;
    let startupRefreshTimeout: number | null = null;

    async function loadLibrary() {
      if (automaticSyncInFlightRef.current) {
        // React StrictMode replays effects during development. Queue the second
        // pass and release the initial empty-library spinner; the first pass
        // will run the queued sync after its cancelled result settles.
        automaticSyncPendingRef.current = true;
        setIsDiscoveringGames(false);
        return;
      }
      automaticSyncInFlightRef.current = true;
      try {
        // The browser snapshot makes first paint instant, but it can contain
        // stale provider artwork. Always reconcile it with the native cache;
        // only show the blocking loader when there was no snapshot to paint.
        await loadInstalledGames(false, () => isMounted, initialLibrarySnapshot.length === 0);
      } finally {
        automaticSyncInFlightRef.current = false;
      }

      if (automaticSyncPendingRef.current) {
        const pendingForceRefresh = automaticSyncPendingForceRefreshRef.current;
        automaticSyncPendingRef.current = false;
        automaticSyncPendingForceRefreshRef.current = false;
        await runAutomaticLibrarySync(pendingForceRefresh);
      }

      // A non-empty browser snapshot only makes first paint faster. Consumers
      // that need an authoritative inventory must wait until the native cache
      // and provider pipeline have completed at least once. The mounted ref
      // also covers React StrictMode's effect replay, where the active replay
      // queues its work behind the first pass.
      if (isLibrarySyncMountedRef.current) {
        setHasCompletedInitialLibraryLoad(true);
      }

      if (!isMounted) {
        return;
      }

      startupRefreshTimeout = window.setTimeout(() => {
        if (!isMounted || !claimStartupLibraryRescan()) {
          return;
        }

        void runAutomaticLibrarySync(true);
      }, STARTUP_LIBRARY_REFRESH_DELAY_MS);
    }

    void loadLibrary();

    return () => {
      isMounted = false;
      if (startupRefreshTimeout !== null) {
        window.clearTimeout(startupRefreshTimeout);
      }
    };
  }, [initialLibrarySnapshot.length, loadInstalledGames, runAutomaticLibrarySync]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let isMounted = true;

    const applyGameActivityUpdate = (update: GameActivityUpdate) => {
      if (!isMounted) {
        return;
      }

      const applyUpdate = (game: Game): Game =>
        game.id === update.gameId
          ? {
              ...game,
              lastPlayed: update.lastPlayed ?? game.lastPlayed,
              lastPlayedAt: update.lastPlayed ?? game.lastPlayedAt,
              playtimeMinutes: update.playtimeMinutes ?? game.playtimeMinutes,
            }
          : game;

      setInstalledGames((current) => current.map(applyUpdate));

      const sourceGame = installedGamesRef.current.find((game) => game.id === update.gameId);
      if (sourceGame) {
        const updatedGame = applyUpdate(sourceGame);
        void syncGamePlaytimeStats({
          game: updatedGame,
          playtimeMinutes: updatedGame.playtimeMinutes,
          lastPlayedAt: updatedGame.lastPlayedAt ?? updatedGame.lastPlayed ?? null,
        }).catch((error) => {
          console.warn("Failed to sync playtime stats:", error);
        });
      }
    };

    const upsertGameRuntime = (update: GameRuntimeUpdate) => {
      setRunningGameIds((current) => {
        const next = new Set(current);
        if (update.running) {
          next.add(update.gameId);
        } else {
          next.delete(update.gameId);
        }
        return next;
      });
      setGameRuntimeById((current) => {
        if (!update.running) {
          const next = { ...current };
          delete next[update.gameId];
          return next;
        }
        return {
          ...current,
          [update.gameId]: {
            gameId: update.gameId,
            launcher: update.launcher,
            occurredAt: update.occurredAt,
            pid: update.pid ?? null,
            processName: update.processName ?? null,
            running: update.running,
            title: update.title,
            uptimeSeconds: update.uptimeSeconds ?? null,
            lastInputSeconds: update.lastInputSeconds ?? null,
            windowHandle: update.windowHandle ?? null,
            windowTitle: update.windowTitle ?? null,
          },
        };
      });
    };

    const handleGameRuntimeUpdate = (update: GameRuntimeUpdate) => {
      if (!isMounted) {
        return;
      }

      upsertGameRuntime(update);
    };

    const handleGameLifecycleEvent = (update: GameLifecycleEvent) => {
      if (!isMounted) {
        return;
      }

      upsertGameRuntime(update);
      applyGameActivityUpdate({
        gameId: update.gameId,
        lastPlayed: update.lastPlayed ?? update.occurredAt,
        playtimeMinutes: update.playtimeMinutes ?? null,
      });
      setStatusMessage(
        update.event === "game_started"
          ? `${update.title} is now running.`
          : `${update.title} stopped.`,
      );
    };

    const handleClientLifecycleEvent = (update: PlatformClientLifecycleEvent) => {
      if (!isMounted) {
        return;
      }

      setStatusMessage(
        update.event === "client_started"
          ? `${update.displayName} client is running.`
          : `${update.displayName} client stopped.`,
      );
    };

    const unlistenPromise = listen<GameActivityUpdate>("game_activity_updated", (event) => {
      applyGameActivityUpdate(event.payload);
    });
    const unlistenGameStarted = listen<GameLifecycleEvent>("game_started", (event) => {
      handleGameLifecycleEvent(event.payload);
    });
    const unlistenGameStopped = listen<GameLifecycleEvent>("game_stopped", (event) => {
      handleGameLifecycleEvent(event.payload);
    });
    const unlistenGameRuntimeUpdated = listen<GameRuntimeUpdate>(
      "game_runtime_updated",
      (event) => {
        handleGameRuntimeUpdate(event.payload);
      },
    );
    const unlistenClientStarted = listen<PlatformClientLifecycleEvent>(
      "client_started",
      (event) => {
        handleClientLifecycleEvent(event.payload);
      },
    );
    const unlistenClientStopped = listen<PlatformClientLifecycleEvent>(
      "client_stopped",
      (event) => {
        handleClientLifecycleEvent(event.payload);
      },
    );

    return () => {
      isMounted = false;
      void unlistenPromise.then((unlisten) => unlisten());
      void unlistenGameStarted.then((unlisten) => unlisten());
      void unlistenGameStopped.then((unlisten) => unlisten());
      void unlistenGameRuntimeUpdated.then((unlisten) => unlisten());
      void unlistenClientStarted.then((unlisten) => unlisten());
      void unlistenClientStopped.then((unlisten) => unlisten());
    };
  }, [setStatusMessage]);

  useEffect(() => {
    let isMounted = true;

    const unlistenInventory = isTauri()
      ? listen<LibraryInventoryChanged>("library_inventory_changed", () => {
          if (!isMounted) return;
          void runAutomaticLibrarySync(false);
        })
      : null;

    const unlistenSteam = isTauri()
      ? listen<string>("steam_login_success", (event) => {
          if (!isMounted) return;
          if (!activateSteamAccount(event.payload)) {
            void runAutomaticLibrarySync(false);
          }
        })
      : null;

    const unlistenGog = isTauri()
      ? listen<string>("gog_login_code", () => {
          if (!isMounted) return;
          void runAutomaticLibrarySync(true);
        })
      : null;

    const unlistenEa = isTauri()
      ? listen("ea_login_success", () => {
          if (!isMounted) return;
          void runAutomaticLibrarySync(true);
        })
      : null;

    const handleBattlenetUpdated = () => {
      if (!isMounted) return;
      void runAutomaticLibrarySync(false);
    };
    const handleSteamAccountChanged = () => {
      if (!isMounted) return;
      void runAutomaticLibrarySync(false);
    };
    window.addEventListener("battlenet_library_updated", handleBattlenetUpdated);
    window.addEventListener(STEAM_ACCOUNT_CHANGED_EVENT, handleSteamAccountChanged);

    const unlistenScrapedSuccess = isTauri()
      ? listen<unknown>("steam_scraped_games_success", (event) => {
          if (!isMounted) return;
          const currentSteamId = readLocalStorageString(STORAGE_KEYS.STEAM_ID) ?? "";
          if (!isSteamScrapedGamesEventForAccount(event.payload, currentSteamId)) return;
          const ownedGames = normalizeSteamOwnedGames(event.payload.games);
          writeSteamOwnedGamesCache(event.payload.steamId, ownedGames);
          void runAutomaticLibrarySync(false);
        })
      : null;

    const unlistenScrapedError = isTauri()
      ? listen<unknown>("steam_scraped_games_error", (event) => {
          if (!isMounted) return;
          const currentSteamId = readLocalStorageString(STORAGE_KEYS.STEAM_ID) ?? "";
          if (!isSteamScrapeErrorEventForAccount(event.payload, currentSteamId)) return;
          console.warn("[OG-Launcher] Silent scraper failed:", event.payload.message);
          setStatusMessage(`Warning: Steam: ${event.payload.message}`);
        })
      : null;

    return () => {
      isMounted = false;
      void unlistenInventory?.then((u) => u());
      void unlistenSteam?.then((u) => u());
      void unlistenGog?.then((u) => u());
      void unlistenEa?.then((u) => u());
      window.removeEventListener("battlenet_library_updated", handleBattlenetUpdated);
      window.removeEventListener(STEAM_ACCOUNT_CHANGED_EVENT, handleSteamAccountChanged);
      void unlistenScrapedSuccess?.then((u) => u());
      void unlistenScrapedError?.then((u) => u());
    };
  }, [setStatusMessage, runAutomaticLibrarySync]);

  useEffect(() => {
    const syncOnFocus = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      const now = Date.now();
      const hasPendingProviderRescan = libraryRescanOnNextFocusRef.current;
      if (!hasPendingProviderRescan && now - lastFocusSyncAtRef.current < 30_000) {
        return;
      }

      libraryRescanOnNextFocusRef.current = false;
      lastFocusSyncAtRef.current = now;
      void runAutomaticLibrarySync(true);
    };

    window.addEventListener("focus", syncOnFocus);
    document.addEventListener("visibilitychange", syncOnFocus);

    return () => {
      window.removeEventListener("focus", syncOnFocus);
      document.removeEventListener("visibilitychange", syncOnFocus);
    };
  }, [runAutomaticLibrarySync]);

  async function addGameToLibrary(input: { title: string; installPath: string }) {
    const game = await addManualGame(input);
    setInstalledGames((current) => {
      const withoutDuplicate = current.filter((item) => item.id !== game.id);
      return [...withoutDuplicate, game];
    });
    return game;
  }

  const shouldShowLibraryLoading = isDiscoveringGames && installedGames.length === 0;

  return {
    installedGames,
    setInstalledGames,
    installedGamesRef,
    runningGameIds,
    gameRuntimeById,
    isDiscoveringGames,
    hasCompletedInitialLibraryLoad,
    discoveryMessage,
    initialLibrarySnapshot,
    runAutomaticLibrarySync,
    requestLibraryRescanOnNextFocus,
    loadInstalledGames,
    addGameToLibrary,
    shouldShowLibraryLoading,
    ...artwork,
  };
}
