import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Cloud,
  CloudDownload,
  CloudUpload,
  FolderPlus,
  History,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import type {
  CheckGameSaveConflictsResponse,
  CloudSaveConflictStatus,
  CloudSaveSet,
  CloudSyncMode,
  Game,
} from "../../../lib/types";
import { CLOUD_SYNC_MODES } from "../../../lib/types";
import {
  checkGameSaveConflicts,
  downloadGameSavesFromCloud,
  restoreGameSavesFromCloud,
  uploadGameSavesToCloud,
  CloudNotConfiguredError,
  isCloudKeyPresent,
} from "../../../lib/launcher";
import {
  getCloudSaveSetByGameKey,
  markCloudSaveSetSynced,
  upsertCloudSaveSet,
} from "../../../lib/supabase/cloud-saves";
import { getErrorMessage } from "../../../lib/formatters";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import {
  getCloudSaveActionTimestamps,
  getCloudSaveMixedResolutionPlan,
  getCloudSavePendingActionCounts,
  getCloudSaveProviderPathSuggestions,
  getCloudSaveReadinessSummary,
  getConflictBadge,
  getConflictCheckSummary,
  getConflictResolutionGuard,
  getResolutionDecisionLabel,
  withCloudSaveActionTimestamp,
  withCloudSavePaths,
  withCloudSaveProviderPathProvenance,
  type CloudSaveActionKind,
  type CloudKeyReadinessState,
  type CloudSaveProviderPathSuggestion,
  type CloudSaveResolutionChoice,
  type CloudSaveResolutionChoices,
} from "./CloudSavesPanel.helpers";

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

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "never";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "unknown";
  return `${new Date(parsed).toLocaleString()} (${formatRelative(iso)})`;
}

function readSavePaths(set: CloudSaveSet | null): string[] {
  const meta = set?.metadata ?? {};
  const candidate = (meta as { savePaths?: unknown }).savePaths;
  if (!Array.isArray(candidate)) return [];
  return candidate.filter((value): value is string => typeof value === "string");
}

function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== "number") return "n/a";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const CONFLICT_STATUS_LABELS: Record<CloudSaveConflictStatus, string> = {
  matching: "Match",
  local_newer: "Local Newer",
  cloud_newer: "Cloud Newer",
  different: "Different",
  local_missing: "Local Missing",
  cloud_missing: "Cloud Missing",
  unknown: "Unknown",
};

const CONFLICT_STATUS_CLASS: Record<CloudSaveConflictStatus, string> = {
  matching: "bg-[#087d6d] text-white",
  local_newer: "bg-[#b7102a] text-white",
  cloud_newer: "bg-[#b7102a] text-white",
  different: "bg-[#b7102a] text-white",
  local_missing: "bg-[#fbd6dc] text-[#7a0918]",
  cloud_missing: "bg-[#fbd6dc] text-[#7a0918]",
  unknown: "bg-[#ded3c1] text-[#171411]",
};

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
  const [actionBusy, setActionBusy] = useState<
    null | "upload" | "download" | "restore" | "apply" | "provider-path"
  >(null);
  const [conflictCheck, setConflictCheck] = useState<CheckGameSaveConflictsResponse | null>(null);
  const [conflictResolutionChoices, setConflictResolutionChoices] =
    useState<CloudSaveResolutionChoices>({});
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const [cloudKeyState, setCloudKeyState] = useState<CloudKeyReadinessState>("unknown");
  const [cloudKeyError, setCloudKeyError] = useState<string | null>(null);

  const localKey = useMemo(() => `${game.launcher ?? "unknown"}:${game.id}`, [game]);

  const loadSet = useCallback(async () => {
    if (!isSignedIn) {
      setSet(null);
      setPaths([]);
      setConflictCheck(null);
      setConflictResolutionChoices({});
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

  useEffect(() => {
    let cancelled = false;

    if (!isConfigured || !isSignedIn || !userId) {
      setCloudKeyState("unknown");
      setCloudKeyError(null);
      return () => {
        cancelled = true;
      };
    }

    setCloudKeyState("checking");
    setCloudKeyError(null);
    void isCloudKeyPresent(userId)
      .then((present) => {
        if (cancelled) return;
        setCloudKeyState(present ? "present" : "missing");
      })
      .catch((err) => {
        if (cancelled) return;
        setCloudKeyState("error");
        setCloudKeyError(getErrorMessage(err));
      });

    return () => {
      cancelled = true;
    };
  }, [isConfigured, isSignedIn, userId]);

  const announce = useCallback(
    (message: string | null) => {
      onStatusMessage?.(message);
    },
    [onStatusMessage],
  );

  const persistSet = useCallback(
    async (
      nextPaths: string[],
      syncMode: CloudSyncMode,
      metadata: Record<string, unknown> | null | undefined = set?.metadata,
    ) => {
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
        metadata: withCloudSavePaths(metadata, nextPaths),
      });
      setSet(next);
      return next;
    },
    [
      game.externalId,
      game.launcher,
      game.platform,
      game.title,
      isSignedIn,
      localKey,
      set?.metadata,
    ],
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
      setConflictCheck(null);
      setConflictResolutionChoices({});
      setNewPath("");
      setInfoMessage("Save path tracked.");
      announce("Save path tracked.");
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    }
  }, [announce, newPath, paths, persistSet, set?.syncMode]);

  const handleApplyProviderPathSuggestion = useCallback(
    async (suggestion: CloudSaveProviderPathSuggestion) => {
      if (suggestion.alreadyTracked) {
        const message = "Provider save-root suggestion already tracked.";
        setInfoMessage(message);
        announce(message);
        return;
      }

      setActionBusy("provider-path");
      setErrorMessage(null);
      try {
        const nextPaths = [...paths, suggestion.path];
        const syncMode = set?.syncMode ?? "manual";
        const metadata = withCloudSaveProviderPathProvenance(
          set?.metadata,
          suggestion,
          new Date().toISOString(),
        );
        const updated = await persistSet(nextPaths, syncMode, metadata);
        setPaths(readSavePaths(updated));
        setConflictCheck(null);
        setConflictResolutionChoices({});
        const message = "Provider save-root suggestion added for local review.";
        setInfoMessage(message);
        announce(message);
      } catch (err) {
        setErrorMessage(getErrorMessage(err));
      } finally {
        setActionBusy(null);
      }
    },
    [announce, paths, persistSet, set?.metadata, set?.syncMode],
  );

  const handleRemovePath = useCallback(
    async (path: string) => {
      setErrorMessage(null);
      try {
        const nextPaths = paths.filter((p) => p !== path);
        const syncMode = set?.syncMode ?? "manual";
        const updated = await persistSet(nextPaths, syncMode);
        setPaths(readSavePaths(updated));
        setConflictCheck(null);
        setConflictResolutionChoices({});
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

  const recordActionTimestamps = useCallback(
    async (kinds: CloudSaveActionKind[], completedAt: string) => {
      if (!set && paths.length === 0) return;

      const metadata = kinds.reduce(
        (current, kind) => withCloudSaveActionTimestamp(current, kind, completedAt),
        set?.metadata,
      );
      const updated = await persistSet(paths, set?.syncMode ?? "manual", metadata);
      setPaths(readSavePaths(updated));
    },
    [paths, persistSet, set],
  );

  const recordActionTimestamp = useCallback(
    async (kind: CloudSaveActionKind, completedAt: string) => {
      await recordActionTimestamps([kind], completedAt);
    },
    [recordActionTimestamps],
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
          try {
            await recordActionTimestamp(kind, new Date().toISOString());
          } catch {
            // Sync status metadata is helpful, but the native action already succeeded.
          }
          if (kind === "upload" || kind === "restore") {
            setConflictCheck(null);
            setConflictResolutionChoices({});
          }
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
    [accessToken, announce, isSignedIn, loadSet, localKey, recordActionTimestamp, userId],
  );

  const handleCheckConflicts = useCallback(async () => {
    if (!isSignedIn || !userId || !accessToken) {
      setErrorMessage("Sign in required for cloud conflict checks.");
      return;
    }
    if (paths.length === 0) {
      setErrorMessage("Add at least one save path before checking cloud conflicts.");
      return;
    }

    setIsCheckingConflicts(true);
    setErrorMessage(null);
    setInfoMessage(null);
    announce("Checking cloud save conflicts…");
    try {
      const response = await checkGameSaveConflicts(game.id, {
        accessToken,
        userId,
        savePaths: paths,
      });
      setConflictCheck(response);
      setConflictResolutionChoices({});
      setInfoMessage(response.message);
      announce(response.message);
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    } finally {
      setIsCheckingConflicts(false);
    }
  }, [accessToken, announce, game.id, isSignedIn, paths, userId]);

  const conflictResolutionGuard = useMemo(
    () => getConflictResolutionGuard(conflictCheck, conflictResolutionChoices),
    [conflictCheck, conflictResolutionChoices],
  );
  const mixedResolutionPlan = useMemo(
    () => getCloudSaveMixedResolutionPlan(conflictCheck, conflictResolutionChoices),
    [conflictCheck, conflictResolutionChoices],
  );

  const setConflictResolutionChoice = useCallback(
    (key: string, choice: CloudSaveResolutionChoice) => {
      setConflictResolutionChoices((current) => ({ ...current, [key]: choice }));
      setErrorMessage(null);
    },
    [],
  );

  const setAllConflictResolutionChoices = useCallback(
    (choice: CloudSaveResolutionChoice) => {
      const nextChoices: CloudSaveResolutionChoices = {};
      conflictResolutionGuard.divergentFiles.forEach(({ key }) => {
        nextChoices[key] = choice;
      });
      setConflictResolutionChoices(nextChoices);
      setErrorMessage(null);
      setInfoMessage(choice === "local" ? "Local wins confirmed." : "Cloud wins confirmed.");
      announce(choice === "local" ? "Local wins selected." : "Cloud wins selected.");
    },
    [announce, conflictResolutionGuard.divergentFiles],
  );

  const handleUpload = useCallback(() => {
    if (conflictResolutionGuard.hasDivergentFiles && !conflictResolutionGuard.canUpload) {
      const message =
        conflictResolutionGuard.uploadBlockReason ??
        "Choose Local wins for every changed file before uploading.";
      setErrorMessage(message);
      setInfoMessage(null);
      announce(message);
      return;
    }

    return runAction("upload", async () => {
      const response = await uploadGameSavesToCloud(game.id, {
        accessToken,
        savePaths: paths,
        userId: userId ?? "",
      });
      return {
        message: response.message,
        failedFiles: response.failedFiles,
        success: response.success,
      };
    });
  }, [accessToken, announce, conflictResolutionGuard, game.id, paths, runAction, userId]);

  const handleDownload = useCallback(() => {
    return runAction("download", async () => {
      const response = await downloadGameSavesFromCloud(game.id, {
        accessToken,
        userId: userId ?? "",
      });
      return {
        message: response.message,
        failedFiles: response.failedFiles,
        success: response.success,
      };
    });
  }, [accessToken, game.id, runAction, userId]);

  const handleRestore = useCallback(() => {
    if (conflictResolutionGuard.hasDivergentFiles && !conflictResolutionGuard.canRestore) {
      const message =
        conflictResolutionGuard.restoreBlockReason ??
        "Choose Cloud wins for every changed file before restoring.";
      setErrorMessage(message);
      setInfoMessage(null);
      announce(message);
      return;
    }

    return runAction("restore", async () => {
      const response = await restoreGameSavesFromCloud(game.id, {
        accessToken,
        savePaths: paths,
        userId: userId ?? "",
      });
      return {
        message: response.message,
        failedFiles: response.failedFiles,
        success: response.success,
      };
    });
  }, [accessToken, announce, conflictResolutionGuard, game.id, paths, runAction, userId]);

  const handleApplyMixedResolution = useCallback(async () => {
    if (!isSignedIn || !userId || !accessToken) {
      setErrorMessage("Sign in required for cloud sync.");
      return;
    }
    if (mixedResolutionPlan.unresolvedCount > 0) {
      const message = `Choose a side for ${mixedResolutionPlan.unresolvedCount} open file${
        mixedResolutionPlan.unresolvedCount === 1 ? "" : "s"
      } before applying choices.`;
      setErrorMessage(message);
      setInfoMessage(null);
      announce(message);
      return;
    }
    if (mixedResolutionPlan.unsupportedFiles.length > 0) {
      const message =
        "One or more selected files cannot be applied because the cloud relative path is missing.";
      setErrorMessage(message);
      setInfoMessage(null);
      announce(message);
      return;
    }
    if (!mixedResolutionPlan.hasWork) {
      const message = "No reviewed cloud save choices are ready to apply.";
      setErrorMessage(message);
      setInfoMessage(null);
      announce(message);
      return;
    }

    setActionBusy("apply");
    setStatus("syncing");
    setErrorMessage(null);
    setInfoMessage(null);
    announce("Applying reviewed cloud save choices…");

    try {
      const failedFiles: string[] = [];
      const completedKinds = new Set<CloudSaveActionKind>();
      let uploadSucceeded = false;
      const hasUploadWork =
        mixedResolutionPlan.localUploadRelativePaths.length > 0 ||
        mixedResolutionPlan.cloudDeleteRelativePaths.length > 0;
      const hasRestoreWork =
        mixedResolutionPlan.cloudRestoreRelativePaths.length > 0 ||
        mixedResolutionPlan.localDeletePaths.length > 0;

      if (hasUploadWork) {
        const response = await uploadGameSavesToCloud(game.id, {
          accessToken,
          deleteCloudRelativePaths: mixedResolutionPlan.cloudDeleteRelativePaths,
          savePaths: paths,
          selectedRelativePaths: mixedResolutionPlan.localUploadRelativePaths,
          userId,
        });
        const uploadFailures = [...response.failedFiles, ...response.missingFiles];
        if (response.success) {
          completedKinds.add("upload");
          uploadSucceeded = true;
        } else {
          failedFiles.push(...(uploadFailures.length > 0 ? uploadFailures : [response.message]));
        }
      }

      if (hasRestoreWork) {
        const response = await restoreGameSavesFromCloud(game.id, {
          accessToken,
          deleteLocalPaths: mixedResolutionPlan.localDeletePaths,
          savePaths: paths,
          selectedRelativePaths: mixedResolutionPlan.cloudRestoreRelativePaths,
          userId,
        });
        if (response.success) {
          completedKinds.add("restore");
        } else {
          failedFiles.push(
            ...(response.failedFiles.length > 0 ? response.failedFiles : [response.message]),
          );
        }
      }

      if (failedFiles.length === 0) {
        const completedAt = new Date().toISOString();
        setStatus("success");
        const message = `Mixed cloud save choices applied: ${mixedResolutionPlan.localUploadRelativePaths.length} uploaded, ${mixedResolutionPlan.cloudRestoreRelativePaths.length} restored, ${mixedResolutionPlan.cloudDeleteRelativePaths.length} cloud removed, ${mixedResolutionPlan.localDeletePaths.length} local removed.`;
        setInfoMessage(message);
        announce(message);
        try {
          await recordActionTimestamps(Array.from(completedKinds), completedAt);
        } catch {
          // Sync status metadata is helpful, but the native action already succeeded.
        }
        setConflictCheck(null);
        setConflictResolutionChoices({});

        if (uploadSucceeded) {
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
      } else {
        setStatus("error");
        setErrorMessage(`Mixed cloud save apply finished with ${failedFiles.length} issue(s).`);
      }
    } catch (err) {
      setStatus("error");
      setErrorMessage(getErrorMessage(err));
    } finally {
      setActionBusy(null);
    }
  }, [
    accessToken,
    announce,
    game.id,
    isSignedIn,
    loadSet,
    localKey,
    mixedResolutionPlan,
    paths,
    recordActionTimestamps,
    userId,
  ]);

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
  const conflictBadge = getConflictBadge(conflictCheck);
  const uploadBlockedByConflict =
    conflictResolutionGuard.hasDivergentFiles && !conflictResolutionGuard.canUpload;
  const restoreBlockedByConflict =
    conflictResolutionGuard.hasDivergentFiles && !conflictResolutionGuard.canRestore;
  const actionTimestamps = useMemo(
    () => getCloudSaveActionTimestamps(set?.metadata),
    [set?.metadata],
  );
  const pendingActionCounts = useMemo(
    () => getCloudSavePendingActionCounts(conflictCheck),
    [conflictCheck],
  );
  const conflictCheckSummary = useMemo(
    () => getConflictCheckSummary(conflictCheck),
    [conflictCheck],
  );
  const resolutionDecisionLabel = useMemo(
    () => getResolutionDecisionLabel(conflictCheck, conflictResolutionGuard),
    [conflictCheck, conflictResolutionGuard],
  );
  const readinessSummary = useMemo(
    () =>
      getCloudSaveReadinessSummary({
        cloudKeyState,
        hasSavePaths: paths.length > 0,
        isConfigured,
        isSignedIn,
      }),
    [cloudKeyState, isConfigured, isSignedIn, paths.length],
  );
  const providerPathSuggestions = useMemo(
    () => getCloudSaveProviderPathSuggestions(game, paths),
    [game, paths],
  );
  const readinessBadgeClass = readinessSummary.isReady
    ? "bg-[#087d6d] text-white"
    : !isConfigured || !isSignedIn
      ? "bg-[#b7102a] text-white"
      : "bg-[#ded3c1] text-[#171411]";
  const canApplyMixedResolution = mixedResolutionPlan.isComplete && mixedResolutionPlan.hasWork;
  const mixedResolutionBlockedReason =
    mixedResolutionPlan.unresolvedCount > 0
      ? `Choose a side for ${mixedResolutionPlan.unresolvedCount} open file${
          mixedResolutionPlan.unresolvedCount === 1 ? "" : "s"
        }.`
      : mixedResolutionPlan.unsupportedFiles.length > 0
        ? "One or more selected files has no cloud relative path."
        : !mixedResolutionPlan.hasWork
          ? "No reviewed choices are ready to apply."
          : null;
  const resolutionStatusLabel = conflictResolutionGuard.canUpload
    ? "Local Wins Ready"
    : conflictResolutionGuard.canRestore
      ? "Cloud Wins Ready"
      : canApplyMixedResolution
        ? "Mixed Ready"
        : mixedResolutionPlan.unsupportedFiles.length > 0
          ? "Needs Path"
          : conflictResolutionGuard.unresolvedCount > 0
            ? `${conflictResolutionGuard.unresolvedCount} Open`
            : "Mixed Lock";

  return (
    <section
      className="neo-dots border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]"
      style={{ fontFamily: '"Arial Narrow", Impact, sans-serif' }}
    >
      <div className="flex items-center justify-between gap-2 border-b-2 border-black px-3 py-2">
        <h2 className="neo-title text-[15px] font-black uppercase leading-none">Cloud Saves</h2>
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

        <div className="border-2 border-black bg-[#f3e8d7] shadow-[2px_2px_0_#171411]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black bg-[#171411] px-2 py-1 text-white">
            <span className="neo-copy flex items-center gap-1 text-[10px] font-black uppercase">
              <Cloud className="h-3.5 w-3.5 text-[#8cf5e4]" />
              Sync Status Details
            </span>
            <span
              className={`neo-copy border-2 border-black px-2 py-0.5 text-[9px] font-black uppercase ${readinessBadgeClass}`}
            >
              {readinessSummary.label}
            </span>
          </div>
          <div className="grid gap-2 p-2 sm:grid-cols-2">
            <div className="border-2 border-black bg-[#fff9ed] p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="neo-copy text-[9px] font-black uppercase text-[#55504a]">
                  Pending Actions
                </span>
                <span className="neo-copy border-2 border-black bg-[#ded3c1] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
                  {conflictCheck ? `${pendingActionCounts.total} files` : "Scan needed"}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-1 text-[9px] font-black uppercase">
                <div className="border-2 border-black bg-[#f3e8d7] px-1.5 py-1">
                  <dt className="text-[#655f58]">Upload</dt>
                  <dd className="text-[#087d6d]">{pendingActionCounts.upload}</dd>
                </div>
                <div className="border-2 border-black bg-[#f3e8d7] px-1.5 py-1">
                  <dt className="text-[#655f58]">Restore</dt>
                  <dd className="text-[#b7102a]">{pendingActionCounts.restore}</dd>
                </div>
                <div className="border-2 border-black bg-[#f3e8d7] px-1.5 py-1">
                  <dt className="text-[#655f58]">Review</dt>
                  <dd className="text-[#171411]">{pendingActionCounts.review}</dd>
                </div>
                <div className="border-2 border-black bg-[#f3e8d7] px-1.5 py-1">
                  <dt className="text-[#655f58]">Open</dt>
                  <dd className="text-[#171411]">{conflictResolutionGuard.unresolvedCount}</dd>
                </div>
              </dl>
            </div>

            <div className="border-2 border-black bg-[#fff9ed] p-2">
              <span className="neo-copy mb-1 block text-[9px] font-black uppercase text-[#55504a]">
                Last Cloud Actions
              </span>
              <dl className="space-y-1 text-[9px] font-black uppercase">
                <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-2 border-b border-black/15 pb-1">
                  <dt className="text-[#655f58]">Upload</dt>
                  <dd className="break-words text-right text-[#171411]">
                    {formatTimestamp(actionTimestamps.lastUploadAt)}
                  </dd>
                </div>
                <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-2 border-b border-black/15 pb-1">
                  <dt className="text-[#655f58]">Download</dt>
                  <dd className="break-words text-right text-[#171411]">
                    {formatTimestamp(actionTimestamps.lastDownloadAt)}
                  </dd>
                </div>
                <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-2">
                  <dt className="text-[#655f58]">Restore</dt>
                  <dd className="break-words text-right text-[#171411]">
                    {formatTimestamp(actionTimestamps.lastRestoreAt)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="border-2 border-black bg-[#fff9ed] p-2">
              <span className="neo-copy mb-1 block text-[9px] font-black uppercase text-[#55504a]">
                Conflict Check
              </span>
              <p className="neo-copy text-[10px] font-black uppercase leading-4 text-[#171411]">
                {conflictCheckSummary}
              </p>
              {conflictCheck?.message ? (
                <p className="neo-copy mt-1 text-[9px] font-bold uppercase leading-4 text-[#655f58]">
                  {conflictCheck.message}
                </p>
              ) : null}
            </div>

            <div className="border-2 border-black bg-[#fff9ed] p-2">
              <span className="neo-copy mb-1 block text-[9px] font-black uppercase text-[#55504a]">
                Decision + Readiness
              </span>
              <p className="neo-copy mb-2 border-2 border-black bg-[#f3e8d7] px-2 py-1 text-[9px] font-black uppercase leading-4 text-[#171411]">
                {resolutionDecisionLabel}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {readinessSummary.items.map((item) => (
                  <div
                    key={item.label}
                    className={`border-2 border-black px-1.5 py-1 text-[8px] font-black uppercase ${
                      item.ready ? "bg-[#d4f1ea] text-[#06685a]" : "bg-[#fbd6dc] text-[#7a0918]"
                    }`}
                    title={
                      item.label === "Encryption" && cloudKeyError ? cloudKeyError : item.value
                    }
                  >
                    <span className="block text-[#171411]">{item.label}</span>
                    <span className="block">{item.value}</span>
                  </div>
                ))}
              </div>
              {cloudKeyError ? (
                <p className="neo-copy mt-1 text-[8px] font-bold uppercase leading-3 text-[#7a0918]">
                  Key check: {cloudKeyError}
                </p>
              ) : null}
            </div>
          </div>
        </div>

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
          {providerPathSuggestions.length > 0 ? (
            <div className="border-2 border-black bg-[#fff9ed] shadow-[2px_2px_0_#171411]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black bg-[#171411] px-2 py-1 text-white">
                <span className="neo-copy flex items-center gap-1 text-[10px] font-black uppercase">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#8cf5e4]" />
                  Provider Save Map: Local Review
                </span>
                <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-0.5 text-[9px] font-black uppercase text-[#171411]">
                  Fixture Only
                </span>
              </div>
              <div className="space-y-2 p-2">
                {providerPathSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.id}
                    className="border-2 border-black bg-[#f3e8d7] p-2 shadow-[1px_1px_0_#171411]"
                  >
                    <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="neo-copy text-[10px] font-black uppercase text-[#171411]">
                          {suggestion.providerLabel} Save Root
                        </p>
                        <p className="neo-copy break-words text-[9px] font-bold uppercase leading-4 text-[#55504a]">
                          {suggestion.path}
                        </p>
                      </div>
                      <button
                        className="neo-copy flex h-7 shrink-0 items-center justify-center gap-1 border-2 border-black bg-[#087d6d] px-2 text-[9px] font-black uppercase text-white shadow-[1px_1px_0_#000] disabled:cursor-not-allowed disabled:bg-[#ded3c1] disabled:text-[#55504a] disabled:opacity-75"
                        disabled={!isSignedIn || suggestion.alreadyTracked || actionBusy !== null}
                        type="button"
                        onClick={() => void handleApplyProviderPathSuggestion(suggestion)}
                      >
                        {actionBusy === "provider-path" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FolderPlus className="h-3.5 w-3.5" />
                        )}
                        {suggestion.alreadyTracked ? "Tracked" : "Track"}
                      </button>
                    </div>
                    <dl className="grid gap-1 text-[8px] font-black uppercase text-[#171411]">
                      <div className="border-2 border-black bg-[#fff9ed] px-1.5 py-1">
                        <dt className="text-[#655f58]">Source</dt>
                        <dd>
                          {suggestion.source === "local_save_files"
                            ? "Local Save Files"
                            : "Fixture Exemplar"}
                        </dd>
                      </div>
                      <div className="border-2 border-black bg-[#fff9ed] px-1.5 py-1">
                        <dt className="text-[#655f58]">Root Shape</dt>
                        <dd className="break-all">{suggestion.saveRootShape}</dd>
                      </div>
                      <div className="border-2 border-black bg-[#fff9ed] px-1.5 py-1">
                        <dt className="text-[#655f58]">Rules</dt>
                        <dd>
                          {suggestion.pathRuleCount} / ID {suggestion.externalId ?? "Manual Review"}
                        </dd>
                      </div>
                    </dl>
                    <p className="neo-copy mt-1 text-[8px] font-bold uppercase leading-3 text-[#655f58]">
                      {suggestion.guard}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-2 border-black bg-[#f3e8d7] shadow-[2px_2px_0_#171411]">
          <div className="flex items-center justify-between gap-2 border-b-2 border-black bg-[#171411] px-2 py-1 text-white">
            <span className="neo-copy flex items-center gap-1 text-[10px] font-black uppercase">
              <AlertTriangle className="h-3.5 w-3.5 text-[#8cf5e4]" />
              Conflict Scan
            </span>
            <span
              className={`neo-copy border-2 border-black px-2 py-0.5 text-[9px] font-black uppercase ${conflictBadge.className}`}
            >
              {conflictBadge.label}
            </span>
          </div>
          <div className="space-y-2 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase text-[#55504a]">
                Read-only check against encrypted cloud metadata.
              </p>
              <button
                className="flex h-7 shrink-0 items-center justify-center gap-1 border-2 border-black bg-[#fbf4e7] px-2 text-[9px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#000] disabled:cursor-not-allowed disabled:opacity-55"
                disabled={!isSignedIn || isCheckingConflicts}
                type="button"
                onClick={() => void handleCheckConflicts()}
              >
                {isCheckingConflicts ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                Check
              </button>
            </div>

            {conflictCheck ? (
              <>
                <div className="overflow-x-auto border-2 border-black bg-[#fff9ed]">
                  <table className="w-full min-w-[520px] border-collapse text-left text-[10px] font-black uppercase">
                    <thead className="bg-[#ded3c1] text-[#171411]">
                      <tr>
                        <th className="border-b-2 border-r-2 border-black px-2 py-1">File</th>
                        <th className="border-b-2 border-r-2 border-black px-2 py-1">State</th>
                        <th className="border-b-2 border-r-2 border-black px-2 py-1">Local</th>
                        <th className="border-b-2 border-black px-2 py-1">Cloud</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conflictCheck.files.length === 0 ? (
                        <tr>
                          <td className="px-2 py-2 text-[#55504a]" colSpan={4}>
                            No cloud metadata found for this title.
                          </td>
                        </tr>
                      ) : (
                        conflictCheck.files.map((file, index) => (
                          <tr key={`${file.relativePath}-${file.path}-${index}`}>
                            <td className="max-w-[220px] border-r-2 border-t-2 border-black px-2 py-1">
                              <span className="block truncate" title={file.path}>
                                {file.relativePath || file.path}
                              </span>
                              <span className="block truncate text-[9px] text-[#655f58]">
                                {file.message}
                              </span>
                            </td>
                            <td className="border-r-2 border-t-2 border-black px-2 py-1">
                              <span
                                className={`inline-block border-2 border-black px-1.5 py-0.5 text-[9px] ${CONFLICT_STATUS_CLASS[file.status]}`}
                              >
                                {CONFLICT_STATUS_LABELS[file.status]}
                              </span>
                            </td>
                            <td className="border-r-2 border-t-2 border-black px-2 py-1 text-[#55504a]">
                              {formatBytes(file.localSizeBytes)}
                            </td>
                            <td className="border-t-2 border-black px-2 py-1 text-[#55504a]">
                              {formatBytes(file.cloudSizeBytes)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {conflictResolutionGuard.hasDivergentFiles ? (
                  <div className="border-2 border-black bg-[#fbf4e7] shadow-[2px_2px_0_#171411]">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black bg-[#b7102a] px-2 py-1 text-white">
                      <span className="neo-copy flex items-center gap-1 text-[10px] font-black uppercase">
                        <ShieldCheck className="h-3.5 w-3.5 text-[#8cf5e4]" />
                        Conflict Choice
                      </span>
                      <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-0.5 text-[9px] font-black uppercase text-[#171411]">
                        {resolutionStatusLabel}
                      </span>
                    </div>
                    <div className="space-y-2 p-2">
                      <p className="neo-copy text-[9px] font-bold uppercase leading-4 text-[#55504a]">
                        Pick a side for each changed or missing file. Apply Choices writes the
                        reviewed mix in one sync pass.
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          className={`neo-copy flex min-h-8 items-center justify-center border-2 border-black px-2 text-[9px] font-black uppercase shadow-[1px_1px_0_#000] ${
                            conflictResolutionGuard.canUpload
                              ? "bg-[#087d6d] text-white"
                              : "bg-[#fff9ed] text-[#171411] hover:bg-[#8cf5e4]"
                          }`}
                          disabled={actionBusy !== null}
                          type="button"
                          onClick={() => setAllConflictResolutionChoices("local")}
                        >
                          Local Wins
                        </button>
                        <button
                          className={`neo-copy flex min-h-8 items-center justify-center border-2 border-black px-2 text-[9px] font-black uppercase shadow-[1px_1px_0_#000] ${
                            conflictResolutionGuard.canRestore
                              ? "bg-[#b7102a] text-white"
                              : "bg-[#fff9ed] text-[#171411] hover:bg-[#fbd6dc]"
                          }`}
                          disabled={actionBusy !== null}
                          type="button"
                          onClick={() => setAllConflictResolutionChoices("cloud")}
                        >
                          Cloud Wins
                        </button>
                        <button
                          className={`neo-copy flex min-h-8 items-center justify-center gap-1 border-2 border-black px-2 text-[9px] font-black uppercase shadow-[1px_1px_0_#000] disabled:cursor-not-allowed disabled:opacity-55 ${
                            canApplyMixedResolution
                              ? "bg-[#171411] text-white"
                              : "bg-[#ded3c1] text-[#171411]"
                          }`}
                          disabled={!isSignedIn || actionBusy !== null || !canApplyMixedResolution}
                          title={mixedResolutionBlockedReason ?? undefined}
                          type="button"
                          onClick={() => void handleApplyMixedResolution()}
                        >
                          {actionBusy === "apply" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#8cf5e4]" />
                          ) : (
                            <ShieldCheck className="h-3.5 w-3.5 text-[#8cf5e4]" />
                          )}
                          Apply
                        </button>
                      </div>
                      <dl className="grid grid-cols-4 gap-1 text-[8px] font-black uppercase">
                        <div className="border-2 border-black bg-[#f3e8d7] px-1.5 py-1">
                          <dt className="text-[#655f58]">Upload</dt>
                          <dd className="text-[#087d6d]">
                            {mixedResolutionPlan.localUploadRelativePaths.length}
                          </dd>
                        </div>
                        <div className="border-2 border-black bg-[#f3e8d7] px-1.5 py-1">
                          <dt className="text-[#655f58]">Restore</dt>
                          <dd className="text-[#b7102a]">
                            {mixedResolutionPlan.cloudRestoreRelativePaths.length}
                          </dd>
                        </div>
                        <div className="border-2 border-black bg-[#f3e8d7] px-1.5 py-1">
                          <dt className="text-[#655f58]">Cloud Del</dt>
                          <dd className="text-[#171411]">
                            {mixedResolutionPlan.cloudDeleteRelativePaths.length}
                          </dd>
                        </div>
                        <div className="border-2 border-black bg-[#f3e8d7] px-1.5 py-1">
                          <dt className="text-[#655f58]">Local Del</dt>
                          <dd className="text-[#171411]">
                            {mixedResolutionPlan.localDeletePaths.length}
                          </dd>
                        </div>
                      </dl>
                      <ul className="max-h-44 overflow-y-auto border-2 border-black bg-[#fff9ed]">
                        {conflictResolutionGuard.divergentFiles.map(({ file, key }) => {
                          const choice = conflictResolutionChoices[key];
                          return (
                            <li
                              key={key}
                              className="grid gap-2 border-b-2 border-black px-2 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_150px]"
                            >
                              <div className="min-w-0">
                                <span className="neo-copy block truncate text-[10px] font-black uppercase text-[#171411]">
                                  {file.relativePath || file.path}
                                </span>
                                <span className="neo-copy mt-0.5 block text-[9px] font-bold uppercase leading-4 text-[#655f58]">
                                  {CONFLICT_STATUS_LABELS[file.status]} · {file.message}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-1">
                                <button
                                  aria-pressed={choice === "local"}
                                  className={`neo-copy min-h-7 border-2 border-black px-1 text-[8px] font-black uppercase ${
                                    choice === "local"
                                      ? "bg-[#087d6d] text-white shadow-[1px_1px_0_#000]"
                                      : "bg-[#f3e8d7] text-[#171411]"
                                  }`}
                                  disabled={actionBusy !== null}
                                  type="button"
                                  onClick={() => setConflictResolutionChoice(key, "local")}
                                >
                                  Local
                                </button>
                                <button
                                  aria-pressed={choice === "cloud"}
                                  className={`neo-copy min-h-7 border-2 border-black px-1 text-[8px] font-black uppercase ${
                                    choice === "cloud"
                                      ? "bg-[#b7102a] text-white shadow-[1px_1px_0_#000]"
                                      : "bg-[#f3e8d7] text-[#171411]"
                                  }`}
                                  disabled={actionBusy !== null}
                                  type="button"
                                  onClick={() => setConflictResolutionChoice(key, "cloud")}
                                >
                                  Cloud
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="neo-copy border-2 border-black bg-[#f3e8d7] p-2 text-[9px] font-black uppercase leading-4 text-[#171411]">
                        {conflictResolutionGuard.canUpload
                          ? "Local wins confirmed. Upload is unlocked and will send local saves to cloud."
                          : conflictResolutionGuard.canRestore
                            ? "Cloud wins confirmed. Restore is unlocked and will write cloud saves locally."
                            : canApplyMixedResolution
                              ? "Mixed choices ready. Apply will upload, restore, and remove files exactly as selected."
                              : (mixedResolutionBlockedReason ??
                                "Finish selecting a side for every changed file.")}
                      </p>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            className="flex h-9 items-center justify-center gap-1 border-2 border-black bg-[#087d6d] text-[10px] font-black uppercase text-white shadow-[1px_1px_0_#000] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={!isSignedIn || actionBusy !== null || uploadBlockedByConflict}
            title={
              uploadBlockedByConflict
                ? (conflictResolutionGuard.uploadBlockReason ?? "")
                : undefined
            }
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
            disabled={!isSignedIn || actionBusy !== null || restoreBlockedByConflict}
            title={
              restoreBlockedByConflict
                ? (conflictResolutionGuard.restoreBlockReason ?? "")
                : undefined
            }
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
          <span className="mb-1 block text-[10px] font-black uppercase text-[#55504a]">
            Sync Mode
          </span>
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
