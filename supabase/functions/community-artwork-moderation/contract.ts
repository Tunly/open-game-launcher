export type CommunityArtworkModerationAction =
  | "list_queue"
  | "review_artwork"
  | "scan_artwork";

export type CommunityArtworkModerationParseResult =
  | {
      action: "list_queue";
      args: {
        p_limit: number;
        p_status: "approved" | "pending" | "rejected";
      };
      rpcName: "list_community_artwork_moderation_queue";
      status: "ok";
    }
  | {
      action: "scan_artwork";
      args: {
        p_artwork_id: string;
      };
      rpcName: "scan_community_artwork";
      status: "ok";
    }
  | {
      action: "review_artwork";
      args: {
        p_artwork_id: string;
        p_decision: "approve" | "pending" | "reject";
        p_reason: string;
      };
      rpcName: "review_community_artwork";
      status: "ok";
    }
  | {
      error: string;
      status: "error";
      statusCode: number;
    };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const moderationStatuses = new Set(["approved", "pending", "rejected"]);

export function parseCommunityArtworkModerationRequest(
  body: unknown,
): CommunityArtworkModerationParseResult {
  const record = readRecord(body);
  if (!record) {
    return errorResult("Request body must be a JSON object.");
  }

  const action = normalizeAction(readString(record.action));
  if (!action) {
    return errorResult("Community artwork moderation action is not supported.");
  }

  if (action === "list_queue") {
    const status = cleanModerationStatus(record.status ?? record.p_status);
    if (!status) {
      return errorResult(
        "Moderation status must be approved, pending, or rejected.",
      );
    }

    return {
      action,
      args: {
        p_limit: cleanInteger(record.limit ?? record.p_limit, 50, 1, 100),
        p_status: status,
      },
      rpcName: "list_community_artwork_moderation_queue",
      status: "ok",
    };
  }

  const artworkId = cleanUuid(record.artworkId ?? record.artwork_id);
  if (!artworkId) {
    return errorResult("artworkId must be a valid UUID.");
  }

  if (action === "scan_artwork") {
    return {
      action,
      args: {
        p_artwork_id: artworkId,
      },
      rpcName: "scan_community_artwork",
      status: "ok",
    };
  }

  const decision = cleanReviewDecision(record.decision);
  if (!decision) {
    return errorResult("Review decision must be approve, reject, or pending.");
  }

  return {
    action,
    args: {
      p_artwork_id: artworkId,
      p_decision: decision,
      p_reason: cleanReason(record.reason),
    },
    rpcName: "review_community_artwork",
    status: "ok",
  };
}

function errorResult(
  error: string,
  statusCode = 400,
): CommunityArtworkModerationParseResult {
  return { error, status: "error", statusCode };
}

function normalizeAction(
  value: string | null,
): CommunityArtworkModerationAction | null {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  if (
    normalized === "list" ||
    normalized === "list_queue" ||
    normalized === "queue"
  ) {
    return "list_queue";
  }

  if (
    normalized === "review" ||
    normalized === "review_artwork" ||
    normalized === "review_item"
  ) {
    return "review_artwork";
  }

  if (
    normalized === "scan" ||
    normalized === "scan_artwork" ||
    normalized === "scan_item"
  ) {
    return "scan_artwork";
  }

  return null;
}

function cleanReviewDecision(
  value: unknown,
): "approve" | "pending" | "reject" | null {
  const normalized = readString(value)?.trim().toLowerCase();
  if (normalized === "approve" || normalized === "approved") return "approve";
  if (normalized === "reject" || normalized === "rejected") return "reject";
  if (
    normalized === "pending" ||
    normalized === "return_to_pending" ||
    normalized === "returned_to_pending"
  ) {
    return "pending";
  }

  return null;
}

function cleanModerationStatus(
  value: unknown,
): "approved" | "pending" | "rejected" | null {
  if (value === null || value === undefined || value === "") return "pending";
  const normalized = readString(value)?.trim().toLowerCase();
  return normalized && moderationStatuses.has(normalized)
    ? (normalized as "approved" | "pending" | "rejected")
    : null;
}

function cleanUuid(value: unknown): string | null {
  return typeof value === "string" && uuidPattern.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function cleanReason(value: unknown): string {
  return readString(value)?.trim().slice(0, 1000) ?? "";
}

function cleanInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
