import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cloud,
  CloudDownload,
  CloudUpload,
  FolderPlus,
  History,
  Loader2,
  RotateCcw,
  Trash2,
} from "lucide-react";

import type {
  CloudSaveSet,
  CloudSyncMode,
  Game,
} from "../../../lib/types";
import {
  CLOUD_SYNC_MODES,
} from "../../../lib/types";
import {
  downloadGameSavesFromCloud,
  restoreGameSavesFromCloud,
  uploadGameSavesToCloud,
  CloudNotConfiguredError,
} from "../../../lib/launcher";
import {
  getCloudSaveSetByGameKey,
  markCloudSaveSetSynced,
  upsertCloudSaveSet,
} from "../../../lib/supabase/cloud-saves";
import { useCurrentUser } from "../../../hooks/useCurrentUser";

interface CloudSavesPanelProps {
  game: Game;
  onStatusMessage?: (message: string | null) => void;
}

type PanelStatus = "idle" | "syncing" | "success" | "error";

const SYNC_MODE_LABELS: Record<CloudSyncMode, string> = {
  manual: "Manual",
  on_launch: "On Launch",
  on_exit: "On Exit",
  scheduled: "Scheduled",
};

function getErrorMessage(error: unknown): string {
  if (error instanceof CloudNotConfiguredError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";
  const diff = Date.now() - then;
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

function readSavePaths(set: CloudSaveSet | null): string[] {
  const meta = set?.metadata ?? {};
  const candidate = (meta as { savePaths?: unknown }).savePaths;
  if (!Array.isArray(candidate)) return [];
  return candidate.filter((value): value is string => typeof value === "string");
}

export function CloudSavesPanel({ game, onStatusMessage }: CloudSavesPanelProps) {
  const user = useCurrentUser();
  const isConfigured = user?.isConfigured ?? false;
  const session = user?.session ?? null;
  const accessToken = session?.access_token ?? null;
  const userId = session?.user?.id ?? null;
  const isSignedIn = Boolean(userId && accessToken);

  const [set, setSet] = useState<CloudSaveSet | null>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState("");
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isLoadingSet, setIsLoadingSet] = useState(false);
  const [actionBusy, setActionBusy] = useState<null | "upload" | "download" | "restore">(null);

  const localKey = useMemo(() => `${game.launcher ?? "unknown"}:${game.id}`, [game]);

  const loadSet = useCallback(async () => {
    if (!isSignedIn) {
      setSet(null);
      setPaths([]);
      return;
    }
    setIsLoadingSet(true);
    try {
      const fetched = await getCloudSaveSetByGameKey(localKey);
      setSet(fetched);
      setPaths(readSavePaths(fetched));
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    } finally {
      setIsLoadingSet(false);
    }
  }, [isSignedIn, localKey]);

  useEffect(() => {
    void loadSet();
  }, [loadSet]);

  const announce = useCallback(
    (message: string | null) => {
      onStatusMessage?.(message);
    },
    [onStatusMessage],
  );

  const persistSet = useCallback(
    async (nextPaths: string[], syncMode: CloudSyncMode) => {
      if (!isSignedIn) {
        throw new CloudNotConfiguredError("Sign in required for cloud sync.");
      }
      const next = await upsertCloudSaveSet({
        localGameKey: localKey,
        title: game.title,
        launcher: game.launcher ?? "unknown",
        externalId: game.externalId ?? null,
        platform: game.platform ?? "unknown",
        syncMode,
        metadata: { savePaths: nextPaths },
      });
      setSet(next);
      return next;
    },
    [game.externalId, game.launcher, game.platform, game.title, isSignedIn, localKey],
  );

  const handleAddPath = useCallback(async () => {
    const trimmed = newPath.trim();
    if (!trimmed) return;
    if (paths.includes(trimmed)) {
      setErrorMessage("Path already tracked.");
      return;
    }
    setErrorMessage(null);
    try {
      const nextPaths = [...paths, trimmed];
      const syncMode = set?.syncMode ?? "manual";
      const updated = await persistSet(nextPaths, syncMode);
      setPaths(readSavePaths(updated));
      setNewPath("");
      setInfoMessage("Save path tracked.");
      announce("Save path tracked.");
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    }
  }, [announce, newPath, paths, persistSet, set?.syncMode]);

  const handleRemovePath = useCallback(
    async (path: string) => {
      setErrorMessage(null);
      try {
        const nextPaths = paths.filter((p) => p !== path);
        const syncMode = set?.syncMode ?? "manual";
        const updated = await persistSet(nextPaths, syncMode);
        setPaths(readSavePaths(updated));
        setInfoMessage("Path removed.");
        announce("Save path removed.");
      } catch (err) {
        setErrorMessage(getErrorMessage(err));
      }
    },
    [announce, paths, persistSet, set?.syncMode],
  );

  const handleSyncModeChange = useCallback(
    async (next: CloudSyncMode) => {
      if (next === set?.syncMode) return;
      setErrorMessage(null);
      try {
        const updated = await persistSet(paths, next);
        setPaths(readSavePaths(updated));
        setInfoMessage(`Sync mode: ${SYNC_MODE_LABELS[next]}`);
        announce(`Cloud sync mode set to ${SYNC_MODE_LABELS[next]}.`);
      } catch (err) {
        setErrorMessage(getErrorMessage(err));
      }
    },
    [announce, paths, persistSet, set?.syncMode],
  );

  const runAction = useCallback(
    async (
      kind: "upload" | "download" | "restore",
      runner: () => Promise<{
        message: string;
        failedFiles: string[];
        success: boolean;
      }>,
    ) => {
      if (!isSignedIn || !userId || !accessToken) {
        setErrorMessage("Sign in required for cloud sync.");
        return;
      }
      setActionBusy(kind);
      setStatus("syncing");
      setErrorMessage(null);
      setInfoMessage(null);
      announce(
        kind === "upload"
          ? "Uploading save to cloud…"
          : kind === "download"
            ? "Downloading cloud save…"
            : "Restoring cloud save…",
      );
      try {
        const result = await runner();
        if (result.success) {
          setStatus("success");
          setInfoMessage(result.message);
          announce(result.message);
        } else {
          setStatus("error");
          setErrorMessage(
            result.failedFiles.length > 0
              ? `${result.message} (${result.failedFiles.length} failed)`
              : result.message,
          );
        }
        if (kind === "upload" && result.success) {
          try {
            const refreshed = await getCloudSaveSetByGameKey(localKey);
            if (refreshed) {
              setSet(refreshed);
              await markCloudSaveSetSynced(refreshed.id);
            }
          } catch {
            // best-effort
          }
        }
        void loadSet();
      } catch (err) {
        setStatus("error");
        setErrorMessage(getErrorMessage(err));
      } finally {
        setActionBusy(null);
      }
    },
    [accessToken, announce, isSignedIn, loadSet, localKey, userId],
  );

  const handleUpload = useCallback(() => {
    return runAction("upload", async () => {
      const response = await uploadGameSavesToCloud(game.id, { accessToken, userId: userId ?? "" });
      return {
        message: response.message,
        failedFiles: response.failedFiles,
        success: response.success,
      };
    });
  }, [accessToken, game.id, runAction, userId]);

  const handleDownload = useCallback(() => {
    return runAction("download", async () => {
      const response = await downloadGameSavesFromCloud(game.id, { accessToken, userId: userId ?? "" });
      return {
        message: response.message,
        failedFiles: response.failedFiles,
        success: response.success,
      };
    });
  }, [accessToken, game.id, runAction, userId]);

  const handleRestore = useCallback(() => {
    return runAction("restore", async () => {
      const response = await restoreGameSavesFromCloud(game.id, { accessToken, userId: userId ?? "" });
      return {
        message: response.message,
        failedFiles: response.failedFiles,
        success: response.success,
      };
    });
  }, [accessToken, game.id, runAction, userId]);

  const lastSynced = set?.lastSyncedAt ?? null;
  const statusColor: Record<PanelStatus, string> = {
    idle: "bg-[#ded3c1] text-[#171411]",
    syncing: "bg-[#8cf5e4] text-[#171411]",
    success: "bg-[#087d6d] text-white",
    error: "bg-[#b7102a] text-white",
  };
  const statusLabel: Record<PanelStatus, string> = {
    idle: lastSynced ? "Up to date" : "Not synced",
    syncing: "Syncing…",
    success: "Synced",
    error: "Failed",
  };

  return (
    <section
      className="border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]"
      style={{ fontFamily: '"Arial Narrow", Impact, sans-serif' }}
    >
      <div className="flex items-center justify-between gap-2 border-b-2 border-black px-3 py-2">
        <h2 className="text-[15px] font-black uppercase leading-none">Cloud Saves</h2>
        <span
          className={`neo-copy border-2 border-black px-2 py-0.5 text-[10px] font-black uppercase ${statusColor[status]}`}
        >
          {statusLabel[status]}
        </span>
      </div>

      <div className="space-y-3 p-3 text-[12px] font-bold">
        {!isConfigured ? (
          <p className="text-[10px] font-black uppercase text-[#b7102a]">
            Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
          </p>
        ) : !isSignedIn ? (
          <p className="text-[10px] font-black uppercase text-[#55504a]">
            Sign in to enable cloud save sync.
          </p>
        ) : null}

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-black uppercase text-[#55504a]">
            <span>Tracked Save Paths</span>
            <span>{paths.length}</span>
          </div>
          {isLoadingSet ? (
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-[#55504a]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : paths.length === 0 ? (
            <p className="text-[10px] font-bold uppercase text-[#55504a]">
              No paths tracked. Add a directory containing your save files.
            </p>
          ) : (
            <ul className="space-y-1">
              {paths.map((path) => (
                <li
                  key={path}
                  className="flex items-center gap-1 border-2 border-black bg-[#f3e8d7] px-2 py-1"
                >
                  <span className="min-w-0 flex-1 truncate text-[11px]" title={path}>
                    {path}
                  </span>
                  <button
                    aria-label="Remove save path"
                    className="grid h-6 w-6 shrink-0 place-items-center border-2 border-black bg-[#fbf4e7] text-[#b7102a] hover:bg-[#e6dbc8]"
                    type="button"
                    onClick={() => void handleRemovePath(path)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {isSignedIn ? (
            <div className="flex items-center gap-1">
              <input
                className="neo-copy h-8 min-w-0 flex-1 border-2 border-black bg-[#f4ead8] px-2 text-[11px] outline-none"
                placeholder="C:\Users\...\Saves"
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddPath();
                  }
                }}
              />
              <button
                aria-label="Add save path"
                className="grid h-8 w-8 shrink-0 place-items-center border-2 border-black bg-[#087d6d] text-white hover:bg-[#06685a]"
                disabled={!newPath.trim()}
                type="button"
                onClick={() => void handleAddPath()}
              >
                <FolderPlus className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            className="flex h-9 items-center justify-center gap-1 border-2 border-black bg-[#087d6d] text-[10px] font-black uppercase text-white shadow-[1px_1px_0_#000] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={!isSignedIn || actionBusy !== null}
            type="button"
            onClick={() => void handleUpload()}
          >
            {actionBusy === "upload" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CloudUpload className="h-3.5 w-3.5" />
            )}
            Upload
          </button>
          <button
            className="flex h-9 items-center justify-center gap-1 border-2 border-black bg-[#fbf4e7] text-[10px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#000] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={!isSignedIn || actionBusy !== null}
            type="button"
            onClick={() => void handleDownload()}
          >
            {actionBusy === "download" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CloudDownload className="h-3.5 w-3.5" />
            )}
            Download
          </button>
          <button
            className="flex h-9 items-center justify-center gap-1 border-2 border-black bg-[#b7102a] text-[10px] font-black uppercase text-white shadow-[1px_1px_0_#000] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={!isSignedIn || actionBusy !== null}
            type="button"
            onClick={() => void handleRestore()}
          >
            {actionBusy === "restore" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Restore
          </button>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-black uppercase text-[#55504a]">
            Sync Mode
          </label>
          <div className="grid grid-cols-2 gap-1">
            {CLOUD_SYNC_MODES.map((mode) => {
              const active = (set?.syncMode ?? "manual") === mode;
              return (
                <button
                  key={mode}
                  className={`border-2 border-black px-1.5 py-1 text-[9px] font-black uppercase transition ${
                    active
                      ? "bg-[#087d6d] text-white shadow-[1px_1px_0_#000]"
                      : "bg-[#fbf4e7] text-[#171411] hover:bg-[#efe3cf]"
                  } disabled:cursor-not-allowed disabled:opacity-55`}
                  disabled={!isSignedIn}
                  type="button"
                  onClick={() => void handleSyncModeChange(mode)}
                >
                  {SYNC_MODE_LABELS[mode]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-black/10 pt-2 text-[10px] font-bold uppercase text-[#55504a]">
          <span className="flex items-center gap-1">
            <History className="h-3 w-3" /> Last Sync
          </span>
          <span>{formatRelative(lastSynced)}</span>
        </div>

        {errorMessage ? (
          <div className="border-2 border-black bg-[#fbd6dc] p-2 text-[10px] font-black uppercase text-[#7a0918]">
            {errorMessage}
          </div>
        ) : null}
        {infoMessage && !errorMessage ? (
          <div className="border-2 border-black bg-[#d4f1ea] p-2 text-[10px] font-black uppercase text-[#06685a]">
            {infoMessage}
          </div>
        ) : null}
        {paths.length > 0 ? (
          <div className="flex items-center gap-1 text-[9px] font-bold uppercase text-[#55504a]">
            <Cloud className="h-3 w-3" />
            Tracking {paths.length} path{paths.length === 1 ? "" : "s"}
          </div>
        ) : null}
      </div>
    </section>
  );
}
