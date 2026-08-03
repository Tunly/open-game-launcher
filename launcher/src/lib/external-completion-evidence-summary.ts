export type ExternalCompletionEvidenceStatus = "blocked" | "pass" | "review";

export type ExternalCompletionEvidenceGateId =
  | "store-stripe-live"
  | "hosted-supabase-cron"
  | "provider-live-integrations"
  | "hardware-os-e2e"
  | "rollout-tracks";

const REQUIRED_EVIDENCE_DETAIL_FIELDS = [
  "Captured at",
  "Release ref",
  "Commit SHA",
  "Operator",
  "Environment",
  "Redacted run IDs, dashboard links, screenshots, or signed deployment logs",
  "Redaction notes",
] as const;

const hostedCronEvidenceFields = [
  "Hosted cron table",
  "Function",
  "Run ID",
  "Scheduled",
  "dry_run=false",
  "Status",
] as const;

const hostedSupabaseCronLaneIds = ["price-drop", "presence-poll", "account-deletion"] as const;

const releaseTagPattern =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const hostedSupabaseCronEvidenceFields = hostedSupabaseCronLaneIds.flatMap((lane) =>
  hostedCronEvidenceFields.map((field) => `${lane}: ${field}`),
);

function isHostedSupabaseCronLaneEvidenceField(
  field: string,
): field is (typeof hostedCronEvidenceFields)[number] {
  return (hostedCronEvidenceFields as readonly string[]).includes(field);
}

const hostedCronExpectedValuesByLane: Record<
  (typeof hostedSupabaseCronLaneIds)[number],
  Partial<Record<(typeof hostedCronEvidenceFields)[number], RegExp>>
> = {
  "account-deletion": {
    Function: /^process-account-deletions$/i,
    "Hosted cron table": /^account_deletion_processor_runs$/i,
    Scheduled: /^scheduled$/i,
    Status: /^completed$/i,
  },
  "presence-poll": {
    Function: /^poll-platform-presence$/i,
    "Hosted cron table": /^presence_poll_runs$/i,
    Scheduled: /^scheduled$/i,
    Status: /^completed$/i,
  },
  "price-drop": {
    Function: /^notify-price-drop$/i,
    "Hosted cron table": /^store_price_drop_notification_runs$/i,
    Scheduled: /^scheduled$/i,
    Status: /^completed$/i,
  },
};

const storePriceDropSchedulerExpectedValues: Partial<
  Record<(typeof hostedCronEvidenceFields)[number], RegExp>
> = hostedCronExpectedValuesByLane["price-drop"];

const stripeLiveEvidenceFields = [
  "Stripe webhook event ID",
  "Stripe Dashboard evidence",
  "Supabase function log run ID",
  "License key custody evidence",
  "Live license issuance evidence",
] as const;

const providerEvidenceFields = [
  "Provider/client matrix",
  "Live probe run ID",
  "Provider response evidence",
] as const;

const hardwareEvidenceFields = [
  "OS/title/client matrix",
  "Hardware profile",
  "Session/run ID",
] as const;

const rolloutEvidenceFields = [
  "Community rollout evidence",
  "Marketplace evidence",
  "Hosted deploy evidence",
] as const;

export type ExternalCompletionEvidenceDetailField = string;

export interface ExternalCompletionEvidenceEnvEvidence {
  name: string;
  value: string;
}

export interface ExternalCompletionEvidenceArtifactProofInput {
  path: string;
  requiredProofs: string[];
}

export interface ExternalCompletionEvidenceArtifactEvidenceFieldInput {
  path: string;
  requiredFields: string[];
}

export interface ExternalCompletionEvidenceArtifactInput {
  checkedProofs?: string[];
  content?: string;
  evidenceDetails?: Partial<Record<ExternalCompletionEvidenceDetailField, string>>;
  path: string;
  proofEvidence?: Record<string, string | string[]>;
  readError?: string;
  readable?: boolean;
  secretFindings?: string[];
}

export interface ExternalCompletionEvidenceGateInput {
  artifactEvidence?: ExternalCompletionEvidenceArtifactInput[];
  artifactEvidenceFields?: ExternalCompletionEvidenceArtifactEvidenceFieldInput[];
  artifactPaths: string[];
  artifactProofs?: ExternalCompletionEvidenceArtifactProofInput[];
  availableArtifactPaths?: string[];
  envEvidence?: ExternalCompletionEvidenceEnvEvidence[];
  id: ExternalCompletionEvidenceGateId;
  label: string;
  localEvidence: string;
  proofRequirements: string[];
  provenRequirements?: string[];
  requiredEnv: string[];
  readyEnv?: string[];
  skippedProof: string;
  surface: string;
}

export interface ExternalCompletionEvidenceReleaseBoundaryEnv {
  GITHUB_REF?: string;
  GITHUB_REF_NAME?: string;
  GITHUB_SHA?: string;
}

export interface ExternalCompletionEvidenceMissingEvidenceDetail {
  field: ExternalCompletionEvidenceDetailField;
  path: string;
}

export type ExternalCompletionEvidenceFindingReason =
  | "commit_sha_mismatch"
  | "future_timestamp"
  | "local_path"
  | "malformed"
  | "malformed_locator"
  | "malformed_timestamp"
  | "missing"
  | "missing_lane_terms"
  | "placeholder"
  | "release_ref_mismatch"
  | "stale_timestamp"
  | "unapproved_url"
  | "weak"
  | "wrong_expected_value";

export interface ExternalCompletionEvidenceDetailFinding extends ExternalCompletionEvidenceMissingEvidenceDetail {
  reason: ExternalCompletionEvidenceFindingReason;
}

export interface ExternalCompletionEvidenceProofMappingBlocker {
  path: string;
  proof: string;
}

export interface ExternalCompletionEvidenceProofEvidenceFinding extends ExternalCompletionEvidenceProofMappingBlocker {
  field: ExternalCompletionEvidenceDetailField;
  reason: ExternalCompletionEvidenceFindingReason;
}

export interface ExternalCompletionEvidenceArtifactProofSummary {
  checkedProofCount: number;
  evidenceDetailFindings: ExternalCompletionEvidenceDetailFinding[];
  missingEvidenceDetails: ExternalCompletionEvidenceMissingEvidenceDetail[];
  missingProofEvidenceMappings: ExternalCompletionEvidenceProofMappingBlocker[];
  missingProofs: string[];
  path: string;
  proofEvidenceFindings: ExternalCompletionEvidenceProofEvidenceFinding[];
  readable: boolean;
  requiredProofs: string[];
  secretFindingLabels: string[];
  status: ExternalCompletionEvidenceStatus;
}

export interface ExternalCompletionEvidenceGate {
  artifactPaths: string[];
  artifactProofs: ExternalCompletionEvidenceArtifactProofSummary[];
  blockerCount: number;
  blockers: string[];
  evidenceDetailFindings: ExternalCompletionEvidenceDetailFinding[];
  id: ExternalCompletionEvidenceGateId;
  label: string;
  localEvidence: string;
  missingArtifactCount: number;
  missingArtifactProofCount: number;
  missingEvidenceDetailCount: number;
  missingEnvCount: number;
  missingProofEvidenceCount: number;
  missingProofCount: number;
  nextAction: string;
  proofEvidenceFindings: ExternalCompletionEvidenceProofEvidenceFinding[];
  proofRequirements: string[];
  recommendedCommands: string[];
  requiredEnv: string[];
  secretFindingCount: number;
  skippedProof: string;
  status: ExternalCompletionEvidenceStatus;
  surface: string;
  templateOnlyFindingCount: number;
  unreadableArtifactCount: number;
  warningCount: number;
  warnings: string[];
}

export interface ExternalCompletionEvidenceSummary {
  blockedClaims: string[];
  blockedCount: number;
  createdAt: string;
  gates: ExternalCompletionEvidenceGate[];
  packetId: string;
  passCount: number;
  releaseBoundaryCommands: string[];
  reviewCount: number;
  statusLabel: string;
  summary: string;
  totalCount: number;
  warningCount: number;
}

export const EXTERNAL_COMPLETION_EVIDENCE_BLOCKED_CLAIMS = [
  "No external proof claim",
  "No live provider credential rendered",
  "No hardware proof",
  "No production deployment proof",
  "No marketplace execution proof",
  "No live Stripe webhook or Dashboard proof",
  "No hosted cron scheduled-row proof",
] as const;

export const EXTERNAL_COMPLETION_EVIDENCE_RELEASE_BOUNDARY_COMMANDS = [
  "pnpm external:evidence:next",
  "pnpm external:evidence:worklist",
  "pnpm external:evidence:packet",
  "pnpm external:evidence:runbook",
  "pnpm external:evidence:preflight",
  "pnpm completion:gate:status",
  "pnpm completion:gate:external",
] as const;

const HOSTED_DEPLOY_PROOF_RUN_HANDOFF =
  "GitHub Actions CI main hosted_deploy_gate=true hosted_environment=hosted-production hosted_deploy_action=all hosted_deploy_dry_run=false";

export const EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS: ExternalCompletionEvidenceGateInput[] = [
  {
    artifactPaths: [
      "docs/verification/external/store-stripe-live-staging.md",
      "docs/verification/external/store-price-drop-scheduler-live.md",
    ],
    artifactProofs: [
      {
        path: "docs/verification/external/store-stripe-live-staging.md",
        requiredProofs: [
          "Stripe webhook signature delivery reaches stripe-webhook.",
          "Stripe Tax and invoice settings are verified in Dashboard.",
          "Production license signing key custody and live license issuance are verified.",
        ],
      },
      {
        path: "docs/verification/external/store-price-drop-scheduler-live.md",
        requiredProofs: ["Hosted price-drop scheduler writes fresh run evidence."],
      },
    ],
    artifactEvidenceFields: [
      {
        path: "docs/verification/external/store-stripe-live-staging.md",
        requiredFields: [...stripeLiveEvidenceFields],
      },
      {
        path: "docs/verification/external/store-price-drop-scheduler-live.md",
        requiredFields: [...hostedCronEvidenceFields],
      },
    ],
    id: "store-stripe-live",
    label: "Store and Stripe live staging",
    localEvidence:
      "Checkout, webhook, wishlist, invoice, and scheduler contracts are locally covered with dry-run fixtures.",
    proofRequirements: [
      "Stripe webhook signature delivery reaches stripe-webhook.",
      "Stripe Tax and invoice settings are verified in Dashboard.",
      "Production license signing key custody and live license issuance are verified.",
      "Hosted price-drop scheduler writes fresh run evidence.",
    ],
    requiredEnv: [
      "SUPABASE_URL",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "PRICE_DROP_NOTIFY_SECRET",
    ],
    skippedProof:
      "No live webhook, Tax Dashboard, invoice Dashboard, or fresh scheduled row attached.",
    surface: "Commerce Gate",
  },
  {
    artifactPaths: ["docs/verification/external/hosted-supabase-cron.md"],
    artifactEvidenceFields: [
      {
        path: "docs/verification/external/hosted-supabase-cron.md",
        requiredFields: [...hostedSupabaseCronEvidenceFields],
      },
    ],
    id: "hosted-supabase-cron",
    label: "Hosted Supabase cron",
    localEvidence:
      "Hosted cron UI and script contracts compare price-drop, account deletion, and presence lanes.",
    proofRequirements: [
      "poll-platform-presence scheduled run writes fresh evidence.",
      "notify-price-drop scheduled run writes fresh evidence.",
      "process-account-deletions scheduled run writes fresh evidence.",
    ],
    requiredEnv: [
      "SUPABASE_URL",
      "PRICE_DROP_NOTIFY_SECRET",
      "ACCOUNT_DELETION_PROCESSOR_SECRET",
      "PRESENCE_POLL_SECRET",
    ],
    skippedProof: "No real-secret scheduled non-dry-run rows are attached for all three functions.",
    surface: "Scheduler Gate",
  },
  {
    artifactPaths: ["docs/verification/external/provider-live-integrations.md"],
    artifactEvidenceFields: [
      {
        path: "docs/verification/external/provider-live-integrations.md",
        requiredFields: [...providerEvidenceFields],
      },
    ],
    id: "provider-live-integrations",
    label: "Provider live integrations",
    localEvidence:
      "Provider adapters, cache policy, cloud transfer, and bridge contracts are covered locally.",
    proofRequirements: [
      "Non-Steam presence bridges return redacted live provider evidence.",
      "Provider-approved catalog/cloud transfer flows are verified.",
      "Achievement/provider cache E2E runs against real client data.",
    ],
    requiredEnv: ["STEAM_WEB_API_KEY", "PRESENCE_PROVIDER_TOKEN"],
    skippedProof:
      "No provider-key staging packet, redacted bridge proof, or real-client cache E2E attached.",
    surface: "Provider Gate",
  },
  {
    artifactPaths: ["docs/verification/external/hardware-os-e2e.md"],
    artifactEvidenceFields: [
      {
        path: "docs/verification/external/hardware-os-e2e.md",
        requiredFields: [...hardwareEvidenceFields],
      },
    ],
    id: "hardware-os-e2e",
    label: "Hardware and OS E2E",
    localEvidence:
      "Overlay, external-drive, client mount/apply, and backup safety contracts have local readiness coverage.",
    proofRequirements: [
      "Fullscreen/anti-cheat overlay evidence is captured on real titles.",
      "Long native overlay sessions produce stable runtime/session evidence.",
      "External-drive backup/restore E2E runs on Windows, macOS, and Linux.",
      "Real client mount/apply behavior is tested against provider clients.",
    ],
    requiredEnv: [],
    skippedProof:
      "No real-title overlay, multi-OS external drive, or provider-client mount/apply run attached.",
    surface: "Device Gate",
  },
  {
    artifactPaths: ["docs/verification/external/rollout-tracks.md"],
    artifactEvidenceFields: [
      {
        path: "docs/verification/external/rollout-tracks.md",
        requiredFields: [...rolloutEvidenceFields],
      },
    ],
    id: "rollout-tracks",
    label: "Rollout tracks",
    localEvidence:
      "Community, plugin, and hosted deployment readiness are covered by local contracts.",
    proofRequirements: [
      "Hosted community artwork rollout is exercised beyond fixtures.",
      "Plugin marketplace execution/update channels are externally reviewed.",
      "Hosted production deployment evidence is attached.",
    ],
    requiredEnv: [],
    skippedProof: "No community rollout, marketplace run, or deployment packet.",
    surface: "Rollout Gate",
  },
];

const EXTERNAL_COMPLETION_EVIDENCE_COMMITTED_ARTIFACT_SNAPSHOT_PATHS = [
  "docs/verification/external/hardware-os-e2e.md",
  "docs/verification/external/hosted-supabase-cron.md",
  "docs/verification/external/provider-live-integrations.md",
  "docs/verification/external/rollout-tracks.md",
  "docs/verification/external/store-price-drop-scheduler-live.md",
  "docs/verification/external/store-stripe-live-staging.md",
] as const;

const externalCompletionEvidenceCommittedArtifactSnapshotPathSet = new Set<string>(
  EXTERNAL_COMPLETION_EVIDENCE_COMMITTED_ARTIFACT_SNAPSHOT_PATHS,
);

export function buildExternalCompletionEvidenceSummary({
  createdAt,
  gates,
  packetId,
  releaseBoundaryEnv,
  validationNow,
}: {
  createdAt: string;
  gates: ExternalCompletionEvidenceGateInput[];
  packetId: string;
  releaseBoundaryEnv?: ExternalCompletionEvidenceReleaseBoundaryEnv;
  validationNow?: Date | string;
}): ExternalCompletionEvidenceSummary {
  const now = resolveValidationNow(validationNow);
  const summaryGates = gates.map((gate) =>
    buildExternalCompletionEvidenceGate(gate, now, releaseBoundaryEnv),
  );
  const passCount = summaryGates.filter((gate) => gate.status === "pass").length;
  const reviewCount = summaryGates.filter((gate) => gate.status === "review").length;
  const blockedCount = summaryGates.filter((gate) => gate.status === "blocked").length;
  const warningCount = summaryGates.reduce((total, gate) => total + gate.warningCount, 0);
  const totalCount = summaryGates.length;

  return {
    blockedClaims: [...EXTERNAL_COMPLETION_EVIDENCE_BLOCKED_CLAIMS],
    blockedCount,
    createdAt,
    gates: summaryGates,
    packetId,
    passCount,
    releaseBoundaryCommands: [...EXTERNAL_COMPLETION_EVIDENCE_RELEASE_BOUNDARY_COMMANDS],
    reviewCount,
    statusLabel: passCount === totalCount ? "Evidence Packet Pass" : "External Evidence Required",
    summary:
      "Local no-write evidence map for the remaining live, provider, hardware, rollout, and hosted scheduler gates. Each lane must satisfy the CLI-style blockers: non-placeholder environment values with expected shapes, readable artifacts, checked proof rows, artifact-specific proof coverage, proof-specific Evidence for mappings, complete Evidence Details, clean secret scan, and release-boundary tag/SHA matching in CI.",
    totalCount,
    warningCount,
  };
}

export function createVerifyExternalCompletionEvidenceSummary() {
  return buildExternalCompletionEvidenceSummary({
    createdAt: "2026-06-16T00:00:00.000Z",
    gates: EXTERNAL_COMPLETION_EVIDENCE_GATE_INPUTS.map((gate) => ({
      ...gate,
      artifactEvidence: gate.artifactPaths.map((path) => ({
        path,
        readable: externalCompletionEvidenceCommittedArtifactSnapshotPathSet.has(path),
      })),
    })),
    packetId: "external-completion-evidence-summary-local-001",
  });
}

function buildExternalCompletionEvidenceGate(
  gate: ExternalCompletionEvidenceGateInput,
  now: Date,
  releaseBoundaryEnv?: ExternalCompletionEvidenceReleaseBoundaryEnv,
): ExternalCompletionEvidenceGate {
  const readyEnv = new Set(gate.readyEnv ?? []);
  const availableArtifactPaths = new Set(gate.availableArtifactPaths ?? []);
  const provenRequirements = new Set(gate.provenRequirements ?? []);
  const envEvidence = new Map((gate.envEvidence ?? []).map((item) => [item.name, item.value]));
  const artifactEvidence = new Map(
    (gate.artifactEvidence ?? []).map((artifact) => [
      artifact.path,
      normalizeArtifactEvidence(artifact),
    ]),
  );
  const checkedProofs = new Set<string>();
  const evidenceDetailFindings: ExternalCompletionEvidenceDetailFinding[] = [];
  const missingEvidenceDetails: ExternalCompletionEvidenceMissingEvidenceDetail[] = [];
  const missingProofEvidenceMappings: ExternalCompletionEvidenceProofMappingBlocker[] = [];
  const proofEvidenceFindings: ExternalCompletionEvidenceProofEvidenceFinding[] = [];
  const secretFindings: Array<{ label: string; path: string }> = [];
  const missingArtifactProofs: ExternalCompletionEvidenceProofMappingBlocker[] = [];
  const templateOnlyFindings: Array<{ path: string }> = [];

  const missingEnv = gate.requiredEnv.filter(
    (name) => !envValueIsConfigured(name, envEvidence.get(name)),
  );
  const missingArtifacts = gate.artifactPaths.filter(
    (path) => !artifactEvidence.has(path) && !availableArtifactPaths.has(path),
  );
  const unreadableArtifacts = gate.artifactPaths.filter((path) => {
    const artifact = artifactEvidence.get(path);
    if (!artifact) return availableArtifactPaths.has(path);
    return !artifact.readable;
  });

  for (const path of gate.artifactPaths) {
    const artifact = artifactEvidence.get(path);
    const requiredProofs = requiredProofsForArtifact(gate, path);
    const requiredDetailFields = requiredEvidenceDetailFieldsForArtifact(gate, path);
    if (!artifact?.readable) {
      continue;
    }

    for (const proof of artifact.checkedProofs) checkedProofs.add(proof);

    for (const proof of requiredProofs) {
      if (!artifact.checkedProofs.has(proof)) {
        if (gate.artifactProofs) missingArtifactProofs.push({ path, proof });
        continue;
      }
      if (!proofEvidenceValuesAreValid(proof, artifact.proofEvidence.get(proof) ?? [])) {
        missingProofEvidenceMappings.push({ path, proof });
        proofEvidenceFindings.push({
          field: `Evidence for ${proof}`,
          path,
          proof,
          reason: proofEvidenceFindingReason(proof, artifact.proofEvidence.get(proof) ?? []),
        });
      }
    }

    const artifactEvidenceDetailFindings = evidenceDetailFindingsForArtifact(
      path,
      artifact,
      now,
      requiredDetailFields,
      releaseBoundaryEnv,
    );
    evidenceDetailFindings.push(...artifactEvidenceDetailFindings);
    missingEvidenceDetails.push(
      ...artifactEvidenceDetailFindings.map(({ field, path }) => ({ field, path })),
    );
    templateOnlyFindings.push(
      ...templateOnlyFindingsForArtifact(path, artifact, requiredProofs, requiredDetailFields),
    );
    for (const label of artifact.secretFindingLabels) secretFindings.push({ label, path });
  }

  const missingProofs = gate.proofRequirements.filter((proof) => !checkedProofs.has(proof));
  const missingEnvCount = missingEnv.length;
  const missingArtifactCount = missingArtifacts.length;
  const missingProofCount = missingProofs.length;
  const missingArtifactProofCount = missingArtifactProofs.length;
  const missingEvidenceDetailCount = missingEvidenceDetails.length;
  const missingProofEvidenceCount = missingProofEvidenceMappings.length;
  const secretFindingCount = secretFindings.length;
  const templateOnlyFindingCount = templateOnlyFindings.length;
  const unreadableArtifactCount = unreadableArtifacts.length;
  const artifactProofs = gate.artifactPaths.map((path) =>
    buildArtifactProofSummary({
      artifact: artifactEvidence.get(path),
      evidenceDetailFindings,
      missingEvidenceDetails,
      missingProofEvidenceMappings,
      path,
      proofEvidenceFindings,
      requiredDetailFields: requiredEvidenceDetailFieldsForArtifact(gate, path),
      requiredProofs: requiredProofsForArtifact(gate, path),
    }),
  );
  const warnings = buildLabelOnlyWarnings({
    artifactEvidence,
    availableArtifactPaths,
    checkedProofs,
    envEvidence,
    gate,
    provenRequirements,
    readyEnv,
  });
  const blockers = buildBlockers({
    missingArtifactCount,
    missingArtifactProofCount,
    missingEvidenceDetailCount,
    missingEnvCount,
    missingProofCount,
    missingProofEvidenceCount,
    secretFindingCount,
    templateOnlyFindingCount,
    unreadableArtifactCount,
  });
  const blockerCount =
    missingEnvCount +
    missingArtifactCount +
    missingProofCount +
    missingArtifactProofCount +
    missingEvidenceDetailCount +
    missingProofEvidenceCount +
    secretFindingCount +
    templateOnlyFindingCount +
    unreadableArtifactCount;
  const status: ExternalCompletionEvidenceStatus =
    blockerCount > 0 ? "blocked" : warnings.length > 0 ? "review" : "pass";
  const nextAction = buildNextAction({
    gate,
    missingArtifactCount,
    missingArtifactProofCount,
    missingEvidenceDetailCount,
    missingEnvCount,
    missingProofCount,
    missingProofEvidenceCount,
    secretFindingCount,
    templateOnlyFindingCount,
    unreadableArtifactCount,
    warningCount: warnings.length,
  });

  return {
    artifactPaths: [...gate.artifactPaths],
    artifactProofs,
    blockerCount,
    blockers,
    evidenceDetailFindings,
    id: gate.id,
    label: gate.label,
    localEvidence: gate.localEvidence,
    missingArtifactCount,
    missingArtifactProofCount,
    missingEvidenceDetailCount,
    missingEnvCount,
    missingProofEvidenceCount,
    missingProofCount,
    nextAction,
    proofEvidenceFindings,
    proofRequirements: [...gate.proofRequirements],
    recommendedCommands: recommendedCommandsForGate(gate, {
      missingArtifactCount,
      missingArtifactProofCount,
      missingEvidenceDetailCount,
      missingProofCount,
      missingProofEvidenceCount,
      templateOnlyFindingCount,
    }),
    requiredEnv: [...gate.requiredEnv],
    secretFindingCount,
    skippedProof: gate.skippedProof,
    status,
    surface: gate.surface,
    templateOnlyFindingCount,
    unreadableArtifactCount,
    warningCount: warnings.length,
    warnings,
  };
}

function hostedCronEvidenceCheckIdsForGate(gate: ExternalCompletionEvidenceGateInput) {
  if (gate.id === "store-stripe-live") return ["price-drop"];
  if (gate.id === "hosted-supabase-cron") return [...hostedSupabaseCronLaneIds];
  return [];
}

function hostedCronEvidenceCommandPrefix(checkIds: string[]) {
  const allCheckIds = [...hostedSupabaseCronLaneIds];
  const includesAllChecks =
    checkIds.length === allCheckIds.length &&
    checkIds.every((id, index) => id === allCheckIds[index]);
  if (includesAllChecks) return "";
  return `OGL_HOSTED_CRON_EVIDENCE_CHECKS=${checkIds.join(",")} `;
}

function recommendedCommandsForGate(
  gate: ExternalCompletionEvidenceGateInput,
  status: {
    missingArtifactCount: number;
    missingArtifactProofCount: number;
    missingEvidenceDetailCount: number;
    missingProofCount: number;
    missingProofEvidenceCount: number;
    templateOnlyFindingCount: number;
  },
) {
  const commands = new Set([
    `OGL_EXTERNAL_EVIDENCE_GATES=${gate.id} pnpm external:evidence:status`,
  ]);

  if (
    status.missingArtifactCount > 0 ||
    status.missingProofCount > 0 ||
    status.missingArtifactProofCount > 0 ||
    status.missingEvidenceDetailCount > 0 ||
    status.missingProofEvidenceCount > 0 ||
    status.templateOnlyFindingCount > 0
  ) {
    commands.add(`OGL_EXTERNAL_EVIDENCE_GATES=${gate.id} pnpm external:evidence:template`);
  }

  const hostedCronCheckIds = hostedCronEvidenceCheckIdsForGate(gate);
  if (hostedCronCheckIds.length > 0) {
    const prefix = hostedCronEvidenceCommandPrefix(hostedCronCheckIds);
    commands.add("pnpm hosted:deploy-gate:scheduler-packet");
    commands.add(`${prefix}pnpm hosted:cron-evidence:plan`);
    commands.add(`${prefix}pnpm hosted:cron-evidence`);
    commands.add(`${prefix}pnpm hosted:cron-evidence:packet`);
    commands.add(`${prefix}pnpm hosted:cron-evidence:artifact-hints`);
  }

  if (gate.id === "rollout-tracks") {
    commands.add("pnpm hosted:deploy-gate:plan");
    commands.add("pnpm hosted:deploy-gate:packet");
    commands.add(HOSTED_DEPLOY_PROOF_RUN_HANDOFF);
  }

  commands.add(`OGL_EXTERNAL_EVIDENCE_GATES=${gate.id} pnpm external:evidence:preflight`);
  return [...commands];
}

interface NormalizedExternalCompletionEvidenceArtifact {
  checkedProofs: Set<string>;
  content: string;
  evidenceDetails: Map<ExternalCompletionEvidenceDetailField, string[]>;
  path: string;
  proofEvidence: Map<string, string[]>;
  readable: boolean;
  secretFindingLabels: string[];
}

const forbiddenArtifactPatterns = [
  {
    label: "Stripe secret key",
    pattern: /\b(?:sk|rk)_(?:live|test)_[a-z0-9_=-]+/i,
  },
  {
    label: "Stripe webhook secret",
    pattern: /whsec_[a-z0-9_=-]+/i,
  },
  {
    label: "Bearer token",
    pattern: /bearer\s+[a-z0-9._~+/=-]{12,}/i,
  },
  {
    label: "Raw GitHub token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-z0-9_]{20,}\b/i,
  },
  {
    label: "Raw GitHub token",
    pattern: /\bgithub_pat_[a-z0-9_]{20,}\b/i,
  },
  {
    label: "Raw GitHub token",
    pattern:
      /\b(?:GITHUB_TOKEN|GH_TOKEN|GITHUB_PAT)\s*[:=]\s*(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[^\s`"'<>]{8,}/i,
  },
  {
    label: "Raw provider API key",
    pattern:
      /\b(?:STEAM_WEB_API_KEY|RAWG_API_KEY|PRESENCE_PROVIDER_TOKEN)\s*[:=]\s*(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[^\s`"'<>]{8,}/i,
  },
  {
    label: "Raw provider API key",
    pattern:
      /\bx-api-key\s*:\s*(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[a-z0-9._~+/=-]{8,}/i,
  },
  {
    label: "Raw provider API key",
    pattern:
      /\bauthorization\s*:\s*token\s+(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[a-z0-9._~+/=-]{8,}/i,
  },
  {
    label: "Raw Supabase credential",
    pattern:
      /\b(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|SUPABASE_AUTH_JWT)\s*[:=]\s*(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[^\s`"'<>]{8,}/i,
  },
  {
    label: "Raw Supabase access token",
    pattern:
      /\bSUPABASE_ACCESS_TOKEN\s*[:=]\s*(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[^\s`"'<>]{8,}/i,
  },
  {
    label: "Raw Supabase access token",
    pattern: /\bsbp_[a-z0-9_=-]{20,}\b/i,
  },
  {
    label: "Raw private key",
    pattern: /-----BEGIN (?:EC |RSA |)PRIVATE KEY-----/,
  },
  {
    label: "Raw hosted cron secret",
    pattern:
      /\b(?:PRICE_DROP_NOTIFY_SECRET|ACCOUNT_DELETION_PROCESSOR_SECRET|PRESENCE_POLL_SECRET)\s*[:=]\s*(?!(?:\[?redacted\]?|<redacted>|\*{3,})(?:\s|$))[^\s`"'<>]{8,}/i,
  },
  {
    label: "JWT-like token",
    pattern: /eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}/,
  },
  {
    label: "Unredacted secret fixture",
    pattern: /\b(secret-value|sk_live_secret|whsec_secret)\b/i,
  },
] as const;

const placeholderEvidenceDetailValues = new Set([
  "-",
  "--",
  "dummy",
  "example",
  "n/a",
  "na",
  "none",
  "null",
  "pending",
  "placeholder",
  "sample",
  "tbd",
  "todo",
]);

const weakEvidenceDetailValuesByField: Partial<
  Record<ExternalCompletionEvidenceDetailField, Set<string>>
> = {
  Operator: new Set(["me"]),
  Environment: new Set(["test"]),
  "Redacted run IDs, dashboard links, screenshots, or signed deployment logs": new Set([
    "available on request",
    "pending in dashboard",
    "redacted",
    "see above",
    "see attached later",
  ]),
  "Redaction notes": new Set(["ok"]),
};

const rejectedRedactionNotePattern =
  /\b(?:not\s+redacted|unredacted|contains\s+raw|not\s+reviewed)\b/i;
const positiveRedactionNotePatterns = [
  /\braw\s+secrets?\s+removed\b/i,
  /\btokens?\s+redacted\b/i,
  /\bno\s+raw\s+secrets?\b/i,
] as const;

const placeholderEnvironmentValues = new Set([
  ...placeholderEvidenceDetailValues,
  "api-key",
  "api_key",
  "secret",
  "secret-value",
  "set",
  "sk_live_secret",
  "token",
  "whsec_secret",
]);

const utcIsoTimestampPattern = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/;
const maxEvidenceAgeMs = 30 * 24 * 60 * 60 * 1000;
const maxEvidenceFutureSkewMs = 10 * 60 * 1000;

function resolveValidationNow(value?: Date | string) {
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? new Date() : value;
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) return parsed;
  }
  return new Date();
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function evidenceMarkdownLines(content: string) {
  const lines = String(content).split(/\r?\n/);
  let fenceMarker: string | null = null;
  let htmlComment = false;

  return lines.filter((line) => {
    if (htmlComment) {
      if (line.includes("-->")) htmlComment = false;
      return false;
    }

    const marker = line.trimStart().match(/^(```|~~~)/)?.[1] ?? null;
    if (marker && !fenceMarker) {
      fenceMarker = marker;
      return false;
    }
    if (marker && marker === fenceMarker) {
      fenceMarker = null;
      return false;
    }
    if (fenceMarker) return false;

    const commentStart = line.indexOf("<!--");
    if (commentStart >= 0) {
      if (!line.includes("-->", commentStart + 4)) htmlComment = true;
      return false;
    }

    if (/^(?: {4,}|\t)/.test(line) && line.trim() !== "") return false;

    return true;
  });
}

function markdownHeading(line: string) {
  const match = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
  if (!match) return null;
  return {
    level: match[1].length,
    text: match[2].replace(/`/g, "").trim().toLowerCase(),
  };
}

function checkedProofsFromArtifactContent(content: string) {
  return evidenceMarkdownLines(content)
    .map((line) => line.match(/^\s*[-*]\s+\[[xX]\]\s+(.+?)\s*$/)?.[1])
    .filter((proof): proof is string => Boolean(proof))
    .map((proof) => proof.trim());
}

function appendEvidenceDetailValue(
  details: Map<ExternalCompletionEvidenceDetailField, string[]>,
  field: ExternalCompletionEvidenceDetailField,
  value: unknown,
) {
  const cleanedValue = clean(value);
  if (!field || !cleanedValue) return;
  const existing = details.get(field) ?? [];
  details.set(field, [...existing, cleanedValue]);
}

function evidenceDetailsFromArtifactContent(content: string) {
  const details = new Map<ExternalCompletionEvidenceDetailField, string[]>();
  const lines = evidenceMarkdownLines(content);
  let hostedCronLane: (typeof hostedSupabaseCronLaneIds)[number] | null = null;
  let hostedCronLaneHeadingLevel = 0;

  for (const line of lines) {
    const heading = markdownHeading(line);
    if (heading) {
      const laneHeading = hostedSupabaseCronLaneIds.find((lane) => heading.text === lane) ?? null;
      if (laneHeading) {
        hostedCronLane = laneHeading;
        hostedCronLaneHeadingLevel = heading.level;
      } else if (hostedCronLane && heading.level <= hostedCronLaneHeadingLevel) {
        hostedCronLane = null;
        hostedCronLaneHeadingLevel = 0;
      }
      continue;
    }

    const match = line.match(/^\s*[-*]\s+([^:]+):\s*(\S.*)$/);
    if (!match) continue;
    const field = match[1].trim();
    const value = clean(match[2]);
    if (!field || !value) continue;
    appendEvidenceDetailValue(details, field, value);
    if (hostedCronLane && isHostedSupabaseCronLaneEvidenceField(field)) {
      appendEvidenceDetailValue(details, `${hostedCronLane}: ${field}`, value);
    }
  }

  return details;
}

function proofEvidenceFromArtifactContent(content: string) {
  const proofEvidence = new Map<string, string[]>();

  for (const line of evidenceMarkdownLines(content)) {
    const match = line.match(/^\s*[-*]\s+Evidence for (.+?):\s*(\S.*)$/);
    if (!match) continue;
    const proof = match[1].trim();
    const value = clean(match[2]);
    if (!proofEvidence.has(proof)) proofEvidence.set(proof, []);
    proofEvidence.get(proof)?.push(value);
  }

  return proofEvidence;
}

function normalizeArtifactEvidence(
  artifact: ExternalCompletionEvidenceArtifactInput,
): NormalizedExternalCompletionEvidenceArtifact {
  const checkedProofs = new Set(artifact.checkedProofs ?? []);
  const evidenceDetails = new Map<ExternalCompletionEvidenceDetailField, string[]>();
  const proofEvidence = new Map<string, string[]>();
  const content = clean(artifact.content);

  for (const [field, value] of Object.entries(artifact.evidenceDetails ?? {})) {
    appendEvidenceDetailValue(evidenceDetails, field, value);
  }

  for (const [proof, value] of Object.entries(artifact.proofEvidence ?? {})) {
    proofEvidence.set(proof, Array.isArray(value) ? value.map(clean) : [clean(value)]);
  }

  if (content) {
    for (const proof of checkedProofsFromArtifactContent(content)) checkedProofs.add(proof);
    for (const [field, values] of evidenceDetailsFromArtifactContent(content)) {
      for (const value of values) appendEvidenceDetailValue(evidenceDetails, field, value);
    }
    for (const [proof, values] of proofEvidenceFromArtifactContent(content)) {
      const existing = proofEvidence.get(proof) ?? [];
      proofEvidence.set(proof, [...existing, ...values]);
    }
  }

  const structuredEvidenceSecretScanTarget = [
    ...Array.from(evidenceDetails.values()).flat(),
    ...Array.from(proofEvidence.values()).flat(),
  ].join("\n");
  const artifactSecretScanTarget = [content, structuredEvidenceSecretScanTarget]
    .filter(Boolean)
    .join("\n");
  const artifactSecretFindings = artifactSecretScanTarget
    ? forbiddenArtifactPatterns
        .filter(({ pattern }) => pattern.test(artifactSecretScanTarget))
        .map(({ label }) => label)
    : [];
  const secretFindingLabels = [
    ...new Set([...(artifact.secretFindings ?? []), ...artifactSecretFindings].map(clean)),
  ];

  return {
    checkedProofs,
    content,
    evidenceDetails,
    path: artifact.path,
    proofEvidence,
    readable: artifact.readable === true || (Boolean(content) && artifact.readable !== false),
    secretFindingLabels: secretFindingLabels.filter(Boolean),
  };
}

function requiredProofsForArtifact(
  gate: ExternalCompletionEvidenceGateInput,
  artifactPath: string,
) {
  return (
    gate.artifactProofs?.find((item) => item.path === artifactPath)?.requiredProofs ??
    gate.proofRequirements
  );
}

function requiredEvidenceFieldsForArtifact(
  gate: ExternalCompletionEvidenceGateInput,
  artifactPath: string,
) {
  return (
    gate.artifactEvidenceFields?.find((item) => item.path === artifactPath)?.requiredFields ?? []
  );
}

function requiredEvidenceDetailFieldsForArtifact(
  gate: ExternalCompletionEvidenceGateInput,
  artifactPath: string,
) {
  return [
    ...REQUIRED_EVIDENCE_DETAIL_FIELDS,
    ...requiredEvidenceFieldsForArtifact(gate, artifactPath),
  ];
}

function canonicalUtcIsoTimestamp(value: string) {
  const match = value.match(utcIsoTimestampPattern);
  if (!match) return null;
  return `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`;
}

function timestampEvidenceIssueReason(
  value: string,
  now: Date,
): ExternalCompletionEvidenceFindingReason | null {
  const canonical = canonicalUtcIsoTimestamp(value);
  if (!canonical) return "malformed_timestamp";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== canonical) {
    return "malformed_timestamp";
  }
  const timestamp = parsed.valueOf();
  const nowMs = now.valueOf();
  if (timestamp < nowMs - maxEvidenceAgeMs) return "stale_timestamp";
  if (timestamp > nowMs + maxEvidenceFutureSkewMs) return "future_timestamp";
  return null;
}

function urlHostnameIsLocalOrPlaceholder(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized === "localhost.localdomain" ||
    normalized === "::1" ||
    normalized.endsWith(".local")
  ) {
    return true;
  }
  if (/^(?:example\.(?:com|org|net)|.+\.example\.(?:com|org|net))$/.test(normalized)) {
    return true;
  }
  if (/^(?:127|10|0)\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  if (/^169\.254\./.test(normalized)) return true;
  if (/^172\.(?:1[6-9]|2\d|3[0-1])\./.test(normalized)) return true;
  return false;
}

function normalizeEvidenceUrl(rawUrl: string) {
  return rawUrl.replace(/[.,;:'"]+$/g, "");
}

function evidenceLocatorContainsBlockedLocalPath(value: string) {
  return /(?:^|[\s([<])(?:\.{1,2}\/[^\s,;)>]+|~\/[^\s,;)>]+|\/[^\s,;)>]+|[a-z]:[\\/][^\s,;)>]+|(?:docs|scripts|launcher|supabase|\.github|\.husky)\/[^\s,;)>]+)(?=$|[\s,;)>])/i.test(
    value,
  );
}

function evidenceLocatorContainsLocalVerificationPath(value: string) {
  return /(?:^|[\s([<])(?:\.{1,2}\/)?docs\/verification\/screenshots\//i.test(value);
}

const allowedEvidenceUrlPatterns = [
  {
    host: /^(?:www\.)?supabase\.com$/i,
    path: /^\/dashboard\/project\/[a-z0-9]{20}\/.+/i,
  },
  {
    host: /^app\.supabase\.com$/i,
    path: /^\/project\/[a-z0-9]{20}\/.+/i,
  },
  {
    host: /^dashboard\.stripe\.com$/i,
    path: /^\/(?:accts?\/[^/]+\/)?(?:events|webhooks|settings|invoices|tax|logs|customers|payments|payment-links|subscriptions)\/?.*/i,
  },
  {
    host: /^github\.com$/i,
    path: /^\/[^/\s]+\/[^/\s]+\/(?:actions\/runs\/\d+|releases\/tag\/[^/\s]+|deployments\/[^/\s]+|pull\/\d+|commit\/[a-f0-9]{7,40})(?:\/.*)?$/i,
  },
  {
    host: /^(?:[^.\s]+\.)?vercel\.com$/i,
    path: /^\/.+/i,
  },
  {
    host: /^(?:[^.\s]+\.)?netlify\.app$/i,
    path: /^\/.+/i,
  },
  {
    host: /^app\.netlify\.com$/i,
    path: /^\/sites\/[^/\s]+\/deploys\/[^/\s]+(?:\/.*)?$/i,
  },
  {
    host: /^dash\.cloudflare\.com$/i,
    path: /^\/.+/i,
  },
  {
    host: /^appstoreconnect\.apple\.com$/i,
    path: /^\/.+/i,
  },
  {
    host: /^play\.google\.com$/i,
    path: /^\/console\/.+/i,
  },
] as const;

function evidenceUrlIsAllowed(url: URL) {
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  if (url.port) return false;
  if (url.search || url.hash) return false;
  if (urlHostnameIsLocalOrPlaceholder(url.hostname)) return false;
  return allowedEvidenceUrlPatterns.some(
    ({ host, path }) => host.test(url.hostname) && path.test(url.pathname),
  );
}

function evidenceLocatorContainsRejectedUrl(value: string) {
  if (/(?:^|[\s([<])file:\/\//i.test(value)) return true;
  const urls = value.match(/\bhttps?:\/\/[^\s<>)\]]+/gi) ?? [];
  return urls.some((rawUrl) => {
    const candidate = normalizeEvidenceUrl(rawUrl);
    try {
      return !evidenceUrlIsAllowed(new URL(candidate));
    } catch {
      return true;
    }
  });
}

function evidenceLocatorContainsAllowedUrl(value: string) {
  const urls = value.match(/\bhttps:\/\/[^\s<>)\]]+/gi) ?? [];
  return urls.some((rawUrl) => {
    try {
      return evidenceUrlIsAllowed(new URL(normalizeEvidenceUrl(rawUrl)));
    } catch {
      return false;
    }
  });
}

function evidenceLocatorContainsGithubActionsRunUrl(value: string) {
  const urls = value.match(/\bhttps:\/\/[^\s<>)\]]+/gi) ?? [];
  return urls.some((rawUrl) => {
    try {
      const url = new URL(normalizeEvidenceUrl(rawUrl));
      return (
        evidenceUrlIsAllowed(url) &&
        /^github\.com$/i.test(url.hostname) &&
        /^\/[^/\s]+\/[^/\s]+\/actions\/runs\/\d+(?:\/.*)?$/i.test(url.pathname)
      );
    } catch {
      return false;
    }
  });
}

function evidenceLocatorContainsGithubPullOrCommitUrl(value: string) {
  const urls = value.match(/\bhttps:\/\/[^\s<>)\]]+/gi) ?? [];
  return urls.some((rawUrl) => {
    try {
      const url = new URL(normalizeEvidenceUrl(rawUrl));
      return (
        /^github\.com$/i.test(url.hostname) &&
        /^\/[^/\s]+\/[^/\s]+\/(?:pull\/\d+|commit\/[a-f0-9]{7,40})(?:\/.*)?$/i.test(url.pathname)
      );
    } catch {
      return false;
    }
  });
}

function evidenceLocatorValueIsSpecific(value: string) {
  if (evidenceLocatorIssueReason(value)) return false;
  if (evidenceLocatorContainsAllowedUrl(value)) return true;
  const specificLocatorIds =
    value.match(
      /(?:^|[\s,;])((?:run|run_id|workflow|deployment|log|artifact|signed-log)[-_: #][a-z0-9][a-z0-9._:-]{2,})(?=$|[\s,;.])/gi,
    ) ?? [];
  return (
    specificLocatorIds.some((id) => /\d/.test(id)) ||
    /(?:^|[\s,;])sha256:[a-f0-9]{64}(?:$|[\s,;.])/i.test(value)
  );
}

function evidenceLocatorIssueReason(value: string): ExternalCompletionEvidenceFindingReason | null {
  const cleaned = clean(value);
  if (!cleaned) return "missing";
  const normalized = cleaned.toLowerCase().replace(/[.!]+$/, "");
  if (placeholderEvidenceDetailValues.has(normalized)) return "placeholder";
  if (
    weakEvidenceDetailValuesByField[
      "Redacted run IDs, dashboard links, screenshots, or signed deployment logs"
    ]?.has(normalized)
  ) {
    return "weak";
  }
  if (evidenceLocatorContainsLocalVerificationPath(cleaned)) return "local_path";
  if (evidenceLocatorContainsBlockedLocalPath(cleaned)) return "local_path";
  if (/(?:^|[\s([<])file:\/\//i.test(cleaned)) return "local_path";
  if (evidenceLocatorContainsRejectedUrl(cleaned)) return "unapproved_url";
  return null;
}

function evidenceIdentifierValueIsSpecific(value: string) {
  const cleaned = clean(value);
  if (cleaned.length < 6 || cleaned.length > 240) return false;
  if (evidenceLocatorValueIsSpecific(cleaned)) return true;
  if (evidenceLocatorContainsLocalVerificationPath(cleaned)) return false;
  if (evidenceLocatorContainsBlockedLocalPath(cleaned)) return false;
  if (evidenceLocatorContainsRejectedUrl(cleaned)) return false;
  const specificIds =
    cleaned.match(
      /\b(?:run|run_id|probe|session|workflow|deployment|deploy|log|event|artifact|ticket|build)[-_: #]?[a-z0-9][a-z0-9._:-]{2,}\b/gi,
    ) ?? [];
  return specificIds.some((id) => /\d/.test(id));
}

function evidenceIdentifierIssueReason(
  value: string,
): ExternalCompletionEvidenceFindingReason | null {
  const cleaned = clean(value);
  const locatorReason = evidenceLocatorIssueReason(cleaned);
  if (locatorReason) return locatorReason;
  if (cleaned.length < 6 || cleaned.length > 240) return "weak";
  if (evidenceLocatorValueIsSpecific(cleaned)) return null;
  const specificIds =
    cleaned.match(
      /\b(?:run|run_id|probe|session|workflow|deployment|deploy|log|event|artifact|ticket|build)[-_: #]?[a-z0-9][a-z0-9._:-]{2,}\b/gi,
    ) ?? [];
  if (specificIds.length > 0 && !specificIds.some((id) => /\d/.test(id))) {
    return "weak";
  }
  return "malformed_locator";
}

function valueContainsAllowedStripeDashboardUrl(value: string) {
  const urls = value.match(/\bhttps:\/\/[^\s<>)\]]+/gi) ?? [];
  return urls.some((rawUrl) => {
    try {
      const url = new URL(normalizeEvidenceUrl(rawUrl));
      return /^dashboard\.stripe\.com$/i.test(url.hostname) && evidenceUrlIsAllowed(url);
    } catch {
      return false;
    }
  });
}

function evidenceIdentifierValueMatches(value: string, patterns: RegExp[]) {
  if (!evidenceIdentifierValueIsSpecific(value)) return false;
  return patterns.some((pattern) => pattern.test(value));
}

function evidenceIdentifierValueMatchesAll(value: string, patterns: RegExp[]) {
  if (!evidenceIdentifierValueIsSpecific(value)) return false;
  return patterns.every((pattern) => pattern.test(value));
}

function stripeEventIdValueIsSpecific(value: string) {
  const cleaned = clean(value);
  if (evidenceLocatorContainsLocalVerificationPath(cleaned)) return false;
  if (evidenceLocatorContainsBlockedLocalPath(cleaned)) return false;
  if (evidenceLocatorContainsRejectedUrl(cleaned)) return false;
  return /^evt_[a-z0-9]{8,}$/i.test(cleaned);
}

function stripeDashboardEvidenceValueIsSpecific(value: string) {
  const cleaned = clean(value);
  if (evidenceLocatorContainsLocalVerificationPath(cleaned)) return false;
  if (evidenceLocatorContainsBlockedLocalPath(cleaned)) return false;
  if (evidenceLocatorContainsRejectedUrl(cleaned)) return false;
  if (valueContainsAllowedStripeDashboardUrl(cleaned)) return true;
  return evidenceIdentifierValueMatches(cleaned, [/stripe/i, /dashboard/i, /tax/i, /invoice/i]);
}

const hostedDeployRequiredInputPatterns = [
  /\bCI\b/,
  /\bmain\b/,
  /\bhosted_deploy_gate=true\b/,
  /\bhosted_environment=hosted-production\b/,
  /\bhosted_deploy_action=all\b/,
  /\bhosted_deploy_dry_run=false\b/,
] as const;

function hostedDeployWorkflowEvidenceValueIsSpecific(value: string) {
  const cleaned = clean(value);
  if (evidenceLocatorIssueReason(cleaned)) return false;
  if (!/\bhosted[-_\s]?deploy\b/i.test(cleaned)) return false;
  if (evidenceLocatorContainsGithubPullOrCommitUrl(cleaned)) return false;
  if (!evidenceLocatorContainsGithubActionsRunUrl(cleaned)) return false;
  return hostedDeployRequiredInputPatterns.every((pattern) => pattern.test(cleaned));
}

function hostedDeployWorkflowEvidenceIssueReason(
  value: string,
): ExternalCompletionEvidenceFindingReason | null {
  const locatorReason = evidenceLocatorIssueReason(value);
  if (locatorReason) return locatorReason;
  return hostedDeployWorkflowEvidenceValueIsSpecific(value) ? null : "missing_lane_terms";
}

function normalizedReleaseRef(value?: string) {
  return clean(value).replace(/^refs\/tags\//, "");
}

function expectedReleaseRef(env?: ExternalCompletionEvidenceReleaseBoundaryEnv) {
  const refName = normalizedReleaseRef(env?.GITHUB_REF_NAME);
  if (releaseTagPattern.test(refName)) return refName;
  const ref = normalizedReleaseRef(env?.GITHUB_REF);
  return releaseTagPattern.test(ref) ? ref : "";
}

function releaseRefValueIsValid(value: string, env?: ExternalCompletionEvidenceReleaseBoundaryEnv) {
  return releaseRefIssueReason(value, env) === null;
}

function releaseRefIssueReason(
  value: string,
  env?: ExternalCompletionEvidenceReleaseBoundaryEnv,
): ExternalCompletionEvidenceFindingReason | null {
  const cleaned = clean(value).replace(/^refs\/tags\//, "");
  if (!releaseTagPattern.test(cleaned)) return "malformed";
  const expected = expectedReleaseRef(env);
  if (expected && cleaned !== expected) return "release_ref_mismatch";
  return null;
}

function commitShaValueIsValid(value: string, env?: ExternalCompletionEvidenceReleaseBoundaryEnv) {
  return commitShaIssueReason(value, env) === null;
}

function commitShaIssueReason(
  value: string,
  env?: ExternalCompletionEvidenceReleaseBoundaryEnv,
): ExternalCompletionEvidenceFindingReason | null {
  const cleaned = clean(value).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(cleaned)) return "malformed";
  const expected = clean(env?.GITHUB_SHA).toLowerCase();
  if (expected && cleaned !== expected) return "commit_sha_mismatch";
  return null;
}

type EvidenceDetailFieldValidator = (
  value: string,
  env?: ExternalCompletionEvidenceReleaseBoundaryEnv,
) => boolean;

const fieldSpecificEvidenceValidators: Partial<Record<string, EvidenceDetailFieldValidator>> = {
  "Commit SHA": commitShaValueIsValid,
  "Community rollout evidence": (value) =>
    evidenceIdentifierValueMatchesAll(value, [/community/i, /artwork/i, /rollout/i]),
  "Hosted deploy evidence": hostedDeployWorkflowEvidenceValueIsSpecific,
  "Hardware profile": (value) => evidenceIdentifierValueMatches(value, [/hardware/i, /profile/i]),
  "License key custody evidence": (value) =>
    evidenceIdentifierValueMatchesAll(value, [/license/i, /key/i, /custody/i]),
  "Live probe run ID": (value) => evidenceIdentifierValueMatches(value, [/live/i, /probe/i]),
  "Live license issuance evidence": (value) =>
    evidenceIdentifierValueMatchesAll(value, [/live/i, /license/i, /issuance/i]),
  "Marketplace evidence": (value) =>
    evidenceIdentifierValueMatches(value, [/marketplace/i, /plugin/i]),
  "OS/title/client matrix": (value) =>
    evidenceIdentifierValueMatchesAll(value, [/matrix/i, /windows/i, /mac\s?os/i, /linux/i]),
  "Provider response evidence": (value) =>
    evidenceIdentifierValueMatches(value, [/provider/i, /response/i, /probe/i]),
  "Provider/client matrix": (value) =>
    evidenceIdentifierValueMatchesAll(value, [/matrix/i, /provider/i, /client/i]),
  "Release ref": releaseRefValueIsValid,
  "Run ID": evidenceIdentifierValueIsSpecific,
  "Session/run ID": (value) =>
    evidenceIdentifierValueMatches(value, [/session/i, /run/i, /overlay/i]),
  "Stripe Dashboard evidence": stripeDashboardEvidenceValueIsSpecific,
  "Stripe webhook event ID": stripeEventIdValueIsSpecific,
  "Supabase function log run ID": evidenceIdentifierValueIsSpecific,
};

function redactionNotesValueIsValid(value: string) {
  if (rejectedRedactionNotePattern.test(value)) return false;
  return positiveRedactionNotePatterns.some((pattern) => pattern.test(value));
}

function unscopedEvidenceDetailField(field: ExternalCompletionEvidenceDetailField) {
  const prefix = hostedSupabaseCronLaneIds.find((lane) => field.startsWith(`${lane}: `));
  return prefix ? field.slice(prefix.length + 2) : field;
}

function hostedCronLaneForEvidenceDetailField(field: ExternalCompletionEvidenceDetailField) {
  return hostedSupabaseCronLaneIds.find((lane) => field.startsWith(`${lane}: `)) ?? null;
}

function expectedEvidenceDetailValuePattern(field: ExternalCompletionEvidenceDetailField) {
  const hostedCronLane = hostedCronLaneForEvidenceDetailField(field);
  const unscopedField = unscopedEvidenceDetailField(field);
  if (hostedCronLane && isHostedSupabaseCronLaneEvidenceField(unscopedField)) {
    return hostedCronExpectedValuesByLane[hostedCronLane][unscopedField];
  }
  if (isHostedSupabaseCronLaneEvidenceField(unscopedField)) {
    return storePriceDropSchedulerExpectedValues[unscopedField];
  }
  return undefined;
}

function evidenceDetailValueIssueReason(
  field: ExternalCompletionEvidenceDetailField,
  value: string,
  now: Date,
  releaseBoundaryEnv?: ExternalCompletionEvidenceReleaseBoundaryEnv,
): ExternalCompletionEvidenceFindingReason | null {
  const unscopedField = unscopedEvidenceDetailField(field);
  const cleaned = clean(value);
  if (!cleaned) return "missing";
  const normalized = cleaned.toLowerCase().replace(/[.!]+$/, "");
  if (placeholderEvidenceDetailValues.has(normalized)) return "placeholder";
  if (
    weakEvidenceDetailValuesByField[
      unscopedField as keyof typeof weakEvidenceDetailValuesByField
    ]?.has(normalized)
  ) {
    return "weak";
  }
  const expectedPattern = expectedEvidenceDetailValuePattern(field);
  if (expectedPattern && !expectedPattern.test(cleaned)) return "wrong_expected_value";
  if (field === "Captured at") return timestampEvidenceIssueReason(cleaned, now);
  if (field === "Release ref") return releaseRefIssueReason(cleaned, releaseBoundaryEnv);
  if (field === "Commit SHA") return commitShaIssueReason(cleaned, releaseBoundaryEnv);
  if (field === "Redaction notes") {
    return redactionNotesValueIsValid(cleaned) ? null : "wrong_expected_value";
  }
  if (
    field === "Redacted run IDs, dashboard links, screenshots, or signed deployment logs" ||
    unscopedField === "Invocation/result locator"
  ) {
    return evidenceLocatorValueIsSpecific(cleaned)
      ? null
      : (evidenceLocatorIssueReason(cleaned) ?? "malformed_locator");
  }
  if (unscopedField === "dry_run=false") {
    return /^(?:false|confirmed false|dry_run=false)$/i.test(cleaned)
      ? null
      : "wrong_expected_value";
  }
  const fieldValidator = fieldSpecificEvidenceValidators[unscopedField];
  if (fieldValidator && !fieldValidator(cleaned, releaseBoundaryEnv)) {
    return evidenceIdentifierIssueReason(cleaned) ?? "missing_lane_terms";
  }
  return null;
}

function proofEvidenceValueIssueReason(
  value: string,
): ExternalCompletionEvidenceFindingReason | null {
  const locatorReason = evidenceLocatorIssueReason(value);
  if (locatorReason) return locatorReason;
  return evidenceLocatorValueIsSpecific(value) ? null : "malformed_locator";
}

function expectedProofEvidenceValuePattern(proof: string) {
  const normalizedProof = proof.toLowerCase();
  if (/stripe webhook signature/.test(normalizedProof)) {
    return /(?:stripe[-_\s]?webhook|webhook[-_\s]?signature|dashboard\.stripe\.com\/(?:accts?\/[^/]+\/)?(?:events|webhooks)|evt_[a-z0-9]{8,})/i;
  }
  if (/stripe tax and invoice/.test(normalizedProof)) {
    return /(?:stripe[-_\s]?(?:tax|invoice)|dashboard[-_\s]?(?:tax|invoice)|tax[-_\s]?invoice|dashboard\.stripe\.com\/(?:accts?\/[^/]+\/)?(?:settings|invoices|tax))/i;
  }
  if (/license signing key custody/.test(normalizedProof)) {
    return [/license/i, /key/i, /custody/i, /live/i, /issuance/i];
  }
  if (/(?:price-drop|notify-price-drop)/.test(normalizedProof)) {
    return /(?:price[-_\s]?drop|notify[-_\s]?price[-_\s]?drop|store_price_drop_notification_runs)/i;
  }
  if (/poll-platform-presence/.test(normalizedProof)) {
    return /(?:presence[-_\s]?poll|poll[-_\s]?platform[-_\s]?presence|presence_poll_runs)/i;
  }
  if (/process-account-deletions/.test(normalizedProof)) {
    return /(?:account[-_\s]?deletions?|process[-_\s]?account[-_\s]?deletions|account_deletion_processor_runs)/i;
  }
  if (/non-steam presence/.test(normalizedProof)) {
    return [/non[-_\s]?steam/i, /presence/i, /bridge/i, /provider/i];
  }
  if (/provider-approved catalog\/cloud/.test(normalizedProof)) {
    return [/provider[-_\s]?approved/i, /catalog/i, /cloud[-_\s]?transfer/i];
  }
  if (/achievement\/provider cache/.test(normalizedProof)) {
    return [/achievement/i, /provider[-_\s]?cache/i, /real[-_\s]?client/i];
  }
  if (/fullscreen\/anti-cheat overlay/.test(normalizedProof)) {
    return [/fullscreen/i, /anti[-_\s]?cheat/i, /overlay/i];
  }
  if (/long native overlay sessions/.test(normalizedProof)) {
    return [/native[-_\s]?overlay/i, /(?:long[-_\s]?session|runtime[-_\s]?session)/i];
  }
  if (/external-drive backup\/restore/.test(normalizedProof)) {
    return [/(?:external[-_\s]?drive|backup[-_\s]?restore)/i, /windows/i, /mac\s?os/i, /linux/i];
  }
  if (/real client mount\/apply/.test(normalizedProof)) {
    return [/client[-_\s]?mount/i, /mount[-_\s]?apply/i, /provider[-_\s]?clients?/i];
  }
  if (/hosted community artwork rollout/.test(normalizedProof)) {
    return [/community/i, /artwork/i, /rollout/i];
  }
  if (/plugin marketplace/.test(normalizedProof)) {
    return [
      /plugin[-_\s]?marketplace/i,
      /marketplace[-_\s]?execution/i,
      /(?:marketplace[-_\s]?update|plugin[-_\s]?update|execution[-_\s]?update)/i,
    ];
  }
  if (/hosted production deployment/.test(normalizedProof)) {
    return /(?:hosted[-_\s]?(?:production[-_\s]?)?deploy|production[-_\s]?deployment|deployment)/i;
  }
  return null;
}

function proofEvidenceValueIsValidForProof(proof: string, value: string) {
  return proofEvidenceValueIssueReasonForProof(proof, value) === null;
}

function proofEvidenceValueIssueReasonForProof(
  proof: string,
  value: string,
): ExternalCompletionEvidenceFindingReason | null {
  if (/stripe webhook signature/i.test(proof) && stripeEventIdValueIsSpecific(value)) {
    return null;
  }
  if (/hosted production deployment/i.test(proof)) {
    return hostedDeployWorkflowEvidenceIssueReason(value);
  }
  const locatorReason = proofEvidenceValueIssueReason(value);
  if (locatorReason) return locatorReason;
  const expectedPattern = expectedProofEvidenceValuePattern(proof);
  if (!expectedPattern) return null;
  const matches = Array.isArray(expectedPattern)
    ? expectedPattern.every((pattern) => pattern.test(value))
    : expectedPattern.test(value);
  return matches ? null : "missing_lane_terms";
}

function proofEvidenceValuesAreValid(proof: string, values: string[]) {
  return (
    values.length > 0 && values.every((value) => proofEvidenceValueIsValidForProof(proof, value))
  );
}

function proofEvidenceFindingReason(
  proof: string,
  values: string[],
): ExternalCompletionEvidenceFindingReason {
  if (values.length === 0) return "missing";
  return (
    values
      .map((value) => proofEvidenceValueIssueReasonForProof(proof, value))
      .find((reason): reason is ExternalCompletionEvidenceFindingReason => Boolean(reason)) ??
    "malformed_locator"
  );
}

function supabaseProjectUrlIsConfigured(value: string, allowedPathPattern: RegExp) {
  try {
    const url = new URL(value);
    const projectRefMatch = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i);
    const projectRef = projectRefMatch?.[1];
    if (!projectRef || /^(?:example|sample|placeholder|test|your-project-ref)$/i.test(projectRef)) {
      return false;
    }
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      allowedPathPattern.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function secretValueLooksPlausible(value: string, minLength = 24) {
  if (value.length < minLength) return false;
  if (!/^[a-z0-9._~+/=-]+$/i.test(value)) return false;
  if (!/[a-z]/i.test(value) || !/[0-9]/.test(value)) return false;
  return !/(?:^|[-_.])(?:api[-_]?key|configured|dummy|example|placeholder|replace|sample|secret|test|token)(?:$|[-_.])/i.test(
    value,
  );
}

const envShapeValidators: Partial<Record<string, (value: string) => boolean>> = {
  ACCOUNT_DELETION_PROCESSOR_SECRET: (value) => secretValueLooksPlausible(value, 32),
  PRESENCE_POLL_SECRET: (value) => secretValueLooksPlausible(value, 32),
  PRESENCE_PROVIDER_TOKEN: (value) => secretValueLooksPlausible(value, 24),
  PRICE_DROP_NOTIFY_SECRET: (value) => secretValueLooksPlausible(value, 32),
  STEAM_WEB_API_KEY: (value) => /^[a-f0-9]{32}$/i.test(value),
  STRIPE_SECRET_KEY: (value) => /^sk_live_[a-z0-9]{16,}$/i.test(value),
  STRIPE_WEBHOOK_SECRET: (value) => /^whsec_[a-z0-9]{16,}$/i.test(value),
  SUPABASE_FUNCTIONS_BASE_URL: (value) =>
    supabaseProjectUrlIsConfigured(value, /^\/functions\/v1\/?$/),
  SUPABASE_FUNCTIONS_URL: (value) => supabaseProjectUrlIsConfigured(value, /^\/functions\/v1\/?$/),
  SUPABASE_REST_URL: (value) => supabaseProjectUrlIsConfigured(value, /^\/rest\/v1\/?$/),
  SUPABASE_URL: (value) => supabaseProjectUrlIsConfigured(value, /^\/?$/),
};

function envValueIsConfigured(name: string, value: unknown) {
  const cleaned = clean(value);
  if (!cleaned) return false;
  const normalized = cleaned.toLowerCase().replace(/[.!]+$/, "");
  if (placeholderEnvironmentValues.has(normalized)) return false;
  if (normalized.includes("example.supabase.co")) return false;
  if (/^(?:your|replace|change|insert|paste|configured)[-_ ]/.test(normalized)) return false;
  return envShapeValidators[name]?.(cleaned) ?? true;
}

function evidenceDetailFindingsForArtifact(
  path: string,
  artifact: NormalizedExternalCompletionEvidenceArtifact,
  now: Date,
  requiredFields: readonly string[],
  releaseBoundaryEnv?: ExternalCompletionEvidenceReleaseBoundaryEnv,
) {
  return requiredFields.flatMap((field) => {
    const values = artifact.evidenceDetails.get(field) ?? [];
    if (values.length === 0) return [{ field, path, reason: "missing" as const }];

    const reason =
      values
        .map((value) => evidenceDetailValueIssueReason(field, value, now, releaseBoundaryEnv))
        .find((item): item is ExternalCompletionEvidenceFindingReason => Boolean(item)) ?? null;
    return reason ? [{ field, path, reason }] : [];
  });
}

function artifactHasTemplateOnlyBanner(artifact: NormalizedExternalCompletionEvidenceArtifact) {
  return evidenceMarkdownLines(artifact.content).some((line) => /^>\s*Template only\b/i.test(line));
}

function templateOnlyFindingsForArtifact(
  path: string,
  artifact: NormalizedExternalCompletionEvidenceArtifact,
  requiredProofs: readonly string[],
  requiredFields: readonly string[],
) {
  if (!artifactHasTemplateOnlyBanner(artifact)) return [];
  const hasCheckedProof = requiredProofs.some((proof) => artifact.checkedProofs.has(proof));
  const hasFilledDetail = requiredFields.some((field) =>
    (artifact.evidenceDetails.get(field) ?? []).some((value) => clean(value)),
  );
  return hasCheckedProof || hasFilledDetail ? [{ path }] : [];
}

function buildArtifactProofSummary({
  artifact,
  evidenceDetailFindings,
  missingEvidenceDetails,
  missingProofEvidenceMappings,
  path,
  proofEvidenceFindings,
  requiredDetailFields,
  requiredProofs,
}: {
  artifact?: NormalizedExternalCompletionEvidenceArtifact;
  evidenceDetailFindings: ExternalCompletionEvidenceDetailFinding[];
  missingEvidenceDetails: ExternalCompletionEvidenceMissingEvidenceDetail[];
  missingProofEvidenceMappings: ExternalCompletionEvidenceProofMappingBlocker[];
  path: string;
  proofEvidenceFindings: ExternalCompletionEvidenceProofEvidenceFinding[];
  requiredDetailFields: string[];
  requiredProofs: string[];
}): ExternalCompletionEvidenceArtifactProofSummary {
  const checkedProofs = artifact?.checkedProofs ?? new Set<string>();
  const missingProofs = requiredProofs.filter((proof) => !checkedProofs.has(proof));
  const artifactMissingEvidenceDetails = missingEvidenceDetails.filter(
    (item) => item.path === path,
  );
  const artifactEvidenceDetailFindings = evidenceDetailFindings.filter(
    (item) => item.path === path,
  );
  const artifactMissingProofEvidenceMappings = missingProofEvidenceMappings.filter(
    (item) => item.path === path,
  );
  const artifactProofEvidenceFindings = proofEvidenceFindings.filter((item) => item.path === path);
  const blockerCount =
    missingProofs.length +
    artifactMissingEvidenceDetails.length +
    artifactMissingProofEvidenceMappings.length +
    (artifact?.secretFindingLabels.length ?? 0) +
    (artifact
      ? templateOnlyFindingsForArtifact(path, artifact, requiredProofs, requiredDetailFields).length
      : 0) +
    (artifact?.readable ? 0 : 1);
  const status: ExternalCompletionEvidenceStatus = blockerCount === 0 ? "pass" : "blocked";

  return {
    checkedProofCount: checkedProofs.size,
    evidenceDetailFindings: artifactEvidenceDetailFindings,
    missingEvidenceDetails: artifactMissingEvidenceDetails,
    missingProofEvidenceMappings: artifactMissingProofEvidenceMappings,
    missingProofs,
    path,
    proofEvidenceFindings: artifactProofEvidenceFindings,
    readable: artifact?.readable ?? false,
    requiredProofs: [...requiredProofs],
    secretFindingLabels: artifact?.secretFindingLabels ?? [],
    status,
  };
}

function buildBlockers({
  missingArtifactCount,
  missingArtifactProofCount,
  missingEvidenceDetailCount,
  missingEnvCount,
  missingProofCount,
  missingProofEvidenceCount,
  secretFindingCount,
  templateOnlyFindingCount,
  unreadableArtifactCount,
}: {
  missingArtifactCount: number;
  missingArtifactProofCount: number;
  missingEvidenceDetailCount: number;
  missingEnvCount: number;
  missingProofCount: number;
  missingProofEvidenceCount: number;
  secretFindingCount: number;
  templateOnlyFindingCount: number;
  unreadableArtifactCount: number;
}) {
  return [
    missingEnvCount > 0
      ? `${missingEnvCount} missing, placeholder, or malformed environment value(s)`
      : null,
    missingArtifactCount > 0 ? `${missingArtifactCount} missing artifact file(s)` : null,
    unreadableArtifactCount > 0 ? `${unreadableArtifactCount} unreadable artifact file(s)` : null,
    missingProofCount > 0 ? `${missingProofCount} missing checked proof row(s)` : null,
    missingArtifactProofCount > 0
      ? `${missingArtifactProofCount} missing artifact-specific proof row(s)`
      : null,
    missingProofEvidenceCount > 0
      ? `${missingProofEvidenceCount} missing proof-specific Evidence for mapping(s)`
      : null,
    missingEvidenceDetailCount > 0
      ? `${missingEvidenceDetailCount} missing or placeholder Evidence Details field(s)`
      : null,
    secretFindingCount > 0 ? `${secretFindingCount} blocked secret-scan finding(s)` : null,
    templateOnlyFindingCount > 0
      ? `${templateOnlyFindingCount} blocked template-only banner(s)`
      : null,
  ].filter((value): value is string => Boolean(value));
}

function buildNextAction({
  gate,
  missingArtifactCount,
  missingArtifactProofCount,
  missingEvidenceDetailCount,
  missingEnvCount,
  missingProofCount,
  missingProofEvidenceCount,
  secretFindingCount,
  templateOnlyFindingCount,
  unreadableArtifactCount,
  warningCount,
}: {
  gate: ExternalCompletionEvidenceGateInput;
  missingArtifactCount: number;
  missingArtifactProofCount: number;
  missingEvidenceDetailCount: number;
  missingEnvCount: number;
  missingProofCount: number;
  missingProofEvidenceCount: number;
  secretFindingCount: number;
  templateOnlyFindingCount: number;
  unreadableArtifactCount: number;
  warningCount: number;
}) {
  const scopedStatusCommand = `OGL_EXTERNAL_EVIDENCE_GATES=${gate.id} pnpm external:evidence:status`;
  const scopedTemplateCommand = `OGL_EXTERNAL_EVIDENCE_GATES=${gate.id} pnpm external:evidence:template`;
  const scopedPreflightCommand = `OGL_EXTERNAL_EVIDENCE_GATES=${gate.id} pnpm external:evidence:preflight`;

  if (missingEnvCount > 0) {
    return `Set ${missingEnvCount} non-placeholder environment value(s), then rerun ${scopedStatusCommand}.`;
  }
  if (missingArtifactCount > 0) {
    return `Create or refresh ${missingArtifactCount} external artifact file(s) with ${scopedTemplateCommand}.`;
  }
  if (unreadableArtifactCount > 0) {
    return `Make ${unreadableArtifactCount} artifact file(s) readable before filling proof rows or detail fields.`;
  }
  if (missingProofCount > 0 || missingArtifactProofCount > 0) {
    return `Capture real external proof, then check the assigned artifact row(s) only after evidence is attached.`;
  }
  if (missingProofEvidenceCount > 0) {
    return `Add proof-specific Evidence for mapping(s) with accepted run, dashboard, artifact, or sha256 locators.`;
  }
  if (missingEvidenceDetailCount > 0) {
    return `Fill ${missingEvidenceDetailCount} Evidence Captured or Gate-Specific Evidence detail field(s) with specific external locators.`;
  }
  if (secretFindingCount > 0) {
    return `Redact ${secretFindingCount} raw secret finding(s), then rerun ${scopedPreflightCommand}.`;
  }
  if (templateOnlyFindingCount > 0) {
    return `Remove template-only banner(s) from filled artifacts, then rerun ${scopedPreflightCommand}.`;
  }
  if (warningCount > 0) {
    return `Replace labels-only evidence with concrete artifact rows, env values, and checked proof mappings.`;
  }
  return `Run ${scopedPreflightCommand}, then use pnpm completion:gate:external at the release boundary.`;
}

function buildLabelOnlyWarnings({
  artifactEvidence,
  availableArtifactPaths,
  checkedProofs,
  envEvidence,
  gate,
  provenRequirements,
  readyEnv,
}: {
  artifactEvidence: Map<string, NormalizedExternalCompletionEvidenceArtifact>;
  availableArtifactPaths: Set<string>;
  checkedProofs: Set<string>;
  envEvidence: Map<string, string>;
  gate: ExternalCompletionEvidenceGateInput;
  provenRequirements: Set<string>;
  readyEnv: Set<string>;
}) {
  const envLabelsOnly = gate.requiredEnv.filter(
    (name) => readyEnv.has(name) && !envValueIsConfigured(name, envEvidence.get(name)),
  );
  const artifactLabelsOnly = gate.artifactPaths.filter((path) => {
    const artifact = artifactEvidence.get(path);
    return availableArtifactPaths.has(path) && !artifact?.readable;
  });
  const proofLabelsOnly = gate.proofRequirements.filter(
    (proof) => provenRequirements.has(proof) && !checkedProofs.has(proof),
  );

  return [
    envLabelsOnly.length > 0
      ? `Env label(s) are not evidence without non-placeholder values: ${envLabelsOnly.join(", ")}`
      : null,
    artifactLabelsOnly.length > 0
      ? `Artifact label(s) are not evidence until the artifact is readable: ${artifactLabelsOnly.join(
          ", ",
        )}`
      : null,
    proofLabelsOnly.length > 0
      ? `Proof label(s) are not evidence without checked artifact rows: ${proofLabelsOnly.join(
          " / ",
        )}`
      : null,
  ].filter((value): value is string => Boolean(value));
}
