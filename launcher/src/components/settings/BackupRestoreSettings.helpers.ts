import type {
  BackupFileAction,
  BackupFilePlan,
  BackupSourceKind,
  RestoreExecutionResult,
  RestoreFileAction,
  RestoreFilePlan,
  RestorePlanPreview,
} from "../../lib/types/backup";

export interface BackupSourceRow {
  id: string;
  kind: BackupSourceKind;
  label: string;
  path: string;
  fileCount: number;
  sizeBytes: number;
  actions: Record<BackupFileAction, number>;
}

export interface RestoreReviewState {
  canRestore: boolean;
  tone: "ready" | "warning" | "blocked";
  title: string;
  message: string;
}

export interface RestoreResultDetail {
  id: string;
  label: string;
  count: number;
  tone: "success" | "warning" | "danger";
  paths: string[];
}

const BACKUP_ACTION_LABELS: Record<BackupFileAction, string> = {
  changed: "Changed",
  new: "New",
  removed: "Removed",
  unchanged: "Unchanged",
};

const RESTORE_ACTION_LABELS: Record<RestoreFileAction, string> = {
  blocked: "Blocked",
  create: "Create",
  missing_backup: "Missing",
  overwrite: "Overwrite",
  unchanged: "Unchanged",
};

export function formatBackupBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function formatBackupTimestamp(value: string | null | undefined): string {
  if (!value) return "No manifest";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function getBackupActionLabel(action: BackupFileAction): string {
  return BACKUP_ACTION_LABELS[action];
}

export function getRestoreActionLabel(action: RestoreFileAction): string {
  return RESTORE_ACTION_LABELS[action];
}

export function getSourceKindLabel(kind: BackupSourceKind): string {
  return kind === "library_data" ? "Library Data" : "Save Root";
}

export function collectBackupSourceRows(files: BackupFilePlan[]): BackupSourceRow[] {
  const rows = new Map<string, BackupSourceRow>();

  for (const file of files) {
    const id = `${file.sourceKind}:${file.sourceId}:${file.sourceRoot}`;
    const existing = rows.get(id);
    const row =
      existing ??
      ({
        actions: {
          changed: 0,
          new: 0,
          removed: 0,
          unchanged: 0,
        },
        fileCount: 0,
        id,
        kind: file.sourceKind,
        label: file.gameTitle ?? getSourceKindLabel(file.sourceKind),
        path: file.sourceRoot,
        sizeBytes: 0,
      } satisfies BackupSourceRow);

    row.actions[file.action] += 1;
    if (file.action !== "removed") {
      row.fileCount += 1;
      row.sizeBytes += file.sizeBytes;
    }

    rows.set(id, row);
  }

  return Array.from(rows.values()).sort((left, right) => {
    const labelCompare = left.label.localeCompare(right.label);
    return labelCompare === 0 ? left.path.localeCompare(right.path) : labelCompare;
  });
}

export function getRestoreReviewState(
  preview: RestorePlanPreview | null,
  targetPath: string,
): RestoreReviewState {
  if (!targetPath.trim()) {
    return {
      canRestore: false,
      message: "Set a backup target path before planning a restore.",
      title: "Target required",
      tone: "blocked",
    };
  }

  if (!preview) {
    return {
      canRestore: false,
      message: "Run Restore Plan first so blocked and missing files are visible before restore.",
      title: "Review required",
      tone: "warning",
    };
  }

  if (preview.targetPath.trim() !== targetPath.trim()) {
    return {
      canRestore: false,
      message: "Restore Plan is stale because the target path changed. Run Restore Plan again.",
      title: "Review stale",
      tone: "blocked",
    };
  }

  const blockedCount = preview.summary.blockedFiles;
  if (blockedCount > 0) {
    return {
      canRestore: false,
      message: `${blockedCount} file${blockedCount === 1 ? "" : "s"} are blocked by path safety rules.`,
      title: "Blocked files",
      tone: "blocked",
    };
  }

  const missingCount = preview.summary.missingBackupFiles;
  if (missingCount > 0) {
    return {
      canRestore: false,
      message: `${missingCount} backup payload${missingCount === 1 ? "" : "s"} are missing from the target.`,
      title: "Missing backup payload",
      tone: "blocked",
    };
  }

  const actionableCount = preview.summary.createFiles + preview.summary.overwriteFiles;
  if (actionableCount === 0) {
    return {
      canRestore: false,
      message: "The reviewed backup has no create or overwrite work to apply.",
      title: "Nothing to restore",
      tone: "warning",
    };
  }

  if (preview.summary.overwriteFiles > 0) {
    return {
      canRestore: true,
      message: `${preview.summary.overwriteFiles} existing file${
        preview.summary.overwriteFiles === 1 ? "" : "s"
      } will be overwritten after safety copies are created.`,
      title: "Overwrite review",
      tone: "warning",
    };
  }

  return {
    canRestore: true,
    message: "Restore can run from the reviewed plan. Existing files get safety copies first.",
    title: "Ready to restore",
    tone: "ready",
  };
}

export function collectRestoreAttentionRows(files: RestoreFilePlan[]): RestoreFilePlan[] {
  return files
    .filter((file) => file.action === "blocked" || file.action === "missing_backup")
    .sort((left, right) => {
      if (left.action !== right.action) {
        return left.action === "blocked" ? -1 : 1;
      }
      return left.restorePath.localeCompare(right.restorePath);
    });
}

export function collectRestoreResultDetails(
  result: RestoreExecutionResult | null,
): RestoreResultDetail[] {
  if (!result) return [];
  return [
    {
      count: result.restoredFiles.length,
      id: "restored",
      label: "Restored",
      paths: result.restoredFiles,
      tone: "success",
    },
    {
      count: result.backedUpFiles.length,
      id: "safety-copies",
      label: "Safety copies",
      paths: result.backedUpFiles,
      tone: "warning",
    },
    {
      count: result.skippedFiles.length,
      id: "skipped",
      label: "Skipped",
      paths: result.skippedFiles,
      tone: "warning",
    },
    {
      count: result.failedFiles.length,
      id: "failed",
      label: "Failed",
      paths: result.failedFiles,
      tone: "danger",
    },
  ];
}
