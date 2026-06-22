export type AiRecommendationReadinessStatus = "blocked" | "ready" | "warning";
export type AiRecommendationConsentAuditStatus = "pass" | "review";

export interface AiRecommendationConsentAuditReviewRow {
  detail: string;
  id: string;
  label: string;
  status: AiRecommendationConsentAuditStatus;
}

export interface AiRecommendationConsentAuditLedgerItem {
  detail: string;
  id: string;
  label: string;
  value: "blocked" | "none" | "skipped";
}

export interface AiRecommendationConsentAuditEvidence {
  blockedSinks: string[];
  deterministicSampleHash: string;
  noWriteLedger: AiRecommendationConsentAuditLedgerItem[];
  redactedFieldCount: number;
  retainedFields: string[];
}

export interface AiRecommendationConsentAuditPacket {
  auditId: string;
  consentStateLabel: string;
  createdAt: string;
  evidence: AiRecommendationConsentAuditEvidence;
  guards: string[];
  packetId: string;
  promptEnvelope: {
    modelCall: "skipped";
    omittedFields: string[];
    redactedPrompt: string;
    sampleHash: string;
    writes: "none";
  };
  reviewRows: AiRecommendationConsentAuditReviewRow[];
  summary: string;
}

export interface AiRecommendationReadinessInput {
  cloudProfileReady: boolean;
  consentAuditPacket?: AiRecommendationConsentAuditPacket;
  consentAuditReady: boolean;
  hostedEvalReady: boolean;
  learnedProfileReady: boolean;
  localBacklogScoringReady: boolean;
  localExplanationReviewReady: boolean;
  modelGatewayReady: boolean;
  providerTelemetryReady: boolean;
}

export interface AiRecommendationReadinessGate {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: AiRecommendationReadinessStatus;
}

export interface AiRecommendationReadiness {
  blockedCount: number;
  consentAuditPacket?: AiRecommendationConsentAuditPacket;
  gates: AiRecommendationReadinessGate[];
  guardCopy: string;
  guards: string[];
  nextAction: string;
  progress: number;
  readyCount: number;
  statusLabel: string;
  summary: string;
  warningCount: number;
}

const AI_RECOMMENDATION_GUARDS = [
  "Local scoring only",
  "Local explanation packet",
  "Local consent/audit packet",
  "Browser-local learning only",
  "No real model call",
  "No hosted inference",
  "No cloud personalization",
  "No provider telemetry fetch",
  "No hosted learned profile",
  "No provider ranking sync",
];

const AI_RECOMMENDATION_GUARD_COPY =
  "Local AI recommendation readiness only. This panel reviews hosted/model gates from deterministic launcher state, browser-local learning feedback, local explanation packets, and a local consent/audit packet; it does not call an AI model, run hosted inference, upload personalization data, train hosted profiles, fetch provider telemetry, or sync provider rankings.";

const AI_RECOMMENDATION_CONSENT_AUDIT_GUARDS = [
  "No model prompt sent",
  "No hosted inference write",
  "No cloud profile sync",
  "No provider telemetry export",
  "Redacted local prompt envelope",
  "Browser-local reset/export review",
];

const AI_RECOMMENDATION_OMITTED_FIELDS = [
  "account email",
  "provider tokens",
  "raw play session notes",
  "friend identifiers",
];

const AI_RECOMMENDATION_RETAINED_FIELDS = [
  "candidate ids",
  "score signals",
  "mood tags",
  "session fit bucket",
  "local feedback buckets",
];

const AI_RECOMMENDATION_REDACTED_PROMPT =
  "Recommend from local backlog using candidate ids, score signals, mood tags, session fit, and [redacted-profile-placeholder].";

const AI_RECOMMENDATION_CONSENT_AUDIT_SAMPLE = {
  candidateIds: ["mech-arcade", "phantom-drift", "tokyo-runner"],
  localSignals: {
    achievementBucket: "partial",
    localFeedbackBucket: "browser-local",
    playtimeBucket: "under-2h",
    sessionFit: "45m",
  },
  omittedFields: AI_RECOMMENDATION_OMITTED_FIELDS,
  redactedPrompt: AI_RECOMMENDATION_REDACTED_PROMPT,
  retainedFields: AI_RECOMMENDATION_RETAINED_FIELDS,
  writes: "none",
};

export function createAiRecommendationEvidenceHash(value: unknown): string {
  const serialized = stableSerializeAiRecommendationEvidence(value);
  let hash = 0x811c9dc5;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

export function createVerifyAiRecommendationConsentAuditPacket(): AiRecommendationConsentAuditPacket {
  const deterministicSampleHash = createAiRecommendationEvidenceHash(
    AI_RECOMMENDATION_CONSENT_AUDIT_SAMPLE,
  );

  return {
    auditId: "audit-local-ai-rec-001",
    consentStateLabel: "Local Review Only",
    createdAt: "2026-06-16T00:00:00.000Z",
    evidence: {
      blockedSinks: [
        "model gateway request",
        "hosted inference job",
        "cloud personalization row",
        "provider telemetry export",
        "provider ranking sync",
      ],
      deterministicSampleHash,
      noWriteLedger: [
        {
          detail: "Prompt remains a browser-local redacted review envelope.",
          id: "model-gateway",
          label: "Model Gateway",
          value: "skipped",
        },
        {
          detail: "No hosted eval, inference, queue, or result row is created.",
          id: "hosted-inference",
          label: "Hosted Inference",
          value: "none",
        },
        {
          detail: "No preference vector, learned profile, or RLS row is written.",
          id: "cloud-personalization",
          label: "Cloud Personalization",
          value: "none",
        },
        {
          detail: "Provider-shaped signals are blocked from export or replay.",
          id: "provider-telemetry",
          label: "Provider Telemetry",
          value: "blocked",
        },
        {
          detail: "No rollout cohort, provider ranking, or launch queue mutation occurs.",
          id: "rollout",
          label: "Rollout",
          value: "blocked",
        },
      ],
      redactedFieldCount: AI_RECOMMENDATION_OMITTED_FIELDS.length,
      retainedFields: AI_RECOMMENDATION_RETAINED_FIELDS,
    },
    guards: [...AI_RECOMMENDATION_CONSENT_AUDIT_GUARDS],
    packetId: "ai-consent-local-2026-06-16",
    promptEnvelope: {
      modelCall: "skipped",
      omittedFields: AI_RECOMMENDATION_OMITTED_FIELDS,
      redactedPrompt: AI_RECOMMENDATION_REDACTED_PROMPT,
      sampleHash: deterministicSampleHash,
      writes: "none",
    },
    reviewRows: [
      {
        detail:
          "Prompt envelope is deterministic and redacts account, token, friend, and raw session fields before any hosted gateway work.",
        id: "prompt-redaction",
        label: "Prompt Redaction",
        status: "pass",
      },
      {
        detail:
          "Inputs stay limited to installed/download-ready games, local tags, achievements, playtime buckets, session fit, and browser-local feedback.",
        id: "local-inputs",
        label: "Local Input Scope",
        status: "pass",
      },
      {
        detail:
          "writes: none; no prompt, ranking, preference profile, or provider telemetry leaves the browser-local review path.",
        id: "write-scope",
        label: "Write Scope",
        status: "pass",
      },
      {
        detail:
          "Browser-local feedback can be reset and inspected; hosted retention/delete/export remains blocked until a cloud profile exists.",
        id: "retention-delete-export",
        label: "Retention/Delete/Export",
        status: "review",
      },
      {
        detail:
          "Manual Play Next queue keeps launch automation disabled; hosted rollout still needs eval and rollback proof.",
        id: "rollback",
        label: "Rollback Path",
        status: "review",
      },
    ],
    summary:
      "Consent and audit evidence is staged as a local review packet with redacted prompt shape, no writes, no model call, and no provider export.",
  };
}

export function buildAiRecommendationReadiness(
  input: AiRecommendationReadinessInput,
): AiRecommendationReadiness {
  const gates: AiRecommendationReadinessGate[] = [
    {
      action: input.localBacklogScoringReady
        ? "Keep deterministic backlog scoring as the local baseline."
        : "Restore local backlog candidate scoring before model staging.",
      detail: input.localBacklogScoringReady
        ? "Installed/download-ready games, achievements, mood tags, playtime, and local friend-count signals can be ranked locally."
        : "No local backlog scoring evidence is available.",
      id: "local-backlog-scoring",
      label: "Local Scorer",
      status: input.localBacklogScoringReady ? "ready" : "blocked",
    },
    {
      action: input.localBacklogScoringReady
        ? "Use the local ranker output as the comparison set for future model tests."
        : "Define a deterministic ranker fixture before cloud recommendation work.",
      detail: input.localBacklogScoringReady
        ? "The current planner has deterministic screenshot candidates and regression tests."
        : "No deterministic recommendation fixture is staged.",
      id: "deterministic-ranker",
      label: "Data Minimization",
      status: input.localBacklogScoringReady ? "ready" : "blocked",
    },
    {
      action: input.localExplanationReviewReady
        ? "Keep the explanation packet attached to every local pick before model staging."
        : "Expose score signals, input evidence, and skipped model steps for each local pick.",
      detail: input.localExplanationReviewReady
        ? "The local ranker exposes score signals, candidate inputs, and skipped model/cloud steps without persisting or syncing a ranking."
        : "No deterministic recommendation explanation packet is visible yet.",
      id: "local-explanation-review",
      label: "Explanation Review",
      status: input.localExplanationReviewReady ? "ready" : "blocked",
    },
    {
      action: input.modelGatewayReady
        ? "Keep model output in review-only mode until evals and consent pass."
        : "Stage a hosted model gateway with redacted prompts and no client-side API key.",
      detail: input.modelGatewayReady
        ? "Model gateway evidence exists, but live recommendations remain disabled."
        : "No hosted model gateway, prompt envelope, or redaction path is staged.",
      id: "model-gateway",
      label: "Hosted Model Config",
      status: input.modelGatewayReady ? "warning" : "blocked",
    },
    {
      action: input.cloudProfileReady
        ? "Keep cloud personalization behind account privacy review."
        : "Stage a cloud profile vector with privacy scope, retention, and delete/export coverage.",
      detail: input.cloudProfileReady
        ? "Cloud personalization evidence exists, but profile ranking remains disabled."
        : "No cloud personalization profile is staged for recommendations.",
      id: "cloud-profile",
      label: "Cloud Profile Storage/RLS",
      status: input.cloudProfileReady ? "warning" : "blocked",
    },
    {
      action: input.providerTelemetryReady
        ? "Keep provider telemetry as aggregated evidence until bridge trust is proven."
        : "Stage provider telemetry contracts for owned games, recent play, and entitlement freshness.",
      detail: input.providerTelemetryReady
        ? "Provider telemetry evidence exists, but live provider ranking remains disabled."
        : "No live provider telemetry fetch or sync path is staged.",
      id: "provider-telemetry",
      label: "Provider Telemetry Contract",
      status: input.providerTelemetryReady ? "warning" : "blocked",
    },
    {
      action: input.learnedProfileReady
        ? "Keep browser-local learning inspectable and resettable before hosted profile work."
        : "Stage browser-local learning with inspect, reset, export, and opt-out controls.",
      detail: input.learnedProfileReady
        ? "Local feedback can tune mood, session, and social weights without account sync."
        : "No browser-local user-profile learning or reset workflow is staged.",
      id: "learned-profile",
      label: "Learned Profile Ranking",
      status: input.learnedProfileReady ? "ready" : "blocked",
    },
    {
      action: input.consentAuditReady
        ? "Keep consent/audit evidence attached to every model-assisted pick."
        : "Stage consent, audit trail, prompt redaction, and recommendation explanation review.",
      detail: input.consentAuditReady
        ? "Consent/audit evidence exists, but model-assisted ranking remains disabled."
        : "No model consent, prompt audit, or user-facing explanation review is staged.",
      id: "consent-audit",
      label: "Consent Boundary",
      status: input.consentAuditReady ? "warning" : "blocked",
    },
    {
      action: input.hostedEvalReady
        ? "Keep hosted evals passing before any model-assisted recommendation rollout."
        : "Stage prompt evals, regression fixtures, abuse tests, and rollout metrics.",
      detail: input.hostedEvalReady
        ? "Hosted eval evidence exists, but live model rollout remains disabled."
        : "No hosted prompt/eval run is staged for recommendation quality.",
      id: "hosted-eval",
      label: "Evaluation/Audit/Rollback",
      status: input.hostedEvalReady ? "warning" : "blocked",
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
    consentAuditPacket: input.consentAuditPacket,
    gates,
    guardCopy: AI_RECOMMENDATION_GUARD_COPY,
    guards: [...AI_RECOMMENDATION_GUARDS],
    nextAction: nextGate?.action ?? "AI recommendation gates can enter controlled staging.",
    progress: Math.round((readyCount / gates.length) * 100),
    readyCount,
    statusLabel:
      blockedCount > 0 ? "Local only" : warningCount > 0 ? "Needs staging" : "Review ready",
    summary:
      blockedCount > 0
        ? "AI Recommendations now include deterministic backlog scoring, local explanation packets, browser-local learning, and a review-only consent/audit packet; model calls, hosted inference, cloud personalization, provider telemetry, and hosted evals remain open."
        : warningCount > 0
          ? "AI recommendation staging evidence exists, but live model-assisted ranking still needs review."
          : "AI recommendation rollout can enter controlled staging.",
    warningCount,
  };
}

export function createVerifyAiRecommendationReadiness(): AiRecommendationReadiness {
  const consentAuditPacket = createVerifyAiRecommendationConsentAuditPacket();

  return buildAiRecommendationReadiness({
    cloudProfileReady: false,
    consentAuditPacket,
    consentAuditReady: true,
    hostedEvalReady: false,
    learnedProfileReady: true,
    localBacklogScoringReady: true,
    localExplanationReviewReady: true,
    modelGatewayReady: false,
    providerTelemetryReady: false,
  });
}

function stableSerializeAiRecommendationEvidence(value: unknown): string {
  if (value === undefined) return '"[undefined]"';
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeAiRecommendationEvidence(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return `{${entries
    .map(
      ([key, entryValue]) =>
        `${JSON.stringify(key)}:${stableSerializeAiRecommendationEvidence(entryValue)}`,
    )
    .join(",")}}`;
}
