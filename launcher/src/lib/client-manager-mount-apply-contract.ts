import type { ClientManagerMountApplySandboxProof } from "./types";

export type ClientManagerMountApplyStatus = "blocked" | "ready" | "review";

export interface ClientManagerMountApplyInput {
  adminElevationFlowStaged: boolean;
  assetCacheLookupReady: boolean;
  autoApplyCapability?: ClientManagerAutoApplyCapabilityInput | null;
  autoApplyGuardReady: boolean;
  destructiveWriteStaged: boolean;
  driverInstallStaged: boolean;
  liveClientMutationProofReady: boolean;
  officialProviderApplyMechanismReady: boolean;
  osMountSandboxReady: boolean;
  pathOverlayPreflightReady: boolean;
  providerTermsApprovalReady: boolean;
  rollbackUnmountReady: boolean;
  sandboxProof?: ClientManagerMountApplySandboxProof | null;
  symlinkJunctionStaged: boolean;
}

export interface ClientManagerAutoApplyCapabilityInput {
  adminReviewRecorded: boolean;
  availableDiskBytes: number | null;
  installTargetPath: string | null;
  requiredDiskBytes: number;
  requiresAdminReview: boolean;
  runtimeAvailable: boolean;
  runtimeLabel: string;
}

export interface ClientManagerMountApplyLane {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: ClientManagerMountApplyStatus;
}

export type ClientManagerProviderApplyPolicyStatus = "blocked" | "manual-only" | "review";

export interface ClientManagerProviderApplyPolicy {
  allowedSurface: string;
  id: string;
  label: string;
  nextAction: string;
  risk: string;
  status: ClientManagerProviderApplyPolicyStatus;
  terms: string;
}

export interface ClientManagerProviderApplyPolicySummary {
  blocked: number;
  manualOnly: number;
  review: number;
  total: number;
}

export interface ClientManagerAutoApplyCapabilityCheck {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: ClientManagerMountApplyStatus;
}

export interface ClientManagerAutoApplyCapabilitySummary {
  blocked: number;
  ready: number;
  review: number;
  total: number;
}

export interface ClientManagerMountApplyContract {
  autoApplyCapabilities: ClientManagerAutoApplyCapabilityCheck[];
  autoApplyCapabilityCopy: string;
  autoApplyCapabilitySummary: ClientManagerAutoApplyCapabilitySummary;
  blockedCount: number;
  guardCopy: string;
  guards: string[];
  lanes: ClientManagerMountApplyLane[];
  nextAction: string;
  progress: number;
  providerPolicyMatrix: ClientManagerProviderApplyPolicy[];
  providerPolicySummary: ClientManagerProviderApplyPolicySummary;
  readyCount: number;
  reviewCount: number;
  sandboxProof: ClientManagerMountApplySandboxProof | null;
  statusLabel: string;
  summary: string;
}

const CLIENT_MANAGER_MOUNT_APPLY_BASE_GUARDS = [
  "Local contract packet only",
  "No real provider mount application",
  "No provider auto-apply",
  "No symlink or junction creation",
  "No driver/kernel install",
  "No admin elevation",
  "No destructive client writes",
  "No live client mutation proof",
  "No provider terms approval claim",
];

const CLIENT_MANAGER_AUTO_APPLY_REQUIRED_DISK_BYTES = 40 * 1024 * 1024 * 1024;

function reviewStatus(ready: boolean): ClientManagerMountApplyStatus {
  return ready ? "review" : "blocked";
}

function blockedUntil(ready: boolean): ClientManagerMountApplyStatus {
  return ready ? "ready" : "blocked";
}

function blockedUnsafeStatus(): ClientManagerMountApplyStatus {
  return "blocked";
}

function createProviderApplyPolicyMatrix(): ClientManagerProviderApplyPolicy[] {
  return [
    {
      allowedSurface: "Launch/update handoff only; Steam library folders stay read-only.",
      id: "steam",
      label: "Steam",
      nextAction: "Require Steam-approved content relocation semantics before any apply runner.",
      risk: "Library-folder writes can invalidate manifests or conflict with Steam repair.",
      status: "blocked",
      terms: "No provider approval for launcher-managed overlays.",
    },
    {
      allowedSurface: "GOG Galaxy launch/import handoff only; local cache lookup stays read-only.",
      id: "gog",
      label: "GOG",
      nextAction: "Stage a Galaxy-approved install relocation path before client mutation.",
      risk: "Unapproved file moves can desync Galaxy ownership and repair state.",
      status: "blocked",
      terms: "No Galaxy terms approval for automated path apply.",
    },
    {
      allowedSurface: "Epic/Legendary launch handoff only; no Epic install-folder writes.",
      id: "epic",
      label: "Epic",
      nextAction: "Keep Epic apply work behind official launcher or documented CLI approval.",
      risk: "Manifest edits can break entitlement, repair, or anti-tamper expectations.",
      status: "blocked",
      terms: "No Epic provider-approved apply surface.",
    },
    {
      allowedSurface: "EA App launch handoff only; no silent installer or folder mutation.",
      id: "ea",
      label: "EA",
      nextAction: "Require an EA-approved install management surface and consent copy.",
      risk: "EA client paths and update flows are provider-owned.",
      status: "blocked",
      terms: "No EA terms approval for launcher-side apply.",
    },
    {
      allowedSurface: "Ubisoft Connect URI handoff only; no client data rewrites.",
      id: "ubisoft",
      label: "Ubisoft",
      nextAction: "Document a Ubisoft-approved relocation/update mechanism before writes.",
      risk: "Unapproved path overlays can break Connect updates and ownership checks.",
      status: "blocked",
      terms: "No Ubisoft terms approval for path overlays.",
    },
    {
      allowedSurface: "Battle.net URI handoff only; no install index edits.",
      id: "battlenet",
      label: "Battle.net",
      nextAction: "Require Battle.net-approved install metadata handling before mutation.",
      risk: "Agent-managed metadata can be corrupted by third-party writes.",
      status: "blocked",
      terms: "No Battle.net terms approval for client modification.",
    },
    {
      allowedSurface: "Xbox app / Windows Store handoff only; package folders stay sealed.",
      id: "xbox",
      label: "Xbox / Game Pass",
      nextAction: "Keep Game Pass installs out of apply scope unless Microsoft exposes approval.",
      risk: "Windows app packages and protected folders are not safe mutation targets.",
      status: "blocked",
      terms: "No Microsoft approval for package-folder mutation.",
    },
  ];
}

function summarizeProviderApplyPolicyMatrix(
  matrix: ClientManagerProviderApplyPolicy[],
): ClientManagerProviderApplyPolicySummary {
  return {
    blocked: matrix.filter((item) => item.status === "blocked").length,
    manualOnly: matrix.filter((item) => item.status === "manual-only").length,
    review: matrix.filter((item) => item.status === "review").length,
    total: matrix.length,
  };
}

function defaultAutoApplyCapabilityInput(): ClientManagerAutoApplyCapabilityInput {
  return {
    adminReviewRecorded: false,
    availableDiskBytes: null,
    installTargetPath: null,
    requiredDiskBytes: CLIENT_MANAGER_AUTO_APPLY_REQUIRED_DISK_BYTES,
    requiresAdminReview: true,
    runtimeAvailable: false,
    runtimeLabel: "Desktop runtime",
  };
}

function isReviewableInstallTarget(path: string | null): boolean {
  const trimmedPath = path?.trim() ?? "";
  return (
    trimmedPath.length > 0 &&
    (trimmedPath.startsWith("/") ||
      /^[A-Za-z]:[\\/]/.test(trimmedPath) ||
      trimmedPath.startsWith("\\\\"))
  );
}

function formatClientManagerBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  }
  return `${Math.max(0, bytes)} B`;
}

function buildClientManagerAutoApplyCapabilityChecks(
  input: ClientManagerAutoApplyCapabilityInput,
): ClientManagerAutoApplyCapabilityCheck[] {
  const installTargetReady = isReviewableInstallTarget(input.installTargetPath);
  const diskSpaceReady =
    typeof input.availableDiskBytes === "number" &&
    input.availableDiskBytes >= input.requiredDiskBytes;
  const diskSpaceKnown = typeof input.availableDiskBytes === "number";
  const adminGateSatisfied = !input.requiresAdminReview || input.adminReviewRecorded;

  return [
    {
      action: input.runtimeAvailable
        ? "Use native Client Manager metadata for local review only; execution remains behind provider gates."
        : "Open the desktop app before evaluating native path, updater, or disk metadata.",
      detail: input.runtimeAvailable
        ? `${input.runtimeLabel} is available for local capability review; no installer or provider client is opened.`
        : "Browser preview cannot inspect native paths, update handoff targets, or local disk metadata.",
      id: "desktop-runtime",
      label: "Runtime Presence",
      status: blockedUntil(input.runtimeAvailable),
    },
    {
      action: installTargetReady
        ? "Keep the install target as a review input; do not write provider folders from auto-apply."
        : "Configure an absolute local install target before auto-apply prerequisites can be reviewed.",
      detail: installTargetReady
        ? `Configured target: ${input.installTargetPath?.trim()}.`
        : "No absolute local install target is available for the capability packet.",
      id: "install-target",
      label: "Install Target",
      status: reviewStatus(installTargetReady),
    },
    {
      action: diskSpaceReady
        ? "Treat free-space evidence as a local sizing check; do not reserve or move files."
        : "Capture native disk free-space evidence for the selected install target.",
      detail: diskSpaceKnown
        ? `${formatClientManagerBytes(input.availableDiskBytes ?? 0)} available against ${formatClientManagerBytes(
            input.requiredDiskBytes,
          )} requested for local staging review.`
        : `No free-space snapshot is attached; ${formatClientManagerBytes(
            input.requiredDiskBytes,
          )} is the local review floor.`,
      id: "free-disk-space",
      label: "Free Disk Space",
      status: blockedUntil(diskSpaceReady),
    },
    {
      action: adminGateSatisfied
        ? "Keep admin review documented without requesting an elevated token from the launcher."
        : "Record provider installer admin requirements before any update handoff can be staged.",
      detail: input.requiresAdminReview
        ? input.adminReviewRecorded
          ? "Admin review is recorded as consent metadata only; no elevated process is launched."
          : "Provider updater may require operating-system elevation; no admin review is recorded yet."
        : "This local capability packet does not require an admin review path.",
      id: "admin-review",
      label: "Admin Review",
      status: input.requiresAdminReview ? reviewStatus(input.adminReviewRecorded) : "ready",
    },
  ];
}

function summarizeClientManagerAutoApplyCapabilities(
  checks: ClientManagerAutoApplyCapabilityCheck[],
): ClientManagerAutoApplyCapabilitySummary {
  return {
    blocked: checks.filter((check) => check.status === "blocked").length,
    ready: checks.filter((check) => check.status === "ready").length,
    review: checks.filter((check) => check.status === "review").length,
    total: checks.length,
  };
}

export function isClientManagerSandboxProofReady(
  proof: ClientManagerMountApplySandboxProof | null | undefined,
): proof is ClientManagerMountApplySandboxProof {
  return Boolean(
    proof &&
    proof.fileCount > 0 &&
    proof.verifiedFiles === proof.fileCount &&
    proof.rollbackVerified &&
    proof.symlinkFree &&
    !proof.providerPathsTouched &&
    !proof.adminElevationUsed &&
    !proof.mountedPathsCreated,
  );
}

function clientManagerMountApplyGuards(sandboxProofReady: boolean): {
  guardCopy: string;
  guards: string[];
} {
  if (!sandboxProofReady) {
    return {
      guardCopy:
        "Local Client Manager mount/apply contract only. Reviews existing path-overlay preflight, asset-cache lookup, and auto-apply guard evidence; it does not mount paths, create symlinks or junctions, elevate privileges, install drivers, mutate provider clients, write destructive changes, approve provider terms, or prove rollback/unmount completion.",
      guards: [...CLIENT_MANAGER_MOUNT_APPLY_BASE_GUARDS, "No rollback/unmount proof"],
    };
  }

  return {
    guardCopy:
      "Local Client Manager sandbox apply/rollback proof only. It uses throwaway paths for copy, manifest readback, hash verification, and rollback; it does not create OS mounts, symlinks, or junctions, elevate privileges, mutate provider clients, approve provider terms, or prove live provider rollback.",
    guards: [
      "Local sandbox apply proof only",
      "Sandbox rollback proof only",
      ...CLIENT_MANAGER_MOUNT_APPLY_BASE_GUARDS.slice(1),
    ],
  };
}

export function buildClientManagerMountApplyContract(
  input: ClientManagerMountApplyInput,
): ClientManagerMountApplyContract {
  const sandboxProof = input.sandboxProof ?? null;
  const sandboxProofReady = isClientManagerSandboxProofReady(sandboxProof);
  const osMountSandboxReady = input.osMountSandboxReady || sandboxProofReady;
  const rollbackUnmountReady = input.rollbackUnmountReady || sandboxProofReady;
  const { guardCopy, guards } = clientManagerMountApplyGuards(sandboxProofReady);
  const providerPolicyMatrix = createProviderApplyPolicyMatrix();
  const providerPolicySummary = summarizeProviderApplyPolicyMatrix(providerPolicyMatrix);
  const autoApplyCapabilities = buildClientManagerAutoApplyCapabilityChecks(
    input.autoApplyCapability ?? defaultAutoApplyCapabilityInput(),
  );
  const autoApplyCapabilitySummary =
    summarizeClientManagerAutoApplyCapabilities(autoApplyCapabilities);

  const lanes: ClientManagerMountApplyLane[] = [
    {
      action: input.pathOverlayPreflightReady
        ? "Keep using GameDetails preflight as the required intake before any apply runner exists."
        : "Restore path-overlay apply preflight before mounting can be discussed.",
      detail: input.pathOverlayPreflightReady
        ? "Source/target, duplicate target, root target, same-path, read-only, and writable-review checks are already modeled locally."
        : "No local path-overlay safety review is available.",
      id: "path-overlay-preflight",
      label: "Path Overlay Preflight",
      status: reviewStatus(input.pathOverlayPreflightReady),
    },
    {
      action: input.assetCacheLookupReady
        ? "Keep asset-cache behavior lookup-only until a provider/OS-safe apply path is approved."
        : "Restore shared asset-cache lookup and conflict preview evidence.",
      detail: input.assetCacheLookupReady
        ? "The shared cache can identify candidates and conflicts without changing provider client folders."
        : "Asset-cache candidates cannot be reviewed locally.",
      id: "asset-cache-lookup",
      label: "Asset Cache Lookup",
      status: reviewStatus(input.assetCacheLookupReady),
    },
    {
      action: input.autoApplyGuardReady
        ? "Keep autoApply blocked in history unless an official provider mechanism is proven."
        : "Restore the guarded autoApply policy before scheduled runs are allowed near apply work.",
      detail: input.autoApplyGuardReady
        ? "Scheduled autoApply records blocked state and does not open installers or write provider folders."
        : "Auto-apply guard evidence is missing.",
      id: "auto-apply-guard",
      label: "Auto-Apply Guard",
      status: reviewStatus(input.autoApplyGuardReady),
    },
    {
      action: input.officialProviderApplyMechanismReady
        ? "Review the provider-approved mechanism before enabling an apply runner."
        : "Keep the provider policy matrix blocked until Steam, GOG, Epic, EA, Ubisoft, Battle.net, and Xbox expose approved apply semantics.",
      detail: input.officialProviderApplyMechanismReady
        ? "Provider mechanism evidence exists, but write execution stays disabled in this packet."
        : `${providerPolicySummary.blocked}/${providerPolicySummary.total} provider apply policies remain blocked for launcher-managed path overlays or client modification.`,
      id: "provider-mechanism",
      label: "Provider Mechanism",
      status: blockedUntil(input.officialProviderApplyMechanismReady),
    },
    {
      action: osMountSandboxReady
        ? "Keep this proof confined to throwaway sandbox paths before any real OS mount or client folder work."
        : "Stage OS-specific mount sandboxing, permissions, cleanup, and failure handling.",
      detail: sandboxProofReady
        ? "Local sandbox apply proof copied files, wrote a manifest, verified hashes, and touched no provider paths; no OS mount was created."
        : input.osMountSandboxReady
          ? "OS mount sandbox evidence exists, but real client paths remain blocked."
          : "No Windows junction, macOS bind, or Linux mount sandbox result is proven.",
      id: "os-mount-sandbox",
      label: "OS Mount Sandbox",
      status: blockedUntil(osMountSandboxReady),
    },
    {
      action: rollbackUnmountReady
        ? "Keep rollback evidence scoped to sandbox-owned files until provider/client rollback is separately proven."
        : "Define rollback, unmount, stale-link cleanup, and crash-recovery evidence.",
      detail: sandboxProofReady
        ? "Sandbox rollback removed copied files and the manifest, then verified the target returned to its prior empty or removed state."
        : input.rollbackUnmountReady
          ? "Rollback evidence exists, but production apply remains disabled."
          : "No rollback/unmount proof exists for partially applied overlays.",
      id: "rollback-unmount",
      label: "Rollback + Unmount",
      status: blockedUntil(rollbackUnmountReady),
    },
    {
      action: input.providerTermsApprovalReady
        ? "Attach provider terms approval to each apply lane before write execution."
        : "Keep all apply lanes blocked until provider terms and user consent are reviewed.",
      detail: input.providerTermsApprovalReady
        ? "Terms evidence exists, but this route still avoids provider folder mutation."
        : "Provider terms approval and consent copy are not proven for client modification.",
      id: "terms-approval",
      label: "Terms Approval",
      status: blockedUntil(input.providerTermsApprovalReady),
    },
    {
      action: input.symlinkJunctionStaged
        ? "Remove symlink/junction staging from local readiness; it needs OS sandbox proof first."
        : "Do not create symlinks, junctions, or bind mounts from the launcher yet.",
      detail: input.symlinkJunctionStaged
        ? "Symlink/junction staging would be unsafe without provider approval, admin handling, rollback, and sandbox evidence."
        : "No symlink, junction, or bind-mount creation is staged.",
      id: "symlink-junction",
      label: "Symlink/Junction",
      status: blockedUnsafeStatus(),
    },
    {
      action: input.adminElevationFlowStaged
        ? "Keep elevation out of apply work until the consent and rollback contract is proven."
        : "Avoid admin elevation for client modification until a reviewed provider/OS path exists.",
      detail: input.adminElevationFlowStaged
        ? "Elevation staging would expand the blast radius before the contract is ready."
        : "No admin elevation flow is staged for mount or overlay apply.",
      id: "admin-elevation",
      label: "Admin Elevation",
      status: blockedUnsafeStatus(),
    },
    {
      action: input.driverInstallStaged
        ? "Remove driver/kernel staging from the launcher apply path."
        : "Keep all driver/kernel approaches outside the client-manager apply scope.",
      detail: input.driverInstallStaged
        ? "Driver/kernel staging is not acceptable for this contract."
        : "No driver or kernel component is staged for path overlays.",
      id: "driver-install",
      label: "Driver/Kernel",
      status: blockedUnsafeStatus(),
    },
    {
      action: input.destructiveWriteStaged
        ? "Block destructive writes until provider approval, backup, rollback, and user consent exist."
        : "Keep provider client folders unchanged; review only local path metadata.",
      detail: input.destructiveWriteStaged
        ? "Destructive write staging would risk provider data before approval and rollback proof."
        : "No destructive file move, delete, overwrite, or provider-client write is staged.",
      id: "destructive-writes",
      label: "Destructive Writes",
      status: blockedUnsafeStatus(),
    },
    {
      action: input.liveClientMutationProofReady
        ? "Review live mutation proof separately before any apply success language."
        : "Capture real-client mutation evidence only in a consented staging environment.",
      detail: input.liveClientMutationProofReady
        ? "Live client mutation evidence exists, but this packet still does not mutate clients."
        : "No live Steam/GOG/Epic/EA/Ubisoft/Battle.net/Xbox client mutation proof exists.",
      id: "live-client-mutation",
      label: "Live Client Mutation",
      status: blockedUntil(input.liveClientMutationProofReady),
    },
  ];

  const readyCount = lanes.filter((lane) => lane.status === "ready").length;
  const reviewCount = lanes.filter((lane) => lane.status === "review").length;
  const blockedCount = lanes.filter((lane) => lane.status === "blocked").length;
  const nextLane =
    lanes.find((lane) => lane.status === "blocked") ??
    lanes.find((lane) => lane.status === "review") ??
    null;

  return {
    autoApplyCapabilities,
    autoApplyCapabilityCopy:
      "Local auto-apply capability check only. It reviews runtime presence, install target shape, free-space evidence, and admin-review metadata; it does not request elevation, reserve disk space, open installers, execute updaters, mutate provider clients, or enable provider auto-apply.",
    autoApplyCapabilitySummary,
    blockedCount,
    guardCopy,
    guards,
    lanes,
    nextAction:
      nextLane?.action ??
      "Client Manager mount/apply contract is ready for a controlled staging runner.",
    progress: Math.round(((readyCount + reviewCount) / lanes.length) * 100),
    providerPolicyMatrix,
    providerPolicySummary,
    readyCount,
    reviewCount,
    sandboxProof: sandboxProofReady ? sandboxProof : null,
    statusLabel: blockedCount > 0 ? "Contract only" : reviewCount > 0 ? "Needs review" : "Ready",
    summary:
      blockedCount > 0
        ? sandboxProofReady
          ? "Client Manager mount/apply now has local sandbox copy, manifest, hash, and rollback proof; provider-approved apply, real OS mount, terms, and live mutation proof remain blocked."
          : "Client Manager mount/apply remains local contract evidence; provider-approved mechanisms, OS sandboxing, rollback, terms, and live mutation proof are still open."
        : reviewCount > 0
          ? "Client Manager mount/apply has local prerequisites, but still needs provider and OS review before execution."
          : "Client Manager mount/apply gates can enter controlled staging.",
  };
}

export function createVerifyClientManagerMountApplySandboxProof(): ClientManagerMountApplySandboxProof {
  return {
    adminElevationUsed: false,
    bytesCopied: 4096,
    fileCount: 2,
    files: [
      {
        relativePath: "fixtures/config.json",
        sha256: "a".repeat(64),
        sizeBytes: 1024,
      },
      {
        relativePath: "fixtures/asset-pack.bin",
        sha256: "b".repeat(64),
        sizeBytes: 3072,
      },
    ],
    manifestPath: "/tmp/og-client-manager-sandbox/target/og-client-manager-sandbox-manifest.json",
    message:
      "Local sandbox proof copied files, verified hashes, wrote a manifest, and rolled back sandbox-owned files only.",
    mountedPathsCreated: false,
    proofId: "client-manager-sandbox-proof-fixture",
    providerPathsTouched: false,
    rollbackVerified: true,
    sourcePath: "/tmp/og-client-manager-sandbox/source",
    symlinkFree: true,
    targetCreated: true,
    targetPath: "/tmp/og-client-manager-sandbox/target",
    verifiedFiles: 2,
  };
}

export function createVerifyClientManagerMountApplyContract(
  sandboxProof?: ClientManagerMountApplySandboxProof | null,
): ClientManagerMountApplyContract {
  return buildClientManagerMountApplyContract({
    adminElevationFlowStaged: false,
    assetCacheLookupReady: true,
    autoApplyCapability: {
      adminReviewRecorded: false,
      availableDiskBytes: 128 * 1024 * 1024 * 1024,
      installTargetPath: "D:\\OGLauncher\\Games",
      requiredDiskBytes: CLIENT_MANAGER_AUTO_APPLY_REQUIRED_DISK_BYTES,
      requiresAdminReview: true,
      runtimeAvailable: true,
      runtimeLabel: "Verification desktop runtime fixture",
    },
    autoApplyGuardReady: true,
    destructiveWriteStaged: false,
    driverInstallStaged: false,
    liveClientMutationProofReady: false,
    officialProviderApplyMechanismReady: false,
    osMountSandboxReady: false,
    pathOverlayPreflightReady: true,
    providerTermsApprovalReady: false,
    rollbackUnmountReady: false,
    sandboxProof,
    symlinkJunctionStaged: false,
  });
}
