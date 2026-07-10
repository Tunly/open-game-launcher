export type OneClickSetupStatus = "blocked" | "ready" | "warning";

export interface OneClickSetupPlatformEvidence {
  gamesCount?: number;
  id: string;
  label: string;
  linked: boolean;
}

export interface OneClickSetupReadinessInput {
  backupReminderConfigured: boolean;
  installDir: string | null;
  installDirApplied?: boolean;
  isDesktopRuntime: boolean;
  librarySnapshotCount: number;
  platforms: OneClickSetupPlatformEvidence[];
  supabaseConfigured: boolean;
}

export interface OneClickSetupStep {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: OneClickSetupStatus;
}

export interface OneClickSetupReadiness {
  blockedCount: number;
  nextAction: string;
  progress: number;
  readyCount: number;
  steps: OneClickSetupStep[];
  summary: string;
  warningCount: number;
}

export function buildOneClickSetupReadiness(
  input: OneClickSetupReadinessInput,
): OneClickSetupReadiness {
  const linkedPlatforms = input.platforms.filter((platform) => platform.linked);
  const installDirApplied = Boolean(input.installDir && input.installDirApplied !== false);
  const importedGamesCount = input.platforms.reduce(
    (sum, platform) => sum + Math.max(0, platform.gamesCount ?? 0),
    0,
  );
  const steps: OneClickSetupStep[] = [
    {
      action: input.isDesktopRuntime
        ? "Native setup lane is online."
        : "Open the Tauri desktop app.",
      detail: input.isDesktopRuntime
        ? "Native commands can scan clients, paths, and secure tokens."
        : "Browser preview cannot open native login windows or scan OS clients.",
      id: "desktop-runtime",
      label: "Desktop Runtime",
      status: input.isDesktopRuntime ? "ready" : "blocked",
    },
    {
      action: !input.installDir
        ? "Choose a default game folder."
        : installDirApplied
          ? "Use this folder for first installs."
          : "Keep this selection in review until a native install-path setter consumes it.",
      detail: !input.installDir
        ? "No install target has been loaded yet."
        : installDirApplied
          ? input.installDir
          : `${input.installDir} is selected for review only and is not applied to installs.`,
      id: "install-target",
      label: "Install Target",
      status: installDirApplied ? "ready" : "warning",
    },
    {
      action:
        linkedPlatforms.length > 0
          ? "Run library sync for linked stores."
          : "Connect at least one game platform.",
      detail:
        linkedPlatforms.length > 0
          ? `${linkedPlatforms.length} linked platform${linkedPlatforms.length === 1 ? "" : "s"}: ${linkedPlatforms
              .map((platform) => platform.label)
              .join(", ")}.`
          : "Steam, GOG, Epic, EA, Xbox, and Battle.net are still local setup candidates.",
      id: "platform-links",
      label: "Store Links",
      status: linkedPlatforms.length > 0 ? "ready" : "warning",
    },
    {
      action:
        input.librarySnapshotCount + importedGamesCount > 0
          ? "Library seed is ready for the new PC."
          : "Scan or import games after connecting stores.",
      detail:
        input.librarySnapshotCount + importedGamesCount > 0
          ? `${input.librarySnapshotCount + importedGamesCount} local game record${
              input.librarySnapshotCount + importedGamesCount === 1 ? "" : "s"
            } staged.`
          : "No local library snapshot or imported platform cache is present.",
      id: "library-seed",
      label: "Library Seed",
      status: input.librarySnapshotCount + importedGamesCount > 0 ? "ready" : "warning",
    },
    {
      action: input.backupReminderConfigured
        ? "Restore and backup reminders are staged."
        : "Review backup/restore before migrating saves.",
      detail: input.backupReminderConfigured
        ? "Local backup reminder settings exist for this device."
        : "No backup reminder settings found in local storage.",
      id: "backup-restore",
      label: "Backup/Restore",
      status: input.backupReminderConfigured ? "ready" : "warning",
    },
    {
      action: input.supabaseConfigured
        ? "Cloud features can sign in once the account session is present."
        : "Configure Supabase env before hosted account sync.",
      detail: input.supabaseConfigured
        ? "Supabase environment is configured for account-backed setup."
        : "Hosted account sync is not configured in this local preview.",
      id: "cloud-account",
      label: "Cloud Account",
      status: input.supabaseConfigured ? "ready" : "warning",
    },
  ];
  const readyCount = steps.filter((step) => step.status === "ready").length;
  const warningCount = steps.filter((step) => step.status === "warning").length;
  const blockedCount = steps.filter((step) => step.status === "blocked").length;
  const nextStep =
    steps.find((step) => step.status === "blocked") ??
    steps.find((step) => step.status === "warning") ??
    null;

  return {
    blockedCount,
    nextAction: nextStep?.action ?? "Setup tape is ready for first launch.",
    progress: Math.round((readyCount / steps.length) * 100),
    readyCount,
    steps,
    summary: buildSummary(readyCount, steps.length, blockedCount),
    warningCount,
  };
}

function buildSummary(readyCount: number, totalCount: number, blockedCount: number) {
  if (readyCount === totalCount) {
    return "One-Click Setup can replay the local launcher bootstrap checklist.";
  }

  if (blockedCount > 0) {
    return "One-Click Setup is staged locally, but native desktop access is still required.";
  }

  return "One-Click Setup has a local migration checklist with remaining warnings.";
}
