import { describe, expect, it } from "vitest";

import {
  buildAiRecommendationHostedEvalContract,
  createVerifyAiRecommendationHostedEvalContract,
} from "../ai-recommendation-hosted-eval-contract";

const falseHostedEvalClaim =
  /\b(?:model|llm|inference)\s+(?:called|sent|served|connected|ready|enabled|active|live|passed)\b|\bhosted\s+(?:model|inference|eval)\s+(?:ready|enabled|connected|active|live|passed)\b|\bcloud\s+(?:profile|personalization)\s+(?:read|replayed|synced|trained|active|live)\b|\bprovider\s+telemetry\s+(?:fetched|synced|verified|live)\b|\b(?:rollout|ab test|a\/b)\s+(?:enabled|live|running)\b/i;

describe("buildAiRecommendationHostedEvalContract", () => {
  it("stages local hosted-eval fixtures without model, cloud, provider, or rollout claims", () => {
    const contract = createVerifyAiRecommendationHostedEvalContract();

    expect(contract.statusLabel).toBe("Local eval contract");
    expect(contract.passCount).toBe(1);
    expect(contract.reviewCount).toBe(4);
    expect(contract.blockedCount).toBe(4);
    expect(contract.guards).toContain("Local eval fixtures only");
    expect(contract.guards).toContain("No model invocation");
    expect(contract.guards).toContain("No hosted inference");
    expect(contract.guards).toContain("No prompt upload");
    expect(contract.guards).toContain("No cloud profile replay");
    expect(contract.guards).toContain("No provider telemetry fetch");
    expect(contract.guards).toContain("No live A/B rollout");
    expect(contract.guards).toContain("No automatic launch action");
    expect(contract.guardCopy).toContain("does not call a model");
    expect(contract.guardCopy).toContain("does not upload prompts");
    expect(contract.summary).not.toMatch(falseHostedEvalClaim);
    expect(contract.evidence.deterministicBaselineHash).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    expect(contract.evidence.promptRegressionSampleHash).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    expect(contract.evidence.blockedProviderTelemetryReplay).toMatchObject({
      replayId: "provider-telemetry-replay-local-block-001",
      status: "blocked",
      writes: "none",
    });
    expect(contract.evidence.rollbackReadiness).toMatchObject({
      automaticRollout: "blocked",
      fallback: "manual Play Next queue",
      rollbackAction: "manual-review-only",
    });
    expect(contract.evidence.noWriteLedger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "model-invocation", value: "skipped" }),
        expect.objectContaining({ id: "prompt-upload", value: "none" }),
        expect.objectContaining({ id: "provider-telemetry", value: "blocked" }),
        expect.objectContaining({ id: "rollout-traffic", value: "blocked" }),
      ]),
    );
    expect(JSON.stringify(contract.evidence)).not.toMatch(falseHostedEvalClaim);
    expect(contract.lanes.map((lane) => lane.id)).toEqual([
      "deterministic-baseline-fixture",
      "prompt-regression-suite",
      "quality-threshold-review",
      "safety-abuse-fixtures",
      "consent-sample-review",
      "hosted-runner-handshake",
      "cloud-profile-replay",
      "provider-telemetry-replay",
      "rollout-rollback-gate",
    ]);
    expect(contract.lanes.find((lane) => lane.id === "hosted-runner-handshake")).toMatchObject({
      label: "Hosted Runner Handshake",
      status: "blocked",
    });
    expect(contract.lanes.find((lane) => lane.id === "rollout-rollback-gate")).toMatchObject({
      label: "Rollout/Rollback Gate",
      status: "review",
    });
  });

  it("keeps hosted eval in staging even when all evidence lanes are reviewed", () => {
    const contract = buildAiRecommendationHostedEvalContract({
      cloudProfileReplayReviewed: true,
      consentSampleReviewed: true,
      deterministicBaselineFixtureReady: true,
      hostedRunnerReviewed: true,
      promptRegressionSuiteReviewed: true,
      providerTelemetryReplayReviewed: true,
      qualityThresholdReviewReady: true,
      rolloutRollbackGateReviewed: true,
      safetyAbuseFixturesReviewed: true,
    });

    expect(contract.blockedCount).toBe(0);
    expect(contract.passCount).toBe(1);
    expect(contract.reviewCount).toBe(8);
    expect(contract.statusLabel).toBe("Needs hosted staging");
    expect(contract.guardCopy).toContain("does not enable a rollout");
    expect(contract.summary).toContain("reviewed locally");
    expect(contract.summary).not.toMatch(falseHostedEvalClaim);
  });
});
