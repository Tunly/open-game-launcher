import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createVerifyBackupExternalDriveDetectionReadiness,
  createVerifyBackupExternalDriveEjectSafetyReadiness,
  createVerifyBackupExternalDriveOsEjectReadiness,
  createVerifyBackupExternalDriveReadiness,
  createVerifyBackupExternalDriveWriteProofReadiness,
} from "../../lib/backup-external-drive-readiness";
import { BackupExternalDriveReadinessPanel } from "./BackupExternalDriveReadinessPanel";

describe("BackupExternalDriveReadinessPanel", () => {
  it("renders local external-drive gates without write, restore, or E2E claims", () => {
    render(
      <BackupExternalDriveReadinessPanel readiness={createVerifyBackupExternalDriveReadiness()} />,
    );

    const panel = screen.getByRole("region", { name: /backup external drive readiness/i });

    expect(within(panel).getByText("External Drive Backup Readiness")).toBeInTheDocument();
    expect(within(panel).getByText("Target Folder Intent")).toBeInTheDocument();
    expect(within(panel).getByText("Native Folder Picker")).toBeInTheDocument();
    expect(within(panel).getByText("Manifest Preview")).toBeInTheDocument();
    expect(within(panel).getByText("Restore Review Gate")).toBeInTheDocument();
    expect(within(panel).getByText("ZIP Archive Option")).toBeInTheDocument();
    expect(within(panel).getByText("Headless Timer")).toBeInTheDocument();
    expect(within(panel).getByText("External Drive Detection")).toBeInTheDocument();
    expect(within(panel).getByText("Removable Media Write Proof")).toBeInTheDocument();
    expect(within(panel).getByText("Eject-Safety Proof")).toBeInTheDocument();
    expect(within(panel).getByText("Windows Eject Backend")).toBeInTheDocument();
    expect(within(panel).getByText("OS Eject / Unmount")).toBeInTheDocument();
    expect(within(panel).getByText("Cross-OS External Drive E2E")).toBeInTheDocument();
    expect(within(panel).getByText("No external drive write")).toBeInTheDocument();
    expect(within(panel).getByText("No restore run")).toBeInTheDocument();
    expect(within(panel).getByText("No removable media proof")).toBeInTheDocument();
    expect(within(panel).getByText("No eject-safety proof")).toBeInTheDocument();
    expect(within(panel).getByText("No cross-OS E2E proof")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /external drive (verified|ready\b|written)|restore (completed|executed|ready\b)|cross-os e2e (passed|verified|ready\b)|removable media (proven|verified|written)|drive format (verified|ready\b)|unattended restore (safe\b|ready\b)/i,
    );
  });

  it("renders removable target detection without write, restore, or E2E claims", () => {
    render(
      <BackupExternalDriveReadinessPanel
        readiness={createVerifyBackupExternalDriveDetectionReadiness()}
      />,
    );

    const panel = screen.getByRole("region", { name: /backup external drive readiness/i });

    expect(within(panel).getByText(/OG_BACKUP_USB is mounted at/i)).toBeInTheDocument();
    expect(within(panel).getByText(/mounted at \/media\/og-backup-stick/i)).toBeInTheDocument();
    expect(within(panel).getAllByText("warning").length).toBeGreaterThan(0);
    expect(panel).toHaveTextContent("no write/read/checksum/eject or restore proof is captured");
    expect(panel).not.toHaveTextContent(
      /external drive (verified|ready\b|written)|restore (completed|executed|ready\b)|cross-os e2e (passed|verified|ready\b)|removable media (proven|verified|written)|drive format (verified|ready\b)|unattended restore (safe\b|ready\b)/i,
    );
  });

  it("renders sentinel write proof metadata without restore or cross-OS claims", () => {
    render(
      <BackupExternalDriveReadinessPanel
        readiness={createVerifyBackupExternalDriveWriteProofReadiness()}
      />,
    );

    const panel = screen.getByRole("region", { name: /backup external drive readiness/i });

    expect(within(panel).getByText("Sentinel Write Proof")).toBeInTheDocument();
    expect(within(panel).getByText("fixture-write-proof-20260611")).toBeInTheDocument();
    expect(within(panel).getByText("Matched")).toBeInTheDocument();
    expect(within(panel).getByText("Deleted")).toBeInTheDocument();
    expect(within(panel).getByText("Manual Review")).toBeInTheDocument();
    expect(within(panel).getByText(/Sentinel write\/read\/delete only/i)).toBeInTheDocument();
    expect(within(panel).getByText(/No eject-safety proof/i)).toBeInTheDocument();
    expect(within(panel).getByText(/No backup payload write/i)).toBeInTheDocument();
    expect(panel).toHaveTextContent("SHA-256:");
    expect(panel).toHaveTextContent("Proof file:");
    expect(panel).not.toHaveTextContent(
      /restore (completed|executed|ready\b)|cross-os e2e (passed|verified|ready\b)|drive format (verified|ready\b)|unattended restore (safe\b|ready\b)|backup payload written/i,
    );
  });

  it("renders eject-safety preflight metadata without OS eject, restore, or cross-OS claims", () => {
    render(
      <BackupExternalDriveReadinessPanel
        readiness={createVerifyBackupExternalDriveEjectSafetyReadiness()}
      />,
    );

    const panel = screen.getByRole("region", { name: /backup external drive readiness/i });

    expect(within(panel).getAllByText("Eject-Safety Proof").length).toBeGreaterThan(0);
    expect(within(panel).getByText("fixture-eject-proof-20260611")).toBeInTheDocument();
    expect(within(panel).getByText("Preflight OK")).toBeInTheDocument();
    expect(within(panel).getByText("Manual Next")).toBeInTheDocument();
    expect(within(panel).getByText(/Sentinel flush\/read\/delete only/i)).toBeInTheDocument();
    expect(within(panel).getByText(/No OS eject\/unmount execution/i)).toBeInTheDocument();
    expect(within(panel).getByText(/No cross-OS E2E proof/i)).toBeInTheDocument();
    expect(panel).toHaveTextContent("Use the operating system eject/unmount action");
    expect(panel).not.toHaveTextContent(
      /drive ejected|os eject complete|unmounted|unmount complete|restore (completed|executed|ready\b)|cross-os e2e (passed|verified|ready\b)|drive format (verified|ready\b)|unattended restore (safe\b|ready\b)|backup payload written/i,
    );
  });

  it("renders OS unmount evidence without restore or cross-OS claims", () => {
    render(
      <BackupExternalDriveReadinessPanel
        readiness={createVerifyBackupExternalDriveOsEjectReadiness()}
      />,
    );

    const panel = screen.getByRole("region", { name: /backup external drive readiness/i });

    expect(within(panel).getAllByText("OS Eject / Unmount").length).toBeGreaterThan(0);
    expect(within(panel).getByText("Windows Eject Backend")).toBeInTheDocument();
    expect(within(panel).getByText("udisksctl unmount -b /dev/sdb1")).toBeInTheDocument();
    expect(within(panel).getByText("fixture-final-preflight-20260611")).toBeInTheDocument();
    expect(within(panel).getByText(/OS eject\/unmount command succeeded/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Mount no longer listed/i)).toBeInTheDocument();
    expect(within(panel).getByText(/No cross-OS E2E proof/i)).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /drive ejected|restore (completed|executed|ready\b)|cross-os e2e (passed|verified|ready\b)|drive format (verified|ready\b)|unattended restore (safe\b|ready\b)|backup payload written/i,
    );
  });
});
