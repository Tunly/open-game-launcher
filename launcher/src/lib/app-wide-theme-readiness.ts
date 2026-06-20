import {
  buildAppShellSkinReadinessEvidence,
  buildAppShellSkinRollbackEvidence,
  type AppShellSkinReadinessEvidence,
  type AppShellSkinRollbackEvidence,
} from "./app-shell-skins";

export type AppWideThemeReadinessStatus = "blocked" | "ready" | "warning";

export interface AppWideThemeReadinessInput {
  appShellSkinEvidence: AppShellSkinReadinessEvidence | null;
  customThemeImportExportReady: boolean;
  designSystemGuardReady: boolean;
  hostedCustomThemeDraftSyncReady: boolean;
  hostedShellSkinSyncReady: boolean;
  localProfileThemesReady: boolean;
  rollbackEvidence: AppShellSkinRollbackEvidence | null;
}

export interface AppWideThemeReadinessGate {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: AppWideThemeReadinessStatus;
}

export interface AppWideThemeReadiness {
  blockedCount: number;
  gates: AppWideThemeReadinessGate[];
  guardCopy: string;
  guards: string[];
  nextAction: string;
  progress: number;
  readyCount: number;
  statusLabel: string;
  summary: string;
  warningCount: number;
}

export function buildAppWideThemeReadiness(
  input: AppWideThemeReadinessInput,
): AppWideThemeReadiness {
  const appShellSkinEvidence = input.appShellSkinEvidence;
  const hasAppShellSkinEvidence = appShellSkinEvidence !== null;
  const rollbackEvidence = input.rollbackEvidence;
  const hasRollbackEvidence = rollbackEvidence !== null;
  const gates: AppWideThemeReadinessGate[] = [
    {
      action: input.localProfileThemesReady
        ? "Keep profile themes as the local source for skin previews."
        : "Restore local profile theme presets before app-wide skin work.",
      detail: input.localProfileThemesReady
        ? "Profile theme presets can be previewed without changing the launcher shell."
        : "No local profile-theme preset evidence is available.",
      id: "local-profile-themes",
      label: "Profile Themes",
      status: input.localProfileThemesReady ? "ready" : "blocked",
    },
    {
      action: input.localProfileThemesReady
        ? "Keep local profile drafts as preview-only skin evidence."
        : "Restore local draft persistence before app-wide skin work.",
      detail: input.localProfileThemesReady
        ? "Profile theme changes can be staged as a browser draft without applying shell state."
        : "No local profile-theme draft evidence is available.",
      id: "local-theme-draft",
      label: "Local Draft",
      status: input.localProfileThemesReady ? "ready" : "blocked",
    },
    {
      action: input.designSystemGuardReady
        ? "Keep Retro Manga Launcher tokens locked before any app-wide skin toggle."
        : "Define immutable Retro Manga border, paper, shadow, and navigation tokens.",
      detail: input.designSystemGuardReady
        ? "Retro Manga Launcher shell constraints are treated as a required guard."
        : "The skin system still needs a design-system safety contract.",
      id: "design-system-guard",
      label: "Design Guard",
      status: input.designSystemGuardReady ? "ready" : "blocked",
    },
    {
      action: hasAppShellSkinEvidence
        ? "Keep shell skin switching browser-only until live persistence and rollback are proven."
        : "Stage app-shell skin switching for header, navigation, panels, and dialogs.",
      detail: hasAppShellSkinEvidence
        ? `${appShellSkinEvidence.activeSkinName} is stored under ${appShellSkinEvidence.storageKey} and applies ${appShellSkinEvidence.surfaces.join(
            ", ",
          )} tokens on this device.`
        : "No app-wide skin toggle is staged for the launcher shell.",
      id: "app-shell-skin",
      label: "Shell Skin Switch",
      status: hasAppShellSkinEvidence ? "warning" : "blocked",
    },
    {
      action: input.customThemeImportExportReady
        ? "Keep imported themes as browser-local drafts until live persistence and rollback exist."
        : "Add schema validation, color safety, preview, and file review for custom themes.",
      detail: input.customThemeImportExportReady
        ? "Local JSON import/export is staged with schema and Retro Manga color safety checks."
        : "No custom theme import/export schema or file workflow is staged.",
      id: "custom-theme-exchange",
      label: "Import + Export",
      status: input.customThemeImportExportReady ? "warning" : "blocked",
    },
    {
      action:
        input.hostedShellSkinSyncReady && input.hostedCustomThemeDraftSyncReady
          ? "Keep hosted-write rehearsals scoped to query-shape evidence; do not claim live persistence."
          : "Stage query-shape coverage for built-in shell skin, custom theme draft, profile_theme_id reset, and schema fallback.",
      detail:
        input.hostedShellSkinSyncReady && input.hostedCustomThemeDraftSyncReady
          ? "Staged update paths cover profiles.app_shell_skin, profiles.custom_theme_json, and profiles.profile_theme_id query shapes only; no live persistence run is claimed."
          : "No hosted-write query-shape evidence for built-in shell skin, custom theme draft, or profile_theme_id is staged.",
      id: "hosted-theme-sync",
      label: "Hosted Sync",
      status:
        input.hostedShellSkinSyncReady && input.hostedCustomThemeDraftSyncReady
          ? "warning"
          : "blocked",
    },
    {
      action: hasRollbackEvidence
        ? "Keep reset limited to the browser-local default until marketplace rollback is proven."
        : "Stage default-theme rollback, invalid-theme recovery, and safe-mode reset.",
      detail: hasRollbackEvidence
        ? `${rollbackEvidence.defaultSkinName} is the browser-local reset target, invalid skin IDs fall back to ${rollbackEvidence.defaultSkinId}, and ${rollbackEvidence.storageKey} is rewritten on reset.`
        : "No rollback, safe-mode reset, or marketplace-skin recovery is staged.",
      id: "rollback",
      label: "Rollback",
      status: hasRollbackEvidence ? "warning" : "blocked",
    },
  ];
  const readyCount = gates.filter((gate) => gate.status === "ready").length;
  const warningCount = gates.filter((gate) => gate.status === "warning").length;
  const blockedCount = gates.filter((gate) => gate.status === "blocked").length;
  const nextGate =
    gates.find((gate) => gate.status === "blocked") ??
    gates.find((gate) => gate.status === "warning") ??
    null;
  const guards = [
    hasAppShellSkinEvidence ? "Browser-only shell skin selected" : "No app-wide shell skin applied",
    "Local custom theme JSON only",
    input.hostedShellSkinSyncReady
      ? "Shell-skin query-shape evidence only"
      : "No shell-skin query-shape evidence",
    input.hostedCustomThemeDraftSyncReady
      ? "Custom-theme draft query-shape evidence only"
      : "No custom-theme draft query-shape evidence",
    "profile_theme_id query-shape evidence only",
    "No live profile-theme persistence",
    hasRollbackEvidence
      ? "Browser-only default-skin reset only"
      : "No rollback or marketplace claim",
    "No marketplace rollback claim",
  ];
  const guardCopy = hasAppShellSkinEvidence
    ? "Local app-wide Theme/Skin readiness only. Browser-only shell skins switch Retro Manga shell tokens on this device, staged query-shape checks cover built-in shell skin IDs, validated custom theme JSON drafts, and profile_theme_id reset, and default-skin reset is local. Live profile-theme persistence and marketplace skins remain open."
    : "Local app-wide Theme/Skin readiness only. Custom theme JSON exchange is schema-validated in the browser, but this panel does not apply an app-wide shell skin, prove live profile-theme persistence, install marketplace skins, or prove rollback.";

  return {
    blockedCount,
    gates,
    guardCopy,
    guards,
    nextAction: nextGate?.action ?? "App-wide Theme/Skin gates can enter controlled staging.",
    progress: Math.round((readyCount / gates.length) * 100),
    readyCount,
    statusLabel:
      blockedCount > 0 ? "Local only" : warningCount > 0 ? "Needs staging" : "Review ready",
    summary:
      blockedCount > 0
        ? "App-wide Theme/Skin rollout is still local readiness evidence; browser-only shell switching, profile_theme_id query-shape evidence, custom theme exchange, and default reset are staged while live profile-theme persistence remains open."
        : warningCount > 0
          ? "App-wide Theme/Skin staging evidence exists as query-shape coverage only; live shell rollout and profile-theme persistence still need review."
          : "App-wide Theme/Skin rollout can enter controlled staging.",
    warningCount,
  };
}

export function createVerifyAppWideThemeReadiness(): AppWideThemeReadiness {
  return buildAppWideThemeReadiness({
    appShellSkinEvidence: buildAppShellSkinReadinessEvidence(),
    customThemeImportExportReady: true,
    designSystemGuardReady: true,
    hostedCustomThemeDraftSyncReady: true,
    hostedShellSkinSyncReady: true,
    localProfileThemesReady: true,
    rollbackEvidence: buildAppShellSkinRollbackEvidence(),
  });
}
