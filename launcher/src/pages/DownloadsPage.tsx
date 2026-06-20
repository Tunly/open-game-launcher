import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ClipboardList,
  HardDriveDownload,
  KeyRound,
  ListFilter,
  MonitorCheck,
  RadioTower,
  RefreshCw,
  RotateCcw,
  Settings,
  Smartphone,
  Trash2,
  type LucideIcon,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useNavigate, useSearchParams } from "react-router-dom";

import { DownloadCard } from "../components/launcher/DownloadCard";
import { LanTransferNativeCopyReadinessPanel } from "../components/launcher/LanTransferNativeCopyReadinessPanel";
import { MobileAppPushDryRunPanel } from "../components/launcher/MobileAppPushDryRunPanel";
import { MobileAppReadinessPanel } from "../components/launcher/MobileAppReadinessPanel";
import { MobileSessionLibraryChatContractPanel } from "../components/launcher/MobileSessionLibraryChatContractPanel";
import { MobilePushRegistrationContractPanel } from "../components/launcher/MobilePushRegistrationContractPanel";
import { RemoteHostedContractReadinessPanel } from "../components/launcher/RemoteHostedContractReadinessPanel";
import { SmartInstallProviderTelemetryReadinessPanel } from "../components/launcher/SmartInstallProviderTelemetryReadinessPanel";
import type {
  DownloadItem,
  Game,
  LanTransferCleanupCandidatesResult,
  LanTransferCopyJob,
  LanTransferCopyPreview,
  LanTransferCopyResult,
  LanTransferPeerDiscoveryPreflightResult,
  LanTransferResumeCancelLedger,
  LanTransferResumeCopyResult,
} from "../lib/types";
import type { ModInstallQueueItem } from "../lib/types/mods";
import {
  archiveDownload,
  cancelLanTransferCopyJob,
  cancelDownload,
  cancelModInstall,
  getDownloadQueue,
  getRemoteCompanionDeviceSecretStatus,
  pauseDownload,
  listInstalledGames,
  launchGame,
  previewLanTransferCopy,
  previewLanTransferPeerDiscoveryPreflight,
  previewLanTransferResumeCancelLedger,
  runLanTransferCopy,
  runLanTransferCleanupCandidates,
  runLanTransferResumeCopy,
  startLanTransferCopyJob,
} from "../lib/launcher";
import { getErrorMessage } from "../lib/formatters";
import {
  refreshDownloadQueueForRemotePoll,
  runRemoteCompanionInstallJobPollOnce,
} from "../lib/remote-companion-auto-poll";
import {
  buildRemoteCompanionPollStatus,
  REMOTE_COMPANION_POLL_IDLE,
  sanitizeRemoteCompanionPollMessage,
  type RemoteCompanionPollUiState as RemoteCompanionPollResultUiState,
} from "../lib/remote-companion-poll-status";
import {
  getRemoteDownloadReadiness,
  type RemoteDownloadReadiness,
  type RemoteDownloadReadinessRow,
} from "../lib/remote-download-readiness";
import { getRemoteCompanionCloudReadiness } from "../lib/remote-companion-cloud-readiness";
import { isRemoteHostedRelayDeploymentReady } from "../lib/remote-hosted-relay-deployment";
import {
  createRemoteCompanionHandshake,
  formatRemoteCompanionDuration,
  recordRemoteCompanionPing,
  summarizeRemoteCompanionHandshake,
  type RemoteCompanionHandshakeRecord,
  type RemoteCompanionHandshakeSummary,
} from "../lib/remote-companion-handshake";
import {
  getRemoteInstallHandoffNotice,
  type RemoteInstallHandoffNotice,
} from "../lib/remote-install-handoff";
import {
  normalizeRemoteInstallHandoffHistory,
  readRemoteInstallHandoffHistory,
  type RemoteInstallHandoffHistoryRecord,
} from "../lib/remote-install-history";
import {
  buildSmartInstallPlan,
  type SmartInstallPlan,
  type SmartInstallPlannedCandidate,
  type SmartInstallSourceCandidate,
} from "../lib/smart-install-planner";
import { createVerifySmartInstallProviderTelemetryReadiness } from "../lib/smart-install-provider-telemetry-readiness";
import {
  buildLanTransferPlan,
  type LanTransferPlan,
  type LanTransferPeerCandidate,
  type LanTransferPlannedPeer,
} from "../lib/lan-transfer-planner";
import { createVerifyLanTransferNativeCopyReadiness } from "../lib/lan-transfer-native-copy-readiness";
import { createVerifyMobileAppPushDryRunPacket } from "../lib/mobile-app-push-dry-run";
import { createVerifyMobileAppReadiness } from "../lib/mobile-app-readiness";
import { createVerifyMobileSessionLibraryChatContract } from "../lib/mobile-session-library-chat-contract";
import { createVerifyMobilePushRegistrationContract } from "../lib/mobile-push-registration-readiness";
import { useDebugMode } from "../hooks/useDebugMode";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { STORAGE_KEYS } from "../lib/storage-keys";
import {
  isActiveDownloadItem,
  isPausedDownloadItem,
  selectTotalProgress,
  useDownloadStore,
} from "../stores/downloadStore";

type QueueFilter = "all" | "active" | "paused" | "done";
type LanTransferNativeCopyAction =
  | "peer-discovery-preflight"
  | "copy-preview"
  | "ledger-preview"
  | "run-copy"
  | "start-copy-job"
  | "cancel-copy-job"
  | "resume-copy"
  | "cleanup-candidates";

const LAN_COPY_CONSENT_OPERATION = "lan_native_copy_verify_manifest" as const;
const LAN_RESUME_COPY_CONSENT_OPERATION = "lan_native_resume_copy_verify_manifest" as const;
const LAN_CLEANUP_CANDIDATES_CONSENT_OPERATION = "lan_native_cleanup_candidates_delete" as const;
const LAN_PEER_DISCOVERY_PREFLIGHT_OPERATION = "lan_peer_discovery_preflight_review" as const;
const REMOTE_COMPANION_POLL_REDACTION_VERIFY = "remote-companion-poll-redaction";
const REMOTE_COMPANION_POLL_REDACTION_VERIFY_NOW = Date.UTC(2026, 5, 15, 10, 0, 0);

interface DownloadCommandError {
  gameId: string;
  message: string;
}

interface DownloadRemoved {
  gameId: string;
}

interface RemoteCompanionPollCheckingUiState {
  detail: string;
  label: string;
  tone: "checking";
}

type RemoteCompanionPollUiState =
  | RemoteCompanionPollResultUiState
  | RemoteCompanionPollCheckingUiState;

function noopRemoteCompanionVerifyAction() {
  return undefined;
}

function noopRemoteCompanionVerifyToggle() {
  return undefined;
}

function createRemoteCompanionPollRedactionVerifyState(): {
  handshake: RemoteCompanionHandshakeSummary;
  pollStatus: RemoteCompanionPollUiState;
} {
  const pairing = createRemoteCompanionHandshake({
    deviceLabel: "Redaction Fixture",
    now: REMOTE_COMPANION_POLL_REDACTION_VERIFY_NOW - 60_000,
    pairingCode: "OG-RED-321",
    ttlMs: 20 * 60_000,
  });
  const linkedPairing = recordRemoteCompanionPing(
    pairing,
    REMOTE_COMPANION_POLL_REDACTION_VERIFY_NOW - 30_000,
  );

  return {
    handshake: summarizeRemoteCompanionHandshake(
      linkedPairing,
      REMOTE_COMPANION_POLL_REDACTION_VERIFY_NOW,
    ),
    pollStatus: buildRemoteCompanionPollStatus({
      claimed: 1,
      configured: true,
      failed: 0,
      jobs: [
        {
          gameId: "remote-redaction-fixture",
          jobId: "job-redaction-fixture",
          localQueueId: "queue-redaction-fixture",
          message:
            "Started token=relay-secret sig=relay-signature via https://relay.og-launcher.test/jobs/job-redaction-fixture?token=url-secret&sig=url-signature and oglauncher://claim?token=deeplink-secret&sig=deeplink-signature",
          status: "started",
        },
      ],
      started: 1,
    }),
  };
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
  const totalProgress = useDownloadStore(selectTotalProgress);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [commandError, setCommandError] = useState<string | null>(null);
  const [pendingCommandGameIds, setPendingCommandGameIds] = useState<Set<string>>(() => new Set());
  const [debugMode] = useDebugMode();
  const [remoteAlwaysOnConfigured, setRemoteAlwaysOnConfigured] = useLocalStorageState<boolean>(
    STORAGE_KEYS.REMOTE_DOWNLOAD_ALWAYS_ON_CONFIGURED,
    false,
  );
  const [remoteCompanionHandshake, setRemoteCompanionHandshake] =
    useLocalStorageState<RemoteCompanionHandshakeRecord | null>(
      STORAGE_KEYS.REMOTE_DOWNLOAD_COMPANION_HANDSHAKE,
      null,
    );
  const [remoteHandoffHistory, setRemoteHandoffHistory] = useLocalStorageState<
    RemoteInstallHandoffHistoryRecord[]
  >(STORAGE_KEYS.REMOTE_INSTALL_HANDOFF_HISTORY, []);
  const [remoteCompanionPollBusy, setRemoteCompanionPollBusy] = useState(false);
  const [remoteCompanionPollStatus, setRemoteCompanionPollStatus] =
    useState<RemoteCompanionPollUiState>(REMOTE_COMPANION_POLL_IDLE);
  const [hasRemoteCompanionDesktopSecretVault, setHasRemoteCompanionDesktopSecretVault] =
    useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const remoteHandoffSearch = searchParams.toString();
  const verifyMode = searchParams.get("verify");

  // Load games database to fetch cover artwork for download items
  const [games, setGames] = useState<Game[]>([]);
  const [modItems, setModItems] = useState<ModInstallQueueItem[]>([]);
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

    const unlistenPromise = isTauri()
      ? listen<DownloadItem>("download_progress", (event) => {
          if (!active) return;
          useDownloadStore.getState().upsertItem(event.payload);
        })
      : null;
    const unlistenErrorPromise = isTauri()
      ? listen<DownloadCommandError>("download_command_error", (event) => {
          if (!active) return;
          setCommandError(event.payload.message);
        })
      : null;
    const unlistenRemovedPromise = isTauri()
      ? listen<DownloadRemoved>("download_removed", (event) => {
          if (!active) return;
          useDownloadStore.getState().removeItem(event.payload.gameId);
        })
      : null;
    const unlistenModPromise = isTauri()
      ? listen<ModInstallQueueItem>("mod_install_progress", (event) => {
          if (!active) return;
          setModItems((prev) => {
            const next = prev.filter((m) => m.installId !== event.payload.installId);
            next.push(event.payload);
            return next;
          });
        })
      : null;

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
      void unlistenPromise?.then((unlisten) => unlisten());
      void unlistenErrorPromise?.then((unlisten) => unlisten());
      void unlistenRemovedPromise?.then((unlisten) => unlisten());
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
  const isRemoteCompanionPollRedactionVerify =
    verifyMode === REMOTE_COMPANION_POLL_REDACTION_VERIFY;
  const localRemoteCompanionSummary = useMemo(
    () => summarizeRemoteCompanionHandshake(remoteCompanionHandshake),
    [remoteCompanionHandshake],
  );
  const remoteCompanionPollRedactionVerifyState = useMemo(
    () => createRemoteCompanionPollRedactionVerifyState(),
    [],
  );
  const remoteCompanionSummary = isRemoteCompanionPollRedactionVerify
    ? remoteCompanionPollRedactionVerifyState.handshake
    : localRemoteCompanionSummary;
  const effectiveRemoteAlwaysOnConfigured = isRemoteCompanionPollRedactionVerify
    ? true
    : remoteAlwaysOnConfigured;
  const effectiveRemoteCompanionPollStatus = isRemoteCompanionPollRedactionVerify
    ? remoteCompanionPollRedactionVerifyState.pollStatus
    : remoteCompanionPollStatus;
  const effectiveRemoteCompanionLinked = remoteCompanionSummary.isLinked;
  const isLanTransferVerify = verifyMode === "lan-transfer";
  const isLanTransferReadinessVerify = verifyMode === "lan-transfer-readiness";
  const isMobileAppReadinessVerify = verifyMode === "mobile-app-readiness";
  const isMobileSessionLibraryChatContractVerify =
    verifyMode === "mobile-session-library-chat-contract";
  const isMobilePushDryRunVerify = verifyMode === "mobile-push-dry-run";
  const isMobilePushRegistrationContractVerify = verifyMode === "mobile-push-registration-contract";
  const isSmartInstallProviderTelemetryVerify = verifyMode === "smart-install-provider-telemetry";
  const isRemoteHostedContractReadyVerify = verifyMode === "remote-hosted-contract-ready";
  const remoteHostedRelayDeploymentReady = isRemoteHostedRelayDeploymentReady(verifyMode);
  const smartInstallPlan = useMemo(
    () =>
      buildSmartInstallPlan(
        createSmartInstallCandidates({
          activeDownloadCount: activeItems.length,
          games,
          peakBytesPerSecond: sessionPeakBytes,
          remoteCompanionLinked: effectiveRemoteCompanionLinked,
        }),
      ),
    [activeItems.length, effectiveRemoteCompanionLinked, games, sessionPeakBytes],
  );
  const lanTransferPlan = useMemo(
    () =>
      buildLanTransferPlan(
        createLanTransferPeers({
          activeDownloadCount: activeItems.length,
          games,
          peakBytesPerSecond: sessionPeakBytes,
          remoteCompanionLinked: effectiveRemoteCompanionLinked,
          verifyMode: isLanTransferVerify,
        }),
      ),
    [
      activeItems.length,
      effectiveRemoteCompanionLinked,
      games,
      isLanTransferVerify,
      sessionPeakBytes,
    ],
  );
  const remoteDownloadReadiness = useMemo(
    () =>
      getRemoteDownloadReadiness({
        activeDownloadCount: activeItems.length,
        alwaysOnConfigured: effectiveRemoteAlwaysOnConfigured,
        companionStatus: effectiveRemoteCompanionLinked ? "linked" : remoteCompanionSummary.status,
        hasDesktopVault: hasRemoteCompanionDesktopSecretVault,
        hasHostedAuth: remoteHostedRelayDeploymentReady,
        hasRemoteCompanion: effectiveRemoteCompanionLinked,
        isDesktopApp: isTauri(),
      }),
    [
      activeItems.length,
      effectiveRemoteCompanionLinked,
      effectiveRemoteAlwaysOnConfigured,
      hasRemoteCompanionDesktopSecretVault,
      remoteHostedRelayDeploymentReady,
      remoteCompanionSummary.status,
    ],
  );
  const remoteHandoffNotice = useMemo(
    () => getRemoteInstallHandoffNotice(new URLSearchParams(remoteHandoffSearch)),
    [remoteHandoffSearch],
  );
  const normalizedRemoteHandoffHistory = useMemo(
    () => normalizeRemoteInstallHandoffHistory(remoteHandoffHistory),
    [remoteHandoffHistory],
  );
  const remoteHostedContractReadiness = useMemo(
    () =>
      getRemoteCompanionCloudReadiness({
        hasDesktopSecretVault:
          isRemoteHostedContractReadyVerify || hasRemoteCompanionDesktopSecretVault,
        hasHostedDeployment: remoteHostedRelayDeploymentReady,
        hasOpaqueJobQueue: true,
        hasPairingRpc: true,
        hasRelayFunction: true,
        hasSchemaRls: true,
        hasStoreBuildTicketContract: true,
      }),
    [
      hasRemoteCompanionDesktopSecretVault,
      isRemoteHostedContractReadyVerify,
      remoteHostedRelayDeploymentReady,
    ],
  );
  const smartInstallProviderTelemetryReadiness = useMemo(
    () => createVerifySmartInstallProviderTelemetryReadiness(),
    [],
  );
  const lanTransferNativeCopyReadiness = useMemo(
    () => createVerifyLanTransferNativeCopyReadiness(),
    [],
  );
  const mobileAppReadiness = useMemo(() => createVerifyMobileAppReadiness(), []);
  const mobileSessionLibraryChatContract = useMemo(
    () => createVerifyMobileSessionLibraryChatContract(),
    [],
  );
  const mobileAppPushDryRunPacket = useMemo(() => createVerifyMobileAppPushDryRunPacket(), []);
  const mobilePushRegistrationContract = useMemo(
    () => createVerifyMobilePushRegistrationContract(),
    [],
  );

  useEffect(() => {
    if (remoteHandoffNotice) {
      setRemoteHandoffHistory(readRemoteInstallHandoffHistory());
    }
  }, [remoteHandoffNotice, remoteHandoffSearch, setRemoteHandoffHistory]);

  useEffect(() => {
    let active = true;

    getRemoteCompanionDeviceSecretStatus()
      .then((status) => {
        if (active) {
          setHasRemoteCompanionDesktopSecretVault(status.hasSecret);
        }
      })
      .catch(() => {
        if (active) {
          setHasRemoteCompanionDesktopSecretVault(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

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

  async function handleModCancel(item: ModInstallQueueItem) {
    try {
      setCommandError(null);
      await cancelModInstall(item.installId);
      setModItems((prev) => prev.filter((m) => m.installId !== item.installId));
    } catch (err) {
      setCommandError(getErrorMessage(err));
    }
  }

  function handleCreateCompanionPairing() {
    setRemoteCompanionHandshake(createRemoteCompanionHandshake());
  }

  function handleRecordCompanionPing() {
    const next = recordRemoteCompanionPing(remoteCompanionHandshake);
    setRemoteCompanionHandshake(next);
  }

  function handleClearCompanionPairing() {
    setRemoteCompanionHandshake(null);
  }

  async function handlePollRemoteCompanionJobs() {
    if (remoteCompanionPollBusy) return;

    setRemoteCompanionPollBusy(true);
    setRemoteCompanionPollStatus({
      detail: "Relay claim in progress.",
      label: "Checking",
      tone: "checking",
    });
    try {
      const result = await runRemoteCompanionInstallJobPollOnce(5);
      setRemoteCompanionPollStatus(buildRemoteCompanionPollStatus(result, "manual"));
      await refreshDownloadQueueForRemotePoll(result).catch(() => undefined);
    } catch (err) {
      const message = sanitizeRemoteCompanionPollMessage(getErrorMessage(err));
      setRemoteCompanionPollStatus({
        detail: message,
        label: "Failed",
        tone: "failed",
      });
      setCommandError(message);
    } finally {
      setRemoteCompanionPollBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      {/* System Monitor Header Dashboard */}
      <div className="flex flex-col items-center gap-4 border-4 border-black bg-[#efe6d4] p-4 shadow-[4px_4px_0_#171411] md:flex-row md:justify-end">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex flex-col border-l-2 border-black pl-3 md:pl-4">
            <span className="neo-copy text-[9px] font-bold uppercase text-[#5b403f]">NETWORK</span>
            <span className="text-xl font-extrabold text-[#171411]">{activeSpeedStr}</span>
          </div>
          <div className="flex flex-col border-l-2 border-black pl-3 md:pl-4">
            <span className="neo-copy text-[9px] font-bold uppercase text-[#5b403f]">PEAK</span>
            <span className="text-xl font-extrabold text-[#171411]">{peakSpeedStr}</span>
          </div>
          <div className="flex flex-col border-l-2 border-black pl-3 md:pl-4">
            <span className="neo-copy text-[9px] font-bold uppercase text-[#5b403f]">
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

      <SmartInstallPlannerPanel plan={smartInstallPlan} />

      {isSmartInstallProviderTelemetryVerify ? (
        <SmartInstallProviderTelemetryReadinessPanel
          readiness={smartInstallProviderTelemetryReadiness}
        />
      ) : null}

      <LanTransferPlannerPanel plan={lanTransferPlan} />

      {isLanTransferReadinessVerify ? (
        <>
          <LanTransferNativeCopyReadinessPanel readiness={lanTransferNativeCopyReadiness} />
          <LanTransferNativeCopyConsole />
        </>
      ) : null}

      <RemoteDownloadReadinessPanel
        readiness={remoteDownloadReadiness}
        alwaysOnConfigured={effectiveRemoteAlwaysOnConfigured}
        companionHandshake={remoteCompanionSummary}
        onAlwaysOnConfiguredChange={
          isRemoteCompanionPollRedactionVerify
            ? noopRemoteCompanionVerifyToggle
            : setRemoteAlwaysOnConfigured
        }
        onClearCompanionPairing={
          isRemoteCompanionPollRedactionVerify
            ? noopRemoteCompanionVerifyAction
            : handleClearCompanionPairing
        }
        onCreateCompanionPairing={
          isRemoteCompanionPollRedactionVerify
            ? noopRemoteCompanionVerifyAction
            : handleCreateCompanionPairing
        }
        onPollRemoteJobs={
          isRemoteCompanionPollRedactionVerify
            ? noopRemoteCompanionVerifyAction
            : handlePollRemoteCompanionJobs
        }
        onRecordCompanionPing={
          isRemoteCompanionPollRedactionVerify
            ? noopRemoteCompanionVerifyAction
            : handleRecordCompanionPing
        }
        remotePollBusy={isRemoteCompanionPollRedactionVerify ? false : remoteCompanionPollBusy}
        remotePollStatus={effectiveRemoteCompanionPollStatus}
      />

      <RemoteHostedContractReadinessPanel readiness={remoteHostedContractReadiness} />

      {isMobileAppReadinessVerify ? (
        <MobileAppReadinessPanel readiness={mobileAppReadiness} />
      ) : null}

      {isMobileSessionLibraryChatContractVerify ? (
        <MobileSessionLibraryChatContractPanel contract={mobileSessionLibraryChatContract} />
      ) : null}

      {isMobilePushDryRunVerify ? (
        <MobileAppPushDryRunPanel packet={mobileAppPushDryRunPacket} />
      ) : null}

      {isMobilePushRegistrationContractVerify ? (
        <MobilePushRegistrationContractPanel contract={mobilePushRegistrationContract} />
      ) : null}

      {remoteHandoffNotice ? <RemoteInstallHandoffBanner notice={remoteHandoffNotice} /> : null}

      <RemoteInstallHandoffLedger
        records={normalizedRemoteHandoffHistory}
        onClear={() => setRemoteHandoffHistory([])}
      />

      {/* Filter and Global Progress bar */}
      <div className="flex flex-col justify-between gap-4 border-b-4 border-black pb-4 md:flex-row md:items-center">
        {/* Total Load Panel */}
        <div className="max-w-md flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="neo-copy text-xs font-bold uppercase text-[#55504a]">
              Total Progress // {totalProgress}%
            </span>
          </div>
          <div className="mt-1.5 h-3 border-2 border-black bg-[#efe6d4]">
            <div className="h-full bg-[#c20b2f]" style={{ width: `${totalProgress}%` }} />
          </div>
        </div>

        {/* Categories Tab Selector */}
        <div className="grid h-9 w-full grid-cols-[40px_repeat(4,minmax(0,1fr))] border-2 border-black bg-[#f5eedf] shadow-[2px_2px_0_#171411] sm:w-fit">
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
        <div className="neo-copy break-words border-4 border-black bg-[#c20b2f] p-4 text-xs font-bold uppercase text-white shadow-[4px_4px_0_#171411]">
          {commandError}
        </div>
      ) : null}

      {/* Downloader Queue List Groups */}
      <div className="space-y-8">
        {/* 1. UP NEXT / ACTIVE Sektion */}
        {(filter === "all" || filter === "active") && (
          <div>
            <div className="mb-3 flex items-center justify-between border-b-2 border-black pb-1.5">
              <h3 className="neo-title text-base font-black uppercase tracking-wider text-[#171411]">
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
            <div className="mb-3 flex items-center justify-between border-b-2 border-black pb-1.5">
              <h3 className="neo-title text-base font-black uppercase tracking-wider text-[#171411]">
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
            <div className="mb-3 flex items-center justify-between border-b-2 border-black pb-1.5">
              <h3 className="neo-title text-base font-black uppercase tracking-wider text-[#171411]">
                Completed ({completedItems.length})
              </h3>
              {completedItems.length > 0 && (
                <button
                  onClick={handleClearAllCompleted}
                  className="neo-copy flex items-center gap-1.5 border-2 border-black bg-[#efe6d4] px-2.5 py-1 text-[10px] font-bold uppercase text-[#171411] shadow-[2px_2px_0_#171411] hover:bg-[#e2d8c3] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_#171411]"
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

      {/* Mod Installs Section */}
      {activeModItems.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between border-b-2 border-black pb-1.5">
            <h3 className="neo-title text-base font-black uppercase tracking-wider text-[#171411]">
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
                    <span className="neo-copy border-2 border-black bg-[#087d6d] px-2 py-0.5 text-[9px] font-black uppercase text-white">
                      {item.provider}
                    </span>
                    <span className="neo-copy text-[10px] font-black uppercase text-[#55504a]">
                      {item.phase}
                    </span>
                  </div>
                  <h3 className="mt-1 truncate text-lg font-black uppercase leading-none text-[#171411]">
                    {item.title}
                  </h3>
                  <p className="neo-copy mt-1 text-[10px] font-black uppercase text-[#5b403f]">
                    {gamesMap.get(item.gameId)?.title ?? item.gameId}
                  </p>
                </div>
                <div>
                  <p className="neo-copy mb-1 text-[10px] font-black uppercase text-[#55504a]">
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

export function SmartInstallPlannerPanel({ plan }: { plan: SmartInstallPlan }) {
  const recommended = plan.recommended;
  const toneClass =
    !recommended || recommended.status === "blocked"
      ? "bg-[#b7102a] text-white"
      : recommended.status === "warning"
        ? "bg-[#fff9ed] text-[#171411]"
        : "bg-[#087d6d] text-white";
  const readyPercent =
    plan.candidates.length > 0
      ? Math.round(((plan.readyCount + plan.warningCount) / plan.candidates.length) * 100)
      : 0;

  return (
    <section
      aria-label="Smart install planner"
      className="border-4 border-black bg-[#f5eedf] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white">
              <HardDriveDownload className="h-3 w-3" />
              Smart Install
            </span>
            <span
              className={`neo-copy border-2 border-black px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#171411] ${toneClass}`}
            >
              {recommended ? recommended.status : "blocked"}
            </span>
          </div>

          <h2 className="neo-title mt-3 text-2xl font-black uppercase leading-none text-[#171411] md:text-3xl">
            Source Auto-Pick
          </h2>
          <p className="neo-copy mt-2 text-[11px] font-black uppercase leading-relaxed text-[#5b403f]">
            {plan.summary}
          </p>

          <div className="mt-4 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
            <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
              Recommended lane
            </p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="neo-title text-2xl font-black uppercase leading-none text-[#171411]">
                  {recommended?.label ?? "No Auto-Pick"}
                </h3>
                <p className="neo-copy mt-1 text-[10px] font-black uppercase text-[#5b403f]">
                  {recommended
                    ? `${recommended.provider} // ${formatSmartInstallMbps(
                        recommended.estimatedMbps,
                      )} // ${formatSmartInstallPrice(recommended.priceCents)}`
                    : "Clear blockers before queueing a source."}
                </p>
              </div>
              <span className="neo-title border-2 border-black bg-[#8cf5e4] px-3 py-1 text-2xl uppercase shadow-[2px_2px_0_#171411]">
                {recommended ? recommended.score : 0}
              </span>
            </div>
            <div className="mt-3 h-3 border-2 border-black bg-[#efe6d4]">
              <div className="h-full bg-[#087d6d]" style={{ width: `${readyPercent}%` }} />
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {plan.checklist.map((item) => (
              <p
                className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-black uppercase leading-relaxed text-[#171411]"
                key={item}
              >
                {item}
              </p>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {plan.candidates.map((candidate) => (
            <SmartInstallCandidateCard candidate={candidate} key={candidate.id} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SmartInstallCandidateCard({ candidate }: { candidate: SmartInstallPlannedCandidate }) {
  const StatusIcon = candidate.status === "blocked" ? AlertTriangle : CheckCircle2;
  const statusClass =
    candidate.status === "blocked"
      ? "bg-[#b7102a] text-white"
      : candidate.status === "warning"
        ? "bg-[#fff9ed] text-[#171411]"
        : "bg-[#087d6d] text-white";
  const Icon = candidate.isLanPeer
    ? RadioTower
    : candidate.requiresExternalLauncher
      ? MonitorCheck
      : HardDriveDownload;
  const firstNotice = candidate.blockers[0] ?? candidate.warnings[0] ?? "Ready for local queue.";

  return (
    <article className="min-w-0 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center border-2 border-black bg-[#efe6d4]">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="neo-copy truncate text-[11px] font-black uppercase text-[#171411]">
              {candidate.label}
            </h3>
            <p className="neo-copy mt-1 text-[9px] font-black uppercase leading-snug text-[#5b403f]">
              {candidate.provider} // {formatSmartInstallMbps(candidate.estimatedMbps)}
            </p>
          </div>
        </div>
        <span
          className={`neo-copy inline-flex shrink-0 items-center gap-1 border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[2px_2px_0_#171411] ${statusClass}`}
        >
          <StatusIcon className="h-3 w-3" />
          {candidate.status}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <SmartInstallStamp label="Cost" value={formatSmartInstallPrice(candidate.priceCents)} />
        <SmartInstallStamp label="Score" value={String(candidate.score)} />
        <SmartInstallStamp label="Owner" value={candidate.ownership} />
      </div>
      <p className="neo-copy mt-3 border-2 border-black bg-[#efe6d4] p-2 text-[9px] font-black uppercase leading-relaxed text-[#5b403f]">
        {firstNotice}
      </p>
    </article>
  );
}

function SmartInstallStamp({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0 border-2 border-black bg-[#f5eedf] px-2 py-1">
      <span className="neo-copy block text-[8px] font-black uppercase text-[#b7102a]">{label}</span>
      <strong className="neo-copy mt-0.5 block truncate text-[9px] font-black uppercase text-[#171411]">
        {value}
      </strong>
    </span>
  );
}

function createSmartInstallCandidates({
  activeDownloadCount,
  games,
  peakBytesPerSecond,
  remoteCompanionLinked,
}: {
  activeDownloadCount: number;
  games: Game[];
  peakBytesPerSecond: number;
  remoteCompanionLinked: boolean;
}): SmartInstallSourceCandidate[] {
  const observedMbps = bytesPerSecondToMbps(peakBytesPerSecond);
  const diskSpaceReady = activeDownloadCount < 6;
  const hasStoreManifest = games.some((game) => Boolean(game.downloadUrl || game.downloadSha256));
  const steamReady = games.some((game) => game.launcher === "steam");
  const gogReady = games.some((game) => game.launcher === "gog");

  return [
    {
      diskSpaceReady,
      estimatedMbps: Math.max(72, observedMbps),
      id: "og-store-cdn",
      installedClient: true,
      isLanPeer: false,
      label: "OG Store CDN",
      ownership: hasStoreManifest ? "owned" : "free",
      priceCents: null,
      provider: "OG Store",
      requiresExternalLauncher: false,
      trust: "verified",
    },
    {
      diskSpaceReady,
      estimatedMbps: remoteCompanionLinked ? 260 : 180,
      id: "lan-peer-cache",
      installedClient: true,
      isLanPeer: true,
      label: "LAN Peer Cache",
      notes: ["Local preview source; live peer discovery is not staged"],
      ownership: "free",
      priceCents: null,
      provider: "LAN",
      requiresExternalLauncher: false,
      trust: "local",
    },
    {
      diskSpaceReady,
      estimatedMbps: Math.max(58, observedMbps * 0.85),
      id: "steam-client",
      installedClient: steamReady,
      isLanPeer: false,
      label: "Steam Client",
      ownership: "owned",
      priceCents: null,
      provider: "Steam",
      requiresExternalLauncher: true,
      trust: steamReady ? "verified" : "unknown",
    },
    {
      diskSpaceReady,
      estimatedMbps: Math.max(48, observedMbps * 0.72),
      id: "gog-galaxy",
      installedClient: gogReady,
      isLanPeer: false,
      label: "GOG Galaxy",
      ownership: "owned",
      priceCents: null,
      provider: "GOG",
      requiresExternalLauncher: true,
      trust: gogReady ? "verified" : "unknown",
    },
  ];
}

function bytesPerSecondToMbps(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return 0;
  return Math.round((bytesPerSecond * 8 * 10) / 1_000_000) / 10;
}

function formatSmartInstallMbps(value: number) {
  return `${value.toFixed(value >= 100 ? 0 : 1)} Mbps`;
}

function formatSmartInstallPrice(priceCents: number | null) {
  return priceCents === null ? "Included" : `$${(priceCents / 100).toFixed(2)}`;
}

export function LanTransferPlannerPanel({ plan }: { plan: LanTransferPlan }) {
  const recommended = plan.recommended;
  const toneClass =
    !recommended || recommended.status === "blocked"
      ? "bg-[#b7102a] text-white"
      : recommended.status === "warning"
        ? "bg-[#fff9ed] text-[#171411]"
        : "bg-[#087d6d] text-white";
  const usablePercent =
    plan.peers.length > 0
      ? Math.round(((plan.readyCount + plan.warningCount) / plan.peers.length) * 100)
      : 0;

  return (
    <section
      aria-label="LAN transfer readiness"
      className="border-4 border-black bg-[#f5eedf] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white">
              <RadioTower className="h-3 w-3" />
              LAN Transfer
            </span>
            <span
              className={`neo-copy border-2 border-black px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#171411] ${toneClass}`}
            >
              {recommended ? recommended.status : "blocked"}
            </span>
          </div>

          <h2 className="neo-title mt-3 text-2xl font-black uppercase leading-none text-[#171411] md:text-3xl">
            Peer Copy Lane
          </h2>
          <p className="neo-copy mt-2 text-[11px] font-black uppercase leading-relaxed text-[#5b403f]">
            {plan.summary}
          </p>

          <div className="mt-4 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
            <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
              Recommended peer
            </p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="neo-title text-2xl font-black uppercase leading-none text-[#171411]">
                  {recommended?.label ?? "No LAN Peer"}
                </h3>
                <p className="neo-copy mt-1 text-[10px] font-black uppercase text-[#5b403f]">
                  {recommended
                    ? `${formatLanTransferMbps(recommended.estimatedMbps)} // ${
                        recommended.availableGameCount
                      } games // ${formatLanLastSeen(recommended.lastSeenMinutes)}`
                    : "Pair a local OG-Launcher device before copy."}
                </p>
              </div>
              <span className="neo-title border-2 border-black bg-[#8cf5e4] px-3 py-1 text-2xl uppercase shadow-[2px_2px_0_#171411]">
                {recommended ? recommended.score : 0}
              </span>
            </div>
            <div className="mt-3 h-3 border-2 border-black bg-[#efe6d4]">
              <div className="h-full bg-[#087d6d]" style={{ width: `${usablePercent}%` }} />
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {plan.checklist.map((item) => (
              <p
                className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-black uppercase leading-relaxed text-[#171411]"
                key={item}
              >
                {item}
              </p>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {plan.peers.map((peer) => (
            <LanTransferPeerCard key={peer.id} peer={peer} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function LanTransferNativeCopyConsole() {
  const [gameId, setGameId] = useState("lan-game-1");
  const [title, setTitle] = useState("LAN Game");
  const [sourcePath, setSourcePath] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [busyAction, setBusyAction] = useState<LanTransferNativeCopyAction | null>(null);
  const [message, setMessage] = useState(
    isTauri() ? "Native copy review is ready." : "Desktop app required for native copy commands.",
  );
  const [messageTone, setMessageTone] = useState<"idle" | "ready" | "error">("idle");
  const [copyPreview, setCopyPreview] = useState<LanTransferCopyPreview | null>(null);
  const [ledgerPreview, setLedgerPreview] = useState<LanTransferResumeCancelLedger | null>(null);
  const [copyResult, setCopyResult] = useState<LanTransferCopyResult | null>(null);
  const [copyJob, setCopyJob] = useState<LanTransferCopyJob | null>(null);
  const [peerDiscoveryPreflight, setPeerDiscoveryPreflight] =
    useState<LanTransferPeerDiscoveryPreflightResult | null>(null);
  const [resumeResult, setResumeResult] = useState<LanTransferResumeCopyResult | null>(null);
  const [cleanupResult, setCleanupResult] = useState<LanTransferCleanupCandidatesResult | null>(
    null,
  );
  const hasRequiredFields =
    gameId.trim().length > 0 &&
    title.trim().length > 0 &&
    sourcePath.trim().length > 0 &&
    targetPath.trim().length > 0;

  function buildCopyRequest(
    operation: typeof LAN_COPY_CONSENT_OPERATION | typeof LAN_RESUME_COPY_CONSENT_OPERATION,
  ) {
    const normalizedSourcePath = sourcePath.trim();
    const normalizedTargetPath = targetPath.trim();
    return {
      consent: {
        accepted: consentAccepted,
        operation,
        sourcePath: normalizedSourcePath,
        targetPath: normalizedTargetPath,
      },
      gameId: gameId.trim(),
      sourcePath: normalizedSourcePath,
      targetPath: normalizedTargetPath,
      title: title.trim(),
    };
  }

  function buildCleanupRequest(ledger: LanTransferResumeCancelLedger) {
    const normalizedSourcePath = sourcePath.trim();
    const normalizedTargetPath = targetPath.trim();
    return {
      consent: {
        accepted: consentAccepted,
        cleanupCandidateCount: ledger.cleanupCandidateCount,
        operation: LAN_CLEANUP_CANDIDATES_CONSENT_OPERATION,
        sourcePath: normalizedSourcePath,
        targetPath: normalizedTargetPath,
      },
      gameId: gameId.trim(),
      sourcePath: normalizedSourcePath,
      targetPath: normalizedTargetPath,
      title: title.trim(),
    };
  }

  function buildPeerDiscoveryPreflightRequest() {
    const normalizedSourcePath = sourcePath.trim();
    return {
      consent: {
        accepted: consentAccepted,
        operation: LAN_PEER_DISCOVERY_PREFLIGHT_OPERATION,
      },
      ...(normalizedSourcePath ? { manualSourcePath: normalizedSourcePath } : {}),
    };
  }

  async function handleNativeCopyAction(action: LanTransferNativeCopyAction) {
    if (action !== "peer-discovery-preflight" && !hasRequiredFields) {
      setMessage("Game ID, title, source path, and target path are required.");
      setMessageTone("error");
      return;
    }
    if (action === "peer-discovery-preflight" && !consentAccepted) {
      setMessage("Explicit consent is required before LAN peer discovery preflight.");
      setMessageTone("error");
      return;
    }
    if (
      (action === "run-copy" || action === "resume-copy" || action === "cleanup-candidates") &&
      !consentAccepted
    ) {
      setMessage(
        "Explicit source-target consent is required before native copy, resume copy, or cleanup.",
      );
      setMessageTone("error");
      return;
    }
    if (action === "start-copy-job" && !consentAccepted) {
      setMessage("Explicit source-target consent is required before starting a copy job.");
      setMessageTone("error");
      return;
    }
    const activeCopyJob = action === "cancel-copy-job" ? copyJob : null;
    if (action === "cancel-copy-job" && !activeCopyJob) {
      setMessage("Start a cancellable copy job before cancel.");
      setMessageTone("error");
      return;
    }
    const cleanupLedger = action === "cleanup-candidates" ? ledgerPreview : null;
    if (action === "cleanup-candidates" && !cleanupLedger) {
      setMessage("Run Ledger Preview before cleanup.");
      setMessageTone("error");
      return;
    }

    setBusyAction(action);
    setMessageTone("idle");
    try {
      if (action === "peer-discovery-preflight") {
        const preflight = await previewLanTransferPeerDiscoveryPreflight(
          buildPeerDiscoveryPreflightRequest(),
        );
        setPeerDiscoveryPreflight(preflight);
        setMessage(preflight.message);
      } else if (action === "ledger-preview") {
        const ledger = await previewLanTransferResumeCancelLedger({
          gameId: gameId.trim(),
          sourcePath: sourcePath.trim(),
          targetPath: targetPath.trim(),
          title: title.trim(),
        });
        setLedgerPreview(ledger);
        setCleanupResult(null);
        setMessage(ledger.message);
      } else if (action === "copy-preview") {
        const preview = await previewLanTransferCopy(buildCopyRequest(LAN_COPY_CONSENT_OPERATION));
        setCopyPreview(preview);
        setMessage(preview.message);
      } else if (action === "run-copy") {
        const result = await runLanTransferCopy(buildCopyRequest(LAN_COPY_CONSENT_OPERATION));
        setCopyResult(result);
        setMessage(result.message);
      } else if (action === "start-copy-job") {
        const job = await startLanTransferCopyJob(buildCopyRequest(LAN_COPY_CONSENT_OPERATION));
        setCopyJob(job);
        setMessage(job.message);
      } else if (action === "cancel-copy-job") {
        if (!activeCopyJob) {
          throw new Error("Start a cancellable copy job before cancel.");
        }
        const job = await cancelLanTransferCopyJob(activeCopyJob.jobId);
        setCopyJob(job);
        setMessage(job.message);
      } else if (action === "resume-copy") {
        const result = await runLanTransferResumeCopy(
          buildCopyRequest(LAN_RESUME_COPY_CONSENT_OPERATION),
        );
        setResumeResult(result);
        setMessage(result.message);
      } else if (action === "cleanup-candidates") {
        if (!cleanupLedger) {
          throw new Error("Run Ledger Preview before cleanup.");
        }
        const result = await runLanTransferCleanupCandidates(buildCleanupRequest(cleanupLedger));
        setCleanupResult(result);
        setMessage(result.message);
      }
      setMessageTone("ready");
    } catch (error) {
      setMessage(getErrorMessage(error));
      setMessageTone("error");
    } finally {
      setBusyAction(null);
    }
  }

  const statusClass =
    messageTone === "error"
      ? "bg-[#b7102a] text-white"
      : messageTone === "ready"
        ? "bg-[#8cf5e4] text-[#171411]"
        : "bg-[#fff9ed] text-[#171411]";

  return (
    <section
      aria-label="LAN native copy console"
      className="border-4 border-black bg-[#f5eedf] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Native Path Review
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <HardDriveDownload aria-hidden="true" className="h-8 w-8" />
            LAN Copy Console
          </h2>
        </div>
        <span
          className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#171411] ${statusClass}`}
        >
          {isTauri() ? "Desktop" : "Desktop required"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-3 md:grid-cols-2">
          <LanTransferNativeCopyField label="Game ID" value={gameId} onChange={setGameId} />
          <LanTransferNativeCopyField label="Title" value={title} onChange={setTitle} />
          <LanTransferNativeCopyField
            label="Source Path"
            value={sourcePath}
            onChange={setSourcePath}
          />
          <LanTransferNativeCopyField
            label="Target Path"
            value={targetPath}
            onChange={setTargetPath}
          />
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#8cf5e4]">Native Consent</p>
          <label className="neo-copy mt-3 flex items-start gap-2 border-2 border-[#fff9ed] bg-[#2a221b] p-2 text-[9px] font-black uppercase leading-5">
            <input
              checked={consentAccepted}
              className="mt-1 h-4 w-4 accent-[#8cf5e4]"
              onChange={(event) => setConsentAccepted(event.target.checked)}
              type="checkbox"
            />
            <span>
              I accept this native copy, resume-copy, cleanup, or discovery preflight review.
            </span>
          </label>
          <div className="mt-3 grid gap-2">
            <button
              className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#5f574d] disabled:text-[#fff9ed]"
              disabled={busyAction !== null || !consentAccepted}
              onClick={() => void handleNativeCopyAction("peer-discovery-preflight")}
              type="button"
            >
              {busyAction === "peer-discovery-preflight" ? "Checking" : "Discovery Preflight"}
            </button>
            <button
              className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#fff9ed] disabled:cursor-not-allowed disabled:bg-[#5f574d] disabled:text-[#fff9ed]"
              disabled={busyAction !== null}
              onClick={() => void handleNativeCopyAction("copy-preview")}
              type="button"
            >
              {busyAction === "copy-preview" ? "Previewing" : "Preview Copy"}
            </button>
            <button
              className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#5f574d] disabled:text-[#fff9ed]"
              disabled={busyAction !== null}
              onClick={() => void handleNativeCopyAction("ledger-preview")}
              type="button"
            >
              {busyAction === "ledger-preview" ? "Ledgering" : "Preview Ledger"}
            </button>
            <button
              className="neo-copy border-2 border-black bg-[#b7102a] px-3 py-2 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#fff9ed] disabled:cursor-not-allowed disabled:bg-[#5f574d]"
              disabled={busyAction !== null || !consentAccepted}
              onClick={() => void handleNativeCopyAction("run-copy")}
              type="button"
            >
              {busyAction === "run-copy" ? "Copying" : "Run Copy"}
            </button>
            <button
              className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#5f574d] disabled:text-[#fff9ed]"
              disabled={busyAction !== null || !consentAccepted}
              onClick={() => void handleNativeCopyAction("start-copy-job")}
              type="button"
            >
              {busyAction === "start-copy-job" ? "Starting" : "Start Copy Job"}
            </button>
            <button
              className="neo-copy border-2 border-black bg-[#b7102a] px-3 py-2 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#fff9ed] disabled:cursor-not-allowed disabled:bg-[#5f574d]"
              disabled={busyAction !== null || !copyJob?.canCancel}
              onClick={() => void handleNativeCopyAction("cancel-copy-job")}
              type="button"
            >
              {busyAction === "cancel-copy-job" ? "Cancelling" : "Cancel Job"}
            </button>
            <button
              className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#fff9ed] disabled:cursor-not-allowed disabled:bg-[#5f574d] disabled:text-[#fff9ed]"
              disabled={busyAction !== null || !consentAccepted}
              onClick={() => void handleNativeCopyAction("resume-copy")}
              type="button"
            >
              {busyAction === "resume-copy" ? "Resuming" : "Resume Copy"}
            </button>
            <button
              className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#5f574d] disabled:text-[#fff9ed]"
              disabled={
                busyAction !== null ||
                !consentAccepted ||
                !ledgerPreview ||
                ledgerPreview.cleanupCandidateCount === 0
              }
              onClick={() => void handleNativeCopyAction("cleanup-candidates")}
              type="button"
            >
              {busyAction === "cleanup-candidates" ? "Cleaning" : "Cleanup Candidates"}
            </button>
          </div>
        </div>
      </div>

      <p
        className={`neo-copy mt-3 border-2 border-black px-3 py-2 text-[10px] font-black uppercase leading-5 shadow-[2px_2px_0_#171411] ${statusClass}`}
      >
        {message}
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <LanTransferNativeCopyResultCard
          label="Discovery Preflight"
          primary={peerDiscoveryPreflight ? peerDiscoveryPreflight.status : "Not run"}
          secondary={
            peerDiscoveryPreflight
              ? `TCP ${peerDiscoveryPreflight.loopbackTcpBindReady ? "ready" : "blocked"} // UDP ${
                  peerDiscoveryPreflight.loopbackUdpBindReady ? "ready" : "blocked"
                } // no broadcast`
              : "Requires explicit consent"
          }
        />
        <LanTransferNativeCopyResultCard
          label="Copy Preview"
          primary={copyPreview ? `${copyPreview.fileCount} files` : "Not run"}
          secondary={
            copyPreview ? formatLanTransferBytes(copyPreview.bytesTotal) : "Awaiting source scan"
          }
        />
        <LanTransferNativeCopyResultCard
          label="Resume Ledger"
          primary={
            ledgerPreview
              ? `${ledgerPreview.reusableFileCount}/${ledgerPreview.files.length} reusable`
              : "Not run"
          }
          secondary={
            ledgerPreview
              ? `${ledgerPreview.pendingFileCount} pending // ${ledgerPreview.conflictFileCount} conflict // ${ledgerPreview.cleanupCandidateCount} cleanup`
              : "Awaiting target scan"
          }
        />
        <LanTransferNativeCopyResultCard
          label="Job Control"
          primary={copyJob ? `${copyJob.status} // ${copyJob.progress}%` : "Not run"}
          secondary={
            copyJob
              ? `${formatLanTransferBytes(copyJob.bytesCopied)} / ${formatLanTransferBytes(
                  copyJob.bytesTotal,
                )}`
              : "Requires explicit consent"
          }
        />
        <LanTransferNativeCopyResultCard
          label="Cleanup Result"
          primary={cleanupResult ? `${cleanupResult.deletedCount} deleted` : "Not run"}
          secondary={
            cleanupResult
              ? `${cleanupResult.deletedCandidates.length} ledger candidates`
              : "Requires ledger consent"
          }
        />
        <LanTransferNativeCopyResultCard
          label="Resume Result"
          primary={
            resumeResult
              ? `${resumeResult.reusedFileCount}/${resumeResult.fileCount} reused`
              : "Not run"
          }
          secondary={
            resumeResult
              ? `${formatLanTransferBytes(resumeResult.bytesCopied)} copied // ${formatLanTransferBytes(
                  resumeResult.bytesReused,
                )} reused`
              : "Requires conflict-free ledger"
          }
        />
        <LanTransferNativeCopyResultCard
          label="Copy Result"
          primary={
            copyResult ? `${copyResult.verifiedFiles}/${copyResult.fileCount} verified` : "Not run"
          }
          secondary={
            copyResult
              ? `${formatLanTransferBytes(copyResult.bytesCopied)} copied`
              : "Requires explicit consent"
          }
        />
      </div>
    </section>
  );
}

function LanTransferNativeCopyField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="neo-copy border-2 border-black bg-[#fff9ed] p-3 text-[9px] font-black uppercase tracking-[0.12em] text-[#5b403f] shadow-[3px_3px_0_#171411]">
      {label}
      <input
        aria-label={`LAN copy ${label}`}
        className="mt-2 w-full border-2 border-black bg-[#f5eedf] px-3 py-2 text-[11px] font-black uppercase tracking-normal text-[#171411] outline-none focus:bg-[#8cf5e4]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function LanTransferNativeCopyResultCard({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <article className="border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
        {label}
      </p>
      <p className="neo-title mt-2 text-2xl uppercase text-[#171411]">{primary}</p>
      <p className="neo-copy mt-2 text-[9px] font-black uppercase leading-5 text-[#5b403f]">
        {secondary}
      </p>
    </article>
  );
}

function LanTransferPeerCard({ peer }: { peer: LanTransferPlannedPeer }) {
  const StatusIcon = peer.status === "blocked" ? AlertTriangle : CheckCircle2;
  const statusClass =
    peer.status === "blocked"
      ? "bg-[#b7102a] text-white"
      : peer.status === "warning"
        ? "bg-[#fff9ed] text-[#171411]"
        : "bg-[#087d6d] text-white";
  const firstNotice = peer.blockers[0] ?? peer.warnings[0] ?? "Ready for local copy.";

  return (
    <article className="min-w-0 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center border-2 border-black bg-[#efe6d4]">
            <RadioTower className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="neo-copy truncate text-[11px] font-black uppercase text-[#171411]">
              {peer.label}
            </h3>
            <p className="neo-copy mt-1 text-[9px] font-black uppercase leading-snug text-[#5b403f]">
              {peer.platform} // {formatLanTransferMbps(peer.estimatedMbps)}
            </p>
          </div>
        </div>
        <span
          className={`neo-copy inline-flex shrink-0 items-center gap-1 border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[2px_2px_0_#171411] ${statusClass}`}
        >
          <StatusIcon className="h-3 w-3" />
          {peer.status}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <LanTransferStamp label="Games" value={String(peer.availableGameCount)} />
        <LanTransferStamp label="Score" value={String(peer.score)} />
        <LanTransferStamp label="Seen" value={formatLanLastSeen(peer.lastSeenMinutes)} />
      </div>
      <p className="neo-copy mt-3 border-2 border-black bg-[#efe6d4] p-2 text-[9px] font-black uppercase leading-relaxed text-[#5b403f]">
        {firstNotice}
      </p>
    </article>
  );
}

function LanTransferStamp({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0 border-2 border-black bg-[#f5eedf] px-2 py-1">
      <span className="neo-copy block text-[8px] font-black uppercase text-[#b7102a]">{label}</span>
      <strong className="neo-copy mt-0.5 block truncate text-[9px] font-black uppercase text-[#171411]">
        {value}
      </strong>
    </span>
  );
}

function createLanTransferPeers({
  activeDownloadCount,
  games,
  peakBytesPerSecond,
  remoteCompanionLinked,
  verifyMode,
}: {
  activeDownloadCount: number;
  games: Game[];
  peakBytesPerSecond: number;
  remoteCompanionLinked: boolean;
  verifyMode: boolean;
}): LanTransferPeerCandidate[] {
  if (verifyMode) {
    return [
      {
        availableGameCount: 37,
        diskSpaceReady: true,
        estimatedMbps: 680,
        id: "living-room-rig",
        label: "Living Room Rig",
        lastSeenMinutes: 1,
        libraryShareEnabled: true,
        paired: true,
        platform: "windows",
        sameNetwork: true,
        trust: "paired",
      },
      {
        availableGameCount: 18,
        diskSpaceReady: true,
        estimatedMbps: 260,
        id: "steam-deck",
        label: "Steam Deck Dock",
        lastSeenMinutes: 9,
        libraryShareEnabled: true,
        paired: false,
        platform: "linux",
        sameNetwork: true,
        trust: "local",
      },
      {
        availableGameCount: 0,
        diskSpaceReady: true,
        estimatedMbps: 0,
        id: "guest-laptop",
        label: "Guest Laptop",
        lastSeenMinutes: null,
        libraryShareEnabled: false,
        paired: false,
        platform: "unknown",
        sameNetwork: false,
        trust: "unknown",
      },
    ];
  }

  const libraryGameCount =
    games.filter((game) => game.status === "installed").length || games.length;
  const observedMbps = bytesPerSecondToMbps(peakBytesPerSecond);
  const diskSpaceReady = activeDownloadCount < 6;

  return [
    {
      availableGameCount: Math.max(libraryGameCount, 1),
      diskSpaceReady,
      estimatedMbps: remoteCompanionLinked ? 360 : Math.max(140, observedMbps),
      id: "local-peer-preview",
      label: "Local Peer Preview",
      lastSeenMinutes: remoteCompanionLinked ? 2 : 18,
      libraryShareEnabled: true,
      paired: remoteCompanionLinked,
      platform: "unknown",
      sameNetwork: true,
      trust: remoteCompanionLinked ? "paired" : "local",
    },
    {
      availableGameCount: 0,
      diskSpaceReady,
      estimatedMbps: 0,
      id: "manual-peer-slot",
      label: "Manual Peer Slot",
      lastSeenMinutes: null,
      libraryShareEnabled: false,
      paired: false,
      platform: "unknown",
      sameNetwork: false,
      trust: "unknown",
    },
  ];
}

function formatLanTransferMbps(value: number) {
  return `${value.toFixed(value >= 100 ? 0 : 1)} Mbps`;
}

function formatLanTransferBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = size >= 100 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function formatLanLastSeen(value: number | null) {
  if (value === null) return "No ping";
  if (value <= 0) return "Now";
  return `${value}m ago`;
}

export function RemoteInstallHandoffLedger({
  onClear,
  records,
}: {
  onClear: () => void;
  records: RemoteInstallHandoffHistoryRecord[];
}) {
  return (
    <section
      aria-label="Remote handoff ledger"
      className="border-4 border-black bg-[#f5eedf] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white">
            <ClipboardList className="h-3 w-3" />
            Local Receiver Log
          </span>
          <h2 className="neo-title mt-2 text-2xl font-black uppercase leading-none text-[#171411]">
            Remote Handoff Ledger
          </h2>
        </div>
        <button
          className="neo-copy flex h-9 items-center gap-1.5 border-2 border-black bg-[#fff9ed] px-2.5 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411] transition hover:bg-[#efe6d4] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={records.length === 0}
          type="button"
          onClick={onClear}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      {records.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {records.map((record) => (
            <article
              key={record.id}
              className="grid gap-3 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411] lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center"
            >
              <span
                className={`neo-copy inline-flex w-fit items-center border-2 border-black px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#171411] ${getRemoteHandoffLedgerStatusClass(record.status)}`}
              >
                {record.status}
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-base font-black uppercase leading-none text-[#171411]">
                  {record.title}
                </h3>
                <p className="neo-copy mt-1 break-words text-[10px] font-black uppercase leading-relaxed text-[#5b403f]">
                  {record.message ?? "Queued by local receiver."}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <RemoteHandoffLedgerBadge label="Game" value={record.gameId} />
                  <RemoteHandoffLedgerBadge
                    label="Source"
                    value={formatRemoteHandoffSource(record.source)}
                  />
                  {record.downloadHost ? (
                    <RemoteHandoffLedgerBadge label="Host" value={record.downloadHost} />
                  ) : null}
                  {record.installManifestHost ? (
                    <RemoteHandoffLedgerBadge label="Manifest" value={record.installManifestHost} />
                  ) : null}
                  {record.hasDownloadSha256 ? (
                    <RemoteHandoffLedgerBadge label="SHA" value="Download" />
                  ) : null}
                  {record.hasInstallManifestSha256 ? (
                    <RemoteHandoffLedgerBadge label="SHA" value="Manifest" />
                  ) : null}
                </div>
              </div>
              <span className="neo-copy text-[9px] font-black uppercase text-[#5b403f] lg:text-right">
                {formatRemoteHandoffLedgerTime(record.timestamp)}
              </span>
            </article>
          ))}
        </div>
      ) : (
        <div className="neo-copy mt-4 border-2 border-dashed border-black bg-[#efe6d4]/50 p-4 text-center text-[11px] font-black uppercase text-[#5b403f]">
          No remote handoffs logged on this device.
        </div>
      )}
    </section>
  );
}

export function RemoteInstallHandoffBanner({ notice }: { notice: RemoteInstallHandoffNotice }) {
  const Icon = notice.status === "failed" ? AlertTriangle : HardDriveDownload;
  const toneClass =
    notice.status === "failed"
      ? "bg-[#b7102a] text-white"
      : notice.status === "pending"
        ? "bg-[#fff9ed] text-[#171411]"
        : "bg-[#087d6d] text-white";

  return (
    <div className="grid gap-3 border-4 border-black bg-[#fff9ed] p-3 shadow-[4px_4px_0_#171411] sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
      <span
        className={`grid h-11 w-11 place-items-center border-2 border-black shadow-[2px_2px_0_#171411] ${toneClass}`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`neo-copy border-2 border-black px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#171411] ${toneClass}`}
          >
            {notice.status}
          </span>
          <h3 className="neo-title text-lg font-black uppercase leading-none text-[#171411]">
            {notice.title}
          </h3>
        </div>
        <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-relaxed text-[#5b403f]">
          {notice.detail}
        </p>
      </div>
    </div>
  );
}

function RemoteHandoffLedgerBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="neo-copy inline-flex max-w-full items-center gap-1 border border-black bg-[#efe6d4] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
      <span className="text-[#b7102a]">{label}</span>
      <span className="truncate">{value}</span>
    </span>
  );
}

function getRemoteHandoffLedgerStatusClass(status: RemoteInstallHandoffHistoryRecord["status"]) {
  if (status === "accepted") return "bg-[#087d6d] text-white";
  if (status === "failed") return "bg-[#b7102a] text-white";
  return "bg-[#efe6d4] text-[#171411]";
}

function formatRemoteHandoffSource(source: RemoteInstallHandoffHistoryRecord["source"]) {
  if (source === "web-dashboard") return "Web Dashboard";
  if (source === "local-preview") return "Local Preview";
  return "Desktop Deep Link";
}

function formatRemoteHandoffLedgerTime(timestamp: number) {
  if (!Number.isFinite(timestamp)) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(timestamp));
}

interface RemoteDownloadReadinessPanelProps {
  alwaysOnConfigured: boolean;
  companionHandshake: RemoteCompanionHandshakeSummary;
  onAlwaysOnConfiguredChange: (value: boolean) => void;
  onClearCompanionPairing: () => void;
  onCreateCompanionPairing: () => void;
  onPollRemoteJobs?: () => void;
  onRecordCompanionPing: () => void;
  readiness: RemoteDownloadReadiness;
  remotePollBusy?: boolean;
  remotePollStatus?: RemoteCompanionPollUiState;
}

export function RemoteDownloadReadinessPanel({
  alwaysOnConfigured,
  companionHandshake,
  onAlwaysOnConfiguredChange,
  onClearCompanionPairing,
  onCreateCompanionPairing,
  onPollRemoteJobs,
  onRecordCompanionPing,
  readiness,
  remotePollBusy,
  remotePollStatus = REMOTE_COMPANION_POLL_IDLE,
}: RemoteDownloadReadinessPanelProps) {
  const toneLabel =
    readiness.tone === "ready" ? "Ready" : readiness.tone === "warning" ? "Limited" : "Blocked";
  const toneClass =
    readiness.tone === "ready"
      ? "bg-[#087d6d] text-white"
      : readiness.tone === "warning"
        ? "bg-[#fff9ed] text-[#171411]"
        : "bg-[#b7102a] text-white";
  const headline =
    readiness.blocker === null
      ? "Remote queue can accept companion handoffs."
      : `Blocked by ${readiness.blocker.label}.`;

  return (
    <section
      aria-label="Remote download readiness"
      className="border-4 border-black bg-[#f5eedf] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white">
              <HardDriveDownload className="h-3 w-3" />
              Remote Downloads
            </span>
            <span
              className={`neo-copy border-2 border-black px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#171411] ${toneClass}`}
            >
              {toneLabel}
            </span>
          </div>
          <h2 className="neo-title mt-3 text-2xl font-black uppercase leading-none text-[#171411] md:text-3xl">
            Companion Queue Guard
          </h2>
          <p className="neo-copy mt-2 text-[11px] font-black uppercase leading-relaxed text-[#5b403f]">
            {headline}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-3 flex-1 border-2 border-black bg-[#efe6d4]">
              <div
                className={`h-full ${
                  readiness.tone === "blocked"
                    ? "bg-[#b7102a]"
                    : readiness.tone === "warning"
                      ? "bg-[#fff9ed]"
                      : "bg-[#087d6d]"
                }`}
                style={{ width: `${readiness.progress}%` }}
              />
            </div>
            <span className="neo-copy min-w-16 text-right text-[10px] font-black uppercase text-[#171411]">
              {readiness.progress}%
            </span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-1">
            <RemoteDownloadReadinessToggle
              checked={alwaysOnConfigured}
              icon={Clock3}
              label="Always-On"
              offLabel="App Only"
              onChange={onAlwaysOnConfiguredChange}
              onLabel="Ready"
            />
          </div>
          <RemoteCompanionHandshakePanel
            handshake={companionHandshake}
            onClear={onClearCompanionPairing}
            onCreate={onCreateCompanionPairing}
            onPollRemoteJobs={onPollRemoteJobs}
            onPing={onRecordCompanionPing}
            pollBusy={remotePollBusy}
            pollStatus={remotePollStatus}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {readiness.rows.map((row) => (
            <RemoteDownloadReadinessRowCard key={row.id} row={row} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function RemoteCompanionHandshakePanel({
  handshake,
  onClear,
  onCreate,
  onPollRemoteJobs,
  onPing,
  pollBusy = false,
  pollStatus = REMOTE_COMPANION_POLL_IDLE,
}: {
  handshake: RemoteCompanionHandshakeSummary;
  onClear: () => void;
  onCreate: () => void;
  onPollRemoteJobs?: () => void;
  onPing: () => void;
  pollBusy?: boolean;
  pollStatus?: RemoteCompanionPollUiState;
}) {
  const statusClass =
    handshake.status === "linked"
      ? "bg-[#087d6d] text-white"
      : handshake.status === "expired"
        ? "bg-[#b7102a] text-white"
        : "bg-[#fff9ed] text-[#171411]";
  const pairingCode = handshake.record?.pairingCode ?? "Not staged";

  return (
    <section
      aria-label="Remote companion pairing"
      className="mt-4 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white">
            <KeyRound className="h-3 w-3" />
            Local Pairing Handshake
          </span>
          <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-relaxed text-[#5b403f]">
            {handshake.detail}
          </p>
        </div>
        <span
          className={`neo-copy border-2 border-black px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#171411] ${statusClass}`}
        >
          {handshake.status}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <RemoteCompanionHandshakeStamp label="Pair code" value={pairingCode} />
        <RemoteCompanionHandshakeStamp
          label="Expires"
          value={formatRemoteCompanionDuration(handshake.expiresInMs)}
        />
        <RemoteCompanionHandshakeStamp
          label="Last ping"
          value={
            handshake.lastPingAgeMs === null
              ? "None"
              : `${formatRemoteCompanionDuration(handshake.lastPingAgeMs)} ago`
          }
        />
        <RemoteCompanionHandshakeStamp label="Relay poll" value={pollStatus.label} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="neo-copy flex h-9 items-center gap-1.5 border-2 border-black bg-[#b7102a] px-3 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5"
          type="button"
          onClick={onCreate}
        >
          <KeyRound className="h-3.5 w-3.5" />
          Generate Code
        </button>
        <button
          className="neo-copy flex h-9 items-center gap-1.5 border-2 border-black bg-[#087d6d] px-3 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
          disabled={!handshake.record || handshake.status === "expired"}
          type="button"
          onClick={onPing}
        >
          <RadioTower className="h-3.5 w-3.5" />
          Record Ping
        </button>
        {onPollRemoteJobs ? (
          <button
            className="neo-copy flex h-9 items-center gap-1.5 border-2 border-black bg-[#171411] px-3 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
            disabled={pollBusy}
            type="button"
            onClick={onPollRemoteJobs}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${pollBusy ? "animate-spin" : ""}`} />
            {pollBusy ? "Checking" : "Claim Jobs"}
          </button>
        ) : null}
        <button
          className="neo-copy flex h-9 items-center gap-1.5 border-2 border-black bg-[#fff9ed] px-3 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!handshake.record}
          type="button"
          onClick={onClear}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>

      <p
        className={`neo-copy mt-3 break-words border-2 border-black p-2 text-[9px] font-black uppercase leading-relaxed ${
          pollStatus.tone === "ready"
            ? "bg-[#087d6d] text-white"
            : pollStatus.tone === "failed"
              ? "bg-[#b7102a] text-white"
              : "bg-[#efe6d4] text-[#5b403f]"
        }`}
      >
        {pollStatus.detail}
      </p>
    </section>
  );
}

function RemoteCompanionHandshakeStamp({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-2 border-black bg-[#efe6d4] p-2">
      <span className="neo-copy block text-[8px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
        {label}
      </span>
      <strong className="neo-copy mt-1 block truncate text-[11px] font-black uppercase text-[#171411]">
        {value}
      </strong>
    </div>
  );
}

function RemoteDownloadReadinessToggle({
  checked,
  icon: Icon,
  label,
  offLabel,
  onChange,
  onLabel,
}: {
  checked: boolean;
  icon: LucideIcon;
  label: string;
  offLabel: string;
  onChange: (value: boolean) => void;
  onLabel: string;
}) {
  return (
    <label className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-2 border-black bg-[#fff9ed] p-2 shadow-[3px_3px_0_#171411]">
      <span className="grid h-8 w-8 place-items-center border-2 border-black bg-[#efe6d4]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="neo-copy block truncate text-[10px] font-black uppercase text-[#171411]">
          {label}
        </span>
        <span className="neo-copy mt-0.5 block text-[9px] font-black uppercase text-[#5b403f]">
          {checked ? onLabel : offLabel}
        </span>
      </span>
      <span
        className={`relative h-7 w-12 border-2 border-black shadow-[2px_2px_0_#171411] ${
          checked ? "bg-[#087d6d]" : "bg-[#efe6d4]"
        }`}
      >
        <input
          checked={checked}
          className="sr-only"
          onChange={(event) => onChange(event.currentTarget.checked)}
          type="checkbox"
        />
        <span
          className={`absolute top-0.5 h-5 w-5 border-2 border-black bg-[#fff9ed] transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
    </label>
  );
}

function RemoteDownloadReadinessRowCard({ row }: { row: RemoteDownloadReadinessRow }) {
  const Icon =
    row.id === "desktop-app"
      ? MonitorCheck
      : row.id === "remote-companion"
        ? Smartphone
        : row.id === "always-on"
          ? Clock3
          : HardDriveDownload;
  const StatusIcon = row.status === "ready" ? CheckCircle2 : AlertTriangle;
  const statusClass =
    row.status === "ready"
      ? "bg-[#087d6d] text-white"
      : row.status === "warning"
        ? "bg-[#fff9ed] text-[#171411]"
        : "bg-[#b7102a] text-white";

  return (
    <article className="min-w-0 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center border-2 border-black bg-[#efe6d4]">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="neo-copy truncate text-[11px] font-black uppercase text-[#171411]">
              {row.label}
            </h3>
            <p className="neo-copy mt-1 text-[9px] font-black uppercase leading-snug text-[#5b403f]">
              {row.detail}
            </p>
          </div>
        </div>
        <span
          className={`neo-copy inline-flex shrink-0 items-center gap-1 border-2 border-black px-2 py-1 text-[8px] font-black uppercase shadow-[2px_2px_0_#171411] ${statusClass}`}
        >
          <StatusIcon className="h-3 w-3" />
          {row.status}
        </span>
      </div>
    </article>
  );
}
