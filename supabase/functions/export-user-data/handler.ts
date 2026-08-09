import {
  exportAdditionalUserScopedReads,
  exportOwnUserIdTables,
} from "./contract.ts";

export type JsonObject = Record<string, unknown>;

export type ExportUser = {
  app_metadata?: unknown;
  created_at?: string;
  email?: string;
  id: string;
  last_sign_in_at?: string;
  user_metadata?: unknown;
};

export type ExportPayload = {
  data: JsonObject;
  generatedAt: string;
  user: {
    appMetadata: JsonObject;
    createdAt?: string;
    email?: string;
    id: string;
    lastSignInAt?: string;
    userMetadata: JsonObject;
  };
};

type ExportAuthResult = { user: ExportUser } | Response;

export interface ExportUserDataHandlerDeps {
  authenticateRequest: (request: Request) => Promise<ExportAuthResult>;
  now: () => Date;
  readRows: (
    table: string,
    column: string,
    value: string,
    warnings: string[],
  ) => Promise<JsonObject[]>;
  readRowsIn: (
    table: string,
    column: string,
    values: string[],
    warnings: string[],
  ) => Promise<JsonObject[]>;
  readRowsWithOr: (
    table: string,
    filter: string,
    warnings: string[],
  ) => Promise<JsonObject[]>;
}

const exportUserDataCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-account-deletion-secret, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...exportUserDataCorsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export async function handleExportUserData(
  request: Request,
  deps: ExportUserDataHandlerDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: exportUserDataCorsHeaders });
  }

  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authResult = await deps.authenticateRequest(request);
  if (authResult instanceof Response) {
    return authResult;
  }

  return jsonResponse(await buildExportPayload(authResult.user, deps));
}

export async function buildExportPayload(
  user: ExportUser,
  deps: Omit<ExportUserDataHandlerDeps, "authenticateRequest">,
): Promise<ExportPayload> {
  const userId = user.id;
  const warnings: string[] = [];

  const data: JsonObject = {
    profiles: await deps.readRows("profiles", "id", userId, warnings),
  };

  for (const table of exportOwnUserIdTables) {
    data[table] = await deps.readRows(table, "user_id", userId, warnings);
  }

  for (const read of exportAdditionalUserScopedReads) {
    data[read.key] = await deps.readRows(
      read.table,
      read.column,
      userId,
      warnings,
    );
  }

  data.friendships = await deps.readRowsWithOr(
    "friendships",
    `requester_id.eq.${userId},addressee_id.eq.${userId}`,
    warnings,
  );
  const userBlocks = await deps.readRows(
    "user_blocks",
    "blocker_id",
    userId,
    warnings,
  );
  data.user_blocks = userBlocks.filter((row) => row.blocker_id === userId);
  data.profile_comments = await deps.readRowsWithOr(
    "profile_comments",
    `profile_user_id.eq.${userId},author_id.eq.${userId}`,
    warnings,
  );
  data.friend_links = await deps.readRows(
    "friend_links",
    "owner_id",
    userId,
    warnings,
  );
  data.chat_rooms = await deps.readRows(
    "chat_rooms",
    "created_by",
    userId,
    warnings,
  );
  data.chat_messages = await deps.readRows(
    "chat_messages",
    "sender_id",
    userId,
    warnings,
  );
  data.game_invites = await deps.readRowsWithOr(
    "game_invites",
    `sender_id.eq.${userId},receiver_id.eq.${userId}`,
    warnings,
  );
  data.store_review_reports = await deps.readRows(
    "store_review_reports",
    "reporter_user_id",
    userId,
    warnings,
  );
  data.store_review_replies = await deps.readRows(
    "store_review_replies",
    "developer_user_id",
    userId,
    warnings,
  );

  const familyGroups = await deps.readRows(
    "family_groups",
    "owner_id",
    userId,
    warnings,
  );
  const familyMemberships = await deps.readRows(
    "family_members",
    "user_id",
    userId,
    warnings,
  );
  const familyIds = uniqueStrings([
    ...pluckIds(familyGroups),
    ...familyMemberships
      .map((row) => readString(row, "family_id"))
      .filter(Boolean),
  ]);
  data.family_groups = familyGroups;
  data.family_members = familyMemberships;
  data.family_shared_games = await deps.readRowsIn(
    "family_shared_games",
    "family_id",
    familyIds,
    warnings,
  );

  const legacyMods = Array.isArray(data.mods) ? data.mods as JsonObject[] : [];
  const legacyModIds = pluckIds(legacyMods);
  const modReadIds = legacyMods.length > 0 ? legacyModIds : null;
  const modVersions = await deps.readRowsIn(
    "mod_versions",
    "mod_id",
    legacyModIds,
    warnings,
  );
  const modVersionIds = legacyMods.length > 0 ? pluckIds(modVersions) : [];
  data.mod_versions = modReadIds === null ? [] : modVersions;
  data.mod_files = await deps.readRowsIn(
    "mod_files",
    "mod_version_id",
    modVersionIds,
    warnings,
  );
  data.mod_dependencies = await deps.readRowsIn(
    "mod_dependencies",
    "mod_id",
    legacyModIds,
    warnings,
  );
  data.__warnings = warnings;

  return {
    data,
    generatedAt: deps.now().toISOString(),
    user: {
      appMetadata: asJsonObject(user.app_metadata),
      createdAt: user.created_at,
      email: user.email,
      id: user.id,
      lastSignInAt: user.last_sign_in_at,
      userMetadata: asJsonObject(user.user_metadata),
    },
  };
}

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function pluckIds(rows: JsonObject[]) {
  return rows.map((row) => readString(row, "id")).filter(isString);
}

function readString(row: JsonObject, key: string) {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function uniqueStrings(values: Array<string | null>) {
  return Array.from(new Set(values.filter(isString)));
}

function isString(value: string | null): value is string {
  return Boolean(value);
}
