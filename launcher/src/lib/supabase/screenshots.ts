import { getSupabaseClient } from "./client";
import type {
  Screenshot,
  ScreenshotActionFailure,
  ScreenshotLikeState,
} from "../types/screenshots";

type ScreenshotRow = {
  id: string;
  user_id?: string;
  userId?: string;
  game_id?: string | null;
  gameId?: string | null;
  storage_path?: string;
  storagePath?: string;
  thumbnail_path?: string | null;
  thumbnailPath?: string | null;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
  size_bytes?: number | null;
  sizeBytes?: number | null;
  is_public?: boolean;
  isPublic?: boolean;
  like_count?: number;
  moderation_status?: string;
  report_count?: number;
  created_at?: string;
  createdAt?: string;
};

type SupabaseClient = ReturnType<typeof getSupabaseClient>;

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type SupabaseResult<T> = {
  data: T | null;
  error: SupabaseErrorLike | null;
};

type PublicScreenshotFeedRpcClient = SupabaseClient & {
  rpc?: (
    name: "list_public_screenshot_feed_ranked",
    params: { p_limit: number },
  ) => PromiseLike<SupabaseResult<ScreenshotRow[]>>;
};

type ScreenshotLikeRow = {
  screenshot_id: string;
  user_id: string;
  created_at?: string;
};

type ScreenshotStorageBucket = {
  createSignedUrl?: (
    path: string,
    expiresIn: number,
  ) => PromiseLike<SupabaseResult<{ signedUrl?: string }>>;
  getPublicUrl?: (path: string) => { data: { publicUrl?: string | null } };
  upload: (
    path: string,
    file: File,
    options: { cacheControl: string; contentType?: string; upsert: boolean },
  ) => PromiseLike<SupabaseResult<unknown>>;
};

type ScreenshotLikeInsert = {
  screenshot_id: string;
  user_id: string;
};

interface ScreenshotLikeSelectQuery extends PromiseLike<SupabaseResult<ScreenshotLikeRow[]>> {
  in(column: "screenshot_id", values: string[]): ScreenshotLikeSelectQuery;
}

interface PublicScreenshotFeedSelectQuery extends PromiseLike<SupabaseResult<ScreenshotRow[]>> {
  eq(column: string, value: unknown): PublicScreenshotFeedSelectQuery;
  limit(value: number): PromiseLike<SupabaseResult<ScreenshotRow[]>>;
  order(column: string, options: { ascending: boolean }): PublicScreenshotFeedSelectQuery;
}

interface ScreenshotLikeDeleteQuery extends PromiseLike<SupabaseResult<null>> {
  eq(column: "screenshot_id" | "user_id", value: string): ScreenshotLikeDeleteQuery;
}

interface ScreenshotLikesTable {
  select(columns: string): ScreenshotLikeSelectQuery;
  insert(value: ScreenshotLikeInsert): PromiseLike<SupabaseResult<unknown>>;
  delete(): ScreenshotLikeDeleteQuery;
}

export interface GetMyScreenshotsOptions {
  gameIds?: string[];
}

export interface ListPublicScreenshotFeedOptions {
  limit?: number;
}

export interface UploadScreenshotInput {
  file: File;
  gameId?: string | null;
  caption?: string | null;
  isPublic?: boolean;
  width?: number | null;
  height?: number | null;
}

export type ScreenshotActionResult<T> =
  | {
      ok: true;
      value: T;
      message?: string;
    }
  | ScreenshotActionFailure;

export interface ScreenshotLikeStateResult {
  available: boolean;
  canLike: boolean;
  likes: Record<string, ScreenshotLikeState>;
  message?: string;
}

const SCREENSHOT_BUCKET = "screenshots";
const SCREENSHOT_URL_TTL_SECONDS = 60 * 60;

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
    if (error) {
      return null;
    }
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

async function getSignedInContext(): Promise<
  { client: SupabaseClient; userId: string } | { failure: ScreenshotActionFailure }
> {
  const client = getOptionalSupabaseClient();
  if (!client) {
    return {
      failure: {
        ok: false,
        reason: "config",
        message: "Cloud screenshots need Supabase configuration.",
      },
    };
  }

  const userId = await getCurrentUserId(client);
  if (!userId) {
    return {
      failure: {
        ok: false,
        reason: "auth",
        message: "Sign in to sync screenshots.",
      },
    };
  }

  return { client, userId };
}

function isDisplayUrl(path: string): boolean {
  return /^(https?:|data:|blob:)/i.test(path) || path.startsWith("/");
}

function screenshotStorageBucket(client: SupabaseClient): ScreenshotStorageBucket {
  return client.storage.from(SCREENSHOT_BUCKET) as unknown as ScreenshotStorageBucket;
}

async function getStorageDisplayUrl(
  client: SupabaseClient,
  path?: string | null,
): Promise<string | null> {
  if (!path) {
    return null;
  }
  if (isDisplayUrl(path)) {
    return path;
  }

  const bucket = screenshotStorageBucket(client);
  if (typeof bucket.createSignedUrl === "function") {
    try {
      const { data, error } = await bucket.createSignedUrl(path, SCREENSHOT_URL_TTL_SECONDS);
      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }
    } catch {
      // Older local mocks or public buckets can fall through to the legacy URL path.
    }
  }

  try {
    const { data } = bucket.getPublicUrl?.(path) ?? { data: { publicUrl: null } };
    return data.publicUrl || null;
  } catch {
    return null;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function screenshotMatchesGameIds(shot: Screenshot, gameIds: string[]): boolean {
  if (gameIds.length === 0) {
    return true;
  }

  const gameIdSet = new Set(gameIds);
  if (shot.gameId && gameIdSet.has(shot.gameId)) {
    return true;
  }

  return gameIds.some((gameId) => {
    const segment = sanitizePathSegment(gameId);
    return segment.length > 0 && shot.storagePath.includes(`/games/${segment}/`);
  });
}

function makeStoragePath(userId: string, gameId: string | null | undefined, file: File): string {
  const rawExtension = file.name.split(".").pop()?.toLowerCase() || "png";
  const extension = rawExtension.replace(/[^a-z0-9]/g, "") || "png";
  const gameSegment = gameId ? sanitizePathSegment(gameId) || "unassigned" : "unassigned";
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${userId}/games/${gameSegment}/${randomId}.${extension}`;
}

function isMissingSchemaError(error: SupabaseErrorLike | null | undefined): boolean {
  const code = error?.code;
  const message = error?.message?.toLowerCase() ?? "";
  return (
    code === "42P01" ||
    code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function isMissingRpcError(error: SupabaseErrorLike | null | undefined): boolean {
  const code = error?.code;
  const message = error?.message?.toLowerCase() ?? "";
  return code === "42883" || code === "PGRST202" || message.includes("function");
}

async function mapScreenshot(row: ScreenshotRow, client?: SupabaseClient): Promise<Screenshot> {
  const storagePath = row.storagePath ?? row.storage_path ?? "";
  const thumbnailPath = row.thumbnailPath ?? row.thumbnail_path ?? null;
  const [publicUrl, thumbnailUrl] = client
    ? await Promise.all([
        getStorageDisplayUrl(client, storagePath),
        getStorageDisplayUrl(client, thumbnailPath),
      ])
    : [null, null];

  return {
    id: row.id,
    userId: row.userId ?? row.user_id ?? "",
    gameId: row.gameId ?? row.game_id ?? null,
    storagePath,
    thumbnailPath,
    publicUrl,
    thumbnailUrl,
    caption: row.caption ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    sizeBytes: row.sizeBytes ?? row.size_bytes ?? null,
    isPublic: row.isPublic ?? row.is_public ?? false,
    createdAt: row.createdAt ?? row.created_at ?? "",
  };
}

export async function getMyScreenshots(
  options: GetMyScreenshotsOptions = {},
): Promise<Screenshot[]> {
  const client = getOptionalSupabaseClient();
  if (!client) return [];
  const userId = await getCurrentUserId(client);
  if (!userId) return [];
  const user = { id: userId };

  const requestedGameIds = Array.from(new Set((options.gameIds ?? []).filter(Boolean)));
  const requestedUuidGameIds = requestedGameIds.filter(isUuid);
  const needsClientFilter = requestedGameIds.some((id) => !isUuid(id));

  let query = client.from("screenshots").select("*").eq("user_id", user.id);
  if (requestedUuidGameIds.length > 0 && !needsClientFilter) {
    query = query.in("game_id", requestedUuidGameIds);
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return [];

  const screenshots = await Promise.all(
    ((data ?? []) as unknown as ScreenshotRow[]).map((row) => mapScreenshot(row, client)),
  );
  return requestedGameIds.length > 0
    ? screenshots.filter((shot) => screenshotMatchesGameIds(shot, requestedGameIds))
    : screenshots;
}

export async function getMyScreenshotsForGame(gameIds: string | string[]): Promise<Screenshot[]> {
  const ids = Array.isArray(gameIds) ? gameIds : [gameIds];
  const cleanIds = Array.from(new Set(ids.filter(Boolean)));
  if (cleanIds.length === 0) return [];
  return getMyScreenshots({ gameIds: cleanIds });
}

export async function listPublicScreenshotFeedScreenshots(
  options: ListPublicScreenshotFeedOptions = {},
): Promise<ScreenshotActionResult<Screenshot[]>> {
  const client = getOptionalSupabaseClient();
  if (!client) {
    return {
      ok: false,
      reason: "config",
      message: "Public screenshot feed needs Supabase configuration.",
    };
  }

  const limit = Math.min(Math.max(Math.round(options.limit ?? 12), 1), 48);
  const rpcClient = client as PublicScreenshotFeedRpcClient;

  if (typeof rpcClient.rpc === "function") {
    const { data, error } = await rpcClient.rpc("list_public_screenshot_feed_ranked", {
      p_limit: limit,
    });

    if (!error) {
      const publicRows = ((data ?? []) as unknown as ScreenshotRow[]).filter(
        (row) => (row.isPublic ?? row.is_public ?? false) === true,
      );
      const screenshots = await Promise.all(publicRows.map((row) => mapScreenshot(row, client)));
      return { ok: true, value: screenshots };
    }

    if (!isMissingSchemaError(error) && !isMissingRpcError(error)) {
      return {
        ok: false,
        reason: "database",
        message: error.message || "Public screenshot ranked feed could not be loaded.",
      };
    }
  }

  const publicFeedQuery = client
    .from("screenshots")
    .select("*")
    .eq("is_public", true) as unknown as PublicScreenshotFeedSelectQuery;

  const { data, error } = await publicFeedQuery
    .eq("moderation_status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      ok: false,
      reason: isMissingSchemaError(error) ? "schema" : "database",
      message: isMissingSchemaError(error)
        ? "Public screenshot feed schema is not applied yet."
        : error.message || "Public screenshot feed could not be loaded.",
    };
  }

  const publicRows = ((data ?? []) as unknown as ScreenshotRow[]).filter(
    (row) => (row.isPublic ?? row.is_public ?? false) === true,
  );
  const screenshots = await Promise.all(publicRows.map((row) => mapScreenshot(row, client)));

  return { ok: true, value: screenshots };
}

export async function uploadScreenshotForGame(
  input: UploadScreenshotInput,
): Promise<ScreenshotActionResult<Screenshot>> {
  const context = await getSignedInContext();
  if ("failure" in context) {
    return context.failure;
  }

  const { client, userId } = context;
  const storagePath = makeStoragePath(userId, input.gameId, input.file);
  const { error: uploadError } = await screenshotStorageBucket(client).upload(
    storagePath,
    input.file,
    {
      cacheControl: "3600",
      contentType: input.file.type || undefined,
      upsert: false,
    },
  );

  if (uploadError) {
    return {
      ok: false,
      reason: "storage",
      message: uploadError.message || "Screenshot upload failed.",
    };
  }

  const dbGameId = input.gameId && isUuid(input.gameId) ? input.gameId : null;
  const { data, error } = await client
    .from("screenshots")
    .insert({
      user_id: userId,
      game_id: dbGameId,
      storage_path: storagePath,
      thumbnail_path: null,
      caption: input.caption?.trim() || input.file.name || null,
      width: input.width ?? null,
      height: input.height ?? null,
      size_bytes: input.file.size,
      is_public: input.isPublic ?? false,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: isMissingSchemaError(error) ? "schema" : "database",
      message: error.message || "Screenshot metadata could not be saved.",
    };
  }

  if (!data) {
    return {
      ok: false,
      reason: "database",
      message: "Screenshot metadata was not returned.",
    };
  }

  return { ok: true, value: await mapScreenshot(data as unknown as ScreenshotRow, client) };
}

export async function updateScreenshotPrivacy(
  screenshotId: string,
  isPublic: boolean,
): Promise<ScreenshotActionResult<Screenshot>> {
  const context = await getSignedInContext();
  if ("failure" in context) {
    return context.failure;
  }

  const { client, userId } = context;
  const { data, error } = await client
    .from("screenshots")
    .update({ is_public: isPublic })
    .eq("id", screenshotId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: isMissingSchemaError(error) ? "schema" : "database",
      message: error.message || "Screenshot privacy could not be updated.",
    };
  }

  if (!data) {
    return {
      ok: false,
      reason: "database",
      message: "Screenshot was not found for this account.",
    };
  }

  return { ok: true, value: await mapScreenshot(data as unknown as ScreenshotRow, client) };
}

function screenshotLikesTable(client: SupabaseClient): ScreenshotLikesTable {
  return (client.from as unknown as (table: "screenshot_likes") => ScreenshotLikesTable)(
    "screenshot_likes",
  );
}

function emptyLikeMap(screenshotIds: string[]): Record<string, ScreenshotLikeState> {
  return Object.fromEntries(
    screenshotIds.map((id) => [id, { count: 0, likedByMe: false } satisfies ScreenshotLikeState]),
  );
}

export async function getScreenshotLikeState(
  screenshotIds: string[],
): Promise<ScreenshotLikeStateResult> {
  const ids = Array.from(new Set(screenshotIds.filter(Boolean)));
  const likes = emptyLikeMap(ids);
  if (ids.length === 0) {
    return { available: false, canLike: false, likes };
  }

  const client = getOptionalSupabaseClient();
  if (!client) {
    return {
      available: false,
      canLike: false,
      likes,
      message: "Cloud screenshot likes need Supabase configuration.",
    };
  }

  const userId = await getCurrentUserId(client);
  const { data, error } = await screenshotLikesTable(client)
    .select("screenshot_id,user_id")
    .in("screenshot_id", ids);

  if (error) {
    return {
      available: !isMissingSchemaError(error),
      canLike: Boolean(userId) && !isMissingSchemaError(error),
      likes,
      message: isMissingSchemaError(error)
        ? "Screenshot likes are not enabled yet."
        : error.message || "Screenshot likes could not be loaded.",
    };
  }

  for (const row of data ?? []) {
    const state = likes[row.screenshot_id];
    if (!state) {
      continue;
    }
    state.count += 1;
    state.likedByMe = state.likedByMe || row.user_id === userId;
  }

  return { available: true, canLike: Boolean(userId), likes };
}

export async function setScreenshotLiked(
  screenshotId: string,
  liked: boolean,
): Promise<ScreenshotActionResult<ScreenshotLikeState>> {
  const context = await getSignedInContext();
  if ("failure" in context) {
    return context.failure;
  }

  const { client, userId } = context;
  const table = screenshotLikesTable(client);
  const { error } = liked
    ? await table.insert({ screenshot_id: screenshotId, user_id: userId })
    : await table.delete().eq("screenshot_id", screenshotId).eq("user_id", userId);

  if (error && !(liked && error.code === "23505")) {
    return {
      ok: false,
      reason: isMissingSchemaError(error) ? "schema" : "database",
      message: isMissingSchemaError(error)
        ? "Screenshot likes are not enabled yet."
        : error.message || "Screenshot like could not be saved.",
    };
  }

  const result = await getScreenshotLikeState([screenshotId]);
  return {
    ok: true,
    value: result.likes[screenshotId] ?? { count: liked ? 1 : 0, likedByMe: liked },
  };
}
