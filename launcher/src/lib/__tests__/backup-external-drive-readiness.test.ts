import { describe, expect, it } from "vitest";

import {
  buildBackupExternalDriveReadiness,
  createVerifyBackupExternalDriveDetectionReadiness,
  createVerifyBackupExternalDriveEjectSafetyReadiness,
  createVerifyBackupExternalDriveOsEjectReadiness,
  createVerifyBackupExternalDriveReadiness,
  createVerifyBackupExternalDriveWriteProofReadiness,
  findBackupTargetDisk,
} from "../backup-external-drive-readiness";
import type { DiskInfo } from "../types";

describe("buildBackupExternalDriveReadiness", () => {
  it("keeps external-drive E2E blocked for the verification fixture", () => {
    const readiness = createVerifyBackupExternalDriveReadiness();

    expect(readiness.statusLabel).toBe("Local only");
    expect(readiness.readyCount).toBe(7);
    expect(readiness.blockedCount).toBe(5);
    expect(readiness.progress).toBe(58);
    expect(readiness.guards).toContain("No external drive write");
    expect(readiness.guards).toContain("No restore run");
    expect(readiness.guards).toContain("No removable media proof");
    expect(readiness.guards).toContain("No eject-safety proof");
    expect(readiness.guards).toContain("No cross-OS E2E proof");
    expect(readiness.gates.map((gate) => gate.label)).toEqual([
      "Target Folder Intent",
      "Native Folder Picker",
      "Manifest Preview",
      "Restore Review Gate",
      "ZIP Archive Option",
      "Headless Timer",
      "External Drive Detection",
      "Removable Media Write Proof",
      "Eject-Safety Proof",
      "Windows Eject Backend",
      "OS Eject / Unmount",
      "Cross-OS External Drive E2E",
    ]);
  });

  it("does not report controlled staging until external media proof exists", () => {
    const readiness = buildBackupExternalDriveReadiness({
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

    expect(readiness.summary).toContain("external-drive detection");
    expect(readiness.summary).toContain("Windows/macOS/Linux E2E");
    expect(readiness.nextAction).toContain("Add removable-drive detection");
    expect(readiness.guardCopy).toContain("does not write to removable media");
  });

  it("matches the longest mounted removable disk for a target path", () => {
    const matched = findBackupTargetDisk("/media/usb/games/OG-Backups", [
      makeDisk({ mountPoint: "/media/usb", name: "USB", isRemovable: true }),
      makeDisk({ mountPoint: "/media/usb/games", name: "USB_GAMES", isRemovable: true }),
      makeDisk({ mountPoint: "/media/usb2", name: "OTHER_USB", isRemovable: true }),
    ]);

    expect(matched).toMatchObject({
      isRemovable: true,
      mountPoint: "/media/usb/games",
      name: "USB_GAMES",
      targetPath: "/media/usb/games/OG-Backups",
    });
  });

  it("matches Windows drive paths case-insensitively without prefix bleed", () => {
    expect(
      findBackupTargetDisk("d:\\OG-Backups", [
        makeDisk({ mountPoint: "C:\\", name: "System", isRemovable: false }),
        makeDisk({ mountPoint: "D:\\", name: "USB_D", isRemovable: true }),
      ]),
    ).toMatchObject({ name: "USB_D" });

    expect(
      findBackupTargetDisk("D:\\Backup", [
        makeDisk({ mountPoint: "D:\\Back", name: "Wrong Prefix", isRemovable: true }),
      ]),
    ).toBeNull();
  });

  it("keeps POSIX mount matching case-sensitive", () => {
    expect(
      findBackupTargetDisk("/media/usb/OG-Backups", [
        makeDisk({ mountPoint: "/media/USB", name: "Upper USB", isRemovable: true }),
      ]),
    ).toBeNull();

    expect(
      findBackupTargetDisk("/media/USB/OG-Backups", [
        makeDisk({ mountPoint: "/media/USB", name: "Upper USB", isRemovable: true }),
      ]),
    ).toMatchObject({ name: "Upper USB" });
  });

  it("keeps removable detection as warning while write and cross-OS proof remain blocked", () => {
    const readiness = createVerifyBackupExternalDriveDetectionReadiness();

    expect(readiness.readyCount).toBe(7);
    expect(readiness.warningCount).toBe(1);
    expect(readiness.blockedCount).toBe(4);
    expect(readiness.gates.find((gate) => gate.id === "windows-native-eject")?.status).toBe(
      "ready",
    );
    expect(readiness.gates.find((gate) => gate.id === "external-drive-detection")?.status).toBe(
      "warning",
    );
    expect(readiness.gates.find((gate) => gate.id === "removable-write-proof")?.status).toBe(
      "blocked",
    );
    expect(readiness.gates.find((gate) => gate.id === "eject-safety-proof")?.status).toBe(
      "blocked",
    );
    expect(readiness.gates.find((gate) => gate.id === "os-eject-unmount")?.status).toBe("blocked");
    expect(readiness.gates.find((gate) => gate.id === "cross-os-e2e")?.status).toBe("blocked");
    expect(readiness.detectedTarget).toMatchObject({
      isRemovable: true,
      mountPoint: "/media/og-backup-stick",
      name: "OG_BACKUP_USB",
    });
  });

  it("keeps write proof as local staging while cross-OS E2E remains blocked", () => {
    const readiness = createVerifyBackupExternalDriveWriteProofReadiness();

    expect(readiness.readyCount).toBe(7);
    expect(readiness.warningCount).toBe(2);
    expect(readiness.blockedCount).toBe(3);
    expect(readiness.gates.find((gate) => gate.id === "external-drive-detection")?.status).toBe(
      "warning",
    );
    expect(readiness.gates.find((gate) => gate.id === "removable-write-proof")?.status).toBe(
      "warning",
    );
    expect(readiness.gates.find((gate) => gate.id === "eject-safety-proof")?.status).toBe(
      "blocked",
    );
    expect(readiness.gates.find((gate) => gate.id === "os-eject-unmount")?.status).toBe("blocked");
    expect(readiness.gates.find((gate) => gate.id === "cross-os-e2e")?.status).toBe("blocked");
    expect(readiness.removableMediaWriteProof).toMatchObject({
      bytesRead: 142,
      bytesWritten: 142,
      checksumMatched: true,
      cleanupDeleted: true,
      proofId: "fixture-write-proof-20260611",
    });
    expect(readiness.guards).toContain("Sentinel write/read/delete only");
    expect(readiness.guards).toContain("No eject-safety proof");
    expect(readiness.guards).toContain("No backup payload write");
    expect(readiness.guards).toContain("No restore run");
    expect(readiness.guards).toContain("No cross-OS E2E proof");
    expect(readiness.guards).not.toContain("No external drive write");
  });

  it("keeps eject-safety proof as OS handoff while cross-OS E2E remains blocked", () => {
    const readiness = createVerifyBackupExternalDriveEjectSafetyReadiness();

    expect(readiness.readyCount).toBe(7);
    expect(readiness.warningCount).toBe(3);
    expect(readiness.blockedCount).toBe(2);
    expect(readiness.gates.find((gate) => gate.id === "external-drive-detection")?.status).toBe(
      "warning",
    );
    expect(readiness.gates.find((gate) => gate.id === "removable-write-proof")?.status).toBe(
      "warning",
    );
    expect(readiness.gates.find((gate) => gate.id === "eject-safety-proof")?.status).toBe(
      "warning",
    );
    expect(readiness.gates.find((gate) => gate.id === "os-eject-unmount")?.status).toBe("blocked");
    expect(readiness.gates.find((gate) => gate.id === "cross-os-e2e")?.status).toBe("blocked");
    expect(readiness.removableMediaEjectProof).toMatchObject({
      cleanupDeleted: true,
      proofId: "fixture-eject-proof-20260611",
      readyForOsEject: true,
      syncCompleted: true,
    });
    expect(readiness.guards).toContain("Sentinel flush/read/delete only");
    expect(readiness.guards).toContain("No OS eject/unmount execution");
    expect(readiness.guards).toContain("No cross-OS E2E proof");
    expect(readiness.guards).not.toContain("No eject-safety proof");
  });

  it("keeps OS eject evidence local while cross-OS E2E remains blocked", () => {
    const readiness = createVerifyBackupExternalDriveOsEjectReadiness();

    expect(readiness.readyCount).toBe(7);
    expect(readiness.warningCount).toBe(4);
    expect(readiness.blockedCount).toBe(1);
    expect(readiness.gates.find((gate) => gate.id === "windows-native-eject")?.status).toBe(
      "ready",
    );
    expect(readiness.gates.find((gate) => gate.id === "os-eject-unmount")?.status).toBe("warning");
    expect(readiness.gates.find((gate) => gate.id === "cross-os-e2e")?.status).toBe("blocked");
    expect(readiness.removableMediaOsEject).toMatchObject({
      commandLabel: "udisksctl unmount -b /dev/sdb1",
      platform: "linux",
      unmounted: true,
    });
    expect(readiness.guards).toContain("OS eject/unmount command succeeded");
    expect(readiness.guards).toContain("Mount no longer listed");
    expect(readiness.guards).toContain("No cross-OS E2E proof");
    expect(readiness.guards).not.toContain("No OS eject/unmount execution");
  });
});

function makeDisk(patch: Partial<DiskInfo> = {}): DiskInfo {
  return {
    availableSpace: 128,
    fileSystem: "exfat",
    isReadOnly: false,
    isRemovable: false,
    kind: "SSD",
    mountPoint: "/",
    name: "disk",
    totalSpace: 256,
    ...patch,
  };
}
