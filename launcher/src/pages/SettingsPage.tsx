import {
  Activity,
  FolderOpen,
  HardDrive,
  Power,
  RefreshCw,
  ShieldCheck,
  Link as LinkIcon,
  LogOut,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { z } from "zod";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import {
  getDefaultInstallDir,
  getSystemInfo,
  isSteamScrapedGamesEventForAccount,
  isSteamScrapeErrorEventForAccount,
  normalizeSteamLoginSuccessEvent,
  openSteamLoginWindow,
  openGogLoginWindow,
  openEpicLoginWindow,
  openEaLoginWindow,
  openXboxLoginWindow,
  fetchXboxOwnedGames,
  normalizeSteamOwnedGames,
  fetchSteamProfileName,
  authenticateEpicLegendary,
  gogExchangeCode,
  gogLogout,
  gogGetToken,
  eaGetToken,
  eaLogout,
  openBattleNetLoginWindow,
  processBattleNetGamesPayload,
  proveClientManagerMountApplySandbox,
} from "../lib/launcher";
import { readLocalStorageString } from "../lib/library-providers";
import {
  activateSteamAccount,
  clearSteamAccount,
  writeSteamOwnedGamesCache,
} from "../lib/steam-owned-games-cache";
import { STORAGE_KEYS } from "../lib/storage-keys";
import {
  clearEpicSessionMarker,
  clearLegacyEaTokenCopy,
  clearLegacyGogTokenCopy,
  clearLegacyPlatformTokenCopies,
  readEpicSessionMarker,
  writeEpicSessionMarker,
} from "../lib/platform-token-storage";
import type { ClientManagerMountApplySandboxProof, SystemInfo } from "../lib/types";
import { ClientUpdateSchedulerSettings } from "../components/settings/ClientUpdateSchedulerSettings";
import { LauncherUpdatePanel } from "../components/settings/LauncherUpdatePanel";
import { OneClickSetupReadinessPanel } from "../components/settings/OneClickSetupReadinessPanel";
import { PlatformHealthPanel } from "../components/settings/PlatformHealthPanel";
import { PresencePollingReadinessPanel } from "../components/settings/PresencePollingReadinessPanel";

const LazyActivitySection = React.lazy(() =>
  import("../components/settings/ActivitySection").then((m) => ({ default: m.ActivitySection })),
);
const LazyBackupRestoreSettings = React.lazy(() =>
  import("../components/settings/BackupRestoreSettings").then((m) => ({
    default: m.BackupRestoreSettings,
  })),
);
const LazyClientManagerMountApplyContractPanel = React.lazy(() =>
  import("../components/settings/ClientManagerMountApplyContractPanel").then((m) => ({
    default: m.ClientManagerMountApplyContractPanel,
  })),
);
const LazyExternalCompletionEvidenceSummaryPanel = React.lazy(() =>
  import("../components/settings/ExternalCompletionEvidenceSummaryPanel").then((m) => ({
    default: m.ExternalCompletionEvidenceSummaryPanel,
  })),
);
const LazyHostedCronEvidenceSummaryPanel = React.lazy(() =>
  import("../components/settings/HostedCronEvidenceSummaryPanel").then((m) => ({
    default: m.HostedCronEvidenceSummaryPanel,
  })),
);
const LazyOneClickSetupE2EReadinessPanel = React.lazy(() =>
  import("../components/settings/OneClickSetupE2EReadinessPanel").then((m) => ({
    default: m.OneClickSetupE2EReadinessPanel,
  })),
);
const LazyOneClickSetupRollbackAuditContractPanel = React.lazy(() =>
  import("../components/settings/OneClickSetupRollbackAuditContractPanel").then((m) => ({
    default: m.OneClickSetupRollbackAuditContractPanel,
  })),
);
const LazyPluginDiagnosticsPanel = React.lazy(() =>
  import("../components/settings/PluginDiagnosticsPanel").then((module) => ({
    default: module.PluginDiagnosticsPanel,
  })),
);
import type {
  PresenceHostedCronStagingEvidence,
  PresenceReadinessPlatformAccount,
  PresenceReadinessUserPresence,
} from "../lib/presence-readiness";
import type { PlatformType } from "../lib/types/friends";
import { isSupabaseConfigured } from "../lib/supabase/client";
import {
  getMyVerifiedSteamPlatformAccount,
  unlinkPlatformAccount,
} from "../lib/supabase/platform-accounts";
import {
  linkSteamAccountThroughHostedVerifier,
  type SteamHostedPlatformAccount,
} from "../lib/supabase/steam-hosted-relay";
import {
  buildOneClickSetupReadiness,
  type OneClickSetupPlatformEvidence,
} from "../lib/one-click-setup-readiness";
import {
  createVerifyClientManagerMountApplyContract,
  createVerifyClientManagerMountApplySandboxProof,
} from "../lib/client-manager-mount-apply-contract";
import { createVerifyOneClickSetupE2EReadiness } from "../lib/one-click-setup-e2e-readiness";
import { createVerifyOneClickSetupRollbackAuditContract } from "../lib/one-click-setup-rollback-audit-contract";
import { createVerifyExternalCompletionEvidenceSummary } from "../lib/external-completion-evidence-summary";
import { createVerifyHostedCronEvidenceSummary } from "../lib/hosted-cron-evidence-summary";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const settingSchemas = {
  steamId: z.string().max(64),
  steamUsername: z.string().max(128),
};

const presenceReadinessVerifyNow = "2026-06-11T10:00:00.000Z";
const presenceHostedCronStagingEvidence: PresenceHostedCronStagingEvidence = {
  dryRunPayload:
    '{"dryRun":true,"force":false,"limit":1,"platforms":["og"],"triggerSource":"hosted_deploy_gate"}',
  environment: "hosted-staging",
  expectedNoWriteKeys: [
    "presenceUpdated: 0",
    "activityInserted: 0",
    "evidenceRecorded: true",
    "runId present",
  ],
  functionName: "poll-platform-presence",
  reviewedAt: "2026-06-14T13:30:00.000Z",
  runbookPath: "docs/runbooks/hosted-deploy-gate.md",
  schedulerCadence: "every minute after smoke passes",
  schedulerPayload: '{"dryRun":false,"force":false,"limit":100,"triggerSource":"scheduled"}',
  secretEnv: "PRESENCE_POLL_SECRET",
  status: "pass",
  workflow: "hosted_deploy_gate",
};
const createPresenceProviderBridgeAccount = (
  platform: Exclude<PlatformType, "og" | "steam">,
  input: {
    authBoundary: string;
    evidence: string;
    fetchedAt: string;
    reason?: string;
    requestShape: string;
    responseShape: string;
    retryAfterSeconds?: number;
    runId: string;
    source: string;
    status: "blocked" | "pass" | "warning";
    tokenHandling: string;
  },
): PresenceReadinessPlatformAccount => ({
  metadata: {
    presencePollCache: {
      dryRun: true,
      fetchedAt: input.fetchedAt,
      platform,
      reason: input.reason,
      retryAfterSeconds: input.retryAfterSeconds,
      runId: input.runId,
      source: input.source,
      status: input.reason ? undefined : "online",
      writeMode: "dry-run",
    },
    presenceProviderBridgeContract: {
      authBoundary: input.authBoundary,
      evidence: input.evidence,
      requestShape: input.requestShape,
      responseShape: input.responseShape,
      status: input.status,
      tokenHandling: input.tokenHandling,
    },
  },
  platform,
});
const presenceReadinessVerifyAccounts: PresenceReadinessPlatformAccount[] = [
  {
    metadata: {
      presencePollCache: {
        dryRun: true,
        fetchedAt: "2026-06-11T09:59:30.000Z",
        platform: "steam",
        runId: "presence-dry-run-steam-001",
        source: "steam_web_api",
        status: "online",
        writeMode: "dry-run",
      },
    },
    platform: "steam",
  },
  createPresenceProviderBridgeAccount("epic", {
    authBoundary: "EPIC_PRESENCE_ENDPOINT plus redacted provider relay token",
    evidence: "Provider returned an error-shaped fixture; launcher records no writeback.",
    fetchedAt: "2026-06-11T09:59:25.000Z",
    reason: "provider-error",
    requestShape: "POST /presence/epic { platformUserId, runId, dryRun }",
    responseShape: "{ status, gameTitle?, privacy, errorCode }",
    runId: "presence-dry-run-epic-001",
    source: "epic_presence_endpoint",
    status: "warning",
    tokenHandling: "Bearer token redacted before cache/writeback review",
  }),
  createPresenceProviderBridgeAccount("gog", {
    authBoundary: "GOG_PRESENCE_ENDPOINT not configured in this local fixture",
    evidence: "Missing-provider path is explicit and does not mark bridge coverage ready.",
    fetchedAt: "2026-06-11T09:59:20.000Z",
    reason: "missing-provider",
    requestShape: "POST /presence/gog { platformUserId, dryRun }",
    responseShape: "{ status, galaxyState?, reason }",
    runId: "presence-dry-run-gog-001",
    source: "gog_presence_endpoint",
    status: "blocked",
    tokenHandling: "No provider token present in browser metadata",
  }),
  createPresenceProviderBridgeAccount("ea", {
    authBoundary: "EA_PRESENCE_ENDPOINT through hosted relay only",
    evidence: "Successful local response fixture staged for parser review only.",
    fetchedAt: "2026-06-11T09:59:18.000Z",
    requestShape: "POST /presence/ea { platformUserId, runId, dryRun }",
    responseShape: "{ status: online, titleId?, titleName? }",
    runId: "presence-dry-run-ea-001",
    source: "ea_presence_endpoint",
    status: "pass",
    tokenHandling: "Token hint stored as sha256 prefix only",
  }),
  createPresenceProviderBridgeAccount("xbox", {
    authBoundary: "XBOX_PRESENCE_ENDPOINT with provider rate-limit handling",
    evidence: "Rate-limit fixture keeps retry metadata visible without claiming coverage.",
    fetchedAt: "2026-06-11T09:59:15.000Z",
    reason: "rate-limited",
    requestShape: "POST /presence/xbox { xuid, runId, dryRun }",
    responseShape: "{ status?, retryAfterSeconds, reason }",
    retryAfterSeconds: 120,
    runId: "presence-dry-run-xbox-001",
    source: "xbox_presence_endpoint",
    status: "warning",
    tokenHandling: "Provider token never leaves hosted relay boundary",
  }),
  createPresenceProviderBridgeAccount("battlenet", {
    authBoundary: "BATTLENET_PRESENCE_ENDPOINT through hosted relay only",
    evidence: "Successful local response fixture staged for shape and redaction review.",
    fetchedAt: "2026-06-11T09:59:12.000Z",
    requestShape: "POST /presence/battlenet { battleTagHash, runId, dryRun }",
    responseShape: "{ status: away, gameSlug?, region? }",
    runId: "presence-dry-run-battlenet-001",
    source: "battlenet_presence_endpoint",
    status: "pass",
    tokenHandling: "BattleTag hash only; OAuth token redacted",
  }),
  createPresenceProviderBridgeAccount("ubisoft", {
    authBoundary: "UBISOFT_PRESENCE_ENDPOINT staged behind hosted relay",
    evidence: "Provider-error fixture verifies redacted failure payload handling.",
    fetchedAt: "2026-06-11T09:59:10.000Z",
    reason: "provider-error",
    requestShape: "POST /presence/ubisoft { accountId, runId, dryRun }",
    responseShape: "{ status?, titleId?, errorCode }",
    runId: "presence-dry-run-ubisoft-001",
    source: "ubisoft_presence_endpoint",
    status: "warning",
    tokenHandling: "Access token omitted; only redacted token hint allowed",
  }),
];
const presenceReadinessVerifyPresence: PresenceReadinessUserPresence = {
  platformLastPolledAt: "2026-06-11T09:59:45.000Z",
};
const presenceScheduledEvidenceVerifyNow = "2026-06-14T13:32:00.000Z";
const presenceScheduledEvidenceAccounts: PresenceReadinessPlatformAccount[] = [
  {
    metadata: {
      presencePollCache: {
        fetchedAt: "2026-06-14T13:31:00.000Z",
        platform: "steam",
        runId: "presence-run-scheduled-001",
        source: "steam_web_api",
        status: "online",
      },
    },
    platform: "steam",
  },
];
const presenceScheduledEvidencePresence: PresenceReadinessUserPresence = {
  platformLastPolledAt: "2026-06-14T13:31:00.000Z",
};

interface NeoToggleProps {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}

function NeoToggle({ checked, description, disabled = false, label, onChange }: NeoToggleProps) {
  return (
    <div className="grid gap-4 border-4 border-black bg-[#f5eedf] p-5 shadow-[4px_4px_0_#171411] sm:grid-cols-[1fr_110px] sm:items-center">
      <div>
        <h3 className="text-2xl leading-none font-black text-[#171411] uppercase">{label}</h3>
        <p className="neo-copy mt-2 text-[10px] font-bold text-[#55504a] uppercase">
          {description}
        </p>
      </div>
      <button
        aria-checked={checked}
        aria-label={label}
        className={`neo-copy h-12 border-2 border-black text-xs font-bold uppercase shadow-[3px_3px_0_#171411] disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? "bg-[#087d6d] text-white" : "bg-[#efe6d4] text-[#171411]"
        }`}
        disabled={disabled}
        role="switch"
        type="button"
        onClick={() => onChange(!checked)}
      >
        {checked ? "Active" : "Off"}
      </button>
    </div>
  );
}

interface SettingsPageProps {
  diagnostics?: boolean;
}

export function SettingsPage({ diagnostics = false }: SettingsPageProps) {
  const isDesktopRuntime = isTauri();
  const [searchParams] = useSearchParams();
  const showDiagnostics =
    diagnostics || searchParams.get("section") === "diagnostics" || searchParams.has("verify");
  const isPresenceReadinessVerify = searchParams.get("verify") === "presence-evidence";
  const isPresenceScheduledEvidenceVerify =
    searchParams.get("verify") === "presence-scheduled-evidence";
  const isHostedCronEvidenceSummaryVerify =
    searchParams.get("verify") === "hosted-cron-evidence-summary";
  const isExternalCompletionEvidenceSummaryVerify =
    searchParams.get("verify") === "external-completion-evidence-summary";
  const isOneClickSetupVerify = searchParams.get("verify") === "one-click-setup";
  const isOneClickSetupE2EVerify = searchParams.get("verify") === "one-click-setup-e2e-readiness";
  const isOneClickSetupRollbackAuditVerify =
    searchParams.get("verify") === "one-click-setup-rollback-audit-contract";
  const isOneClickSetupFixtureVerify =
    isOneClickSetupVerify || isOneClickSetupE2EVerify || isOneClickSetupRollbackAuditVerify;
  const isClientManagerMountApplyVerify =
    searchParams.get("verify") === "client-manager-mount-apply-contract";
  const isClientManagerMountApplySandboxVerify =
    searchParams.get("verify") === "client-manager-mount-apply-sandbox-proof";
  const showClientManagerMountApplyPanel =
    isClientManagerMountApplyVerify || isClientManagerMountApplySandboxVerify;
  const isBackupExternalDriveVerify =
    searchParams.get("verify") === "backup-external-drive-readiness" ||
    searchParams.get("verify") === "backup-external-drive-detection-mounted" ||
    searchParams.get("verify") === "backup-external-drive-write-proof" ||
    searchParams.get("verify") === "backup-external-drive-eject-safety-proof" ||
    searchParams.get("verify") === "backup-external-drive-os-eject-proof";
  const isBackupExternalDriveDetectionFixture =
    searchParams.get("verify") === "backup-external-drive-detection-mounted";
  const isBackupExternalDriveWriteProofFixture =
    searchParams.get("verify") === "backup-external-drive-write-proof";
  const isBackupExternalDriveEjectSafetyFixture =
    searchParams.get("verify") === "backup-external-drive-eject-safety-proof";
  const isBackupExternalDriveOsEjectFixture =
    searchParams.get("verify") === "backup-external-drive-os-eject-proof";
  const [startWithSystem, setStartWithSystem] = useState(false);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const [autostartMessage, setAutostartMessage] = useState<string | null>(null);
  const [installDir, setInstallDir] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [folderMessage, setFolderMessage] = useState<string | null>(null);

  const [steamId, setSteamId] = useLocalStorageState(
    "launcher.steamId",
    "",
    settingSchemas.steamId,
  );
  const [steamUsername, setSteamUsername] = useLocalStorageState(
    "launcher.steamUsername",
    "",
    settingSchemas.steamUsername,
  );
  const [steamHostedAccount, setSteamHostedAccount] = useState<SteamHostedPlatformAccount | null>(
    null,
  );
  const [steamHostedMessage, setSteamHostedMessage] = useState<string | null>(null);

  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [gogConnected, setGogConnected] = useState(false);
  const [eaConnected, setEaConnected] = useState(false);
  const [epicConnected, setEpicConnected] = useState(false);
  const [epicDisplayName, setEpicDisplayName] = useState("");

  const [xboxConnected, setXboxConnected] = useState(false);
  const [xboxGamesCount, setXboxGamesCount] = useState(0);
  const [xboxGamertag, setXboxGamertag] = useState("");

  const [battlenetConnected, setBattlenetConnected] = useState(false);
  const [battlenetGamesCount, setBattlenetGamesCount] = useState(0);
  const [librarySnapshotCount, setLibrarySnapshotCount] = useState(0);
  const [backupReminderConfigured, setBackupReminderConfigured] = useState(false);
  const [clientManagerSandboxSourcePath, setClientManagerSandboxSourcePath] = useState(
    "/tmp/og-client-manager-sandbox/source",
  );
  const [clientManagerSandboxTargetPath, setClientManagerSandboxTargetPath] = useState(
    "/tmp/og-client-manager-sandbox/target",
  );
  const [clientManagerSandboxProof, setClientManagerSandboxProof] =
    useState<ClientManagerMountApplySandboxProof | null>(
      isClientManagerMountApplySandboxVerify
        ? createVerifyClientManagerMountApplySandboxProof()
        : null,
    );
  const [clientManagerSandboxBusy, setClientManagerSandboxBusy] = useState(false);
  const [clientManagerSandboxMessage, setClientManagerSandboxMessage] = useState<string | null>(
    isClientManagerMountApplySandboxVerify
      ? "Verification fixture loaded for local sandbox apply/rollback proof."
      : null,
  );

  function openDesktopLogin(label: string, action: () => Promise<unknown>) {
    if (!isDesktopRuntime) {
      setTestResult({
        success: false,
        message: `${label} login requires the desktop app. Browser preview does not open native login windows.`,
      });
      return;
    }

    void action().catch((err) => {
      setTestResult({
        success: false,
        message: `Failed to open ${label}: ${getErrorMessage(err)}`,
      });
    });
  }

  useEffect(() => {
    if (!isClientManagerMountApplySandboxVerify) return;
    setClientManagerSandboxProof(createVerifyClientManagerMountApplySandboxProof());
    setClientManagerSandboxMessage(
      "Verification fixture loaded for local sandbox apply/rollback proof.",
    );
  }, [isClientManagerMountApplySandboxVerify]);

  useEffect(() => {
    let isMounted = true;
    clearLegacyPlatformTokenCopies();

    if (isDesktopRuntime) {
      gogGetToken()
        .then((backendToken) => {
          if (!isMounted) return;
          setGogConnected(Boolean(backendToken?.accessToken));
        })
        .catch(() => {
          if (!isMounted) return;
          setGogConnected(false);
        });
    } else {
      setGogConnected(false);
    }

    if (isDesktopRuntime) {
      eaGetToken()
        .then((backendEaToken) => {
          if (!isMounted) return;
          setEaConnected(Boolean(backendEaToken?.accessToken));
        })
        .catch(() => {
          if (!isMounted) return;
          setEaConnected(false);
        });
    } else {
      setEaConnected(false);
    }

    if (steamId && !steamUsername) {
      if (!isDesktopRuntime) {
        setSteamUsername("Steam User");
      } else {
        void fetchSteamProfileName(steamId)
          .then((name) => {
            if (!isMounted) return;
            setSteamUsername(name ?? "Steam User");
          })
          .catch((err) => {
            console.warn("Failed to fetch steam username on mount:", err);
            if (isMounted) setSteamUsername("Steam User");
          });
      }
    }

    const epicMarker = readEpicSessionMarker();
    if (epicMarker) {
      setEpicConnected(true);
      setEpicDisplayName(epicMarker);
    }

    const xboxGamesStr = localStorage.getItem(STORAGE_KEYS.XBOX_GAMES_CACHE);
    if (xboxGamesStr) {
      try {
        const games = JSON.parse(xboxGamesStr);
        if (Array.isArray(games)) {
          setXboxConnected(true);
          setXboxGamesCount(games.length);
          const gt = localStorage.getItem(STORAGE_KEYS.XBOX_USERNAME);
          if (gt) setXboxGamertag(gt);
        }
      } catch {
        // ignore
      }
    }

    const battlenetGamesStr = localStorage.getItem(STORAGE_KEYS.BATTLENET_GAMES_CACHE);
    if (battlenetGamesStr) {
      try {
        const games = JSON.parse(battlenetGamesStr);
        if (Array.isArray(games)) {
          setBattlenetConnected(true);
          setBattlenetGamesCount(games.length);
        }
      } catch {
        // ignore
      }
    }

    const librarySnapshot = localStorage.getItem(STORAGE_KEYS.LIBRARY_SNAPSHOT);
    if (librarySnapshot) {
      try {
        const games = JSON.parse(librarySnapshot);
        if (Array.isArray(games)) {
          setLibrarySnapshotCount(games.length);
        }
      } catch {
        setLibrarySnapshotCount(0);
      }
    }

    setBackupReminderConfigured(
      Boolean(localStorage.getItem(STORAGE_KEYS.BACKUP_REMINDER_SETTINGS)),
    );

    return () => {
      isMounted = false;
    };
  }, [isDesktopRuntime, setSteamUsername, steamId, steamUsername]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let isMounted = true;
    void getMyVerifiedSteamPlatformAccount()
      .then((account) => {
        if (!isMounted || !account) return;
        setSteamHostedAccount(account);
        setSteamHostedMessage("Steam OpenID ownership is verified by the hosted relay.");
        activateSteamAccount(account.platformUserId);
        setSteamId(account.platformUserId);
        if (account.platformUsername) setSteamUsername(account.platformUsername);
      })
      .catch((error) => {
        if (!isMounted) return;
        setSteamHostedMessage(
          `Hosted Steam verification status is unavailable: ${getErrorMessage(error)}`,
        );
      });
    return () => {
      isMounted = false;
    };
  }, [setSteamId, setSteamUsername]);

  async function handleSteamDisconnect() {
    if (steamHostedAccount) {
      try {
        await unlinkPlatformAccount("steam");
      } catch (error) {
        setSteamHostedMessage(
          `Hosted Steam disconnect failed; account was kept linked: ${getErrorMessage(error)}`,
        );
        return;
      }
    }
    clearSteamAccount();
    setSteamId("");
    setSteamUsername("");
    setSteamHostedAccount(null);
    setSteamHostedMessage(null);
    setTestResult(null);
  }

  async function handleGogCodeExchange(code: string) {
    setTestResult({ success: true, message: "GOG login code received. Exchanging..." });
    try {
      const token = await gogExchangeCode(code);
      if (token && token.accessToken) {
        clearLegacyGogTokenCopy();
        setGogConnected(true);
        setTestResult({
          success: true,
          message: "Successfully linked GOG. Your GOG games are now syncing.",
        });
      } else {
        throw new Error("No access_token received from GOG response.");
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: `GOG login failed: ${getErrorMessage(err)}`,
      });
    }
  }

  async function handleEpicCodeExchange(authCode: string) {
    if (!authCode.trim()) {
      setTestResult({ success: false, message: "Enter a valid Epic authorization code." });
      return;
    }
    setTestResult({ success: true, message: "Authenticating with Legendary..." });
    try {
      const response = await authenticateEpicLegendary(authCode.trim());

      writeEpicSessionMarker();
      setEpicConnected(true);
      setEpicDisplayName("Epic User");
      setTestResult({
        success: true,
        message: response,
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: `Epic Games login failed: ${getErrorMessage(err)}`,
      });
    }
  }

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let isMounted = true;
    let unlistenPromise: Promise<() => void> | null = null;
    let unlistenScrapedPromise: Promise<() => void> | null = null;
    let unlistenErrorPromise: Promise<() => void> | null = null;

    try {
      unlistenPromise = listen<unknown>("steam_login_success", async (event) => {
        if (!isMounted) return;
        const login = normalizeSteamLoginSuccessEvent(event.payload);
        if (!login) return;
        const steamIdVal = login.steamId;
        activateSteamAccount(steamIdVal);
        setSteamId(steamIdVal);
        const isCurrentSteamLogin = () =>
          isMounted && readLocalStorageString(STORAGE_KEYS.STEAM_ID) === steamIdVal;
        try {
          const name = await fetchSteamProfileName(steamIdVal);
          if (!isCurrentSteamLogin()) return;
          setSteamUsername(name ?? "Steam User");
        } catch (err) {
          console.warn("Failed to fetch steam username:", err);
          if (!isCurrentSteamLogin()) return;
          setSteamUsername("Steam User");
        }
        if (!isCurrentSteamLogin()) return;

        if (login.openidResponseUrl) {
          try {
            const hostedAccount = await linkSteamAccountThroughHostedVerifier(
              login.openidResponseUrl,
            );
            if (!isCurrentSteamLogin()) return;
            if (hostedAccount) {
              setSteamHostedAccount(hostedAccount);
              setSteamHostedMessage(
                "Steam OpenID ownership verified server-side. Hosted achievement relay is active; local cache remains the fallback.",
              );
              if (hostedAccount.platformUsername) {
                setSteamUsername(hostedAccount.platformUsername);
              }
            } else {
              setSteamHostedAccount(null);
              setSteamHostedMessage(
                "Steam connected locally. Hosted verification is unavailable; local cache fallback remains active.",
              );
            }
          } catch (error) {
            if (!isCurrentSteamLogin()) return;
            setSteamHostedAccount(null);
            setSteamHostedMessage(
              `Steam connected locally, but hosted verification failed: ${getErrorMessage(error)}`,
            );
          }
        } else {
          setSteamHostedAccount(null);
          setSteamHostedMessage(
            "Steam connected through the legacy local event. Local cache fallback remains active.",
          );
        }
        setTestResult({
          success: true,
          message: "Login successful. Your game list is now being fetched...",
        });
      });

      unlistenScrapedPromise = listen<unknown>("steam_scraped_games_success", (event) => {
        if (!isMounted) return;
        const currentSteamId = readLocalStorageString(STORAGE_KEYS.STEAM_ID) ?? "";
        if (!isSteamScrapedGamesEventForAccount(event.payload, currentSteamId)) return;
        const ownedGames = normalizeSteamOwnedGames(event.payload.games);
        writeSteamOwnedGamesCache(event.payload.steamId, ownedGames);

        setTestResult({
          success: true,
          message: `Successfully signed in through Steam. ${ownedGames.length} games were synced.`,
        });
      });

      unlistenErrorPromise = listen<unknown>("steam_scraped_games_error", (event) => {
        if (!isMounted) return;
        const currentSteamId = readLocalStorageString(STORAGE_KEYS.STEAM_ID) ?? "";
        if (!isSteamScrapeErrorEventForAccount(event.payload, currentSteamId)) return;
        console.warn("[Settings] Scraper failed:", event.payload.message);

        setTestResult({
          success: false,
          message: `Steam sync failed: ${event.payload.message}`,
        });
      });
    } catch (err) {
      console.warn("Failed to setup Steam event listeners:", err);
    }

    return () => {
      isMounted = false;
      if (unlistenPromise) void unlistenPromise.then((un) => un());
      if (unlistenScrapedPromise) void unlistenScrapedPromise.then((un) => un());
      if (unlistenErrorPromise) void unlistenErrorPromise.then((un) => un());
    };
  }, [setSteamId, setSteamUsername]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let unlistenPromise: Promise<() => void> | null = null;
    let unlistenEpicPromise: Promise<() => void> | null = null;

    try {
      unlistenPromise = listen<string>("gog_login_code", async (event) => {
        const code = event.payload;
        await handleGogCodeExchange(code);
      });
      unlistenEpicPromise = listen<string>("epic_login_code", async (event) => {
        const code = event.payload;
        await handleEpicCodeExchange(code);
      });
    } catch (err) {
      console.warn("Failed to setup gog or epic login listeners:", err);
    }

    let unlistenEaPromise: Promise<() => void> | null = null;
    try {
      unlistenEaPromise = listen("ea_login_success", async () => {
        const token = await eaGetToken();
        if (token?.accessToken) {
          clearLegacyEaTokenCopy();
          setEaConnected(true);
          setTestResult({
            success: true,
            message: "Successfully linked EA App. Your EA library is now syncing.",
          });
        }
      });
    } catch (err) {
      console.warn("Failed to setup EA login listener:", err);
    }

    return () => {
      if (unlistenPromise) void unlistenPromise.then((unlisten) => unlisten());
      if (unlistenEpicPromise) void unlistenEpicPromise.then((unlisten) => unlisten());
      if (unlistenEaPromise) void unlistenEaPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let isMounted = true;
    let unlistenPromise: Promise<() => void> | null = null;

    try {
      unlistenPromise = listen<string>("xbox_login_code", async (event) => {
        if (!isMounted) return;
        setTestResult({ success: true, message: "Xbox login code received. Fetching library..." });
        try {
          const result = await fetchXboxOwnedGames(event.payload);
          localStorage.setItem(STORAGE_KEYS.XBOX_GAMES_CACHE, JSON.stringify(result.games));
          if (result.gamertag) {
            localStorage.setItem(STORAGE_KEYS.XBOX_USERNAME, result.gamertag);
            setXboxGamertag(result.gamertag);
          }
          setXboxConnected(true);
          setXboxGamesCount(result.games.length);
          setTestResult({
            success: true,
            message: `Successfully linked Xbox Live. ${result.games.length} games imported.`,
          });
        } catch (err) {
          setTestResult({
            success: false,
            message: `Xbox Live login failed: ${getErrorMessage(err)}`,
          });
        }
      });
    } catch (err) {
      console.warn("Failed to setup xbox_login_code listener:", err);
    }

    return () => {
      isMounted = false;
      if (unlistenPromise) {
        void unlistenPromise.then((unlisten) => unlisten());
      }
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let isMounted = true;
    let unlistenPromise: Promise<() => void> | null = null;

    try {
      unlistenPromise = listen<string>("battlenet_login_data", async (event) => {
        if (!isMounted) return;
        setTestResult({
          success: true,
          message: "Battle.net session captured. Processing library...",
        });
        try {
          const games = await processBattleNetGamesPayload(event.payload);
          localStorage.setItem(STORAGE_KEYS.BATTLENET_GAMES_CACHE, JSON.stringify(games));
          setBattlenetConnected(true);
          setBattlenetGamesCount(games.length);
          setTestResult({
            success: true,
            message: `Successfully linked Battle.net. ${games.length} games imported.`,
          });

          // Dispatch a custom event so LibraryPage can reload
          window.dispatchEvent(new Event("battlenet_library_updated"));
        } catch (err) {
          setTestResult({
            success: false,
            message: `Battle.net parsing failed: ${getErrorMessage(err)}`,
          });
        }
      });
    } catch (err) {
      console.warn("Failed to setup battlenet_login_data listener:", err);
    }

    return () => {
      isMounted = false;
      if (unlistenPromise) {
        void unlistenPromise.then((unlisten) => unlisten());
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadNativeSettings() {
      if (!isDesktopRuntime) {
        setSystemInfo({
          appVersion: "0.1.0",
          arch: "web",
          os: "Browser Preview",
        });
        setInstallDir("Desktop app manages native install folders.");
        setCommandError(null);
        return;
      }

      try {
        const [info, defaultDir] = await Promise.all([getSystemInfo(), getDefaultInstallDir()]);

        if (isMounted) {
          setSystemInfo(info);
          setInstallDir(defaultDir);
          setCommandError(null);
        }
      } catch (error) {
        if (isMounted) {
          setCommandError(getErrorMessage(error));
        }
      }
    }

    void loadNativeSettings();

    return () => {
      isMounted = false;
    };
  }, [isDesktopRuntime]);

  useEffect(() => {
    let isMounted = true;

    if (!isDesktopRuntime) {
      setStartWithSystem(false);
      setAutostartMessage("Login autostart is available in the desktop app.");
      return () => {
        isMounted = false;
      };
    }

    void import("@tauri-apps/plugin-autostart")
      .then(({ isEnabled }) => isEnabled())
      .then((enabled) => {
        if (!isMounted) return;
        setStartWithSystem(enabled);
        setAutostartMessage(null);
      })
      .catch((error: unknown) => {
        if (isMounted) setAutostartMessage(`Autostart status failed: ${getErrorMessage(error)}`);
      });

    return () => {
      isMounted = false;
    };
  }, [isDesktopRuntime]);

  async function handleStartWithSystemChange(enabled: boolean) {
    if (!isDesktopRuntime) {
      setAutostartMessage("Login autostart is available in the desktop app.");
      return;
    }

    setAutostartBusy(true);
    try {
      const autostart = await import("@tauri-apps/plugin-autostart");
      if (enabled) {
        await autostart.enable();
      } else {
        await autostart.disable();
      }
      const actualState = await autostart.isEnabled();
      setStartWithSystem(actualState);
      setAutostartMessage(actualState ? "Login autostart enabled." : "Login autostart disabled.");
    } catch (error) {
      setAutostartMessage(`Autostart update failed: ${getErrorMessage(error)}`);
    } finally {
      setAutostartBusy(false);
    }
  }

  async function handleChooseInstallFolder() {
    if (!isDesktopRuntime) {
      setFolderMessage(
        "Folder picker is available in the desktop app. Browser preview keeps native paths read-only.",
      );
      return;
    }

    setFolderMessage(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: "Choose OG install target",
      });

      if (typeof selectedPath !== "string") {
        setFolderMessage("Install folder selection cancelled.");
        return;
      }

      setInstallDir(selectedPath);
      setFolderMessage(
        "Install target selected for setup review. Provider clients and current download commands may still use their own native paths.",
      );
    } catch (error) {
      setFolderMessage(`Folder picker failed: ${getErrorMessage(error)}`);
    }
  }

  function handleReloadPath() {
    if (!isDesktopRuntime) {
      setInstallDir("Desktop app manages native install folders.");
      setCommandError(null);
      setFolderMessage(
        "Browser preview cannot reload OS paths; open the desktop app for native targets.",
      );
      return;
    }

    setInstallDir(null);
    setCommandError(null);
    void getDefaultInstallDir()
      .then(setInstallDir)
      .catch((error: unknown) => setCommandError(getErrorMessage(error)));
  }

  function handleLoadClientManagerSandboxFixture() {
    setClientManagerSandboxProof(createVerifyClientManagerMountApplySandboxProof());
    setClientManagerSandboxMessage(
      "Loaded deterministic sandbox proof fixture; desktop command remains required for real local paths.",
    );
  }

  async function handleRunClientManagerSandboxProof() {
    setClientManagerSandboxBusy(true);
    setClientManagerSandboxMessage(null);
    try {
      const proof = await proveClientManagerMountApplySandbox({
        consent: {
          accepted: true,
          operation: "client_manager_mount_apply_sandbox_proof",
          sourcePath: clientManagerSandboxSourcePath,
          targetPath: clientManagerSandboxTargetPath,
        },
        sourcePath: clientManagerSandboxSourcePath,
        targetPath: clientManagerSandboxTargetPath,
      });
      setClientManagerSandboxProof(proof);
      setClientManagerSandboxMessage(
        `Sandbox proof complete: ${proof.verifiedFiles}/${proof.fileCount} files verified and rollback ${proof.rollbackVerified ? "verified" : "blocked"}.`,
      );
    } catch (error) {
      setClientManagerSandboxMessage(getErrorMessage(error));
    } finally {
      setClientManagerSandboxBusy(false);
    }
  }

  const oneClickSetupPlatforms: OneClickSetupPlatformEvidence[] = isOneClickSetupFixtureVerify
    ? [
        { gamesCount: 42, id: "steam", label: "Steam", linked: true },
        { gamesCount: 12, id: "gog", label: "GOG", linked: true },
        { gamesCount: 0, id: "epic", label: "Epic", linked: true },
        { id: "xbox", label: "Xbox", linked: false },
      ]
    : [
        { id: "steam", label: "Steam", linked: Boolean(steamId) },
        { id: "gog", label: "GOG", linked: gogConnected },
        { id: "epic", label: "Epic", linked: epicConnected },
        { id: "ea", label: "EA", linked: eaConnected },
        {
          gamesCount: xboxGamesCount,
          id: "xbox",
          label: "Xbox",
          linked: xboxConnected,
        },
        {
          gamesCount: battlenetGamesCount,
          id: "battlenet",
          label: "Battle.net",
          linked: battlenetConnected,
        },
      ];
  const normalizedOneClickInstallDir =
    installDir && installDir !== "Desktop app manages native install folders." ? installDir : null;
  const oneClickSetupReadiness = buildOneClickSetupReadiness({
    backupReminderConfigured: isOneClickSetupFixtureVerify || backupReminderConfigured,
    installDir: isOneClickSetupFixtureVerify
      ? "D:\\OGLauncher\\Games"
      : normalizedOneClickInstallDir,
    installDirApplied: false,
    isDesktopRuntime: isOneClickSetupFixtureVerify || isDesktopRuntime,
    librarySnapshotCount: isOneClickSetupFixtureVerify ? 18 : librarySnapshotCount,
    platforms: oneClickSetupPlatforms,
    supabaseConfigured: isOneClickSetupFixtureVerify || isSupabaseConfigured,
  });
  const oneClickSetupE2EReadiness = createVerifyOneClickSetupE2EReadiness();
  const oneClickSetupRollbackAuditContract =
    createVerifyOneClickSetupRollbackAuditContract(oneClickSetupReadiness);
  const externalCompletionEvidenceSummary = createVerifyExternalCompletionEvidenceSummary();
  const hostedCronEvidenceSummary = createVerifyHostedCronEvidenceSummary();
  const clientManagerMountApplyContract =
    createVerifyClientManagerMountApplyContract(clientManagerSandboxProof);
  return (
    <section>
      <div className="mb-8 border-b-4 border-black pb-4">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="neo-copy inline-flex border-2 border-black bg-[#171411] px-3 py-1 text-xs font-bold text-white uppercase shadow-[3px_3px_0_#171411]">
              System Configuration
            </span>
            <h1 className="neo-title mt-2 max-w-[680px] text-[3.5rem] leading-[0.82] text-[#171411] sm:text-[4.5rem] lg:text-[5.4rem] xl:text-[6rem]">
              Settings Panel
            </h1>
            <p className="neo-copy mt-3 text-xs font-bold text-[#55504a] uppercase">
              Launcher runtime // local storage // native paths
            </p>
          </div>

          <button
            className="neo-copy flex h-10 w-full items-center justify-center gap-3 border-2 border-black bg-[#f5eedf] px-5 text-xs font-bold uppercase shadow-[2px_2px_0_#171411] sm:w-fit"
            type="button"
            onClick={handleReloadPath}
          >
            <RefreshCw className="h-4 w-4" />
            Reload
          </button>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <div className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]">
            <div className="flex items-center justify-between border-b-4 border-black p-5">
              <div>
                <p className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">
                  Install Target
                </p>
                <h2 className="text-3xl font-black text-[#171411] uppercase">Game Storage</h2>
              </div>
              <HardDrive className="h-10 w-10 text-[#c20b2f]" />
            </div>

            <div className="p-5">
              <div className="border-2 border-black bg-[#efe6d4] p-4">
                <p className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">
                  Install target review
                </p>
                <p className="mt-2 text-lg font-black break-all text-[#171411]">
                  {installDir ??
                    (isDesktopRuntime
                      ? "Loading native path..."
                      : "Desktop app manages native install folders.")}
                </p>
                {!isDesktopRuntime ? (
                  <p className="neo-copy mt-3 inline-flex border-2 border-black bg-[#fff9ed] px-2 py-1 text-[10px] font-black tracking-[0.1em] text-[#c20b2f] uppercase">
                    Browser Preview · Native Path Read-Only
                  </p>
                ) : null}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  className="neo-copy flex h-11 items-center justify-center gap-3 border-2 border-black bg-[#c20b2f] px-5 text-xs font-bold text-white uppercase shadow-[3px_3px_0_#171411]"
                  type="button"
                  onClick={handleChooseInstallFolder}
                >
                  <FolderOpen className="h-4 w-4" />
                  Choose Folder
                </button>
                <button
                  className="neo-copy flex h-11 items-center justify-center gap-3 border-2 border-black bg-[#f5eedf] px-5 text-xs font-bold uppercase shadow-[3px_3px_0_#171411]"
                  type="button"
                  onClick={handleReloadPath}
                >
                  <RefreshCw className="h-4 w-4" />
                  Reload Path
                </button>
              </div>

              {folderMessage ? (
                <p
                  className="neo-copy mt-4 border-2 border-black bg-[#087d6d] px-3 py-2 text-[10px] font-bold text-white uppercase"
                  role="status"
                >
                  {folderMessage}
                </p>
              ) : null}
            </div>
          </div>

          {/* CLOUD ACCOUNTS LINKING */}
          <div className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]">
            <div className="flex items-center justify-between border-b-4 border-black p-5">
              <div>
                <p className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">
                  Third-Party Integration
                </p>
                <h2 className="text-3xl font-black text-[#171411] uppercase">Cloud Account Link</h2>
              </div>
              <LinkIcon className="h-10 w-10 text-[#087d6d]" />
            </div>

            <div className="space-y-6 p-5">
              <div className="grid gap-4 md:grid-cols-3">
                {/* STEAM CARD */}
                <div className="flex flex-col justify-between border-2 border-black bg-[#efe6d4] p-4 shadow-[2px_2px_0_#171411]">
                  <div>
                    <h3 className="mb-1 text-xl font-black text-[#171411] uppercase">Steam</h3>
                    <p className="neo-copy mb-4 text-[10px] leading-relaxed font-bold text-[#55504a] uppercase">
                      Verifies Steam ownership through the hosted relay, then keeps the local Steam
                      cache as fallback. No provider secret is shipped in the launcher.
                    </p>
                  </div>
                  <div>
                    {steamId ? (
                      <div className="space-y-2 border border-black bg-[#f5eedf] p-3">
                        <span className="neo-copy block text-[10px] font-bold text-[#55504a] uppercase">
                          Signed in as
                        </span>
                        <span className="block truncate text-xs font-black text-[#087d6d]">
                          {steamUsername || "Steam User"}
                        </span>
                        <span
                          className={`neo-copy block border-2 border-black px-2 py-1 text-[10px] font-black uppercase ${
                            steamHostedAccount
                              ? "bg-[#087d6d] text-white"
                              : "bg-[#efe6d4] text-[#171411]"
                          }`}
                        >
                          {steamHostedAccount ? "Hosted verified" : "Local fallback"}
                        </span>
                        <button
                          className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                          type="button"
                          onClick={() => void handleSteamDisconnect()}
                        >
                          <LogOut className="h-3 w-3" />
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        className="neo-copy flex h-10 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-4 text-xs font-black text-white uppercase shadow-[2px_2px_0_#171411] transition hover:bg-[#a10825]"
                        type="button"
                        onClick={() => {
                          openDesktopLogin("Steam", openSteamLoginWindow);
                        }}
                      >
                        <LinkIcon className="h-3.5 w-3.5" />
                        Connect
                      </button>
                    )}
                    {steamHostedMessage ? (
                      <p
                        className={`neo-copy mt-2 border-2 border-black px-2 py-1 text-[10px] leading-relaxed font-bold uppercase ${
                          steamHostedMessage.includes("failed")
                            ? "bg-[#c20b2f] text-white"
                            : steamHostedAccount
                              ? "bg-[#8cf5e4] text-[#171411]"
                              : "bg-[#f5eedf] text-[#5b403f]"
                        }`}
                        role="status"
                      >
                        {steamHostedMessage}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* GOG CARD */}
                <div className="flex flex-col justify-between border-2 border-black bg-[#efe6d4] p-4 shadow-[2px_2px_0_#171411]">
                  <div>
                    <h3 className="mb-1 text-xl font-black text-[#171411] uppercase">GOG Galaxy</h3>
                    <p className="neo-copy mb-4 text-[10px] leading-relaxed font-bold text-[#55504a] uppercase">
                      Fully automatic synchronization of your GOG games through secure login.
                    </p>
                  </div>
                  <div>
                    {gogConnected ? (
                      <div className="space-y-2 border border-black bg-[#f5eedf] p-3">
                        <span className="neo-copy block text-[10px] font-bold text-[#55504a] uppercase">
                          Status
                        </span>
                        <span className="block truncate text-xs font-black text-[#087d6d]">
                          Successfully Connected
                        </span>
                        <button
                          className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                          type="button"
                          onClick={() => {
                            if (isDesktopRuntime) void gogLogout().catch(() => {});
                            clearLegacyPlatformTokenCopies();
                            setGogConnected(false);
                            setTestResult(null);
                          }}
                        >
                          <LogOut className="h-3 w-3" />
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        className="neo-copy flex h-10 w-full items-center justify-center gap-2 border-2 border-black bg-[#087d6d] px-4 text-xs font-black text-white uppercase shadow-[2px_2px_0_#171411] transition hover:bg-[#066154]"
                        type="button"
                        onClick={() => {
                          openDesktopLogin("GOG", openGogLoginWindow);
                        }}
                      >
                        <LinkIcon className="h-3.5 w-3.5" />
                        Connect
                      </button>
                    )}
                  </div>
                </div>

                {/* EA APP CARD */}
                <div className="flex flex-col justify-between border-2 border-black bg-[#efe6d4] p-4 shadow-[2px_2px_0_#171411]">
                  <div>
                    <h3 className="mb-1 text-xl font-black text-[#171411] uppercase">EA App</h3>
                    <p className="neo-copy mb-4 text-[10px] leading-relaxed font-bold text-[#55504a] uppercase">
                      Sync your EA library via secure browser login (same flow as Playnite).
                      Installed EA games are still detected locally.
                    </p>
                  </div>
                  <div>
                    {eaConnected ? (
                      <div className="space-y-2 border border-black bg-[#f5eedf] p-3">
                        <span className="neo-copy block text-[10px] font-bold text-[#55504a] uppercase">
                          Status
                        </span>
                        <span className="block truncate text-xs font-black text-[#087d6d]">
                          Successfully Connected
                        </span>
                        <button
                          className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                          type="button"
                          onClick={() => {
                            if (isDesktopRuntime) void eaLogout().catch(() => {});
                            clearLegacyPlatformTokenCopies();
                            setEaConnected(false);
                            setTestResult(null);
                          }}
                        >
                          <LogOut className="h-3 w-3" />
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        className="neo-copy flex h-10 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-4 text-xs font-black text-white uppercase shadow-[2px_2px_0_#171411] transition hover:bg-[#a10825]"
                        type="button"
                        onClick={() => {
                          openDesktopLogin("EA App", openEaLoginWindow);
                        }}
                      >
                        <LinkIcon className="h-3.5 w-3.5" />
                        Connect EA
                      </button>
                    )}
                  </div>
                </div>

                {/* EPIC GAMES CARD */}
                <div className="flex flex-col justify-between border-2 border-black bg-[#efe6d4] p-4 shadow-[2px_2px_0_#171411]">
                  <div>
                    <h3 className="mb-1 text-xl font-black text-[#171411] uppercase">Epic Games</h3>
                    <p className="neo-copy mb-4 text-[10px] leading-relaxed font-bold text-[#55504a] uppercase">
                      Import your Epic library. Sign in through the browser to automatically
                      connect.
                    </p>
                  </div>
                  <div>
                    {epicConnected ? (
                      <div className="space-y-2 border border-black bg-[#f5eedf] p-3">
                        <span className="neo-copy block text-[10px] font-bold text-[#55504a] uppercase">
                          Signed in as
                        </span>
                        <span className="block truncate text-xs font-black text-[#087d6d]">
                          {epicDisplayName || "Epic User"}
                        </span>
                        <button
                          className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                          type="button"
                          onClick={() => {
                            clearEpicSessionMarker();
                            setEpicConnected(false);
                            setEpicDisplayName("");
                            setTestResult(null);
                          }}
                        >
                          <LogOut className="h-3 w-3" />
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        className="neo-copy flex h-10 w-full items-center justify-center gap-2 border-2 border-black bg-[#171411] px-4 text-xs font-black text-white uppercase shadow-[2px_2px_0_#171411] transition hover:bg-[#333]"
                        type="button"
                        onClick={() => {
                          openDesktopLogin("Epic Games", openEpicLoginWindow);
                        }}
                      >
                        <LinkIcon className="h-3.5 w-3.5" />
                        Connect Epic
                      </button>
                    )}
                  </div>
                </div>

                {/* XBOX CARD */}
                <div className="flex flex-col justify-between border-2 border-black bg-[#efe6d4] p-4 shadow-[2px_2px_0_#171411]">
                  <div>
                    <h3 className="mb-1 text-xl font-black text-[#171411] uppercase">
                      Xbox App / PC Game Pass
                    </h3>
                    <p className="neo-copy mb-4 text-[10px] leading-relaxed font-bold text-[#55504a] uppercase">
                      Link Xbox title history. The localized PC Game Pass catalog syncs
                      automatically in your library.
                    </p>
                  </div>
                  <div>
                    {xboxConnected ? (
                      <div className="space-y-2 border border-black bg-[#f5eedf] p-3">
                        <span className="neo-copy block text-[10px] font-bold text-[#55504a] uppercase">
                          Status
                        </span>
                        <div className="flex flex-col gap-1">
                          <span className="block truncate text-xs font-black text-[#087d6d]">
                            Connected ({xboxGamesCount} games)
                          </span>
                          {xboxGamertag && (
                            <span className="text-[10px] font-bold text-black">
                              User: {xboxGamertag}
                            </span>
                          )}
                        </div>
                        <button
                          className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                          type="button"
                          onClick={() => {
                            localStorage.removeItem(STORAGE_KEYS.XBOX_GAMES_CACHE);
                            localStorage.removeItem(STORAGE_KEYS.XBOX_USERNAME);
                            setXboxConnected(false);
                            setXboxGamesCount(0);
                            setXboxGamertag("");
                            setTestResult(null);
                          }}
                        >
                          <LogOut className="h-3 w-3" />
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        className="neo-copy flex h-10 w-full items-center justify-center gap-2 border-2 border-black bg-[#087d6d] px-4 text-xs font-black text-white uppercase shadow-[2px_2px_0_#171411] transition hover:bg-[#066154]"
                        type="button"
                        onClick={() => {
                          openDesktopLogin("Xbox", openXboxLoginWindow);
                        }}
                      >
                        <LinkIcon className="h-3.5 w-3.5" />
                        Connect Xbox
                      </button>
                    )}
                  </div>
                </div>

                {/* BATTLENET CARD */}
                <div className="flex flex-col justify-between border-2 border-black bg-[#efe6d4] p-4 shadow-[2px_2px_0_#171411]">
                  <div>
                    <h3 className="mb-1 text-xl font-black text-[#171411] uppercase">Battle.net</h3>
                    <p className="neo-copy mb-4 text-[10px] leading-relaxed font-bold text-[#55504a] uppercase">
                      Import your Blizzard library via web login.
                    </p>
                  </div>
                  <div>
                    {battlenetConnected ? (
                      <div className="space-y-2 border border-black bg-[#f5eedf] p-3">
                        <span className="neo-copy block text-[10px] font-bold text-[#55504a] uppercase">
                          Status
                        </span>
                        <span className="block truncate text-xs font-black text-[#087d6d]">
                          Connected ({battlenetGamesCount} games)
                        </span>
                        <button
                          className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                          type="button"
                          onClick={() => {
                            localStorage.removeItem(STORAGE_KEYS.BATTLENET_GAMES_CACHE);
                            setBattlenetConnected(false);
                            setBattlenetGamesCount(0);
                            setTestResult(null);
                          }}
                        >
                          <LogOut className="h-3 w-3" />
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        className="neo-copy flex h-10 w-full items-center justify-center gap-2 border-2 border-black bg-[#171411] px-4 text-xs font-black text-white uppercase shadow-[2px_2px_0_#171411] transition hover:bg-[#333]"
                        type="button"
                        onClick={() => {
                          openDesktopLogin("Battle.net", openBattleNetLoginWindow);
                        }}
                      >
                        <LinkIcon className="h-3.5 w-3.5" />
                        Connect BNet
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {testResult ? (
                <div
                  className={`neo-copy border-2 border-black px-3 py-2 text-xs font-bold text-white uppercase shadow-[2px_2px_0_#171411] ${
                    testResult.success ? "bg-[#087d6d]" : "bg-[#c20b2f]"
                  }`}
                  role={testResult.success ? "status" : "alert"}
                >
                  {testResult.message}
                </div>
              ) : null}
            </div>
          </div>

          <OneClickSetupReadinessPanel readiness={oneClickSetupReadiness} />

          {showDiagnostics ? (
            <>
              <div className="border-4 border-black bg-[#171411] p-4 text-white shadow-[4px_4px_0_#171411]">
                <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#8cf5e4] uppercase">
                  Control Room
                </p>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="neo-title text-3xl leading-none">Diagnostics</h2>
                    <p className="neo-copy mt-2 max-w-2xl text-[11px] leading-5 font-bold text-[#f5eedf] uppercase">
                      Readiness tapes, provider polling and disabled plugin-package audits. These
                      are technical verification surfaces, not normal launcher settings.
                    </p>
                  </div>
                  <RouterLink
                    className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[11px] font-black text-[#171411] uppercase shadow-[3px_3px_0_#8cf5e4]"
                    to="/settings"
                  >
                    Close Diagnostics
                  </RouterLink>
                </div>
              </div>

              {isOneClickSetupE2EVerify ? (
                <React.Suspense fallback={null}>
                  <LazyOneClickSetupE2EReadinessPanel readiness={oneClickSetupE2EReadiness} />
                </React.Suspense>
              ) : null}

              {isOneClickSetupRollbackAuditVerify ? (
                <React.Suspense fallback={null}>
                  <LazyOneClickSetupRollbackAuditContractPanel
                    contract={oneClickSetupRollbackAuditContract}
                  />
                </React.Suspense>
              ) : null}

              {showClientManagerMountApplyPanel ? (
                <React.Suspense fallback={null}>
                  <LazyClientManagerMountApplyContractPanel
                    contract={clientManagerMountApplyContract}
                    sandboxControls={{
                      busy: clientManagerSandboxBusy,
                      isDesktopRuntime,
                      message: clientManagerSandboxMessage,
                      onLoadFixture: handleLoadClientManagerSandboxFixture,
                      onRunProof: handleRunClientManagerSandboxProof,
                      onSourcePathChange: setClientManagerSandboxSourcePath,
                      onTargetPathChange: setClientManagerSandboxTargetPath,
                      sourcePath: clientManagerSandboxSourcePath,
                      targetPath: clientManagerSandboxTargetPath,
                    }}
                  />
                </React.Suspense>
              ) : null}

              <PlatformHealthPanel
                loginStatuses={{
                  battlenet: battlenetConnected,
                  ea: eaConnected,
                  epic: epicConnected,
                  gog: gogConnected,
                  steam: Boolean(steamId),
                  xbox: xboxConnected,
                }}
              />

              <PresencePollingReadinessPanel
                connectedPlatforms={{
                  battlenet: battlenetConnected || isPresenceReadinessVerify,
                  ea: eaConnected || isPresenceReadinessVerify,
                  epic: epicConnected || isPresenceReadinessVerify,
                  gog: gogConnected || isPresenceReadinessVerify,
                  steam:
                    Boolean(steamId) ||
                    isPresenceReadinessVerify ||
                    isPresenceScheduledEvidenceVerify,
                  ubisoft: isPresenceReadinessVerify,
                  xbox: xboxConnected || isPresenceReadinessVerify,
                }}
                hostedCronStaging={
                  isPresenceReadinessVerify ? presenceHostedCronStagingEvidence : undefined
                }
                now={
                  isPresenceScheduledEvidenceVerify
                    ? presenceScheduledEvidenceVerifyNow
                    : isPresenceReadinessVerify
                      ? presenceReadinessVerifyNow
                      : undefined
                }
                platformAccounts={
                  isPresenceScheduledEvidenceVerify
                    ? presenceScheduledEvidenceAccounts
                    : isPresenceReadinessVerify
                      ? presenceReadinessVerifyAccounts
                      : undefined
                }
                trustedEvidence={isPresenceScheduledEvidenceVerify ? true : undefined}
                supabaseConfigured={
                  isSupabaseConfigured ||
                  isPresenceReadinessVerify ||
                  isPresenceScheduledEvidenceVerify
                }
                ownPresence={
                  isPresenceScheduledEvidenceVerify
                    ? presenceScheduledEvidencePresence
                    : isPresenceReadinessVerify
                      ? presenceReadinessVerifyPresence
                      : undefined
                }
              />

              {isHostedCronEvidenceSummaryVerify ? (
                <React.Suspense fallback={null}>
                  <LazyHostedCronEvidenceSummaryPanel summary={hostedCronEvidenceSummary} />
                </React.Suspense>
              ) : null}

              {isExternalCompletionEvidenceSummaryVerify ? (
                <React.Suspense fallback={null}>
                  <LazyExternalCompletionEvidenceSummaryPanel
                    summary={externalCompletionEvidenceSummary}
                  />
                </React.Suspense>
              ) : null}

              <React.Suspense
                fallback={
                  <div className="neo-copy border-4 border-black bg-[#f5eedf] p-5 text-[10px] font-black uppercase shadow-[4px_4px_0_#171411]">
                    Loading plugin diagnostics tape...
                  </div>
                }
              >
                <LazyPluginDiagnosticsPanel
                  isDesktopRuntime={isDesktopRuntime}
                  verifyMode={searchParams.get("verify")}
                />
              </React.Suspense>
            </>
          ) : (
            <div className="border-4 border-black bg-[#f5eedf] p-5 shadow-[4px_4px_0_#171411]">
              <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#b7102a] uppercase">
                Technical Tape
              </p>
              <div className="mt-2 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <h2 className="neo-title text-3xl leading-none text-[#171411]">Diagnostics</h2>
                  <p className="neo-copy mt-2 max-w-2xl text-[11px] leading-5 font-bold text-[#5b403f] uppercase">
                    Open provider health, readiness evidence and disabled plugin-package reviews
                    only when troubleshooting or collecting release proof.
                  </p>
                </div>
                <RouterLink
                  className="neo-copy inline-flex h-11 items-center justify-center border-2 border-black bg-[#007166] px-4 text-[11px] font-black text-white uppercase shadow-[3px_3px_0_#171411]"
                  to="/settings/diagnostics"
                >
                  Open Diagnostics
                </RouterLink>
              </div>
            </div>
          )}

          <NeoToggle
            checked={startWithSystem}
            description={
              isDesktopRuntime
                ? "Controls the native OS login entry"
                : "Desktop app required for native login autostart"
            }
            disabled={!isDesktopRuntime || autostartBusy}
            label="Start With System"
            onChange={(enabled) => void handleStartWithSystemChange(enabled)}
          />
          {autostartMessage ? (
            <p className="neo-copy border-2 border-black bg-[#f5eedf] px-3 py-2 text-[10px] font-bold text-[#55504a] uppercase shadow-[2px_2px_0_#171411]">
              {autostartMessage}
            </p>
          ) : null}

          <LauncherUpdatePanel currentVersion={systemInfo?.appVersion} />

          <ClientUpdateSchedulerSettings />

          <React.Suspense fallback={null}>
            <LazyBackupRestoreSettings
              externalDriveDetectionFixture={isBackupExternalDriveDetectionFixture}
              externalDriveEjectSafetyFixture={isBackupExternalDriveEjectSafetyFixture}
              externalDriveOsEjectFixture={isBackupExternalDriveOsEjectFixture}
              externalDriveWriteProofFixture={isBackupExternalDriveWriteProofFixture}
              showExternalDriveReadiness={isBackupExternalDriveVerify}
            />
          </React.Suspense>

          <div className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]">
            <div className="flex items-center justify-between border-b-4 border-black p-5">
              <div>
                <p className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">
                  Overlay Monitor
                </p>
                <h2 className="text-3xl font-black text-[#171411] uppercase">
                  Performance History
                </h2>
              </div>
              <Activity className="h-10 w-10 text-[#c20b2f]" />
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-[1fr_190px] md:items-center">
              <p className="neo-copy text-[10px] leading-relaxed font-bold text-[#55504a] uppercase">
                Review persisted overlay FPS, CPU, GPU, RAM, and frame-time samples with 7 day, 30
                day, and all-time filters.
              </p>
              <RouterLink
                className="neo-copy flex h-11 items-center justify-center gap-2 border-2 border-black bg-[#087d6d] px-4 text-[10px] font-black text-white uppercase shadow-[3px_3px_0_#171411]"
                to="/settings/performance"
              >
                <Activity className="h-4 w-4" />
                Open Tape
              </RouterLink>
            </div>
          </div>

          <React.Suspense fallback={null}>
            <LazyActivitySection />
          </React.Suspense>
        </div>

        <aside className="min-w-0 space-y-4">
          <div className="border-4 border-black bg-[#171411] p-5 text-[#f5eedf] shadow-[4px_4px_0_#171411]">
            <div className="flex items-center gap-3">
              <Power className="h-6 w-6 text-[#c20b2f]" />
              <h2 className="text-2xl font-black uppercase">Runtime</h2>
            </div>
            <dl className="mt-5 space-y-3">
              {[
                ["OS", systemInfo?.os ?? "Unavailable"],
                ["Arch", systemInfo?.arch ?? "Unavailable"],
                ["Version", systemInfo?.appVersion ?? "0.1.0"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-4 border-2 border-[#f5eedf] p-3"
                >
                  <dt className="neo-copy text-[10px] font-bold uppercase">{label}</dt>
                  <dd className="font-black uppercase">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]">
            <div className="border-b-4 border-black p-5">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-[#087d6d]" />
                <h2 className="text-2xl font-black uppercase">Status</h2>
              </div>
            </div>
            <div className="p-5">
              <p className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">
                Native Commands
              </p>
              <p className="mt-2 text-3xl font-black text-[#171411] uppercase">
                {!isDesktopRuntime ? "Browser Guard" : commandError ? "Fallback" : "Ready"}
              </p>
              {commandError ? (
                <p className="neo-copy mt-4 border-2 border-black bg-[#efe6d4] p-3 text-[10px] font-bold text-[#55504a] uppercase">
                  {commandError}
                </p>
              ) : !isDesktopRuntime ? (
                <p className="neo-copy mt-4 border-2 border-black bg-[#fff9ed] p-3 text-[10px] leading-5 font-bold text-[#55504a] uppercase">
                  Native commands are intentionally blocked in browser preview. Use the desktop app
                  for OS paths, login windows, schedulers, and keychain access.
                </p>
              ) : (
                <p className="neo-copy mt-4 text-[10px] font-bold text-[#55504a] uppercase">
                  System data loaded.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
