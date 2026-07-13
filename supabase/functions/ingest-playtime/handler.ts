import {
  listPlaytimeIngestionGameIds,
  type NormalizedPlaytimeIngestion,
  normalizePlaytimeIngestionPayload,
  PlaytimeIngestionValidationError,
} from "./playtime-ingestion.ts";

export type PlaytimeIngestionAuthContext = {
  adminClient?: unknown;
  userId: string;
};

type PlaytimeIngestionAuthResult = PlaytimeIngestionAuthContext | Response;

export type PlaytimeIngestionWriteResult = {
  accepted: boolean;
  aggregatePushed: boolean;
  ownerConflictSessionIds: string[];
  payloadConflictSessionIds: string[];
  sessionsPushed: number;
};

export interface PlaytimeIngestionHandlerDeps {
  authenticateRequest: (
    request: Request,
  ) => Promise<PlaytimeIngestionAuthResult>;
  findMissingCatalogGames: (
    auth: PlaytimeIngestionAuthContext,
    gameIds: string[],
  ) => Promise<string[]>;
  ingestPlaytime: (
    auth: PlaytimeIngestionAuthContext,
    ingestion: NormalizedPlaytimeIngestion,
  ) => Promise<PlaytimeIngestionWriteResult>;
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

  let authResult: PlaytimeIngestionAuthResult;
  try {
    authResult = await deps.authenticateRequest(request);
  } catch (error) {
    console.error("Playtime ingestion authentication failed.", error);
    return jsonResponse(
      { error: "Playtime ingestion service unavailable." },
      500,
    );
  }
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
  let missingGameIds: string[];
  try {
    missingGameIds = await deps.findMissingCatalogGames(
      authResult,
      gameIds,
    );
  } catch (error) {
    console.error("Playtime ingestion catalog lookup failed.", error);
    return jsonResponse(
      { error: "Playtime ingestion service unavailable." },
      500,
    );
  }
  if (missingGameIds.length > 0) {
    return jsonResponse(
      { error: "Unknown catalog game id.", missingGameIds },
      404,
    );
  }

  let writeResult: PlaytimeIngestionWriteResult;
  try {
    writeResult = await deps.ingestPlaytime(authResult, ingestion);
  } catch (error) {
    console.error("Atomic playtime ingestion failed.", error);
    return jsonResponse(
      { error: "Playtime ingestion service unavailable." },
      500,
    );
  }
  if (!writeResult.accepted) {
    const conflictingSessionIds = Array.from(
      new Set([
        ...writeResult.ownerConflictSessionIds,
        ...writeResult.payloadConflictSessionIds,
      ]),
    );
    if (conflictingSessionIds.length === 0) {
      console.error(
        "Atomic playtime ingestion was rejected without conflict details.",
      );
      return jsonResponse(
        { error: "Playtime ingestion service unavailable." },
        500,
      );
    }

    const hasOwnerConflicts = writeResult.ownerConflictSessionIds.length > 0;
    const hasPayloadConflicts =
      writeResult.payloadConflictSessionIds.length > 0;
    let error = "Session id already belongs to another user.";
    if (hasOwnerConflicts && hasPayloadConflicts) {
      error =
        "Session ids conflict with existing owners or immutable payloads.";
    } else if (hasPayloadConflicts) {
      error = "Session id conflicts with an existing immutable payload.";
    }
    return jsonResponse(
      {
        error,
        conflictingSessionIds,
      },
      409,
    );
  }

  return jsonResponse({
    aggregatePushed: writeResult.aggregatePushed,
    ok: true,
    sessionsPushed: writeResult.sessionsPushed,
    userId: authResult.userId,
  });
}
