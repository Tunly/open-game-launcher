import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const presencePollingReadinessPanelMock = vi.hoisted(() => vi.fn());
const tauriIsTauriMock = vi.hoisted(() => vi.fn(() => false));
const nativeSettingsMocks = vi.hoisted(() => ({
  dialogOpen: vi.fn(),
  disableAutostart: vi.fn(),
  enableAutostart: vi.fn(),
  isAutostartEnabled: vi.fn(),
}));

const launcherMocks = vi.hoisted(() => ({
  auditStagedPluginRegistry: vi.fn(() =>
    Promise.resolve({
      auditedAt: "2026-06-15T00:00:00.000Z",
      entries: [
        {
          codeExecuted: false,
          entrypoint: "dist/main.js",
          fileCount: 2,
          issues: [],
          keyId: "local-trusted",
          pluginId: "local-import-demo",
          registryPath: "app-data/plugins/staged/local-import-demo/1.0.0",
          signatureIssuer: "Local Test CA",
          status: "disabled-audited",
          version: "1.0.0",
        },
      ],
      failedCount: 0,
      passedCount: 1,
      registryPath: "app-data/plugins/staged",
      sourceLabel: "Native disabled registry audit",
    }),
  ),
  provePluginRuntimeSandbox: vi.fn(() =>
    Promise.resolve({
      allowedExecutionCount: 0,
      auditFailedCount: 0,
      auditPassedCount: 1,
      codeExecuted: false,
      deniedEntrypointCount: 1,
      entries: [
        {
          denyReason:
            "Owned process boundary proved; plugin entrypoint remains denied until the production runtime grants model exists.",
          entrypoint: "dist/main.js",
          issues: [],
          pluginId: "local-import-demo",
          registryPath: "app-data/plugins/staged/local-import-demo/1.0.0",
          status: "runtime-blocked",
          version: "1.0.0",
        },
      ],
      escapeAttempts: [
        {
          blockedBy: "entrypoint path containment",
          boundary: "path",
          id: "path-traversal-entrypoint",
          label: "Path Traversal Entrypoint",
          payload: "../secrets/token.txt",
          result: "blocked-by-admission",
        },
        {
          blockedBy: "deny-all IPC allowlist",
          boundary: "ipc",
          id: "ipc-open-shell",
          label: "Deny-All IPC Invoke",
          payload: "tauri.invoke('open_shell')",
          result: "blocked-by-admission",
        },
        {
          blockedBy: "no environment grants",
          boundary: "environment",
          id: "environment-secret-read",
          label: "Environment Secret Read",
          payload: "process.env.OG_SECRET",
          result: "blocked-by-admission",
        },
        {
          blockedBy: "disabled registry read-only containment",
          boundary: "filesystem",
          id: "filesystem-host-write",
          label: "Filesystem Host Write",
          payload: "/etc/hosts",
          result: "blocked-by-admission",
        },
        {
          blockedBy: "registry symlink ancestor rejection",
          boundary: "filesystem",
          id: "filesystem-symlink-entrypoint",
          label: "Symlink Entrypoint Escape",
          payload: "dist/linked-main.js -> /tmp/escape.js",
          result: "blocked-by-admission",
        },
        {
          blockedBy: "manifest path normalization",
          boundary: "path",
          id: "manifest-nested-path-escape",
          label: "Nested Manifest Path Escape",
          payload: "plugins/../manifest.json",
          result: "blocked-by-admission",
        },
        {
          blockedBy: "network IPC allowlist is empty",
          boundary: "ipc",
          id: "ipc-network-fetch",
          label: "Network IPC Fetch",
          payload: "tauri.invoke('fetch_url', 'https://plugins.example')",
          result: "blocked-by-admission",
        },
        {
          blockedBy: "deny-by-default permission ledger",
          boundary: "permission",
          id: "permission-process-spawn",
          label: "Permission Escalation",
          payload: "process:spawn",
          result: "blocked-by-admission",
        },
      ],
      ipcAllowlistReady: true,
      permissionGrantReady: false,
      processBoundaryReady: true,
      provedAt: "2026-06-15T00:02:00.000Z",
      registryPath: "app-data/plugins/staged",
      sourceLabel: "Native runtime sandbox proof-process",
    }),
  ),
  reviewPluginActivationPlan: vi.fn(() =>
    Promise.resolve({
      autoInstallAllowed: false,
      checks: [
        {
          detail: "Plugin code was not loaded.",
          id: "execution-denied",
          label: "Execution Denied",
          status: "blocked",
        },
      ],
      codeExecuted: false,
      downloadAttempted: false,
      entrypoint: "dist/main.js",
      installApplied: false,
      manifestHash: `sha256:${"a".repeat(64)}`,
      networkAllowed: false,
      permissionGrantsPersisted: false,
      pluginId: "local-import-demo",
      processBoundaryReady: true,
      registryPath: "app-data/plugins/staged/local-import-demo/1.0.0",
      reviewedAt: "2026-06-15T00:04:00.000Z",
      sourceLabel: "Native activation plan review",
      status: "blocked-production-sandbox",
      version: "1.0.0",
    }),
  ),
  reviewPluginMarketplaceUpdateIndexTrust: vi.fn(() =>
    Promise.resolve({
      autoUpdateAllowed: false,
      blockedCount: 0,
      catalogEntryCount: 1,
      downloadAllowed: false,
      entries: [
        {
          channel: "stable",
          issues: [],
          manifestHash: `sha256:${"a".repeat(64)}`,
          moderationStatus: "approved",
          pluginId: "local-import-demo",
          registryStatus: "disabled-audited",
          revoked: false,
          status: "trusted-disabled-match",
          version: "1.0.1",
        },
      ],
      indexPath: "/tmp/marketplace-index.json",
      installAllowed: false,
      matchedDisabledPackageCount: 1,
      registryPath: "app-data/plugins/staged",
      reviewedAt: "2026-06-15T00:08:00.000Z",
      revokedCount: 0,
      signatureIssuer: "Local Test CA",
      signatureKeyId: "local-trusted",
      signatureVerified: true,
      sourceLabel: "Native marketplace trust review",
    }),
  ),
  reviewPluginUpdateSigningEnvelope: vi.fn(() =>
    Promise.resolve({
      autoInstallBlocked: true,
      entries: [
        {
          autoInstall: false,
          channel: "stable",
          currentVersion: "1.0.0",
          issues: [],
          manifestHash: `sha256:${"a".repeat(64)}`,
          pluginId: "local-import-demo",
          proposedVersion: "1.0.1",
          rollbackVersion: "1.0.0",
          signatureIssuer: "Local Test CA",
          status: "review-only",
        },
      ],
      manifestHashReady: true,
      reviewedAt: "2026-06-15T00:05:00.000Z",
      rollbackPlanReady: true,
      signatureVerifiedCount: 1,
      sourceLabel: "Native update signing review",
    }),
  ),
  authenticateEpicLegendary: vi.fn(() => Promise.resolve("Epic authenticated.")),
  eaGetToken: vi.fn(() => Promise.resolve(null)),
  eaLogout: vi.fn(() => Promise.resolve()),
  fetchSteamProfileName: vi.fn(() => Promise.resolve("Steam User")),
  fetchXboxOwnedGames: vi.fn(() => Promise.resolve({ games: [], gamertag: "Xbox User" })),
  getDefaultInstallDir: vi.fn(() => Promise.resolve("/games")),
  getSystemInfo: vi.fn(() =>
    Promise.resolve({
      appVersion: "0.1.0",
      arch: "web",
      os: "Browser Preview",
    }),
  ),
  gogExchangeCode: vi.fn(() => Promise.resolve({ accessToken: "token" })),
  gogGetToken: vi.fn(() => Promise.resolve(null)),
  gogLogout: vi.fn(() => Promise.resolve()),
  normalizeSteamOwnedGames: vi.fn((games: unknown[]) => games),
  openBattleNetLoginWindow: vi.fn(() => Promise.resolve()),
  openEaLoginWindow: vi.fn(() => Promise.resolve()),
  openEpicLoginWindow: vi.fn(() => Promise.resolve()),
  openGogLoginWindow: vi.fn(() => Promise.resolve()),
  openSteamLoginWindow: vi.fn(() => Promise.resolve()),
  openXboxLoginWindow: vi.fn(() => Promise.resolve()),
  processBattleNetGamesPayload: vi.fn(() => Promise.resolve([])),
  stageSignedPluginPackage: vi.fn(() =>
    Promise.resolve({
      entrypoint: "dist/main.js",
      fileCount: 2,
      keyId: "local-trusted",
      message: "Signed plugin package staged as disabled; no plugin code was executed.",
      pluginId: "local-import-demo",
      registryPath: "app-data/plugins/staged/local-import-demo/1.0.0",
      signatureIssuer: "Local Test CA",
      status: "disabled",
      version: "1.0.0",
    }),
  ),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: tauriIsTauriMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: nativeSettingsMocks.dialogOpen,
}));

vi.mock("@tauri-apps/plugin-autostart", () => ({
  disable: nativeSettingsMocks.disableAutostart,
  enable: nativeSettingsMocks.enableAutostart,
  isEnabled: nativeSettingsMocks.isAutostartEnabled,
}));

vi.mock("../components/settings/ActivitySection", () => ({
  ActivitySection: () => <section aria-label="Activity settings mock" />,
}));

vi.mock("../components/settings/BackupRestoreSettings", () => ({
  BackupRestoreSettings: (props: {
    externalDriveDetectionFixture?: boolean;
    externalDriveEjectSafetyFixture?: boolean;
    externalDriveOsEjectFixture?: boolean;
    externalDriveWriteProofFixture?: boolean;
    showExternalDriveReadiness?: boolean;
  }) => (
    <section aria-label="Backup settings mock">
      {props.showExternalDriveReadiness ? <p>Backup external drive readiness mounted</p> : null}
      {props.externalDriveDetectionFixture ? (
        <p>Backup external drive detection fixture mounted</p>
      ) : null}
      {props.externalDriveWriteProofFixture ? (
        <p>Backup external drive write proof fixture mounted</p>
      ) : null}
      {props.externalDriveEjectSafetyFixture ? (
        <p>Backup external drive eject-safety fixture mounted</p>
      ) : null}
      {props.externalDriveOsEjectFixture ? (
        <p>Backup external drive OS eject fixture mounted</p>
      ) : null}
    </section>
  ),
}));

vi.mock("../components/settings/ClientUpdateSchedulerSettings", () => ({
  ClientUpdateSchedulerSettings: () => <section aria-label="Client scheduler mock" />,
}));

vi.mock("../components/settings/PlatformHealthPanel", () => ({
  PlatformHealthPanel: () => <section aria-label="Platform health mock" />,
}));

vi.mock("../components/settings/PluginSystemReadinessPanel", () => ({
  PluginSystemReadinessPanel: (props: {
    packageStaging?: {
      auditFailedCount?: number;
      auditPassedCount?: number;
      consentOperation?: string;
      runtimeProofAllowedCount?: number;
      runtimeProofDeniedCount?: number;
      onProveRuntimeSandbox?: () => void | Promise<void>;
      onAuditRegistry?: () => void | Promise<void>;
      onConsentOperationChange?: (value: string) => void;
      onPackagePathChange?: (value: string) => void;
      onStagePackage?: () => void | Promise<void>;
      packagePath?: string;
      stagedCount: number;
    };
    reviews?: {
      activationConsentOperation: string;
      activationPluginId: string;
      activationVersion: string;
      marketplaceIndexPath: string;
      message: string | null;
      updateEnvelopePath: string;
      onActivationConsentOperationChange: (value: string) => void;
      onActivationPluginIdChange: (value: string) => void;
      onActivationVersionChange: (value: string) => void;
      onMarketplaceIndexPathChange: (value: string) => void;
      onReviewActivationPlan: () => void | Promise<void>;
      onReviewMarketplaceIndex: () => void | Promise<void>;
      onReviewUpdateEnvelope: () => void | Promise<void>;
      onUpdateEnvelopePathChange: (value: string) => void;
    };
    readiness: {
      activationPlanReview?: {
        codeExecuted: boolean;
        status: string;
      } | null;
      disabledRegistryAudit?: { failedCount: number; passedCount: number } | null;
      progress: number;
      marketplaceTrust?: {
        matchedDisabledPackageCount: number;
        signatureVerified: boolean;
      } | null;
      runtimeSandboxProof?: {
        allowedExecutionCount: number;
        deniedEntrypointCount: number;
      } | null;
      signedPackageLedger?: unknown[];
      statusLabel: string;
      updateSigningReview?: {
        autoInstallBlocked: boolean;
        signatureVerifiedCount: number;
      } | null;
    };
  }) => (
    <section aria-label="Plugin system mock">
      Plugin status: {props.readiness.statusLabel} // {props.readiness.progress}% // packages{" "}
      {props.readiness.signedPackageLedger?.length ?? 0} // audit{" "}
      {props.readiness.disabledRegistryAudit
        ? `${props.readiness.disabledRegistryAudit.passedCount}/${props.readiness.disabledRegistryAudit.failedCount}`
        : "none"}{" "}
      // marketplace{" "}
      {props.readiness.marketplaceTrust
        ? `${props.readiness.marketplaceTrust.matchedDisabledPackageCount}/${String(
            props.readiness.marketplaceTrust.signatureVerified,
          )}`
        : "none"}{" "}
      // sandbox{" "}
      {props.readiness.runtimeSandboxProof
        ? `${props.readiness.runtimeSandboxProof.deniedEntrypointCount}/${props.readiness.runtimeSandboxProof.allowedExecutionCount}`
        : "none"}{" "}
      // update{" "}
      {props.readiness.updateSigningReview
        ? `${props.readiness.updateSigningReview.signatureVerifiedCount}/${String(
            props.readiness.updateSigningReview.autoInstallBlocked,
          )}`
        : "none"}{" "}
      // activation{" "}
      {props.readiness.activationPlanReview
        ? `${props.readiness.activationPlanReview.status}/${String(
            props.readiness.activationPlanReview.codeExecuted,
          )}`
        : "none"}{" "}
      // controls {props.packageStaging?.stagedCount ?? 0} // controls audit{" "}
      {props.packageStaging
        ? `${props.packageStaging.auditPassedCount ?? 0}/${props.packageStaging.auditFailedCount ?? 0}`
        : "none"}{" "}
      // controls sandbox{" "}
      {props.packageStaging
        ? `${props.packageStaging.runtimeProofDeniedCount ?? 0}/${props.packageStaging.runtimeProofAllowedCount ?? 0}`
        : "none"}{" "}
      // review message {props.reviews?.message ?? "none"}
      <button type="button" onClick={() => void props.packageStaging?.onAuditRegistry?.()}>
        Audit Registry Mock
      </button>
      <button type="button" onClick={() => void props.packageStaging?.onProveRuntimeSandbox?.()}>
        Sandbox Proof Mock
      </button>
      <input
        aria-label="Package path mock"
        value={props.packageStaging?.packagePath ?? ""}
        onChange={(event) => props.packageStaging?.onPackagePathChange?.(event.currentTarget.value)}
      />
      <input
        aria-label="Consent operation mock"
        value={props.packageStaging?.consentOperation ?? ""}
        onChange={(event) =>
          props.packageStaging?.onConsentOperationChange?.(event.currentTarget.value)
        }
      />
      <button type="button" onClick={() => void props.packageStaging?.onStagePackage?.()}>
        Stage Package Mock
      </button>
      <input
        aria-label="Activation plugin mock"
        value={props.reviews?.activationPluginId ?? ""}
        onChange={(event) => props.reviews?.onActivationPluginIdChange(event.currentTarget.value)}
      />
      <input
        aria-label="Activation version mock"
        value={props.reviews?.activationVersion ?? ""}
        onChange={(event) => props.reviews?.onActivationVersionChange(event.currentTarget.value)}
      />
      <input
        aria-label="Activation consent mock"
        value={props.reviews?.activationConsentOperation ?? ""}
        onChange={(event) =>
          props.reviews?.onActivationConsentOperationChange(event.currentTarget.value)
        }
      />
      <button type="button" onClick={() => void props.reviews?.onReviewActivationPlan()}>
        Review Activation Mock
      </button>
      <input
        aria-label="Update envelope mock"
        value={props.reviews?.updateEnvelopePath ?? ""}
        onChange={(event) => props.reviews?.onUpdateEnvelopePathChange(event.currentTarget.value)}
      />
      <button type="button" onClick={() => void props.reviews?.onReviewUpdateEnvelope()}>
        Review Update Mock
      </button>
      <input
        aria-label="Marketplace index mock"
        value={props.reviews?.marketplaceIndexPath ?? ""}
        onChange={(event) => props.reviews?.onMarketplaceIndexPathChange(event.currentTarget.value)}
      />
      <button type="button" onClick={() => void props.reviews?.onReviewMarketplaceIndex()}>
        Review Marketplace Mock
      </button>
    </section>
  ),
}));

vi.mock("../components/settings/PresencePollingReadinessPanel", () => ({
  PresencePollingReadinessPanel: (props: {
    connectedPlatforms?: Partial<Record<string, boolean>>;
    hostedCronStaging?: { workflow?: string; functionName?: string };
    now?: string;
    ownPresence?: { platformLastPolledAt?: string } | null;
    platformAccounts?: Array<{ platform: string }>;
    supabaseConfigured: boolean;
    trustedEvidence?: boolean;
  }) => {
    presencePollingReadinessPanelMock(props);

    return (
      <section aria-label="Presence polling mock">
        <p>Supabase configured: {String(props.supabaseConfigured)}</p>
        <p>Steam connected: {String(props.connectedPlatforms?.steam)}</p>
        <p>Epic connected: {String(props.connectedPlatforms?.epic)}</p>
        <p>GOG connected: {String(props.connectedPlatforms?.gog)}</p>
        <p>EA connected: {String(props.connectedPlatforms?.ea)}</p>
        <p>Xbox connected: {String(props.connectedPlatforms?.xbox)}</p>
        <p>Battle.net connected: {String(props.connectedPlatforms?.battlenet)}</p>
        <p>Ubisoft connected: {String(props.connectedPlatforms?.ubisoft)}</p>
        <p>Now: {props.now ?? "unset"}</p>
        <p>Hosted cron workflow: {props.hostedCronStaging?.workflow ?? "unset"}</p>
        <p>Hosted cron function: {props.hostedCronStaging?.functionName ?? "unset"}</p>
        <p>Trusted evidence: {String(props.trustedEvidence)}</p>
        <p>
          Platform accounts:{" "}
          {props.platformAccounts?.map((account) => account.platform).join(",") ?? "unset"}
        </p>
        <p>Last polled: {props.ownPresence?.platformLastPolledAt ?? "unset"}</p>
      </section>
    );
  },
}));

vi.mock("../lib/launcher", () => launcherMocks);

vi.mock("../lib/supabase/client", () => ({
  isSupabaseConfigured: false,
}));

import { SettingsPage } from "./SettingsPage";

function renderSettingsRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Suspense fallback={null}>
        <Routes>
          <Route element={<SettingsPage />} path="/settings" />
        </Routes>
      </Suspense>
    </MemoryRouter>,
  );
}

describe("SettingsPage One-Click Setup E2E readiness", () => {
  beforeEach(() => {
    presencePollingReadinessPanelMock.mockClear();
    tauriIsTauriMock.mockReturnValue(false);
    launcherMocks.auditStagedPluginRegistry.mockClear();
    launcherMocks.provePluginRuntimeSandbox.mockClear();
    launcherMocks.reviewPluginActivationPlan.mockClear();
    launcherMocks.reviewPluginMarketplaceUpdateIndexTrust.mockClear();
    launcherMocks.reviewPluginUpdateSigningEnvelope.mockClear();
    launcherMocks.stageSignedPluginPackage.mockClear();
    nativeSettingsMocks.dialogOpen.mockReset();
    nativeSettingsMocks.dialogOpen.mockResolvedValue(null);
    nativeSettingsMocks.disableAutostart.mockReset();
    nativeSettingsMocks.disableAutostart.mockResolvedValue(undefined);
    nativeSettingsMocks.enableAutostart.mockReset();
    nativeSettingsMocks.enableAutostart.mockResolvedValue(undefined);
    nativeSettingsMocks.isAutostartEnabled.mockReset();
    nativeSettingsMocks.isAutostartEnabled.mockResolvedValue(false);
    window.localStorage.clear();
  });

  it("does not render first-party cloud save management", () => {
    renderSettingsRoute("/settings");

    expect(screen.queryByText("E2E Cloud Saves")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /cloud saves mock/i })).not.toBeInTheDocument();
  });

  it("keeps native autostart disabled in browser preview and removes the fake game-update toggle", async () => {
    renderSettingsRoute("/settings");

    expect(screen.getByRole("switch", { name: "Start With System" })).toBeDisabled();
    expect(screen.queryByRole("switch", { name: "Auto-Update Games" })).not.toBeInTheDocument();
    expect(
      await screen.findByText(/login autostart is available in the desktop app/i),
    ).toBeVisible();
  });

  it("uses the native folder picker for the install target", async () => {
    tauriIsTauriMock.mockReturnValue(true);
    nativeSettingsMocks.dialogOpen.mockResolvedValueOnce("D:\\OG Games");
    renderSettingsRoute("/settings");

    fireEvent.click(await screen.findByRole("button", { name: "Choose Folder" }));

    await waitFor(() => {
      expect(nativeSettingsMocks.dialogOpen).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: "Choose OG install target",
      });
    });
    expect((await screen.findAllByText("D:\\OG Games")).length).toBeGreaterThan(0);
    expect(screen.getByText(/install target selected for setup review/i)).toBeVisible();
    const installTarget = screen
      .getByRole("heading", { name: "Install Target" })
      .closest("article");
    expect(installTarget).not.toBeNull();
    expect(within(installTarget as HTMLElement).getByText("warning")).toBeVisible();
    expect(installTarget).toHaveTextContent(
      "D:\\OG Games is selected for review only and is not applied to installs.",
    );
  });

  it("updates the real desktop autostart entry and verifies its state", async () => {
    tauriIsTauriMock.mockReturnValue(true);
    nativeSettingsMocks.isAutostartEnabled.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderSettingsRoute("/settings");

    const autostartSwitch = await screen.findByRole("switch", { name: "Start With System" });
    await waitFor(() => expect(nativeSettingsMocks.isAutostartEnabled).toHaveBeenCalledTimes(1));
    fireEvent.click(autostartSwitch);

    await waitFor(() => {
      expect(nativeSettingsMocks.enableAutostart).toHaveBeenCalledTimes(1);
      expect(autostartSwitch).toHaveAttribute("aria-checked", "true");
    });
    expect(screen.getByText("Login autostart enabled.")).toBeVisible();
  });

  it("mounts hosted/provider E2E readiness only on the verify route", async () => {
    const base = renderSettingsRoute("/settings");

    expect(
      screen.queryByRole("region", { name: /one-click setup e2e readiness/i }),
    ).not.toBeInTheDocument();
    base.unmount();

    const localOnly = renderSettingsRoute("/settings?verify=one-click-setup");

    expect(await screen.findByRole("region", { name: /one-click setup readiness/i })).toBeVisible();
    expect(screen.getByText("New PC Setup Tape")).toBeInTheDocument();
    expect(screen.getByText("83%")).toBeInTheDocument();
    expect(
      screen.getByText(
        "D:\\OGLauncher\\Games is selected for review only and is not applied to installs.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /one-click setup e2e readiness/i }),
    ).not.toBeInTheDocument();
    localOnly.unmount();

    renderSettingsRoute("/settings?verify=one-click-setup-e2e-readiness");

    const panel = await screen.findByRole("region", {
      name: /one-click setup e2e readiness/i,
    });

    expect(within(panel).getByText("Hosted Auth")).toBeInTheDocument();
    expect(within(panel).getByText("Provider OAuth")).toBeInTheDocument();
    expect(within(panel).getByText("Token Replay")).toBeInTheDocument();
    expect(within(panel).getByText("Silent Install")).toBeInTheDocument();
    expect(within(panel).getByText("Rollback Audit")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted auth E2E")).toBeInTheDocument();
    expect(within(panel).getByText("No OAuth/token replay")).toBeInTheDocument();
    expect(within(panel).getByText("No provider-approved silent install")).toBeInTheDocument();
    expect(within(panel).getByText("No consent/terms approval")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /(hosted auth verified|hosted session verified|oauth replay(?:ed| complete)|provider oauth replayed|token replay(?:ed| complete)|tokens? restored|keychain migrated|silent install (?:started|ready|complete)|provider install approved|auto-?install(?:ed| complete)?|setup (?:completed|replayed)|consent approved|terms approved|rollback verified|audit (?:verified|complete))/i,
    );
  });

  it("mounts backup external-drive readiness only on the verify route", () => {
    const base = renderSettingsRoute("/settings");

    expect(screen.getByRole("region", { name: /backup settings mock/i })).toBeVisible();
    expect(screen.queryByText("Backup external drive readiness mounted")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive detection fixture mounted"),
    ).not.toBeInTheDocument();
    base.unmount();

    renderSettingsRoute("/settings?verify=backup-external-drive-readiness");

    expect(screen.getByText("Backup external drive readiness mounted")).toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive detection fixture mounted"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive write proof fixture mounted"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive eject-safety fixture mounted"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive OS eject fixture mounted"),
    ).not.toBeInTheDocument();
  });

  it("passes the mounted backup external-drive detection fixture on the detection verify route", () => {
    renderSettingsRoute("/settings?verify=backup-external-drive-detection-mounted");

    expect(screen.getByText("Backup external drive readiness mounted")).toBeInTheDocument();
    expect(screen.getByText("Backup external drive detection fixture mounted")).toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive write proof fixture mounted"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive eject-safety fixture mounted"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive OS eject fixture mounted"),
    ).not.toBeInTheDocument();
  });

  it("passes the mounted backup external-drive write proof fixture on the proof verify route", () => {
    renderSettingsRoute("/settings?verify=backup-external-drive-write-proof");

    expect(screen.getByText("Backup external drive readiness mounted")).toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive detection fixture mounted"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Backup external drive write proof fixture mounted"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive eject-safety fixture mounted"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive OS eject fixture mounted"),
    ).not.toBeInTheDocument();
  });

  it("passes the mounted backup external-drive eject-safety fixture on the proof verify route", () => {
    renderSettingsRoute("/settings?verify=backup-external-drive-eject-safety-proof");

    expect(screen.getByText("Backup external drive readiness mounted")).toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive detection fixture mounted"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive write proof fixture mounted"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Backup external drive eject-safety fixture mounted"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive OS eject fixture mounted"),
    ).not.toBeInTheDocument();
  });

  it("passes the mounted backup external-drive OS eject fixture on the proof verify route", () => {
    renderSettingsRoute("/settings?verify=backup-external-drive-os-eject-proof");

    expect(screen.getByText("Backup external drive readiness mounted")).toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive detection fixture mounted"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive write proof fixture mounted"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Backup external drive eject-safety fixture mounted"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Backup external drive OS eject fixture mounted")).toBeInTheDocument();
  });

  it("passes plugin-system fixture readiness only on the plugin verify route", () => {
    const base = renderSettingsRoute("/settings");

    expect(screen.queryByRole("region", { name: /plugin system mock/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open diagnostics/i })).toHaveAttribute(
      "href",
      "/settings/diagnostics",
    );
    base.unmount();

    renderSettingsRoute("/settings?verify=plugin-system-readiness");

    expect(screen.getByRole("region", { name: /plugin system mock/i })).toHaveTextContent(
      "Plugin status: Local only // 67%",
    );
  });

  it("passes native disabled-registry audit evidence only on the audit verify route", () => {
    const base = renderSettingsRoute("/settings");

    expect(screen.queryByRole("region", { name: /plugin system mock/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open diagnostics/i })).toHaveAttribute(
      "href",
      "/settings/diagnostics",
    );
    base.unmount();

    renderSettingsRoute("/settings?verify=plugin-disabled-registry-audit");

    const panel = screen.getByRole("region", { name: /plugin system mock/i });
    expect(panel).toHaveTextContent("Plugin status: Local only // 67%");
    expect(panel).toHaveTextContent("packages 1 // audit 1/0");
    expect(panel).toHaveTextContent("controls audit 1/0");
  });

  it("passes runtime sandbox process-boundary proof only on the sandbox verify route", () => {
    const base = renderSettingsRoute("/settings");

    expect(screen.queryByRole("region", { name: /plugin system mock/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open diagnostics/i })).toHaveAttribute(
      "href",
      "/settings/diagnostics",
    );
    base.unmount();

    renderSettingsRoute("/settings?verify=plugin-runtime-sandbox-process-boundary");

    const panel = screen.getByRole("region", { name: /plugin system mock/i });
    expect(panel).toHaveTextContent("Plugin status: Local only // 67%");
    expect(panel).toHaveTextContent("sandbox 1/0");
    expect(panel).toHaveTextContent("controls sandbox 1/0");
  });

  it("passes update signing review evidence only on the update verify route", () => {
    const base = renderSettingsRoute("/settings");

    expect(screen.queryByRole("region", { name: /plugin system mock/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open diagnostics/i })).toHaveAttribute(
      "href",
      "/settings/diagnostics",
    );
    base.unmount();

    renderSettingsRoute("/settings?verify=plugin-update-signing-review");

    const panel = screen.getByRole("region", { name: /plugin system mock/i });
    expect(panel).toHaveTextContent("Plugin status: Local only // 78%");
    expect(panel).toHaveTextContent("update 1/true");
  });

  it("passes marketplace update-index trust evidence only on the marketplace trust verify route", () => {
    const base = renderSettingsRoute("/settings");

    expect(screen.queryByRole("region", { name: /plugin system mock/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open diagnostics/i })).toHaveAttribute(
      "href",
      "/settings/diagnostics",
    );
    base.unmount();

    renderSettingsRoute("/settings?verify=plugin-marketplace-update-index-trust");

    const panel = screen.getByRole("region", { name: /plugin system mock/i });
    expect(panel).toHaveTextContent("Plugin status: Needs hardening // 78%");
    expect(panel).toHaveTextContent("marketplace 1/true");
  });

  it("keeps disabled-registry audit evidence out of localStorage hydration", () => {
    window.localStorage.setItem(
      "og-launcher:plugin-disabled-registry-audit:v1",
      JSON.stringify({
        auditedAt: "2026-06-15T00:00:00.000Z",
        entries: [
          {
            codeExecuted: false,
            entrypoint: "dist/main.js",
            fileCount: 2,
            issues: [],
            keyId: "forged",
            pluginId: "forged-cache",
            registryPath: "app-data/plugins/staged/forged-cache/1.0.0",
            signatureIssuer: "Forged Cache",
            status: "disabled-audited",
            version: "1.0.0",
          },
        ],
        failedCount: 0,
        passedCount: 1,
        registryPath: "app-data/plugins/staged",
        sourceLabel: "Forged browser cache",
      }),
    );

    renderSettingsRoute("/settings?section=diagnostics");

    expect(screen.getByRole("region", { name: /plugin system mock/i })).toHaveTextContent(
      "audit none",
    );
  });

  it("keeps runtime sandbox proof evidence out of localStorage hydration", () => {
    window.localStorage.setItem(
      "og-launcher:plugin-runtime-sandbox-proof:v1",
      JSON.stringify({
        allowedExecutionCount: 0,
        auditFailedCount: 0,
        auditPassedCount: 1,
        codeExecuted: false,
        deniedEntrypointCount: 1,
        entries: [
          {
            denyReason: "Forged browser cache row.",
            entrypoint: "dist/main.js",
            issues: [],
            pluginId: "forged-cache",
            registryPath: "app-data/plugins/staged/forged-cache/1.0.0",
            status: "runtime-blocked",
            version: "1.0.0",
          },
        ],
        ipcAllowlistReady: false,
        permissionGrantReady: false,
        processBoundaryReady: false,
        provedAt: "2026-06-15T00:02:00.000Z",
        registryPath: "app-data/plugins/staged",
        sourceLabel: "Forged browser cache",
      }),
    );

    renderSettingsRoute("/settings?section=diagnostics");

    expect(screen.getByRole("region", { name: /plugin system mock/i })).toHaveTextContent(
      "sandbox none",
    );
  });

  it("keeps update signing review evidence out of localStorage hydration", () => {
    window.localStorage.setItem(
      "og-launcher:plugin-update-signing-review:v1",
      JSON.stringify({
        autoInstallBlocked: true,
        entries: [
          {
            autoInstall: false,
            channel: "stable",
            currentVersion: "0.3.1",
            issues: [],
            manifestHash: "sha256:forged",
            pluginId: "forged-cache",
            proposedVersion: "0.3.2",
            rollbackVersion: "0.3.1",
            signatureIssuer: "Forged Cache",
            status: "review-only",
          },
        ],
        manifestHashReady: true,
        reviewedAt: "2026-06-15T00:05:00.000Z",
        rollbackPlanReady: true,
        signatureVerifiedCount: 1,
        sourceLabel: "Forged browser cache",
      }),
    );

    renderSettingsRoute("/settings?section=diagnostics");

    expect(screen.getByRole("region", { name: /plugin system mock/i })).toHaveTextContent(
      "update none",
    );
  });

  it("keeps marketplace trust evidence out of localStorage hydration", () => {
    window.localStorage.setItem(
      "og-launcher:plugin-marketplace-update-index-trust:v1",
      JSON.stringify({
        autoUpdateAllowed: false,
        blockedCount: 0,
        catalogEntryCount: 1,
        downloadAllowed: false,
        entries: [],
        indexPath: "/tmp/forged-index.json",
        installAllowed: false,
        matchedDisabledPackageCount: 1,
        registryPath: "app-data/plugins/staged",
        reviewedAt: "2026-06-15T00:08:00.000Z",
        revokedCount: 0,
        signatureIssuer: "Forged Cache",
        signatureKeyId: "forged",
        signatureVerified: true,
        sourceLabel: "Forged browser cache",
      }),
    );

    renderSettingsRoute("/settings?section=diagnostics");

    expect(screen.getByRole("region", { name: /plugin system mock/i })).toHaveTextContent(
      "marketplace none",
    );
  });

  it("hydrates plugin-system readiness from local manifest discovery storage", () => {
    window.localStorage.setItem(
      "og-launcher:plugin-manifest-discovery:v1",
      JSON.stringify({
        discoveryPath: "local-plugin-fixtures.json",
        importedAt: "2026-06-13T10:00:00.000Z",
        manifests: [
          {
            entrypoint: "dist/main.js",
            id: "local-import-demo",
            name: "Local Import Demo",
            permissions: ["library:read"],
            signed: true,
            signatureIssuer: "Local Test CA",
            version: "1.0.0",
          },
        ],
        scannedFileCount: 1,
        skippedEntries: [],
        sourceLabel: "Browser JSON import",
      }),
    );

    renderSettingsRoute("/settings?section=diagnostics");

    expect(screen.getByRole("region", { name: /plugin system mock/i })).toHaveTextContent(
      "Plugin status: Local only // 44%",
    );
  });

  it("hydrates disabled signed package staging evidence without enabling runtime", () => {
    window.localStorage.setItem(
      "og-launcher:plugin-manifest-discovery:v1",
      JSON.stringify({
        discoveryPath: "local-plugin-fixtures.json",
        importedAt: "2026-06-13T10:00:00.000Z",
        manifests: [
          {
            entrypoint: "dist/main.js",
            id: "local-import-demo",
            name: "Local Import Demo",
            permissions: ["library:read"],
            signed: true,
            signatureIssuer: "Local Test CA",
            version: "1.0.0",
          },
        ],
        scannedFileCount: 1,
        skippedEntries: [],
        sourceLabel: "Browser JSON import",
      }),
    );
    window.localStorage.setItem(
      "og-launcher:plugin-signed-package-staging:v1",
      JSON.stringify({
        packages: [
          {
            detail: "Signed plugin package staged as disabled; no plugin code was executed.",
            entrypoint: "dist/main.js",
            fileCount: 2,
            keyId: "local-trusted",
            pluginId: "local-import-demo",
            registryPath: "app-data/plugins/staged/local-import-demo/1.0.0",
            signatureIssuer: "Local Test CA",
            status: "disabled",
            version: "1.0.0",
          },
        ],
        updatedAt: "2026-06-15T00:00:00.000Z",
      }),
    );

    renderSettingsRoute("/settings?section=diagnostics");

    const panel = screen.getByRole("region", { name: /plugin system mock/i });
    expect(panel).toHaveTextContent("Plugin status: Local only // 44%");
    expect(panel).toHaveTextContent("packages 1");
    expect(panel).toHaveTextContent("audit none");
    expect(panel).toHaveTextContent("marketplace none");
    expect(panel).toHaveTextContent("sandbox none");
    expect(panel).toHaveTextContent("update none");
    expect(panel).toHaveTextContent("activation none");
    expect(panel).toHaveTextContent("controls 1");
  });

  it("runs native disabled-registry audit into in-memory readiness state", async () => {
    tauriIsTauriMock.mockReturnValue(true);

    renderSettingsRoute("/settings?section=diagnostics");

    fireEvent.click(screen.getByRole("button", { name: /audit registry mock/i }));

    await waitFor(() =>
      expect(screen.getByRole("region", { name: /plugin system mock/i })).toHaveTextContent(
        "audit 1/0",
      ),
    );
    expect(launcherMocks.auditStagedPluginRegistry).toHaveBeenCalledTimes(1);
  });

  it("runs native runtime sandbox proof into in-memory readiness state", async () => {
    tauriIsTauriMock.mockReturnValue(true);

    renderSettingsRoute("/settings?section=diagnostics");

    fireEvent.click(screen.getByRole("button", { name: /sandbox proof mock/i }));

    await waitFor(() =>
      expect(screen.getByRole("region", { name: /plugin system mock/i })).toHaveTextContent(
        "sandbox 1/0",
      ),
    );
    expect(launcherMocks.provePluginRuntimeSandbox).toHaveBeenCalledWith({
      consent: {
        accepted: true,
        operation: "prove_plugin_runtime_sandbox_process_proof",
      },
    });
  });

  it("runs native activation-plan review into in-memory readiness state", async () => {
    tauriIsTauriMock.mockReturnValue(true);

    renderSettingsRoute("/settings?section=diagnostics");

    fireEvent.change(screen.getByLabelText(/activation plugin mock/i), {
      target: { value: "local-import-demo" },
    });
    fireEvent.change(screen.getByLabelText(/activation version mock/i), {
      target: { value: "1.0.0" },
    });
    fireEvent.change(screen.getByLabelText(/activation consent mock/i), {
      target: { value: "review_plugin_activation_plan:local-import-demo@1.0.0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /review activation mock/i }));

    await waitFor(() =>
      expect(screen.getByRole("region", { name: /plugin system mock/i })).toHaveTextContent(
        "activation blocked-production-sandbox/false",
      ),
    );
    expect(launcherMocks.reviewPluginActivationPlan).toHaveBeenCalledWith({
      consent: {
        accepted: true,
        operation: "review_plugin_activation_plan:local-import-demo@1.0.0",
      },
      pluginId: "local-import-demo",
      version: "1.0.0",
    });
  });

  it("runs native update-envelope review into in-memory readiness state", async () => {
    tauriIsTauriMock.mockReturnValue(true);

    renderSettingsRoute("/settings?section=diagnostics");

    fireEvent.change(screen.getByLabelText(/update envelope mock/i), {
      target: { value: "/tmp/local-import-demo-update-envelope.json" },
    });
    fireEvent.click(screen.getByRole("button", { name: /review update mock/i }));

    await waitFor(() =>
      expect(screen.getByRole("region", { name: /plugin system mock/i })).toHaveTextContent(
        "update 1/true",
      ),
    );
    expect(launcherMocks.reviewPluginUpdateSigningEnvelope).toHaveBeenCalledWith({
      consent: {
        accepted: true,
        operation: "review_plugin_update_signing_envelope",
      },
      envelopePath: "/tmp/local-import-demo-update-envelope.json",
    });
  });

  it("runs native marketplace-index review into in-memory readiness state", async () => {
    tauriIsTauriMock.mockReturnValue(true);

    renderSettingsRoute("/settings?section=diagnostics");

    fireEvent.change(screen.getByLabelText(/marketplace index mock/i), {
      target: { value: "/tmp/plugin-marketplace-index.json" },
    });
    fireEvent.click(screen.getByRole("button", { name: /review marketplace mock/i }));

    await waitFor(() =>
      expect(screen.getByRole("region", { name: /plugin system mock/i })).toHaveTextContent(
        "marketplace 1/true",
      ),
    );
    expect(launcherMocks.reviewPluginMarketplaceUpdateIndexTrust).toHaveBeenCalledWith({
      consent: {
        accepted: true,
        operation: "review_plugin_marketplace_update_index_trust",
      },
      indexPath: "/tmp/plugin-marketplace-index.json",
    });
  });

  it("clears in-memory plugin review evidence after a new package stage", async () => {
    tauriIsTauriMock.mockReturnValue(true);
    launcherMocks.stageSignedPluginPackage.mockResolvedValueOnce({
      entrypoint: "dist/main.js",
      fileCount: 2,
      keyId: "local-trusted",
      message: "Signed plugin package staged as disabled; no plugin code was executed.",
      pluginId: "local-import-demo",
      registryPath: "app-data/plugins/staged/local-import-demo/1.0.0",
      signatureIssuer: "Local Test CA",
      status: "disabled",
      version: "1.0.0",
    });

    renderSettingsRoute("/settings?section=diagnostics");

    fireEvent.click(screen.getByRole("button", { name: /audit registry mock/i }));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: /plugin system mock/i })).toHaveTextContent(
        "audit 1/0",
      ),
    );

    fireEvent.change(screen.getByLabelText(/activation plugin mock/i), {
      target: { value: "local-import-demo" },
    });
    fireEvent.change(screen.getByLabelText(/activation version mock/i), {
      target: { value: "1.0.0" },
    });
    fireEvent.change(screen.getByLabelText(/activation consent mock/i), {
      target: { value: "review_plugin_activation_plan:local-import-demo@1.0.0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /review activation mock/i }));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: /plugin system mock/i })).toHaveTextContent(
        "activation blocked-production-sandbox/false",
      ),
    );

    fireEvent.change(screen.getByLabelText(/update envelope mock/i), {
      target: { value: "/tmp/local-import-demo-update-envelope.json" },
    });
    fireEvent.click(screen.getByRole("button", { name: /review update mock/i }));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: /plugin system mock/i })).toHaveTextContent(
        "update 1/true",
      ),
    );

    fireEvent.change(screen.getByLabelText(/marketplace index mock/i), {
      target: { value: "/tmp/plugin-marketplace-index.json" },
    });
    fireEvent.click(screen.getByRole("button", { name: /review marketplace mock/i }));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: /plugin system mock/i })).toHaveTextContent(
        "marketplace 1/true",
      ),
    );

    fireEvent.change(screen.getByLabelText(/package path mock/i), {
      target: { value: "/tmp/local-import-demo" },
    });
    fireEvent.change(screen.getByLabelText(/consent operation mock/i), {
      target: { value: "stage_plugin_package:local-import-demo@1.0.0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /stage package mock/i }));

    await waitFor(() =>
      expect(screen.getByRole("region", { name: /plugin system mock/i })).toHaveTextContent(
        "audit none",
      ),
    );
    const panel = screen.getByRole("region", { name: /plugin system mock/i });
    expect(panel).toHaveTextContent("activation none");
    expect(panel).toHaveTextContent("update none");
    expect(panel).toHaveTextContent("marketplace none");
    expect(launcherMocks.stageSignedPluginPackage).toHaveBeenCalledTimes(1);
  });

  it("mounts client-manager mount/apply contract only on the verify route", async () => {
    const base = renderSettingsRoute("/settings");

    expect(
      screen.queryByRole("region", { name: /client manager mount apply contract/i }),
    ).not.toBeInTheDocument();
    base.unmount();

    renderSettingsRoute("/settings?verify=client-manager-mount-apply-contract");

    let panel: HTMLElement;
    await waitFor(() => {
      panel = screen.getByRole("region", {
        name: /client manager mount apply contract/i,
      });
      expect(within(panel).getByText("Mount Apply Contract")).toBeInTheDocument();
      expect(within(panel).getByText("Path Overlay Preflight")).toBeInTheDocument();
      expect(within(panel).getByText("Asset Cache Lookup")).toBeInTheDocument();
      expect(within(panel).getByText("Auto-Apply Guard")).toBeInTheDocument();
      const capabilities = within(panel).getByRole("region", {
        name: /client manager auto apply capability check/i,
      });
      expect(within(capabilities).getByText("Auto-Apply Capability Check")).toBeInTheDocument();
      expect(within(capabilities).getByText("Runtime Presence")).toBeInTheDocument();
      expect(within(capabilities).getByText("Install Target")).toBeInTheDocument();
      expect(within(capabilities).getByText("Free Disk Space")).toBeInTheDocument();
      expect(within(capabilities).getByText("Admin Review")).toBeInTheDocument();
      const matrix = within(panel).getByRole("region", {
        name: /client manager provider policy matrix/i,
      });
      expect(within(matrix).getByText("Provider Policy Matrix")).toBeInTheDocument();
      expect(within(matrix).getByText("Steam")).toBeInTheDocument();
      expect(within(matrix).getByText("Xbox App / PC Game Pass")).toBeInTheDocument();
      expect(
        within(matrix).getAllByText("No provider-approved launcher apply").length,
      ).toBeGreaterThan(0);
      expect(within(panel).getByText("No real provider mount application")).toBeInTheDocument();
      expect(within(panel).getByText("No provider auto-apply")).toBeInTheDocument();
      expect(within(panel).getByText("No rollback/unmount proof")).toBeInTheDocument();
      expect(panel).not.toHaveTextContent(
        /(real mount (?:applied|complete|ready|verified)|provider auto-apply(?: approved| complete| ready| verified)|symlink(?: created| ready)|junction(?: created| ready)|driver (?:installed|ready)|admin elevation (?:granted|ready)|destructive writes? (?:complete|ready)|client mutation (?:verified|complete)|terms approved|rollback (?:verified|complete)|unmount proof (?:verified|complete))/i,
      );
    });
  });

  it("loads the client-manager sandbox proof fixture on the sandbox verify route", async () => {
    renderSettingsRoute("/settings?verify=client-manager-mount-apply-sandbox-proof");

    await waitFor(() => {
      const panel = screen.getByRole("region", {
        name: /client manager mount apply contract/i,
      });
      const proofPanel = screen.getByRole("region", {
        name: /client manager sandbox apply rollback proof/i,
      });

      expect(within(panel).getByText("Sandbox rollback proof only")).toBeInTheDocument();
      expect(within(proofPanel).getByText("Apply / Rollback Rehearsal")).toBeInTheDocument();
      expect(within(proofPanel).getByText("Sandbox Proof Ready")).toBeInTheDocument();
      expect(proofPanel).toHaveTextContent("Provider Paths: not touched");
      expect(proofPanel).toHaveTextContent("Mounts Created: no");
    });
  });

  it("passes the presence evidence fixture to the presence polling readiness panel", () => {
    renderSettingsRoute("/settings?verify=presence-evidence");

    const panel = screen.getByRole("region", { name: /presence polling mock/i });
    expect(panel).toHaveTextContent("Supabase configured: true");
    expect(panel).toHaveTextContent("Steam connected: true");
    expect(panel).toHaveTextContent("Epic connected: true");
    expect(panel).toHaveTextContent("GOG connected: true");
    expect(panel).toHaveTextContent("EA connected: true");
    expect(panel).toHaveTextContent("Xbox connected: true");
    expect(panel).toHaveTextContent("Battle.net connected: true");
    expect(panel).toHaveTextContent("Ubisoft connected: true");
    expect(panel).toHaveTextContent("Now: 2026-06-11T10:00:00.000Z");
    expect(panel).toHaveTextContent("Hosted cron workflow: hosted_deploy_gate");
    expect(panel).toHaveTextContent("Hosted cron function: poll-platform-presence");
    expect(panel).toHaveTextContent("Platform accounts: steam,epic,gog,ea,xbox,battlenet,ubisoft");
    expect(panel).toHaveTextContent("Last polled: 2026-06-11T09:59:45.000Z");

    expect(presencePollingReadinessPanelMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        connectedPlatforms: expect.objectContaining({
          battlenet: true,
          ea: true,
          epic: true,
          gog: true,
          steam: true,
          ubisoft: true,
          xbox: true,
        }),
        now: "2026-06-11T10:00:00.000Z",
        hostedCronStaging: expect.objectContaining({
          functionName: "poll-platform-presence",
          secretEnv: "PRESENCE_POLL_SECRET",
          workflow: "hosted_deploy_gate",
        }),
        ownPresence: expect.objectContaining({
          platformLastPolledAt: "2026-06-11T09:59:45.000Z",
        }),
        platformAccounts: [
          expect.objectContaining({ platform: "steam" }),
          expect.objectContaining({ platform: "epic" }),
          expect.objectContaining({ platform: "gog" }),
          expect.objectContaining({ platform: "ea" }),
          expect.objectContaining({ platform: "xbox" }),
          expect.objectContaining({ platform: "battlenet" }),
          expect.objectContaining({ platform: "ubisoft" }),
        ],
        supabaseConfigured: true,
      }),
    );
  });

  it("passes scheduled presence evidence fixture to the readiness panel", () => {
    renderSettingsRoute("/settings?verify=presence-scheduled-evidence");

    const panel = screen.getByRole("region", { name: /presence polling mock/i });
    expect(panel).toHaveTextContent("Supabase configured: true");
    expect(panel).toHaveTextContent("Steam connected: true");
    expect(panel).toHaveTextContent("Epic connected: false");
    expect(panel).toHaveTextContent("Now: 2026-06-14T13:32:00.000Z");
    expect(panel).toHaveTextContent("Hosted cron workflow: unset");
    expect(panel).toHaveTextContent("Trusted evidence: true");
    expect(panel).toHaveTextContent("Platform accounts: steam");
    expect(panel).toHaveTextContent("Last polled: 2026-06-14T13:31:00.000Z");

    expect(presencePollingReadinessPanelMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        connectedPlatforms: expect.objectContaining({
          epic: false,
          steam: true,
        }),
        now: "2026-06-14T13:32:00.000Z",
        hostedCronStaging: undefined,
        ownPresence: expect.objectContaining({
          platformLastPolledAt: "2026-06-14T13:31:00.000Z",
        }),
        platformAccounts: [expect.objectContaining({ platform: "steam" })],
        supabaseConfigured: true,
        trustedEvidence: true,
      }),
    );
  });
});

describe("SettingsPage One-Click Setup rollback/audit contract", () => {
  beforeEach(() => {
    presencePollingReadinessPanelMock.mockClear();
    tauriIsTauriMock.mockReturnValue(false);
    launcherMocks.auditStagedPluginRegistry.mockClear();
    launcherMocks.provePluginRuntimeSandbox.mockClear();
    window.localStorage.clear();
  });

  it("mounts rollback/audit contract only on the verify route", async () => {
    const base = renderSettingsRoute("/settings");

    expect(
      screen.queryByRole("region", { name: /one-click setup rollback audit contract/i }),
    ).not.toBeInTheDocument();
    base.unmount();

    renderSettingsRoute("/settings?verify=one-click-setup-rollback-audit-contract");

    const panel = await screen.findByRole("region", {
      name: /one-click setup rollback audit contract/i,
    });

    expect(screen.getByText("New PC Setup Tape")).toBeInTheDocument();
    expect(within(panel).getByText("Setup Rollback Audit")).toBeInTheDocument();
    expect(within(panel).getByText("Setup Step Ledger")).toBeInTheDocument();
    expect(within(panel).getByText("Undo / Cleanup Order")).toBeInTheDocument();
    expect(within(panel).getByText("Partial Failure Map")).toBeInTheDocument();
    expect(within(panel).getByText("Audit Envelope")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted auth E2E")).toBeInTheDocument();
    expect(within(panel).getByText("No rollback execution or success claim")).toBeInTheDocument();
    expect(within(panel).getByText("No audit row persisted")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /(hosted auth verified|oauth replayed|token restored|silent install complete|automatic install started|setup completed|rollback verified|cleanup complete|audit row inserted|production deployment verified)/i,
    );
  });
});

describe("SettingsPage hosted cron evidence summary", () => {
  beforeEach(() => {
    presencePollingReadinessPanelMock.mockClear();
    tauriIsTauriMock.mockReturnValue(false);
    launcherMocks.auditStagedPluginRegistry.mockClear();
    launcherMocks.provePluginRuntimeSandbox.mockClear();
    window.localStorage.clear();
  });

  it("mounts hosted cron evidence summary only on the verify route", async () => {
    const base = renderSettingsRoute("/settings");

    expect(
      screen.queryByRole("region", { name: /hosted cron evidence summary/i }),
    ).not.toBeInTheDocument();
    base.unmount();

    renderSettingsRoute("/settings?verify=hosted-cron-evidence-summary");

    const panel = await screen.findByRole("region", {
      name: /hosted cron evidence summary/i,
    });

    expect(within(panel).getByText("Hosted Cron Evidence")).toBeInTheDocument();
    expect(within(panel).getByText("Price-Drop Scheduler")).toBeInTheDocument();
    expect(within(panel).getByText("Account Deletion Processor")).toBeInTheDocument();
    expect(within(panel).getByText("Presence Polling")).toBeInTheDocument();
    expect(panel).toHaveTextContent("trigger_source=scheduled");
    expect(panel).toHaveTextContent("valid aggregate counts");
    expect(panel).toHaveTextContent("failed_count=0");
    expect(panel).toHaveTextContent("safe Supabase REST target");
    expect(panel).toHaveTextContent("external dashboard/config proof");
    expect(
      within(panel).getByText("Scheduler origin must be trigger_source=scheduled"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Dashboard or config proof required")).toBeInTheDocument();
    expect(
      within(panel).getByText("Manual authorized calls do not substitute"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Missing aggregate count blocks evidence")).toBeInTheDocument();
    expect(within(panel).getByText("Invalid aggregate count blocks evidence")).toBeInTheDocument();
    expect(within(panel).getByText("failed_count must be zero")).toBeInTheDocument();
    expect(within(panel).getByText("Unsafe REST targets are blocked")).toBeInTheDocument();
    expect(within(panel).getByText("Dry-run rows do not pass")).toBeInTheDocument();
    expect(within(panel).getByText("Stale rows do not pass")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /(live cron ready|scheduler verified|manual call accepted|secret leaked|sk_live|production deployment verified|stripe webhook verified)/i,
    );
  });
});

describe("SettingsPage external completion evidence summary", () => {
  beforeEach(() => {
    presencePollingReadinessPanelMock.mockClear();
    tauriIsTauriMock.mockReturnValue(false);
    launcherMocks.auditStagedPluginRegistry.mockClear();
    launcherMocks.provePluginRuntimeSandbox.mockClear();
    window.localStorage.clear();
  });

  it("mounts external completion evidence summary only on the verify route", async () => {
    const base = renderSettingsRoute("/settings");

    expect(
      screen.queryByRole("region", { name: /external completion evidence summary/i }),
    ).not.toBeInTheDocument();
    base.unmount();

    renderSettingsRoute("/settings?verify=external-completion-evidence-summary");

    const panel = await screen.findByRole("region", {
      name: /external completion evidence summary/i,
    });

    expect(within(panel).getByText("External Completion Evidence")).toBeInTheDocument();
    expect(within(panel).getAllByText("Store and Stripe live staging").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Hosted Supabase cron").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Provider live integrations").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Hardware and OS E2E").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Rollout tracks").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Operator Commands").length).toBeGreaterThan(0);
    const releaseCommands = within(panel).getByRole("group", {
      name: /release boundary commands/i,
    });
    expect(within(releaseCommands).getByText("pnpm external:evidence:next")).toBeInTheDocument();
    expect(
      within(releaseCommands).getByText("pnpm external:evidence:worklist"),
    ).toBeInTheDocument();
    expect(within(releaseCommands).getByText("pnpm external:evidence:packet")).toBeInTheDocument();
    expect(within(releaseCommands).getByText("pnpm external:evidence:runbook")).toBeInTheDocument();
    expect(
      within(releaseCommands).getByText("pnpm external:evidence:preflight"),
    ).toBeInTheDocument();
    expect(within(releaseCommands).getByText("pnpm completion:gate:external")).toBeInTheDocument();
    expect(within(panel).getAllByText("pnpm external:evidence:packet")).toHaveLength(1);
    const artifactSnapshot = within(panel).getByRole("group", {
      name: /committed external artifact snapshot/i,
    });
    expect(within(artifactSnapshot).getByText("Committed Artifact Snapshot")).toBeInTheDocument();
    expect(
      within(artifactSnapshot).getByRole("article", { name: /^Readable:/ }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(
        "OGL_EXTERNAL_EVIDENCE_GATES=store-stripe-live pnpm external:evidence:status",
      ),
    ).toBeInTheDocument();
    expect(within(panel).getAllByText("Artifact Proof Map").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Next Operator Action").length).toBe(5);
    expect(
      within(panel).getByText(
        "Set 4 non-placeholder environment value(s), then rerun OGL_EXTERNAL_EVIDENCE_GATES=store-stripe-live pnpm external:evidence:status.",
      ),
    ).toBeInTheDocument();
    expect(
      within(panel).getAllByText(
        "Capture real external proof, then check the assigned artifact row(s) only after evidence is attached.",
      ).length,
    ).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Secret Scan").length).toBeGreaterThan(0);
    expect(
      within(panel).getAllByText(/Secret Scan: Clean; no raw secrets rendered/i).length,
    ).toBeGreaterThan(0);
    expect(within(panel).queryByText("Not checked: 2 missing/unreadable")).not.toBeInTheDocument();
    expect(
      within(panel).queryAllByText(/Secret Scan: Not checked until artifact is readable/i).length,
    ).toBe(0);
    expect(within(panel).getByText("No-Write Completion Guard")).toBeInTheDocument();
    expect(within(panel).getByText("No external proof claim")).toBeInTheDocument();
    expect(
      within(panel).getByText("No live Stripe webhook or Dashboard proof"),
    ).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /(external completion complete|production ready|production deployment verified|scheduler verified|provider approved|dashboard verified|sk_live|whsec_)/i,
    );
  });
});

describe("SettingsPage Steam hosted relay", () => {
  beforeEach(() => {
    tauriIsTauriMock.mockReturnValue(false);
    window.localStorage.clear();
  });

  it("shows the secret-free hosted boundary and preserves the local fallback state", () => {
    window.localStorage.setItem("launcher.steamId", JSON.stringify("76561198000000000"));
    window.localStorage.setItem("launcher.steamUsername", JSON.stringify("Manga Pilot"));

    renderSettingsRoute("/settings");

    expect(screen.getByText(/No provider secret is shipped in the launcher/i)).toBeInTheDocument();
    expect(screen.getByText("Manga Pilot")).toBeInTheDocument();
    expect(screen.getByText("Local fallback")).toBeInTheDocument();
  });
});
