import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  handlePlaytimeIngestion,
  type PlaytimeIngestionAuthContext,
  type PlaytimeIngestionHandlerDeps,
} from "./handler.ts";
import type {
  NormalizedPlaytimeAggregate,
  NormalizedPlaytimeSession,
} from "./playtime-ingestion.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const catalogGameId = "123e4567-e89b-42d3-a456-426614174000";

Deno.test("playtime ingestion handler answers CORS and method guards", async () => {
  const optionsResponse = await handlePlaytimeIngestion(
    new Request("https://functions.example/ingest-playtime", {
      method: "OPTIONS",
    }),
    stubDeps(),
  );

  assertEquals(optionsResponse.status, 200);
  assertEquals(optionsResponse.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(
    optionsResponse.headers.get("Access-Control-Allow-Methods"),
    "GET, POST, OPTIONS",
  );

  const getResponse = await handlePlaytimeIngestion(
    new Request("https://functions.example/ingest-playtime", {
      method: "GET",
    }),
    stubDeps(),
  );

  assertEquals(getResponse.status, 405);
  assertEquals(await getResponse.json(), { error: "Method not allowed." });
});

Deno.test("playtime ingestion handler requires caller auth before parsing", async () => {
  const response = await handlePlaytimeIngestion(
    jsonRequest({}),
    stubDeps({
      authResponse: new Response(
        JSON.stringify({ error: "Invalid or expired session." }),
        { status: 401 },
      ),
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), {
    error: "Invalid or expired session.",
  });
});

Deno.test("playtime ingestion handler returns parser details", async () => {
  const response = await handlePlaytimeIngestion(
    jsonRequest({}),
    stubDeps(),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    details: ["At least one aggregate row or session row is required."],
    error: "Invalid playtime ingestion payload.",
  });
});

Deno.test("playtime ingestion handler blocks unknown catalog games", async () => {
  const response = await handlePlaytimeIngestion(
    jsonRequest({
      aggregate: { gameId: catalogGameId, playtimeMinutes: 5 },
    }),
    stubDeps({ missingGameIds: [catalogGameId] }),
  );

  assertEquals(response.status, 404);
  assertEquals(await response.json(), {
    error: "Unknown catalog game id.",
    missingGameIds: [catalogGameId],
  });
});

Deno.test("playtime ingestion handler blocks session id conflicts", async () => {
  const response = await handlePlaytimeIngestion(
    jsonRequest({
      gameId: catalogGameId,
      sessions: [
        {
          id: "session-1",
          startedAt: "2026-06-15T10:00:00.000Z",
        },
      ],
    }),
    stubDeps({ conflictingSessionIds: ["session-1"] }),
  );

  assertEquals(response.status, 409);
  assertEquals(await response.json(), {
    conflictingSessionIds: ["session-1"],
    error: "Session id already belongs to another user.",
  });
});

Deno.test("playtime ingestion handler writes aggregate and sessions", async () => {
  const aggregates: NormalizedPlaytimeAggregate[] = [];
  const sessions: NormalizedPlaytimeSession[][] = [];
  const response = await handlePlaytimeIngestion(
    jsonRequest({
      aggregate: {
        gameId: catalogGameId,
        playtimeMinutes: 42,
        totalSessions: 2,
      },
      gameId: catalogGameId,
      sessions: [
        {
          endedAt: "2026-06-15T11:00:00.000Z",
          id: "session-1",
          platform: "linux",
          startedAt: "2026-06-15T10:00:00.000Z",
        },
      ],
    }),
    stubDeps({ aggregates, sessions }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    aggregatePushed: true,
    ok: true,
    sessionsPushed: 1,
    userId,
  });
  assertEquals(aggregates, [
    {
      gameId: catalogGameId,
      playtimeMinutes: 42,
      totalSessions: 2,
    },
  ]);
  assertEquals(sessions[0][0], {
    durationMinutes: 60,
    endedAt: "2026-06-15T11:00:00.000Z",
    gameId: catalogGameId,
    id: "session-1",
    launcherDeviceId: null,
    platform: "linux",
    startedAt: "2026-06-15T10:00:00.000Z",
  });
});

function jsonRequest(body: Record<string, unknown>) {
  return new Request("https://functions.example/ingest-playtime", {
    body: JSON.stringify(body),
    headers: {
      Authorization: "Bearer user-jwt",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

function stubDeps(
  options: {
    aggregates?: NormalizedPlaytimeAggregate[];
    authResponse?: Response;
    conflictingSessionIds?: string[];
    missingGameIds?: string[];
    sessions?: NormalizedPlaytimeSession[][];
  } = {},
): PlaytimeIngestionHandlerDeps {
  return {
    authenticateRequest: async () =>
      options.authResponse ?? { adminClient: "stub", userId },
    findConflictingSessionIds: async (
      auth: PlaytimeIngestionAuthContext,
      sessionIds,
    ) => {
      assertEquals(auth.userId, userId);
      if (sessionIds.length === 0) return [];
      return options.conflictingSessionIds ?? [];
    },
    findMissingCatalogGames: async (auth, gameIds) => {
      assertEquals(auth.userId, userId);
      if (gameIds.length === 0) return [];
      return options.missingGameIds ?? [];
    },
    upsertAggregate: async (auth, aggregate) => {
      assertEquals(auth.userId, userId);
      options.aggregates?.push(aggregate);
    },
    upsertSessions: async (auth, sessions) => {
      assertEquals(auth.userId, userId);
      options.sessions?.push(sessions);
    },
  };
}
