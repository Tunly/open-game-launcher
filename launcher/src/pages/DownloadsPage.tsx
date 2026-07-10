import { Settings, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";

import { DownloadCard } from "../components/launcher/DownloadCard";
import type { Game } from "../lib/types";
import type { ModInstallQueueItem } from "../lib/types/mods";
import {
  archiveDownload,
  cancelDownload,
  cancelModInstall,
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
import { isTerminalModInstallItem } from "../stores/modInstallStore";

interface DownloadCommandError {
  gameId: string;
  message: string;
}

const MAX_VISIBLE_MOD_INSTALL_ITEMS = 50;

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
  if (bytes <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function DownloadsPage() {
  const items = useDownloadStore((s) => s.items);
  const removeItem = useDownloadStore((s) => s.removeItem);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [pendingCommandGameIds, setPendingCommandGameIds] = useState<Set<string>>(() => new Set());
  const [debugMode] = useDebugMode();
  const navigate = useNavigate();

  // Load games database to fetch cover artwork for download items
  const [games, setGames] = useState<Game[]>([]);
  const [modItems, setModItems] = useState<ModInstallQueueItem[]>([]);
  const [sessionPeakBytes, setSessionPeakBytes] = useState(0);
  const pendingCommandTimeoutsRef = useRef<number[]>([]);
  const pendingArchiveGameIdsRef = useRef<Set<string>>(new Set());

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

        // Fallback to local snapshot
        const snapshot = localStorage.getItem(STORAGE_KEYS.LIBRARY_SNAPSHOT);
        if (snapshot) {
          try {
            setGames(JSON.parse(snapshot));
          } catch {
            /* ignore error parsing snapshot */
          }
        }
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

    const unlistenErrorPromise = isTauri()
      ? listen<DownloadCommandError>("download_command_error", (event) => {
          if (!active) return;
          setCommandError(event.payload.message);
        })
      : null;
    const unlistenModPromise = isTauri()
      ? listen<ModInstallQueueItem>("mod_install_progress", (event) => {
          if (!active) return;
          setModItems((prev) => {
            const next = prev.filter((item) => item.installId !== event.payload.installId);
            if (isTerminalModInstallItem(event.payload)) {
              return next;
            }
            return [...next, event.payload].slice(-MAX_VISIBLE_MOD_INSTALL_ITEMS);
          });
        })
      : null;

    return () => {
      active = false;
      void unlistenErrorPromise?.then((unlisten) => unlisten());
      void unlistenModPromise?.then((unlisten) => unlisten());
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

  const activeModItems = useMemo(() => {
    return modItems.filter(
      (item) =>
        item.status !== "completed" && item.status !== "failed" && item.status !== "cancelled",
    );
  }, [modItems]);

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
  const diskUsageStr = totalSpeedBytes > 0 ? formatBytesPerSecond(totalSpeedBytes * 1.15) : "0 B/s";

  async function handlePauseToggle(id: string) {
    const item = items.find((x) => x.id === id);
    if (!item) return;
    if (pendingCommandGameIds.has(item.gameId)) return;

    try {
      setCommandError(null);
      setPendingCommandGameIds((current) => new Set(current).add(item.gameId));
      await pauseDownload(item.gameId);
    } catch (err) {
      setCommandError(getErrorMessage(err));
      console.error("Failed to toggle pause:", err);
    } finally {
      const timeoutId = window.setTimeout(() => {
        setPendingCommandGameIds((current) => {
          const next = new Set(current);
          next.delete(item.gameId);
          return next;
        });
        pendingCommandTimeoutsRef.current = pendingCommandTimeoutsRef.current.filter(
          (storedTimeoutId) => storedTimeoutId !== timeoutId,
        );
      }, 500);
      pendingCommandTimeoutsRef.current.push(timeoutId);
    }
  }

  async function handleCancel(id: string) {
    const item = items.find((x) => x.id === id);
    if (!item) return;

    try {
      setCommandError(null);
      await cancelDownload(item.gameId);
      removeItem(item.gameId);
    } catch (err) {
      setCommandError(getErrorMessage(err));
      console.error("Failed to cancel download:", err);
    }
  }

  async function handleArchive(id: string) {
    const item = items.find((x) => x.id === id);
    if (!item) return;
    if (pendingArchiveGameIdsRef.current.has(item.gameId)) return;

    pendingArchiveGameIdsRef.current.add(item.gameId);
    setPendingCommandGameIds((current) => new Set(current).add(item.gameId));

    try {
      setCommandError(null);
      await archiveDownload(item.gameId);
      removeItem(item.gameId);
    } catch (err) {
      setCommandError(getErrorMessage(err));
      console.error("Failed to archive download:", err);
    } finally {
      pendingArchiveGameIdsRef.current.delete(item.gameId);
      setPendingCommandGameIds((current) => {
        const next = new Set(current);
        next.delete(item.gameId);
        return next;
      });
    }
  }

  async function handleLaunchGame(gameId: string) {
    try {
      setCommandError(null);
      await launchGame(gameId);
    } catch (err) {
      setCommandError(getErrorMessage(err));
      console.error("Failed to launch game:", err);
    }
  }

  async function handleClearAllCompleted() {
    for (const item of completedItems) {
      if (pendingArchiveGameIdsRef.current.has(item.gameId)) {
        continue;
      }

      pendingArchiveGameIdsRef.current.add(item.gameId);
      setPendingCommandGameIds((current) => new Set(current).add(item.gameId));

      try {
        await archiveDownload(item.gameId);
        removeItem(item.gameId);
      } catch (err) {
        console.error("Failed to clear completed item:", err);
      } finally {
        pendingArchiveGameIdsRef.current.delete(item.gameId);
        setPendingCommandGameIds((current) => {
          const next = new Set(current);
          next.delete(item.gameId);
          return next;
        });
      }
    }
  }

  async function handleModCancel(item: ModInstallQueueItem) {
    try {
      setCommandError(null);
      await cancelModInstall(item.installId);
      setModItems((prev) => prev.filter((m) => m.installId !== item.installId));
    } catch (err) {
      setCommandError(getErrorMessage(err));
    }
  }

  return (
    <section className="space-y-6">
      {/* System Monitor Header Dashboard */}
      <div className="flex flex-col items-center gap-4 border-4 border-black bg-[#efe6d4] p-4 shadow-[4px_4px_0_#171411] md:flex-row md:justify-end">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-col border-l-2 border-black pl-3 md:pl-4">
            <span className="neo-copy text-[9px] font-bold text-[#5b403f] uppercase">NETWORK</span>
            <span className="text-xl font-extrabold text-[#171411]">{activeSpeedStr}</span>
          </div>
          <div className="flex flex-col border-l-2 border-black pl-3 md:pl-4">
            <span className="neo-copy text-[9px] font-bold text-[#5b403f] uppercase">PEAK</span>
            <span className="text-xl font-extrabold text-[#171411]">{peakSpeedStr}</span>
          </div>
          <div className="flex flex-col border-l-2 border-black pl-3 md:pl-4">
            <span className="neo-copy text-[9px] font-bold text-[#5b403f] uppercase">
              DISK USAGE
            </span>
            <span className="text-xl font-extrabold text-[#171411]">{diskUsageStr}</span>
          </div>
          <button
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
        <div className="neo-copy border-4 border-black bg-[#c20b2f] p-4 text-xs font-bold break-words text-white uppercase shadow-[4px_4px_0_#171411]">
          {commandError}
        </div>
      ) : null}

      {/* Downloader Queue List Groups */}
      <div className="space-y-8">
        {/* 1. UP NEXT / ACTIVE Sektion */}
        <div>
          <div className="mb-3 flex items-center justify-between border-b-2 border-black pb-1.5">
            <h3 className="neo-title text-base font-black tracking-wider text-[#171411] uppercase">
              Up Next ({activeItems.length})
            </h3>
          </div>
          {activeItems.length > 0 ? (
            <div className="space-y-3">
              {activeItems.map((item, idx) => (
                <DownloadCard
                  key={item.id}
                  index={idx}
                  item={item}
                  game={gamesMap.get(item.gameId)}
                  commandPending={pendingCommandGameIds.has(item.gameId)}
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
              <h3 className="neo-title text-base font-black tracking-wider text-[#171411] uppercase">
                Unscheduled ({unscheduledItems.length})
              </h3>
            </div>
            <div className="space-y-3">
              {unscheduledItems.map((item, idx) => (
                <DownloadCard
                  key={item.id}
                  index={idx}
                  item={item}
                  game={gamesMap.get(item.gameId)}
                  commandPending={pendingCommandGameIds.has(item.gameId)}
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
              <h3 className="neo-title text-base font-black tracking-wider text-[#171411] uppercase">
                Completed ({completedItems.length})
              </h3>
              <button
                onClick={handleClearAllCompleted}
                className="neo-copy flex items-center gap-1.5 border-2 border-black bg-[#efe6d4] px-2.5 py-1 text-[10px] font-bold text-[#171411] uppercase shadow-[2px_2px_0_#171411] hover:bg-[#e2d8c3] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
                type="button"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear All
              </button>
            </div>
            <div className="space-y-3">
              {completedItems.map((item, idx) => (
                <DownloadCard
                  key={item.id}
                  index={idx}
                  item={item}
                  game={gamesMap.get(item.gameId)}
                  commandPending={pendingCommandGameIds.has(item.gameId)}
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

      {/* Mod Installs Section */}
      {activeModItems.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between border-b-2 border-black pb-1.5">
            <h3 className="neo-title text-base font-black tracking-wider text-[#171411] uppercase">
              Mod Installs ({activeModItems.length})
            </h3>
          </div>
          <div className="space-y-3">
            {activeModItems.map((item) => (
              <article
                key={item.installId}
                className="grid gap-3 border-4 border-black bg-[#f5eedf] p-3 shadow-[4px_4px_0_#171411] lg:grid-cols-[1fr_140px_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="neo-copy border-2 border-black bg-[#087d6d] px-2 py-0.5 text-[9px] font-black text-white uppercase">
                      {item.provider}
                    </span>
                    <span className="neo-copy text-[10px] font-black text-[#55504a] uppercase">
                      {item.phase}
                    </span>
                  </div>
                  <h3 className="mt-1 truncate text-lg leading-none font-black text-[#171411] uppercase">
                    {item.title}
                  </h3>
                  <p className="neo-copy mt-1 text-[10px] font-black text-[#5b403f] uppercase">
                    {gamesMap.get(item.gameId)?.title ?? item.gameId}
                  </p>
                </div>
                <div>
                  <p className="neo-copy mb-1 text-[10px] font-black text-[#55504a] uppercase">
                    {item.progress}% {item.speed ? `// ${item.speed}` : ""}
                  </p>
                  <div className="h-3 border-2 border-black bg-[#efe6d4]">
                    <div className="h-full bg-[#c20b2f]" style={{ width: `${item.progress}%` }} />
                  </div>
                </div>
                {item.canCancel && (
                  <button
                    className="neo-copy flex h-9 items-center justify-center gap-2 border-2 border-black bg-[#f6edd8] px-3 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411]"
                    type="button"
                    onClick={() => void handleModCancel(item)}
                  >
                    <XCircle className="h-4 w-4" />
                    Cancel
                  </button>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
