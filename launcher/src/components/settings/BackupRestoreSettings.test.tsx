import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { isTauri } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEYS } from "../../lib/storage-keys";
import type { DiskInfo } from "../../lib/types";
import { BackupRestoreSettings } from "./BackupRestoreSettings";

const launcherMocks = vi.hoisted(() => ({
  ejectBackupExternalDrive: vi.fn(),
  getBackupSchedulerStatus: vi.fn(),
  getDiskInfo: vi.fn(),
  getLatestBackupStatus: vi.fn(),
  installBackupScheduler: vi.fn(),
  proveBackupExternalDriveEjectSafety: vi.fn(),
  proveBackupExternalDriveWrite: vi.fn(),
  previewBackupPlan: vi.fn(),
  previewRestorePlan: vi.fn(),
  restoreBackup: vi.fn(),
  runBackupPlan: vi.fn(),
  runBackupSchedulerNow: vi.fn(),
  saveBackupSchedulerConfig: vi.fn(),
  uninstallBackupScheduler: vi.fn(),
}));

vi.mock("../../lib/launcher", () => launcherMocks);

vi.mock("@tauri-apps/plugin-autostart", () => ({
  disable: vi.fn(() => Promise.resolve()),
  enable: vi.fn(() => Promise.resolve()),
  isEnabled: vi.fn(() => Promise.resolve(false)),
}));

describe("BackupRestoreSettings external-drive scan", () => {
  beforeEach(() => {
    vi.mocked(isTauri).mockReturnValue(true);
    launcherMocks.ejectBackupExternalDrive.mockReset();
    launcherMocks.getBackupSchedulerStatus.mockResolvedValue({
      config: null,
      configPath: "/tmp/og-backup-scheduler.toml",
      installed: false,
      lastRun: null,
      message: "Scheduler available.",
      provider: "systemd-user",
      statusPath: "/tmp/og-backup-scheduler-status.json",
      supported: true,
    });
    launcherMocks.getDiskInfo.mockReset();
    launcherMocks.getLatestBackupStatus.mockReset();
    launcherMocks.installBackupScheduler.mockReset();
    launcherMocks.proveBackupExternalDriveEjectSafety.mockReset();
    launcherMocks.proveBackupExternalDriveWrite.mockReset();
    launcherMocks.previewBackupPlan.mockReset();
    launcherMocks.previewRestorePlan.mockReset();
    launcherMocks.restoreBackup.mockReset();
    launcherMocks.runBackupPlan.mockReset();
    launcherMocks.runBackupSchedulerNow.mockReset();
    launcherMocks.saveBackupSchedulerConfig.mockReset();
    launcherMocks.uninstallBackupScheduler.mockReset();

    window.localStorage.setItem(
      STORAGE_KEYS.BACKUP_REMINDER_SETTINGS,
      JSON.stringify({
        autoRunWhenDue: false,
        cadence: "weekly",
        compression: "none",
        enabled: true,
        includeLibraryData: true,
        lastRunAt: null,
        nextDueAt: "2026-06-18T10:00:00.000Z",
        snoozedUntil: null,
        targetPath: "/media/usb/OG-Backups",
        updatedAt: "2026-06-11T10:00:00.000Z",
      }),
    );
  });

  it("refreshes removable-drive detection when native disk rows change", async () => {
    launcherMocks.getDiskInfo
      .mockResolvedValueOnce([
        makeDisk({ mountPoint: "/media/other", name: "OTHER_USB", isRemovable: true }),
      ])
      .mockResolvedValueOnce([
        makeDisk({ mountPoint: "/media/usb", name: "USB_READY", isRemovable: true }),
      ]);

    render(<BackupRestoreSettings showExternalDriveReadiness />);

    await waitFor(() => expect(launcherMocks.getDiskInfo).toHaveBeenCalledTimes(1));

    expect(screen.getByText(/1 disk scanned; no removable target matched/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /refresh drives/i }));

    await waitFor(() => expect(launcherMocks.getDiskInfo).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/USB_READY is mounted at \/media\/usb/i)).toBeInTheDocument();
    expect(screen.getByText(/USB_READY matched at \/media\/usb/i)).toBeInTheDocument();
  });

  it("renders write-proof fixture without live disk refresh or filesystem proof command", async () => {
    render(<BackupRestoreSettings externalDriveWriteProofFixture showExternalDriveReadiness />);

    expect(
      screen.getAllByText(/sentinel write\/read\/checksum\/delete proof/i).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Sentinel Write Proof")).toBeInTheDocument();
    expect(screen.getByText("fixture-write-proof-20260611")).toBeInTheDocument();
    expect(screen.getByText(/restore and cross-OS E2E stay blocked/i)).toBeInTheDocument();

    await waitFor(() => expect(launcherMocks.getBackupSchedulerStatus).toHaveBeenCalled());
    expect(launcherMocks.getDiskInfo).not.toHaveBeenCalled();
    expect(launcherMocks.ejectBackupExternalDrive).not.toHaveBeenCalled();
    expect(launcherMocks.proveBackupExternalDriveEjectSafety).not.toHaveBeenCalled();
    expect(launcherMocks.proveBackupExternalDriveWrite).not.toHaveBeenCalled();
  });

  it("renders eject-safety fixture without live disk refresh or filesystem proof command", async () => {
    render(<BackupRestoreSettings externalDriveEjectSafetyFixture showExternalDriveReadiness />);

    expect(screen.getAllByText(/write proof plus eject-safety preflight/i).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("Sentinel Write Proof")).toBeInTheDocument();
    expect(screen.getAllByText("Eject-Safety Proof").length).toBeGreaterThan(0);
    expect(screen.getByText("fixture-eject-proof-20260611")).toBeInTheDocument();
    expect(
      screen.getByText(/OS eject execution, and cross-OS E2E stay blocked/i),
    ).toBeInTheDocument();

    await waitFor(() => expect(launcherMocks.getBackupSchedulerStatus).toHaveBeenCalled());
    expect(launcherMocks.getDiskInfo).not.toHaveBeenCalled();
    expect(launcherMocks.ejectBackupExternalDrive).not.toHaveBeenCalled();
    expect(launcherMocks.proveBackupExternalDriveEjectSafety).not.toHaveBeenCalled();
    expect(launcherMocks.proveBackupExternalDriveWrite).not.toHaveBeenCalled();
  });

  it("renders OS eject fixture without live disk refresh or filesystem command", async () => {
    render(<BackupRestoreSettings externalDriveOsEjectFixture showExternalDriveReadiness />);

    expect(
      screen.getByText(/write proof, eject-safety preflight, and local OS unmount/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("OS Eject / Unmount").length).toBeGreaterThan(0);
    expect(screen.getByText("fixture-final-preflight-20260611")).toBeInTheDocument();
    expect(screen.getByText(/restore and cross-OS E2E stay blocked/i)).toBeInTheDocument();

    await waitFor(() => expect(launcherMocks.getBackupSchedulerStatus).toHaveBeenCalled());
    expect(launcherMocks.getDiskInfo).not.toHaveBeenCalled();
    expect(launcherMocks.ejectBackupExternalDrive).not.toHaveBeenCalled();
    expect(launcherMocks.proveBackupExternalDriveEjectSafety).not.toHaveBeenCalled();
    expect(launcherMocks.proveBackupExternalDriveWrite).not.toHaveBeenCalled();
  });

  it("runs native removable write proof with mountpoint evidence and explicit consent", async () => {
    launcherMocks.getDiskInfo.mockResolvedValue([
      makeDisk({ mountPoint: "/media/usb", name: "USB_READY", isRemovable: true }),
    ]);
    launcherMocks.proveBackupExternalDriveWrite.mockResolvedValue({
      bytesRead: 80,
      bytesWritten: 80,
      checksumMatched: true,
      cleanupDeleted: true,
      message: "External backup target accepted a sentinel write/read/checksum/delete proof.",
      proofId: "proof-1",
      proofPath: "/media/usb/OG-Backups/.og-backups/proof/write-proof-proof-1.tmp",
      sha256: "abc123",
      success: true,
      targetPath: "/media/usb/OG-Backups",
      verifiedAt: "2026-06-11T10:05:00.000Z",
    });

    render(<BackupRestoreSettings showExternalDriveReadiness />);

    await waitFor(() =>
      expect(screen.getByText(/USB_READY matched at \/media\/usb/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /write proof/i }));

    await waitFor(() =>
      expect(launcherMocks.proveBackupExternalDriveWrite).toHaveBeenCalledWith({
        consent: {
          accepted: true,
          operation: "sentinel_write_read_checksum_delete",
          targetPath: "/media/usb/OG-Backups",
        },
        expectedMountPoint: "/media/usb",
        targetPath: "/media/usb/OG-Backups",
      }),
    );
  });

  it("runs native eject-safety proof with mountpoint evidence and explicit consent", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    launcherMocks.getDiskInfo.mockResolvedValue([
      makeDisk({ mountPoint: "/media/usb", name: "USB_READY", isRemovable: true }),
    ]);
    launcherMocks.proveBackupExternalDriveWrite.mockResolvedValue({
      bytesRead: 80,
      bytesWritten: 80,
      checksumMatched: true,
      cleanupDeleted: true,
      message: "External backup target accepted a sentinel write/read/checksum/delete proof.",
      proofId: "proof-1",
      proofPath: "/media/usb/OG-Backups/.og-backups/proof/write-proof-proof-1.tmp",
      sha256: "abc123",
      success: true,
      targetPath: "/media/usb/OG-Backups",
      verifiedAt: "2026-06-11T10:05:00.000Z",
    });
    launcherMocks.proveBackupExternalDriveEjectSafety.mockResolvedValue({
      bytesRead: 96,
      bytesWritten: 96,
      cleanupDeleted: true,
      directorySyncCompleted: true,
      directorySyncSupported: true,
      diskName: "USB_READY",
      fileSystem: "exfat",
      isReadOnly: false,
      isRemovable: true,
      message:
        "External backup target passed eject-safety preflight; use the OS eject/unmount action next.",
      mountPoint: "/media/usb",
      pendingProofFiles: [],
      proofId: "eject-1",
      proofPath: "/media/usb/OG-Backups/.og-backups/proof/eject-proof-eject-1.tmp",
      readyForOsEject: true,
      recommendedNextStep:
        "Use the operating system eject/unmount action after closing active backup work.",
      sha256: "def456",
      success: true,
      syncCompleted: true,
      targetPath: "/media/usb/OG-Backups",
      verifiedAt: "2026-06-11T10:06:00.000Z",
    });

    try {
      render(<BackupRestoreSettings showExternalDriveReadiness />);

      await waitFor(() =>
        expect(screen.getByText(/USB_READY matched at \/media\/usb/i)).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole("button", { name: /write proof/i }));

      await waitFor(() => expect(launcherMocks.proveBackupExternalDriveWrite).toHaveBeenCalled());
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /eject proof/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole("button", { name: /eject proof/i }));

      await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
      await waitFor(() =>
        expect(launcherMocks.proveBackupExternalDriveEjectSafety).toHaveBeenCalledWith({
          consent: {
            accepted: true,
            operation: "flush_write_delete_before_eject_review",
            targetPath: "/media/usb/OG-Backups",
          },
          expectedMountPoint: "/media/usb",
          targetPath: "/media/usb/OG-Backups",
        }),
      );
      expect(await screen.findByText("eject-1")).toBeInTheDocument();
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it("runs native OS unmount with preflight proof and explicit consent", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    launcherMocks.getDiskInfo.mockResolvedValue([
      makeDisk({ mountPoint: "/media/usb", name: "USB_READY", isRemovable: true }),
    ]);
    launcherMocks.proveBackupExternalDriveWrite.mockResolvedValue({
      bytesRead: 80,
      bytesWritten: 80,
      checksumMatched: true,
      cleanupDeleted: true,
      message: "External backup target accepted a sentinel write/read/checksum/delete proof.",
      proofId: "proof-1",
      proofPath: "/media/usb/OG-Backups/.og-backups/proof/write-proof-proof-1.tmp",
      sha256: "abc123",
      success: true,
      targetPath: "/media/usb/OG-Backups",
      verifiedAt: "2026-06-11T10:05:00.000Z",
    });
    launcherMocks.proveBackupExternalDriveEjectSafety.mockResolvedValue({
      bytesRead: 96,
      bytesWritten: 96,
      cleanupDeleted: true,
      directorySyncCompleted: true,
      directorySyncSupported: true,
      diskName: "USB_READY",
      fileSystem: "exfat",
      isReadOnly: false,
      isRemovable: true,
      message:
        "External backup target passed eject-safety preflight; use the OS eject/unmount action next.",
      mountPoint: "/media/usb",
      pendingProofFiles: [],
      proofId: "eject-1",
      proofPath: "/media/usb/OG-Backups/.og-backups/proof/eject-proof-eject-1.tmp",
      readyForOsEject: true,
      recommendedNextStep:
        "Use the operating system eject/unmount action after closing active backup work.",
      sha256: "def456",
      success: true,
      syncCompleted: true,
      targetPath: "/media/usb/OG-Backups",
      verifiedAt: "2026-06-11T10:06:00.000Z",
    });
    launcherMocks.ejectBackupExternalDrive.mockResolvedValue({
      commandLabel: "udisksctl unmount -b /dev/sdb1",
      diskName: "USB_READY",
      fileSystem: "exfat",
      finalPreflightProofId: "final-eject-1",
      isReadOnly: false,
      isRemovable: true,
      message:
        "External backup target OS eject/unmount completed and the mount is no longer listed.",
      mountPoint: "/media/usb",
      platform: "linux",
      preflightProofId: "eject-1",
      recommendedNextStep:
        "Remove the drive only after the operating system no longer lists the mount.",
      success: true,
      targetPath: "/media/usb/OG-Backups",
      unmounted: true,
      verifiedAt: "2026-06-11T10:07:00.000Z",
    });

    try {
      render(<BackupRestoreSettings showExternalDriveReadiness />);

      await waitFor(() =>
        expect(screen.getByText(/USB_READY matched at \/media\/usb/i)).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole("button", { name: /write proof/i }));
      await waitFor(() => expect(launcherMocks.proveBackupExternalDriveWrite).toHaveBeenCalled());

      fireEvent.click(screen.getByRole("button", { name: /eject proof/i }));
      await waitFor(() =>
        expect(launcherMocks.proveBackupExternalDriveEjectSafety).toHaveBeenCalled(),
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /os unmount/i })).not.toBeDisabled(),
      );
      fireEvent.click(screen.getByRole("button", { name: /os unmount/i }));

      await waitFor(() =>
        expect(launcherMocks.ejectBackupExternalDrive).toHaveBeenCalledWith({
          consent: {
            accepted: true,
            operation: "os_eject_unmount_removable_target",
            targetPath: "/media/usb/OG-Backups",
          },
          expectedMountPoint: "/media/usb",
          preflightProofId: "eject-1",
          targetPath: "/media/usb/OG-Backups",
        }),
      );
      expect(await screen.findByText("final-eject-1")).toBeInTheDocument();
      expect(confirmSpy).toHaveBeenCalledTimes(2);
    } finally {
      confirmSpy.mockRestore();
    }
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
