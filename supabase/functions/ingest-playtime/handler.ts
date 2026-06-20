import {
  listPlaytimeIngestionGameIds,
  type NormalizedPlaytimeAggregate,
  type NormalizedPlaytimeSession,
  normalizePlaytimeIngestionPayload,
  PlaytimeIngestionValidationError,
} from "./playtime-ingestion.ts";

export type PlaytimeIngestionAuthContext = {
  adminClient?: unknown;
  userId: string;
};

type PlaytimeIngestionAuthResult = PlaytimeIngestionAuthContext | Response;

export interface PlaytimeIngestionHandlerDeps {
  authenticateRequest: (
    request: Request,
  ) => Promise<PlaytimeIngestionAuthResult>;
  findConflictingSessionIds: (
    auth: PlaytimeIngestionAuthContext,
    sessionIds: string[],
  ) => Promise<string[]>;
  findMissingCatalogGames: (
    auth: PlaytimeIngestionAuthContext,
    gameIds: string[],
  ) => Promise<string[]>;
  upsertAggregate: (
    auth: PlaytimeIngestionAuthContext,
    aggregate: NormalizedPlaytimeAggregate,
  ) => Promise<void>;
  upsertSessions: (
    auth: PlaytimeIngestionAuthContext,
    sessions: NormalizedPlaytimeSession[],
  ) => Promise<void>;
}

const playtimeIngestionCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-account-deletion-secret, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...playtimeIngestionCorsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export async function handlePlaytimeIngestion(
  request: Request,
  deps: PlaytimeIngestionHandlerDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: playtimeIngestionCorsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authResult = await deps.authenticateRequest(request);
  if (authResult instanceof Response) {
    return authResult;
  }

  let ingestion;
  try {
    ingestion = normalizePlaytimeIngestionPayload(
      await request.json().catch(() => null),
    );
  } catch (error) {
    if (error instanceof PlaytimeIngestionValidationError) {
      return jsonResponse(
        { error: error.message, details: error.details },
        400,
      );
    }
    throw error;
  }

  const gameIds = listPlaytimeIngestionGameIds(ingestion);
  const missingGameIds = await deps.findMissingCatalogGames(
    authResult,
    gameIds,
  );
  if (missingGameIds.length > 0) {
    return jsonResponse(
      { error: "Unknown catalog game id.", missingGameIds },
      404,
    );
  }

  const conflictingSessionIds = await deps.findConflictingSessionIds(
    authResult,
    ingestion.sessions.map((session) => session.id),
  );
  if (conflictingSessionIds.length > 0) {
    return jsonResponse(
      {
        error: "Session id already belongs to another user.",
        conflictingSessionIds,
      },
      409,
    );
  }

  if (ingestion.aggregate) {
    await deps.upsertAggregate(authResult, ingestion.aggregate);
  }

  if (ingestion.sessions.length > 0) {
    await deps.upsertSessions(authResult, ingestion.sessions);
  }

  return jsonResponse({
    aggregatePushed: Boolean(ingestion.aggregate),
    ok: true,
    sessionsPushed: ingestion.sessions.length,
    userId: authResult.userId,
  });
}
