import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  buildPresencePollRunEvidence,
  parsePollRequestBody,
  type PresencePollRunEvidenceInput,
  readBodyBoolean,
} from "./contract.ts";

const baseEvidenceInput: PresencePollRunEvidenceInput = {
  activityInsertedCount: 0,
  completedAt: "2026-06-14T12:01:00.000Z",
  dryRun: false,
  forced: false,
  platforms: ["steam"],
  polledCount: 1,
  presenceUpdatedCount: 0,
  providerResults: [
    { platform: "steam", status: "online" },
  ],
  requestedUserCount: 1,
  runId: "run-123",
  scannedCount: 1,
  skipped: [],
  startedAt: "2026-06-14T12:00:00.000Z",
  triggerSource: "hosted_deploy_gate",
};

Deno.test("presence poll boolean parser treats string false as false", () => {
  assertEquals(readBodyBoolean({ dryRun: "false" }, "dryRun"), false);
  assertEquals(readBodyBoolean({ force: "0" }, "force"), false);
  assertEquals(readBodyBoolean({ force: "off" }, "force"), false);
});

Deno.test(
  "presence poll boolean parser accepts booleans and explicit true strings",
  () => {
    assertEquals(readBodyBoolean({ dryRun: true }, "dryRun"), true);
    assertEquals(readBodyBoolean({ dryRun: false }, "dryRun"), false);
    assertEquals(readBodyBoolean({ force: "true" }, "force"), true);
    assertEquals(readBodyBoolean({ force: "1" }, "force"), true);
  },
);

Deno.test(
  "presence poll request parser clamps limits and filters inputs",
  () => {
    assertEquals(
      parsePollRequestBody(
        {
          dryRun: "true",
          force: "off",
          limit: 999,
          platforms: ["steam", "unknown", " EPIC ", "", 42],
          trigger_source: "hosted-deploy-gate",
          userIds: ["user-1", "", " user-2 ", null],
        },
        50,
      ),
      {
        dryRun: true,
        force: false,
        limit: 50,
        platforms: ["steam", "epic"],
        triggerSource: "hosted_deploy_gate",
        userIds: ["user-1", " user-2 "],
      },
    );

    assertEquals(parsePollRequestBody({ limit: -10 }, 50).limit, 1);
    assertEquals(parsePollRequestBody({ limit: Number.NaN }, 50).limit, 50);
  },
);

Deno.test("presence poll parser defaults trigger source to manual", () => {
  assertEquals(parsePollRequestBody({ dry_run: "yes" }, 50), {
    dryRun: true,
    force: false,
    limit: 50,
    platforms: [],
    triggerSource: "manual",
    userIds: [],
  });
});

Deno.test(
  "presence poll evidence stores sanitized aggregate counts only",
  () => {
    assertEquals(
      buildPresencePollRunEvidence({
        activityInsertedCount: 0,
        completedAt: "2026-06-14T12:01:00.000Z",
        dryRun: true,
        forced: false,
        platforms: ["steam", "steam", "epic"],
        polledCount: 2,
        presenceUpdatedCount: 0,
        providerResults: [
          { platform: "steam", status: "online" },
          { platform: "epic", status: "offline" },
        ],
        requestedUserCount: 3,
        runId: "run-123",
        scannedCount: 4,
        skipped: [
          { platform: "steam", reason: "cached" },
          { platform: "epic", reason: "rate-limited", retryAfterSeconds: 60 },
        ],
        startedAt: "2026-06-14T12:00:00.000Z",
        triggerSource: "hosted_deploy_gate",
      }),
      {
        activity_inserted_count: 0,
        completed_at: "2026-06-14T12:01:00.000Z",
        dry_run: true,
        forced: false,
        platforms: ["steam", "epic"],
        polled_count: 2,
        presence_updated_count: 0,
        provider_result_summary: {
          byPlatform: { epic: 1, steam: 1 },
          byStatus: { offline: 1, online: 1 },
          total: 2,
        },
        requested_user_count: 3,
        run_id: "run-123",
        scanned_count: 4,
        skipped_count: 2,
        skipped_summary: {
          byPlatform: { epic: 1, steam: 1 },
          byReason: { cached: 1, "rate-limited": 1 },
          maxRetryAfterSeconds: 60,
          rateLimited: 1,
          total: 2,
        },
        started_at: "2026-06-14T12:00:00.000Z",
        status: "dry_run",
        trigger_source: "hosted_deploy_gate",
      },
    );
  },
);

Deno.test("presence poll evidence allows dry-run skips without polling", () => {
  assertEquals(
    buildPresencePollRunEvidence({
      ...baseEvidenceInput,
      dryRun: true,
      polledCount: 0,
      presenceUpdatedCount: 0,
      providerResults: [],
      scannedCount: 2,
      skipped: [
        { platform: "steam", reason: "cached" },
        { platform: "epic", reason: "missing-provider" },
      ],
    }),
    {
      activity_inserted_count: 0,
      completed_at: "2026-06-14T12:01:00.000Z",
      dry_run: true,
      forced: false,
      platforms: ["steam"],
      polled_count: 0,
      presence_updated_count: 0,
      provider_result_summary: {
        byPlatform: {},
        byStatus: {},
        total: 0,
      },
      requested_user_count: 1,
      run_id: "run-123",
      scanned_count: 2,
      skipped_count: 2,
      skipped_summary: {
        byPlatform: { epic: 1, steam: 1 },
        byReason: { cached: 1, "missing-provider": 1 },
        maxRetryAfterSeconds: 0,
        rateLimited: 0,
        total: 2,
      },
      started_at: "2026-06-14T12:00:00.000Z",
      status: "dry_run",
      trigger_source: "hosted_deploy_gate",
    },
  );
});

Deno.test(
  "presence poll evidence rejects polled skipped scanned mismatch",
  () => {
    assertThrows(
      () =>
        buildPresencePollRunEvidence({
          ...baseEvidenceInput,
          polledCount: 1,
          providerResults: [{ platform: "steam", status: "online" }],
          scannedCount: 3,
          skipped: [{ platform: "epic", reason: "cached" }],
        }),
      Error,
      "Invalid presence poll evidence totals.",
    );
  },
);

Deno.test("presence poll evidence rejects provider result total mismatch", () => {
  assertThrows(
    () =>
      buildPresencePollRunEvidence({
        ...baseEvidenceInput,
        polledCount: 2,
        providerResults: [{ platform: "steam", status: "online" }],
        scannedCount: 2,
      }),
    Error,
    "Invalid presence poll provider totals.",
  );
});

Deno.test("presence poll evidence rejects activity above presence updates", () => {
  assertThrows(
    () =>
      buildPresencePollRunEvidence({
        ...baseEvidenceInput,
        activityInsertedCount: 2,
        polledCount: 2,
        presenceUpdatedCount: 1,
        providerResults: [
          { platform: "steam", status: "online" },
          { platform: "epic", status: "away" },
        ],
        scannedCount: 2,
      }),
    Error,
    "Invalid presence poll activity totals.",
  );
});
