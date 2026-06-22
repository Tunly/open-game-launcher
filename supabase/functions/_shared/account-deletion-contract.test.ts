import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  ACTIVE_ACCOUNT_DELETION_STATUSES,
  buildActiveAccountDeletionOwnerFilter,
  buildCancelAccountDeletionMutation,
  buildPendingAccountDeletionFilters,
  isPendingAccountDeletionConflict,
  normalizeAccountDeletionReason,
} from "./account-deletion-contract.ts";

Deno.test("account deletion reason normalizes optional strings", () => {
  assertEquals(normalizeAccountDeletionReason(null), {
    ok: true,
    reason: null,
  });
  assertEquals(normalizeAccountDeletionReason({ reason: "  leaving  " }), {
    ok: true,
    reason: "leaving",
  });
  assertEquals(normalizeAccountDeletionReason({ reason: "" }), {
    ok: true,
    reason: null,
  });
});

Deno.test(
  "account deletion reason rejects non-strings and oversized text",
  () => {
    const expectedNonString = {
      error: "reason must be a string.",
      ok: false,
      statusCode: 400,
    } as const;
    const expectedOversized = {
      error: "reason must be 1000 characters or fewer.",
      ok: false,
      statusCode: 400,
    } as const;

    assertEquals(
      normalizeAccountDeletionReason({ reason: 42 }),
      expectedNonString,
    );
    assertEquals(
      normalizeAccountDeletionReason({ reason: "x".repeat(1001) }),
      expectedOversized,
    );
  },
);

Deno.test(
  "account deletion pending lookup is scoped to user and pending status",
  () => {
    assertEquals(buildPendingAccountDeletionFilters("user-1"), [
      { column: "user_id", value: "user-1" },
      { column: "status", value: "pending" },
    ]);
  },
);

Deno.test("account deletion active lookup includes processor claims", () => {
  assertEquals(buildActiveAccountDeletionOwnerFilter("user-1"), {
    column: "user_id",
    value: "user-1",
  });
  assertEquals(
    [...ACTIVE_ACCOUNT_DELETION_STATUSES],
    ["pending", "processing"],
  );
});

Deno.test(
  "account deletion create treats only unique conflicts as idempotent",
  () => {
    assertEquals(isPendingAccountDeletionConflict({ code: "23505" }), true);
    assertEquals(isPendingAccountDeletionConflict({ code: "42501" }), false);
    assertEquals(isPendingAccountDeletionConflict(null), false);
  },
);

Deno.test(
  "account deletion cancel mutation scopes id user and pending status",
  () => {
    assertEquals(
      buildCancelAccountDeletionMutation({
        cancelledAt: "2026-06-13T12:00:00.000Z",
        requestId: "request-1",
        userId: "user-1",
      }),
      {
        filters: [
          { column: "id", value: "request-1" },
          { column: "user_id", value: "user-1" },
          { column: "status", value: "pending" },
        ],
        update: {
          cancelled_at: "2026-06-13T12:00:00.000Z",
          status: "cancelled",
        },
      },
    );
  },
);

Deno.test(
  "account deletion processing claim migration keeps active rows unique",
  async () => {
    const migration = await Deno.readTextFile(
      new URL(
        "../../migrations/20260615160000_account_deletion_processing_claim.sql",
        import.meta.url,
      ),
    );

    assertStringIncludes(
      migration,
      "status in ('pending', 'processing', 'cancelled', 'completed', 'failed')",
    );
    assertStringIncludes(
      migration,
      "where status in ('pending', 'processing')",
    );
    assertStringIncludes(
      migration,
      "account_deletion_requests_one_active_per_user_idx",
    );
  },
);
