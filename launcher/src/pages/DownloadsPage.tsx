import { Settings, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";

import { DownloadCard } from "../components/launcher/DownloadCard";
import type { Game } from "../lib/types";
import {
  archiveDownload,
  cancelDownload,
  pauseDownload,
  listInstalledGames,
  launchGame,
} from "../lib/launcher";
import { getErrorMessage } from "../lib/formatters";
import { useDebugMode } from "../hooks/useDebugMode";
import { STORAGE_KEYS } from "../lib/storage-keys";
import {
  isActiveDownloadItem,
  isPausedDownloadItem,
  useDownloadStore,
} from "../stores/downloadStore";

interface DownloadCommandError {
  gameId: string;
  message: string;
}

type PendingDownloadCommand = "pause" | "cancel" | "archive" | "launch" | "clear";

// Parse download speed string into numerical bytes/sec
function parseSpeedToBytes(speedStr: string): number {
  if (!speedStr) return 0;
  const match = speedStr.match(/(\d+(?:\.\d+)?)\s*(gb|mb|kb|b)?\/s/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = (match[2] || "").toLowerCase();
  if (unit === "kb") return value * 1024;
  if (unit === "mb") return value * 1024 * 1024;
  if (unit === "gb") return value * 1024 * 1024 * 1024;
  return value;
}

// Format bytes/sec back into readable transfer rate string
function formatBytesPerSecond(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function readLibrarySnapshot(): Game[] {
  try {
    const snapshot = localStorage.getItem(STORAGE_KEYS.LIBRARY_SNAPSHOT);
    if (!snapshot) return [];

    const parsed: unknown = JSON.parse(snapshot);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (game): game is Game =>
        Boolean(game) &&
        typeof game === "object" &&
        typeof (game as { id?: unknown }).id === "string",
    );
  } catch {
    return [];
  }
}

export function DownloadsPage() {
  const items = useDownloadStore((s) => s.items);
  const removeItem = useDownloadStore((s) => s.removeItem);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [pendingCommands, setPendingCommands] = useState<Map<string, PendingDownloadCommand>>(
    () => new Map(),
  );
  const [isClearingCompleted, setIsClearingCompleted] = useState(false);
  const [debugMode] = useDebugMode();
  const navigate = useNavigate();

  // Load games database to fetch cover artwork for download items
  const [games, setGames] = useState<Game[]>([]);
  const [sessionPeakBytes, setSessionPeakBytes] = useState(0);
  const pendingCommandTimeoutsRef = useRef<number[]>([]);
  const pendingCommandsRef = useRef<Map<string, PendingDownloadCommand>>(new Map());
  const isClearingCompletedRef = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    let active = true;

    listInstalledGames()
      .then((loadedGames) => {
        if (active) {
          setGames(loadedGames);
        }
      })
      .catch(() => {
        if (!active) return;
        setGames(readLibrarySnapshot());
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const timeoutId of pendingCommandTimeoutsRef.current) {
        window.clearTimeout(timeoutId);
      }
      pendingCommandTimeoutsRef.current = [];
    };
  }, []);

  const gamesMap = useMemo(() => {
    const map = new Map<string, Game>();
    for (const game of games) {
      map.set(game.id, game);
    }
    return map;
  }, [games]);

  useEffect(() => {
    let active = true;
    const unlistenPromise = isTauri()
      ? listen<DownloadCommandError>("download_command_error", (event) => {
          if (active) setCommandError(event.payload.message);
        })
      : null;

    return () => {
      active = false;
      void unlistenPromise?.then((unlisten) => unlisten());
    };
  }, []);

  // Split items into Steam-like queue categories
  const activeItems = useMemo(() => {
    return items.filter(isActiveDownloadItem);
  }, [items]);

  const unscheduledItems = useMemo(() => {
    // Paused items, failed, cancelled, error
    return items.filter(
      (item) =>
        isPausedDownloadItem(item) ||
        item.status === "failed" ||
        item.status === "cancelled" ||
        item.status === "error",
    );
  }, [items]);

  const completedItems = useMemo(() => {
    return items.filter((item) => item.status === "completed");
  }, [items]);
  const hasPendingCompletedCommand = completedItems.some((item) =>
    pendingCommands.has(item.gameId),
  );

  // Aggregate download speed and peak tracking
  const totalSpeedBytes = useMemo(() => {
    return activeItems.reduce((sum, item) => sum + parseSpeedToBytes(item.speed), 0);
  }, [activeItems]);

  useEffect(() => {
    if (totalSpeedBytes > sessionPeakBytes) {
      setSessionPeakBytes(totalSpeedBytes);
    }
  }, [totalSpeedBytes, sessionPeakBytes]);

  const activeSpeedStr = formatBytesPerSecond(totalSpeedBytes);
  const peakSpeedStr = formatBytesPerSecond(sessionPeakBytes);

  const beginGameCommand = useCallback((gameId: string, command: PendingDownloadCommand) => {
    if (pendingCommandsRef.current.has(gameId)) return false;

    pendingCommandsRef.current.set(gameId, command);
    setPendingCommands((current) => new Map(current).set(gameId, command));
    return true;
  }, []);

  const finishGameCommand = useCallback((gameId: string) => {
    pendingCommandsRef.current.delete(gameId);
    setPendingCommands((current) => {
      const next = new Map(current);
      next.delete(gameId);
      return next;
    });
  }, []);

  const handlePauseToggle = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((x) => x.id === id);
      if (!item) return;
      if (!beginGameCommand(item.gameId, "pause")) return;

      try {
        setCommandError(null);
        await pauseDownload(item.gameId);
      } catch (err) {
        setCommandError(getErrorMessage(err));
        console.error("Failed to toggle pause:", err);
      } finally {
        const timeoutId = window.setTimeout(() => {
          finishGameCommand(item.gameId);
          pendingCommandTimeoutsRef.current = pendingCommandTimeoutsRef.current.filter(
            (storedTimeoutId) => storedTimeoutId !== timeoutId,
          );
        }, 500);
        pendingCommandTimeoutsRef.current.push(timeoutId);
      }
    },
    [beginGameCommand, finishGameCommand],
  );

  const handleCancel = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((x) => x.id === id);
      if (!item) return;
      if (!beginGameCommand(item.gameId, "cancel")) return;

      try {
        setCommandError(null);
        await cancelDownload(item.gameId);
        removeItem(item.gameId);
      } catch (err) {
        setCommandError(getErrorMessage(err));
        console.error("Failed to cancel download:", err);
      } finally {
        finishGameCommand(item.gameId);
      }
    },
    [beginGameCommand, finishGameCommand, removeItem],
  );

  const handleArchive = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((x) => x.id === id);
      if (!item) return;
      if (!beginGameCommand(item.gameId, "archive")) return;

      try {
        setCommandError(null);
        await archiveDownload(item.gameId);
        removeItem(item.gameId);
      } catch (err) {
        setCommandError(getErrorMessage(err));
        console.error("Failed to archive download:", err);
      } finally {
        finishGameCommand(item.gameId);
      }
    },
    [beginGameCommand, finishGameCommand, removeItem],
  );

  const handleLaunchGame = useCallback(
    async (gameId: string) => {
      if (!beginGameCommand(gameId, "launch")) return;

      try {
        setCommandError(null);
        await launchGame(gameId);
      } catch (err) {
        setCommandError(getErrorMessage(err));
        console.error("Failed to launch game:", err);
      } finally {
        finishGameCommand(gameId);
      }
    },
    [beginGameCommand, finishGameCommand],
  );

  async function handleClearAllCompleted() {
    if (isClearingCompletedRef.current) return;

    isClearingCompletedRef.current = true;
    setIsClearingCompleted(true);
    setCommandError(null);
    const failures: string[] = [];

    for (const item of completedItems) {
      if (!beginGameCommand(item.gameId, "clear")) {
        failures.push(`${item.title} is busy`);
        continue;
      }

      try {
        await archiveDownload(item.gameId);
        removeItem(item.gameId);
      } catch (err) {
        failures.push(getErrorMessage(err));
        console.error("Failed to clear completed item:", err);
      } finally {
        finishGameCommand(item.gameId);
      }
    }

    isClearingCompletedRef.current = false;
    setIsClearingCompleted(false);
    if (failures.length > 0) {
      setCommandError(
        `Could not clear ${failures.length} completed download${failures.length === 1 ? "" : "s"}: ${failures[0]}`,
      );
    }
  }

  return (
    <section aria-labelledby="downloads-title" className="space-y-6">
      {/* System Monitor Header Dashboard */}
      <div className="flex flex-col items-stretch gap-4 border-4 border-black bg-[#efe6d4] p-4 shadow-[4px_4px_0_#171411] md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black tracking-[0.18em] text-[#c20b2f] uppercase">
            Transfer Control
          </p>
          <h1
            id="downloads-title"
            className="neo-title text-3xl leading-none font-black text-[#171411] uppercase"
          >
            Downloads
          </h1>
          <p className="neo-copy mt-1 text-[10px] font-bold text-[#5b403f] uppercase">
            {items.length} game jobs
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-col border-l-2 border-black pl-3 md:pl-4">
            <span className="neo-copy text-[9px] font-bold text-[#5b403f] uppercase">NETWORK</span>
            <span className="neo-copy text-xl font-extrabold text-[#171411]">{activeSpeedStr}</span>
          </div>
          <div className="flex flex-col border-l-2 border-black pl-3 md:pl-4">
            <span className="neo-copy text-[9px] font-bold text-[#5b403f] uppercase">PEAK</span>
            <span className="neo-copy text-xl font-extrabold text-[#171411]">{peakSpeedStr}</span>
          </div>
          <div className="flex flex-col border-l-2 border-black pl-3 md:pl-4">
            <span className="neo-copy text-[9px] font-bold text-[#5b403f] uppercase">ACTIVE</span>
            <span className="neo-copy text-xl font-extrabold text-[#171411]">
              {activeItems.length}
            </span>
          </div>
          <button
            aria-label="Download settings"
            onClick={() => navigate("/settings")}
            className="ml-2 flex h-10 w-10 items-center justify-center border-2 border-black bg-[#f5eedf] shadow-[2px_2px_0_#171411] hover:bg-[#efe6d4] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
            type="button"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {commandError ? (
        <div
          aria-live="assertive"
          className="neo-copy border-4 border-black bg-[#c20b2f] p-4 text-xs font-bold break-words text-white uppercase shadow-[4px_4px_0_#171411]"
          role="alert"
        >
          {commandError}
        </div>
      ) : null}

      {/* Downloader Queue List Groups */}
      <div className="space-y-8">
        {/* 1. UP NEXT / ACTIVE Sektion */}
        <div>
          <div className="mb-3 flex items-center justify-between border-b-2 border-black pb-1.5">
            <h2 className="neo-title text-base font-black tracking-wider text-[#171411] uppercase">
              Up Next ({activeItems.length})
            </h2>
          </div>
          {activeItems.length > 0 ? (
            <div className="space-y-3">
              {activeItems.map((item, idx) => (
                <DownloadCard
                  key={item.id}
                  index={idx}
                  item={item}
                  game={gamesMap.get(item.gameId)}
                  pendingAction={pendingCommands.get(item.gameId)}
                  debugMode={debugMode}
                  onArchive={handleArchive}
                  onCancel={handleCancel}
                  onPauseToggle={handlePauseToggle}
                />
              ))}
            </div>
          ) : (
            <div className="neo-copy border-2 border-dashed border-black bg-[#efe6d4]/40 p-6 text-center text-xs font-bold text-[#55504a] uppercase">
              There are no downloads in the queue
            </div>
          )}
        </div>

        {/* 2. UNSCHEDULED Sektion */}
        {unscheduledItems.length > 0 ? (
          <div>
            <div className="mb-3 flex items-center justify-between border-b-2 border-black pb-1.5">
              <h2 className="neo-title text-base font-black tracking-wider text-[#171411] uppercase">
                Unscheduled ({unscheduledItems.length})
              </h2>
            </div>
            <div className="space-y-3">
              {unscheduledItems.map((item, idx) => (
                <DownloadCard
                  key={item.id}
                  index={idx}
                  item={item}
                  game={gamesMap.get(item.gameId)}
                  pendingAction={pendingCommands.get(item.gameId)}
                  debugMode={debugMode}
                  onArchive={handleArchive}
                  onCancel={handleCancel}
                  onPauseToggle={handlePauseToggle}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* 3. COMPLETED Sektion */}
        {completedItems.length > 0 ? (
          <div>
            <div className="mb-3 flex items-center justify-between border-b-2 border-black pb-1.5">
              <h2 className="neo-title text-base font-black tracking-wider text-[#171411] uppercase">
                Completed ({completedItems.length})
              </h2>
              <button
                disabled={isClearingCompleted || hasPendingCompletedCommand}
                onClick={handleClearAllCompleted}
                className={`neo-copy flex items-center gap-1.5 border-2 border-black px-2.5 py-1 text-[10px] font-bold uppercase ${
                  isClearingCompleted || hasPendingCompletedCommand
                    ? "cursor-not-allowed bg-[#efe6d4] text-[#55504a]"
                    : "bg-[#efe6d4] text-[#171411] shadow-[2px_2px_0_#171411] hover:bg-[#e2d8c3] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
                }`}
                type="button"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isClearingCompleted ? "Clearing..." : "Clear All"}
              </button>
            </div>
            <div className="space-y-3">
              {completedItems.map((item, idx) => (
                <DownloadCard
                  key={item.id}
                  index={idx}
                  item={item}
                  game={gamesMap.get(item.gameId)}
                  pendingAction={
                    pendingCommands.get(item.gameId) ?? (isClearingCompleted ? "clear" : undefined)
                  }
                  debugMode={debugMode}
                  onArchive={handleArchive}
                  onCancel={handleCancel}
                  onPauseToggle={handlePauseToggle}
                  onLaunch={handleLaunchGame}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
