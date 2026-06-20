export type HostedControllerLayoutStatus = "blocked" | "ready" | "warning";

export interface HostedControllerLayoutReadinessInput {
  consentRollbackEvidence?: HostedControllerLayoutConsentRollbackEvidence | null;
  consentRollbackEvidenceReady: boolean;
  editorApprovedFeedStagingReady: boolean;
  hostedDownloadsReady: boolean;
  localGalleryReady: boolean;
  localImportReady: boolean;
  moderationQueueReady: boolean;
  rlsVerified: boolean;
  supabaseConfigured: boolean;
  votingReady: boolean;
}

export interface HostedControllerLayoutConsentRollbackEvidence {
  consentLabel: string;
  disableSwitchLabel: string;
  productionRolloutBlocked: boolean;
  rollbackSteps: string[];
  rolloutGuard: string;
  storageScope: string;
}

export interface HostedControllerLayoutGate {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: HostedControllerLayoutStatus;
}

export interface HostedControllerLayoutRolloutBlocker {
  detail: string;
  id: string;
  label: string;
}

export interface HostedControllerLayoutReadiness {
  blockedCount: number;
  consentRollbackEvidence: HostedControllerLayoutConsentRollbackEvidence | null;
  gates: HostedControllerLayoutGate[];
  guardCopy: string;
  guards: string[];
  nextAction: string;
  progress: number;
  readyCount: number;
  rolloutBlockedCount: number;
  rolloutBlockers: HostedControllerLayoutRolloutBlocker[];
  statusLabel: string;
  summary: string;
  warningCount: number;
}

const HOSTED_LAYOUT_GUARDS = [
  "Approved hosted layouts only",
  "One-user vote RPC",
  "Editor approved-feed staging",
  "Report-backed moderation queue",
  "Profile consent/rollback evidence only",
  "No production/community rollout claim",
];

const HOSTED_LAYOUT_GUARD_COPY =
  "Hosted Controller Layouts stages approved-feed listing, editor approved-feed staging, hosted import/download counters, one-user vote persistence, report-backed moderation actions, ranking order, service-role review gates, local fallback import, profile consent evidence, rollback evidence, and audit evidence. These are review gates only; they do not enable production/community rollout, marketplace publish, or live/automatic profile cloud sync.";

const HOSTED_LAYOUT_ROLLOUT_BLOCKERS: HostedControllerLayoutRolloutBlocker[] = [
  {
    detail:
      "No production/community rollout proof exists; staged review must sign off before public launch.",
    id: "production-community-rollout",
    label: "Production/Community Rollout",
  },
  {
    detail:
      "No marketplace publish path or public catalog promotion is enabled for hosted layouts.",
    id: "marketplace-publish",
    label: "Marketplace Publish",
  },
  {
    detail:
      "Automatic/live profile cloud sync remains off; only opt-in consent and rollback evidence is staged.",
    id: "live-profile-sync",
    label: "Live Profile Cloud Sync",
  },
];

export function createHostedControllerLayoutConsentRollbackEvidence(): HostedControllerLayoutConsentRollbackEvidence {
  return {
    consentLabel:
      "Explicit profile consent required before the hosted-layout profile path leaves review.",
    disableSwitchLabel: "Disable the staged hosted-layout profile path and keep local fallback.",
    productionRolloutBlocked: true,
    rollbackSteps: [
      "Keep local editable layouts as source of truth until profile consent review passes.",
      "Disable the staged hosted-layout profile path without deleting local drafts or imported presets.",
      "Replay local fallback after hosted vote, download, report, or profile-review errors.",
    ],
    rolloutGuard: "Production/community rollout stays blocked until staged review signs off.",
    storageScope: "Profile-scoped review evidence only; no live or automatic profile cloud sync.",
  };
}

export function isHostedControllerLayoutConsentRollbackEvidenceReady(
  evidence: HostedControllerLayoutConsentRollbackEvidence | null | undefined,
): evidence is HostedControllerLayoutConsentRollbackEvidence {
  return Boolean(
    evidence?.consentLabel.trim() &&
    evidence.disableSwitchLabel.trim() &&
    evidence.rolloutGuard.trim() &&
    evidence.storageScope.trim() &&
    evidence.rollbackSteps.length >= 3 &&
    evidence.rollbackSteps.every((step) => step.trim().length > 0) &&
    evidence.productionRolloutBlocked,
  );
}

export function buildHostedControllerLayoutReadiness(
  input: HostedControllerLayoutReadinessInput,
): HostedControllerLayoutReadiness {
  const consentRollbackEvidence =
    input.consentRollbackEvidenceReady &&
    isHostedControllerLayoutConsentRollbackEvidenceReady(input.consentRollbackEvidence)
      ? input.consentRollbackEvidence
      : null;
  const consentRollbackReady = Boolean(consentRollbackEvidence);
  const gates: HostedControllerLayoutGate[] = [
    {
      action: input.localGalleryReady
        ? "Keep seed layouts labeled as local import candidates."
        : "Restore the local community layout gallery before hosted review.",
      detail: input.localGalleryReady
        ? "Seeded community layout cards are visible without network access."
        : "No local gallery evidence is available for hosted-layout staging.",
      id: "local-gallery",
      label: "Local Gallery",
      status: input.localGalleryReady ? "ready" : "blocked",
    },
    {
      action: input.localImportReady
        ? "Continue importing presets into the editable local cache."
        : "Wire local import into the controller layout cache first.",
      detail: input.localImportReady
        ? "Import keeps presets local and editable before any cloud sharing."
        : "Hosted sharing needs a local import fallback before rollout.",
      id: "local-import",
      label: "Local Import",
      status: input.localImportReady ? "ready" : "blocked",
    },
    {
      action: input.editorApprovedFeedStagingReady
        ? "Keep approved hosted rows staged in the editor gallery with local fallback available."
        : "Wire the editor gallery to the approved hosted feed and hosted actions.",
      detail: input.editorApprovedFeedStagingReady
        ? "The editor can load approved hosted layouts and route hosted import, vote, download, and report actions through scoped RPC helpers."
        : "The editor still renders only static local seeds instead of the approved hosted feed.",
      id: "editor-approved-feed-staging",
      label: "Editor Approved-Feed Staging",
      status: input.editorApprovedFeedStagingReady ? "ready" : "blocked",
    },
    {
      action:
        input.supabaseConfigured && input.rlsVerified
          ? "Keep community layout reads approved-only and owner writes protected by RLS."
          : "Verify controller layout RLS, ownership, and read scopes.",
      detail:
        input.supabaseConfigured && input.rlsVerified
          ? "The hosted contract adds approved-only community reads, owner-safe writes, vote/report tables, and service-role moderation audit rows."
          : "Hosted layout schema/RLS has not been verified for public community rows.",
      id: "schema-rls",
      label: "Schema + RLS",
      status: input.supabaseConfigured && input.rlsVerified ? "ready" : "blocked",
    },
    {
      action: input.votingReady
        ? "Use the hosted vote RPC for signed-in users and keep one vote per layout/user."
        : "Define vote table, one-user vote policy, and abuse limits.",
      detail: input.votingReady
        ? "The vote RPC upserts/removes authenticated votes, blocks author self-votes, refreshes vote_score, and the approved feed sorts by score/downloads."
        : "No hosted vote persistence or ranking policy is staged.",
      id: "voting",
      label: "Votes + Ranking",
      status: input.votingReady ? "ready" : "blocked",
    },
    {
      action: input.hostedDownloadsReady
        ? "Count hosted preset imports through the scoped approved-layout download RPC."
        : "Add scoped hosted preset download contract and integrity checks.",
      detail: input.hostedDownloadsReady
        ? "Approved community layouts can increment download_count without exposing rejected or pending presets."
        : "No hosted preset download, integrity, or provenance path is staged.",
      id: "downloads",
      label: "Hosted Downloads",
      status: input.hostedDownloadsReady ? "ready" : "blocked",
    },
    {
      action: input.moderationQueueReady
        ? "Keep report thresholds, service-role queue review, and audit rows staged before rollout."
        : "Create moderation, report, takedown, and developer audit gates.",
      detail: input.moderationQueueReady
        ? "Reports are one-per-user, three active reports return a layout to pending review, and service-role review writes audit evidence."
        : "No hosted moderation queue or report workflow is staged.",
      id: "moderation",
      label: "Moderation",
      status: input.moderationQueueReady ? "ready" : "blocked",
    },
    {
      action: consentRollbackReady
        ? "Keep consent and rollback evidence review-only; do not enable live profile sync."
        : "Stage profile consent, rollback, and rollout gates before production/community rollout.",
      detail: consentRollbackReady
        ? "Consent, disable switch, rollback, and production/community rollout guard evidence are staged; live/automatic profile sync remains off."
        : "No opt-in consent, disable switch, or rollback evidence exists.",
      id: "consent-rollback-evidence",
      label: "Consent/Rollback Evidence",
      status: consentRollbackReady ? "ready" : "warning",
    },
  ];
  const readyCount = gates.filter((gate) => gate.status === "ready").length;
  const warningCount = gates.filter((gate) => gate.status === "warning").length;
  const blockedCount = gates.filter((gate) => gate.status === "blocked").length;
  const nextGate =
    gates.find((gate) => gate.status === "blocked") ??
    gates.find((gate) => gate.status === "warning") ??
    null;

  return {
    blockedCount,
    consentRollbackEvidence,
    gates,
    guardCopy: HOSTED_LAYOUT_GUARD_COPY,
    guards: [...HOSTED_LAYOUT_GUARDS],
    nextAction:
      nextGate?.action ??
      "Hosted controller layout review gates are ready; keep rollout, marketplace, and live profile sync blocked.",
    progress: Math.round((readyCount / gates.length) * 100),
    readyCount,
    rolloutBlockedCount: HOSTED_LAYOUT_ROLLOUT_BLOCKERS.length,
    rolloutBlockers: [...HOSTED_LAYOUT_ROLLOUT_BLOCKERS],
    statusLabel:
      blockedCount > 0 ? "Local only" : warningCount > 0 ? "Hosted staging" : "Staged review ready",
    summary:
      blockedCount > 0
        ? "Hosted Controller Layouts are still local import/readiness evidence; community cloud features remain open."
        : warningCount > 0
          ? "Hosted Controller Layouts now have schema/RLS, approved feed, editor approved-feed staging, hosted import/download actions, vote persistence, report moderation, ranking sync, and audit evidence staged; profile consent/rollback remains open."
          : "Hosted Controller Layouts have 8 staged review gates ready with approved feed, editor approved-feed staging, and profile consent/rollback evidence; rollout, marketplace, and live profile sync lanes remain blocked.",
    warningCount,
  };
}

export function createVerifyHostedControllerLayoutReadiness(): HostedControllerLayoutReadiness {
  return buildHostedControllerLayoutReadiness({
    consentRollbackEvidence: createHostedControllerLayoutConsentRollbackEvidence(),
    consentRollbackEvidenceReady: true,
    editorApprovedFeedStagingReady: true,
    hostedDownloadsReady: true,
    localGalleryReady: true,
    localImportReady: true,
    moderationQueueReady: true,
    rlsVerified: true,
    supabaseConfigured: true,
    votingReady: true,
  });
}
