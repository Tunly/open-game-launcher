import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import {
  addManualGame,
  fetchGamePassCatalog,
  listInstalledGames,
  normalizeSteamOwnedGames,
  refreshInstalledGames,
} from "../../lib/launcher";
import { normalizeLauncherKey } from "../../lib/formatters";
import {
  applyCustomArtwork,
  type CustomArtworkKind,
  type CustomArtworkMap,
} from "../../lib/custom-artwork";
import { compressAndReadImage, isAllowedImageType } from "../../lib/image-compress";
import { getGameLogoCandidates } from "../../lib/formatters";
import { syncGamePlaytimeStats } from "../../lib/supabase/playtime";
import { getProviderErrorMessage, readLocalStorageString } from "../../lib/library-providers";
import { STEAM_OWNED_GAMES_CACHE_VERSION, STORAGE_KEYS } from "../../lib/storage-keys";
import type {
  Game,
  GameLifecycleEvent,
  GameRuntimeStatus,
  GameRuntimeUpdate,
  PlatformClientLifecycleEvent,
} from "../../lib/types";
import {
  mergeBattlenetOwned,
  mergeEaOwned,
  mergeEpicOwned,
  mergeGamePassOwned,
  mergeGogOwned,
  mergeSteamOwned,
  mergeUbisoftOwned,
  mergeXboxOwned,
  type MergeContext,
  type ProviderMerger,
} from "../../library/providers";

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

function readLibrarySnapshot(): Game[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.LIBRARY_SNAPSHOT);
    if (!saved) {
      return [];
    }

    const games = JSON.parse(saved);
    return Array.isArray(games) ? (games as Game[]) : [];
  } catch {
    return [];
  }
}

function writeLibrarySnapshot(games: Game[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.LIBRARY_SNAPSHOT, JSON.stringify(games));
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

function readCustomArtworkMap(): CustomArtworkMap {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.LIBRARY_CUSTOM_ARTWORK);
    const parsed: unknown = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === "object" ? (parsed as CustomArtworkMap) : {};
  } catch {
    return {};
  }
}

export interface UseLibrarySyncOptions {
  setStatusMessage: GameStatusSetter;
}

export interface UseLibrarySyncResult {
  installedGames: Game[];
  setInstalledGames: Dispatch<SetStateAction<Game[]>>;
  installedGamesRef: RefObject<Game[]>;
  runningGameIds: Set<string>;
  gameRuntimeById: Record<string, GameRuntimeStatus>;
  isDiscoveringGames: boolean;
  discoveryMessage: string | null;
  initialLibrarySnapshot: Game[];
  runAutomaticLibrarySync: (forceRefresh?: boolean) => Promise<void>;
  loadInstalledGames: (
    forceRefresh?: boolean,
    shouldApplyResult?: () => boolean,
    showLoading?: boolean,
  ) => Promise<void>;
  addGameToLibrary: (input: { title: string; installPath: string }) => Promise<Game>;
  shouldShowLibraryLoading: boolean;
  logoCandidateIndexes: Record<string, number>;
  loadedLogoUrls: Set<string>;
  handleLogoLoad: (logoUrl: string) => void;
  handleLogoError: (game: Game) => void;
  customArtwork: CustomArtworkMap;
  handleSelectCustomArtwork: (gameId: string, kind: CustomArtworkKind, file: File) => Promise<void>;
  handleArtworkDrop: (gameId: string, kind: CustomArtworkKind, file: File) => Promise<void>;
  handleApplyCustomArtworkUrl: (
    gameId: string,
    kind: CustomArtworkKind,
    url: string,
    sourceLabel: string,
  ) => void;
  handleConfirmArtwork: (dataUrl: string, kind: CustomArtworkKind) => void;
  handleResetCustomArtwork: (gameId: string, kind?: CustomArtworkKind) => void;
  pendingArtworkFile: File | null;
  pendingArtworkKind: CustomArtworkKind;
  pendingArtworkGameId: string | null;
  openArtworkPreview: (gameId: string, kind: CustomArtworkKind, file: File) => void;
  closeArtworkPreview: () => void;
}

const PROVIDER_PIPELINE: ProviderMerger[] = [
  mergeSteamOwned,
  mergeGogOwned,
  mergeEaOwned,
  mergeEpicOwned,
  mergeUbisoftOwned,
  mergeXboxOwned,
  mergeGamePassOwned,
  mergeBattlenetOwned,
];

export function useLibrarySync({ setStatusMessage }: UseLibrarySyncOptions): UseLibrarySyncResult {
  const [initialLibrarySnapshot] = useState(readLibrarySnapshot);
  const installedGamesRef = useRef<Game[]>(initialLibrarySnapshot);
  const [installedGames, setInstalledGames] = useState<Game[]>(initialLibrarySnapshot);
  const [runningGameIds, setRunningGameIds] = useState<Set<string>>(() => new Set());
  const [gameRuntimeById, setGameRuntimeById] = useState<Record<string, GameRuntimeStatus>>(
    () => ({}),
  );
  const [isDiscoveringGames, setIsDiscoveringGames] = useState(initialLibrarySnapshot.length === 0);
  const [discoveryMessage, setDiscoveryMessage] = useState<string | null>(null);
  const [logoCandidateIndexes, setLogoCandidateIndexes] = useState<Record<string, number>>(
    () => ({}),
  );
  const [loadedLogoUrls, setLoadedLogoUrls] = useState<Set<string>>(() => new Set());
  const [customArtwork, setCustomArtwork] = useState<CustomArtworkMap>(readCustomArtworkMap);
  const [pendingArtworkFile, setPendingArtworkFile] = useState<File | null>(null);
  const [pendingArtworkKind, setPendingArtworkKind] = useState<CustomArtworkKind>("cover");
  const [pendingArtworkGameId, setPendingArtworkGameId] = useState<string | null>(null);
  const automaticSyncInFlightRef = useRef(false);
  const lastFocusSyncAtRef = useRef(0);

  useEffect(() => {
    installedGamesRef.current = installedGames;
  }, [installedGames]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      writeLibrarySnapshot(installedGames);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [installedGames]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.LIBRARY_CUSTOM_ARTWORK, JSON.stringify(customArtwork));
    } catch (error) {
      console.warn("Failed to persist custom artwork:", error);
      setStatusMessage("Artwork could not be saved. Try a smaller image file.");
    }
  }, [customArtwork, setStatusMessage]);

  async function loadInstalledGamesImpl(
    forceRefresh = false,
    shouldApplyResult: () => boolean = () => true,
    showLoading = true,
  ) {
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

      const context: MergeContext = { forceRefresh, setStatusMessage, shouldApplyResult };
      for (const provider of PROVIDER_PIPELINE) {
        if (!shouldApplyResult()) {
          return;
        }
        try {
          const result = await provider(games, context);
          if (result.warnings.length > 0) {
            for (const warning of result.warnings) {
              console.warn(warning);
            }
          }
          if (result.statusMessage) {
            setStatusMessage(result.statusMessage);
          }
          games = result.games;
        } catch (err) {
          console.warn("Provider merge threw unexpectedly:", err);
        }
      }

      if (!shouldApplyResult()) {
        return;
      }

      setInstalledGames((current) => (areGameListsEqual(current, games) ? current : games));
      setDiscoveryMessage(
        games.length > 0
          ? null
          : "No installed Steam, Epic, or GOG games found. Local preview shelf loaded.",
      );
    } catch {
      if (!shouldApplyResult()) {
        return;
      }

      setInstalledGames([]);
      setDiscoveryMessage(
        forceRefresh
          ? "Automatic sync is unavailable in this session. Showing the local preview shelf."
          : "Saved library is unavailable in this session. Showing the local preview shelf.",
      );
    } finally {
      if (showLoading && shouldApplyResult()) {
        setIsDiscoveringGames(false);
      }
    }
  }

  const loadInstalledGames = useCallback(loadInstalledGamesImpl, [setStatusMessage]);

  function shouldRunStartupLibraryRescan() {
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
        return;
      }

      automaticSyncInFlightRef.current = true;
      try {
        await loadInstalledGames(forceRefresh, () => true, false);
      } finally {
        automaticSyncInFlightRef.current = false;
      }
    },
    [loadInstalledGames],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadLibrary() {
      if (automaticSyncInFlightRef.current) return;
      automaticSyncInFlightRef.current = true;
      try {
        const shouldRefreshOnStartup = shouldRunStartupLibraryRescan();

        if (initialLibrarySnapshot.length > 0 && shouldRefreshOnStartup) {
          await loadInstalledGames(true, () => isMounted, false);
        } else {
          await loadInstalledGames(false, () => isMounted, initialLibrarySnapshot.length === 0);

          if (isMounted && shouldRefreshOnStartup) {
            await loadInstalledGames(true, () => isMounted, false);
          }
        }
      } finally {
        automaticSyncInFlightRef.current = false;
      }
    }

    void loadLibrary();

    return () => {
      isMounted = false;
    };
  }, [initialLibrarySnapshot.length, loadInstalledGames]);

  useEffect(() => {
    let isMounted = true;

    if (initialLibrarySnapshot.length === 0) {
      return;
    }

    const cacheStr = localStorage.getItem(STORAGE_KEYS.GAME_PASS_CATALOG_CACHE);
    let needsFetch = !cacheStr;
    if (cacheStr) {
      try {
        const parsed = JSON.parse(cacheStr);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          needsFetch = true;
        }
      } catch {
        needsFetch = true;
      }
    }

    if (needsFetch) {
      setIsDiscoveringGames(true);
      setDiscoveryMessage("Fetching Xbox Game Pass Catalog (~500 games)...");
      fetchGamePassCatalog()
        .then((games) => {
          if (!isMounted) return;
          localStorage.setItem(STORAGE_KEYS.GAME_PASS_CATALOG_CACHE, JSON.stringify(games));
          void runAutomaticLibrarySync(true);
        })
        .catch((err) => {
          if (!isMounted) return;
          console.error("Game Pass fetch failed", err);
        })
        .finally(() => {
          if (!isMounted) return;
          setIsDiscoveringGames(false);
          setDiscoveryMessage(null);
        });
    } else {
      void runAutomaticLibrarySync(false);
    }

    return () => {
      isMounted = false;
    };
  }, [initialLibrarySnapshot.length, runAutomaticLibrarySync]);

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
      ? listen<string>("steam_login_success", () => {
          if (!isMounted) return;
          void runAutomaticLibrarySync(false);
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
    window.addEventListener("battlenet_library_updated", handleBattlenetUpdated);

    const unlistenScrapedSuccess = isTauri()
      ? listen<unknown[]>("steam_scraped_games_success", (event) => {
          if (!isMounted) return;
          const ownedGames = normalizeSteamOwnedGames(event.payload);
          localStorage.setItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE, JSON.stringify(ownedGames));
          localStorage.setItem(
            STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_VERSION,
            STEAM_OWNED_GAMES_CACHE_VERSION,
          );
          void runAutomaticLibrarySync(false);
        })
      : null;

    const unlistenScrapedError = isTauri()
      ? listen<string>("steam_scraped_games_error", (event) => {
          if (!isMounted) return;
          console.warn("[OG-Launcher] Silent scraper failed:", event.payload);
          setStatusMessage(`Warning: Steam: ${event.payload}`);
        })
      : null;

    return () => {
      isMounted = false;
      void unlistenInventory?.then((u) => u());
      void unlistenSteam?.then((u) => u());
      void unlistenGog?.then((u) => u());
      void unlistenEa?.then((u) => u());
      window.removeEventListener("battlenet_library_updated", handleBattlenetUpdated);
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
      if (now - lastFocusSyncAtRef.current < 30_000) {
        return;
      }

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

  function handleLogoError(game: Game) {
    const candidates = getGameLogoCandidates(game);

    setLogoCandidateIndexes((current) => {
      const currentIndex = current[game.id] ?? 0;
      return {
        ...current,
        [game.id]: currentIndex + 1 >= candidates.length ? candidates.length : currentIndex + 1,
      };
    });
  }

  function handleLogoLoad(logoUrl: string) {
    setLoadedLogoUrls((current) => {
      if (current.has(logoUrl)) {
        return current;
      }

      const next = new Set(current);
      next.add(logoUrl);
      return next;
    });
  }

  async function handleSelectCustomArtwork(gameId: string, kind: CustomArtworkKind, file: File) {
    if (!isAllowedImageType(file)) {
      setStatusMessage("Only JPG, PNG, and WebP images can be used as custom artwork.");
      return;
    }

    try {
      const dataUrl = await compressAndReadImage(file, kind);
      setCustomArtwork((current) => ({
        ...current,
        [gameId]: {
          ...current[gameId],
          [`${kind}Url`]: dataUrl,
          updatedAt: Date.now(),
        },
      }));
      setLogoCandidateIndexes((current) => ({ ...current, [gameId]: 0 }));
      setStatusMessage(`Custom ${kind} artwork saved.`);
    } catch (error) {
      setStatusMessage(getProviderErrorMessage(error));
    }
  }

  async function handleArtworkDrop(gameId: string, kind: CustomArtworkKind, file: File) {
    await handleSelectCustomArtwork(gameId, kind, file);
  }

  function handleApplyCustomArtworkUrl(
    gameId: string,
    kind: CustomArtworkKind,
    url: string,
    sourceLabel: string,
  ) {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setStatusMessage("Artwork candidate is missing a URL.");
      return;
    }

    setCustomArtwork((current) => ({
      ...current,
      [gameId]: {
        ...current[gameId],
        [`${kind}Url`]: trimmedUrl,
        updatedAt: Date.now(),
      },
    }));
    setLogoCandidateIndexes((current) => ({ ...current, [gameId]: 0 }));
    setStatusMessage(`${sourceLabel} ${kind} artwork applied.`);
  }

  function openArtworkPreview(gameId: string, kind: CustomArtworkKind, file: File) {
    setPendingArtworkGameId(gameId);
    setPendingArtworkKind(kind);
    setPendingArtworkFile(file);
  }

  function closeArtworkPreview() {
    setPendingArtworkFile(null);
    setPendingArtworkGameId(null);
  }

  function handleConfirmArtwork(dataUrl: string, kind: CustomArtworkKind) {
    if (!pendingArtworkGameId) return;

    setCustomArtwork((current) => ({
      ...current,
      [pendingArtworkGameId]: {
        ...current[pendingArtworkGameId],
        [`${kind}Url`]: dataUrl,
        updatedAt: Date.now(),
      },
    }));
    setLogoCandidateIndexes((current) => ({ ...current, [pendingArtworkGameId]: 0 }));
    setStatusMessage(`Custom ${kind} artwork saved.`);
    closeArtworkPreview();
  }

  function handleResetCustomArtwork(gameId: string, kind?: CustomArtworkKind) {
    setCustomArtwork((current) => {
      const currentArtwork = current[gameId];
      if (!currentArtwork) {
        return current;
      }

      const next = { ...current };
      if (!kind) {
        delete next[gameId];
        return next;
      }

      const nextArtwork = { ...currentArtwork };
      delete nextArtwork[`${kind}Url`];
      nextArtwork.updatedAt = Date.now();

      if (!nextArtwork.coverUrl && !nextArtwork.iconUrl && !nextArtwork.logoUrl) {
        delete next[gameId];
      } else {
        next[gameId] = nextArtwork;
      }

      return next;
    });
    setLogoCandidateIndexes((current) => ({ ...current, [gameId]: 0 }));
    setStatusMessage(kind ? `Custom ${kind} artwork reset.` : "Custom artwork reset.");
  }

  async function addGameToLibrary(input: { title: string; installPath: string }) {
    const game = await addManualGame(input);
    setInstalledGames((current) => {
      const withoutDuplicate = current.filter((item) => item.id !== game.id);
      return [...withoutDuplicate, game];
    });
    return game;
  }

  const shouldShowLibraryLoading = isDiscoveringGames && installedGames.length === 0;

  void applyCustomArtwork;
  void readLocalStorageString;

  return {
    installedGames,
    setInstalledGames,
    installedGamesRef,
    runningGameIds,
    gameRuntimeById,
    isDiscoveringGames,
    discoveryMessage,
    initialLibrarySnapshot,
    runAutomaticLibrarySync,
    loadInstalledGames,
    addGameToLibrary,
    shouldShowLibraryLoading,
    logoCandidateIndexes,
    loadedLogoUrls,
    handleLogoLoad,
    handleLogoError,
    customArtwork,
    handleSelectCustomArtwork,
    handleArtworkDrop,
    handleApplyCustomArtworkUrl,
    handleConfirmArtwork,
    handleResetCustomArtwork,
    pendingArtworkFile,
    pendingArtworkKind,
    pendingArtworkGameId,
    openArtworkPreview,
    closeArtworkPreview,
  };
}
