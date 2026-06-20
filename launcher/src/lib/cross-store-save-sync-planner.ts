import { getGameSource } from "./formatters";
import {
  getProviderSaveMappingFixture,
  providerCatalogKey,
  resolveProviderTargetRelativePath,
} from "./provider-save-mapping-fixtures";
import type { CrossStoreSaveApplyRequest, Game } from "./types";

type SaveFile = NonNullable<Game["saveFiles"]>[number];

export type CrossStoreSaveSyncStatus = "ready" | "warning" | "blocked";

export interface CrossStoreSaveSyncVariant {
  id: string;
  title: string;
  source: string;
  sourceLabel: string;
  status: Game["status"];
  installPath: string | null;
  saveFileCount: number;
  latestSaveModifiedAt: string | null;
  totalSaveSizeBytes: number;
}

export interface CrossStoreSaveSyncLane {
  id: string;
  sourceVariantId: string;
  targetVariantId: string;
  sourceLabel: string;
  targetLabel: string;
  status: CrossStoreSaveSyncStatus;
  saveFileCount: number;
  totalSaveSizeBytes: number;
  sourcePathPreview: string | null;
  targetPathHint: string;
  summary: string;
  blockers: string[];
  warnings: string[];
}

export interface CrossStoreSaveSyncAuditFileAction {
  action: "review_copy" | "review_overwrite";
  conflictId: string | null;
  label: string;
  modifiedAt: string | null;
  reason: string;
  sizeBytes: number;
  sourcePath: string;
  targetPathHint: string;
}

export interface CrossStoreSaveSyncAuditSkippedAction {
  id: string;
  label: string;
  reason: string;
}

export interface CrossStoreSaveSyncRollbackPreview {
  executable: false;
  fileCount: number;
  manifestId: string;
  restoreStrategy: string;
  snapshotLabel: string;
  totalSizeBytes: number;
}

export interface CrossStoreSaveSyncAudit {
  conflictCount: number;
  conflictIds: string[];
  fileActionCount: number;
  generatedAt: string;
  guard: string;
  id: string;
  noCopyPerformed: true;
  plannedFileActions: CrossStoreSaveSyncAuditFileAction[];
  rollbackPreview: CrossStoreSaveSyncRollbackPreview;
  skippedActions: CrossStoreSaveSyncAuditSkippedAction[];
  sourceLabel: string;
  sourceVariantId: string;
  targetLabel: string;
  targetVariantId: string;
}

export interface CrossStoreSavePathMappingAction {
  conflictId: string | null;
  id: string;
  label: string;
  mappingRuleId: string | null;
  sourceRelativePath: string;
  status: "mapped" | "conflict_review";
  targetPath: string;
  targetRelativePath: string;
}

export interface CrossStoreSaveTargetRelativePathCollision {
  actionIds: string[];
  labels: string[];
  sourceRelativePaths: string[];
  targetRelativePath: string;
}

export interface CrossStoreSaveTargetRelativePathCollisionProof {
  blocker: string | null;
  collisionCount: number;
  collisions: CrossStoreSaveTargetRelativePathCollision[];
  guard: string;
  noSecretsRequired: true;
  status: "unique" | "blocked";
  warning: string | null;
}

export interface CrossStoreSavePathMappingProof {
  actionCount: number;
  guard: string;
  id: string;
  mappedActions: CrossStoreSavePathMappingAction[];
  nativeApplyHint: string;
  sourceProvider: string;
  sourceRoot: string;
  status: "review-ready";
  targetCollisionProof: CrossStoreSaveTargetRelativePathCollisionProof;
  targetProvider: string;
  targetRoot: string;
}

export interface CrossStoreSaveNativeApplyProof {
  actionCount: number;
  backupPolicy: string;
  blockedAfterProof: string[];
  consentOperation: "cross_store_save_native_copy_apply";
  detail: string;
  expectedVerification: string[];
  label: string;
  manifestFile: string;
  rollbackConsentOperation: "cross_store_save_native_copy_rollback";
  rollbackPolicy: string;
  sourceLabel: string;
  status: "desktop-ready";
  targetLabel: string;
}

export interface CrossStoreSaveAutomaticPathMapApplyAction {
  conflictId: string | null;
  expectedSizeBytes: number | null;
  id: string;
  mappingRuleId: string | null;
  mode: "copy" | "overwrite_review";
  sourcePath: string;
  sourceRelativePath: string;
  targetPath: string;
  targetRelativePath: string;
}

export interface CrossStoreSaveAutomaticPathMapApplyProof {
  actionCount: number;
  actions: CrossStoreSaveAutomaticPathMapApplyAction[];
  blockedAfterProof: string[];
  consentOperation: "cross_store_save_native_copy_apply";
  guard: string;
  id: string;
  nativeRequestTemplate: CrossStoreSaveApplyRequest;
  noBrowserMutation: true;
  sourceLabel: string;
  status: "consent-required";
  summary: string;
  targetLabel: string;
  writeBoundary: string;
}

export interface CrossStoreSavePostCopyVerificationItem {
  checks: string[];
  conflictId: string | null;
  expectedTargetPath: string;
  id: string;
  label: string;
  sourceRelativePath: string;
  status: "hash_review" | "overwrite_snapshot_review";
  targetRelativePath: string;
}

export interface CrossStoreSavePostCopyVerificationProof {
  actionCount: number;
  blockedAfterProof: string[];
  conflictCount: number;
  expectedManifestFile: string;
  guard: string;
  id: string;
  items: CrossStoreSavePostCopyVerificationItem[];
  rollbackGuardCount: number;
  status: "review-ready";
  summary: string;
}

export interface CrossStoreSaveProviderCatalogEntry {
  catalogKey: string;
  checks: string[];
  externalId: string | null;
  id: string;
  provider: string;
  saveFileCount: number;
  status: "covered" | "manual_review";
  variantId: string;
}

export interface CrossStoreSaveProviderCatalogPairing {
  id: string;
  label: string;
  sourceCatalogKey: string;
  status: "local_pair";
  targetCatalogKey: string;
}

export interface CrossStoreSaveProviderCatalogProof {
  blockedAfterProof: string[];
  coveredVariantCount: number;
  entries: CrossStoreSaveProviderCatalogEntry[];
  guard: string;
  id: string;
  manualReviewCount: number;
  pairings: CrossStoreSaveProviderCatalogPairing[];
  status: "review-ready";
  title: string;
}

export interface CrossStoreSaveProviderPathIdMappingEntry {
  blockers: string[];
  catalogKey: string;
  checks: string[];
  externalId: string | null;
  id: string;
  installPath: string | null;
  provider: string;
  relativePathRuleCount: number;
  saveFileCount: number;
  saveRoot: string | null;
  saveRootShape: string | null;
  status: "mapped" | "manual_review";
  variantId: string;
}

export interface CrossStoreSaveProviderPathIdMappingProof {
  blockedAfterProof: string[];
  entries: CrossStoreSaveProviderPathIdMappingEntry[];
  guard: string;
  id: string;
  manualReviewCount: number;
  mappedVariantCount: number;
  status: "review-ready";
  title: string;
}

export interface CrossStoreSaveProviderCloudContractEntry {
  accountScope: string;
  blockers: string[];
  catalogKey: string;
  exportContract: string;
  id: string;
  importContract: string;
  provider: string;
  status: "provider_contract_required";
  variantId: string;
}

export interface CrossStoreSaveProviderCloudContractProof {
  blockedAfterProof: string[];
  entries: CrossStoreSaveProviderCloudContractEntry[];
  guard: string;
  id: string;
  requiredContractCount: number;
  status: "blocked-contract";
  title: string;
}

export interface CrossStoreSaveSupabaseKeychainStagingStep {
  evidence: string;
  id: string;
  label: string;
  status: "staging_contract" | "live_blocked";
}

export interface CrossStoreSaveSupabaseKeychainStagingProof {
  blockedAfterProof: string[];
  bucketName: "game-saves";
  cleanupEvidence: string;
  consentOperation: "cross_store_save_supabase_keychain_staging_proof";
  encryptedObjectCount: number;
  guard: string;
  hashVerificationCount: number;
  id: string;
  keychainOperation: "get_or_create_user_keyring_key";
  metadataSidecarCount: number;
  noKeyExport: true;
  objectPrefix: string;
  providerTransferSkipped: true;
  sourceLabel: string;
  status: "staging-contract";
  steps: CrossStoreSaveSupabaseKeychainStagingStep[];
  summary: string;
  targetLabel: string;
  title: string;
}

export interface CrossStoreSaveMigrationSessionRehearsalStep {
  action: string;
  evidence: string;
  id: string;
  label: string;
  status: "local_evidence" | "external_blocked";
}

export interface CrossStoreSaveMigrationSessionRehearsalProof {
  blockedAfterProof: string[];
  blockedStepCount: number;
  guard: string;
  id: string;
  localEvidenceCount: number;
  sourceLabel: string;
  status: "rehearsal-only";
  steps: CrossStoreSaveMigrationSessionRehearsalStep[];
  summary: string;
  targetLabel: string;
  title: string;
}

export interface CrossStoreSaveSyncPlan {
  audit: CrossStoreSaveSyncAudit | null;
  providerCatalogProof: CrossStoreSaveProviderCatalogProof | null;
  providerPathIdMappingProof: CrossStoreSaveProviderPathIdMappingProof | null;
  providerCloudContractProof: CrossStoreSaveProviderCloudContractProof | null;
  pathMappingProof: CrossStoreSavePathMappingProof | null;
  nativeApplyProof: CrossStoreSaveNativeApplyProof | null;
  automaticPathMapApplyProof: CrossStoreSaveAutomaticPathMapApplyProof | null;
  postCopyVerificationProof: CrossStoreSavePostCopyVerificationProof | null;
  supabaseKeychainStagingProof: CrossStoreSaveSupabaseKeychainStagingProof | null;
  migrationSessionRehearsalProof: CrossStoreSaveMigrationSessionRehearsalProof | null;
  status: CrossStoreSaveSyncStatus;
  label: string;
  summary: string;
  title: string;
  variantCount: number;
  trackedSaveFileCount: number;
  readyLaneCount: number;
  warningLaneCount: number;
  blockedLaneCount: number;
  variants: CrossStoreSaveSyncVariant[];
  lanes: CrossStoreSaveSyncLane[];
  guards: string[];
  blockers: string[];
  warnings: string[];
}

const SOURCE_LABELS: Record<string, string> = {
  battlenet: "Battle.net",
  ea: "EA",
  epic: "Epic",
  gog: "GOG",
  manual: "Manual",
  steam: "Steam",
  ubisoft: "Ubisoft",
  unknown: "Unknown",
  xbox: "Xbox",
};

const LOCAL_ONLY_GUARDS = [
  "Local review only",
  "Dry-run audit before copy",
  "Native copy requires explicit desktop consent",
  "No automatic save migration",
  "No browser file mutation",
  "No provider cloud transfer",
  "Provider cloud contract review only",
  "Provider catalog coverage review only",
  "Provider path/id fixture review only",
  "Automatic path-map apply is consent-gated",
  "Post-copy verification review only",
  "Supabase/keychain staging proof review only",
  "Migration session rehearsal review only",
  "No automatic rollback execution",
  "No live Supabase/keychain bucket E2E",
  "User review required before any write",
];

export function buildCrossStoreSaveSyncPlan(games: Game[]): CrossStoreSaveSyncPlan {
  const variants = uniqueGames(games).map(toVariant);
  const sourceGames = uniqueGames(games).filter((game) => (game.saveFiles?.length ?? 0) > 0);
  const lanes = sourceGames.flatMap((source) =>
    uniqueGames(games)
      .filter((target) => target.id !== source.id)
      .map((target) => buildLane(source, target)),
  );
  const readyLaneCount = lanes.filter((lane) => lane.status === "ready").length;
  const warningLaneCount = lanes.filter((lane) => lane.status === "warning").length;
  const blockedLaneCount = lanes.filter((lane) => lane.status === "blocked").length;
  const trackedSaveFileCount = variants.reduce(
    (total, variant) => total + variant.saveFileCount,
    0,
  );
  const blockers: string[] = [];
  const warnings: string[] = [];
  const title = variants[0]?.title ?? "Selected game";
  const providerCatalogProof = variants.length > 0 ? buildProviderCatalogProof(games, title) : null;
  const providerPathIdMappingProof =
    variants.length > 0 ? buildProviderPathIdMappingProof(games, title) : null;
  const providerCloudContractProof =
    variants.length > 0 ? buildProviderCloudContractProof(games, title) : null;
  const audit = buildAuditForFirstReviewLane(lanes, games);
  const pathMappingProof = audit ? buildPathMappingProof(audit, games) : null;
  const targetCollisionProof = pathMappingProof?.targetCollisionProof ?? null;
  const hasTargetCollisionBlocker = targetCollisionProof?.status === "blocked";
  const nativeApplyProof =
    audit && !hasTargetCollisionBlocker ? buildNativeApplyProof(audit) : null;
  const automaticPathMapApplyProof =
    audit && pathMappingProof && nativeApplyProof
      ? buildAutomaticPathMapApplyProof(audit, pathMappingProof, nativeApplyProof)
      : null;
  const postCopyVerificationProof =
    audit && pathMappingProof && nativeApplyProof
      ? buildPostCopyVerificationProof(audit, pathMappingProof, nativeApplyProof)
      : null;
  const supabaseKeychainStagingProof =
    audit && pathMappingProof && postCopyVerificationProof
      ? buildSupabaseKeychainStagingProof(audit, pathMappingProof, postCopyVerificationProof, title)
      : null;
  const migrationSessionRehearsalProof =
    audit &&
    providerCatalogProof &&
    providerPathIdMappingProof &&
    providerCloudContractProof &&
    pathMappingProof &&
    nativeApplyProof &&
    postCopyVerificationProof &&
    supabaseKeychainStagingProof
      ? buildMigrationSessionRehearsalProof(
          audit,
          providerCatalogProof,
          providerPathIdMappingProof,
          providerCloudContractProof,
          pathMappingProof,
          nativeApplyProof,
          postCopyVerificationProof,
          supabaseKeychainStagingProof,
          title,
        )
      : null;

  if (variants.length < 2) {
    blockers.push("At least two store variants are required.");
  }
  if (trackedSaveFileCount === 0) {
    blockers.push("No tracked save files are available for a source variant.");
  }
  if (lanes.length === 0 && blockers.length === 0) {
    blockers.push("No source-to-target save lane could be planned.");
  }
  if (hasTargetCollisionBlocker && targetCollisionProof.blocker) {
    blockers.push(targetCollisionProof.blocker);
  }
  if (variants.some((variant) => variant.status !== "installed")) {
    warnings.push(
      "Install every target variant before designing any future migration; this panel will not run one.",
    );
  }
  if (lanes.some((lane) => lane.warnings.some((warning) => warning.includes("path")))) {
    warnings.push("Review provider-specific save folders manually before any copy.");
  }
  if (hasTargetCollisionBlocker && targetCollisionProof.warning) {
    warnings.push(targetCollisionProof.warning);
  }

  const status: CrossStoreSaveSyncStatus =
    blockers.length > 0
      ? "blocked"
      : readyLaneCount > 0
        ? "ready"
        : warningLaneCount > 0
          ? "warning"
          : "blocked";

  return {
    audit,
    providerCatalogProof,
    providerPathIdMappingProof,
    providerCloudContractProof,
    pathMappingProof,
    nativeApplyProof,
    automaticPathMapApplyProof,
    postCopyVerificationProof,
    supabaseKeychainStagingProof,
    migrationSessionRehearsalProof,
    status,
    label:
      status === "ready" ? "Review Plan Only" : status === "warning" ? "Review Needed" : "Blocked",
    summary:
      status === "ready"
        ? `${readyLaneCount} local review lane${readyLaneCount === 1 ? "" : "s"} ${
            readyLaneCount === 1 ? "is" : "are"
          } available for ${title}; native apply is desktop-only and requires explicit consent.`
        : status === "warning"
          ? `Cross-store save sync for ${title} needs install/path review.`
          : `Cross-store save sync for ${title} is missing required local evidence.`,
    title,
    variantCount: variants.length,
    trackedSaveFileCount,
    readyLaneCount,
    warningLaneCount,
    blockedLaneCount,
    variants,
    lanes,
    guards: [...LOCAL_ONLY_GUARDS],
    blockers,
    warnings,
  };
}

function buildNativeApplyProof(audit: CrossStoreSaveSyncAudit): CrossStoreSaveNativeApplyProof {
  return {
    actionCount: audit.fileActionCount,
    backupPolicy:
      audit.conflictCount > 0
        ? `${audit.conflictCount} overwrite conflict${audit.conflictCount === 1 ? "" : "s"} require target snapshot before copy.`
        : "Targets without conflicts can be copied after source hash verification.",
    blockedAfterProof: [
      "Provider path mapping output must be reviewed before consent.",
      "Provider cloud transfer is not called.",
      "Rollback restore is native-local only and requires unchanged target hashes.",
      "Live Supabase/keychain bucket E2E is not part of native copy.",
    ],
    consentOperation: "cross_store_save_native_copy_apply",
    detail:
      "Desktop command copies reviewed relative save files, snapshots existing targets, writes an apply manifest, and verifies SHA-256 after copy.",
    expectedVerification: [
      "Explicit consent operation and action count match",
      "Source and target roots are absolute and traversal-free",
      "Source files and target files are not symlinks",
      "Expected source size/SHA-256 match before copy",
      "Copied file size/SHA-256 match after copy",
      "Rollback blocks if target hashes changed after apply",
    ],
    label: "Native Apply Proof",
    manifestFile: "og-cross-store-save-apply.json",
    rollbackConsentOperation: "cross_store_save_native_copy_rollback",
    rollbackPolicy:
      "Rollback restores backed-up target files and deletes newly copied files only when current target hashes still match the apply manifest.",
    sourceLabel: audit.sourceLabel,
    status: "desktop-ready",
    targetLabel: audit.targetLabel,
  };
}

function buildPathMappingProof(
  audit: CrossStoreSaveSyncAudit,
  games: Game[],
): CrossStoreSavePathMappingProof | null {
  const source = games.find((game) => game.id === audit.sourceVariantId);
  const target = games.find((game) => game.id === audit.targetVariantId);
  if (!source || !target) return null;

  const sourceFiles = source.saveFiles ?? [];
  if (sourceFiles.length === 0) return null;

  const sourceRoot = commonParentPath(sourceFiles.map((file) => file.path));
  const targetRoot =
    commonParentPath((target.saveFiles ?? []).map((file) => file.path)) ??
    (target.installPath ? `${target.installPath}\\<reviewed-save-folder>` : null);
  if (!sourceRoot || !targetRoot) return null;

  const mappedActions = audit.plannedFileActions.map((action) => {
    const sourceRelativePath =
      relativePathFromRoot(action.sourcePath, sourceRoot) ?? basename(action.sourcePath);
    const fallbackTargetRelativePath =
      relativePathFromRoot(action.targetPathHint, targetRoot) ?? sourceRelativePath;
    const targetRelativePathResolution = resolveProviderTargetRelativePath(
      getGameSource(source),
      getGameSource(target),
      sourceRelativePath,
      fallbackTargetRelativePath,
    );
    const targetRelativePath = targetRelativePathResolution.targetRelativePath;
    const targetPath = joinStorePath(targetRoot, targetRelativePath);

    return {
      conflictId: action.conflictId,
      id: `${audit.id}-${sourceRelativePath}`,
      label: action.label,
      mappingRuleId: targetRelativePathResolution.ruleId,
      sourceRelativePath,
      status: action.conflictId ? "conflict_review" : "mapped",
      targetPath,
      targetRelativePath,
    } satisfies CrossStoreSavePathMappingAction;
  });
  const targetCollisionProof = buildTargetRelativePathCollisionProof(mappedActions);

  return {
    actionCount: mappedActions.length,
    guard:
      "Path mapping is local review evidence only; native apply still requires explicit desktop consent.",
    id: `path-map-${audit.sourceVariantId}-to-${audit.targetVariantId}`,
    mappedActions,
    nativeApplyHint:
      "Use sourceRelativePath and targetRelativePath as reviewed file actions for the native copy command.",
    sourceProvider: audit.sourceLabel,
    sourceRoot,
    status: "review-ready",
    targetCollisionProof,
    targetProvider: audit.targetLabel,
    targetRoot,
  };
}

function buildAutomaticPathMapApplyProof(
  audit: CrossStoreSaveSyncAudit,
  pathMappingProof: CrossStoreSavePathMappingProof,
  nativeApplyProof: CrossStoreSaveNativeApplyProof,
): CrossStoreSaveAutomaticPathMapApplyProof {
  const actions = pathMappingProof.mappedActions.map((action, index) => {
    const plannedAction = audit.plannedFileActions[index];
    const expectedSizeBytes =
      plannedAction && plannedAction.sizeBytes > 0 ? plannedAction.sizeBytes : null;

    return {
      conflictId: action.conflictId,
      expectedSizeBytes,
      id: action.id,
      mappingRuleId: action.mappingRuleId,
      mode: action.conflictId ? "overwrite_review" : "copy",
      sourcePath: plannedAction?.sourcePath ?? action.sourceRelativePath,
      sourceRelativePath: action.sourceRelativePath,
      targetPath: action.targetPath,
      targetRelativePath: action.targetRelativePath,
    } satisfies CrossStoreSaveAutomaticPathMapApplyAction;
  });
  const nativeRequestTemplate: CrossStoreSaveApplyRequest = {
    actions: actions.map((action) => ({
      expectedSha256: null,
      expectedSizeBytes: action.expectedSizeBytes,
      id: action.id,
      sourceRelativePath: action.sourceRelativePath,
      targetRelativePath: action.targetRelativePath,
    })),
    consent: {
      accepted: false,
      actionCount: actions.length,
      operation: nativeApplyProof.consentOperation,
      sourceRoot: pathMappingProof.sourceRoot,
      targetRoot: pathMappingProof.targetRoot,
    },
    gameId: `${audit.sourceVariantId}->${audit.targetVariantId}`,
    sourceLabel: audit.sourceLabel,
    sourceRoot: pathMappingProof.sourceRoot,
    targetLabel: audit.targetLabel,
    targetRoot: pathMappingProof.targetRoot,
  };

  return {
    actionCount: actions.length,
    actions,
    blockedAfterProof: [
      "Desktop user consent is still required before any native copy.",
      "Overwrite actions require explicit conflict review before consent.",
      "Provider cloud transfer is still not called.",
      "Live Supabase/keychain bucket E2E and real migration sessions remain open.",
    ],
    consentOperation: nativeApplyProof.consentOperation,
    guard:
      "Automatic path-map apply only builds a reviewed native request template; accepted stays false until the desktop user confirms.",
    id: `auto-path-map-apply-${audit.sourceVariantId}-to-${audit.targetVariantId}`,
    nativeRequestTemplate,
    noBrowserMutation: true,
    sourceLabel: audit.sourceLabel,
    status: "consent-required",
    summary: `${actions.length} provider-mapped action${actions.length === 1 ? "" : "s"} can be staged as a native copy request template from ${audit.sourceLabel} to ${audit.targetLabel}.`,
    targetLabel: audit.targetLabel,
    writeBoundary:
      "Browser and verify routes never mutate save files; desktop apply requires accepted consent, matching roots, and action count.",
  };
}

function buildTargetRelativePathCollisionProof(
  actions: CrossStoreSavePathMappingAction[],
): CrossStoreSaveTargetRelativePathCollisionProof {
  const groupedActions = new Map<string, CrossStoreSavePathMappingAction[]>();
  for (const action of actions) {
    const key = targetRelativePathKey(action.targetRelativePath);
    groupedActions.set(key, [...(groupedActions.get(key) ?? []), action]);
  }

  const collisions = Array.from(groupedActions.values())
    .filter((grouped) => grouped.length > 1)
    .map((grouped) => ({
      actionIds: grouped.map((action) => action.id),
      labels: grouped.map((action) => action.label),
      sourceRelativePaths: grouped.map((action) => action.sourceRelativePath),
      targetRelativePath: grouped[0]?.targetRelativePath ?? "",
    })) satisfies CrossStoreSaveTargetRelativePathCollision[];
  const hasCollisions = collisions.length > 0;
  const collisionTargets = collisions.map((collision) => collision.targetRelativePath).join(", ");

  return {
    blocker: hasCollisions
      ? `Duplicate targetRelativePath mapping blocked: ${collisionTargets}.`
      : null,
    collisionCount: collisions.length,
    collisions,
    guard: hasCollisions
      ? "Duplicate targetRelativePath mappings are blocked locally; native apply remains disabled until every reviewed source action maps to a unique relative target path."
      : "Every reviewed source action maps to a unique targetRelativePath in the local planner contract.",
    noSecretsRequired: true,
    status: hasCollisions ? "blocked" : "unique",
    warning: hasCollisions
      ? "Resolve duplicate targetRelativePath values before any desktop consent or native copy."
      : null,
  };
}

function buildProviderCatalogProof(
  games: Game[],
  title: string,
): CrossStoreSaveProviderCatalogProof | null {
  const entries = uniqueGames(games).map((game) => {
    const provider = sourceLabelForGame(game);
    const externalId = normalizeExternalId(game.externalId);
    const saveFileCount = game.saveFiles?.length ?? 0;
    const hasLocalEvidence = Boolean(game.installPath) || saveFileCount > 0;
    const catalogKey = providerCatalogKey(getGameSource(game), externalId, game.id);
    const checks = [
      `${provider} source metadata is present.`,
      externalId
        ? `External catalog id is staged as ${externalId}.`
        : "External catalog id is missing and requires manual review.",
      game.installPath
        ? "Install path evidence is available for local review."
        : "Install path is missing and requires manual review.",
      saveFileCount > 0
        ? `${saveFileCount} tracked save file${saveFileCount === 1 ? "" : "s"} link this variant to local save evidence.`
        : "No tracked save file evidence is available for this variant.",
    ];

    return {
      catalogKey,
      checks,
      externalId,
      id: `catalog-${game.id}`,
      provider,
      saveFileCount,
      status: externalId && hasLocalEvidence ? "covered" : "manual_review",
      variantId: game.id,
    } satisfies CrossStoreSaveProviderCatalogEntry;
  });
  if (entries.length === 0) return null;

  const pairings = entries.flatMap((source) =>
    entries
      .filter((target) => target.variantId !== source.variantId)
      .map((target) => ({
        id: `${source.variantId}->${target.variantId}`,
        label: `${source.provider} -> ${target.provider}`,
        sourceCatalogKey: source.catalogKey,
        status: "local_pair",
        targetCatalogKey: target.catalogKey,
      })),
  ) satisfies CrossStoreSaveProviderCatalogPairing[];
  const coveredVariantCount = entries.filter((entry) => entry.status === "covered").length;

  return {
    blockedAfterProof: [
      "Provider-approved catalog API validation is not run.",
      "Provider cloud save import/export contracts are not called.",
      "Real user-data migration session evidence is still required.",
    ],
    coveredVariantCount,
    entries,
    guard:
      "Provider catalog coverage is local metadata review only; external IDs are not provider-approved by this panel.",
    id: `provider-catalog-${slugForLocalId(title)}`,
    manualReviewCount: entries.length - coveredVariantCount,
    pairings,
    status: "review-ready",
    title,
  };
}

function buildProviderPathIdMappingProof(
  games: Game[],
  title: string,
): CrossStoreSaveProviderPathIdMappingProof | null {
  const entries = uniqueGames(games).map((game) => {
    const provider = sourceLabelForGame(game);
    const externalId = normalizeExternalId(game.externalId);
    const saveFiles = game.saveFiles ?? [];
    const fixture = getProviderSaveMappingFixture(getGameSource(game));
    const saveRoot = commonParentPath(saveFiles.map((file) => file.path));
    const installPath = game.installPath ?? null;
    const saveFileCount = saveFiles.length;
    const catalogKey = providerCatalogKey(getGameSource(game), externalId, game.id);
    const blockers = [
      externalId ? null : "External catalog id is missing.",
      installPath ? null : "Install path is missing.",
      saveRoot ? null : "Save root cannot be derived from tracked save files.",
      saveFileCount > 0 ? null : "No tracked save files are available.",
    ].filter((item): item is string => Boolean(item));
    const checks = [
      `${provider} catalog key is staged as ${catalogKey}.`,
      externalId
        ? `External catalog id ${externalId} is available for local review.`
        : "External catalog id needs manual review before provider validation.",
      installPath
        ? "Install path is available for local review."
        : "Install path must be collected before provider validation.",
      saveRoot
        ? `Save root is staged as ${saveRoot} using ${fixture.saveRoot.shape} fixture review.`
        : "Save root must be derived from tracked provider save files.",
      `${fixture.mappingRules.length} provider relative path rule${
        fixture.mappingRules.length === 1 ? "" : "s"
      } staged for local review.`,
      `${saveFileCount} tracked save file${saveFileCount === 1 ? "" : "s"} ${
        saveFileCount === 1 ? "is" : "are"
      } tied to this fixture.`,
      "No provider API validates this path/id fixture.",
    ];

    return {
      blockers,
      catalogKey,
      checks,
      externalId,
      id: `path-id-${game.id}`,
      installPath,
      provider,
      relativePathRuleCount: fixture.mappingRules.length,
      saveFileCount,
      saveRoot,
      saveRootShape: fixture.saveRoot.shape,
      status: blockers.length === 0 ? "mapped" : "manual_review",
      variantId: game.id,
    } satisfies CrossStoreSaveProviderPathIdMappingEntry;
  });
  if (entries.length === 0) return null;

  const mappedVariantCount = entries.filter((entry) => entry.status === "mapped").length;

  return {
    blockedAfterProof: [
      "Provider-approved catalog ID validation is not run.",
      "Provider save-root discovery APIs are not called.",
      "Provider cloud save import/export contracts are still required.",
      "Real user-data migration session evidence is still required.",
    ],
    entries,
    guard:
      "Provider path/id mapping fixtures are local metadata review only; no provider API validates IDs, install paths, or save roots.",
    id: `provider-path-id-mapping-${slugForLocalId(title)}`,
    manualReviewCount: entries.length - mappedVariantCount,
    mappedVariantCount,
    status: "review-ready",
    title,
  };
}

function buildProviderCloudContractProof(
  games: Game[],
  title: string,
): CrossStoreSaveProviderCloudContractProof | null {
  const entries = uniqueGames(games).map((game) => {
    const provider = sourceLabelForGame(game);
    const externalId = normalizeExternalId(game.externalId);
    const catalogKey = providerCatalogKey(getGameSource(game), externalId, game.id);
    const contract = providerCloudContractForSource(getGameSource(game), provider);

    return {
      accountScope: contract.accountScope,
      blockers: [
        "Provider OAuth/device auth scope is not requested.",
        "Provider cloud save file listing API is not called.",
        "Provider import/export write contract is not approved for this launcher.",
      ],
      catalogKey,
      exportContract: contract.exportContract,
      id: `cloud-contract-${game.id}`,
      importContract: contract.importContract,
      provider,
      status: "provider_contract_required",
      variantId: game.id,
    } satisfies CrossStoreSaveProviderCloudContractEntry;
  });
  if (entries.length === 0) return null;

  return {
    blockedAfterProof: [
      "Provider-approved OAuth/device auth is not implemented.",
      "Provider cloud save listing/export/import APIs are not called.",
      "Live provider sandbox evidence is still required.",
      "Real migration sessions remain blocked until provider transfer and Supabase/keychain E2E pass.",
    ],
    entries,
    guard:
      "Provider cloud contract packet is local review only; no provider cloud save listing, export, import, upload, or download API is called.",
    id: `provider-cloud-contract-${slugForLocalId(title)}`,
    requiredContractCount: entries.length * 2,
    status: "blocked-contract",
    title,
  };
}

function buildPostCopyVerificationProof(
  audit: CrossStoreSaveSyncAudit,
  pathMappingProof: CrossStoreSavePathMappingProof,
  nativeApplyProof: CrossStoreSaveNativeApplyProof,
): CrossStoreSavePostCopyVerificationProof {
  const items = pathMappingProof.mappedActions.map((action) => {
    const checks = [
      "Apply manifest entry exists for reviewed relative target path.",
      "Target file exists after native apply.",
      "Post-copy target size and SHA-256 match the reviewed source file.",
      "Rollback unchanged-target hash guard remains checkable from the apply manifest.",
    ];
    if (action.conflictId) {
      checks.splice(1, 0, "Pre-copy target snapshot exists before overwrite review.");
    }

    return {
      checks,
      conflictId: action.conflictId,
      expectedTargetPath: action.targetPath,
      id: `${audit.id}-post-copy-${action.sourceRelativePath}`,
      label: action.label,
      sourceRelativePath: action.sourceRelativePath,
      status: action.conflictId ? "overwrite_snapshot_review" : "hash_review",
      targetRelativePath: action.targetRelativePath,
    } satisfies CrossStoreSavePostCopyVerificationItem;
  });
  const rollbackGuardCount = items.filter((item) =>
    item.checks.some((check) => check.includes("Rollback unchanged-target hash guard")),
  ).length;

  return {
    actionCount: items.length,
    blockedAfterProof: [
      "Provider cloud transfer is still not verified.",
      "Live Supabase/keychain bucket E2E is still not run.",
      "Provider-approved catalog API validation and real user-data migration sessions remain open.",
    ],
    conflictCount: audit.conflictCount,
    expectedManifestFile: nativeApplyProof.manifestFile,
    guard:
      "Post-copy verification is a local review packet only; the planner still does not copy or mutate save files.",
    id: `post-copy-${audit.sourceVariantId}-to-${audit.targetVariantId}`,
    items,
    rollbackGuardCount,
    status: "review-ready",
    summary:
      audit.conflictCount > 0
        ? `${items.length} reviewed target file${items.length === 1 ? "" : "s"} with ${
            audit.conflictCount
          } overwrite snapshot check${audit.conflictCount === 1 ? "" : "s"} before any consented apply.`
        : `${items.length} reviewed target file${items.length === 1 ? "" : "s"} require size/SHA-256 checks after any consented apply.`,
  };
}

function buildSupabaseKeychainStagingProof(
  audit: CrossStoreSaveSyncAudit,
  pathMappingProof: CrossStoreSavePathMappingProof,
  postCopyVerificationProof: CrossStoreSavePostCopyVerificationProof,
  title: string,
): CrossStoreSaveSupabaseKeychainStagingProof {
  const encryptedObjectCount = postCopyVerificationProof.actionCount;
  const objectPrefix = `auth.uid()/cross-store-save-staging/${slugForLocalId(title)}/<redacted-proof>/`;
  const steps: CrossStoreSaveSupabaseKeychainStagingStep[] = [
    {
      evidence: `Use game-saves/${objectPrefix} so RLS can require the authenticated owner as the first object-path segment.`,
      id: "owner-scoped-prefix",
      label: "Owner-Scoped Prefix",
      status: "staging_contract",
    },
    {
      evidence:
        "Call get_or_create_user_keyring_key inside the desktop command and never return raw key material, access tokens, plaintext, or ciphertext.",
      id: "keychain-redaction",
      label: "Keychain Redaction",
      status: "staging_contract",
    },
    {
      evidence: `${encryptedObjectCount} encrypted .enc object contract${encryptedObjectCount === 1 ? "" : "s"} plus ${encryptedObjectCount} .meta.json sidecar contract${encryptedObjectCount === 1 ? "" : "s"} for reviewed target paths.`,
      id: "encrypted-sidecars",
      label: "Encrypted Sidecars",
      status: "staging_contract",
    },
    {
      evidence: `${pathMappingProof.actionCount} reviewed path-map action${pathMappingProof.actionCount === 1 ? "" : "s"} require upload, list, download, decrypt, and SHA-256/size comparison before any real migration claim.`,
      id: "download-decrypt-hash",
      label: "Download/Decrypt Hash",
      status: "staging_contract",
    },
    {
      evidence:
        "Delete the staging .enc and .meta.json objects after verification and return only cleanup counts/status.",
      id: "cleanup",
      label: "Cleanup Contract",
      status: "staging_contract",
    },
    {
      evidence: "Provider cloud save listing/export/import APIs are still skipped by this proof.",
      id: "provider-transfer-skipped",
      label: "Provider Transfer Skipped",
      status: "live_blocked",
    },
    {
      evidence:
        "The planner fixture does not authenticate to a live bucket or run keychain restore; it only documents the command contract.",
      id: "live-run-blocked",
      label: "Live Run Blocked",
      status: "live_blocked",
    },
  ];

  return {
    blockedAfterProof: [
      "Live Supabase bucket E2E must run through the desktop command with a real authenticated user.",
      "Keychain restore evidence must be collected without exporting raw key material.",
      "Provider-approved cloud import/export execution is still blocked.",
      "Real user-data migration sessions are still not executed.",
    ],
    bucketName: "game-saves",
    cleanupEvidence:
      "Staging cleanup must delete encrypted objects and metadata sidecars, then report redacted counts only.",
    consentOperation: "cross_store_save_supabase_keychain_staging_proof",
    encryptedObjectCount,
    guard:
      "Supabase/keychain staging proof is a command contract and redaction review only; this planner does not upload, download, decrypt, restore, or delete live bucket objects.",
    hashVerificationCount: postCopyVerificationProof.rollbackGuardCount,
    id: `supabase-keychain-staging-${audit.sourceVariantId}-to-${audit.targetVariantId}`,
    keychainOperation: "get_or_create_user_keyring_key",
    metadataSidecarCount: encryptedObjectCount,
    noKeyExport: true,
    objectPrefix,
    providerTransferSkipped: true,
    sourceLabel: audit.sourceLabel,
    status: "staging-contract",
    steps,
    summary: `${audit.sourceLabel} -> ${audit.targetLabel} has a redacted Supabase/keychain staging contract for ${encryptedObjectCount} encrypted object${encryptedObjectCount === 1 ? "" : "s"} and ${encryptedObjectCount} metadata sidecar${encryptedObjectCount === 1 ? "" : "s"} before live bucket E2E.`,
    targetLabel: audit.targetLabel,
    title,
  };
}

function buildMigrationSessionRehearsalProof(
  audit: CrossStoreSaveSyncAudit,
  providerCatalogProof: CrossStoreSaveProviderCatalogProof,
  providerPathIdMappingProof: CrossStoreSaveProviderPathIdMappingProof,
  providerCloudContractProof: CrossStoreSaveProviderCloudContractProof,
  pathMappingProof: CrossStoreSavePathMappingProof,
  nativeApplyProof: CrossStoreSaveNativeApplyProof,
  postCopyVerificationProof: CrossStoreSavePostCopyVerificationProof,
  supabaseKeychainStagingProof: CrossStoreSaveSupabaseKeychainStagingProof,
  title: string,
): CrossStoreSaveMigrationSessionRehearsalProof {
  const steps: CrossStoreSaveMigrationSessionRehearsalStep[] = [
    {
      action: "Review local source/target lane before any write.",
      evidence: `${audit.sourceLabel} -> ${audit.targetLabel} dry-run audit ${audit.id}`,
      id: "local-lane",
      label: "Source/Target Lane",
      status: "local_evidence",
    },
    {
      action: "Confirm catalog IDs are only local review metadata.",
      evidence: `${providerCatalogProof.coveredVariantCount}/${providerCatalogProof.entries.length} local catalog variants covered`,
      id: "catalog-coverage",
      label: "Catalog Coverage",
      status: "local_evidence",
    },
    {
      action:
        "Review provider IDs, install paths, save roots, and tracked save counts before provider validation.",
      evidence: `${providerPathIdMappingProof.mappedVariantCount}/${providerPathIdMappingProof.entries.length} provider path/id fixture${providerPathIdMappingProof.entries.length === 1 ? "" : "s"} mapped`,
      id: "provider-path-id-fixtures",
      label: "Provider Path/ID Fixtures",
      status: "local_evidence",
    },
    {
      action: "Keep provider cloud contracts as requirements until provider approval exists.",
      evidence: `${providerCloudContractProof.requiredContractCount} provider import/export contracts required`,
      id: "provider-cloud-contract",
      label: "Provider Cloud Contract",
      status: "local_evidence",
    },
    {
      action: "Use reviewed relative source/target paths for the native copy command.",
      evidence: `${pathMappingProof.actionCount} mapped save action${pathMappingProof.actionCount === 1 ? "" : "s"}`,
      id: "path-map",
      label: "Path Map Review",
      status: "local_evidence",
    },
    {
      action: "Require explicit desktop consent before any native copy.",
      evidence: `${nativeApplyProof.consentOperation} with ${nativeApplyProof.actionCount} action${nativeApplyProof.actionCount === 1 ? "" : "s"}`,
      id: "native-apply-consent",
      label: "Native Apply Consent",
      status: "local_evidence",
    },
    {
      action:
        "Check target hashes, conflict snapshots, and rollback guards after any consented apply.",
      evidence: `${postCopyVerificationProof.actionCount} post-copy check${postCopyVerificationProof.actionCount === 1 ? "" : "s"} and ${postCopyVerificationProof.rollbackGuardCount} rollback guard${postCopyVerificationProof.rollbackGuardCount === 1 ? "" : "s"}`,
      id: "post-copy-verification",
      label: "Post-Copy Verification",
      status: "local_evidence",
    },
    {
      action:
        "Stage the reviewed path-map output as an accepted=false native request template for desktop consent.",
      evidence: `${pathMappingProof.actionCount} mapped action${pathMappingProof.actionCount === 1 ? "" : "s"} feed ${nativeApplyProof.consentOperation}`,
      id: "automatic-path-map-apply-template",
      label: "Automatic Path-Map Apply",
      status: "local_evidence",
    },
    {
      action:
        "Review the redacted Supabase/keychain staging contract before any live bucket proof.",
      evidence: `${supabaseKeychainStagingProof.objectPrefix} with ${supabaseKeychainStagingProof.encryptedObjectCount} encrypted object contract${supabaseKeychainStagingProof.encryptedObjectCount === 1 ? "" : "s"}`,
      id: "supabase-keychain-staging-contract",
      label: "Supabase/Keychain Staging",
      status: "local_evidence",
    },
    {
      action: "Block provider cloud import/export until an approved provider sandbox exists.",
      evidence: "No provider cloud save listing/export/import API is called.",
      id: "provider-transfer-execution",
      label: "Provider Transfer Execution",
      status: "external_blocked",
    },
    {
      action:
        "Block live migration until the bucket upload/restore and keychain restore command has run.",
      evidence:
        "A redacted staging contract exists, but no live Supabase bucket write or keychain restore has run in this fixture.",
      id: "live-supabase-keychain",
      label: "Live Supabase/Keychain",
      status: "external_blocked",
    },
    {
      action: "Block real user migration evidence until a user-approved staging session runs.",
      evidence: "No real user-data migration session is executed by this rehearsal packet.",
      id: "real-user-session",
      label: "Real User Session",
      status: "external_blocked",
    },
  ];
  const localEvidenceCount = steps.filter((step) => step.status === "local_evidence").length;
  const blockedStepCount = steps.length - localEvidenceCount;

  return {
    blockedAfterProof: [
      "Provider-approved cloud import/export execution is still not run.",
      "Provider-approved catalog API validation is still not run.",
      "Live Supabase/keychain bucket E2E is still not run.",
      "Real user-data migration sessions are still not executed.",
    ],
    blockedStepCount,
    guard:
      "Migration session rehearsal is local review evidence only; it does not start, execute, complete, or verify a real save migration.",
    id: `migration-session-rehearsal-${audit.sourceVariantId}-to-${audit.targetVariantId}`,
    localEvidenceCount,
    sourceLabel: audit.sourceLabel,
    status: "rehearsal-only",
    steps,
    summary: `${audit.sourceLabel} -> ${audit.targetLabel} has ${localEvidenceCount} local rehearsal evidence step${localEvidenceCount === 1 ? "" : "s"} and ${blockedStepCount} external blocker${blockedStepCount === 1 ? "" : "s"} before any real migration session.`,
    targetLabel: audit.targetLabel,
    title,
  };
}

function buildAuditForFirstReviewLane(
  lanes: CrossStoreSaveSyncLane[],
  games: Game[],
): CrossStoreSaveSyncAudit | null {
  const lane =
    lanes.find((candidate) => candidate.status === "ready") ??
    lanes.find((candidate) => candidate.status === "warning") ??
    null;
  if (!lane) return null;

  const source = games.find((game) => game.id === lane.sourceVariantId);
  const target = games.find((game) => game.id === lane.targetVariantId);
  const sourceFiles = source?.saveFiles ?? [];
  if (!source || !target || sourceFiles.length === 0) return null;

  const targetFiles = target.saveFiles ?? [];
  const plannedFileActions = sourceFiles.map((file) => {
    const conflict = findMatchingSaveFile(file, targetFiles);
    const conflictId = conflict ? `conflict-${file.id}-${conflict.id}` : null;

    return {
      action: conflict ? "review_overwrite" : "review_copy",
      conflictId,
      label: file.label ?? file.id,
      modifiedAt: file.modifiedAt ?? null,
      reason: conflict
        ? "Target variant already has a save with the same file name; user choice is required."
        : "Source save has no matching target file in the local fixture; review copy intent only.",
      sizeBytes: file.sizeBytes ?? 0,
      sourcePath: file.path,
      targetPathHint: conflict?.path ?? targetPathHintForFile(target, file),
    } satisfies CrossStoreSaveSyncAuditFileAction;
  });
  const conflictIds = plannedFileActions
    .map((action) => action.conflictId)
    .filter((conflictId): conflictId is string => Boolean(conflictId));
  const fileCount = plannedFileActions.length;
  const totalSizeBytes = plannedFileActions.reduce((total, action) => total + action.sizeBytes, 0);
  const sourceLabel = lane.sourceLabel;
  const targetLabel = lane.targetLabel;

  return {
    conflictCount: conflictIds.length,
    conflictIds,
    fileActionCount: fileCount,
    generatedAt: "local-dry-run",
    guard:
      "Audit packet only; no files copied, overwritten, deleted, uploaded, downloaded, or restored.",
    id: `audit-${source.id}-to-${target.id}`,
    noCopyPerformed: true,
    plannedFileActions,
    rollbackPreview: {
      executable: false,
      fileCount,
      manifestId: `rollback-preview-${source.id}-to-${target.id}`,
      restoreStrategy:
        "Preview records source and target hints for future snapshots, but no rollback snapshot is created or restored.",
      snapshotLabel: `${sourceLabel} -> ${targetLabel} rollback preview`,
      totalSizeBytes,
    },
    skippedActions: [
      {
        id: "native-copy",
        label: "Native copy",
        reason: "Dry-run audit does not write files.",
      },
      {
        id: "path-map-apply",
        label: "Path map apply",
        reason:
          "Provider-specific destination paths are staged as an accepted=false native request template; no files are copied until desktop consent.",
      },
      {
        id: "provider-cloud-transfer",
        label: "Provider cloud transfer",
        reason: "No provider API or cloud save transfer is called.",
      },
      {
        id: "rollback-execution",
        label: "Rollback execution",
        reason: "Rollback manifest is a preview only.",
      },
      {
        id: "supabase-keychain-e2e",
        label: "Supabase/keychain E2E",
        reason: "No live bucket, encryption key, or keychain restore flow is used.",
      },
    ],
    sourceLabel,
    sourceVariantId: source.id,
    targetLabel,
    targetVariantId: target.id,
  };
}

export function createVerifyCrossStoreSaveSyncCandidates(): Game[] {
  return [
    {
      id: "steam-mech-arcade",
      title: "Mech Arcade",
      description: "Verification fixture for local cross-store save planning.",
      version: "1.4.0",
      launcher: "steam",
      externalId: "110011",
      status: "installed",
      platform: "windows",
      installPath: "C:\\Games\\Steam\\steamapps\\common\\Mech Arcade",
      saveFiles: [
        {
          id: "steam-slot-1",
          label: "Profile Slot",
          modifiedAt: "2026-06-11T09:30:00.000Z",
          path: "C:\\Users\\Player\\Saved Games\\Mech Arcade\\profile.sav",
          sizeBytes: 1_248_000,
          syncedAt: "2026-06-10T21:00:00.000Z",
        },
        {
          id: "steam-settings",
          label: "Settings",
          modifiedAt: "2026-06-11T09:31:00.000Z",
          path: "C:\\Users\\Player\\Saved Games\\Mech Arcade\\settings.json",
          sizeBytes: 32_100,
        },
      ],
    },
    {
      id: "gog-mech-arcade",
      title: "Mech Arcade",
      description: "Verification fixture target with an installed GOG build.",
      version: "1.4.0",
      launcher: "gog",
      externalId: "mech-arcade",
      status: "installed",
      platform: "windows",
      installPath: "C:\\Games\\GOG Galaxy\\Games\\Mech Arcade",
      saveFiles: [
        {
          id: "gog-slot-1",
          label: "GOG Slot",
          modifiedAt: "2026-06-10T20:45:00.000Z",
          path: "C:\\Users\\Player\\Documents\\GOG Galaxy\\Mech Arcade\\profile.sav",
          sizeBytes: 1_190_000,
        },
      ],
    },
    {
      id: "epic-mech-arcade",
      title: "Mech Arcade",
      description: "Verification fixture target that still needs installation.",
      version: "1.4.0",
      launcher: "epic",
      externalId: "mech-arcade-epic",
      status: "not_installed",
      platform: "windows",
      downloadUrl: "https://cdn.og-launcher.test/mech-arcade",
    },
  ];
}

function buildLane(source: Game, target: Game): CrossStoreSaveSyncLane {
  const saveFiles = source.saveFiles ?? [];
  const blockers: string[] = [];
  const warnings: string[] = [
    "Local planner only; no save files are copied by this panel.",
    "Provider-specific save layout still needs manual review.",
  ];

  if (saveFiles.length === 0) {
    blockers.push("Source variant has no tracked save files.");
  }
  if (target.status === "not_installed") {
    warnings.push("Target variant is not installed yet.");
  }
  if (!source.installPath) {
    warnings.push("Source install path is missing; confirm the save root manually.");
  }
  if (!target.installPath) {
    warnings.push("Target install path is missing; confirm the destination manually.");
  }

  const status: CrossStoreSaveSyncStatus =
    blockers.length > 0 ? "blocked" : target.status === "installed" ? "ready" : "warning";
  const sourceLabel = sourceLabelForGame(source);
  const targetLabel = sourceLabelForGame(target);
  const totalSaveSizeBytes = totalBytes(saveFiles);

  return {
    id: `${source.id}->${target.id}`,
    sourceVariantId: source.id,
    targetVariantId: target.id,
    sourceLabel,
    targetLabel,
    status,
    saveFileCount: saveFiles.length,
    totalSaveSizeBytes,
    sourcePathPreview: saveFiles[0]?.path ?? null,
    targetPathHint:
      target.installPath ??
      `Install or locate the ${targetLabel} build, then choose its save directory manually.`,
    summary:
      status === "ready"
        ? `${sourceLabel} -> ${targetLabel} is a local review candidate only; no files will be copied.`
        : status === "warning"
          ? `${sourceLabel} -> ${targetLabel} needs installation or path review.`
          : `${sourceLabel} -> ${targetLabel} is missing source save evidence.`,
    blockers,
    warnings,
  };
}

function uniqueGames(games: Game[]): Game[] {
  const seen = new Set<string>();
  const unique: Game[] = [];
  for (const game of games) {
    if (seen.has(game.id)) continue;
    seen.add(game.id);
    unique.push(game);
  }
  return unique;
}

function toVariant(game: Game): CrossStoreSaveSyncVariant {
  const saveFiles = game.saveFiles ?? [];

  return {
    id: game.id,
    title: game.title,
    source: getGameSource(game),
    sourceLabel: sourceLabelForGame(game),
    status: game.status,
    installPath: game.installPath ?? null,
    saveFileCount: saveFiles.length,
    latestSaveModifiedAt: latestModifiedAt(saveFiles),
    totalSaveSizeBytes: totalBytes(saveFiles),
  };
}

function sourceLabelForGame(game: Game): string {
  const source = getGameSource(game);
  return SOURCE_LABELS[source] ?? source.toUpperCase();
}

function providerCloudContractForSource(
  source: string,
  provider: string,
): Pick<
  CrossStoreSaveProviderCloudContractEntry,
  "accountScope" | "exportContract" | "importContract"
> {
  if (source === "steam") {
    return {
      accountScope: "Steam user auth, app ownership, and Remote Storage/Cloud entitlement.",
      exportContract:
        "Future contract must list and download reviewed Steam Cloud files by app ID.",
      importContract:
        "Future contract must upload reviewed files through a provider-approved Steam Cloud path.",
    };
  }
  if (source === "gog") {
    return {
      accountScope: "GOG Galaxy account auth, game ownership, and cloud-save capability.",
      exportContract:
        "Future contract must list and download reviewed GOG Galaxy cloud save files.",
      importContract:
        "Future contract must upload reviewed files through a provider-approved Galaxy save slot.",
    };
  }
  if (source === "epic") {
    return {
      accountScope: "Epic/EOS user auth, product namespace, and deployment entitlement.",
      exportContract:
        "Future contract must list and download reviewed Epic cloud saves from an approved sandbox.",
      importContract:
        "Future contract must upload reviewed files through approved Epic/EOS cloud save storage.",
    };
  }

  return {
    accountScope: `${provider} account auth, game ownership, and cloud-save capability.`,
    exportContract: `Future contract must list and download reviewed ${provider} cloud save files.`,
    importContract: `Future contract must upload reviewed files through an approved ${provider} cloud save path.`,
  };
}

function findMatchingSaveFile(file: SaveFile, candidates: SaveFile[]): SaveFile | null {
  const fileName = basename(file.path).toLowerCase();
  return (
    candidates.find((candidate) => basename(candidate.path).toLowerCase() === fileName) ?? null
  );
}

function targetPathHintForFile(target: Game, file: SaveFile): string {
  const fileName = basename(file.path);
  return target.installPath
    ? `${target.installPath}\\<reviewed-save-folder>\\${fileName}`
    : `Install or locate ${sourceLabelForGame(target)}, then review destination for ${fileName}.`;
}

function commonParentPath(paths: string[]): string | null {
  const usablePaths = paths.filter((path) => path.trim().length > 0);
  if (usablePaths.length === 0) return null;

  const parentSegments = usablePaths
    .map(parentStorePath)
    .map(splitStorePath)
    .filter((segments) => segments.length > 0);
  if (parentSegments.length === 0) return null;

  const [first, ...rest] = parentSegments;
  const common: string[] = [];
  for (const [index, segment] of first.entries()) {
    if (rest.every((candidate) => candidate[index]?.toLowerCase() === segment.toLowerCase())) {
      common.push(segment);
      continue;
    }
    break;
  }

  if (common.length === 0) return null;
  return common.join(pathSeparatorFor(usablePaths[0]));
}

function relativePathFromRoot(path: string, root: string): string | null {
  const pathSegments = splitStorePath(path);
  const rootSegments = splitStorePath(root);
  if (rootSegments.length === 0 || pathSegments.length <= rootSegments.length) return null;

  const isUnderRoot = rootSegments.every(
    (segment, index) => pathSegments[index]?.toLowerCase() === segment.toLowerCase(),
  );
  if (!isUnderRoot) return null;

  return pathSegments.slice(rootSegments.length).join("/");
}

function joinStorePath(root: string, relative: string): string {
  const separator = pathSeparatorFor(root);
  const normalizedRoot = root.trim().replace(/[\\/]+$/, "");
  const normalizedRelative = splitStorePath(relative).join(separator);
  if (normalizedRelative.length === 0) return normalizedRoot;
  return `${normalizedRoot}${separator}${normalizedRelative}`;
}

function targetRelativePathKey(path: string): string {
  return splitStorePath(path).join("/").toLowerCase();
}

function normalizeExternalId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function slugForLocalId(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "selected-game";
}

function parentStorePath(path: string): string {
  const segments = splitStorePath(path);
  return segments.slice(0, -1).join(pathSeparatorFor(path));
}

function splitStorePath(path: string): string[] {
  return path
    .trim()
    .replace(/[\\/]+/g, "/")
    .replace(/\/$/, "")
    .split("/")
    .filter(Boolean);
}

function pathSeparatorFor(path: string): "\\" | "/" {
  return path.includes("\\") || /^[A-Za-z]:/.test(path) ? "\\" : "/";
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function latestModifiedAt(saveFiles: SaveFile[]): string | null {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const file of saveFiles) {
    if (!file.modifiedAt) continue;
    const parsed = Date.parse(file.modifiedAt);
    if (!Number.isNaN(parsed) && parsed > latestMs) {
      latest = file.modifiedAt;
      latestMs = parsed;
    }
  }
  return latest;
}

function totalBytes(saveFiles: SaveFile[]): number {
  return saveFiles.reduce(
    (total, file) => total + (typeof file.sizeBytes === "number" ? file.sizeBytes : 0),
    0,
  );
}
