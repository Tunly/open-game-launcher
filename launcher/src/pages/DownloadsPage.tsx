import { ListFilter, Settings, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";

import { DownloadCard } from "../components/launcher/DownloadCard";
import type { DownloadItem, Game } from "../lib/types";
import {
  archiveDownload,
  cancelDownload,
  getDownloadQueue,
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

type QueueFilter = "all" | "active" | "paused" | "done";

interface DownloadCommandError {
  gameId: string;
  message: string;
}

interface DownloadRemoved {
  gameId: string;
}

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
  const totalProgress = useDownloadStore((s) => s.totalProgress());
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [commandError, setCommandError] = useState<string | null>(null);
  const [pendingCommandGameIds, setPendingCommandGameIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [debugMode] = useDebugMode();
  const navigate = useNavigate();

  // Load games database to fetch cover artwork for download items
  const [games, setGames] = useState<Game[]>([]);
  const [sessionPeakBytes, setSessionPeakBytes] = useState(0);

  useEffect(() => {
    // Load library games
    listInstalledGames()
      .then(setGames)
      .catch(() => {
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

    const unlistenPromise = listen<DownloadItem>(
      "download_progress",
      (event) => {
        if (!active) return;
        useDownloadStore.getState().upsertItem(event.payload);
      },
    );
    const unlistenErrorPromise = listen<DownloadCommandError>(
      "download_command_error",
      (event) => {
        if (!active) return;
        setCommandError(event.payload.message);
      },
    );
    const unlistenRemovedPromise = listen<DownloadRemoved>(
      "download_removed",
      (event) => {
        if (!active) return;
        useDownloadStore.getState().removeItem(event.payload.gameId);
      },
    );

    getDownloadQueue()
      .then((queue) => {
        if (active) {
          useDownloadStore.getState().setItems(queue);
        }
      })
      .catch(() => {
        /* ignore error queue */
      });

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
      void unlistenErrorPromise.then((unlisten) => unlisten());
      void unlistenRemovedPromise.then((unlisten) => unlisten());
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
      window.setTimeout(() => {
        setPendingCommandGameIds((current) => {
          const next = new Set(current);
          next.delete(item.gameId);
          return next;
        });
      }, 500);
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
    try {
      setCommandError(null);
      await archiveDownload(item.gameId);
      removeItem(item.gameId);
    } catch (err) {
      setCommandError(getErrorMessage(err));
      console.error("Failed to archive download:", err);
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
      try {
        await archiveDownload(item.gameId);
        removeItem(item.gameId);
      } catch (err) {
        console.error("Failed to clear completed item:", err);
      }
    }
  }

  return (
    <section className="space-y-6">
      {/* System Monitor Header Dashboard */}
      <div className="flex flex-col md:flex-row md:justify-end gap-4 items-center border-4 border-black bg-[#efe6d4] p-4 shadow-[4px_4px_0_#171411]">
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
            <span className="neo-copy text-[9px] font-bold text-[#5b403f] uppercase">DISK USAGE</span>
            <span className="text-xl font-extrabold text-[#171411]">{diskUsageStr}</span>
          </div>
          <button
            onClick={() => navigate("/settings")}
            className="flex h-10 w-10 items-center justify-center border-2 border-black bg-[#f5eedf] shadow-[2px_2px_0_#171411] hover:bg-[#efe6d4] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411] ml-2"
            type="button"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filter and Global Progress bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-4 border-black pb-4">
        {/* Total Load Panel */}
        <div className="flex-1 max-w-md">
          <div className="flex items-center justify-between gap-2">
            <span className="neo-copy text-xs font-bold uppercase text-[#55504a]">
              Total Progress // {totalProgress}%
            </span>
          </div>
          <div className="mt-1.5 h-3 border-2 border-black bg-[#efe6d4]">
            <div
              className="h-full bg-[#c20b2f]"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>

        {/* Categories Tab Selector */}
        <div className="grid grid-cols-[40px_repeat(4,minmax(0,1fr))] border-2 border-black bg-[#f5eedf] shadow-[2px_2px_0_#171411] w-full sm:w-fit h-9">
          <span className="flex items-center justify-center">
            <ListFilter className="h-4 w-4" />
          </span>
          {[
            ["all", "All"],
            ["active", "Run"],
            ["paused", "Pause"],
            ["done", "Done"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`neo-copy border-l-2 border-black px-3 text-[10px] font-bold uppercase sm:px-4 ${
                filter === value
                  ? "bg-[#087d6d] text-white"
                  : "bg-[#f5eedf] text-[#171411] hover:bg-[#efe6d4]"
              }`}
              type="button"
              onClick={() => setFilter(value as QueueFilter)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {commandError ? (
        <div className="neo-copy border-4 border-black bg-[#c20b2f] p-4 text-xs font-bold uppercase text-white shadow-[4px_4px_0_#171411]">
          {commandError}
        </div>
      ) : null}

      {/* Downloader Queue List Groups */}
      <div className="space-y-8">
        {/* 1. UP NEXT / ACTIVE Sektion */}
        {(filter === "all" || filter === "active") && (
          <div>
            <div className="flex items-center justify-between border-b-2 border-black pb-1.5 mb-3">
              <h3 className="neo-title text-base font-black text-[#171411] uppercase tracking-wider">
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
              <div className="neo-copy border-2 border-dashed border-black bg-[#efe6d4]/40 p-6 text-center text-xs font-bold uppercase text-[#55504a]">
                There are no downloads in the queue
              </div>
            )}
          </div>
        )}

        {/* 2. UNSCHEDULED Sektion */}
        {(filter === "all" || filter === "paused") && (
          <div>
            <div className="flex items-center justify-between border-b-2 border-black pb-1.5 mb-3">
              <h3 className="neo-title text-base font-black text-[#171411] uppercase tracking-wider">
                Unscheduled ({unscheduledItems.length})
              </h3>
            </div>
            {unscheduledItems.length > 0 ? (
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
            ) : filter !== "all" ? (
              <div className="neo-copy border-2 border-dashed border-black bg-[#efe6d4]/40 p-6 text-center text-xs font-bold uppercase text-[#55504a]">
                No unscheduled downloads
              </div>
            ) : null}
          </div>
        )}

        {/* 3. COMPLETED Sektion */}
        {(filter === "all" || filter === "done") && (
          <div>
            <div className="flex items-center justify-between border-b-2 border-black pb-1.5 mb-3">
              <h3 className="neo-title text-base font-black text-[#171411] uppercase tracking-wider">
                Completed ({completedItems.length})
              </h3>
              {completedItems.length > 0 && (
                <button
                  onClick={handleClearAllCompleted}
                  className="neo-copy flex items-center gap-1.5 border-2 border-black bg-[#efe6d4] hover:bg-[#e2d8c3] text-[#171411] px-2.5 py-1 text-[10px] font-bold uppercase shadow-[2px_2px_0_#171411] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear All
                </button>
              )}
            </div>
            {completedItems.length > 0 ? (
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
            ) : filter !== "all" ? (
              <div className="neo-copy border-2 border-dashed border-black bg-[#efe6d4]/40 p-6 text-center text-xs font-bold uppercase text-[#55504a]">
                No completed downloads in history
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
