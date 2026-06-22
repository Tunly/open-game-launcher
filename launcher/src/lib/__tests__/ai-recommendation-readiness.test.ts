import { describe, expect, it } from "vitest";

import {
  buildAiRecommendationReadiness,
  createAiRecommendationEvidenceHash,
  createVerifyAiRecommendationConsentAuditPacket,
  createVerifyAiRecommendationReadiness,
} from "../ai-recommendation-readiness";

describe("buildAiRecommendationReadiness", () => {
  it("keeps AI recommendations local without hosted model, cloud, or telemetry claims", () => {
    const readiness = createVerifyAiRecommendationReadiness();

    expect(readiness.statusLabel).toBe("Local only");
    expect(readiness.readyCount).toBe(4);
    expect(readiness.warningCount).toBe(1);
    expect(readiness.blockedCount).toBe(4);
    expect(readiness.guards).toContain("Local scoring only");
    expect(readiness.guards).toContain("Local explanation packet");
    expect(readiness.guards).toContain("Local consent/audit packet");
    expect(readiness.guards).toContain("Browser-local learning only");
    expect(readiness.guards).toContain("No real model call");
    expect(readiness.guards).toContain("No hosted inference");
    expect(readiness.guards).toContain("No cloud personalization");
    expect(readiness.guards).toContain("No provider telemetry fetch");
    expect(readiness.guards).toContain("No hosted learned profile");
    expect(readiness.guards).toContain("No provider ranking sync");
    expect(readiness.guardCopy).toContain("does not call an AI model");
    expect(readiness.guardCopy).toContain("run hosted inference");
    expect(readiness.gates.find((gate) => gate.id === "local-explanation-review")).toMatchObject({
      label: "Explanation Review",
      status: "ready",
    });
    expect(readiness.gates.find((gate) => gate.id === "consent-audit")).toMatchObject({
      label: "Consent Boundary",
      status: "warning",
    });
    expect(readiness.consentAuditPacket).toMatchObject({
      auditId: "audit-local-ai-rec-001",
      consentStateLabel: "Local Review Only",
      packetId: "ai-consent-local-2026-06-16",
      promptEnvelope: {
        modelCall: "skipped",
        sampleHash: readiness.consentAuditPacket?.evidence.deterministicSampleHash,
        writes: "none",
      },
    });
    expect(readiness.consentAuditPacket?.guards).toContain("No model prompt sent");
    expect(readiness.consentAuditPacket?.guards).toContain("No hosted inference write");
    expect(readiness.consentAuditPacket?.evidence.noWriteLedger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "model-gateway", value: "skipped" }),
        expect.objectContaining({ id: "provider-telemetry", value: "blocked" }),
        expect.objectContaining({ id: "rollout", value: "blocked" }),
      ]),
    );
  });

  it("creates a redacted local consent audit packet without writes or model calls", () => {
    const packet = createVerifyAiRecommendationConsentAuditPacket();

    expect(packet.evidence.deterministicSampleHash).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    expect(packet.promptEnvelope.sampleHash).toBe(packet.evidence.deterministicSampleHash);
    expect(packet.evidence.redactedFieldCount).toBe(4);
    expect(packet.evidence.retainedFields).toEqual([
      "candidate ids",
      "score signals",
      "mood tags",
      "session fit bucket",
      "local feedback buckets",
    ]);
    expect(packet.evidence.blockedSinks).toEqual([
      "model gateway request",
      "hosted inference job",
      "cloud personalization row",
      "provider telemetry export",
      "provider ranking sync",
    ]);
    expect(packet.promptEnvelope.redactedPrompt).toContain("[redacted-profile-placeholder]");
    expect(packet.promptEnvelope.omittedFields).toEqual([
      "account email",
      "provider tokens",
      "raw play session notes",
      "friend identifiers",
    ]);
    expect(packet.reviewRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "prompt-redaction", status: "pass" }),
        expect.objectContaining({ id: "write-scope", status: "pass" }),
        expect.objectContaining({ id: "retention-delete-export", status: "review" }),
      ]),
    );
    expect(packet.summary).toContain("no model call");
    expect(packet.summary).toContain("no provider export");
  });

  it("hashes local evidence deterministically regardless of object key order", () => {
    expect(createAiRecommendationEvidenceHash({ b: 2, a: ["x", "y"] })).toBe(
      createAiRecommendationEvidenceHash({ a: ["x", "y"], b: 2 }),
    );
  });

  it("blocks rollout when the local ranker baseline is absent", () => {
    const readiness = buildAiRecommendationReadiness({
      cloudProfileReady: false,
      consentAuditReady: false,
      hostedEvalReady: false,
      learnedProfileReady: false,
      localBacklogScoringReady: false,
      localExplanationReviewReady: false,
      modelGatewayReady: false,
      providerTelemetryReady: false,
    });

    expect(readiness.blockedCount).toBe(9);
    expect(readiness.nextAction).toBe(
      "Restore local backlog candidate scoring before model staging.",
    );
  });

  it("keeps hosted model capabilities in review even when evidence exists", () => {
    const readiness = buildAiRecommendationReadiness({
      cloudProfileReady: true,
      consentAuditReady: true,
      hostedEvalReady: true,
      learnedProfileReady: true,
      localBacklogScoringReady: true,
      localExplanationReviewReady: true,
      modelGatewayReady: true,
      providerTelemetryReady: true,
    });

    expect(readiness.blockedCount).toBe(0);
    expect(readiness.readyCount).toBe(4);
    expect(readiness.warningCount).toBe(5);
    expect(readiness.statusLabel).toBe("Needs staging");
    expect(readiness.gates.find((gate) => gate.id === "model-gateway")?.status).toBe("warning");
    expect(readiness.gates.find((gate) => gate.id === "learned-profile")?.status).toBe("ready");
  });
});
