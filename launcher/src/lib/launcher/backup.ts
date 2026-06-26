import { isTauri } from "@tauri-apps/api/core";
import type {
  BackupExecutionResult,
  BackupExternalDriveEjectSafetyRequest,
  BackupExternalDriveEjectSafetyResult,
  BackupExternalDriveOsEjectRequest,
  BackupExternalDriveOsEjectResult,
  BackupExternalDriveWriteProofRequest,
  BackupExternalDriveWriteProofResult,
  BackupManifestStatus,
  BackupPlanPreview,
  BackupPlanRequest,
  BackupSchedulerConfig,
  BackupSchedulerRunStatus,
  BackupSchedulerStatus,
  RestoreExecutionResult,
  RestorePlanPreview,
  RestorePlanRequest,
} from "./types";
import { invokeCommand } from "./shared";

export function previewBackupPlan(input: BackupPlanRequest): Promise<BackupPlanPreview> {
  if (!isTauri()) {
    return Promise.reject(new Error("Backup preview is available in the desktop app."));
  }

  return invokeCommand<BackupPlanPreview>("preview_backup_plan", { input });
}

export function runBackupPlan(input: BackupPlanRequest): Promise<BackupExecutionResult> {
  if (!isTauri()) {
    return Promise.reject(new Error("Backup execution is available in the desktop app."));
  }

  return invokeCommand<BackupExecutionResult>("run_backup_plan", { input });
}

export function proveBackupExternalDriveWrite(
  input: BackupExternalDriveWriteProofRequest,
): Promise<BackupExternalDriveWriteProofResult> {
  if (!isTauri()) {
    return Promise.reject(new Error("External drive write proof is available in the desktop app."));
  }

  return invokeCommand<BackupExternalDriveWriteProofResult>("prove_backup_external_drive_write", {
    input,
  });
}

export function proveBackupExternalDriveEjectSafety(
  input: BackupExternalDriveEjectSafetyRequest,
): Promise<BackupExternalDriveEjectSafetyResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("External drive eject-safety proof is available in the desktop app."),
    );
  }

  return invokeCommand<BackupExternalDriveEjectSafetyResult>(
    "prove_backup_external_drive_eject_safety",
    {
      input,
    },
  );
}

export function ejectBackupExternalDrive(
  input: BackupExternalDriveOsEjectRequest,
): Promise<BackupExternalDriveOsEjectResult> {
  if (!isTauri()) {
    return Promise.reject(new Error("External drive OS eject is available in the desktop app."));
  }

  return invokeCommand<BackupExternalDriveOsEjectResult>("eject_backup_external_drive", {
    input,
  });
}

export function previewRestorePlan(input: RestorePlanRequest): Promise<RestorePlanPreview> {
  if (!isTauri()) {
    return Promise.reject(new Error("Restore preview is available in the desktop app."));
  }

  return invokeCommand<RestorePlanPreview>("preview_restore_plan", { input });
}

export function restoreBackup(input: RestorePlanRequest): Promise<RestoreExecutionResult> {
  if (!isTauri()) {
    return Promise.reject(new Error("Restore execution is available in the desktop app."));
  }

  return invokeCommand<RestoreExecutionResult>("restore_backup", { input });
}

export function getLatestBackupStatus(targetPath: string): Promise<BackupManifestStatus | null> {
  if (!isTauri()) {
    return Promise.reject(new Error("Backup status is available in the desktop app."));
  }

  return invokeCommand<BackupManifestStatus | null>("get_latest_backup_status", { targetPath });
}

export function getBackupSchedulerStatus(): Promise<BackupSchedulerStatus> {
  return invokeCommand<BackupSchedulerStatus>("get_backup_scheduler_status");
}

export function saveBackupSchedulerConfig(
  input: BackupSchedulerConfig,
): Promise<BackupSchedulerStatus> {
  return invokeCommand<BackupSchedulerStatus>("save_backup_scheduler_config", { input });
}

export function installBackupScheduler(
  input: BackupSchedulerConfig,
): Promise<BackupSchedulerStatus> {
  return invokeCommand<BackupSchedulerStatus>("install_backup_scheduler", { input });
}

export function uninstallBackupScheduler(): Promise<BackupSchedulerStatus> {
  return invokeCommand<BackupSchedulerStatus>("uninstall_backup_scheduler");
}

export function runBackupSchedulerNow(): Promise<BackupSchedulerRunStatus> {
  return invokeCommand<BackupSchedulerRunStatus>("run_backup_scheduler_now");
}
