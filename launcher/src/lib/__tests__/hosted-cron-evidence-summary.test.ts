import { describe, expect, it } from "vitest";

import {
  buildHostedCronEvidenceSummary,
  createVerifyHostedCronEvidenceSummary,
} from "../hosted-cron-evidence-summary";

describe("hosted cron evidence summary", () => {
  it("keeps verify fixture evidence as external-gated no-write review", () => {
    const summary = createVerifyHostedCronEvidenceSummary();

    expect(summary.statusLabel).toBe("External Evidence Required");
    expect(summary.passCount).toBe(0);
    expect(summary.reviewCount).toBe(1);
    expect(summary.blockedCount).toBe(1);
    expect(summary.summary).toContain("trigger_source=scheduled");
    expect(summary.summary).toContain("valid aggregate counts");
    expect(summary.summary).toContain("failed_count=0");
    expect(summary.summary).toContain("safe Supabase REST target");
    expect(summary.summary).toContain("external dashboard/config proof");
    expect(summary.blockedClaims).toContain("Scheduler origin must be trigger_source=scheduled");
    expect(summary.blockedClaims).toContain("Dashboard or config proof required");
    expect(summary.blockedClaims).toContain("Manual authorized calls do not substitute");
    expect(summary.blockedClaims).toContain("Missing aggregate count blocks evidence");
    expect(summary.blockedClaims).toContain("Invalid aggregate count blocks evidence");
    expect(summary.blockedClaims).toContain("failed_count must be zero");
    expect(summary.blockedClaims).toContain("Unsafe REST targets are blocked");
    expect(summary.blockedClaims).toContain("No secret material rendered");
    expect(summary.blockedClaims).toContain("Dry-run rows do not pass");
    expect(summary.blockedClaims).toContain("Stale rows do not pass");
    expect(summary.jobs.map((job) => job.functionName)).toEqual([
      "process-account-deletions",
      "poll-platform-presence",
    ]);
    expect(summary.jobs.map((job) => job.id)).toContain("presence-poll");
    expect(summary.jobs[0].evidence).toContain("aggregateCount:invalid");
    expect(summary.jobs[1].evidence).toContain("aggregateCount:missing");
    expect(JSON.stringify(summary)).not.toMatch(/secret_[a-z0-9]|sk_live|bearer\s+[a-z0-9]/i);
  });

  it("promotes only fresh scheduled rows with aggregate counts and external scheduler proof", () => {
    const summary = buildHostedCronEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      maxAgeMinutes: 90,
      packetId: "hosted-cron-test",
      jobs: [
        {
          aggregateCountStatus: "valid",
          containsSecretMaterial: false,
          evidenceRecorded: true,
          evidenceTable: "presence_poll_runs",
          failedCount: 0,
          functionName: "poll-platform-presence",
          id: "fresh",
          label: "Fresh",
          mode: "scheduled",
          mutationProof: true,
          observedAt: "2026-06-15T23:45:00.000Z",
          restTargetSafe: true,
          rowScope: "fresh non-dry-run row",
          runId: "fresh-001",
          schedulerConfigProof: true,
          secretRedacted: true,
          triggerSource: "scheduled",
          verifyRouteWrite: false,
        },
        {
          aggregateCountStatus: "valid",
          containsSecretMaterial: false,
          evidenceRecorded: true,
          evidenceTable: "presence_poll_runs",
          failedCount: 0,
          functionName: "poll-platform-presence",
          id: "dry-run",
          label: "Dry Run",
          mode: "dry_run",
          mutationProof: true,
          observedAt: "2026-06-15T23:50:00.000Z",
          restTargetSafe: true,
          rowScope: "dry-run row",
          runId: "dry-run-001",
          schedulerConfigProof: false,
          secretRedacted: true,
          triggerSource: "manual",
          verifyRouteWrite: false,
        },
        {
          aggregateCountStatus: "valid",
          containsSecretMaterial: false,
          evidenceRecorded: true,
          evidenceTable: "account_deletion_processor_runs",
          failedCount: 0,
          functionName: "process-account-deletions",
          id: "stale",
          label: "Stale",
          mode: "scheduled",
          mutationProof: true,
          observedAt: "2026-06-15T20:00:00.000Z",
          restTargetSafe: true,
          rowScope: "stale row",
          runId: "stale-001",
          schedulerConfigProof: true,
          secretRedacted: true,
          triggerSource: "scheduled",
          verifyRouteWrite: false,
        },
      ],
    });

    expect(summary.passCount).toBe(1);
    expect(summary.jobs[0]).toMatchObject({
      requirement:
        "Fresh scheduled non-dry-run row with trigger_source=scheduled, valid aggregate counts, failed_count=0, safe REST target, redacted secrets, and dashboard/config proof",
      status: "pass",
    });
    expect(summary.jobs[1]).toMatchObject({
      requirement:
        "Dry-run or manual authorized calls must be replaced by trigger_source=scheduled evidence",
      status: "review",
    });
    expect(summary.jobs[2]).toMatchObject({
      requirement: "Scheduled evidence row is stale",
      status: "review",
    });
  });

  it("surfaces hardened collector blockers for fresh rows that still fail proof rules", () => {
    const baseJob = {
      aggregateCountStatus: "valid" as const,
      containsSecretMaterial: false,
      evidenceRecorded: true,
      evidenceTable: "presence_poll_runs",
      failedCount: 0,
      functionName: "poll-platform-presence",
      id: "base",
      label: "Base",
      mode: "scheduled" as const,
      mutationProof: true,
      observedAt: "2026-06-15T23:50:00.000Z",
      restTargetSafe: true,
      rowScope: "fresh scheduled row",
      runId: "fresh-collector-row",
      schedulerConfigProof: true,
      secretRedacted: true,
      triggerSource: "scheduled" as const,
      verifyRouteWrite: false,
    };
    const summary = buildHostedCronEvidenceSummary({
      createdAt: "2026-06-16T00:00:00.000Z",
      maxAgeMinutes: 90,
      packetId: "hosted-cron-collector-rules-test",
      jobs: [
        {
          ...baseJob,
          aggregateCountStatus: "missing",
          id: "missing-count",
          label: "Missing Count",
        },
        {
          ...baseJob,
          aggregateCountStatus: "invalid",
          id: "invalid-count",
          label: "Invalid Count",
        },
        {
          ...baseJob,
          failedCount: 1,
          id: "failed-count",
          label: "Failed Count",
        },
        {
          ...baseJob,
          id: "unsafe-rest",
          label: "Unsafe Rest",
          restTargetSafe: false,
        },
        {
          ...baseJob,
          id: "manual-origin",
          label: "Manual Origin",
          schedulerConfigProof: false,
          triggerSource: "manual",
        },
      ],
    });

    expect(summary.passCount).toBe(0);
    expect(summary.jobs.map((job) => job.requirement)).toEqual([
      "Aggregate count fields are missing",
      "Aggregate count fields are invalid",
      "failed_count must be zero",
      "Supabase REST target must be safe",
      "Scheduler origin must be trigger_source=scheduled",
    ]);
    expect(summary.jobs[4].evidence).toContain("schedulerProof:missing");
  });
});
