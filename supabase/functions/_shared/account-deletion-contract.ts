export type AccountDeletionFilter = {
  column: "id" | "status" | "user_id";
  value: string;
};

export const ACTIVE_ACCOUNT_DELETION_STATUSES = [
  "pending",
  "processing",
] as const;

export type NormalizedAccountDeletionReason =
  | {
    ok: true;
    reason: string | null;
  }
  | {
    error: string;
    ok: false;
    statusCode: 400;
  };

export const ACCOUNT_DELETION_REASON_MAX_LENGTH = 1000;

export function normalizeAccountDeletionReason(
  body: unknown,
): NormalizedAccountDeletionReason {
  if (!body || typeof body !== "object" || !("reason" in body)) {
    return { ok: true, reason: null };
  }

  const reason = (body as { reason?: unknown }).reason;
  if (reason == null) {
    return { ok: true, reason: null };
  }

  if (typeof reason !== "string") {
    return {
      error: "reason must be a string.",
      ok: false,
      statusCode: 400,
    };
  }

  const trimmed = reason.trim();
  if (!trimmed) {
    return { ok: true, reason: null };
  }

  if (trimmed.length > ACCOUNT_DELETION_REASON_MAX_LENGTH) {
    return {
      error: "reason must be 1000 characters or fewer.",
      ok: false,
      statusCode: 400,
    };
  }

  return { ok: true, reason: trimmed };
}

export function buildPendingAccountDeletionFilters(
  userId: string,
): AccountDeletionFilter[] {
  return [
    { column: "user_id", value: userId },
    { column: "status", value: "pending" },
  ];
}

export function buildActiveAccountDeletionOwnerFilter(
  userId: string,
): AccountDeletionFilter {
  return { column: "user_id", value: userId };
}

export function isPendingAccountDeletionConflict(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  return (error as { code?: unknown }).code === "23505";
}

export function buildCancelAccountDeletionMutation(input: {
  cancelledAt: string;
  requestId: string;
  userId: string;
}) {
  return {
    filters: [
      { column: "id", value: input.requestId },
      { column: "user_id", value: input.userId },
      { column: "status", value: "pending" },
    ] satisfies AccountDeletionFilter[],
    update: {
      cancelled_at: input.cancelledAt,
      status: "cancelled",
    },
  };
}
