import { getSupabaseClient } from "./client";
import type { CommunityArtworkCandidate, CustomArtworkKind } from "../custom-artwork";

export type CommunityArtworkFailureReason = "auth" | "config" | "database" | "schema" | "storage";

export type CommunityArtworkModerationStatus = "approved" | "pending" | "rejected";

export type CommunityArtworkReviewDecision = "approve" | "pending" | "reject";

export type CommunityArtworkScanVerdict = "blocked" | "needs_review" | "passed";

export type CommunityArtworkActionResult<T> =
  | {
      ok: true;
      value: T;
      message?: string;
    }
  | {
      ok: false;
      reason: CommunityArtworkFailureReason;
      message: string;
    };

export type CommunityArtworkReportReason =
  "copyright" | "explicit" | "harassment" | "low_quality" | "other" | "spam" | "wrong_game";

export interface SubmitCommunityArtworkInput {
  artistName: string;
  description?: string | null;
  file: File;
  gameId: string;
  kind: CustomArtworkKind;
  tags?: string[];
  title: string;
}

export interface CommunityArtworkVoteResult {
  artworkId: string;
  userVote: -1 | 0 | 1;
  voteScore: number;
}

export interface CommunityArtworkReportResult {
  artworkId: string;
  moderationStatus: CommunityArtworkModerationStatus;
  reportCount: number;
  reportStatus: "active" | "dismissed" | "withdrawn";
}

export interface CommunityArtworkModerationQueueItem extends CommunityArtworkCandidate {
  gameId: string;
  lastAuditAction?: string;
  lastAuditAt?: string;
  lastReportReason?: CommunityArtworkReportReason;
  lastReportedAt?: string;
  lastScannedAt?: string;
  lastScanVerdict?: CommunityArtworkScanVerdict;
  moderationReason?: string;
  storagePath?: string;
  submitterId: string;
}

export interface CommunityArtworkReviewInput {
  artworkId: string;
  decision: CommunityArtworkReviewDecision;
  reason?: string;
  reviewerUserId?: string | null;
}

export interface CommunityArtworkReviewResult {
  approvedAt?: string;
  artworkId: string;
  auditAction: "approved" | "rejected" | "returned_to_pending";
  auditId: string;
  auditReason: string;
  moderationReason?: string;
  moderationStatus: CommunityArtworkModerationStatus;
  rejectedAt?: string;
  reportCount: number;
}

type SupabaseClient = ReturnType<typeof getSupabaseClient>;

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type SupabaseResult<T> = {
  data: T | null;
  error: SupabaseErrorLike | null;
};

type RpcCapableClient = SupabaseClient & {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<SupabaseResult<unknown>>;
};

type FunctionsCapableClient = SupabaseClient & {
  functions: {
    invoke: (
      functionName: string,
      options: { body: Record<string, unknown> },
    ) => PromiseLike<SupabaseResult<unknown>>;
  };
};

type CommunityArtworkStorageBucket = {
  getPublicUrl?: (path: string) => { data: { publicUrl?: string | null } };
  upload: (
    path: string,
    file: File,
    options: { cacheControl: string; contentType?: string; upsert: boolean },
  ) => PromiseLike<SupabaseResult<unknown>>;
};

type CommunityArtworkInsertTable = {
  insert: (value: Record<string, unknown>) => {
    select: (columns: string) => {
      maybeSingle: () => PromiseLike<SupabaseResult<CommunityArtworkItemRow>>;
    };
  };
};

type CommunityArtworkItemRow = {
  artist_name?: string | null;
  created_at?: string;
  description?: string | null;
  download_count?: number | null;
  game_id?: string;
  id?: string;
  kind?: string;
  moderation_status?: string;
  report_count?: number | null;
  source_url?: string | null;
  storage_path?: string | null;
  tags?: string[] | null;
  title?: string | null;
  updated_at?: string;
  user_vote?: number | null;
  vote_score?: number | null;
};

type CommunityArtworkModerationQueueRow = CommunityArtworkItemRow & {
  last_audit_action?: string | null;
  last_audit_at?: string | null;
  last_report_reason?: string | null;
  last_reported_at?: string | null;
  last_scan_verdict?: string | null;
  last_scanned_at?: string | null;
  moderation_reason?: string | null;
  submitter_id?: string | null;
};

type CommunityArtworkReviewRow = {
  approved_at?: string | null;
  artwork_id?: string;
  audit_action?: string;
  audit_id?: string;
  audit_reason?: string | null;
  moderation_reason?: string | null;
  moderation_status?: string;
  rejected_at?: string | null;
  report_count?: number | null;
};

type CommunityArtworkModerationEndpointPayload = {
  action?: string;
  data?: unknown;
  error?: string;
  reviewerRole?: string;
  rpc?: string;
};

const COMMUNITY_ARTWORK_BUCKET = "game-artwork";
const COMMUNITY_ARTWORK_ITEM_SELECT =
  "id, game_id, kind, title, artist_name, description, source_url, storage_path, tags, vote_score, download_count, report_count, moderation_status, created_at, updated_at";

function getOptionalSupabaseClient(): SupabaseClient | null {
  try {
    return getSupabaseClient();
  } catch {
    return null;
  }
}

async function getCurrentUserId(client: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await client.auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

async function getSignedInContext(): Promise<
  { client: SupabaseClient; userId: string } | { failure: CommunityArtworkActionResult<never> }
> {
  const client = getOptionalSupabaseClient();
  if (!client) {
    return {
      failure: {
        ok: false,
        reason: "config",
        message: "Hosted community artwork needs Supabase configuration.",
      },
    };
  }

  const userId = await getCurrentUserId(client);
  if (!userId) {
    return {
      failure: {
        ok: false,
        reason: "auth",
        message: "Sign in to use hosted community artwork.",
      },
    };
  }

  return { client, userId };
}

function isMissingSchemaError(error: SupabaseErrorLike | null | undefined): boolean {
  const code = error?.code;
  const message = error?.message?.toLowerCase() ?? "";
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "42883" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function isPermissionDeniedError(error: SupabaseErrorLike | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42501" ||
    message.includes("permission denied") ||
    message.includes("invalid or expired token") ||
    message.includes("reviewer is not active")
  );
}

function isArtworkKind(value: string | undefined): value is CustomArtworkKind {
  return value === "cover" || value === "icon" || value === "logo";
}

function isModerationStatus(value: string | undefined): CommunityArtworkModerationStatus {
  return value === "pending" || value === "rejected" ? value : "approved";
}

function isReportReason(value: string | null | undefined): value is CommunityArtworkReportReason {
  return (
    value === "copyright" ||
    value === "explicit" ||
    value === "harassment" ||
    value === "low_quality" ||
    value === "other" ||
    value === "spam" ||
    value === "wrong_game"
  );
}

function isScanVerdict(value: string | null | undefined): value is CommunityArtworkScanVerdict {
  return value === "blocked" || value === "needs_review" || value === "passed";
}

function normalizeVote(value: number | null | undefined): -1 | 0 | 1 {
  return value === -1 || value === 1 ? value : 0;
}

function normalizeTags(tags: string[] | null | undefined): string[] {
  return (tags ?? []).filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "");
}

function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function communityArtworkStorageBucket(client: SupabaseClient): CommunityArtworkStorageBucket {
  return client.storage.from(COMMUNITY_ARTWORK_BUCKET) as unknown as CommunityArtworkStorageBucket;
}

function communityArtworkItemsTable(client: SupabaseClient): CommunityArtworkInsertTable {
  return (
    client.from as unknown as (table: "community_artwork_items") => CommunityArtworkInsertTable
  )("community_artwork_items");
}

function communityArtworkRpc(client: SupabaseClient): RpcCapableClient {
  return client as RpcCapableClient;
}

function communityArtworkFunctions(client: SupabaseClient): FunctionsCapableClient {
  return client as FunctionsCapableClient;
}

function getEndpointData(payload: unknown): unknown {
  return payload && typeof payload === "object" && "data" in payload
    ? (payload as CommunityArtworkModerationEndpointPayload).data
    : payload;
}

function getEndpointErrorMessage(
  payload: unknown,
  error: SupabaseErrorLike | null | undefined,
): string {
  if (payload && typeof payload === "object") {
    const endpointError = (payload as CommunityArtworkModerationEndpointPayload).error;
    if (typeof endpointError === "string" && endpointError.trim()) {
      return endpointError;
    }
  }

  return error?.message ?? "";
}

function makeStoragePath(
  userId: string,
  gameId: string,
  kind: CustomArtworkKind,
  file: File,
): string {
  const rawExtension = file.name.split(".").pop()?.toLowerCase() || "png";
  const extension = rawExtension.replace(/[^a-z0-9]/g, "") || "png";
  const gameSegment = sanitizePathSegment(gameId) || "unassigned";
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${userId}/games/${gameSegment}/${kind}-${randomId}.${extension}`;
}

function mapCommunityArtworkRow(row: CommunityArtworkItemRow): CommunityArtworkCandidate | null {
  if (!row.id || !isArtworkKind(row.kind) || !row.source_url) {
    return null;
  }

  return {
    artist: row.artist_name?.trim() || "Community Artist",
    createdAt: row.created_at,
    description: row.description ?? "",
    downloads: row.download_count ?? 0,
    hosted: true,
    id: row.id,
    kind: row.kind,
    moderationStatus: isModerationStatus(row.moderation_status),
    reportCount: row.report_count ?? 0,
    sourceLabel: row.title?.trim() || "Hosted Community Artwork",
    tags: normalizeTags(row.tags),
    title: row.title?.trim() || "Hosted Community Artwork",
    updatedAt: row.updated_at,
    url: row.source_url,
    userVote: normalizeVote(row.user_vote),
    votes: row.vote_score ?? 0,
  };
}

function mapCommunityArtworkModerationQueueRow(
  row: CommunityArtworkModerationQueueRow,
): CommunityArtworkModerationQueueItem | null {
  const candidate = mapCommunityArtworkRow(row);
  if (!candidate || !row.game_id || !row.submitter_id) {
    return null;
  }

  return {
    ...candidate,
    gameId: row.game_id,
    lastAuditAction: row.last_audit_action ?? undefined,
    lastAuditAt: row.last_audit_at ?? undefined,
    lastReportReason: isReportReason(row.last_report_reason) ? row.last_report_reason : undefined,
    lastReportedAt: row.last_reported_at ?? undefined,
    lastScannedAt: row.last_scanned_at ?? undefined,
    lastScanVerdict: isScanVerdict(row.last_scan_verdict) ? row.last_scan_verdict : undefined,
    moderationReason: row.moderation_reason ?? undefined,
    storagePath: row.storage_path ?? undefined,
    submitterId: row.submitter_id,
  };
}

export async function listHostedCommunityArtworkCandidates(
  gameId: string,
): Promise<CommunityArtworkActionResult<CommunityArtworkCandidate[]>> {
  const cleanGameId = gameId.trim();
  if (!cleanGameId) {
    return { ok: true, value: [] };
  }

  const client = getOptionalSupabaseClient();
  if (!client) {
    return {
      ok: false,
      reason: "config",
      message: "Hosted community artwork is unavailable without Supabase configuration.",
    };
  }

  const { data, error } = await communityArtworkRpc(client).rpc("list_community_artwork", {
    p_game_id: cleanGameId,
    p_limit: 24,
  });

  if (error) {
    return {
      ok: false,
      reason: isMissingSchemaError(error) ? "schema" : "database",
      message: isMissingSchemaError(error)
        ? "Hosted community artwork schema is not applied yet."
        : error.message || "Hosted community artwork could not be loaded.",
    };
  }

  const rows = Array.isArray(data) ? (data as CommunityArtworkItemRow[]) : [];
  return {
    ok: true,
    value: rows
      .map((row) => mapCommunityArtworkRow(row))
      .filter((candidate): candidate is CommunityArtworkCandidate => Boolean(candidate)),
  };
}

export async function uploadCommunityArtworkForGame(
  input: SubmitCommunityArtworkInput,
): Promise<CommunityArtworkActionResult<CommunityArtworkCandidate>> {
  const context = await getSignedInContext();
  if ("failure" in context) {
    return context.failure;
  }

  const { client, userId } = context;
  const storagePath = makeStoragePath(userId, input.gameId, input.kind, input.file);
  const bucket = communityArtworkStorageBucket(client);
  const { error: uploadError } = await bucket.upload(storagePath, input.file, {
    cacheControl: "3600",
    contentType: input.file.type || undefined,
    upsert: false,
  });

  if (uploadError) {
    return {
      ok: false,
      reason: "storage",
      message: uploadError.message || "Community artwork upload failed.",
    };
  }

  const publicUrl = bucket.getPublicUrl?.(storagePath)?.data.publicUrl ?? null;
  const { data, error } = await communityArtworkItemsTable(client)
    .insert({
      artist_name: input.artistName.trim(),
      description: input.description?.trim() || "",
      game_id: input.gameId.trim(),
      kind: input.kind,
      moderation_status: "pending",
      source_url: publicUrl || `${COMMUNITY_ARTWORK_BUCKET}/${storagePath}`,
      storage_path: storagePath,
      submitter_id: userId,
      tags: input.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
      title: input.title.trim(),
    })
    .select(COMMUNITY_ARTWORK_ITEM_SELECT)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: isMissingSchemaError(error) ? "schema" : "database",
      message: isMissingSchemaError(error)
        ? "Hosted community artwork schema is not applied yet."
        : error.message || "Community artwork metadata could not be saved.",
    };
  }

  const candidate = data ? mapCommunityArtworkRow(data) : null;
  if (!candidate) {
    return {
      ok: false,
      reason: "database",
      message: "Community artwork metadata was not returned.",
    };
  }

  return {
    ok: true,
    value: candidate,
    message: "Community artwork uploaded for moderation.",
  };
}

export async function setHostedCommunityArtworkVote(
  artworkId: string,
  vote: -1 | 0 | 1,
): Promise<CommunityArtworkActionResult<CommunityArtworkVoteResult>> {
  const context = await getSignedInContext();
  if ("failure" in context) {
    return context.failure;
  }

  const { client } = context;
  const { data, error } = await communityArtworkRpc(client).rpc("vote_community_artwork", {
    p_artwork_id: artworkId,
    p_vote: vote,
  });

  if (error) {
    return {
      ok: false,
      reason: isMissingSchemaError(error) ? "schema" : "database",
      message: isMissingSchemaError(error)
        ? "Hosted community artwork voting is not enabled yet."
        : error.message || "Community artwork vote could not be saved.",
    };
  }

  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  return {
    ok: true,
    value: {
      artworkId: String(row?.artwork_id ?? artworkId),
      userVote: normalizeVote(Number(row?.user_vote ?? vote)),
      voteScore: Number(row?.vote_score ?? 0),
    },
  };
}

export async function reportHostedCommunityArtwork(
  artworkId: string,
  reason: CommunityArtworkReportReason = "other",
  details?: string,
): Promise<CommunityArtworkActionResult<CommunityArtworkReportResult>> {
  const context = await getSignedInContext();
  if ("failure" in context) {
    return context.failure;
  }

  const { client } = context;
  const { data, error } = await communityArtworkRpc(client).rpc("report_community_artwork", {
    p_artwork_id: artworkId,
    p_details: details?.trim() || null,
    p_reason: reason,
  });

  if (error) {
    return {
      ok: false,
      reason: isMissingSchemaError(error) ? "schema" : "database",
      message: isMissingSchemaError(error)
        ? "Hosted community artwork reporting is not enabled yet."
        : error.message || "Community artwork report could not be saved.",
    };
  }

  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  return {
    ok: true,
    value: {
      artworkId: String(row?.artwork_id ?? artworkId),
      moderationStatus: isModerationStatus(String(row?.moderation_status ?? "approved")),
      reportCount: Number(row?.report_count ?? 0),
      reportStatus: String(row?.report_status ?? "active") as "active" | "dismissed" | "withdrawn",
    },
  };
}

export async function listCommunityArtworkModerationQueue(
  status: CommunityArtworkModerationStatus = "pending",
  limit = 50,
): Promise<CommunityArtworkActionResult<CommunityArtworkModerationQueueItem[]>> {
  const context = await getSignedInContext();
  if ("failure" in context) {
    const { failure } = context;
    if (failure.ok === false && failure.reason === "config") {
      return {
        ok: false,
        reason: "config",
        message: "Hosted community artwork moderation needs Supabase configuration.",
      };
    }

    return {
      ok: false,
      reason: "auth",
      message: "Sign in to moderate hosted community artwork.",
    };
  }

  const { client } = context;
  const { data, error } = await communityArtworkFunctions(client).functions.invoke(
    "community-artwork-moderation",
    {
      body: {
        action: "list_queue",
        limit,
        status,
      },
    },
  );
  const errorMessage = getEndpointErrorMessage(data, error);

  if (error || errorMessage) {
    if (isPermissionDeniedError({ message: errorMessage, code: error?.code })) {
      return {
        ok: false,
        reason: "auth",
        message: "Community artwork moderation requires a trusted service-role endpoint.",
      };
    }

    const schemaError = isMissingSchemaError({ message: errorMessage, code: error?.code });
    return {
      ok: false,
      reason: schemaError ? "schema" : "database",
      message: schemaError
        ? "Hosted community artwork moderation schema is not applied yet."
        : errorMessage || "Community artwork moderation queue could not be loaded.",
    };
  }

  const endpointData = getEndpointData(data);
  const rows = Array.isArray(endpointData)
    ? (endpointData as CommunityArtworkModerationQueueRow[])
    : [];
  return {
    ok: true,
    value: rows
      .map((row) => mapCommunityArtworkModerationQueueRow(row))
      .filter((candidate): candidate is CommunityArtworkModerationQueueItem => Boolean(candidate)),
  };
}

export async function reviewCommunityArtwork(
  input: CommunityArtworkReviewInput,
): Promise<CommunityArtworkActionResult<CommunityArtworkReviewResult>> {
  const context = await getSignedInContext();
  if ("failure" in context) {
    const { failure } = context;
    if (failure.ok === false && failure.reason === "config") {
      return {
        ok: false,
        reason: "config",
        message: "Hosted community artwork review needs Supabase configuration.",
      };
    }

    return {
      ok: false,
      reason: "auth",
      message: "Sign in to review hosted community artwork.",
    };
  }

  const { client } = context;
  const { data, error } = await communityArtworkFunctions(client).functions.invoke(
    "community-artwork-moderation",
    {
      body: {
        action: "review_artwork",
        artworkId: input.artworkId,
        decision: input.decision,
        reason: input.reason?.trim() || "",
      },
    },
  );
  const errorMessage = getEndpointErrorMessage(data, error);

  if (error || errorMessage) {
    if (isPermissionDeniedError({ message: errorMessage, code: error?.code })) {
      return {
        ok: false,
        reason: "auth",
        message: "Community artwork review requires a trusted service-role endpoint.",
      };
    }

    const schemaError = isMissingSchemaError({ message: errorMessage, code: error?.code });
    return {
      ok: false,
      reason: schemaError ? "schema" : "database",
      message: schemaError
        ? "Hosted community artwork review schema is not applied yet."
        : errorMessage || "Community artwork review action could not be saved.",
    };
  }

  const endpointData = getEndpointData(data);
  const row = Array.isArray(endpointData)
    ? (endpointData[0] as CommunityArtworkReviewRow | undefined)
    : undefined;
  if (!row?.artwork_id || !row.audit_id) {
    return {
      ok: false,
      reason: "database",
      message: "Community artwork review result was not returned.",
    };
  }

  return {
    ok: true,
    value: {
      approvedAt: row.approved_at ?? undefined,
      artworkId: row.artwork_id,
      auditAction:
        row.audit_action === "rejected" || row.audit_action === "returned_to_pending"
          ? row.audit_action
          : "approved",
      auditId: row.audit_id,
      auditReason: row.audit_reason ?? "",
      moderationReason: row.moderation_reason ?? undefined,
      moderationStatus: isModerationStatus(row.moderation_status),
      rejectedAt: row.rejected_at ?? undefined,
      reportCount: row.report_count ?? 0,
    },
    message: "Community artwork review saved to the audit log.",
  };
}
