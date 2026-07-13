import type { Game, Platform } from "./types";

export const GAME_ACTIONS = [
  "support",
  "verify",
  "repair",
  "check_update",
  "update",
  "uninstall",
  "remove_from_library",
  "open_provider",
] as const;

export type GameAction = (typeof GAME_ACTIONS)[number];

export type ExecutionMode =
  | "local_read_only"
  | "local_managed"
  | "provider_automation"
  | "os_automation"
  | "user_handoff"
  | "not_applicable";

export interface GameActionCapability {
  action: GameAction;
  available: boolean;
  completionObservable: boolean;
  destructive: boolean;
  label: string;
  mode: ExecutionMode;
  reason: string;
  requiresConfirmation: boolean;
}

export type GameActionCapabilities = Record<GameAction, GameActionCapability>;

export type GameActionOutcome =
  "completed" | "handoff_required" | "not_needed" | "blocked" | "failed";

export interface RunGameActionInput {
  action: GameAction;
  gameId: string;
  expectedProvider: string;
  expectedTitle: string;
  confirmationToken?: string;
}

export interface PrepareGameActionConfirmationInput {
  action: GameAction;
  gameId: string;
  expectedProvider: string;
  expectedTitle: string;
}

export interface PrepareGameActionConfirmationResult {
  gameId: string;
  action: GameAction;
  confirmationToken: string;
  expiresAt: string;
  expiresInSeconds: number;
}

export interface GameActionResult {
  action: GameAction;
  details: string[];
  gameId: string;
  libraryChanged: boolean;
  message: string;
  outcome: GameActionOutcome;
  provider: string;
  rescanRecommended: boolean;
  sessionId: string;
}

export type GameProvider =
  "steam" | "epic" | "gog" | "ea" | "ubisoft" | "battlenet" | "xbox" | "manual" | "og" | "unknown";

export type ManifestTrust = "missing" | "unsigned" | "signed" | "invalid";

export interface GameActionRuntimeContext {
  runtime: "desktop" | "browser";
  operatingSystem: Platform;
  /** Explicit compatibility-layer configuration; never inferred from a Windows path. */
  compatibilityLayerConfigured?: boolean;
  /** True only after the native inventory identifies the selected copy as OG-managed. */
  ogManaged?: boolean;
  manifestTrust?: ManifestTrust;
  hasLocalRepairPackage?: boolean;
  hasSignedUpdatePackage?: boolean;
  managedInstallPathVerified?: boolean;
  clientInstalled?: boolean;
  clientLoggedIn?: boolean | null;
  clientVersionFingerprint?: string | null;
  /** False/omitted until a real adapter for this provider/OS is registered. */
  providerAutomationAvailable?: boolean;
  gameRunning?: boolean;
}

export const SELECTED_COPY_ACTIONS = [...GAME_ACTIONS, "client_manager", "local_artwork"] as const;

export type SelectedCopyAction = (typeof SELECTED_COPY_ACTIONS)[number];

export type SelectedCopyActionCapability = Omit<GameActionCapability, "action"> & {
  action: SelectedCopyAction;
  scope: "selected_copy";
};

export type SelectedCopyActionCapabilities = Record<
  SelectedCopyAction,
  SelectedCopyActionCapability
>;

export const GROUP_GAME_ACTIONS = ["favorite", "hidden", "categories", "collections"] as const;

export type GroupGameAction = (typeof GROUP_GAME_ACTIONS)[number];
export type GroupSelectionState = "all" | "some" | "none";

export interface GroupGameActionCapability {
  action: GroupGameAction;
  aggregateState: GroupSelectionState;
  available: boolean;
  completionObservable: boolean;
  destructive: false;
  label: string;
  mode: "local_managed" | "not_applicable";
  reason: string;
  requiresConfirmation: false;
  scope: "all_copies";
}

export type GroupGameActionCapabilities = Record<GroupGameAction, GroupGameActionCapability>;

export interface OfficialSupportDestination {
  label: string;
  provider: Exclude<GameProvider, "manual" | "og" | "unknown">;
  url: string;
}

const PROVIDER_LABELS: Record<GameProvider, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG Galaxy",
  ea: "EA app",
  ubisoft: "Ubisoft Connect",
  battlenet: "Battle.net",
  xbox: "Xbox app",
  manual: "Manual entry",
  og: "OG-Launcher",
  unknown: "Unknown provider",
};

const PROVIDER_OS_SUPPORT: Record<
  Exclude<GameProvider, "manual" | "og" | "unknown">,
  readonly Platform[]
> = {
  steam: ["windows", "macos", "linux"],
  epic: ["windows", "macos"],
  gog: ["windows", "macos"],
  ea: ["windows", "macos"],
  ubisoft: ["windows"],
  battlenet: ["windows", "macos"],
  xbox: ["windows"],
};

const SUPPORT_DESTINATIONS: Record<
  Exclude<GameProvider, "manual" | "og" | "unknown">,
  OfficialSupportDestination
> = {
  steam: {
    label: "Steam Support",
    provider: "steam",
    url: "https://help.steampowered.com/",
  },
  epic: {
    label: "Epic Games Support",
    provider: "epic",
    url: "https://www.epicgames.com/help/",
  },
  gog: {
    label: "GOG Support",
    provider: "gog",
    url: "https://support.gog.com/",
  },
  ea: {
    label: "EA Help",
    provider: "ea",
    url: "https://help.ea.com/",
  },
  ubisoft: {
    label: "Ubisoft Help",
    provider: "ubisoft",
    url: "https://www.ubisoft.com/help",
  },
  battlenet: {
    label: "Battle.net Support",
    provider: "battlenet",
    url: "https://us.battle.net/support/",
  },
  xbox: {
    label: "Xbox Support",
    provider: "xbox",
    url: "https://support.xbox.com/",
  },
};

export function resolveGameProvider(
  game: Game,
  context?: Pick<GameActionRuntimeContext, "ogManaged">,
): GameProvider {
  if (context?.ogManaged) return "og";

  switch (game.launcher) {
    case "steam":
    case "epic":
    case "gog":
    case "ea":
    case "ubisoft":
    case "battlenet":
    case "xbox":
    case "manual":
      return game.launcher;
    default:
      return "unknown";
  }
}

export function resolveOfficialSupportDestination(
  gameOrProvider: Game | GameProvider,
): OfficialSupportDestination | null {
  const provider =
    typeof gameOrProvider === "string" ? gameOrProvider : resolveGameProvider(gameOrProvider);
  if (provider === "manual" || provider === "og" || provider === "unknown") return null;
  return SUPPORT_DESTINATIONS[provider];
}

export function resolveGameActionCapabilities(
  game: Game,
  context: GameActionRuntimeContext,
): GameActionCapabilities {
  return Object.fromEntries(
    GAME_ACTIONS.map((action) => [action, resolveGameActionCapability(game, action, context)]),
  ) as GameActionCapabilities;
}

export function resolveGameActionCapability(
  game: Game,
  action: GameAction,
  context: GameActionRuntimeContext,
): GameActionCapability {
  const provider = resolveGameProvider(game, context);

  if (action === "support") return resolveSupportCapability(provider);
  if (action === "open_provider") return resolveOpenProviderCapability(provider, context);

  if (provider === "manual") return resolveManualCapability(game, action, context);
  if (provider === "og") return resolveOgManagedCapability(game, action, context);
  if (provider === "unknown") {
    return unavailable(
      action,
      defaultLabel(action, provider),
      "not_applicable",
      "The selected copy has no recognized provider identity.",
    );
  }

  if (action === "remove_from_library") {
    return unavailable(
      action,
      "Remove from Library",
      "not_applicable",
      "Provider-managed copies use their provider uninstall workflow instead of library-only removal.",
      true,
    );
  }

  return resolveProviderMaintenanceCapability(game, provider, action, context);
}

export function resolveSelectedCopyActionCapabilities(
  game: Game,
  context: GameActionRuntimeContext,
): SelectedCopyActionCapabilities {
  const capabilities = resolveGameActionCapabilities(game, context);
  const provider = resolveGameProvider(game, context);
  const selected = Object.fromEntries(
    GAME_ACTIONS.map((action) => [
      action,
      { ...capabilities[action], scope: "selected_copy" as const },
    ]),
  ) as Pick<SelectedCopyActionCapabilities, GameAction>;

  return {
    ...selected,
    client_manager: withSelectedScope(resolveClientManagerCapability(provider, context)),
    local_artwork: withSelectedScope({
      action: "local_artwork",
      available: true,
      completionObservable: true,
      destructive: false,
      label: "Local Artwork",
      mode: "local_managed",
      reason: "Artwork changes stay on this device and target only the selected game copy.",
      requiresConfirmation: false,
    }),
  };
}

export function resolveGroupSelectionState(
  gameIds: readonly string[],
  isSelected: (gameId: string) => boolean,
): GroupSelectionState {
  if (gameIds.length === 0) return "none";
  const selectedCount = gameIds.filter(isSelected).length;
  if (selectedCount === 0) return "none";
  return selectedCount === gameIds.length ? "all" : "some";
}

export function resolveGroupGameActionCapabilities(
  variants: readonly Game[],
  aggregateStates: Partial<Record<GroupGameAction, GroupSelectionState>> = {},
): GroupGameActionCapabilities {
  const hasCopies = variants.length > 0;
  const labels: Record<GroupGameAction, string> = {
    favorite: "Favorite all copies",
    hidden: "Hide all copies",
    categories: "Categories for all copies",
    collections: "Collections for all copies",
  };

  return Object.fromEntries(
    GROUP_GAME_ACTIONS.map((action) => [
      action,
      {
        action,
        aggregateState: aggregateStates[action] ?? "none",
        available: hasCopies,
        completionObservable: hasCopies,
        destructive: false as const,
        label: labels[action],
        mode: hasCopies ? ("local_managed" as const) : ("not_applicable" as const),
        reason: hasCopies
          ? "This local setting applies explicitly to every copy in the selected group."
          : "No game copies are available for a group action.",
        requiresConfirmation: false as const,
        scope: "all_copies" as const,
      },
    ]),
  ) as GroupGameActionCapabilities;
}

function resolveSupportCapability(provider: GameProvider): GameActionCapability {
  const destination = resolveOfficialSupportDestination(provider);
  if (!destination) {
    return unavailable(
      "support",
      "Support",
      "not_applicable",
      "No verified provider-owned support destination is available for this copy.",
    );
  }

  return {
    action: "support",
    available: true,
    completionObservable: false,
    destructive: false,
    label: destination.label,
    mode: "user_handoff",
    reason: "Opens the provider-owned HTTPS support landing page without account or machine data.",
    requiresConfirmation: false,
  };
}

function resolveOpenProviderCapability(
  provider: GameProvider,
  context: GameActionRuntimeContext,
): GameActionCapability {
  const label = `Open ${PROVIDER_LABELS[provider]}`;
  if (!isThirdPartyProvider(provider)) {
    return unavailable(
      "open_provider",
      label,
      "not_applicable",
      "This copy does not have a third-party provider client.",
    );
  }
  const applicability = providerApplicabilityReason(provider, context);
  if (applicability) return unavailable("open_provider", label, "not_applicable", applicability);
  if (context.runtime !== "desktop") return desktopRequired("open_provider", label);
  if (!context.clientInstalled) {
    return unavailable(
      "open_provider",
      label,
      "user_handoff",
      `${PROVIDER_LABELS[provider]} is not detected on this device.`,
    );
  }
  return {
    action: "open_provider",
    available: true,
    completionObservable: false,
    destructive: false,
    label,
    mode: "user_handoff",
    reason: `Opens ${PROVIDER_LABELS[provider]}; opening a client is not reported as action completion.`,
    requiresConfirmation: false,
  };
}

function resolveManualCapability(
  game: Game,
  action: Exclude<GameAction, "support" | "open_provider">,
  context: GameActionRuntimeContext,
): GameActionCapability {
  if (action === "remove_from_library") {
    if (context.runtime !== "desktop") return desktopRequired(action, "Remove from Library", true);
    return {
      action,
      available: true,
      completionObservable: true,
      destructive: true,
      label: "Remove from Library",
      mode: "local_managed",
      reason: "Removes only the manual library row and never deletes user game files.",
      requiresConfirmation: true,
    };
  }
  if (action === "verify") {
    const label = "Check launch target";
    if (game.status === "not_installed") return notInstalled(action, label);
    if (context.runtime !== "desktop") return desktopRequired(action, label);
    if (!game.executablePath && !game.installPath) {
      return unavailable(
        action,
        label,
        "local_read_only",
        "The manual entry has no local launch target to check.",
      );
    }
    return {
      action,
      available: true,
      completionObservable: true,
      destructive: false,
      label,
      mode: "local_read_only",
      reason: "Checks the configured file or folder without modifying it.",
      requiresConfirmation: false,
    };
  }

  return unavailable(
    action,
    defaultLabel(action, "manual"),
    "not_applicable",
    "Manual entries have no provider repair, update, or uninstall workflow.",
    action === "uninstall",
  );
}

function resolveOgManagedCapability(
  game: Game,
  action: Exclude<GameAction, "support" | "open_provider">,
  context: GameActionRuntimeContext,
): GameActionCapability {
  const label = defaultLabel(action, "og");
  if (action === "remove_from_library") {
    return unavailable(
      action,
      "Remove from Library",
      "not_applicable",
      "OG-managed copies use the bounded managed uninstall action.",
      true,
    );
  }
  if (game.status === "not_installed" && action !== "check_update")
    return notInstalled(action, label);
  if (context.runtime !== "desktop") return desktopRequired(action, label, action === "uninstall");
  if (context.gameRunning && ["verify", "repair", "update", "uninstall"].includes(action)) {
    return runningBlocked(action, label, action === "uninstall", "local_managed");
  }
  if (context.manifestTrust !== "signed") {
    return unavailable(
      action,
      label,
      action === "verify" || action === "check_update" ? "local_read_only" : "local_managed",
      "A signed OG-managed manifest is required before this action can run.",
      action === "uninstall",
    );
  }
  if (action === "repair" && !context.hasLocalRepairPackage) {
    return unavailable(
      action,
      label,
      "local_managed",
      "No validated local repair package is available.",
    );
  }
  if (action === "update" && !context.hasSignedUpdatePackage) {
    return unavailable(
      action,
      label,
      "local_managed",
      "No signed update package is available, so no files will be changed.",
    );
  }
  if (action === "uninstall" && !context.managedInstallPathVerified) {
    return unavailable(
      action,
      label,
      "local_managed",
      "The install path has not been proven to be inside the OG-managed root.",
      true,
    );
  }

  return {
    action,
    available: true,
    completionObservable: true,
    destructive: action === "uninstall" || action === "update" || action === "repair",
    label,
    mode: action === "verify" || action === "check_update" ? "local_read_only" : "local_managed",
    reason: "The selected copy has the local trusted evidence required for this action.",
    requiresConfirmation: action === "uninstall",
  };
}

function resolveProviderMaintenanceCapability(
  game: Game,
  provider: Exclude<GameProvider, "manual" | "og" | "unknown">,
  action: Exclude<GameAction, "support" | "open_provider" | "remove_from_library">,
  context: GameActionRuntimeContext,
): GameActionCapability {
  const label = defaultLabel(action, provider);
  const destructive = action === "repair" || action === "update" || action === "uninstall";
  const applicability = providerApplicabilityReason(provider, context);
  if (applicability)
    return unavailable(action, label, "not_applicable", applicability, action === "uninstall");
  if (game.status === "not_installed") return notInstalled(action, label);
  if (context.runtime !== "desktop") return desktopRequired(action, label, action === "uninstall");
  if (context.gameRunning && ["verify", "repair", "update", "uninstall"].includes(action)) {
    return runningBlocked(action, label, action === "uninstall", "provider_automation");
  }
  if (!context.providerAutomationAvailable) {
    return unavailable(
      action,
      label,
      "provider_automation",
      `A verified ${PROVIDER_LABELS[provider]} automation adapter is not available for this provider/OS fingerprint.`,
      action === "uninstall",
    );
  }
  if (!context.clientInstalled) {
    return unavailable(
      action,
      label,
      "user_handoff",
      `${PROVIDER_LABELS[provider]} must be installed before this action can run.`,
      action === "uninstall",
    );
  }
  if (!context.clientVersionFingerprint?.trim()) {
    return unavailable(
      action,
      label,
      "provider_automation",
      `The ${PROVIDER_LABELS[provider]} client structure has not been fingerprinted safely.`,
      action === "uninstall",
    );
  }
  if (context.clientLoggedIn !== true) {
    return unavailable(
      action,
      label,
      "user_handoff",
      `${PROVIDER_LABELS[provider]} login state requires user review before automation can continue.`,
      action === "uninstall",
    );
  }

  return {
    action,
    available: true,
    completionObservable: true,
    destructive,
    label,
    mode: provider === "xbox" ? "os_automation" : "provider_automation",
    reason: `A known ${PROVIDER_LABELS[provider]} client fingerprint can target this exact copy and validate the postcondition.`,
    requiresConfirmation: action === "uninstall",
  };
}

function resolveClientManagerCapability(
  provider: GameProvider,
  context: GameActionRuntimeContext,
): Omit<SelectedCopyActionCapability, "scope"> {
  const label = `${PROVIDER_LABELS[provider]} Client Manager`;
  if (!isThirdPartyProvider(provider)) {
    return selectedUnavailable(
      "client_manager",
      label,
      "not_applicable",
      "This selected copy has no third-party provider client to manage.",
    );
  }
  const applicability = providerApplicabilityReason(provider, context);
  if (applicability)
    return selectedUnavailable("client_manager", label, "not_applicable", applicability);
  if (context.runtime !== "desktop") {
    return selectedUnavailable(
      "client_manager",
      label,
      "not_applicable",
      "Client Manager capabilities require the desktop app.",
    );
  }
  return {
    action: "client_manager",
    available: true,
    completionObservable: true,
    destructive: false,
    label,
    mode: "local_read_only",
    reason: "Shows local client health and configuration; it does not claim provider mutation.",
    requiresConfirmation: false,
  };
}

function providerApplicabilityReason(
  provider: Exclude<GameProvider, "manual" | "og" | "unknown">,
  context: GameActionRuntimeContext,
): string | null {
  if (PROVIDER_OS_SUPPORT[provider].includes(context.operatingSystem)) return null;
  if (context.operatingSystem === "linux" && context.compatibilityLayerConfigured) return null;
  return `${PROVIDER_LABELS[provider]} is not available on ${context.operatingSystem} without an explicitly supported compatibility layer.`;
}

function isThirdPartyProvider(
  provider: GameProvider,
): provider is Exclude<GameProvider, "manual" | "og" | "unknown"> {
  return provider !== "manual" && provider !== "og" && provider !== "unknown";
}

function defaultLabel(action: GameAction, provider: GameProvider): string {
  const providerLabel = PROVIDER_LABELS[provider];
  switch (action) {
    case "support":
      return `${providerLabel} Support`;
    case "verify":
      return provider === "manual"
        ? "Check launch target"
        : provider === "og"
          ? "Verify OG-managed files"
          : `Verify in ${providerLabel}`;
    case "repair":
      return provider === "og" ? "Repair OG-managed files" : `Repair in ${providerLabel}`;
    case "check_update":
      return provider === "og"
        ? "Check OG-managed update"
        : `Check for updates in ${providerLabel}`;
    case "update":
      return provider === "og" ? "Install signed update" : `Update with ${providerLabel}`;
    case "uninstall":
      return provider === "og" ? "Uninstall OG-managed game" : `Uninstall with ${providerLabel}`;
    case "remove_from_library":
      return "Remove from Library";
    case "open_provider":
      return `Open ${providerLabel}`;
  }
}

function unavailable(
  action: GameAction,
  label: string,
  mode: ExecutionMode,
  reason: string,
  requiresConfirmation = false,
): GameActionCapability {
  return {
    action,
    available: false,
    completionObservable: false,
    destructive:
      action === "repair" ||
      action === "update" ||
      action === "uninstall" ||
      action === "remove_from_library",
    label,
    mode,
    reason,
    requiresConfirmation,
  };
}

function selectedUnavailable(
  action: Exclude<SelectedCopyAction, GameAction>,
  label: string,
  mode: ExecutionMode,
  reason: string,
): Omit<SelectedCopyActionCapability, "scope"> {
  return {
    action,
    available: false,
    completionObservable: false,
    destructive: false,
    label,
    mode,
    reason,
    requiresConfirmation: false,
  };
}

function desktopRequired(
  action: GameAction,
  label: string,
  requiresConfirmation = false,
): GameActionCapability {
  return unavailable(
    action,
    label,
    "not_applicable",
    "This action requires the OG-Launcher desktop app; no native operation ran in the browser.",
    requiresConfirmation,
  );
}

function notInstalled(action: GameAction, label: string): GameActionCapability {
  return unavailable(
    action,
    label,
    "not_applicable",
    "This maintenance action does not apply because the selected copy is not installed.",
    action === "uninstall",
  );
}

function runningBlocked(
  action: GameAction,
  label: string,
  requiresConfirmation: boolean,
  mode: ExecutionMode,
): GameActionCapability {
  return unavailable(
    action,
    label,
    mode,
    "The selected game copy is running. Close it before starting maintenance.",
    requiresConfirmation,
  );
}

function withSelectedScope(
  capability: Omit<SelectedCopyActionCapability, "scope">,
): SelectedCopyActionCapability {
  return { ...capability, scope: "selected_copy" };
}
