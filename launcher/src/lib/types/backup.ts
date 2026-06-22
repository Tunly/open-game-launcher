export type BackupSourceKind = "save" | "library_data";
export type BackupFileAction = "new" | "changed" | "unchanged" | "removed";
export type BackupCompressionMode = "none" | "zip";
export type BackupSchedulerCadence = "daily" | "weekly";
export type RestoreFileAction = "create" | "overwrite" | "unchanged" | "blocked" | "missing_backup";

export interface BackupPlanRequest {
  targetPath: string;
  gameIds?: string[];
  includeLibraryData?: boolean;
  compression?: BackupCompressionMode;
}

export interface RestorePlanRequest {
  targetPath: string;
  manifestPath?: string | null;
  gameIds?: string[];
  includeLibraryData?: boolean;
}

export interface BackupSummary {
  totalFiles: number;
  newFiles: number;
  changedFiles: number;
  unchangedFiles: number;
  removedFiles: number;
  missingSources: number;
  totalBytes: number;
  bytesToCopy: number;
}

export interface BackupFilePlan {
  action: BackupFileAction;
  sourceKind: BackupSourceKind;
  sourceId: string;
  gameId?: string;
  gameTitle?: string;
  sourceRoot: string;
  sourcePath: string;
  relativePath: string;
  backupRelativePath: string;
  sizeBytes: number;
  modifiedAt?: string;
  sha256: string;
}

export interface BackupMissingSource {
  sourceKind: BackupSourceKind;
  gameId?: string;
  gameTitle?: string;
  path: string;
  reason: string;
}

export interface BackupPlanPreview {
  targetPath: string;
  backupRoot: string;
  latestManifestPath?: string;
  manifestId: string;
  generatedAt: string;
  summary: BackupSummary;
  compression: BackupCompressionMode;
  files: BackupFilePlan[];
  missingSources: BackupMissingSource[];
}

export interface BackupExecutionResult {
  success: boolean;
  manifestId: string;
  manifestPath?: string;
  latestManifestPath?: string;
  archivePath?: string;
  archiveBytes?: number;
  summary: BackupSummary;
  copiedFiles: string[];
  skippedFiles: string[];
  failedFiles: string[];
  message: string;
}

export interface BackupExternalDriveWriteProofRequest {
  targetPath: string;
  expectedMountPoint: string;
  consent: BackupExternalDriveWriteProofConsent;
}

export interface BackupExternalDriveWriteProofConsent {
  accepted: boolean;
  targetPath: string;
  operation: "sentinel_write_read_checksum_delete";
}

export interface BackupExternalDriveWriteProofResult {
  success: boolean;
  proofId: string;
  targetPath: string;
  mountPoint?: string;
  diskName?: string;
  fileSystem?: string;
  isRemovable?: boolean;
  isReadOnly?: boolean;
  proofPath: string;
  bytesWritten: number;
  bytesRead: number;
  sha256: string;
  checksumMatched: boolean;
  verifiedAt: string;
  cleanupDeleted: boolean;
  message: string;
}

export interface BackupExternalDriveEjectSafetyRequest {
  targetPath: string;
  expectedMountPoint: string;
  consent: BackupExternalDriveEjectSafetyConsent;
}

export interface BackupExternalDriveEjectSafetyConsent {
  accepted: boolean;
  targetPath: string;
  operation: "flush_write_delete_before_eject_review";
}

export interface BackupExternalDriveEjectSafetyResult {
  success: boolean;
  proofId: string;
  targetPath: string;
  mountPoint: string;
  diskName: string;
  fileSystem: string;
  isRemovable: boolean;
  isReadOnly: boolean;
  proofPath: string;
  bytesWritten: number;
  bytesRead: number;
  sha256: string;
  syncCompleted: boolean;
  directorySyncSupported: boolean;
  directorySyncCompleted: boolean;
  cleanupDeleted: boolean;
  pendingProofFiles: string[];
  readyForOsEject: boolean;
  verifiedAt: string;
  recommendedNextStep: string;
  message: string;
}

export interface BackupExternalDriveOsEjectRequest {
  targetPath: string;
  expectedMountPoint: string;
  preflightProofId: string;
  consent: BackupExternalDriveOsEjectConsent;
}

export interface BackupExternalDriveOsEjectConsent {
  accepted: boolean;
  targetPath: string;
  operation: "os_eject_unmount_removable_target";
}

export interface BackupExternalDriveOsEjectResult {
  success: boolean;
  targetPath: string;
  mountPoint: string;
  diskName: string;
  fileSystem: string;
  isRemovable: boolean;
  isReadOnly: boolean;
  preflightProofId: string;
  finalPreflightProofId: string;
  platform: string;
  commandLabel: string;
  unmounted: boolean;
  verifiedAt: string;
  recommendedNextStep: string;
  message: string;
}

export interface BackupManifestStatus {
  manifestId: string;
  createdAt: string;
  manifestPath: string;
  fileCount: number;
  gameCount: number;
  libraryFileCount: number;
  totalBytes: number;
}

export interface BackupSchedulerConfig {
  enabled: boolean;
  targetPath: string;
  includeLibraryData: boolean;
  compression: BackupCompressionMode;
  cadence: BackupSchedulerCadence;
  updatedAt?: string | null;
}

export interface BackupSchedulerRunStatus {
  lastRunAt: string;
  success: boolean;
  message: string;
  manifestPath?: string;
  archivePath?: string;
}

export interface BackupSchedulerStatus {
  supported: boolean;
  installed: boolean;
  provider: string;
  configPath: string;
  statusPath: string;
  config?: BackupSchedulerConfig | null;
  lastRun?: BackupSchedulerRunStatus | null;
  message: string;
}

export interface RestoreSummary {
  totalFiles: number;
  createFiles: number;
  overwriteFiles: number;
  unchangedFiles: number;
  blockedFiles: number;
  missingBackupFiles: number;
  skippedFiles: number;
  bytesToRestore: number;
}

export interface RestoreFilePlan {
  action: RestoreFileAction;
  sourceKind: BackupSourceKind;
  sourceId: string;
  gameId?: string;
  gameTitle?: string;
  restorePath: string;
  backupRelativePath: string;
  sizeBytes: number;
  sha256: string;
  message: string;
}

export interface RestorePlanPreview {
  targetPath: string;
  manifestPath: string;
  manifestId: string;
  createdAt: string;
  summary: RestoreSummary;
  files: RestoreFilePlan[];
}

export interface RestoreExecutionResult {
  success: boolean;
  manifestId: string;
  summary: RestoreSummary;
  restoredFiles: string[];
  backedUpFiles: string[];
  skippedFiles: string[];
  failedFiles: string[];
  message: string;
}
