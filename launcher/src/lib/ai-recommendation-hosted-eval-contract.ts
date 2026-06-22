import { createAiRecommendationEvidenceHash } from "./ai-recommendation-readiness";

export type AiRecommendationHostedEvalContractStatus = "blocked" | "pass" | "review";

export interface AiRecommendationHostedEvalContractInput {
  cloudProfileReplayReviewed: boolean;
  consentSampleReviewed: boolean;
  deterministicBaselineFixtureReady: boolean;
  hostedRunnerReviewed: boolean;
  promptRegressionSuiteReviewed: boolean;
  providerTelemetryReplayReviewed: boolean;
  qualityThresholdReviewReady: boolean;
  rolloutRollbackGateReviewed: boolean;
  safetyAbuseFixturesReviewed: boolean;
}

export interface AiRecommendationHostedEvalContractLane {
  detail: string;
  evidence: string;
  id: string;
  label: string;
  skipped: string;
  status: AiRecommendationHostedEvalContractStatus;
  surface: string;
}

export interface AiRecommendationHostedEvalNoWriteLedgerItem {
  detail: string;
  id: string;
  label: string;
  value: "blocked" | "none" | "skipped";
}

export interface AiRecommendationBlockedReplayEvidence {
  fixture: string;
  reason: string;
  replayId: string;
  status: "blocked";
  writes: "none";
}

export interface AiRecommendationRollbackReadinessEvidence {
  automaticRollout: "blocked";
  fallback: string;
  killSwitch: string;
  rollbackAction: "manual-review-only";
  staleResultPolicy: string;
}

export interface AiRecommendationHostedEvalEvidence {
  blockedProviderTelemetryReplay: AiRecommendationBlockedReplayEvidence;
  deterministicBaselineHash: string;
  noWriteLedger: AiRecommendationHostedEvalNoWriteLedgerItem[];
  promptRegressionSampleHash: string;
  rollbackReadiness: AiRecommendationRollbackReadinessEvidence;
}

export interface AiRecommendationHostedEvalContract {
  blockedCount: number;
  createdAt: string;
  evidence: AiRecommendationHostedEvalEvidence;
  guardCopy: string;
  guards: string[];
  lanes: AiRecommendationHostedEvalContractLane[];
  packetId: string;
  passCount: number;
  reviewCount: number;
  statusLabel: string;
  summary: string;
}

const AI_HOSTED_EVAL_GUARDS = [
  "Local eval fixtures only",
  "No model invocation",
  "No hosted inference",
  "No prompt upload",
  "No cloud profile replay",
  "No provider telemetry fetch",
  "No live A/B rollout",
  "No automatic launch action",
];

const AI_HOSTED_EVAL_GUARD_COPY =
  "AI hosted-eval contract review only. The launcher compares deterministic local baseline fixtures, prompt-regression cases, safety fixtures, quality thresholds, consent samples, and rollback gates; it does not call a model, does not upload prompts, does not run hosted inference, does not replay cloud profiles, does not fetch provider telemetry, and does not enable a rollout or launch automation.";

const AI_HOSTED_EVAL_BASELINE_SAMPLE = {
  baseline: "local-backlog-scorecard",
  candidateIds: ["mech-arcade", "phantom-drift", "tokyo-runner"],
  scoreSignals: ["achievement-bucket", "mood-tags", "session-fit", "local-feedback-bucket"],
  skipped: ["model-output", "cloud-profile", "provider-telemetry"],
};

const AI_HOSTED_EVAL_PROMPT_REGRESSION_SAMPLE = {
  expectedDeltas: ["no-secret-echo", "no-launch-automation", "baseline-drift<=10"],
  omittedFields: ["account email", "provider tokens", "friend identifiers"],
  redactedPrompt:
    "Rank local candidates from candidate ids, score signals, and [redacted-profile-placeholder].",
  safetyCases: ["secret-marker", "token-hint", "unsafe-launch"],
};

export function buildAiRecommendationHostedEvalContract(
  input: AiRecommendationHostedEvalContractInput,
): AiRecommendationHostedEvalContract {
  const lanes: AiRecommendationHostedEvalContractLane[] = [
    buildLane({
      detail:
        "Pins the deterministic local backlog scorer as the comparison baseline for future model-assisted rankings.",
      evidence: "baseline:local-backlog-scorecard+candidate-ids+score-signals",
      id: "deterministic-baseline-fixture",
      label: "Deterministic Baseline Fixture",
      skipped: "No model output compared",
      status: input.deterministicBaselineFixtureReady ? "pass" : "blocked",
      surface: "Baseline",
    }),
    buildLane({
      detail:
        "Reviews fixed prompt envelopes, redaction fields, and expected ranking deltas without sending prompts outside the app.",
      evidence: "prompts:redacted-envelope+omitted-fields+expected-deltas",
      id: "prompt-regression-suite",
      label: "Prompt Regression Suite",
      skipped: "No prompt upload or eval job",
      status: input.promptRegressionSuiteReviewed ? "review" : "blocked",
      surface: "Prompt Eval",
    }),
    buildLane({
      detail:
        "Stages minimum acceptance thresholds for explanation coverage, diversity, repeat suppression, and local baseline drift.",
      evidence: "thresholds:coverage>=95 diversity>=3 drift<=10 rollback-on-regression",
      id: "quality-threshold-review",
      label: "Quality Threshold Review",
      skipped: "No hosted metric read",
      status: input.qualityThresholdReviewReady ? "review" : "blocked",
      surface: "Quality Gate",
    }),
    buildLane({
      detail:
        "Covers age-inappropriate text, leaked secret markers, provider-token hints, harassment terms, and unsafe launch automation requests.",
      evidence: "safety:secret-marker+token-hint+unsafe-launch+harassment-fixtures",
      id: "safety-abuse-fixtures",
      label: "Safety/Abuse Fixtures",
      skipped: "No abuse classifier request",
      status: input.safetyAbuseFixturesReviewed ? "review" : "blocked",
      surface: "Safety",
    }),
    buildLane({
      detail:
        "Checks consent labels, user-visible explanation review, local reset/export, and audit envelope shape before any hosted profile work.",
      evidence: "consent:label+audit-id+reset-export+explanation-review",
      id: "consent-sample-review",
      label: "Consent Sample Review",
      skipped: "No consented cloud profile write",
      status: input.consentSampleReviewed ? "review" : "blocked",
      surface: "Consent",
    }),
    buildLane({
      detail:
        "Defines the future service boundary for server-side eval jobs, idempotency, timeout labels, and secret-free result summaries.",
      evidence: "runner:job-idempotency+timeout-labels+secret-free-summary",
      id: "hosted-runner-handshake",
      label: "Hosted Runner Handshake",
      skipped: "No hosted runner request",
      status: input.hostedRunnerReviewed ? "review" : "blocked",
      surface: "Hosted Runner",
    }),
    buildLane({
      detail:
        "Reviews cloud-profile replay as a future artifact contract only; local fixtures use anonymized preference buckets.",
      evidence: "profile:anonymous-buckets+retention-delete-export-required",
      id: "cloud-profile-replay",
      label: "Cloud Profile Replay",
      skipped: "Cloud profile replay blocked",
      status: input.cloudProfileReplayReviewed ? "review" : "blocked",
      surface: "Cloud Profile",
    }),
    buildLane({
      detail:
        "Documents future provider telemetry replay inputs for owned games and recent play without fetching provider data.",
      evidence: "telemetry:owned-game-count+recent-play-bucket+freshness-label",
      id: "provider-telemetry-replay",
      label: "Provider Telemetry Replay",
      skipped: "No provider telemetry request",
      status: input.providerTelemetryReplayReviewed ? "review" : "blocked",
      surface: "Provider Replay",
    }),
    buildLane({
      detail:
        "Stages kill-switch, rollback threshold, stale-result handling, and manual Play Next fallback before any ranking rollout.",
      evidence: "rollout:kill-switch+rollback-threshold+stale-result+manual-fallback",
      id: "rollout-rollback-gate",
      label: "Rollout/Rollback Gate",
      skipped: "No A/B traffic or launch automation",
      status: input.rolloutRollbackGateReviewed ? "review" : "blocked",
      surface: "Rollout",
    }),
  ];
  const passCount = lanes.filter((lane) => lane.status === "pass").length;
  const reviewCount = lanes.filter((lane) => lane.status === "review").length;
  const blockedCount = lanes.filter((lane) => lane.status === "blocked").length;

  return {
    blockedCount,
    createdAt: "2026-06-16T00:00:00.000Z",
    evidence: createAiRecommendationHostedEvalEvidence(),
    guardCopy: AI_HOSTED_EVAL_GUARD_COPY,
    guards: [...AI_HOSTED_EVAL_GUARDS],
    lanes,
    packetId: "ai-hosted-eval-contract-local-001",
    passCount,
    reviewCount,
    statusLabel: blockedCount > 0 ? "Local eval contract" : "Needs hosted staging",
    summary:
      blockedCount > 0
        ? "AI hosted-eval contract is reviewed locally with deterministic baseline, prompt-regression, safety, consent, runner, profile, telemetry, and rollback lanes while model execution, prompt upload, hosted inference, cloud replay, provider telemetry, and rollout remain blocked."
        : "AI hosted-eval contract lanes are reviewed locally; hosted staging still needs real service execution, external eval artifacts, privacy approval, and rollout evidence.",
  };
}

export function createVerifyAiRecommendationHostedEvalContract(): AiRecommendationHostedEvalContract {
  return buildAiRecommendationHostedEvalContract({
    cloudProfileReplayReviewed: false,
    consentSampleReviewed: false,
    deterministicBaselineFixtureReady: true,
    hostedRunnerReviewed: false,
    promptRegressionSuiteReviewed: true,
    providerTelemetryReplayReviewed: false,
    qualityThresholdReviewReady: true,
    rolloutRollbackGateReviewed: true,
    safetyAbuseFixturesReviewed: true,
  });
}

function createAiRecommendationHostedEvalEvidence(): AiRecommendationHostedEvalEvidence {
  return {
    blockedProviderTelemetryReplay: {
      fixture: "owned-game-count+recent-play-bucket+freshness-label",
      reason:
        "Replay stays fixture-only until provider consent, rate limit, and bridge trust are reviewed.",
      replayId: "provider-telemetry-replay-local-block-001",
      status: "blocked",
      writes: "none",
    },
    deterministicBaselineHash: createAiRecommendationEvidenceHash(AI_HOSTED_EVAL_BASELINE_SAMPLE),
    noWriteLedger: [
      {
        detail: "Baseline comparison uses local score fixtures only.",
        id: "model-invocation",
        label: "Model Invocation",
        value: "skipped",
      },
      {
        detail: "Redacted prompt cases remain local strings and hashes.",
        id: "prompt-upload",
        label: "Prompt Upload",
        value: "none",
      },
      {
        detail: "No eval job, inference request, or result queue is created.",
        id: "hosted-inference",
        label: "Hosted Inference",
        value: "none",
      },
      {
        detail: "Anonymous buckets are documented without external profile replay.",
        id: "profile-replay",
        label: "Profile Replay",
        value: "blocked",
      },
      {
        detail: "Owned-game and recent-play shapes stay fixture-only.",
        id: "provider-telemetry",
        label: "Provider Telemetry",
        value: "blocked",
      },
      {
        detail: "No traffic split, cohort write, ranking sync, or launch queue mutation occurs.",
        id: "rollout-traffic",
        label: "Rollout Traffic",
        value: "blocked",
      },
    ],
    promptRegressionSampleHash: createAiRecommendationEvidenceHash(
      AI_HOSTED_EVAL_PROMPT_REGRESSION_SAMPLE,
    ),
    rollbackReadiness: {
      automaticRollout: "blocked",
      fallback: "manual Play Next queue",
      killSwitch: "local review flag only",
      rollbackAction: "manual-review-only",
      staleResultPolicy: "discard hosted result until external eval artifacts exist",
    },
  };
}

function buildLane(
  lane: AiRecommendationHostedEvalContractLane,
): AiRecommendationHostedEvalContractLane {
  return lane;
}
