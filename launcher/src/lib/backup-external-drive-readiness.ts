import type { DiskInfo } from "./types";

export type BackupExternalDriveStatus = "blocked" | "ready" | "warning";

export interface BackupExternalDriveTargetEvidence {
  availableSpace: number;
  fileSystem: string;
  isReadOnly: boolean;
  isRemovable: boolean;
  kind: string;
  mountPoint: string;
  name: string;
  targetPath: string;
  totalSpace: number;
}

export interface BackupExternalDriveReadinessInput {
  crossOsE2EReady: boolean;
  detectedTarget?: BackupExternalDriveTargetEvidence | null;
  externalDriveDetected: boolean;
  headlessTimerReady: boolean;
  manifestPreviewReady: boolean;
  nativeFolderPickerReady: boolean;
  removableMediaEjectProof?: BackupExternalDriveEjectSafetyEvidence | null;
  removableMediaEjectProofReady?: boolean;
  removableMediaOsEject?: BackupExternalDriveOsEjectEvidence | null;
  removableMediaOsEjectReady?: boolean;
  removableMediaWriteProof?: BackupExternalDriveWriteProofEvidence | null;
  removableMediaWriteProofReady: boolean;
  restoreReviewReady: boolean;
  targetFolderReady: boolean;
  windowsNativeEjectReady: boolean;
  zipArchiveReady: boolean;
}

export interface BackupExternalDriveWriteProofEvidence {
  bytesRead: number;
  bytesWritten: number;
  checksumMatched: boolean;
  cleanupDeleted: boolean;
  proofId: string;
  proofPath: string;
  sha256: string;
  targetPath: string;
  verifiedAt: string;
}

export interface BackupExternalDriveEjectSafetyEvidence {
  bytesRead: number;
  bytesWritten: number;
  cleanupDeleted: boolean;
  directorySyncCompleted: boolean;
  directorySyncSupported: boolean;
  pendingProofFiles: string[];
  proofId: string;
  proofPath: string;
  readyForOsEject: boolean;
  recommendedNextStep: string;
  sha256: string;
  syncCompleted: boolean;
  targetPath: string;
  verifiedAt: string;
}

export interface BackupExternalDriveOsEjectEvidence {
  commandLabel: string;
  finalPreflightProofId: string;
  mountPoint: string;
  platform: string;
  preflightProofId: string;
  recommendedNextStep: string;
  targetPath: string;
  unmounted: boolean;
  verifiedAt: string;
}

export interface BackupExternalDriveGate {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: BackupExternalDriveStatus;
}

export interface BackupExternalDriveReadiness {
  blockedCount: number;
  detectedTarget: BackupExternalDriveTargetEvidence | null;
  gates: BackupExternalDriveGate[];
  guardCopy: string;
  guards: string[];
  nextAction: string;
  progress: number;
  readyCount: number;
  removableMediaEjectProof: BackupExternalDriveEjectSafetyEvidence | null;
  removableMediaOsEject: BackupExternalDriveOsEjectEvidence | null;
  removableMediaWriteProof: BackupExternalDriveWriteProofEvidence | null;
  statusLabel: string;
  summary: string;
  warningCount: number;
}

export const BACKUP_EXTERNAL_DRIVE_DETECTION_FIXTURE_TARGET = "/media/og-backup-stick/OG-Backups";

const BACKUP_EXTERNAL_DRIVE_GUARDS = [
  "Local readiness only",
  "No external drive write",
  "No restore run",
  "No removable media proof",
  "No eject-safety proof",
  "No cross-OS E2E proof",
  "No drive format claim",
  "No unattended restore claim",
];

const BACKUP_EXTERNAL_DRIVE_WRITE_PROOF_GUARDS = [
  "Local proof only",
  "Sentinel write/read/delete only",
  "No eject-safety proof",
  "No backup payload write",
  "No restore run",
  "No cross-OS E2E proof",
  "No drive format claim",
  "No unattended restore claim",
];

const BACKUP_EXTERNAL_DRIVE_EJECT_PROOF_GUARDS = [
  "Local proof only",
  "Sentinel flush/read/delete only",
  "No backup payload write",
  "No restore run",
  "No OS eject/unmount execution",
  "No cross-OS E2E proof",
  "No drive format claim",
  "No unattended restore claim",
];

const BACKUP_EXTERNAL_DRIVE_OS_EJECT_GUARDS = [
  "Local platform proof only",
  "OS eject/unmount command succeeded",
  "Mount no longer listed",
  "No backup payload write",
  "No restore run",
  "No cross-OS E2E proof",
  "No drive format claim",
  "No unattended restore claim",
];

const BACKUP_EXTERNAL_DRIVE_GUARD_COPY =
  "External-drive backup readiness is a local review only. This panel can show read-only removable-drive detection from native disk metadata, but it does not write to removable media, execute restore, validate drive format, run cross-OS Windows/macOS/Linux E2E, or claim unattended restore support.";

const BACKUP_EXTERNAL_DRIVE_WRITE_PROOF_GUARD_COPY =
  "External-drive backup readiness has a consented sentinel write/read/checksum/delete proof only. It does not write backup payloads, execute restore, eject media, validate drive format, run cross-OS Windows/macOS/Linux E2E, or claim unattended restore support.";

const BACKUP_EXTERNAL_DRIVE_EJECT_PROOF_GUARD_COPY =
  "External-drive backup readiness has consented write proof plus eject-safety preflight evidence. It flushes a sentinel and confirms cleanup, but it does not execute OS eject/unmount, write backup payloads, run restore, validate drive format, run cross-OS Windows/macOS/Linux E2E, or claim unattended restore support.";

const BACKUP_EXTERNAL_DRIVE_OS_EJECT_GUARD_COPY =
  "External-drive backup readiness has consented write proof, eject-safety preflight, and a local OS eject/unmount result for one platform. It does not write backup payloads, run restore, validate drive format, run cross-OS Windows/macOS/Linux E2E, or claim unattended restore support.";

export function findBackupTargetDisk(
  targetPath: string,
  disks: DiskInfo[],
): BackupExternalDriveTargetEvidence | null {
  const normalizedTarget = normalizeBackupPathForMatch(targetPath);
  if (!normalizedTarget) return null;

  const matchedDisk = disks
    .map((disk) => ({
      disk,
      mountPoint: normalizeBackupPathForMatch(disk.mountPoint),
    }))
    .filter(({ mountPoint }) => mountPoint && isBackupPathInsideMount(normalizedTarget, mountPoint))
    .sort((a, b) => b.mountPoint.length - a.mountPoint.length)[0]?.disk;

  if (!matchedDisk) return null;

  return {
    availableSpace: matchedDisk.availableSpace,
    fileSystem: matchedDisk.fileSystem,
    isReadOnly: matchedDisk.isReadOnly,
    isRemovable: matchedDisk.isRemovable,
    kind: matchedDisk.kind,
    mountPoint: matchedDisk.mountPoint,
    name: matchedDisk.name,
    targetPath: targetPath.trim(),
    totalSpace: matchedDisk.totalSpace,
  };
}

export function buildBackupExternalDriveReadiness(
  input: BackupExternalDriveReadinessInput,
): BackupExternalDriveReadiness {
  const detectedTarget = input.detectedTarget ?? null;
  const removableMediaWriteProof = input.removableMediaWriteProof ?? null;
  const removableMediaEjectProof = input.removableMediaEjectProof ?? null;
  const removableMediaEjectProofReady = input.removableMediaEjectProofReady ?? false;
  const removableMediaOsEject = input.removableMediaOsEject ?? null;
  const removableMediaOsEjectReady = input.removableMediaOsEjectReady ?? false;
  const gates: BackupExternalDriveGate[] = [
    {
      action: input.targetFolderReady
        ? "Keep the target-folder intent visible before external-drive staging."
        : "Choose a backup target folder before any external-drive review.",
      detail: input.targetFolderReady
        ? "The settings UI can stage a backup target path without touching removable media."
        : "No target path is staged for backup review.",
      id: "target-folder",
      label: "Target Folder Intent",
      status: input.targetFolderReady ? "ready" : "blocked",
    },
    {
      action: input.nativeFolderPickerReady
        ? "Use the native folder picker only after user confirmation."
        : "Restore native folder picker coverage before desktop drive staging.",
      detail: input.nativeFolderPickerReady
        ? "The desktop picker can select a folder, while browser preview stays filesystem-safe."
        : "No desktop folder picker evidence is available.",
      id: "native-folder-picker",
      label: "Native Folder Picker",
      status: input.nativeFolderPickerReady ? "ready" : "blocked",
    },
    {
      action: input.manifestPreviewReady
        ? "Keep manifest preview as the dry-run baseline for external-drive backups."
        : "Stage manifest preview before any backup write proof.",
      detail: input.manifestPreviewReady
        ? "Backup source rows and manifest summaries can be reviewed before copy."
        : "No manifest preview evidence is staged.",
      id: "manifest-preview",
      label: "Manifest Preview",
      status: input.manifestPreviewReady ? "ready" : "blocked",
    },
    {
      action: input.restoreReviewReady
        ? "Keep restore review gates blocking unsafe restore work."
        : "Stage restore review before any external-drive restore attempt.",
      detail: input.restoreReviewReady
        ? "Restore plans can surface blocked and missing payload rows before execution."
        : "No restore review gate is available.",
      id: "restore-review",
      label: "Restore Review Gate",
      status: input.restoreReviewReady ? "ready" : "blocked",
    },
    {
      action: input.zipArchiveReady
        ? input.removableMediaWriteProofReady
          ? "Keep ZIP export optional until cross-OS restore evidence exists."
          : "Keep ZIP export optional until external drive write proof exists."
        : "Stage optional archive export for portable backup review.",
      detail: input.zipArchiveReady
        ? "ZIP archive export can be requested as a local backup option."
        : "No archive export path is staged.",
      id: "zip-archive",
      label: "ZIP Archive Option",
      status: input.zipArchiveReady ? "ready" : "blocked",
    },
    {
      action: input.headlessTimerReady
        ? "Keep the OS timer disabled for external drives until mount checks pass."
        : "Stage headless timer status before unattended backup review.",
      detail: input.headlessTimerReady
        ? "Headless timer config/status is visible, but external-drive mount proof is still separate."
        : "No headless timer status evidence is available.",
      id: "headless-timer",
      label: "Headless Timer",
      status: input.headlessTimerReady ? "ready" : "blocked",
    },
    {
      action: input.externalDriveDetected
        ? input.removableMediaWriteProofReady
          ? "Keep mount evidence tied to the captured write proof and cross-OS review."
          : "Keep removable-target evidence read-only until write proof and cross-OS review pass."
        : "Add removable-drive detection with mount, capacity, and safe-path review.",
      detail: input.externalDriveDetected
        ? detectedTarget
          ? input.removableMediaWriteProofReady
            ? `${
                detectedTarget.name || "Removable target"
              } is mounted at ${detectedTarget.mountPoint}; sentinel write/read/checksum/delete proof is captured separately.`
            : `${detectedTarget.name || "Removable target"} is mounted at ${detectedTarget.mountPoint}; no write/read/checksum/eject or restore proof is captured.`
          : "Removable target detection evidence exists, but write/restore remains disabled."
        : "No removable target is matched from native disk metadata in this local readiness state.",
      id: "external-drive-detection",
      label: "External Drive Detection",
      status: input.externalDriveDetected ? "warning" : "blocked",
    },
    {
      action: input.removableMediaWriteProofReady
        ? removableMediaEjectProofReady
          ? "Keep write proof paired with eject-safety preflight evidence."
          : "Run eject-safety preflight before instructing the user to unmount."
        : "Run a staged write/read/checksum/eject proof on consented removable media.",
      detail: input.removableMediaWriteProofReady
        ? removableMediaWriteProof
          ? `Sentinel wrote ${removableMediaWriteProof.bytesWritten} bytes, read ${
              removableMediaWriteProof.bytesRead
            } bytes, ${
              removableMediaWriteProof.checksumMatched ? "matched" : "did not match"
            } SHA-256 ${shortHash(removableMediaWriteProof.sha256)}, and cleanup ${
              removableMediaWriteProof.cleanupDeleted ? "deleted" : "needs review"
            } the proof file.`
          : "Removable write proof exists, but restore and cross-OS gates still need review."
        : "No external drive write/read/checksum proof has been captured.",
      id: "removable-write-proof",
      label: "Removable Media Write Proof",
      status: input.removableMediaWriteProofReady ? "warning" : "blocked",
    },
    {
      action: removableMediaEjectProofReady
        ? removableMediaOsEjectReady
          ? "Keep OS eject/unmount evidence attached to the preflight proof."
          : "Use the operating system eject/unmount action after closing active backup work."
        : "Run flush/read/delete eject-safety preflight after write proof succeeds.",
      detail: removableMediaEjectProofReady
        ? removableMediaEjectProof
          ? `Eject preflight wrote ${removableMediaEjectProof.bytesWritten} bytes, synced ${
              removableMediaEjectProof.syncCompleted ? "successfully" : "with review needed"
            }, deleted cleanup ${
              removableMediaEjectProof.cleanupDeleted ? "successfully" : "with review needed"
            }, and found ${removableMediaEjectProof.pendingProofFiles.length} pending proof files.`
          : "Eject-safety proof exists, but OS eject/unmount remains a manual platform action."
        : "No flush/read/delete eject-safety proof is captured for removable media.",
      id: "eject-safety-proof",
      label: "Eject-Safety Proof",
      status: removableMediaEjectProofReady ? "warning" : "blocked",
    },
    {
      action: input.windowsNativeEjectReady
        ? removableMediaOsEjectReady
          ? "Keep Windows eject coverage separate from the captured local platform result."
          : "Keep Windows eject backend behind consent, eject-safety preflight, and mount disappearance verification."
        : "Add Windows drive-letter eject backend before claiming platform command coverage.",
      detail: input.windowsNativeEjectReady
        ? "Windows removable-drive eject has a drive-letter Win32_Volume.Dismount command path; real Windows hardware E2E remains separate."
        : "No Windows OS eject command path is available.",
      id: "windows-native-eject",
      label: "Windows Eject Backend",
      status: input.windowsNativeEjectReady ? "ready" : "blocked",
    },
    {
      action: removableMediaOsEjectReady
        ? "Keep cross-OS backup/restore E2E blocked until every target platform is verified."
        : "Run OS eject/unmount only after eject-safety preflight succeeds.",
      detail: removableMediaOsEjectReady
        ? removableMediaOsEject
          ? `${removableMediaOsEject.commandLabel} completed on ${removableMediaOsEject.platform}; ${removableMediaOsEject.mountPoint} is no longer listed.`
          : "OS eject/unmount evidence exists, but cross-OS backup/restore E2E remains blocked."
        : "No OS eject/unmount command result is captured for removable media.",
      id: "os-eject-unmount",
      label: "OS Eject / Unmount",
      status: removableMediaOsEjectReady ? "warning" : "blocked",
    },
    {
      action: input.crossOsE2EReady
        ? "Keep OS-specific evidence attached before any production rollout."
        : "Run Windows, macOS, and Linux external-drive backup/restore E2E with screenshots.",
      detail: input.crossOsE2EReady
        ? "Cross-OS evidence exists, but this panel still does not execute backup or restore."
        : "No Windows/macOS/Linux external-drive backup and restore E2E has passed.",
      id: "cross-os-e2e",
      label: "Cross-OS External Drive E2E",
      status: input.crossOsE2EReady ? "warning" : "blocked",
    },
  ];
  const readyCount = gates.filter((gate) => gate.status === "ready").length;
  const warningCount = gates.filter((gate) => gate.status === "warning").length;
  const blockedCount = gates.filter((gate) => gate.status === "blocked").length;
  const nextGate =
    gates.find((gate) => gate.status === "blocked") ??
    gates.find((gate) => gate.status === "warning") ??
    null;

  return {
    blockedCount,
    detectedTarget,
    gates,
    guardCopy: removableMediaOsEjectReady
      ? BACKUP_EXTERNAL_DRIVE_OS_EJECT_GUARD_COPY
      : removableMediaEjectProofReady
        ? BACKUP_EXTERNAL_DRIVE_EJECT_PROOF_GUARD_COPY
        : input.removableMediaWriteProofReady
          ? BACKUP_EXTERNAL_DRIVE_WRITE_PROOF_GUARD_COPY
          : BACKUP_EXTERNAL_DRIVE_GUARD_COPY,
    guards: removableMediaOsEjectReady
      ? [...BACKUP_EXTERNAL_DRIVE_OS_EJECT_GUARDS]
      : removableMediaEjectProofReady
        ? [...BACKUP_EXTERNAL_DRIVE_EJECT_PROOF_GUARDS]
        : input.removableMediaWriteProofReady
          ? [...BACKUP_EXTERNAL_DRIVE_WRITE_PROOF_GUARDS]
          : [...BACKUP_EXTERNAL_DRIVE_GUARDS],
    nextAction: nextGate?.action ?? "External-drive backup E2E can enter controlled staging.",
    progress: Math.round((readyCount / gates.length) * 100),
    readyCount,
    removableMediaEjectProof,
    removableMediaOsEject,
    removableMediaWriteProof,
    statusLabel:
      blockedCount > 0 ? "Local only" : warningCount > 0 ? "Needs staging" : "Review ready",
    summary:
      blockedCount > 0
        ? input.externalDriveDetected
          ? removableMediaEjectProofReady
            ? removableMediaOsEjectReady
              ? "Backup/Restore has local preview, restore review, ZIP, reminders, picker, timer, removable-target detection, write proof, eject-safety preflight, and local OS eject/unmount evidence; Windows/macOS/Linux E2E remains open."
              : "Backup/Restore has local preview, restore review, ZIP, reminders, picker, timer, Windows eject backend, removable-target detection, write proof, and eject-safety preflight; OS eject/unmount and Windows/macOS/Linux E2E remain open."
            : input.removableMediaWriteProofReady
              ? "Backup/Restore has local preview, restore review, ZIP, reminders, picker, timer, Windows eject backend, read-only removable-target detection evidence, and removable-media sentinel write/read/checksum/delete proof; eject-safety and Windows/macOS/Linux E2E remain open."
              : "Backup/Restore has local preview, restore review, ZIP, reminders, picker, timer, Windows eject backend, and read-only removable-target detection evidence, but removable-media write proof and Windows/macOS/Linux E2E remain open."
          : "Backup/Restore has local preview, restore review, ZIP, reminders, picker, timer, and Windows eject backend evidence, but external-drive detection, removable-media write proof, and Windows/macOS/Linux E2E remain open."
        : warningCount > 0
          ? "External-drive staging evidence exists, but write/restore execution still needs review."
          : "External-drive backup E2E can enter controlled staging.",
    warningCount,
  };
}

function shortHash(hash: string) {
  return hash.length > 12 ? `${hash.slice(0, 12)}...` : hash;
}

export function createVerifyBackupExternalDriveReadiness(): BackupExternalDriveReadiness {
  return buildBackupExternalDriveReadiness({
    crossOsE2EReady: false,
    externalDriveDetected: false,
    headlessTimerReady: true,
    manifestPreviewReady: true,
    nativeFolderPickerReady: true,
    removableMediaWriteProofReady: false,
    restoreReviewReady: true,
    targetFolderReady: true,
    windowsNativeEjectReady: true,
    zipArchiveReady: true,
  });
}

export function createVerifyBackupExternalDriveDetectionReadiness(): BackupExternalDriveReadiness {
  const detectedTarget: BackupExternalDriveTargetEvidence = {
    availableSpace: 256 * 1024 * 1024 * 1024,
    fileSystem: "exfat",
    isReadOnly: false,
    isRemovable: true,
    kind: "SSD",
    mountPoint: "/media/og-backup-stick",
    name: "OG_BACKUP_USB",
    targetPath: BACKUP_EXTERNAL_DRIVE_DETECTION_FIXTURE_TARGET,
    totalSpace: 512 * 1024 * 1024 * 1024,
  };

  return buildBackupExternalDriveReadiness({
    crossOsE2EReady: false,
    detectedTarget,
    externalDriveDetected: true,
    headlessTimerReady: true,
    manifestPreviewReady: true,
    nativeFolderPickerReady: true,
    removableMediaWriteProofReady: false,
    restoreReviewReady: true,
    targetFolderReady: true,
    windowsNativeEjectReady: true,
    zipArchiveReady: true,
  });
}

export function createVerifyBackupExternalDriveWriteProofReadiness(): BackupExternalDriveReadiness {
  const detectedTarget: BackupExternalDriveTargetEvidence = {
    availableSpace: 240 * 1024 * 1024 * 1024,
    fileSystem: "exfat",
    isReadOnly: false,
    isRemovable: true,
    kind: "SSD",
    mountPoint: "/media/og-backup-stick",
    name: "OG_BACKUP_USB",
    targetPath: BACKUP_EXTERNAL_DRIVE_DETECTION_FIXTURE_TARGET,
    totalSpace: 512 * 1024 * 1024 * 1024,
  };
  const proof: BackupExternalDriveWriteProofEvidence = {
    bytesRead: 142,
    bytesWritten: 142,
    checksumMatched: true,
    cleanupDeleted: true,
    proofId: "fixture-write-proof-20260611",
    proofPath:
      "/media/og-backup-stick/OG-Backups/.og-launcher-backups/proof/write-proof-fixture.tmp",
    sha256: "08d9d4e1d514f407d7b0d86e6484d7d3b83f7f7612e08fe31b7b3e3f56153c77",
    targetPath: BACKUP_EXTERNAL_DRIVE_DETECTION_FIXTURE_TARGET,
    verifiedAt: "2026-06-11T20:00:00.000Z",
  };

  return buildBackupExternalDriveReadiness({
    crossOsE2EReady: false,
    detectedTarget,
    externalDriveDetected: true,
    headlessTimerReady: true,
    manifestPreviewReady: true,
    nativeFolderPickerReady: true,
    removableMediaWriteProof: proof,
    removableMediaWriteProofReady: true,
    restoreReviewReady: true,
    targetFolderReady: true,
    windowsNativeEjectReady: true,
    zipArchiveReady: true,
  });
}

export function createVerifyBackupExternalDriveEjectSafetyReadiness(): BackupExternalDriveReadiness {
  const detectedTarget: BackupExternalDriveTargetEvidence = {
    availableSpace: 238 * 1024 * 1024 * 1024,
    fileSystem: "exfat",
    isReadOnly: false,
    isRemovable: true,
    kind: "SSD",
    mountPoint: "/media/og-backup-stick",
    name: "OG_BACKUP_USB",
    targetPath: BACKUP_EXTERNAL_DRIVE_DETECTION_FIXTURE_TARGET,
    totalSpace: 512 * 1024 * 1024 * 1024,
  };
  const writeProof: BackupExternalDriveWriteProofEvidence = {
    bytesRead: 142,
    bytesWritten: 142,
    checksumMatched: true,
    cleanupDeleted: true,
    proofId: "fixture-write-proof-20260611",
    proofPath:
      "/media/og-backup-stick/OG-Backups/.og-launcher-backups/proof/write-proof-fixture.tmp",
    sha256: "08d9d4e1d514f407d7b0d86e6484d7d3b83f7f7612e08fe31b7b3e3f56153c77",
    targetPath: BACKUP_EXTERNAL_DRIVE_DETECTION_FIXTURE_TARGET,
    verifiedAt: "2026-06-11T20:00:00.000Z",
  };
  const ejectProof: BackupExternalDriveEjectSafetyEvidence = {
    bytesRead: 172,
    bytesWritten: 172,
    cleanupDeleted: true,
    directorySyncCompleted: true,
    directorySyncSupported: true,
    pendingProofFiles: [],
    proofId: "fixture-eject-proof-20260611",
    proofPath:
      "/media/og-backup-stick/OG-Backups/.og-launcher-backups/proof/eject-proof-fixture.tmp",
    readyForOsEject: true,
    recommendedNextStep:
      "Use the operating system eject/unmount action after closing active backup work.",
    sha256: "5f9bd5ab0eaf28f8d215885798c08868c1163a4da2ac65d84a4c8f9b9a1ff03c",
    syncCompleted: true,
    targetPath: BACKUP_EXTERNAL_DRIVE_DETECTION_FIXTURE_TARGET,
    verifiedAt: "2026-06-11T20:05:00.000Z",
  };

  return buildBackupExternalDriveReadiness({
    crossOsE2EReady: false,
    detectedTarget,
    externalDriveDetected: true,
    headlessTimerReady: true,
    manifestPreviewReady: true,
    nativeFolderPickerReady: true,
    removableMediaEjectProof: ejectProof,
    removableMediaEjectProofReady: true,
    removableMediaWriteProof: writeProof,
    removableMediaWriteProofReady: true,
    restoreReviewReady: true,
    targetFolderReady: true,
    windowsNativeEjectReady: true,
    zipArchiveReady: true,
  });
}

export function createVerifyBackupExternalDriveOsEjectReadiness(): BackupExternalDriveReadiness {
  const detectedTarget: BackupExternalDriveTargetEvidence = {
    availableSpace: 238 * 1024 * 1024 * 1024,
    fileSystem: "exfat",
    isReadOnly: false,
    isRemovable: true,
    kind: "SSD",
    mountPoint: "/media/og-backup-stick",
    name: "OG_BACKUP_USB",
    targetPath: BACKUP_EXTERNAL_DRIVE_DETECTION_FIXTURE_TARGET,
    totalSpace: 512 * 1024 * 1024 * 1024,
  };
  const writeProof: BackupExternalDriveWriteProofEvidence = {
    bytesRead: 142,
    bytesWritten: 142,
    checksumMatched: true,
    cleanupDeleted: true,
    proofId: "fixture-write-proof-20260611",
    proofPath:
      "/media/og-backup-stick/OG-Backups/.og-launcher-backups/proof/write-proof-fixture.tmp",
    sha256: "08d9d4e1d514f407d7b0d86e6484d7d3b83f7f7612e08fe31b7b3e3f56153c77",
    targetPath: BACKUP_EXTERNAL_DRIVE_DETECTION_FIXTURE_TARGET,
    verifiedAt: "2026-06-11T20:00:00.000Z",
  };
  const ejectProof: BackupExternalDriveEjectSafetyEvidence = {
    bytesRead: 172,
    bytesWritten: 172,
    cleanupDeleted: true,
    directorySyncCompleted: true,
    directorySyncSupported: true,
    pendingProofFiles: [],
    proofId: "fixture-eject-proof-20260611",
    proofPath:
      "/media/og-backup-stick/OG-Backups/.og-launcher-backups/proof/eject-proof-fixture.tmp",
    readyForOsEject: true,
    recommendedNextStep:
      "Use the operating system eject/unmount action after closing active backup work.",
    sha256: "5f9bd5ab0eaf28f8d215885798c08868c1163a4da2ac65d84a4c8f9b9a1ff03c",
    syncCompleted: true,
    targetPath: BACKUP_EXTERNAL_DRIVE_DETECTION_FIXTURE_TARGET,
    verifiedAt: "2026-06-11T20:05:00.000Z",
  };
  const osEject: BackupExternalDriveOsEjectEvidence = {
    commandLabel: "udisksctl unmount -b /dev/sdb1",
    finalPreflightProofId: "fixture-final-preflight-20260611",
    mountPoint: "/media/og-backup-stick",
    platform: "linux",
    preflightProofId: "fixture-eject-proof-20260611",
    recommendedNextStep:
      "Remove the drive only after the operating system no longer lists the mount.",
    targetPath: BACKUP_EXTERNAL_DRIVE_DETECTION_FIXTURE_TARGET,
    unmounted: true,
    verifiedAt: "2026-06-11T20:06:00.000Z",
  };

  return buildBackupExternalDriveReadiness({
    crossOsE2EReady: false,
    detectedTarget,
    externalDriveDetected: true,
    headlessTimerReady: true,
    manifestPreviewReady: true,
    nativeFolderPickerReady: true,
    removableMediaEjectProof: ejectProof,
    removableMediaEjectProofReady: true,
    removableMediaOsEject: osEject,
    removableMediaOsEjectReady: true,
    removableMediaWriteProof: writeProof,
    removableMediaWriteProofReady: true,
    restoreReviewReady: true,
    targetFolderReady: true,
    windowsNativeEjectReady: true,
    zipArchiveReady: true,
  });
}

function normalizeBackupPathForMatch(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return "";

  const withForwardSlashes = trimmed.replace(/\\/g, "/");
  const isUncPath = withForwardSlashes.startsWith("//");
  const collapsed = isUncPath
    ? `//${withForwardSlashes.slice(2).replace(/\/+/g, "/")}`
    : withForwardSlashes.replace(/\/+/g, "/");
  const normalized = trimTrailingBackupSlash(collapsed);

  return isCaseInsensitiveBackupPath(normalized) ? normalized.toLowerCase() : normalized;
}

function trimTrailingBackupSlash(path: string) {
  if (path === "/") return path;
  if (/^[A-Za-z]:\/$/.test(path)) return path.slice(0, 2);
  return path.replace(/\/+$/g, "");
}

function isCaseInsensitiveBackupPath(path: string) {
  return /^[A-Za-z]:($|\/)/.test(path) || path.startsWith("//");
}

function isBackupPathInsideMount(targetPath: string, mountPoint: string) {
  if (!mountPoint) return false;
  if (targetPath === mountPoint) return true;
  const mountWithSlash = mountPoint.endsWith("/") ? mountPoint : `${mountPoint}/`;
  return targetPath.startsWith(mountWithSlash);
}
