import {
  AlarmClock,
  ArchiveRestore,
  CheckCircle2,
  DatabaseBackup,
  FolderOpen,
  HardDrive,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  Timer,
  Trash2,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  computeNextBackupReminderDueAt,
  formatBackupReminderDate,
  getBackupReminderStatus,
  isBackupReminderDue,
  markBackupReminderDone,
  readBackupReminderSettings,
  saveBackupReminderSettings,
  snoozeBackupReminder,
  type BackupReminderCadence,
  type BackupReminderSettings,
} from "../../lib/backup-reminder";
import {
  ejectBackupExternalDrive,
  getBackupSchedulerStatus,
  getDiskInfo,
  getLatestBackupStatus,
  installBackupScheduler,
  proveBackupExternalDriveEjectSafety,
  proveBackupExternalDriveWrite,
  previewBackupPlan,
  previewRestorePlan,
  restoreBackup,
  runBackupPlan,
  runBackupSchedulerNow,
  saveBackupSchedulerConfig,
  uninstallBackupScheduler,
} from "../../lib/launcher";
import type {
  BackupCompressionMode,
  BackupExecutionResult,
  BackupExternalDriveEjectSafetyResult,
  BackupExternalDriveOsEjectResult,
  BackupExternalDriveWriteProofResult,
  BackupManifestStatus,
  BackupPlanPreview,
  BackupSchedulerCadence,
  BackupSchedulerConfig,
  BackupSchedulerStatus,
  RestoreExecutionResult,
  RestorePlanPreview,
} from "../../lib/types/backup";
import {
  collectRestoreAttentionRows,
  collectRestoreResultDetails,
  collectBackupSourceRows,
  formatBackupBytes,
  formatBackupTimestamp,
  getBackupActionLabel,
  getRestoreActionLabel,
  getRestoreReviewState,
} from "./BackupRestoreSettings.helpers";
import { BackupExternalDriveReadinessPanel } from "./BackupExternalDriveReadinessPanel";
import {
  BACKUP_EXTERNAL_DRIVE_DETECTION_FIXTURE_TARGET,
  type BackupExternalDriveTargetEvidence,
  buildBackupExternalDriveReadiness,
  createVerifyBackupExternalDriveDetectionReadiness,
  createVerifyBackupExternalDriveEjectSafetyReadiness,
  createVerifyBackupExternalDriveOsEjectReadiness,
  createVerifyBackupExternalDriveWriteProofReadiness,
  findBackupTargetDisk,
} from "../../lib/backup-external-drive-readiness";
import type { DiskInfo } from "../../lib/types";

type DiskScanStatus = "idle" | "loading" | "ready" | "error";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function desktopOnlyBackupSchedulerStatus(): BackupSchedulerStatus {
  return {
    config: null,
    configPath: "Desktop app only",
    installed: false,
    lastRun: null,
    message: "Headless backup timers are available in the desktop app.",
    provider: "Desktop app",
    statusPath: "Desktop app only",
    supported: false,
  };
}

export function BackupRestoreSettings({
  externalDriveDetectionFixture = false,
  externalDriveEjectSafetyFixture = false,
  externalDriveOsEjectFixture = false,
  externalDriveWriteProofFixture = false,
  showExternalDriveReadiness = false,
}: {
  externalDriveDetectionFixture?: boolean;
  externalDriveEjectSafetyFixture?: boolean;
  externalDriveOsEjectFixture?: boolean;
  externalDriveWriteProofFixture?: boolean;
  showExternalDriveReadiness?: boolean;
}) {
  const isDesktopRuntime = isTauri();
  const [initialReminderSettings] = useState(() => readBackupReminderSettings());
  const [targetPath, setTargetPath] = useState(initialReminderSettings.targetPath);
  const [includeLibraryData, setIncludeLibraryData] = useState(
    initialReminderSettings.includeLibraryData,
  );
  const [compressionMode, setCompressionMode] = useState<BackupCompressionMode>(
    initialReminderSettings.compression,
  );
  const [autoRunWhenDue, setAutoRunWhenDue] = useState(initialReminderSettings.autoRunWhenDue);
  const [reminderSettings, setReminderSettings] =
    useState<BackupReminderSettings>(initialReminderSettings);
  const [reminderCadence, setReminderCadence] = useState<BackupReminderCadence | "off">(
    initialReminderSettings.enabled ? initialReminderSettings.cadence : "off",
  );
  const [schedulerCadence, setSchedulerCadence] = useState<BackupSchedulerCadence>(
    initialReminderSettings.cadence,
  );
  const [backupPreview, setBackupPreview] = useState<BackupPlanPreview | null>(null);
  const [restorePreview, setRestorePreview] = useState<RestorePlanPreview | null>(null);
  const [latestStatus, setLatestStatus] = useState<BackupManifestStatus | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<BackupSchedulerStatus | null>(null);
  const [backupResult, setBackupResult] = useState<BackupExecutionResult | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreExecutionResult | null>(null);
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [diskScanStatus, setDiskScanStatus] = useState<DiskScanStatus>("idle");
  const [externalDriveWriteProof, setExternalDriveWriteProof] =
    useState<BackupExternalDriveWriteProofResult | null>(null);
  const [externalDriveEjectProof, setExternalDriveEjectProof] =
    useState<BackupExternalDriveEjectSafetyResult | null>(null);
  const [externalDriveOsEject, setExternalDriveOsEject] =
    useState<BackupExternalDriveOsEjectResult | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [isAutostartEnabled, setIsAutostartEnabled] = useState(false);
  const [isAutostartLoading, setIsAutostartLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sourceRows = useMemo(
    () => collectBackupSourceRows(backupPreview?.files ?? []),
    [backupPreview],
  );
  const restoreReviewState = useMemo(
    () => getRestoreReviewState(restorePreview, targetPath),
    [restorePreview, targetPath],
  );
  const restoreAttentionRows = useMemo(
    () => collectRestoreAttentionRows(restorePreview?.files ?? []),
    [restorePreview],
  );
  const restoreResultDetails = useMemo(
    () => collectRestoreResultDetails(restoreResult),
    [restoreResult],
  );
  const reminderStatus = useMemo(
    () => getBackupReminderStatus(reminderSettings),
    [reminderSettings],
  );
  const reminderIsDue = useMemo(() => isBackupReminderDue(reminderSettings), [reminderSettings]);
  const savedReminderMode = reminderSettings.enabled ? reminderSettings.cadence : "off";
  const trimmedTargetPath = targetPath.trim();
  const reminderFormChanged =
    reminderCadence !== savedReminderMode ||
    reminderSettings.targetPath !== trimmedTargetPath ||
    reminderSettings.includeLibraryData !== includeLibraryData ||
    reminderSettings.compression !== compressionMode ||
    reminderSettings.autoRunWhenDue !== autoRunWhenDue;
  const schedulerConfig = schedulerStatus?.config ?? null;
  const schedulerFormChanged =
    (schedulerConfig?.targetPath ?? "") !== trimmedTargetPath ||
    (schedulerConfig?.includeLibraryData ?? true) !== includeLibraryData ||
    (schedulerConfig?.compression ?? "none") !== compressionMode ||
    (schedulerConfig?.cadence ?? schedulerCadence) !== schedulerCadence;
  const detectedBackupTarget = useMemo(
    () => findBackupTargetDisk(trimmedTargetPath, disks),
    [disks, trimmedTargetPath],
  );
  const externalDriveReadiness = useMemo(() => {
    if (externalDriveOsEjectFixture) return createVerifyBackupExternalDriveOsEjectReadiness();
    if (externalDriveEjectSafetyFixture)
      return createVerifyBackupExternalDriveEjectSafetyReadiness();
    if (externalDriveWriteProofFixture) return createVerifyBackupExternalDriveWriteProofReadiness();
    if (externalDriveDetectionFixture) return createVerifyBackupExternalDriveDetectionReadiness();
    if (!showExternalDriveReadiness) return null;
    const retainedOsEjectTarget: BackupExternalDriveTargetEvidence | null =
      externalDriveOsEject?.success && externalDriveOsEject.unmounted
        ? {
            availableSpace: detectedBackupTarget?.availableSpace ?? 0,
            fileSystem: externalDriveOsEject.fileSystem,
            isReadOnly: externalDriveOsEject.isReadOnly,
            isRemovable: externalDriveOsEject.isRemovable,
            kind: detectedBackupTarget?.kind ?? "Unmounted",
            mountPoint: externalDriveOsEject.mountPoint,
            name: externalDriveOsEject.diskName,
            targetPath: externalDriveOsEject.targetPath,
            totalSpace: detectedBackupTarget?.totalSpace ?? 0,
          }
        : null;
    const readinessTarget = detectedBackupTarget?.isRemovable
      ? detectedBackupTarget
      : retainedOsEjectTarget;
    const writeProofReady = Boolean(
      externalDriveWriteProof && readinessTarget?.isRemovable && !readinessTarget.isReadOnly,
    );

    return buildBackupExternalDriveReadiness({
      crossOsE2EReady: false,
      detectedTarget: readinessTarget,
      externalDriveDetected: Boolean(readinessTarget),
      headlessTimerReady: true,
      manifestPreviewReady: true,
      nativeFolderPickerReady: true,
      removableMediaEjectProof: writeProofReady ? externalDriveEjectProof : null,
      removableMediaEjectProofReady: Boolean(
        writeProofReady &&
        externalDriveEjectProof?.readyForOsEject &&
        externalDriveEjectProof.cleanupDeleted,
      ),
      removableMediaOsEject: writeProofReady ? externalDriveOsEject : null,
      removableMediaOsEjectReady: Boolean(
        writeProofReady && externalDriveOsEject?.success && externalDriveOsEject.unmounted,
      ),
      removableMediaWriteProof: writeProofReady ? externalDriveWriteProof : null,
      removableMediaWriteProofReady: writeProofReady,
      restoreReviewReady: true,
      targetFolderReady: Boolean(trimmedTargetPath),
      windowsNativeEjectReady: true,
      zipArchiveReady: true,
    });
  }, [
    detectedBackupTarget,
    externalDriveDetectionFixture,
    externalDriveEjectProof,
    externalDriveEjectSafetyFixture,
    externalDriveOsEject,
    externalDriveOsEjectFixture,
    externalDriveWriteProof,
    externalDriveWriteProofFixture,
    showExternalDriveReadiness,
    trimmedTargetPath,
  ]);
  const driveScanCopy = useMemo(() => {
    if (externalDriveOsEjectFixture) {
      return "Fixture evidence: OG_BACKUP_USB passed write proof, eject-safety preflight, and local OS unmount; restore and cross-OS E2E stay blocked.";
    }
    if (externalDriveEjectSafetyFixture) {
      return "Fixture evidence: OG_BACKUP_USB passed write proof plus eject-safety preflight; restore, OS eject execution, and cross-OS E2E stay blocked.";
    }
    if (externalDriveWriteProofFixture) {
      return "Fixture evidence: OG_BACKUP_USB has a sentinel write/read/checksum/delete proof; restore and cross-OS E2E stay blocked.";
    }
    if (externalDriveDetectionFixture) {
      return "Fixture evidence: OG_BACKUP_USB is mounted at /media/og-backup-stick; live writes stay disabled.";
    }
    if (!isDesktopRuntime) {
      return "Desktop app required for live disk metadata refresh; browser preview stays read-only.";
    }
    if (diskScanStatus === "loading") {
      return "Scanning native disk metadata for removable target evidence.";
    }
    if (diskScanStatus === "error") {
      return "Disk metadata refresh failed; external-drive gates remain blocked.";
    }
    if (externalDriveOsEject) {
      return `${externalDriveOsEject.diskName || "Removable target"} OS unmount captured at ${
        externalDriveOsEject.verifiedAt
      }; mount ${externalDriveOsEject.mountPoint} is no longer listed locally and cross-OS backup/restore E2E stays blocked.`;
    }
    if (detectedBackupTarget?.isRemovable) {
      if (externalDriveWriteProof) {
        if (externalDriveEjectProof) {
          return `${detectedBackupTarget.name || "Removable target"} matched at ${
            detectedBackupTarget.mountPoint
          }; eject-safety preflight captured at ${externalDriveEjectProof.verifiedAt}.`;
        }
        return `${detectedBackupTarget.name || "Removable target"} matched at ${
          detectedBackupTarget.mountPoint
        }; sentinel write proof captured at ${externalDriveWriteProof.verifiedAt}.`;
      }
      return `${detectedBackupTarget.name || "Removable target"} matched at ${
        detectedBackupTarget.mountPoint
      }; detection is read-only.`;
    }
    if (disks.length > 0) {
      return `${disks.length} disk${disks.length === 1 ? "" : "s"} scanned; no removable target matched.`;
    }
    return "No disk metadata loaded yet; refresh before staging an external-drive target.";
  }, [
    detectedBackupTarget,
    diskScanStatus,
    disks.length,
    externalDriveDetectionFixture,
    externalDriveEjectProof,
    externalDriveEjectSafetyFixture,
    externalDriveOsEject,
    externalDriveOsEjectFixture,
    externalDriveWriteProof,
    externalDriveWriteProofFixture,
    isDesktopRuntime,
  ]);
  const refreshDiskInfo = useCallback(async () => {
    if (
      !showExternalDriveReadiness ||
      externalDriveDetectionFixture ||
      externalDriveEjectSafetyFixture ||
      externalDriveOsEjectFixture ||
      externalDriveWriteProofFixture ||
      !isDesktopRuntime
    ) {
      setDisks([]);
      setDiskScanStatus("idle");
      return;
    }

    setDiskScanStatus("loading");
    try {
      const diskRows = await getDiskInfo();
      setDisks(diskRows);
      setDiskScanStatus("ready");
    } catch (error) {
      setDisks([]);
      setDiskScanStatus("error");
      setMessage(errorMessage(error));
    }
  }, [
    externalDriveEjectSafetyFixture,
    externalDriveDetectionFixture,
    externalDriveOsEjectFixture,
    externalDriveWriteProofFixture,
    isDesktopRuntime,
    showExternalDriveReadiness,
  ]);

  useEffect(() => {
    if (
      !externalDriveDetectionFixture &&
      !externalDriveEjectSafetyFixture &&
      !externalDriveOsEjectFixture &&
      !externalDriveWriteProofFixture
    ) {
      return;
    }
    setTargetPath(BACKUP_EXTERNAL_DRIVE_DETECTION_FIXTURE_TARGET);
  }, [
    externalDriveDetectionFixture,
    externalDriveEjectSafetyFixture,
    externalDriveOsEjectFixture,
    externalDriveWriteProofFixture,
  ]);

  useEffect(() => {
    void refreshDiskInfo();
  }, [refreshDiskInfo]);

  useEffect(() => {
    let isMounted = true;

    if (!isDesktopRuntime) {
      setIsAutostartEnabled(false);
      setSchedulerStatus(desktopOnlyBackupSchedulerStatus());
      return;
    }

    setIsAutostartLoading(true);
    void import("@tauri-apps/plugin-autostart")
      .then(({ isEnabled }) => isEnabled())
      .then((enabled) => {
        if (isMounted) setIsAutostartEnabled(enabled);
      })
      .catch((error) => {
        if (isMounted) setMessage(errorMessage(error));
      })
      .finally(() => {
        if (isMounted) setIsAutostartLoading(false);
      });

    setBusyAction((current) => current ?? "scheduler-status");
    void getBackupSchedulerStatus()
      .then((status) => {
        if (!isMounted) return;
        setSchedulerStatus(status);
        if (status.config?.cadence) {
          setSchedulerCadence(status.config.cadence);
        }
      })
      .catch((error) => {
        if (isMounted) setMessage(errorMessage(error));
      })
      .finally(() => {
        if (isMounted) {
          setBusyAction((current) => (current === "scheduler-status" ? null : current));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isDesktopRuntime]);

  async function withBusy(action: string, task: () => Promise<void>) {
    if (!targetPath.trim()) {
      setMessage("Set a backup target path first.");
      return;
    }
    if (!isDesktopRuntime) {
      setMessage(
        "Backup filesystem commands are desktop-only. Browser preview will not read or write local files.",
      );
      return;
    }
    setBusyAction(action);
    setMessage(null);
    try {
      await task();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  function resetBackupRestorePlans() {
    setBackupPreview(null);
    setRestorePreview(null);
    setBackupResult(null);
    setRestoreResult(null);
    setExternalDriveWriteProof(null);
    setExternalDriveEjectProof(null);
    setExternalDriveOsEject(null);
  }

  async function handleRunExternalDriveWriteProof() {
    if (!trimmedTargetPath) {
      setMessage("Set a backup target path before running external-drive write proof.");
      return;
    }
    if (!isDesktopRuntime) {
      setMessage("External-drive write proof is available in the desktop app.");
      return;
    }
    if (!detectedBackupTarget?.isRemovable) {
      setMessage("Refresh drives and choose a removable backup target before write proof.");
      return;
    }
    if (detectedBackupTarget.isReadOnly) {
      setMessage("Selected removable target is read-only; write proof is blocked.");
      return;
    }

    setBusyAction("external-drive-write-proof");
    setMessage(null);
    try {
      setExternalDriveEjectProof(null);
      setExternalDriveOsEject(null);
      const proof = await proveBackupExternalDriveWrite({
        consent: {
          accepted: true,
          operation: "sentinel_write_read_checksum_delete",
          targetPath: trimmedTargetPath,
        },
        expectedMountPoint: detectedBackupTarget.mountPoint,
        targetPath: trimmedTargetPath,
      });
      setExternalDriveWriteProof(proof);
      setMessage(proof.message);
      void refreshDiskInfo();
    } catch (error) {
      setExternalDriveWriteProof(null);
      setExternalDriveEjectProof(null);
      setExternalDriveOsEject(null);
      setMessage(errorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRunExternalDriveEjectSafety() {
    if (!trimmedTargetPath) {
      setMessage("Set a backup target path before running eject-safety preflight.");
      return;
    }
    if (!isDesktopRuntime) {
      setMessage("External-drive eject-safety preflight is available in the desktop app.");
      return;
    }
    if (!detectedBackupTarget?.isRemovable) {
      setMessage(
        "Refresh drives and choose a removable backup target before eject-safety preflight.",
      );
      return;
    }
    if (detectedBackupTarget.isReadOnly) {
      setMessage("Selected removable target is read-only; eject-safety preflight is blocked.");
      return;
    }
    if (!externalDriveWriteProof) {
      setMessage("Run external-drive write proof before eject-safety preflight.");
      return;
    }

    const confirmed = window.confirm(
      "Run eject-safety preflight on this removable backup target? This writes, flushes, reads, and deletes a sentinel proof file. It does not eject the drive; use the OS eject/unmount action after it passes.",
    );
    if (!confirmed) {
      setMessage("Eject-safety preflight cancelled.");
      return;
    }

    setBusyAction("external-drive-eject-safety");
    setMessage(null);
    try {
      setExternalDriveOsEject(null);
      const proof = await proveBackupExternalDriveEjectSafety({
        consent: {
          accepted: true,
          operation: "flush_write_delete_before_eject_review",
          targetPath: trimmedTargetPath,
        },
        expectedMountPoint: detectedBackupTarget.mountPoint,
        targetPath: trimmedTargetPath,
      });
      setExternalDriveEjectProof(proof);
      setMessage(proof.message);
      void refreshDiskInfo();
    } catch (error) {
      setExternalDriveEjectProof(null);
      setExternalDriveOsEject(null);
      setMessage(errorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRunExternalDriveOsEject() {
    if (!trimmedTargetPath) {
      setMessage("Set a backup target path before running OS eject/unmount.");
      return;
    }
    if (!isDesktopRuntime) {
      setMessage("External-drive OS eject/unmount is available in the desktop app.");
      return;
    }
    if (!detectedBackupTarget?.isRemovable) {
      setMessage("Refresh drives and choose a removable backup target before OS eject/unmount.");
      return;
    }
    if (detectedBackupTarget.isReadOnly) {
      setMessage("Selected removable target is read-only; OS eject/unmount is blocked.");
      return;
    }
    if (!externalDriveEjectProof?.readyForOsEject) {
      setMessage("Run eject-safety preflight before OS eject/unmount.");
      return;
    }

    const confirmed = window.confirm(
      "Unmount this removable backup target now? OG-Launcher will run a final sentinel flush/read/delete preflight, then ask the OS to unmount/eject the matched mountpoint. No backup or restore files will be copied.",
    );
    if (!confirmed) {
      setMessage("OS eject/unmount cancelled.");
      return;
    }

    setBusyAction("external-drive-os-eject");
    setMessage(null);
    try {
      const result = await ejectBackupExternalDrive({
        consent: {
          accepted: true,
          operation: "os_eject_unmount_removable_target",
          targetPath: trimmedTargetPath,
        },
        expectedMountPoint: detectedBackupTarget.mountPoint,
        preflightProofId: externalDriveEjectProof.proofId,
        targetPath: trimmedTargetPath,
      });
      setExternalDriveOsEject(result);
      setMessage(result.message);
      void refreshDiskInfo();
    } catch (error) {
      setExternalDriveOsEject(null);
      setMessage(errorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleChooseTargetPath() {
    if (!isDesktopRuntime) {
      setMessage("Folder picker is available in the desktop app.");
      return;
    }

    setBusyAction("choose-target");
    setMessage(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: "Choose OG backup folder",
      });

      if (typeof selectedPath === "string") {
        setTargetPath(selectedPath);
        resetBackupRestorePlans();
        setMessage("Backup target folder selected.");
        void refreshDiskInfo();
      } else {
        setMessage("Folder selection cancelled.");
      }
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSetAutostartEnabled(enabled: boolean) {
    if (!isDesktopRuntime) {
      setMessage("Login autostart is available in the desktop app.");
      return;
    }

    setIsAutostartLoading(true);
    setMessage(null);
    try {
      const { disable, enable, isEnabled } = await import("@tauri-apps/plugin-autostart");
      if (enabled) {
        await enable();
      } else {
        await disable();
      }
      setIsAutostartEnabled(await isEnabled());
      setMessage(enabled ? "Login autostart enabled." : "Login autostart disabled.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setIsAutostartLoading(false);
    }
  }

  function buildSchedulerConfig(enabled: boolean): BackupSchedulerConfig {
    return {
      cadence: schedulerCadence,
      compression: compressionMode,
      enabled,
      includeLibraryData,
      targetPath: trimmedTargetPath,
      updatedAt: schedulerConfig?.updatedAt ?? null,
    };
  }

  async function refreshSchedulerStatus(quiet = false) {
    if (!isDesktopRuntime) {
      setSchedulerStatus(desktopOnlyBackupSchedulerStatus());
      return;
    }

    setBusyAction((current) => current ?? "scheduler-status");
    if (!quiet) setMessage(null);
    try {
      const status = await getBackupSchedulerStatus();
      setSchedulerStatus(status);
      if (status.config?.cadence) {
        setSchedulerCadence(status.config.cadence);
      }
      if (!quiet) setMessage(status.message);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusyAction((current) => (current === "scheduler-status" ? null : current));
    }
  }

  async function handleSaveSchedulerConfig() {
    if (!trimmedTargetPath) {
      setMessage("Set a backup target path before saving the OS timer.");
      return;
    }
    if (!isDesktopRuntime) {
      setMessage("Headless OS timers are available in the desktop app.");
      return;
    }

    setBusyAction("scheduler-save");
    setMessage(null);
    try {
      const status = await saveBackupSchedulerConfig(
        buildSchedulerConfig(schedulerStatus?.installed ?? false),
      );
      setSchedulerStatus(status);
      setMessage(status.message);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleInstallScheduler() {
    if (!trimmedTargetPath) {
      setMessage("Set a backup target path before installing the OS timer.");
      return;
    }
    if (!isDesktopRuntime) {
      setMessage("Headless OS timers are available in the desktop app.");
      return;
    }

    setBusyAction("scheduler-install");
    setMessage(null);
    try {
      const status = await installBackupScheduler(buildSchedulerConfig(true));
      setSchedulerStatus(status);
      setMessage(status.message);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUninstallScheduler() {
    if (!isDesktopRuntime) {
      setMessage("Headless OS timers are available in the desktop app.");
      return;
    }

    setBusyAction("scheduler-remove");
    setMessage(null);
    try {
      const status = await uninstallBackupScheduler();
      setSchedulerStatus(status);
      setMessage(status.message);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRunSchedulerNow() {
    if (!isDesktopRuntime) {
      setMessage("Headless OS timers are available in the desktop app.");
      return;
    }

    setBusyAction("scheduler-run");
    setMessage(null);
    try {
      const runStatus = await runBackupSchedulerNow();
      const status = await getBackupSchedulerStatus();
      setSchedulerStatus({
        ...status,
        lastRun: runStatus,
      });
      setMessage(runStatus.message);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshStatus() {
    await withBusy("status", async () => {
      const status = await getLatestBackupStatus(targetPath.trim());
      setLatestStatus(status);
      setMessage(status ? "Latest manifest loaded." : "No manifest found at target.");
    });
  }

  async function handlePreviewBackup() {
    await withBusy("preview-backup", async () => {
      const preview = await previewBackupPlan({
        compression: compressionMode,
        includeLibraryData,
        targetPath: targetPath.trim(),
      });
      setBackupPreview(preview);
      setBackupResult(null);
      setMessage("Backup preview ready.");
    });
  }

  async function handleRunBackup() {
    await withBusy("run-backup", async () => {
      const result = await runBackupPlan({
        compression: compressionMode,
        includeLibraryData,
        targetPath: targetPath.trim(),
      });
      setBackupResult(result);
      setLatestStatus(
        result.latestManifestPath
          ? {
              createdAt: new Date().toISOString(),
              fileCount: result.summary.totalFiles - result.summary.removedFiles,
              gameCount: sourceRows.filter((row) => row.kind === "save").length,
              libraryFileCount: sourceRows.filter((row) => row.kind === "library_data").length,
              manifestId: result.manifestId,
              manifestPath: result.latestManifestPath,
              totalBytes: result.summary.totalBytes,
            }
          : null,
      );
      if (reminderSettings.enabled && reminderSettings.targetPath === targetPath.trim()) {
        persistReminderSettings(markBackupReminderDone(reminderSettings));
        setMessage(`${result.message} Backup reminder advanced.`);
      } else {
        setMessage(result.message);
      }
    });
  }

  async function handlePreviewRestore() {
    await withBusy("preview-restore", async () => {
      const preview = await previewRestorePlan({
        includeLibraryData,
        targetPath: targetPath.trim(),
      });
      setRestorePreview(preview);
      setRestoreResult(null);
      setMessage("Restore preview ready.");
    });
  }

  async function handleRestore() {
    if (!restoreReviewState.canRestore) {
      setMessage(restoreReviewState.message);
      return;
    }

    await withBusy("restore", async () => {
      const result = await restoreBackup({
        includeLibraryData,
        manifestPath: restorePreview?.manifestPath,
        targetPath: targetPath.trim(),
      });
      setRestoreResult(result);
      setMessage(result.message);
    });
  }

  function persistReminderSettings(settings: BackupReminderSettings) {
    const savedSettings = saveBackupReminderSettings(settings);
    setReminderSettings(savedSettings);
    setReminderCadence(savedSettings.enabled ? savedSettings.cadence : "off");
    return savedSettings;
  }

  function handleSaveReminder() {
    const enabled = reminderCadence !== "off";

    if (enabled && !trimmedTargetPath) {
      setMessage("Set a backup target path before enabling reminders.");
      return;
    }

    const cadence: BackupReminderCadence =
      reminderCadence === "off" ? reminderSettings.cadence : reminderCadence;
    const now = new Date();
    const shouldKeepNextDue =
      enabled &&
      reminderSettings.enabled &&
      reminderSettings.cadence === cadence &&
      reminderSettings.targetPath === trimmedTargetPath &&
      reminderSettings.includeLibraryData === includeLibraryData;
    const savedSettings = persistReminderSettings({
      ...reminderSettings,
      autoRunWhenDue,
      cadence,
      compression: compressionMode,
      enabled,
      includeLibraryData,
      nextDueAt: enabled
        ? shouldKeepNextDue
          ? reminderSettings.nextDueAt
          : computeNextBackupReminderDueAt(cadence, now)
        : null,
      snoozedUntil: enabled ? reminderSettings.snoozedUntil : null,
      targetPath: trimmedTargetPath,
      updatedAt: now.toISOString(),
    });

    setMessage(
      savedSettings.enabled
        ? `Backup reminder saved. Next: ${formatBackupReminderDate(savedSettings.nextDueAt)}.`
        : "Backup reminder disabled.",
    );
  }

  function handleSnoozeReminder() {
    if (!reminderSettings.enabled) {
      setMessage("Enable backup reminders before snoozing.");
      return;
    }

    const now = new Date();
    const snoozedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const savedSettings = persistReminderSettings(
      snoozeBackupReminder(reminderSettings, snoozedUntil, now),
    );
    setMessage(
      `Backup reminder snoozed until ${formatBackupReminderDate(savedSettings.snoozedUntil)}.`,
    );
  }

  function handleMarkReminderDone() {
    if (!reminderSettings.enabled) {
      setMessage("Enable backup reminders before marking one done.");
      return;
    }

    const savedSettings = persistReminderSettings(markBackupReminderDone(reminderSettings));
    setMessage(`Backup reminder advanced to ${formatBackupReminderDate(savedSettings.nextDueAt)}.`);
  }

  const backupSummary = backupResult?.summary ?? backupPreview?.summary ?? null;
  const restoreSummary = restoreResult?.summary ?? restorePreview?.summary ?? null;

  return (
    <section className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]">
      <div className="flex flex-col gap-3 border-b-4 border-black p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">Local Safety</p>
          <h2 className="text-3xl font-black uppercase text-[#171411]">Backup & Restore</h2>
        </div>
        <DatabaseBackup className="h-10 w-10 text-[#c20b2f]" />
      </div>

      <div className="space-y-4 p-5">
        {!isDesktopRuntime ? (
          <div className="border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
            <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#c20b2f]">
              Browser Backup Guard
            </p>
            <p className="neo-copy mt-2 text-[11px] font-bold uppercase leading-5 text-[#55504a]">
              Preview, Backup, Restore, folder picker, and OS timer commands are disabled here so
              browser preview never touches the filesystem. Reminder settings still save locally.
            </p>
          </div>
        ) : null}

        {externalDriveReadiness ? (
          <BackupExternalDriveReadinessPanel readiness={externalDriveReadiness} />
        ) : null}

        {showExternalDriveReadiness ? (
          <div
            aria-label="Backup drive scan status"
            className="grid gap-3 border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411] md:grid-cols-[1fr_auto] md:items-center"
          >
            <div>
              <p className="neo-copy text-[9px] font-black uppercase tracking-[0.14em] text-[#c20b2f]">
                Drive Scan
              </p>
              <p className="neo-copy mt-1 text-[10px] font-black uppercase leading-5 text-[#55504a]">
                {driveScanCopy}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="neo-copy flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#087d6d] px-4 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#8f887c] disabled:text-white disabled:opacity-100"
                disabled={
                  !isDesktopRuntime ||
                  externalDriveDetectionFixture ||
                  externalDriveEjectSafetyFixture ||
                  externalDriveOsEjectFixture ||
                  externalDriveWriteProofFixture ||
                  diskScanStatus === "loading"
                }
                type="button"
                onClick={() => void refreshDiskInfo()}
              >
                <RefreshCw className="h-4 w-4" />
                Refresh Drives
              </button>
              <button
                className="neo-copy flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-4 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#8f887c] disabled:text-white disabled:opacity-100"
                disabled={
                  busyAction !== null ||
                  !isDesktopRuntime ||
                  externalDriveDetectionFixture ||
                  externalDriveEjectSafetyFixture ||
                  externalDriveOsEjectFixture ||
                  externalDriveWriteProofFixture ||
                  !detectedBackupTarget?.isRemovable ||
                  detectedBackupTarget.isReadOnly
                }
                type="button"
                onClick={() => void handleRunExternalDriveWriteProof()}
              >
                <CheckCircle2 className="h-4 w-4" />
                Write Proof
              </button>
              <button
                className="neo-copy flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#171411] px-4 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#8f887c] disabled:text-white disabled:opacity-100"
                disabled={
                  busyAction !== null ||
                  !isDesktopRuntime ||
                  externalDriveDetectionFixture ||
                  externalDriveEjectSafetyFixture ||
                  externalDriveOsEjectFixture ||
                  externalDriveWriteProofFixture ||
                  !detectedBackupTarget?.isRemovable ||
                  detectedBackupTarget.isReadOnly ||
                  !externalDriveWriteProof
                }
                type="button"
                onClick={() => void handleRunExternalDriveEjectSafety()}
              >
                <ArchiveRestore className="h-4 w-4" />
                Eject Proof
              </button>
              <button
                className="neo-copy flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#087d6d] px-4 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#8f887c] disabled:text-white disabled:opacity-100"
                disabled={
                  busyAction !== null ||
                  !isDesktopRuntime ||
                  externalDriveDetectionFixture ||
                  externalDriveEjectSafetyFixture ||
                  externalDriveOsEjectFixture ||
                  externalDriveWriteProofFixture ||
                  !detectedBackupTarget?.isRemovable ||
                  detectedBackupTarget.isReadOnly ||
                  !externalDriveEjectProof?.readyForOsEject
                }
                type="button"
                onClick={() => void handleRunExternalDriveOsEject()}
              >
                <Power className="h-4 w-4" />
                OS Unmount
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <label className="neo-copy block text-[10px] font-black uppercase text-[#55504a]">
            Target Path
            <input
              className="mt-1 h-11 w-full border-2 border-black bg-[#fff9ed] px-3 text-[12px] font-black text-[#171411] shadow-[2px_2px_0_#171411] outline-none"
              placeholder="/media/backup-drive or D:/OG-Backups"
              value={targetPath}
              onChange={(event) => {
                setTargetPath(event.target.value);
                resetBackupRestorePlans();
              }}
              onBlur={() => {
                if (showExternalDriveReadiness) void refreshDiskInfo();
              }}
            />
          </label>
          <button
            className="neo-copy flex h-11 items-center justify-center gap-2 border-2 border-black bg-[#087d6d] px-4 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#8f887c] disabled:text-white disabled:opacity-100"
            disabled={busyAction !== null || !isDesktopRuntime}
            type="button"
            onClick={() => void handleChooseTargetPath()}
          >
            <FolderOpen className="h-4 w-4" />
            Browse
          </button>
          <button
            className="neo-copy flex h-11 items-center justify-center gap-2 border-2 border-black bg-[#171411] px-4 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#8f887c] disabled:text-white disabled:opacity-100"
            disabled={busyAction !== null || !targetPath.trim() || !isDesktopRuntime}
            type="button"
            onClick={() => void refreshStatus()}
          >
            <HardDrive className="h-4 w-4" />
            Status
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <label className="neo-copy flex w-fit items-center gap-2 border-2 border-black bg-[#efe6d4] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
            <input
              checked={includeLibraryData}
              className="h-4 w-4 accent-[#087d6d]"
              type="checkbox"
              onChange={(event) => {
                setIncludeLibraryData(event.currentTarget.checked);
                resetBackupRestorePlans();
              }}
            />
            Include Library DB
          </label>
          <label className="neo-copy flex w-fit items-center gap-2 border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
            <input
              checked={compressionMode === "zip"}
              className="h-4 w-4 accent-[#c20b2f]"
              type="checkbox"
              onChange={(event) => {
                setCompressionMode(event.currentTarget.checked ? "zip" : "none");
                resetBackupRestorePlans();
              }}
            />
            Create ZIP Archive
          </label>
        </div>

        <div
          className={`border-2 border-black p-3 shadow-[2px_2px_0_#171411] ${
            reminderStatus.tone === "ready"
              ? "bg-[#fff9ed]"
              : reminderStatus.tone === "warning"
                ? "bg-[#f6edd8]"
                : "bg-[#efe6d4]"
          }`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="neo-copy text-[10px] font-black uppercase text-[#55504a]">
                Backup Reminder
              </p>
              <h3 className="mt-1 text-xl font-black uppercase text-[#171411]">
                {reminderStatus.title}
              </h3>
              <p className="neo-copy mt-1 break-words text-[10px] font-bold uppercase leading-4 text-[#55504a]">
                {reminderStatus.message}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {reminderFormChanged ? (
                <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
                  Unsaved
                </span>
              ) : null}
              {reminderIsDue ? (
                <span className="neo-copy border-2 border-black bg-[#c20b2f] px-2 py-1 text-[8px] font-black uppercase text-white">
                  Due
                </span>
              ) : null}
              <AlarmClock className="h-8 w-8 text-[#087d6d]" />
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <label className="neo-copy block text-[9px] font-black uppercase text-[#55504a]">
              Cadence
              <select
                className="mt-1 h-10 w-full border-2 border-black bg-[#fff9ed] px-3 text-[11px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411] outline-none"
                value={reminderCadence}
                onChange={(event) =>
                  setReminderCadence(event.currentTarget.value as BackupReminderCadence | "off")
                }
              >
                <option value="off">Off</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <ReminderStat
              label="Last Done"
              value={formatBackupReminderDate(reminderSettings.lastRunAt)}
            />
            <ReminderStat
              label="Next Due"
              value={formatBackupReminderDate(reminderSettings.nextDueAt)}
            />
          </div>

          <p className="neo-copy mt-2 truncate text-[9px] font-bold uppercase text-[#55504a]">
            Saved Target: {reminderSettings.targetPath || "None"}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <label className="neo-copy flex w-fit items-center gap-2 border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
              <input
                checked={autoRunWhenDue}
                className="h-4 w-4 accent-[#c20b2f]"
                type="checkbox"
                onChange={(event) => setAutoRunWhenDue(event.currentTarget.checked)}
              />
              Auto-run due backups
            </label>
            <span
              className={`neo-copy border-2 border-black px-3 py-2 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] ${
                isAutostartEnabled ? "bg-[#8cf5e4] text-[#171411]" : "bg-[#efe6d4] text-[#55504a]"
              }`}
            >
              OS Login Start: {isAutostartEnabled ? "On" : "Off"}
            </span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <ReminderButton
              icon={<Save className="h-4 w-4" />}
              label="Save Reminder"
              onClick={handleSaveReminder}
            />
            <ReminderButton
              disabled={isAutostartLoading}
              icon={<Power className="h-4 w-4" />}
              label={isAutostartEnabled ? "Disable Login" : "Enable Login"}
              onClick={() => void handleSetAutostartEnabled(!isAutostartEnabled)}
            />
            <ReminderButton
              disabled={!reminderSettings.enabled}
              icon={<AlarmClock className="h-4 w-4" />}
              label="Snooze 24H"
              onClick={handleSnoozeReminder}
            />
            <ReminderButton
              disabled={!reminderSettings.enabled}
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Mark Done"
              onClick={handleMarkReminderDone}
            />
          </div>
        </div>

        <div
          className={`border-2 border-black p-3 shadow-[2px_2px_0_#171411] ${
            schedulerStatus?.installed
              ? "bg-[#fff9ed]"
              : schedulerStatus?.supported === false
                ? "bg-[#efe6d4]"
                : "bg-[#f6edd8]"
          }`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="neo-copy text-[10px] font-black uppercase text-[#55504a]">
                Headless OS Timer
              </p>
              <h3 className="mt-1 text-xl font-black uppercase text-[#171411]">
                {schedulerStatus?.installed ? "Timer Armed" : "Timer Not Installed"}
              </h3>
              <p className="neo-copy mt-1 break-words text-[10px] font-bold uppercase leading-4 text-[#55504a]">
                {schedulerStatus?.message ?? "Checking backup timer status."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {schedulerFormChanged ? (
                <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
                  Unsaved
                </span>
              ) : null}
              <span
                className={`neo-copy border-2 border-black px-2 py-1 text-[8px] font-black uppercase ${
                  schedulerStatus?.installed
                    ? "bg-[#087d6d] text-white"
                    : "bg-[#efe6d4] text-[#171411]"
                }`}
              >
                {schedulerStatus?.installed ? "Installed" : "Off"}
              </span>
              <Timer className="h-8 w-8 text-[#c20b2f]" />
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <label className="neo-copy block text-[9px] font-black uppercase text-[#55504a]">
              Timer Cadence
              <select
                className="mt-1 h-10 w-full border-2 border-black bg-[#fff9ed] px-3 text-[11px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411] outline-none"
                value={schedulerCadence}
                onChange={(event) =>
                  setSchedulerCadence(event.currentTarget.value as BackupSchedulerCadence)
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <ReminderStat label="Provider" value={schedulerStatus?.provider ?? "Checking"} />
            <ReminderStat
              label="Last Headless Run"
              value={formatBackupReminderDate(schedulerStatus?.lastRun?.lastRunAt ?? null)}
            />
          </div>

          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <p className="neo-copy truncate border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-bold uppercase text-[#55504a]">
              Config: {schedulerStatus?.configPath ?? "not loaded"}
            </p>
            <p className="neo-copy truncate border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-bold uppercase text-[#55504a]">
              Last Result:{" "}
              {schedulerStatus?.lastRun?.success
                ? "Success"
                : schedulerStatus?.lastRun
                  ? "Failed"
                  : "No run"}
            </p>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-5">
            <ReminderButton
              disabled={busyAction !== null || !trimmedTargetPath || !isDesktopRuntime}
              icon={<Save className="h-4 w-4" />}
              label="Save Timer"
              onClick={() => void handleSaveSchedulerConfig()}
            />
            <ReminderButton
              disabled={
                busyAction !== null ||
                !trimmedTargetPath ||
                !isDesktopRuntime ||
                schedulerStatus?.supported === false
              }
              icon={<Timer className="h-4 w-4" />}
              label={schedulerStatus?.installed ? "Reinstall" : "Install"}
              onClick={() => void handleInstallScheduler()}
            />
            <ReminderButton
              disabled={busyAction !== null || !isDesktopRuntime || !schedulerStatus?.installed}
              icon={<Trash2 className="h-4 w-4" />}
              label="Remove"
              onClick={() => void handleUninstallScheduler()}
            />
            <ReminderButton
              disabled={busyAction !== null || !isDesktopRuntime || !schedulerStatus?.installed}
              icon={<Play className="h-4 w-4" />}
              label="Run Now"
              onClick={() => void handleRunSchedulerNow()}
            />
            <ReminderButton
              disabled={busyAction !== null || !isDesktopRuntime}
              icon={<RefreshCw className="h-4 w-4" />}
              label="Refresh"
              onClick={() => void refreshSchedulerStatus()}
            />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <ActionButton
            busy={busyAction === "preview-backup"}
            disabled={busyAction !== null || !targetPath.trim() || !isDesktopRuntime}
            icon={<RefreshCw className="h-4 w-4" />}
            label="Preview"
            onClick={() => void handlePreviewBackup()}
          />
          <ActionButton
            busy={busyAction === "run-backup"}
            disabled={busyAction !== null || !targetPath.trim() || !isDesktopRuntime}
            icon={<DatabaseBackup className="h-4 w-4" />}
            label="Backup"
            onClick={() => void handleRunBackup()}
          />
          <ActionButton
            busy={busyAction === "preview-restore"}
            disabled={busyAction !== null || !targetPath.trim() || !isDesktopRuntime}
            icon={<RotateCcw className="h-4 w-4" />}
            label="Restore Plan"
            onClick={() => void handlePreviewRestore()}
          />
          <ActionButton
            busy={busyAction === "restore"}
            danger
            disabled={busyAction !== null || !restoreReviewState.canRestore || !isDesktopRuntime}
            icon={<ArchiveRestore className="h-4 w-4" />}
            label="Restore"
            onClick={() => void handleRestore()}
          />
        </div>

        <div
          className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] ${
            restoreReviewState.tone === "ready"
              ? "bg-[#087d6d] text-white"
              : restoreReviewState.tone === "warning"
                ? "bg-[#fff9ed] text-[#171411]"
                : "bg-[#c20b2f] text-white"
          }`}
        >
          <span className="block text-[11px]">{restoreReviewState.title}</span>
          <span className="mt-1 block leading-4">{restoreReviewState.message}</span>
        </div>

        {message ? (
          <div className="neo-copy border-2 border-black bg-[#087d6d] px-3 py-2 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411]">
            {message}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="Latest" value={formatBackupTimestamp(latestStatus?.createdAt)} />
          <Metric
            label="Files"
            value={String(latestStatus?.fileCount ?? backupSummary?.totalFiles ?? 0)}
          />
          <Metric
            label="Bytes"
            value={formatBackupBytes(latestStatus?.totalBytes ?? backupSummary?.totalBytes ?? 0)}
          />
        </div>

        {backupResult?.archivePath ? (
          <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <h3 className="neo-copy text-[11px] font-black uppercase text-[#171411]">
                  ZIP Archive Ready
                </h3>
                <p className="neo-copy mt-1 truncate text-[9px] font-bold uppercase text-[#55504a]">
                  {backupResult.archivePath}
                </p>
              </div>
              <span className="neo-title text-2xl uppercase text-[#171411]">
                {formatBackupBytes(backupResult.archiveBytes ?? 0)}
              </span>
            </div>
          </div>
        ) : null}

        {backupSummary ? (
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              ["New", backupSummary.newFiles],
              ["Changed", backupSummary.changedFiles],
              ["Unchanged", backupSummary.unchangedFiles],
              ["Removed", backupSummary.removedFiles],
            ].map(([label, value]) => (
              <Metric key={label} label={String(label)} value={String(value)} compact />
            ))}
          </div>
        ) : null}

        {restoreSummary ? (
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              ["Create", restoreSummary.createFiles],
              ["Overwrite", restoreSummary.overwriteFiles],
              ["Blocked", restoreSummary.blockedFiles],
              ["Missing", restoreSummary.missingBackupFiles],
            ].map(([label, value]) => (
              <Metric key={label} label={String(label)} value={String(value)} compact />
            ))}
          </div>
        ) : null}

        {restoreAttentionRows.length > 0 ? (
          <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
            <h3 className="neo-copy text-[11px] font-black uppercase text-[#c20b2f]">
              Restore Review Issues
            </h3>
            <div className="mt-2 grid gap-2">
              {restoreAttentionRows.slice(0, 5).map((file) => (
                <div
                  key={`${file.action}-${file.restorePath}-${file.backupRelativePath}`}
                  className="grid gap-2 border-2 border-black bg-[#f5eedf] p-2 md:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-black uppercase text-[#171411]">
                      {file.restorePath}
                    </p>
                    <p className="neo-copy mt-1 truncate text-[9px] font-bold uppercase text-[#55504a]">
                      {file.message}
                    </p>
                  </div>
                  <span className="neo-copy h-fit border border-black bg-[#c20b2f] px-2 py-1 text-[8px] font-black uppercase text-white">
                    {getRestoreActionLabel(file.action)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {restoreResultDetails.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {restoreResultDetails.map((detail) => (
              <div
                key={detail.id}
                className={`border-2 border-black p-3 shadow-[2px_2px_0_#171411] ${
                  detail.tone === "success"
                    ? "bg-[#8cf5e4]"
                    : detail.tone === "danger"
                      ? "bg-[#c20b2f] text-white"
                      : "bg-[#fff9ed]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="neo-copy text-[10px] font-black uppercase text-[#171411]">
                    {detail.label}
                  </h3>
                  <span className="neo-title text-xl uppercase text-[#171411]">{detail.count}</span>
                </div>
                {detail.paths.length > 0 ? (
                  <p className="neo-copy mt-2 truncate text-[9px] font-bold uppercase text-[#55504a]">
                    {detail.paths[0]}
                  </p>
                ) : (
                  <p className="neo-copy mt-2 text-[9px] font-bold uppercase text-[#55504a]">
                    No files in this group.
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {sourceRows.length > 0 ? (
          <div className="grid gap-2">
            {sourceRows.slice(0, 6).map((row) => (
              <div
                key={row.id}
                className="grid gap-2 border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411] md:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black uppercase text-[#171411]">
                    {row.label}
                  </h3>
                  <p className="neo-copy mt-1 truncate text-[9px] font-bold uppercase text-[#55504a]">
                    {row.path}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {Object.entries(row.actions)
                    .filter(([, count]) => count > 0)
                    .map(([action, count]) => (
                      <span
                        key={action}
                        className="neo-copy border border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase text-[#171411]"
                      >
                        {getBackupActionLabel(action as Parameters<typeof getBackupActionLabel>[0])}{" "}
                        {count}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {restorePreview?.files.length ? (
          <div className="grid gap-2">
            {restorePreview.files.slice(0, 6).map((file) => (
              <div
                key={`${file.restorePath}-${file.backupRelativePath}`}
                className="grid gap-2 border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411] md:grid-cols-[1fr_auto]"
              >
                <p className="truncate text-sm font-black uppercase text-[#171411]">
                  {file.restorePath}
                </p>
                <span className="neo-copy border border-black bg-[#efe6d4] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
                  {getRestoreActionLabel(file.action)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ActionButton({
  busy,
  danger = false,
  disabled,
  icon,
  label,
  onClick,
}: {
  busy: boolean;
  danger?: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`neo-copy flex h-11 items-center justify-center gap-2 border-2 border-black px-3 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#8f887c] disabled:text-white disabled:opacity-100 ${
        danger ? "bg-[#c20b2f] text-white" : "bg-[#087d6d] text-white"
      }`}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function ReminderButton({
  disabled = false,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="neo-copy flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#171411] px-3 text-[9px] font-black uppercase text-white shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function ReminderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]">
      <p className="neo-copy text-[8px] font-black uppercase text-[#55504a]">{label}</p>
      <p className="neo-copy mt-1 truncate text-[10px] font-black uppercase leading-4 text-[#171411]">
        {value}
      </p>
    </div>
  );
}

function Metric({
  compact = false,
  label,
  value,
}: {
  compact?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="border-2 border-black bg-[#efe6d4] p-3 shadow-[2px_2px_0_#171411]">
      <p className="neo-copy text-[8px] font-black uppercase text-[#55504a]">{label}</p>
      <p
        className={`mt-1 truncate font-black uppercase text-[#171411] ${
          compact ? "text-xl" : "text-2xl"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
