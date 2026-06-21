import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const launcherMocks = vi.hoisted(() => ({
  archiveDownload: vi.fn(() => Promise.resolve()),
  cancelLanTransferCopyJob: vi.fn(),
  cancelDownload: vi.fn(() => Promise.resolve()),
  cancelModInstall: vi.fn(() => Promise.resolve()),
  clearRemoteCompanionDeviceSecret: vi.fn(() =>
    Promise.resolve({
      deviceId: null as string | null,
      deviceSecretHint: null as string | null,
      hasSecret: false,
      updatedAtEpochMs: null as number | null,
    }),
  ),
  getDownloadQueue: vi.fn(() => Promise.resolve([])),
  getRemoteCompanionDeviceSecretStatus: vi.fn(() =>
    Promise.resolve({
      deviceId: null as string | null,
      deviceSecretHint: null as string | null,
      hasSecret: false,
      updatedAtEpochMs: null as number | null,
    }),
  ),
  launchGame: vi.fn(() => Promise.resolve()),
  listInstalledGames: vi.fn(() => Promise.resolve([])),
  pauseDownload: vi.fn(() => Promise.resolve()),
  pollRemoteCompanionInstallJobsOnce: vi.fn(() =>
    Promise.resolve({
      claimed: 0,
      configured: false,
      failed: 0,
      jobs: [],
      started: 0,
    }),
  ),
  previewLanTransferCopy: vi.fn(),
  previewLanTransferPeerDiscoveryPreflight: vi.fn(),
  previewLanTransferResumeCancelLedger: vi.fn(),
  runLanTransferCopy: vi.fn(),
  runLanTransferCleanupCandidates: vi.fn(),
  runLanTransferResumeCopy: vi.fn(),
  startLanTransferCopyJob: vi.fn(),
}));
vi.mock("../lib/launcher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/launcher")>();
  return {
    ...actual,
    archiveDownload: launcherMocks.archiveDownload,
    cancelLanTransferCopyJob: launcherMocks.cancelLanTransferCopyJob,
    cancelDownload: launcherMocks.cancelDownload,
    cancelModInstall: launcherMocks.cancelModInstall,
    clearRemoteCompanionDeviceSecret: launcherMocks.clearRemoteCompanionDeviceSecret,
    getDownloadQueue: launcherMocks.getDownloadQueue,
    getRemoteCompanionDeviceSecretStatus: launcherMocks.getRemoteCompanionDeviceSecretStatus,
    launchGame: launcherMocks.launchGame,
    listInstalledGames: launcherMocks.listInstalledGames,
    pauseDownload: launcherMocks.pauseDownload,
    pollRemoteCompanionInstallJobsOnce: launcherMocks.pollRemoteCompanionInstallJobsOnce,
    previewLanTransferCopy: launcherMocks.previewLanTransferCopy,
    previewLanTransferPeerDiscoveryPreflight:
      launcherMocks.previewLanTransferPeerDiscoveryPreflight,
    previewLanTransferResumeCancelLedger: launcherMocks.previewLanTransferResumeCancelLedger,
    runLanTransferCopy: launcherMocks.runLanTransferCopy,
    runLanTransferCleanupCandidates: launcherMocks.runLanTransferCleanupCandidates,
    runLanTransferResumeCopy: launcherMocks.runLanTransferResumeCopy,
    startLanTransferCopyJob: launcherMocks.startLanTransferCopyJob,
  };
});

import {
  DownloadsPage,
  LanTransferNativeCopyConsole,
  LanTransferPlannerPanel,
  RemoteCompanionDesktopVaultPanel,
  RemoteDownloadReadinessPanel,
  RemoteInstallHandoffBanner,
  RemoteInstallHandoffLedger,
  SmartInstallPlannerPanel,
} from "./DownloadsPage";
import { buildRemoteCompanionPollStatus } from "../lib/remote-companion-poll-status";
import { RemoteHostedContractReadinessPanel } from "../components/launcher/RemoteHostedContractReadinessPanel";
import { getRemoteCompanionCloudReadiness } from "../lib/remote-companion-cloud-readiness";
import { getRemoteDownloadReadiness } from "../lib/remote-download-readiness";
import {
  createRemoteCompanionHandshake,
  recordRemoteCompanionPing,
  summarizeRemoteCompanionHandshake,
} from "../lib/remote-companion-handshake";
import { buildSmartInstallPlan } from "../lib/smart-install-planner";
import { buildLanTransferPlan } from "../lib/lan-transfer-planner";
import type { RemoteInstallHandoffNotice } from "../lib/remote-install-handoff";

function renderDownloadsRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<DownloadsPage />} path="/downloads" />
      </Routes>
    </MemoryRouter>,
  );
}

const emptyDesktopVaultStatus = {
  deviceId: null,
  deviceSecretHint: null,
  hasSecret: false,
  updatedAtEpochMs: null,
};

const readyDesktopVaultStatus = {
  deviceId: "11111111-1111-4111-8111-111111111111",
  deviceSecretHint: "ogd_pair...7890",
  hasSecret: true,
  updatedAtEpochMs: Date.UTC(2026, 5, 16, 12, 0, 0),
};

afterEach(() => {
  vi.unstubAllEnvs();
  launcherMocks.getRemoteCompanionDeviceSecretStatus.mockReset();
  launcherMocks.getRemoteCompanionDeviceSecretStatus.mockResolvedValue({
    deviceId: null,
    deviceSecretHint: null,
    hasSecret: false,
    updatedAtEpochMs: null,
  });
  launcherMocks.clearRemoteCompanionDeviceSecret.mockReset();
  launcherMocks.clearRemoteCompanionDeviceSecret.mockResolvedValue({
    deviceId: null,
    deviceSecretHint: null,
    hasSecret: false,
    updatedAtEpochMs: null,
  });
  launcherMocks.pollRemoteCompanionInstallJobsOnce.mockReset();
  launcherMocks.pollRemoteCompanionInstallJobsOnce.mockResolvedValue({
    claimed: 0,
    configured: false,
    failed: 0,
    jobs: [],
    started: 0,
  });
});

describe("RemoteDownloadReadinessPanel", () => {
  it("renders local staging controls and forwards toggle changes", () => {
    const onAlwaysOnConfiguredChange = vi.fn();
    const readiness = getRemoteDownloadReadiness({
      activeDownloadCount: 0,
      alwaysOnConfigured: true,
      hasDesktopVault: true,
      hasHostedAuth: true,
      hasRemoteCompanion: true,
      isDesktopApp: true,
    });

    render(
      <RemoteDownloadReadinessPanel
        alwaysOnConfigured
        companionHandshake={summarizeRemoteCompanionHandshake(null)}
        desktopVaultStatus={readyDesktopVaultStatus}
        isDesktopApp
        onAlwaysOnConfiguredChange={onAlwaysOnConfiguredChange}
        onClearDesktopVault={vi.fn()}
        onClearCompanionPairing={vi.fn()}
        onCreateCompanionPairing={vi.fn()}
        onRecordCompanionPing={vi.fn()}
        readiness={readiness}
      />,
    );

    expect(screen.getByText("Remote queue can accept companion handoffs.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Always-On/i)).toBeChecked();

    fireEvent.click(screen.getByLabelText(/Always-On/i));

    expect(onAlwaysOnConfiguredChange).toHaveBeenCalledWith(false);
  });

  it("shows the missing companion blocker with unchecked local controls", () => {
    const readiness = getRemoteDownloadReadiness({
      activeDownloadCount: 0,
      alwaysOnConfigured: false,
      hasRemoteCompanion: false,
      isDesktopApp: true,
    });

    render(
      <RemoteDownloadReadinessPanel
        alwaysOnConfigured={false}
        companionHandshake={summarizeRemoteCompanionHandshake(null)}
        desktopVaultStatus={emptyDesktopVaultStatus}
        isDesktopApp
        onAlwaysOnConfiguredChange={vi.fn()}
        onClearDesktopVault={vi.fn()}
        onClearCompanionPairing={vi.fn()}
        onCreateCompanionPairing={vi.fn()}
        onRecordCompanionPing={vi.fn()}
        readiness={readiness}
      />,
    );

    expect(screen.getByText("Blocked by Mobile/Web Companion.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Always-On/i)).not.toBeChecked();
  });

  it("renders companion pairing evidence and forwards handshake actions", () => {
    const onClear = vi.fn();
    const onClearVault = vi.fn();
    const onCreate = vi.fn();
    const onPing = vi.fn();
    const onPoll = vi.fn();
    const record = recordRemoteCompanionPing(
      createRemoteCompanionHandshake({
        now: 1_780_000_000_000,
        pairingCode: "OG-ABC-123",
      }),
      1_780_000_030_000,
    );
    const readiness = getRemoteDownloadReadiness({
      activeDownloadCount: 0,
      alwaysOnConfigured: true,
      companionStatus: "linked",
      hasDesktopVault: true,
      hasHostedAuth: true,
      hasRemoteCompanion: true,
      isDesktopApp: true,
    });

    render(
      <RemoteDownloadReadinessPanel
        alwaysOnConfigured
        companionHandshake={summarizeRemoteCompanionHandshake(record, 1_780_000_060_000)}
        desktopVaultMessage="Desktop companion vault record is present."
        desktopVaultStatus={readyDesktopVaultStatus}
        isDesktopApp
        onAlwaysOnConfiguredChange={vi.fn()}
        onClearDesktopVault={onClearVault}
        onClearCompanionPairing={onClear}
        onCreateCompanionPairing={onCreate}
        onPollRemoteJobs={onPoll}
        onRecordCompanionPing={onPing}
        readiness={readiness}
        remotePollStatus={{
          detail: "1 remote job started.",
          label: "1 started",
          tone: "ready",
        }}
      />,
    );

    expect(screen.getByRole("region", { name: /Remote companion pairing/i })).toBeInTheDocument();
    expect(screen.getByText("OG-ABC-123")).toBeInTheDocument();
    expect(screen.getAllByText("linked").length).toBeGreaterThan(0);
    expect(screen.getByText("1 started")).toBeInTheDocument();
    expect(screen.getByText("1 remote job started.")).toBeInTheDocument();
    const vault = screen.getByRole("region", { name: /remote companion desktop vault/i });
    expect(within(vault).getByText("Desktop Vault")).toBeInTheDocument();
    expect(within(vault).getByText("Ready")).toBeInTheDocument();
    expect(within(vault).getByText("11111111...1111")).toBeInTheDocument();
    expect(within(vault).getByText("ogd_pair...7890")).toBeInTheDocument();
    expect(within(vault).getByText("2026-06-16 12:00 UTC")).toBeInTheDocument();
    expect(vault).not.toHaveTextContent(
      /desktop_secret|token=|signed url|production hosted deployment ready/i,
    );

    fireEvent.click(screen.getByRole("button", { name: /Generate Code/i }));
    fireEvent.click(screen.getByRole("button", { name: /Record Ping/i }));
    fireEvent.click(screen.getByRole("button", { name: /Claim Jobs/i }));
    fireEvent.click(within(vault).getByRole("button", { name: /Clear Vault/i }));
    fireEvent.click(screen.getByRole("button", { name: /Reset/i }));

    expect(onCreate).toHaveBeenCalled();
    expect(onPing).toHaveBeenCalled();
    expect(onPoll).toHaveBeenCalled();
    expect(onClearVault).toHaveBeenCalled();
    expect(onClear).toHaveBeenCalled();
  });

  it("redacts raw desktop vault secrets, tokens, signed links, and package URLs", () => {
    render(
      <RemoteCompanionDesktopVaultPanel
        isDesktopApp
        message={[
          "Failed token=relay-secret sig=relay-signature",
          "https://relay.og-launcher.test/packages/live.zip",
          "ogd_desktop_secret_once_abcdefghijklmnopqrstuvwxyz",
        ].join(" ")}
        onClear={vi.fn()}
        status={{
          deviceId: "22222222-2222-4222-8222-222222222222",
          deviceSecretHint: "ogd_desktop_secret_once_abcdefghijklmnopqrstuvwxyz",
          hasSecret: true,
          updatedAtEpochMs: Date.UTC(2026, 5, 16, 12, 0, 0),
        }}
      />,
    );

    const vault = screen.getByRole("region", { name: /remote companion desktop vault/i });
    expect(vault).toHaveTextContent("[device-secret-redacted]");
    expect(vault).toHaveTextContent("token=[secret-redacted]");
    expect(vault).toHaveTextContent("sig=[secret-redacted]");
    expect(vault).toHaveTextContent("[link-redacted]");
    expect(vault).not.toHaveTextContent(
      /relay-secret|relay-signature|https:\/\/relay|ogd_desktop_secret_once/i,
    );
  });
});

describe("SmartInstallPlannerPanel", () => {
  it("renders the local auto-pick and source blockers without requiring provider calls", () => {
    const plan = buildSmartInstallPlan([
      {
        diskSpaceReady: true,
        estimatedMbps: 240,
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
        diskSpaceReady: true,
        estimatedMbps: 90,
        id: "steam-client",
        installedClient: false,
        isLanPeer: false,
        label: "Steam Client",
        ownership: "owned",
        priceCents: null,
        provider: "Steam",
        requiresExternalLauncher: true,
        trust: "unknown",
      },
    ]);

    render(<SmartInstallPlannerPanel plan={plan} />);

    expect(screen.getByRole("region", { name: /Smart install planner/i })).toBeInTheDocument();
    expect(screen.getByText("Source Auto-Pick")).toBeInTheDocument();
    expect(screen.getAllByText("LAN Peer Cache").length).toBeGreaterThan(0);
    expect(screen.getByText("Install Steam client first")).toBeInTheDocument();
    expect(screen.getByText("LAN Peer Cache is the current auto-pick")).toBeInTheDocument();
  });
});

describe("LanTransferPlannerPanel", () => {
  it("renders the recommended peer and blocked transfer lanes", () => {
    const plan = buildLanTransferPlan([
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
    ]);

    render(<LanTransferPlannerPanel plan={plan} />);

    expect(screen.getByRole("region", { name: /LAN transfer readiness/i })).toBeInTheDocument();
    expect(screen.getByText("Peer Copy Lane")).toBeInTheDocument();
    expect(screen.getAllByText("Living Room Rig").length).toBeGreaterThan(0);
    expect(screen.getByText("Peer is not on the local network")).toBeInTheDocument();
    expect(
      screen.getByText("Living Room Rig is the current LAN transfer pick"),
    ).toBeInTheDocument();
  });
});

describe("LanTransferNativeCopyConsole", () => {
  it("runs a consent-gated peer discovery preflight without network automation claims", async () => {
    launcherMocks.previewLanTransferPeerDiscoveryPreflight.mockResolvedValueOnce({
      broadcastSent: false,
      firewallRuleChanged: false,
      guards: [
        "No UDP broadcast is sent",
        "No relay request is executed",
        "No firewall rule is changed",
      ],
      loopbackTcpBindReady: true,
      loopbackUdpBindReady: true,
      manualSource: {
        bytesTotal: 5,
        fileCount: 1,
        path: "/mnt/peer/Arcade",
        reachable: true,
        symlinkFree: true,
      },
      message:
        "LAN peer discovery/share preflight completed without broadcast, relay, mount, firewall mutation, pairing, or copy.",
      operation: "lan_peer_discovery_preflight_review",
      redactedEndpoint: "127.0.0.1:<ephemeral>",
      relayCalled: false,
      shareMounted: false,
      status: "warning",
      warnings: [
        "Native preflight did not send UDP broadcast.",
        "Native preflight did not call hosted relay lookup.",
      ],
    });

    render(<LanTransferNativeCopyConsole />);

    fireEvent.change(screen.getByLabelText("LAN copy Source Path"), {
      target: { value: "/mnt/peer/Arcade" },
    });
    fireEvent.click(
      screen.getByLabelText(
        "I accept this native copy, resume-copy, cleanup, or discovery preflight review.",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Discovery Preflight" }));

    expect(
      await screen.findByText(
        "LAN peer discovery/share preflight completed without broadcast, relay, mount, firewall mutation, pairing, or copy.",
      ),
    ).toBeInTheDocument();
    expect(launcherMocks.previewLanTransferPeerDiscoveryPreflight).toHaveBeenCalledWith({
      consent: {
        accepted: true,
        operation: "lan_peer_discovery_preflight_review",
      },
      manualSourcePath: "/mnt/peer/Arcade",
    });
    const consolePanel = screen.getByRole("region", { name: /LAN native copy console/i });
    expect(within(consolePanel).getAllByText("Discovery Preflight").length).toBeGreaterThan(0);
    expect(within(consolePanel).getByText("warning")).toBeInTheDocument();
    expect(
      within(consolePanel).getByText("TCP ready // UDP ready // no broadcast"),
    ).toBeInTheDocument();
    expect(consolePanel).not.toHaveTextContent(
      /broadcast sent|relay called|firewall rule changed|share mounted|pairing established|copy complete/i,
    );
  });

  it("previews the resume/cancel ledger with normalized source and target paths", async () => {
    launcherMocks.previewLanTransferResumeCancelLedger.mockResolvedValueOnce({
      bytesConflicting: 6,
      bytesPending: 7,
      bytesReusable: 4,
      cleanupCandidateCount: 1,
      cleanupCandidates: [
        {
          entryKind: "file",
          relativePath: "stale.tmp",
          sizeBytes: 5,
        },
      ],
      conflictFileCount: 1,
      files: [
        {
          relativePath: "data/same.bin",
          sourceSha256: "a".repeat(64),
          sourceSizeBytes: 4,
          status: "reusable",
          targetSha256: "a".repeat(64),
          targetSizeBytes: 4,
        },
        {
          relativePath: "data/missing.bin",
          sourceSha256: "b".repeat(64),
          sourceSizeBytes: 7,
          status: "pending",
        },
        {
          relativePath: "data/changed.bin",
          sourceSha256: "c".repeat(64),
          sourceSizeBytes: 6,
          status: "conflict",
          targetSha256: "d".repeat(64),
          targetSizeBytes: 6,
        },
      ],
      gameId: "lan-game-1",
      message: "LAN transfer resume/cancel ledger prepared without copying or deleting files.",
      pendingFileCount: 1,
      reusableFileCount: 1,
      sourcePath: "/mnt/peer/LAN Game",
      targetPath: "/home/user/Games/LAN Game",
      title: "LAN Game",
    });

    render(<LanTransferNativeCopyConsole />);

    fireEvent.change(screen.getByLabelText("LAN copy Source Path"), {
      target: { value: " /mnt/peer/LAN Game " },
    });
    fireEvent.change(screen.getByLabelText("LAN copy Target Path"), {
      target: { value: " /home/user/Games/LAN Game " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Preview Ledger/i }));

    expect(await screen.findByText("1/3 reusable")).toBeInTheDocument();
    expect(screen.getByText("1 pending // 1 conflict // 1 cleanup")).toBeInTheDocument();
    expect(launcherMocks.previewLanTransferResumeCancelLedger).toHaveBeenCalledWith({
      gameId: "lan-game-1",
      sourcePath: "/mnt/peer/LAN Game",
      targetPath: "/home/user/Games/LAN Game",
      title: "LAN Game",
    });
  });

  it("keeps native copy behind explicit consent and surfaces desktop guard errors", async () => {
    launcherMocks.previewLanTransferCopy.mockRejectedValueOnce(
      new Error("LAN transfer native copy preview is available in the desktop app."),
    );

    render(<LanTransferNativeCopyConsole />);

    fireEvent.change(screen.getByLabelText("LAN copy Source Path"), {
      target: { value: "/mnt/peer/Arcade" },
    });
    fireEvent.change(screen.getByLabelText("LAN copy Target Path"), {
      target: { value: "/home/user/Games/Arcade" },
    });

    expect(screen.getByRole("button", { name: /Run Copy/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Start Copy Job/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Cancel Job/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Resume Copy/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Cleanup Candidates/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Preview Copy/i }));

    expect(
      await screen.findByText("LAN transfer native copy preview is available in the desktop app."),
    ).toBeInTheDocument();
    expect(launcherMocks.runLanTransferCopy).not.toHaveBeenCalled();
    expect(launcherMocks.startLanTransferCopyJob).not.toHaveBeenCalled();
    expect(launcherMocks.cancelLanTransferCopyJob).not.toHaveBeenCalled();
    expect(launcherMocks.runLanTransferResumeCopy).not.toHaveBeenCalled();
    expect(launcherMocks.runLanTransferCleanupCandidates).not.toHaveBeenCalled();
  });

  it("starts and cancels a cancellable LAN copy job with dedicated job status", async () => {
    launcherMocks.startLanTransferCopyJob.mockResolvedValueOnce({
      bytesCopied: 4,
      bytesTotal: 20,
      canCancel: true,
      copiedFileCount: 1,
      fileCount: 3,
      gameId: "lan-game-1",
      jobId: "lan-copy-lan-game-1-1",
      message: "LAN transfer copy job is copying local files.",
      progress: 12,
      sourcePath: "/mnt/peer/LAN Game",
      status: "running",
      targetPath: "/home/user/Games/LAN Game",
      title: "LAN Game",
    });
    launcherMocks.cancelLanTransferCopyJob.mockResolvedValueOnce({
      bytesCopied: 4,
      bytesTotal: 20,
      canCancel: false,
      copiedFileCount: 1,
      fileCount: 3,
      gameId: "lan-game-1",
      jobId: "lan-copy-lan-game-1-1",
      message:
        "LAN transfer copy job cancel requested; waiting for the current file chunk to stop.",
      progress: 12,
      sourcePath: "/mnt/peer/LAN Game",
      status: "cancelling",
      targetPath: "/home/user/Games/LAN Game",
      title: "LAN Game",
    });

    render(<LanTransferNativeCopyConsole />);

    fireEvent.change(screen.getByLabelText("LAN copy Source Path"), {
      target: { value: "/mnt/peer/LAN Game" },
    });
    fireEvent.change(screen.getByLabelText("LAN copy Target Path"), {
      target: { value: "/home/user/Games/LAN Game" },
    });
    fireEvent.click(screen.getByLabelText(/discovery preflight review/i));
    fireEvent.click(screen.getByRole("button", { name: /Start Copy Job/i }));

    expect(await screen.findByText("running // 12%")).toBeInTheDocument();
    expect(screen.getByText("4 B / 20 B")).toBeInTheDocument();
    expect(launcherMocks.startLanTransferCopyJob).toHaveBeenCalledWith({
      consent: {
        accepted: true,
        operation: "lan_native_copy_verify_manifest",
        sourcePath: "/mnt/peer/LAN Game",
        targetPath: "/home/user/Games/LAN Game",
      },
      gameId: "lan-game-1",
      sourcePath: "/mnt/peer/LAN Game",
      targetPath: "/home/user/Games/LAN Game",
      title: "LAN Game",
    });

    fireEvent.click(screen.getByRole("button", { name: /Cancel Job/i }));

    expect(await screen.findByText("cancelling // 12%")).toBeInTheDocument();
    expect(launcherMocks.cancelLanTransferCopyJob).toHaveBeenCalledWith("lan-copy-lan-game-1-1");
  });

  it("runs resume copy with a dedicated consent operation and reports reused bytes", async () => {
    launcherMocks.runLanTransferResumeCopy.mockResolvedValueOnce({
      bytesCopied: 7,
      bytesReused: 4,
      copiedFileCount: 1,
      executablePath: null,
      fileCount: 2,
      files: [
        {
          relativePath: "data/same.bin",
          sha256: "a".repeat(64),
          sizeBytes: 4,
        },
        {
          relativePath: "data/missing.bin",
          sha256: "b".repeat(64),
          sizeBytes: 7,
        },
      ],
      gameId: "lan-game-1",
      manifestPath: "/home/user/Games/LAN Game/og-manifest.json",
      message:
        "LAN transfer resume copy completed with reusable-file verification and manifest hash verification.",
      reusedFileCount: 1,
      sourcePath: "/mnt/peer/LAN Game",
      targetPath: "/home/user/Games/LAN Game",
      title: "LAN Game",
      verifiedFiles: 2,
    });

    render(<LanTransferNativeCopyConsole />);

    fireEvent.change(screen.getByLabelText("LAN copy Source Path"), {
      target: { value: "/mnt/peer/LAN Game" },
    });
    fireEvent.change(screen.getByLabelText("LAN copy Target Path"), {
      target: { value: "/home/user/Games/LAN Game" },
    });
    fireEvent.click(screen.getByLabelText(/discovery preflight review/i));
    fireEvent.click(screen.getByRole("button", { name: /Resume Copy/i }));

    expect(await screen.findByText("1/2 reused")).toBeInTheDocument();
    expect(screen.getByText("7 B copied // 4 B reused")).toBeInTheDocument();
    expect(launcherMocks.runLanTransferResumeCopy).toHaveBeenCalledWith({
      consent: {
        accepted: true,
        operation: "lan_native_resume_copy_verify_manifest",
        sourcePath: "/mnt/peer/LAN Game",
        targetPath: "/home/user/Games/LAN Game",
      },
      gameId: "lan-game-1",
      sourcePath: "/mnt/peer/LAN Game",
      targetPath: "/home/user/Games/LAN Game",
      title: "LAN Game",
    });
  });

  it("deletes cleanup candidates only after ledger preview and dedicated consent", async () => {
    launcherMocks.previewLanTransferResumeCancelLedger.mockResolvedValueOnce({
      bytesConflicting: 0,
      bytesPending: 0,
      bytesReusable: 7,
      cleanupCandidateCount: 2,
      cleanupCandidates: [
        {
          entryKind: "file",
          relativePath: "stale.tmp",
          sizeBytes: 5,
        },
        {
          entryKind: "symlink",
          relativePath: "old-link.tmp",
        },
      ],
      conflictFileCount: 0,
      files: [
        {
          relativePath: "game.bin",
          sourceSha256: "a".repeat(64),
          sourceSizeBytes: 7,
          status: "reusable",
          targetSha256: "a".repeat(64),
          targetSizeBytes: 7,
        },
      ],
      gameId: "lan-game-1",
      message: "LAN transfer resume/cancel ledger prepared without copying or deleting files.",
      pendingFileCount: 0,
      reusableFileCount: 1,
      sourcePath: "/mnt/peer/LAN Game",
      targetPath: "/home/user/Games/LAN Game",
      title: "LAN Game",
    });
    launcherMocks.runLanTransferCleanupCandidates.mockResolvedValueOnce({
      deletedCandidates: [
        {
          entryKind: "file",
          relativePath: "stale.tmp",
          sizeBytes: 5,
        },
        {
          entryKind: "symlink",
          relativePath: "old-link.tmp",
        },
      ],
      deletedCount: 2,
      gameId: "lan-game-1",
      message:
        "LAN transfer cleanup candidates deleted after ledger review and post-delete verification.",
      sourcePath: "/mnt/peer/LAN Game",
      targetPath: "/home/user/Games/LAN Game",
      title: "LAN Game",
    });

    render(<LanTransferNativeCopyConsole />);

    fireEvent.change(screen.getByLabelText("LAN copy Source Path"), {
      target: { value: "/mnt/peer/LAN Game" },
    });
    fireEvent.change(screen.getByLabelText("LAN copy Target Path"), {
      target: { value: "/home/user/Games/LAN Game" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Preview Ledger/i }));

    expect(await screen.findByText("0 pending // 0 conflict // 2 cleanup")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cleanup Candidates/i })).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/discovery preflight review/i));
    fireEvent.click(screen.getByRole("button", { name: /Cleanup Candidates/i }));

    expect(await screen.findByText("2 deleted")).toBeInTheDocument();
    expect(screen.getByText("2 ledger candidates")).toBeInTheDocument();
    expect(launcherMocks.runLanTransferCleanupCandidates).toHaveBeenCalledWith({
      consent: {
        accepted: true,
        cleanupCandidateCount: 2,
        operation: "lan_native_cleanup_candidates_delete",
        sourcePath: "/mnt/peer/LAN Game",
        targetPath: "/home/user/Games/LAN Game",
      },
      gameId: "lan-game-1",
      sourcePath: "/mnt/peer/LAN Game",
      targetPath: "/home/user/Games/LAN Game",
      title: "LAN Game",
    });
  });
});

describe("remote companion poll status", () => {
  it("formats auto idle and unconfigured states without leaking raw details", () => {
    expect(
      buildRemoteCompanionPollStatus(
        {
          claimed: 0,
          configured: true,
          failed: 0,
          jobs: [],
          started: 0,
        },
        "auto",
      ),
    ).toEqual({
      detail: "Always-On checked relay; no hosted jobs were claimed.",
      label: "Auto idle",
      tone: "idle",
    });

    expect(
      buildRemoteCompanionPollStatus(
        {
          claimed: 0,
          configured: false,
          failed: 0,
          jobs: [],
          started: 0,
        },
        "auto",
      ),
    ).toEqual({
      detail: "Always-On is waiting for the desktop vault or cached session.",
      label: "Auto wait",
      tone: "warning",
    });
  });

  it("redacts relay job URLs, tokens, signatures, and long messages", () => {
    const status = buildRemoteCompanionPollStatus({
      claimed: 1,
      configured: true,
      failed: 0,
      jobs: [
        {
          gameId: "remote-game",
          jobId: "job-secret",
          localQueueId: "queue-1",
          message: `Queued token=relay-secret sig=relay-signature via https://relay.og-launcher.test/install?token=url-secret&sig=url-signature and oglauncher://claim?token=deeplink-secret&sig=deeplink-signature ${"x".repeat(320)}`,
          status: "started",
        },
      ],
      started: 1,
    });

    expect(status).toMatchObject({
      label: "1 started",
      tone: "ready",
    });
    expect(status.detail).toContain("token=[secret-redacted]");
    expect(status.detail).toContain("sig=[secret-redacted]");
    expect(status.detail).toContain("[link-redacted]");
    expect(status.detail).not.toMatch(/https?:\/\//i);
    expect(status.detail).not.toMatch(/oglauncher:\/\//i);
    expect(status.detail).not.toMatch(/relay-secret|relay-signature|url-secret|url-signature/i);
    expect(status.detail).not.toMatch(/deeplink-secret|deeplink-signature/i);
    expect(status.detail.length).toBeLessThanOrEqual(180);
  });

  it("redacts JSON, colon, bearer, websocket, and bare relay-host secret forms", () => {
    const status = buildRemoteCompanionPollStatus({
      claimed: 0,
      configured: true,
      failed: 1,
      jobs: [
        {
          gameId: "remote-game",
          jobId: "job-secret",
          localQueueId: null,
          message:
            'Relay error {"accessToken":"json-secret","refresh_token":"refresh-secret"} Authorization: Bearer bearer-secret token: colon-secret wss://relay.og-launcher.test/socket?sig=wss-secret relay.og-launcher.test/jobs/job-secret?token=bare-secret',
          status: "failed",
        },
      ],
      started: 0,
    });

    expect(status).toMatchObject({
      label: "1 failed",
      tone: "failed",
    });
    expect(status.detail).toContain("[secret-redacted]");
    expect(status.detail).toContain("[link-redacted]");
    expect(status.detail).not.toMatch(/json-secret|refresh-secret|bearer-secret|colon-secret/i);
    expect(status.detail).not.toMatch(/wss-secret|bare-secret|relay\.og-launcher\.test/i);
    expect(status.detail).not.toMatch(/wss:\/\//i);
    expect(status.detail.length).toBeLessThanOrEqual(180);
  });

  it("redacts thrown poll errors before rendering status and command errors", async () => {
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.listInstalledGames.mockResolvedValue([]);
    launcherMocks.pollRemoteCompanionInstallJobsOnce.mockRejectedValueOnce(
      new Error(
        "Relay failure Authorization: Bearer thrown-bearer token: thrown-token https://relay.og-launcher.test/jobs/job-secret?sig=thrown-signature",
      ),
    );

    renderDownloadsRoute("/downloads");

    fireEvent.click(await screen.findByRole("button", { name: /Claim Jobs/i }));

    expect(await screen.findAllByText(/token: \[secret-redacted\]/i)).not.toHaveLength(0);
    expect(screen.getAllByText(/\[link-redacted\]/i).length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent("thrown-bearer");
    expect(document.body).not.toHaveTextContent("thrown-token");
    expect(document.body).not.toHaveTextContent("thrown-signature");
    expect(document.body).not.toHaveTextContent("https://relay.og-launcher.test");
  });

  it("renders sanitized relay job status in the downloads panel", () => {
    const readiness = getRemoteDownloadReadiness({
      activeDownloadCount: 0,
      alwaysOnConfigured: true,
      companionStatus: "linked",
      hasDesktopVault: true,
      hasHostedAuth: true,
      hasRemoteCompanion: true,
      isDesktopApp: true,
    });
    const handshake = summarizeRemoteCompanionHandshake(
      createRemoteCompanionHandshake({
        now: 1_780_000_000_000,
        pairingCode: "OG-SAFE-321",
      }),
      1_780_000_060_000,
    );
    const pollStatus = buildRemoteCompanionPollStatus({
      claimed: 1,
      configured: true,
      failed: 0,
      jobs: [
        {
          gameId: "remote-game",
          jobId: "job-secret",
          localQueueId: "queue-1",
          message:
            "Started https://relay.og-launcher.test/jobs/job-secret?token=relay-secret&sig=relay-signature",
          status: "started",
        },
      ],
      started: 1,
    });

    render(
      <RemoteDownloadReadinessPanel
        alwaysOnConfigured
        companionHandshake={handshake}
        desktopVaultStatus={readyDesktopVaultStatus}
        isDesktopApp
        onAlwaysOnConfiguredChange={vi.fn()}
        onClearDesktopVault={vi.fn()}
        onClearCompanionPairing={vi.fn()}
        onCreateCompanionPairing={vi.fn()}
        onPollRemoteJobs={vi.fn()}
        onRecordCompanionPing={vi.fn()}
        readiness={readiness}
        remotePollStatus={pollStatus}
      />,
    );

    const panel = screen.getByRole("region", { name: /Remote companion pairing/i });
    expect(panel).toHaveTextContent("[link-redacted]");
    expect(panel).not.toHaveTextContent("https://relay.og-launcher.test");
    expect(panel).not.toHaveTextContent("relay-secret");
    expect(panel).not.toHaveTextContent("relay-signature");
  });
});

describe("RemoteHostedContractReadinessPanel", () => {
  it("shows the hosted relay as local-only while the cloud contract is staged", () => {
    const readiness = getRemoteCompanionCloudReadiness({
      hasDesktopSecretVault: true,
      hasHostedDeployment: false,
      hasOpaqueJobQueue: true,
      hasPairingRpc: true,
      hasRelayFunction: true,
      hasSchemaRls: true,
      hasStoreBuildTicketContract: true,
    });

    render(<RemoteHostedContractReadinessPanel readiness={readiness} />);

    expect(
      screen.getByRole("region", { name: /Remote hosted contract readiness/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Hosted Deploy still needs verification.")).toBeInTheDocument();
    expect(screen.getByText("Relay Function")).toBeInTheDocument();
    expect(screen.getByText("Desktop Vault")).toBeInTheDocument();
    expect(screen.getByText("Store Ticket Jobs")).toBeInTheDocument();
    expect(screen.getByText("Local Only")).toBeInTheDocument();
    expect(screen.getByText("86%")).toBeInTheDocument();
    expect(screen.queryByText(/https:\/\//i)).not.toBeInTheDocument();
    expect(screen.queryByText(/token=|sig=/i)).not.toBeInTheDocument();
  });

  it("shows ready once schema, RPCs, opaque jobs and hosted relay are verified", () => {
    const readiness = getRemoteCompanionCloudReadiness({
      hasDesktopSecretVault: true,
      hasHostedDeployment: true,
      hasOpaqueJobQueue: true,
      hasPairingRpc: true,
      hasRelayFunction: true,
      hasSchemaRls: true,
      hasStoreBuildTicketContract: true,
    });

    render(<RemoteHostedContractReadinessPanel readiness={readiness} />);

    expect(screen.getByText("Hosted contract is locally verified.")).toBeInTheDocument();
    expect(screen.getByText("Store Ticket Jobs")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getAllByText("ready").length).toBeGreaterThanOrEqual(7);
  });
});

describe("DownloadsPage remote hosted contract verify route", () => {
  it("passes hosted deployment evidence on the hosted contract verify route", async () => {
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.listInstalledGames.mockResolvedValue([]);

    renderDownloadsRoute("/downloads?verify=remote-hosted-contract-ready");

    const panel = await screen.findByRole("region", {
      name: /remote hosted contract readiness/i,
    });

    expect(within(panel).getByText("Hosted contract is locally verified.")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted Deploy")).toBeInTheDocument();
    expect(within(panel).getByText("Store Ticket Jobs")).toBeInTheDocument();
    expect(within(panel).getByText("100%")).toBeInTheDocument();
    expect(within(panel).getAllByText("ready").length).toBeGreaterThanOrEqual(7);
    expect(panel).not.toHaveTextContent(/token=|sig=|signed url|raw package url/i);
  });

  it("keeps normal hosted env readiness blocked without a native desktop vault", async () => {
    vi.stubEnv("VITE_OG_REMOTE_HOSTED_RELAY_ENABLED", "true");
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.listInstalledGames.mockResolvedValue([]);

    renderDownloadsRoute("/downloads");

    const panel = await screen.findByRole("region", {
      name: /remote hosted contract readiness/i,
    });

    await waitFor(() =>
      expect(
        within(panel).getByText("Desktop Vault still needs verification."),
      ).toBeInTheDocument(),
    );

    expect(within(panel).getByText("Store Ticket Jobs")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted Deploy")).toBeInTheDocument();
    expect(within(panel).getByText("Desktop Vault")).toBeInTheDocument();
    expect(
      within(panel).getByText("Desktop app still needs a keychain-backed device-secret vault."),
    ).toBeInTheDocument();
    expect(within(panel).getByText("86%")).toBeInTheDocument();
    expect(within(panel).getByText("Local Only")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent("Hosted contract is locally verified.");
    expect(panel).not.toHaveTextContent(/token=|sig=|signed url|raw package url/i);
  });

  it("passes hosted deployment evidence on normal route when env flag and native vault are ready", async () => {
    vi.stubEnv("VITE_OG_REMOTE_HOSTED_RELAY_ENABLED", "true");
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.listInstalledGames.mockResolvedValue([]);
    launcherMocks.getRemoteCompanionDeviceSecretStatus.mockResolvedValue({
      deviceId: "desktop-device-1",
      deviceSecretHint: "oglr_...ready",
      hasSecret: true,
      updatedAtEpochMs: 1_780_000_000_000,
    });

    renderDownloadsRoute("/downloads");

    const panel = await screen.findByRole("region", {
      name: /remote hosted contract readiness/i,
    });

    await waitFor(() =>
      expect(within(panel).getByText("Hosted contract is locally verified.")).toBeInTheDocument(),
    );

    expect(within(panel).getByText("Store Ticket Jobs")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted Deploy")).toBeInTheDocument();
    expect(within(panel).getByText("Desktop Vault")).toBeInTheDocument();
    expect(within(panel).getByText("100%")).toBeInTheDocument();
    expect(within(panel).getAllByText("ready").length).toBeGreaterThanOrEqual(7);
    expect(panel).not.toHaveTextContent(/token=|sig=|signed url|raw package url/i);
  });
});

describe("DownloadsPage remote companion desktop vault", () => {
  it("keeps browser fallback non-authoritative with clear disabled", async () => {
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.listInstalledGames.mockResolvedValue([]);

    renderDownloadsRoute("/downloads");

    const vault = await screen.findByRole("region", {
      name: /remote companion desktop vault/i,
    });

    await waitFor(() => expect(within(vault).getByText("Browser Fallback")).toBeInTheDocument());
    expect(within(vault).getByText("Not linked")).toBeInTheDocument();
    expect(within(vault).getByRole("button", { name: /Clear Vault/i })).toBeDisabled();
    expect(launcherMocks.clearRemoteCompanionDeviceSecret).not.toHaveBeenCalled();
    expect(vault).not.toHaveTextContent(/desktop_secret|token=|sig=|signed url|raw package url/i);
  });

  it("mounts a local-only desktop vault reset fixture on the verify route", async () => {
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.listInstalledGames.mockResolvedValue([]);

    renderDownloadsRoute("/downloads?verify=remote-companion-vault-reset-local");

    const vault = await screen.findByRole("region", {
      name: /remote companion desktop vault/i,
    });

    expect(within(vault).getByText("Desktop Vault")).toBeInTheDocument();
    expect(within(vault).getByText("Ready")).toBeInTheDocument();
    expect(within(vault).getByText("11111111...1111")).toBeInTheDocument();
    expect(within(vault).getByText("ogd_pair...7890")).toBeInTheDocument();
    expect(within(vault).getByText("2026-06-16 12:00 UTC")).toBeInTheDocument();
    expect(vault).toHaveTextContent("no hosted deployment proof");
    expect(vault).not.toHaveTextContent(/desktop_secret|token=|signed url|hosted deploy ready/i);

    fireEvent.click(within(vault).getByRole("button", { name: /Clear Vault/i }));

    expect(launcherMocks.clearRemoteCompanionDeviceSecret).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        within(vault).getByText(
          "Local verify reset cleared the staged vault record; no hosted deploy proof was written.",
        ),
      ).toBeInTheDocument(),
    );
    expect(within(vault).getByText("Missing")).toBeInTheDocument();
    expect(within(vault).getByText("Not linked")).toBeInTheDocument();
    expect(within(vault).getByText("Not stored")).toBeInTheDocument();

    fireEvent.click(within(vault).getByRole("button", { name: /Stage Fixture/i }));

    expect(launcherMocks.clearRemoteCompanionDeviceSecret).not.toHaveBeenCalled();
    await waitFor(() => expect(within(vault).getByText("Ready")).toBeInTheDocument());
    expect(within(vault).getByText("11111111...1111")).toBeInTheDocument();
    expect(within(vault).getByText("ogd_pair...7890")).toBeInTheDocument();
    expect(
      within(vault).getByText(
        "Local verify fixture restaged the desktop vault record without hosted deployment proof.",
      ),
    ).toBeInTheDocument();
  });

  it("clears a staged vault record and refreshes the local readiness state", async () => {
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.listInstalledGames.mockResolvedValue([]);
    launcherMocks.getRemoteCompanionDeviceSecretStatus.mockResolvedValue(readyDesktopVaultStatus);
    launcherMocks.clearRemoteCompanionDeviceSecret.mockResolvedValue(emptyDesktopVaultStatus);

    renderDownloadsRoute("/downloads");

    const vault = await screen.findByRole("region", {
      name: /remote companion desktop vault/i,
    });

    await waitFor(() => expect(within(vault).getByText("Ready")).toBeInTheDocument());

    fireEvent.click(within(vault).getByRole("button", { name: /Clear Vault/i }));

    await waitFor(() => expect(launcherMocks.clearRemoteCompanionDeviceSecret).toHaveBeenCalled());
    expect(within(vault).getByText("Desktop companion vault cleared.")).toBeInTheDocument();
    expect(within(vault).getByText("Browser Fallback")).toBeInTheDocument();
    expect(within(vault).getByText("Not linked")).toBeInTheDocument();
    expect(vault).not.toHaveTextContent(/desktop_secret|token=|signed url/i);
  });
});

describe("DownloadsPage remote companion poll redaction verify route", () => {
  it("mounts a sanitized relay poll status only on the verify route", async () => {
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.listInstalledGames.mockResolvedValue([]);

    const { unmount } = renderDownloadsRoute("/downloads");

    expect(screen.queryByText("[link-redacted]")).not.toBeInTheDocument();
    unmount();

    renderDownloadsRoute("/downloads?verify=remote-companion-poll-redaction");

    const panel = await screen.findByRole("region", { name: /Remote companion pairing/i });

    expect(panel).toHaveTextContent("OG-RED-321");
    expect(panel).toHaveTextContent("1 started");
    expect(panel).toHaveTextContent("token=[secret-redacted]");
    expect(panel).toHaveTextContent("sig=[secret-redacted]");
    expect(panel).toHaveTextContent("[link-redacted]");
    expect(panel).not.toHaveTextContent("https://relay.og-launcher.test");
    expect(panel).not.toHaveTextContent("oglauncher://");
    expect(panel).not.toHaveTextContent("relay-secret");
    expect(panel).not.toHaveTextContent("relay-signature");
  });
});

describe("DownloadsPage mobile app readiness", () => {
  it("mounts local Mobile App Readiness only on the verify route", async () => {
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.listInstalledGames.mockResolvedValue([]);

    const { unmount } = renderDownloadsRoute("/downloads");

    expect(screen.queryByRole("region", { name: /mobile app readiness/i })).not.toBeInTheDocument();
    unmount();

    renderDownloadsRoute("/downloads?verify=mobile-app-readiness");

    const panel = await screen.findByRole("region", { name: /mobile app readiness/i });

    expect(panel).toHaveTextContent("Mobile App Readiness");
    expect(panel).toHaveTextContent("Device Pairing");
    expect(panel).toHaveTextContent("Remote Downloads");
    expect(panel).toHaveTextContent("No native iOS/Android app");
    expect(panel).toHaveTextContent("No push notification send");
    expect(panel).toHaveTextContent("No app-store distribution");
    expect(panel).toHaveTextContent("No background mobile download");
    expect(panel).toHaveTextContent("No live hosted deployment");
    expect(panel).not.toHaveTextContent(/ios app shipped|push sent|app store live/i);
  });
});

describe("DownloadsPage mobile session library chat contract", () => {
  it("mounts the local no-write contract only on the verify route", async () => {
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.listInstalledGames.mockResolvedValue([]);

    const { unmount } = renderDownloadsRoute("/downloads");

    expect(
      screen.queryByRole("region", { name: /mobile session library chat contract/i }),
    ).not.toBeInTheDocument();
    unmount();

    renderDownloadsRoute("/downloads?verify=mobile-session-library-chat-contract");

    const panel = await screen.findByRole("region", {
      name: /mobile session library chat contract/i,
    });

    expect(within(panel).getByText("Session / Library / Chat")).toBeInTheDocument();
    expect(within(panel).getByText("Session Envelope")).toBeInTheDocument();
    expect(within(panel).getByText("Scoped Library Projection")).toBeInTheDocument();
    expect(within(panel).getByText("Chat Send Queue Policy")).toBeInTheDocument();
    expect(within(panel).getByText("No live mobile session")).toBeInTheDocument();
    expect(within(panel).getByText("No native iOS/Android app build")).toBeInTheDocument();
    expect(within(panel).getByText("No mobile auth/session write")).toBeInTheDocument();
    expect(within(panel).getByText("No raw access/refresh token")).toBeInTheDocument();
    expect(within(panel).getByText("No Supabase write from verify route")).toBeInTheDocument();
    expect(within(panel).getByText("No chat_messages insert")).toBeInTheDocument();
    expect(within(panel).getByText("No realtime subscription opened")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /native ios app ready|native android app ready|mobile session stored|access token stored|refresh token stored|chat sent|supabase write complete|apns request sent|fcm request sent|app store live|hosted production e2e passed/i,
    );
  });
});

describe("DownloadsPage mobile app push dry-run packet", () => {
  it("mounts the local push dry-run packet only on the verify route", async () => {
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.listInstalledGames.mockResolvedValue([]);

    const { unmount } = renderDownloadsRoute("/downloads");

    expect(
      screen.queryByRole("region", { name: /mobile app push dry-run packet/i }),
    ).not.toBeInTheDocument();
    unmount();

    renderDownloadsRoute("/downloads?verify=mobile-push-dry-run");

    const panel = await screen.findByRole("region", {
      name: /mobile app push dry-run packet/i,
    });

    expect(within(panel).getByText("Push Dry-Run Packet")).toBeInTheDocument();
    expect(within(panel).getByText("Target / Platform")).toBeInTheDocument();
    expect(within(panel).getByText("iOS / APNs staging")).toBeInTheDocument();
    expect(within(panel).getByText("Steam Deck Companion")).toBeInTheDocument();
    expect(within(panel).getByText("Remote install ready")).toBeInTheDocument();
    expect(within(panel).getByText("Consent staged")).toBeInTheDocument();
    expect(within(panel).getAllByText("Writes: none").length).toBeGreaterThan(0);
    expect(within(panel).getByText("No push notification send")).toBeInTheDocument();
    expect(within(panel).getByText("No APNs/FCM network call")).toBeInTheDocument();
    expect(within(panel).getByText("No device-token write")).toBeInTheDocument();
    expect(within(panel).getByText("No Supabase write")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /push sent|notification delivered|device token stored|supabase write complete|supabase write succeeded|apns request sent|fcm request sent|apns-live-device-token/i,
    );
  });
});

describe("DownloadsPage mobile push registration contract", () => {
  it("mounts the local registration contract only on the verify route", async () => {
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.listInstalledGames.mockResolvedValue([]);

    const { unmount } = renderDownloadsRoute("/downloads");

    expect(
      screen.queryByRole("region", { name: /mobile push registration contract/i }),
    ).not.toBeInTheDocument();
    unmount();

    renderDownloadsRoute("/downloads?verify=mobile-push-registration-contract");

    const panel = await screen.findByRole("region", {
      name: /mobile push registration contract/i,
    });

    expect(within(panel).getByText("Push Registration Contract")).toBeInTheDocument();
    expect(within(panel).getByText("iOS / APNs token hash")).toBeInTheDocument();
    expect(within(panel).getByText("Steam Deck Companion")).toBeInTheDocument();
    expect(
      within(panel).getByText("Verify route: no write; hosted Edge Function writes only"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Hosted Edge Function")).toBeInTheDocument();
    expect(within(panel).getByText("No raw device token")).toBeInTheDocument();
    expect(within(panel).getByText("No APNs/FCM send")).toBeInTheDocument();
    expect(within(panel).getByText("No verify-route Supabase write")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted Edge Function uses service role")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /apns-live-device-token|push sent|notification delivered|apns request sent|fcm request sent|device token stored|supabase write complete/i,
    );
  });
});

describe("DownloadsPage Smart Install provider telemetry readiness", () => {
  it("mounts the local provider telemetry readiness only on the verify route", async () => {
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.listInstalledGames.mockResolvedValue([]);

    const { unmount } = renderDownloadsRoute("/downloads");

    expect(
      screen.queryByRole("region", { name: /smart install provider telemetry readiness/i }),
    ).not.toBeInTheDocument();
    unmount();

    renderDownloadsRoute("/downloads?verify=smart-install-provider-telemetry");

    const panel = await screen.findByRole("region", {
      name: /smart install provider telemetry readiness/i,
    });

    expect(within(panel).getByText("Smart Install Telemetry")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Telemetry Dry-Run Contract")).toBeInTheDocument();
    expect(within(panel).getByText("Dry-Run Packet")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Telemetry")).toBeInTheDocument();
    expect(within(panel).getByText("Entitlement Check")).toBeInTheDocument();
    expect(within(panel).getByText("Mirror Measurement")).toBeInTheDocument();
    expect(within(panel).getByText("Entitlement + CDN Shape")).toBeInTheDocument();
    expect(within(panel).getByText("Offline Installer Shape")).toBeInTheDocument();
    expect(within(panel).getByText("LAN Peer Source Shape")).toBeInTheDocument();
    expect(within(panel).getByText("Local Mirror Measurement + Rank Diff")).toBeInTheDocument();
    expect(within(panel).getAllByText("Writes")).toHaveLength(2);
    expect(within(panel).getAllByText("Live Calls")).toHaveLength(2);
    expect(within(panel).getAllByText("none")).toHaveLength(4);
    expect(within(panel).getByText(/access_token=<redacted>/i)).toBeInTheDocument();
    expect(
      within(panel).getByText("https://downloads.og-launcher.local/<redacted-path>"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("lan://<redacted-peer>/<redacted-path>")).toBeInTheDocument();
    expect(within(panel).getByText("No live provider telemetry")).toBeInTheDocument();
    expect(within(panel).getByText("No entitlement API call")).toBeInTheDocument();
    expect(within(panel).getByText("No live mirror speed measurement")).toBeInTheDocument();
    expect(within(panel).getByText("No provider ranking sync")).toBeInTheDocument();
    expect(within(panel).getByText("No auto-purchase/download claim")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /live telemetry ready|entitlement verified|provider ranking synced|download started|auto purchase|signed ticket|raw token|direct download url|ticket=|auth=|secret-fixture/i,
    );
  });
});

describe("DownloadsPage LAN transfer native readiness", () => {
  it("keeps the planner verify route separate from the native readiness route", async () => {
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.listInstalledGames.mockResolvedValue([]);

    const base = renderDownloadsRoute("/downloads");

    expect(
      screen.queryByRole("region", { name: /lan transfer native readiness/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /lan native copy console/i }),
    ).not.toBeInTheDocument();
    base.unmount();

    const planner = renderDownloadsRoute("/downloads?verify=lan-transfer");

    expect((await screen.findAllByText("Living Room Rig")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Steam Deck Dock").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Guest Laptop").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("region", { name: /lan transfer native readiness/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /lan native copy console/i }),
    ).not.toBeInTheDocument();
    planner.unmount();

    renderDownloadsRoute("/downloads?verify=lan-transfer-readiness");

    const panel = await screen.findByRole("region", {
      name: /lan transfer native readiness/i,
    });

    expect(within(panel).getByText("Peer Discovery")).toBeInTheDocument();
    expect(within(panel).getByText("Pairing Trust")).toBeInTheDocument();
    expect(within(panel).getByText("Signed Device Trust")).toBeInTheDocument();
    expect(within(panel).getByText("No peer secret exchange")).toBeInTheDocument();
    expect(within(panel).getByText("No copy unlock from unsigned peers")).toBeInTheDocument();
    expect(within(panel).getByText("Copy Engine")).toBeInTheDocument();
    expect(within(panel).getByText("Firewall Handling")).toBeInTheDocument();
    expect(within(panel).getByText("Manifest Verification")).toBeInTheDocument();
    expect(within(panel).getByText("Firewall + Discovery Policy")).toBeInTheDocument();
    expect(within(panel).getByText("No automatic inbound rule creation")).toBeInTheDocument();
    expect(
      within(panel).getByText("Port probes stay redacted and rate-limited"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Peer Discovery Preflight")).toBeInTheDocument();
    expect(within(panel).getByText("No live LAN peer broadcast")).toBeInTheDocument();
    expect(within(panel).getByText("No trusted pairing exchange")).toBeInTheDocument();
    expect(within(panel).getByText("No firewall rule changes")).toBeInTheDocument();
    expect(within(panel).getByText("Local copy-job cancel only")).toBeInTheDocument();
    expect(within(panel).getByText("No automatic network share mount")).toBeInTheDocument();
    expect(
      within(panel).getByText(/Desktop can copy from a reachable source path/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText(/start cancellable local copy jobs/i)).toBeInTheDocument();
    expect(
      within(panel).getByText(/writes og-manifest\.json after verification/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /lan native copy console/i })).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /network copy started|peer discovered|trusted pairing established|peer secret exchanged|copy unlocked|peer transfer resumed|peer transfer cancelled|cleanup auto-deleted|firewall configured|post-copy verified/i,
    );
  });
});

describe("RemoteInstallHandoffBanner", () => {
  it.each<RemoteInstallHandoffNotice>([
    {
      detail: "Remote Demo is being passed to the download engine.",
      status: "pending",
      title: "Remote handoff pending",
    },
    {
      detail: "Remote Demo: Download started.",
      status: "accepted",
      title: "Remote handoff accepted",
    },
    {
      detail: "Remote Demo: URL rejected.",
      status: "failed",
      title: "Remote handoff failed",
    },
  ])("renders the $status handoff notice", (notice) => {
    render(<RemoteInstallHandoffBanner notice={notice} />);

    expect(screen.getByText(notice.title)).toBeInTheDocument();
    expect(screen.getByText(notice.detail)).toBeInTheDocument();
    expect(screen.getByText(notice.status)).toBeInTheDocument();
  });
});

describe("RemoteInstallHandoffLedger", () => {
  it("renders sanitized local handoff records and clears them", () => {
    const onClear = vi.fn();

    render(
      <RemoteInstallHandoffLedger
        onClear={onClear}
        records={[
          {
            downloadHost: "cdn.og-launcher.test",
            gameId: "remote-demo",
            hasDownloadSha256: true,
            hasInstallManifestSha256: false,
            id: "1",
            message: "Download started.",
            source: "web-dashboard",
            status: "accepted",
            timestamp: 1_780_000_000_000,
            title: "Remote Demo",
          },
          {
            gameId: "bad-demo",
            hasDownloadSha256: false,
            hasInstallManifestSha256: false,
            id: "2",
            message: "URL rejected.",
            source: "local-preview",
            status: "failed",
            timestamp: 1_780_000_000_100,
            title: "Blocked Demo",
          },
        ]}
      />,
    );

    expect(screen.getByText("Remote Handoff Ledger")).toBeInTheDocument();
    expect(screen.getByText("Remote Demo")).toBeInTheDocument();
    expect(screen.getByText("Blocked Demo")).toBeInTheDocument();
    expect(screen.getByText("Web Dashboard")).toBeInTheDocument();
    expect(screen.getByText("cdn.og-launcher.test")).toBeInTheDocument();
    expect(screen.queryByText(/https:\/\//i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Clear/i }));

    expect(onClear).toHaveBeenCalled();
  });
});
