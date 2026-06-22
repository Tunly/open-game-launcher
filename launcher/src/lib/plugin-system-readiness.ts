export type PluginSystemReadinessStatus = "blocked" | "ready" | "warning";

export interface PluginSystemReadinessInput {
  activationPlanReview?: PluginActivationPlanReviewEvidence | null;
  disabledRegistryAudit?: PluginDisabledRegistryAuditEvidence | null;
  hostedMarketplaceConfigured: boolean;
  localDiscoveryConfigured: boolean;
  manifests?: PluginManifestEvidence[];
  manifestCount: number;
  marketplaceTrust?: PluginMarketplaceTrustEvidence | null;
  permissionReviewConfigured: boolean;
  runtimeSandboxProof?: PluginRuntimeSandboxProofEvidence | null;
  sandboxPrototypeAvailable: boolean;
  signedManifestCount: number;
  stagedSignedPackages?: PluginSignedPackageStageEvidence[];
  updateChannelConfigured: boolean;
  updateSigningReview?: PluginUpdateSigningReviewEvidence | null;
}

export interface PluginSystemReadinessCheck {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: PluginSystemReadinessStatus;
}

export interface PluginSystemReadiness {
  activationPlanReview: PluginActivationPlanReviewEvidence | null;
  blockedCount: number;
  checks: PluginSystemReadinessCheck[];
  guardCopy: string;
  guards: string[];
  disabledRegistryAudit: PluginDisabledRegistryAuditEvidence | null;
  manifestReviews: PluginManifestReview[];
  marketplaceTrust: PluginMarketplaceTrustEvidence | null;
  nextAction: string;
  permissionLedger: PluginPermissionLedgerItem[];
  policyLedger: PluginPolicyLedgerItem[];
  progress: number;
  readyCount: number;
  runtimeSandboxProof: PluginRuntimeSandboxProofEvidence | null;
  signedPackageLedger: PluginSignedPackageStageEvidence[];
  statusLabel: string;
  summary: string;
  updateSigningReview: PluginUpdateSigningReviewEvidence | null;
  warningCount: number;
}

export interface PluginManifestEvidence {
  entrypoint?: string | null;
  id?: string | null;
  name?: string | null;
  permissions?: string[] | null;
  signatureIssuer?: string | null;
  signed?: boolean | null;
  themeHooks?: string[] | null;
  updateChannel?: string | null;
  version?: string | null;
}

export interface PluginManifestImportPayload {
  exportedAt?: string | null;
  manifests: PluginManifestEvidence[];
  schema: typeof PLUGIN_MANIFEST_IMPORT_SCHEMA;
  version: typeof PLUGIN_MANIFEST_IMPORT_VERSION;
}

export interface PluginManifestReview {
  deniedPermissions: string[];
  deniedThemeHooks: string[];
  detail: string;
  entrypoint: string;
  id: string;
  name: string;
  permissions: string[];
  policyItems: string[];
  reviewItems: string[];
  schemaIssues: string[];
  signatureLabel: string;
  status: PluginSystemReadinessStatus;
  statusLabel: string;
  themeHooks: string[];
  updateChannelLabel: string;
  version: string;
}

export interface PluginPermissionLedgerItem {
  count: number;
  detail: string;
  id: string;
  label: string;
  status: PluginSystemReadinessStatus;
}

export interface PluginPolicyLedgerItem {
  detail: string;
  id: string;
  label: string;
  status: PluginSystemReadinessStatus;
}

export interface PluginSignedPackageStageEvidence {
  detail: string;
  entrypoint: string;
  fileCount: number;
  keyId: string;
  pluginId: string;
  registryPath: string;
  signatureIssuer: string;
  status: "disabled";
  version: string;
}

export interface PluginDisabledRegistryAuditEvidence {
  auditedAt: string;
  entries: PluginDisabledRegistryAuditEntry[];
  failedCount: number;
  passedCount: number;
  registryPath: string;
  sourceLabel: string;
}

export interface PluginDisabledRegistryAuditEntry {
  entrypoint: string;
  fileCount: number;
  issues: string[];
  keyId: string;
  pluginId: string;
  registryPath: string;
  signatureIssuer: string;
  status: "blocked" | "disabled-audited" | string;
  version: string;
}

export interface PluginRuntimeSandboxProofEvidence {
  allowedExecutionCount: number;
  auditFailedCount: number;
  auditPassedCount: number;
  codeExecuted: boolean;
  deniedEntrypointCount: number;
  entries: PluginRuntimeSandboxProofEntry[];
  escapeAttempts: PluginRuntimeSandboxEscapeAttempt[];
  ipcAllowlistReady: boolean;
  permissionGrantReady: boolean;
  processBoundaryReady: boolean;
  provedAt: string;
  registryPath: string;
  sourceLabel: string;
}

export interface PluginRuntimeSandboxProofEntry {
  denyReason: string;
  entrypoint: string;
  issues: string[];
  pluginId: string;
  registryPath: string;
  status: "runtime-blocked" | "runtime-allowed" | string;
  version: string;
}

export interface PluginRuntimeSandboxEscapeAttempt {
  blockedBy: string;
  boundary: "path" | "ipc" | "environment" | "filesystem" | "permission" | string;
  id: string;
  label: string;
  payload: string;
  result: "blocked-before-code-load" | "blocked-by-admission" | string;
}

export interface PluginActivationPlanReviewConsent {
  accepted: boolean;
  operation: `review_plugin_activation_plan:${string}@${string}`;
}

export interface PluginActivationPlanReviewRequest {
  pluginId: string;
  version: string;
  consent: PluginActivationPlanReviewConsent;
}

export interface PluginActivationPlanReviewEvidence {
  pluginId: string;
  version: string;
  status: "blocked-production-sandbox" | "blocked-untrusted" | "review-only" | string;
  registryPath: string;
  entrypoint: string;
  manifestHash: string;
  codeExecuted: false;
  downloadAttempted: false;
  installApplied: false;
  autoInstallAllowed: false;
  permissionGrantsPersisted: false;
  processBoundaryReady: boolean;
  networkAllowed: false;
  checks: PluginActivationPlanReviewCheck[];
  reviewedAt: string;
  sourceLabel: string;
}

export interface PluginActivationPlanReviewCheck {
  id: string;
  label: string;
  status: "pass" | "warning" | "blocked" | string;
  detail: string;
}

export interface PluginUpdateSigningReviewEvidence {
  autoInstallBlocked: boolean;
  entries: PluginUpdateSigningReviewEntry[];
  manifestHashReady: boolean;
  reviewedAt: string;
  rollbackPlanReady: boolean;
  signatureVerifiedCount: number;
  sourceLabel: string;
}

export interface PluginUpdateSigningReviewEntry {
  autoInstall: boolean;
  channel: string;
  currentVersion: string;
  issues: string[];
  manifestHash: string;
  pluginId: string;
  proposedVersion: string;
  rollbackVersion: string | null;
  signatureIssuer: string;
  status: "review-only" | "blocked" | string;
}

export interface PluginMarketplaceTrustEvidence {
  autoUpdateAllowed: boolean;
  blockedCount: number;
  catalogEntryCount: number;
  downloadAllowed: boolean;
  entries: PluginMarketplaceTrustEntry[];
  indexPath: string;
  installAllowed: boolean;
  matchedDisabledPackageCount: number;
  registryPath: string;
  reviewedAt: string;
  revokedCount: number;
  signatureIssuer: string;
  signatureKeyId: string;
  signatureVerified: boolean;
  sourceLabel: string;
}

export interface PluginMarketplaceTrustEntry {
  channel: string;
  issues: string[];
  manifestHash: string;
  moderationStatus: string;
  pluginId: string;
  registryStatus: string;
  revoked: boolean;
  status: "trusted-disabled-match" | "blocked" | string;
  version: string;
}

const KNOWN_PERMISSION_IDS = new Set([
  "downloads:write",
  "library:read",
  "settings:write",
  "theme:profile",
]);

const KNOWN_THEME_HOOK_IDS = new Set([
  "library-card",
  "profile-card",
  "settings-panel",
  "store-card",
]);

const LOCAL_ONLY_GUARDS = [
  "Local manifest review",
  "Static policy ledger only",
  "Deny-by-default permissions",
  "No plugin execution",
  "Native disabled registry audit",
  "Native runtime admission proof",
  "Sandbox escape fixtures blocked",
  "Signed package stages disabled",
  "No permission grant persisted",
  "No marketplace publish",
  "No auto-update install",
  "Signed update review only",
  "Signed marketplace index review only",
  "No theme/app shell injection",
];

const LOCAL_ONLY_GUARD_COPY =
  "Local only: this panel reviews manifests, permissions, theme hooks, signatures, disabled package staging, runtime admission proofs, blocked escape fixtures, update-signing envelopes, and marketplace gates from a static ledger. It does not load, execute, enable, update, install, or sell plugins, and it does not connect to a plugin marketplace.";

const EXPECTED_RUNTIME_SANDBOX_ESCAPE_ATTEMPTS: PluginRuntimeSandboxEscapeAttempt[] = [
  {
    blockedBy: "entrypoint path containment",
    boundary: "path",
    id: "path-traversal-entrypoint",
    label: "Path Traversal Entrypoint",
    payload: "../secrets/token.txt",
    result: "blocked-before-code-load",
  },
  {
    blockedBy: "deny-all IPC allowlist",
    boundary: "ipc",
    id: "ipc-open-shell",
    label: "Deny-All IPC Invoke",
    payload: "tauri.invoke('open_shell')",
    result: "blocked-before-code-load",
  },
  {
    blockedBy: "no environment grants",
    boundary: "environment",
    id: "environment-secret-read",
    label: "Environment Secret Read",
    payload: "process.env.OG_SECRET",
    result: "blocked-before-code-load",
  },
  {
    blockedBy: "disabled registry read-only containment",
    boundary: "filesystem",
    id: "filesystem-host-write",
    label: "Filesystem Host Write",
    payload: "/etc/hosts",
    result: "blocked-before-code-load",
  },
  {
    blockedBy: "registry symlink ancestor rejection",
    boundary: "filesystem",
    id: "filesystem-symlink-entrypoint",
    label: "Symlink Entrypoint Escape",
    payload: "dist/linked-main.js -> /tmp/escape.js",
    result: "blocked-before-code-load",
  },
  {
    blockedBy: "manifest path normalization",
    boundary: "path",
    id: "manifest-nested-path-escape",
    label: "Nested Manifest Path Escape",
    payload: "plugins/../manifest.json",
    result: "blocked-before-code-load",
  },
  {
    blockedBy: "network IPC allowlist is empty",
    boundary: "ipc",
    id: "ipc-network-fetch",
    label: "Network IPC Fetch",
    payload: "tauri.invoke('fetch_url', 'https://plugins.example')",
    result: "blocked-before-code-load",
  },
  {
    blockedBy: "deny-by-default permission ledger",
    boundary: "permission",
    id: "permission-process-spawn",
    label: "Permission Escalation",
    payload: "process:spawn",
    result: "blocked-before-code-load",
  },
];

export const PLUGIN_MANIFEST_IMPORT_SCHEMA = "og-launcher.plugin-manifests";
export const PLUGIN_MANIFEST_IMPORT_VERSION = 1;
const MAX_IMPORTED_MANIFESTS = 32;
const MAX_IMPORTED_LIST_ITEMS = 32;

export function buildPluginSystemReadiness(
  input: PluginSystemReadinessInput,
): PluginSystemReadiness {
  const manifestReviews = reviewPluginManifests(input.manifests ?? []);
  const manifestCount = input.manifests ? manifestReviews.length : input.manifestCount;
  const signedManifestCount = input.manifests
    ? manifestReviews.filter((manifest) => manifest.signatureLabel.startsWith("Signed")).length
    : input.signedManifestCount;
  const signedPackageLedger = input.stagedSignedPackages ?? [];
  const activationPlanReview = input.activationPlanReview ?? null;
  const disabledRegistryAudit = input.disabledRegistryAudit ?? null;
  const runtimeSandboxProof = input.runtimeSandboxProof ?? null;
  const updateSigningReview = input.updateSigningReview ?? null;
  const marketplaceTrust = input.marketplaceTrust ?? null;
  const disabledRegistryAuditReady = isDisabledRegistryAuditReady(disabledRegistryAudit);
  const disabledRegistryAuditBlocked = Boolean(
    disabledRegistryAudit && disabledRegistryAudit.failedCount > 0,
  );
  const runtimeSandboxProofReady = isRuntimeSandboxProofReady(runtimeSandboxProof);
  const runtimeSandboxProcessProofReady = isRuntimeSandboxProcessProofReady(runtimeSandboxProof);
  const runtimeSandboxProofUnsafe = isRuntimeSandboxProofUnsafe(runtimeSandboxProof);
  const updateSigningReviewReady = isUpdateSigningReviewReady(updateSigningReview);
  const updateSigningReviewUnsafe = isUpdateSigningReviewUnsafe(updateSigningReview);
  const marketplaceTrustReady = isMarketplaceTrustReady(marketplaceTrust);
  const marketplaceTrustUnsafe = isMarketplaceTrustUnsafe(marketplaceTrust);
  const permissionLedger = buildPermissionLedger(manifestReviews);
  const policyLedger = buildPolicyLedger(manifestReviews, manifestCount);

  const checks: PluginSystemReadinessCheck[] = [
    {
      action:
        manifestCount > 0
          ? "Review plugin manifest metadata before enabling any runtime path."
          : "Add local plugin manifests before testing plugin review.",
      detail:
        manifestCount > 0
          ? `${manifestCount} local manifest${manifestCount === 1 ? "" : "s"} staged for review.`
          : "No local plugin manifests are staged in this preview.",
      id: "manifest-schema",
      label: "Manifest Schema",
      status: manifestCount > 0 ? "ready" : "warning",
    },
    {
      action:
        manifestCount > 0 && input.permissionReviewConfigured
          ? "Keep policy decisions local and deny unknown capabilities by default."
          : "Stage manifests before creating a permission and theme-hook policy ledger.",
      detail:
        manifestCount > 0
          ? `${policyLedger.length} local policy decision${policyLedger.length === 1 ? "" : "s"} classify schema, permission, theme-hook, and signature evidence.`
          : "No manifest policy ledger can be generated without staged manifests.",
      id: "policy-ledger",
      label: "Policy Ledger",
      status: manifestCount > 0 && input.permissionReviewConfigured ? "ready" : "warning",
    },
    {
      action: input.localDiscoveryConfigured
        ? "Keep discovery read-only until plugin trust rules exist."
        : "Define a local plugin discovery folder and scan policy.",
      detail: input.localDiscoveryConfigured
        ? "Local discovery can enumerate plugin manifests without importing code."
        : "No discovery lane is configured for local plugin manifests.",
      id: "local-discovery",
      label: "Local Discovery",
      status: input.localDiscoveryConfigured ? "ready" : "warning",
    },
    {
      action: input.permissionReviewConfigured
        ? "Require explicit user review for every requested capability."
        : "Create a permission ledger before any plugin can be trusted.",
      detail: input.permissionReviewConfigured
        ? "Manifest permissions are shown as review items only."
        : "Permission prompts and denial persistence are not available yet.",
      id: "permission-review",
      label: "Permission Review",
      status: input.permissionReviewConfigured ? "ready" : "warning",
    },
    {
      action: disabledRegistryAuditBlocked
        ? "Fix blocked disabled registry audit entries before runtime work."
        : disabledRegistryAuditReady
          ? "Keep audited packages disabled until sandbox and permission grants are implemented."
          : "Run the desktop disabled registry audit before trusting staged package rows.",
      detail: disabledRegistryAuditBlocked
        ? `${disabledRegistryAudit?.failedCount ?? 0} disabled registry audit entr${
            disabledRegistryAudit?.failedCount === 1 ? "y" : "ies"
          } failed native verification.`
        : disabledRegistryAuditReady
          ? `${disabledRegistryAudit?.passedCount ?? 0} disabled registry entr${
              disabledRegistryAudit?.passedCount === 1 ? "y" : "ies"
            } passed native hash, signature, path, and stage-record audit.`
          : signedPackageLedger.length > 0
            ? `${signedPackageLedger.length} signed package browser display cache row${
                signedPackageLedger.length === 1 ? "" : "s"
              } require native disabled registry audit before trust.`
            : "No native disabled registry audit evidence is staged.",
      id: "signed-package-staging",
      label: "Package Trust",
      status: disabledRegistryAuditBlocked
        ? "blocked"
        : disabledRegistryAuditReady
          ? "ready"
          : "warning",
    },
    {
      action: disabledRegistryAuditBlocked
        ? "Repair blocked registry entries or clear the disabled package registry."
        : disabledRegistryAuditReady
          ? "Treat the audit as display evidence only; runtime enablement is still blocked."
          : "Run a read-only native audit of the disabled package registry.",
      detail: disabledRegistryAuditBlocked
        ? "Native audit found stage-record, hash, signature, key, path, or symlink issues."
        : disabledRegistryAuditReady
          ? "Desktop audit re-read the staged registry and verified disabled status without executing plugin code."
          : "Browser storage can reopen package rows, but only the desktop audit counts as trust evidence.",
      id: "disabled-registry-audit",
      label: "Disabled Registry Audit",
      status: disabledRegistryAuditBlocked
        ? "blocked"
        : disabledRegistryAuditReady
          ? "ready"
          : "warning",
    },
    {
      action: runtimeSandboxProofUnsafe
        ? "Fix runtime sandbox evidence before any plugin admission work."
        : runtimeSandboxProofReady
          ? "Treat runtime proof as admission evidence only; production sandbox hardening remains open."
          : input.sandboxPrototypeAvailable
            ? "Run only signed fixtures in the sandbox prototype."
            : "Build a process boundary before loading third-party plugin code.",
      detail: runtimeSandboxProofUnsafe
        ? "Native runtime sandbox returned unsafe runtime proof evidence; plugin admission remains blocked."
        : runtimeSandboxProcessProofReady
          ? `${runtimeSandboxProof?.deniedEntrypointCount ?? 0} entrypoint${
              runtimeSandboxProof?.deniedEntrypointCount === 1 ? "" : "s"
            } remain blocked; owned process boundary and deny-all IPC proof passed; codeExecuted false, persistent permissions denied, plugin execution blocked.`
          : runtimeSandboxProofReady
            ? `${runtimeSandboxProof?.deniedEntrypointCount ?? 0} entrypoint${
                runtimeSandboxProof?.deniedEntrypointCount === 1 ? "" : "s"
              } denied before code load; ${
                runtimeSandboxProof?.escapeAttempts.length ?? 0
              } escape fixture${
                runtimeSandboxProof?.escapeAttempts.length === 1 ? "" : "s"
              } blocked before code load; codeExecuted false, permissions denied, process boundary not production-ready.`
            : input.sandboxPrototypeAvailable
              ? "Sandbox prototype exists, but still needs hardening and escape tests."
              : "No plugin runtime, WASM host, IPC boundary, or process sandbox is implemented.",
      id: "runtime-sandbox",
      label: "Runtime Sandbox",
      status: runtimeSandboxProofUnsafe
        ? "blocked"
        : runtimeSandboxProofReady || input.sandboxPrototypeAvailable
          ? "warning"
          : "blocked",
    },
    {
      action: marketplaceTrustUnsafe
        ? "Fix signed marketplace/update index evidence before any marketplace work."
        : marketplaceTrustReady
          ? "Keep signed marketplace/update indexes review-only until hosted marketplace and install gates exist."
          : input.hostedMarketplaceConfigured
            ? "Keep publishing disabled until moderation and revocation are staged."
            : "Design hosted marketplace moderation, reporting, and revocation first.",
      detail: marketplaceTrustUnsafe
        ? "Local signed marketplace/update index returned unsafe marketplace trust evidence; downloads, installs, and auto-updates remain blocked."
        : marketplaceTrustReady
          ? `${marketplaceTrust?.matchedDisabledPackageCount ?? 0} signed marketplace/update index entr${
              marketplaceTrust?.matchedDisabledPackageCount === 1 ? "y" : "ies"
            } matched disabled registry audit evidence with downloads and installs blocked.`
          : input.hostedMarketplaceConfigured
            ? "Marketplace endpoint evidence exists, but publishing is still locked."
            : "No hosted plugin marketplace, review queue, or moderation flow is live.",
      id: "marketplace",
      label: "Marketplace",
      status: marketplaceTrustUnsafe
        ? "blocked"
        : marketplaceTrustReady || input.hostedMarketplaceConfigured
          ? "warning"
          : "blocked",
    },
    {
      action: updateSigningReviewUnsafe
        ? "Fix update signing review evidence before any plugin update work."
        : updateSigningReviewReady
          ? "Keep update envelopes review-only; auto-update installation remains blocked."
          : signedManifestCount > 0 && input.updateChannelConfigured
            ? "Verify signatures before any update can be staged."
            : "Add signed manifests and an update channel before plugin updates.",
      detail: updateSigningReviewUnsafe
        ? "Local update signing review returned unsafe update review evidence; plugin updates remain blocked."
        : updateSigningReviewReady
          ? `${updateSigningReview?.signatureVerifiedCount ?? 0} signed update envelope${
              updateSigningReview?.signatureVerifiedCount === 1 ? "" : "s"
            } reviewed with manifest hashes, rollback plan, and auto-install blocked.`
          : signedManifestCount > 0
            ? `${signedManifestCount} signed manifest sample${
                signedManifestCount === 1 ? "" : "s"
              } visible; auto-update install remains disabled.`
            : "No signed plugin manifest sample is staged for update review.",
      id: "update-signing",
      label: "Update Signing",
      status: updateSigningReviewUnsafe
        ? "blocked"
        : updateSigningReviewReady || (signedManifestCount > 0 && input.updateChannelConfigured)
          ? "ready"
          : "warning",
    },
  ];
  const readyCount = checks.filter((check) => check.status === "ready").length;
  const warningCount = checks.filter((check) => check.status === "warning").length;
  const blockedCount = checks.filter((check) => check.status === "blocked").length;
  const nextCheck =
    checks.find((check) => check.status === "blocked") ??
    checks.find((check) => check.status === "warning") ??
    null;

  return {
    activationPlanReview,
    blockedCount,
    checks,
    disabledRegistryAudit,
    guardCopy: LOCAL_ONLY_GUARD_COPY,
    guards: [...LOCAL_ONLY_GUARDS],
    manifestReviews,
    marketplaceTrust,
    nextAction: nextCheck?.action ?? "Plugin review checklist is ready for staged validation.",
    permissionLedger,
    policyLedger,
    progress: Math.round((readyCount / checks.length) * 100),
    readyCount,
    runtimeSandboxProof,
    signedPackageLedger,
    statusLabel:
      blockedCount > 0 ? "Local only" : warningCount > 0 ? "Needs hardening" : "Review ready",
    summary:
      blockedCount > 0
        ? "Plugin System can review local manifests, but runtime and marketplace paths remain blocked."
        : warningCount > 0
          ? "Plugin System has local review evidence, but hardening work remains."
          : "Plugin System readiness checks are ready for a staged review pass.",
    updateSigningReview,
    warningCount,
  };
}

export function reviewPluginManifests(manifests: PluginManifestEvidence[]): PluginManifestReview[] {
  return manifests.map((manifest, index) => {
    const id = cleanText(manifest.id) ?? `unidentified-plugin-${index + 1}`;
    const name = cleanText(manifest.name) ?? "Unnamed Plugin";
    const version = cleanText(manifest.version) ?? "missing version";
    const entrypoint = cleanText(manifest.entrypoint) ?? "missing entrypoint";
    const permissions = normalizeList(manifest.permissions);
    const themeHooks = normalizeList(manifest.themeHooks);
    const updateChannel = cleanText(manifest.updateChannel);
    const signatureIssuer = cleanText(manifest.signatureIssuer);
    const schemaIssues = [
      cleanText(manifest.id) ? null : "id",
      cleanText(manifest.name) ? null : "name",
      cleanText(manifest.version) ? null : "version",
      cleanText(manifest.entrypoint) ? null : "entrypoint",
      cleanText(manifest.id) && !isSafePluginId(id) ? "id format" : null,
      cleanText(manifest.version) && !isSemverLike(version) ? "version format" : null,
      cleanText(manifest.entrypoint) && !isSafeEntrypoint(entrypoint) ? "entrypoint path" : null,
    ].filter(Boolean) as string[];
    const deniedPermissions = permissions.filter(
      (permission) => !KNOWN_PERMISSION_IDS.has(permission),
    );
    const deniedThemeHooks = themeHooks.filter((hook) => !KNOWN_THEME_HOOK_IDS.has(hook));
    const signed = Boolean(manifest.signed && signatureIssuer);
    const status: PluginSystemReadinessStatus =
      schemaIssues.length > 0 || deniedPermissions.length > 0 || deniedThemeHooks.length > 0
        ? "blocked"
        : !signed || permissions.length > 0 || themeHooks.length > 0
          ? "warning"
          : "ready";

    return {
      deniedPermissions,
      deniedThemeHooks,
      detail:
        schemaIssues.length > 0
          ? `Manifest policy issue${schemaIssues.length === 1 ? "" : "s"}: ${schemaIssues.join(", ")}.`
          : deniedPermissions.length > 0 || deniedThemeHooks.length > 0
            ? "Manifest requests capabilities outside the local allowlist; deny by default."
            : permissions.length > 0 || themeHooks.length > 0
              ? "Valid manifest staged for manual permission and theme-hook review."
              : signed
                ? "Valid signed manifest staged for review with no elevated permission request."
                : "Valid manifest staged for review, but signature evidence is missing.",
      entrypoint,
      id,
      name,
      permissions,
      policyItems: [
        schemaIssues.length > 0
          ? `Schema policy: ${schemaIssues.join(", ")}`
          : "Schema policy: required fields and path shape pass",
        deniedPermissions.length > 0
          ? `Denied permissions: ${deniedPermissions.join(", ")}`
          : "Denied permissions: none",
        deniedThemeHooks.length > 0
          ? `Denied theme hooks: ${deniedThemeHooks.join(", ")}`
          : "Denied theme hooks: none",
        signed ? `Trust policy: signed by ${signatureIssuer}` : "Trust policy: unsigned review",
      ],
      reviewItems: [
        `Entrypoint: ${entrypoint}`,
        permissions.length > 0
          ? `Permissions: ${permissions.join(", ")}`
          : "Permissions: none requested",
        themeHooks.length > 0 ? `Theme hooks: ${themeHooks.join(", ")}` : "Theme hooks: none",
        signed
          ? `Signature: signed by ${signatureIssuer}`
          : "Signature: unsigned or issuer missing",
        updateChannel ? `Update channel: ${updateChannel}` : "Update channel: disabled",
      ],
      schemaIssues,
      signatureLabel: signed ? `Signed by ${signatureIssuer}` : "Unsigned",
      status,
      statusLabel:
        status === "blocked" ? "Needs schema" : status === "warning" ? "Needs review" : "Ready",
      themeHooks,
      updateChannelLabel: updateChannel ?? "Disabled",
      version,
    };
  });
}

export function createPluginManifestImportPayload(
  manifests: PluginManifestEvidence[],
  exportedAt = new Date().toISOString(),
): PluginManifestImportPayload {
  return {
    exportedAt,
    manifests: normalizeManifestEvidenceList(manifests),
    schema: PLUGIN_MANIFEST_IMPORT_SCHEMA,
    version: PLUGIN_MANIFEST_IMPORT_VERSION,
  };
}

export function parsePluginManifestImportPayload(raw: string): PluginManifestEvidence[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Plugin manifest import must be valid JSON.");
  }

  if (Array.isArray(parsed)) {
    return normalizeManifestEvidenceList(parsed);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Plugin manifest import must be a JSON object or array.");
  }

  const object = parsed as Record<string, unknown>;
  if ("manifests" in object) {
    if (
      object.schema !== PLUGIN_MANIFEST_IMPORT_SCHEMA ||
      object.version !== PLUGIN_MANIFEST_IMPORT_VERSION
    ) {
      throw new Error("Plugin manifest import schema is not supported.");
    }
    if (!Array.isArray(object.manifests)) {
      throw new Error("Plugin manifest import must include a manifests array.");
    }
    return normalizeManifestEvidenceList(object.manifests);
  }

  return [normalizeManifestEvidence(object)];
}

function normalizeManifestEvidenceList(values: unknown[]): PluginManifestEvidence[] {
  return values.slice(0, MAX_IMPORTED_MANIFESTS).map(normalizeManifestEvidence);
}

function normalizeManifestEvidence(value: unknown): PluginManifestEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Each plugin manifest import entry must be a JSON object.");
  }

  const manifest = value as Record<string, unknown>;
  return {
    entrypoint: optionalString(manifest.entrypoint, 260),
    id: optionalString(manifest.id, 96),
    name: optionalString(manifest.name, 96),
    permissions: optionalStringList(manifest.permissions),
    signatureIssuer: optionalString(manifest.signatureIssuer, 160),
    signed: typeof manifest.signed === "boolean" ? manifest.signed : null,
    themeHooks: optionalStringList(manifest.themeHooks),
    updateChannel: optionalString(manifest.updateChannel, 96),
    version: optionalString(manifest.version, 64),
  };
}

function optionalString(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error("Plugin manifest fields must use string, boolean, or string-array values.");
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

function optionalStringList(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) {
    throw new Error("Plugin manifest list fields must be arrays.");
  }

  return [
    ...new Set(
      value
        .slice(0, MAX_IMPORTED_LIST_ITEMS)
        .map((item) => optionalString(item, 96))
        .filter(Boolean) as string[],
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function buildPolicyLedger(
  manifests: PluginManifestReview[],
  manifestCount: number,
): PluginPolicyLedgerItem[] {
  const schemaIssueCount = manifests.reduce(
    (total, manifest) => total + manifest.schemaIssues.length,
    0,
  );
  const deniedPermissionCount = manifests.reduce(
    (total, manifest) => total + manifest.deniedPermissions.length,
    0,
  );
  const deniedThemeHookCount = manifests.reduce(
    (total, manifest) => total + manifest.deniedThemeHooks.length,
    0,
  );
  const unsignedCount = manifests.filter(
    (manifest) => manifest.signatureLabel === "Unsigned",
  ).length;

  return [
    {
      detail:
        schemaIssueCount > 0
          ? `${schemaIssueCount} schema/path issue${schemaIssueCount === 1 ? "" : "s"} require correction before runtime review.`
          : manifestCount > 0
            ? "Required manifest fields and entrypoint path shapes are locally reviewable."
            : "No manifest schema policy evidence is staged.",
      id: "schema-policy",
      label: "Schema Policy",
      status: schemaIssueCount > 0 ? "warning" : manifestCount > 0 ? "ready" : "warning",
    },
    {
      detail:
        deniedPermissionCount > 0
          ? `${deniedPermissionCount} permission request${deniedPermissionCount === 1 ? "" : "s"} fall outside the local allowlist and stay denied.`
          : "All requested permissions are known review tokens; none are granted here.",
      id: "permission-denials",
      label: "Permission Denials",
      status: deniedPermissionCount > 0 ? "warning" : "ready",
    },
    {
      detail:
        deniedThemeHookCount > 0
          ? `${deniedThemeHookCount} theme hook${deniedThemeHookCount === 1 ? "" : "s"} fall outside the local allowlist and stay denied.`
          : "Theme hooks are review labels only; no app shell hook is applied.",
      id: "theme-hook-policy",
      label: "Theme Hook Policy",
      status: deniedThemeHookCount > 0 ? "warning" : "ready",
    },
    {
      detail:
        unsignedCount > 0
          ? `${unsignedCount} manifest${unsignedCount === 1 ? "" : "s"} remain unsigned and cannot auto-update.`
          : "Signed manifest evidence is staged for local review only.",
      id: "signature-policy",
      label: "Signature Policy",
      status: unsignedCount > 0 ? "warning" : manifestCount > 0 ? "ready" : "warning",
    },
  ];
}

function buildPermissionLedger(manifests: PluginManifestReview[]): PluginPermissionLedgerItem[] {
  const permissionCounts = new Map<string, number>();
  for (const manifest of manifests) {
    for (const permission of manifest.permissions) {
      permissionCounts.set(permission, (permissionCounts.get(permission) ?? 0) + 1);
    }
  }

  if (permissionCounts.size === 0) {
    return [
      {
        count: 0,
        detail: "No reviewed manifest requests elevated launcher permissions.",
        id: "no-elevated-permissions",
        label: "No Elevated Permissions",
        status: "ready",
      },
    ];
  }

  return [...permissionCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([permission, count]) => ({
      count,
      detail: `${count} manifest${count === 1 ? "" : "s"} request ${permission}; approval remains manual and deny-by-default.`,
      id: permission,
      label: permission,
      status: "warning",
    }));
}

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeList(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean) as string[])].sort(
    (left, right) => left.localeCompare(right),
  );
}

function isSafePluginId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{2,63}$/.test(value);
}

function isSemverLike(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(value);
}

function isSafeEntrypoint(value: string): boolean {
  if (/^(?:https?:|file:|data:|javascript:)/i.test(value)) return false;
  if (/^(?:[a-z]:[\\/]|\/|\\\\)/i.test(value)) return false;
  return !/(^|[\\/])\.\.($|[\\/])/.test(value);
}

function isDisabledRegistryAuditReady(audit: PluginDisabledRegistryAuditEvidence | null): boolean {
  return Boolean(
    audit &&
    audit.passedCount > 0 &&
    audit.failedCount === 0 &&
    audit.entries.length === audit.passedCount &&
    audit.entries.every(
      (entry) => entry.status === "disabled-audited" && entry.issues.length === 0,
    ),
  );
}

function hasExpectedRuntimeSandboxEscapeAttempts(
  attempts: PluginRuntimeSandboxEscapeAttempt[],
  expectedResult = "blocked-before-code-load",
): boolean {
  if (attempts.length !== EXPECTED_RUNTIME_SANDBOX_ESCAPE_ATTEMPTS.length) return false;

  const attemptsById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  if (attemptsById.size !== attempts.length) return false;

  return EXPECTED_RUNTIME_SANDBOX_ESCAPE_ATTEMPTS.every((expected) => {
    const actual = attemptsById.get(expected.id);
    return (
      actual?.blockedBy === expected.blockedBy &&
      actual.boundary === expected.boundary &&
      actual.label === expected.label &&
      actual.payload === expected.payload &&
      actual.result === expectedResult
    );
  });
}

function hasCommonRuntimeSandboxProofShape(
  proof: PluginRuntimeSandboxProofEvidence | null,
  expectedEscapeResult: string,
): proof is PluginRuntimeSandboxProofEvidence {
  return Boolean(
    proof &&
    proof.auditPassedCount > 0 &&
    proof.auditFailedCount === 0 &&
    proof.deniedEntrypointCount > 0 &&
    proof.auditPassedCount === proof.deniedEntrypointCount &&
    proof.allowedExecutionCount === 0 &&
    proof.codeExecuted === false &&
    proof.entries.length === proof.deniedEntrypointCount &&
    proof.entries.every(
      (entry) =>
        entry.status === "runtime-blocked" &&
        entry.issues.length === 0 &&
        Boolean(cleanText(entry.denyReason)) &&
        Boolean(cleanText(entry.entrypoint)) &&
        Boolean(cleanText(entry.pluginId)) &&
        Boolean(cleanText(entry.registryPath)) &&
        Boolean(cleanText(entry.version)),
    ) &&
    hasExpectedRuntimeSandboxEscapeAttempts(proof.escapeAttempts, expectedEscapeResult),
  );
}

function isRuntimeSandboxDryRunProofReady(
  proof: PluginRuntimeSandboxProofEvidence | null,
): boolean {
  return Boolean(
    hasCommonRuntimeSandboxProofShape(proof, "blocked-before-code-load") &&
    proof.processBoundaryReady === false &&
    proof.ipcAllowlistReady === false &&
    proof.permissionGrantReady === false,
  );
}

export function isRuntimeSandboxProcessProofReady(
  proof: PluginRuntimeSandboxProofEvidence | null,
): boolean {
  return Boolean(
    hasCommonRuntimeSandboxProofShape(proof, "blocked-by-admission") &&
    proof.processBoundaryReady === true &&
    proof.ipcAllowlistReady === true &&
    proof.permissionGrantReady === false &&
    proof.sourceLabel.toLowerCase().includes("proof-process") &&
    proof.entries.every((entry) =>
      cleanText(entry.denyReason)?.toLowerCase().includes("owned process boundary proved"),
    ),
  );
}

export function isRuntimeSandboxProofReady(
  proof: PluginRuntimeSandboxProofEvidence | null,
): boolean {
  return isRuntimeSandboxDryRunProofReady(proof) || isRuntimeSandboxProcessProofReady(proof);
}

function isRuntimeSandboxProofUnsafe(proof: PluginRuntimeSandboxProofEvidence | null): boolean {
  return Boolean(proof && !isRuntimeSandboxProofReady(proof));
}

function isUpdateSigningReviewReady(review: PluginUpdateSigningReviewEvidence | null): boolean {
  return Boolean(
    review &&
    review.signatureVerifiedCount > 0 &&
    review.manifestHashReady &&
    review.rollbackPlanReady &&
    review.autoInstallBlocked &&
    review.entries.length === review.signatureVerifiedCount &&
    review.entries.every(
      (entry) =>
        entry.status === "review-only" &&
        entry.autoInstall === false &&
        entry.issues.length === 0 &&
        entry.manifestHash.startsWith("sha256:") &&
        Boolean(entry.rollbackVersion),
    ),
  );
}

function isUpdateSigningReviewUnsafe(review: PluginUpdateSigningReviewEvidence | null): boolean {
  return Boolean(
    review &&
    (!review.autoInstallBlocked ||
      !review.manifestHashReady ||
      !review.rollbackPlanReady ||
      review.signatureVerifiedCount <= 0 ||
      review.entries.some(
        (entry) =>
          entry.status !== "review-only" ||
          entry.autoInstall ||
          entry.issues.length > 0 ||
          !entry.manifestHash.startsWith("sha256:") ||
          !entry.rollbackVersion,
      )),
  );
}

function isMarketplaceTrustReady(trust: PluginMarketplaceTrustEvidence | null): boolean {
  return Boolean(
    trust &&
    trust.signatureVerified &&
    trust.catalogEntryCount > 0 &&
    trust.matchedDisabledPackageCount > 0 &&
    trust.blockedCount === 0 &&
    trust.revokedCount === 0 &&
    trust.downloadAllowed === false &&
    trust.installAllowed === false &&
    trust.autoUpdateAllowed === false &&
    trust.entries.length === trust.catalogEntryCount &&
    trust.entries.every(
      (entry) =>
        entry.status === "trusted-disabled-match" &&
        entry.registryStatus === "disabled-audited" &&
        entry.moderationStatus === "approved" &&
        entry.revoked === false &&
        entry.issues.length === 0 &&
        isSha256Digest(entry.manifestHash),
    ),
  );
}

function isMarketplaceTrustUnsafe(trust: PluginMarketplaceTrustEvidence | null): boolean {
  return Boolean(
    trust &&
    (!trust.signatureVerified ||
      trust.catalogEntryCount <= 0 ||
      trust.matchedDisabledPackageCount <= 0 ||
      trust.blockedCount > 0 ||
      trust.revokedCount > 0 ||
      trust.downloadAllowed ||
      trust.installAllowed ||
      trust.autoUpdateAllowed ||
      trust.entries.length !== trust.catalogEntryCount ||
      trust.entries.some(
        (entry) =>
          entry.status !== "trusted-disabled-match" ||
          entry.registryStatus !== "disabled-audited" ||
          entry.moderationStatus !== "approved" ||
          entry.revoked ||
          entry.issues.length > 0 ||
          !isSha256Digest(entry.manifestHash),
      )),
  );
}

function isSha256Digest(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/i.test(value);
}

export function createVerifyPluginSystemReadiness(): PluginSystemReadiness {
  return buildPluginSystemReadiness(createVerifyPluginSystemReadinessInput(null));
}

export function createVerifyPluginRuntimeSandboxReadiness(): PluginSystemReadiness {
  return buildPluginSystemReadiness(
    createVerifyPluginSystemReadinessInput(createVerifyPluginRuntimeSandboxProof()),
  );
}

export function createVerifyPluginUpdateSigningReadiness(): PluginSystemReadiness {
  return buildPluginSystemReadiness(
    createVerifyPluginSystemReadinessInput(
      createVerifyPluginRuntimeSandboxProof(),
      createVerifyPluginUpdateSigningReview(),
    ),
  );
}

export function createVerifyPluginMarketplaceUpdateIndexTrustReadiness(): PluginSystemReadiness {
  return buildPluginSystemReadiness(
    createVerifyPluginSystemReadinessInput(
      createVerifyPluginRuntimeSandboxProof(),
      createVerifyPluginUpdateSigningReview(),
      createVerifyPluginMarketplaceTrust(),
    ),
  );
}

function createVerifyPluginSystemReadinessInput(
  runtimeSandboxProof: PluginRuntimeSandboxProofEvidence | null,
  updateSigningReview: PluginUpdateSigningReviewEvidence | null = null,
  marketplaceTrust: PluginMarketplaceTrustEvidence | null = null,
): PluginSystemReadinessInput {
  return {
    activationPlanReview: null,
    disabledRegistryAudit: {
      auditedAt: "2026-06-15T00:00:00.000Z",
      entries: [
        {
          entrypoint: "dist/main.js",
          fileCount: 1,
          issues: [],
          keyId: "local-trusted",
          pluginId: "library-tags-exporter",
          registryPath: "app-data/plugins/staged/library-tags-exporter/0.3.1",
          signatureIssuer: "OG Launcher Local Test CA",
          status: "disabled-audited",
          version: "0.3.1",
        },
      ],
      failedCount: 0,
      passedCount: 1,
      registryPath: "app-data/plugins/staged",
      sourceLabel: "Verification native disabled registry audit fixture",
    },
    hostedMarketplaceConfigured: false,
    localDiscoveryConfigured: true,
    manifests: [
      {
        entrypoint: "dist/main.js",
        id: "library-tags-exporter",
        name: "Library Tags Exporter",
        permissions: ["library:read", "settings:write"],
        signed: true,
        signatureIssuer: "OG Launcher Local Test CA",
        themeHooks: [],
        updateChannel: "disabled",
        version: "0.3.1",
      },
      {
        entrypoint: "theme/index.css",
        id: "manga-theme-pack",
        name: "Manga Theme Pack",
        permissions: ["theme:profile"],
        signed: false,
        themeHooks: ["profile-card", "store-card"],
        updateChannel: null,
        version: "1.2.0",
      },
      {
        entrypoint: "",
        id: "broken-runtime-demo",
        name: "Broken Runtime Demo",
        permissions: ["downloads:write", "process:spawn"],
        signed: false,
        themeHooks: [],
        version: "0.0.0",
      },
    ],
    manifestCount: 3,
    marketplaceTrust,
    permissionReviewConfigured: true,
    runtimeSandboxProof,
    sandboxPrototypeAvailable: false,
    signedManifestCount: 1,
    stagedSignedPackages: [
      {
        detail:
          "Ed25519 signature, file hashes, entrypoint containment, and disabled registry write staged locally.",
        entrypoint: "dist/main.js",
        fileCount: 1,
        keyId: "local-trusted",
        pluginId: "library-tags-exporter",
        registryPath: "app-data/plugins/staged/library-tags-exporter/0.3.1",
        signatureIssuer: "OG Launcher Local Test CA",
        status: "disabled",
        version: "0.3.1",
      },
    ],
    updateChannelConfigured: false,
    updateSigningReview,
  };
}

function createVerifyPluginRuntimeSandboxProof(): PluginRuntimeSandboxProofEvidence {
  return {
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
        pluginId: "library-tags-exporter",
        registryPath: "app-data/plugins/staged/library-tags-exporter/0.3.1",
        status: "runtime-blocked",
        version: "0.3.1",
      },
    ],
    escapeAttempts: createVerifyPluginRuntimeSandboxEscapeAttempts().map((attempt) => ({
      ...attempt,
      result: "blocked-by-admission",
    })),
    ipcAllowlistReady: true,
    permissionGrantReady: false,
    processBoundaryReady: true,
    provedAt: "2026-06-15T00:02:00.000Z",
    registryPath: "app-data/plugins/staged",
    sourceLabel: "Verification native runtime sandbox proof-process fixture",
  };
}

function createVerifyPluginRuntimeSandboxEscapeAttempts(): PluginRuntimeSandboxEscapeAttempt[] {
  return EXPECTED_RUNTIME_SANDBOX_ESCAPE_ATTEMPTS.map((attempt) => ({ ...attempt }));
}

function createVerifyPluginUpdateSigningReview(): PluginUpdateSigningReviewEvidence {
  return {
    autoInstallBlocked: true,
    entries: [
      {
        autoInstall: false,
        channel: "stable",
        currentVersion: "0.3.1",
        issues: [],
        manifestHash: "sha256:4cf2b18ef5a01fd7d7dd2db638a4e03c4d5f52d20c0114db1ef0d3d47f88a75a",
        pluginId: "verified-plugin",
        proposedVersion: "0.3.2",
        rollbackVersion: "0.3.1",
        signatureIssuer: "OG Launcher Local Test CA",
        status: "review-only",
      },
    ],
    manifestHashReady: true,
    reviewedAt: "2026-06-15T00:05:00.000Z",
    rollbackPlanReady: true,
    signatureVerifiedCount: 1,
    sourceLabel: "Local update signing review fixture",
  };
}

function createVerifyPluginMarketplaceTrust(): PluginMarketplaceTrustEvidence {
  return {
    autoUpdateAllowed: false,
    blockedCount: 0,
    catalogEntryCount: 1,
    downloadAllowed: false,
    entries: [
      {
        channel: "stable",
        issues: [],
        manifestHash: "sha256:4cf2b18ef5a01fd7d7dd2db638a4e03c4d5f52d20c0114db1ef0d3d47f88a75a",
        moderationStatus: "approved",
        pluginId: "verified-plugin",
        registryStatus: "disabled-audited",
        revoked: false,
        status: "trusted-disabled-match",
        version: "0.3.2",
      },
    ],
    indexPath: "app-data/plugins/marketplace/update-index.json",
    installAllowed: false,
    matchedDisabledPackageCount: 1,
    registryPath: "app-data/plugins/staged",
    reviewedAt: "2026-06-15T00:08:00.000Z",
    revokedCount: 0,
    signatureIssuer: "OG Launcher Local Test CA",
    signatureKeyId: "local-trusted",
    signatureVerified: true,
    sourceLabel: "Local signed marketplace/update index review fixture",
  };
}
