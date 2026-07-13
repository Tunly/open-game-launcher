// deno-lint-ignore-file no-import-prefix
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  handlePlaytimeIngestion,
  type PlaytimeIngestionHandlerDeps,
  type PlaytimeIngestionWriteResult,
} from "./handler.ts";
import type { NormalizedPlaytimeIngestion } from "./playtime-ingestion.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const catalogGameId = "123e4567-e89b-42d3-a456-426614174000";
const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const launcherDeviceId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const aggregateOperationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const observedAt = "2026-06-15T12:00:00.000Z";

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
      aggregate: {
        gameId: catalogGameId,
        observedAt,
        operationId: aggregateOperationId,
        playtimeMinutes: 5,
      },
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
          id: sessionId,
          launcherDeviceId,
          startedAt: "2026-06-15T10:00:00.000Z",
        },
      ],
    }),
    stubDeps({
      writeResult: rejectedWrite({ ownerConflictSessionIds: [sessionId] }),
    }),
  );

  assertEquals(response.status, 409);
  assertEquals(await response.json(), {
    conflictingSessionIds: [sessionId],
    error: "Session id already belongs to another user.",
  });
});

Deno.test("playtime ingestion handler blocks immutable session payload conflicts", async () => {
  const response = await handlePlaytimeIngestion(
    sessionRequest(),
    stubDeps({
      writeResult: rejectedWrite({ payloadConflictSessionIds: [sessionId] }),
    }),
  );

  assertEquals(response.status, 409);
  assertEquals(await response.json(), {
    conflictingSessionIds: [sessionId],
    error: "Session id conflicts with an existing immutable payload.",
  });
});

Deno.test("playtime ingestion handler stabilizes malformed rejection results", async () => {
  const response = await handlePlaytimeIngestion(
    sessionRequest(),
    stubDeps({ writeResult: rejectedWrite({}) }),
  );

  assertEquals(response.status, 500);
  assertEquals(await response.json(), {
    error: "Playtime ingestion service unavailable.",
  });
});

Deno.test("playtime ingestion handler writes aggregate and sessions atomically", async () => {
  const ingestions: NormalizedPlaytimeIngestion[] = [];
  const response = await handlePlaytimeIngestion(
    jsonRequest({
      aggregate: {
        gameId: catalogGameId,
        observedAt,
        operationId: aggregateOperationId,
        playtimeMinutes: 42,
        sessionCountDelta: 2,
      },
      gameId: catalogGameId,
      sessions: [
        {
          endedAt: "2026-06-15T11:00:00.000Z",
          id: sessionId,
          launcherDeviceId,
          platform: "linux",
          startedAt: "2026-06-15T10:00:00.000Z",
        },
      ],
    }),
    stubDeps({ ingestions }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    aggregatePushed: true,
    ok: true,
    sessionsPushed: 1,
    userId,
  });
  assertEquals(ingestions, [{
    aggregate: {
      gameId: catalogGameId,
      observedAt,
      operation: "snapshot",
      operationId: aggregateOperationId,
      playtimeMinutes: 42,
      sessionCountDelta: 2,
    },
    sessions: [{
      durationMinutes: 60,
      endedAt: "2026-06-15T11:00:00.000Z",
      gameId: catalogGameId,
      id: sessionId,
      launcherDeviceId,
      platform: "linux",
      startedAt: "2026-06-15T10:00:00.000Z",
    }],
  }]);
});

Deno.test("playtime ingestion handler treats an identical committed retry as success", async () => {
  const ingestions: NormalizedPlaytimeIngestion[] = [];
  const deps = stubDeps({ ingestions });

  const first = await handlePlaytimeIngestion(sessionRequest(), deps);
  const retry = await handlePlaytimeIngestion(sessionRequest(), deps);

  assertEquals(first.status, 200);
  assertEquals(retry.status, 200);
  assertEquals(await first.json(), {
    aggregatePushed: false,
    ok: true,
    sessionsPushed: 1,
    userId,
  });
  assertEquals(await retry.json(), {
    aggregatePushed: false,
    ok: true,
    sessionsPushed: 1,
    userId,
  });
  assertEquals(ingestions.length, 2);
  assertEquals(ingestions[0], ingestions[1]);
});

Deno.test("playtime ingestion handler returns a stable CORS JSON error for dependency failures", async () => {
  const ingestions: NormalizedPlaytimeIngestion[] = [];
  const transactionFailure = new Error("transaction rolled back");

  const response = await handlePlaytimeIngestion(
    sessionRequest(),
    stubDeps({ ingestError: transactionFailure, ingestions }),
  );
  assertEquals(response.status, 500);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(await response.json(), {
    error: "Playtime ingestion service unavailable.",
  });
  assertEquals(ingestions.length, 1);
});

Deno.test("playtime ingestion handler stabilizes catalog lookup failures", async () => {
  const response = await handlePlaytimeIngestion(
    jsonRequest({
      aggregate: {
        gameId: catalogGameId,
        observedAt,
        operationId: aggregateOperationId,
        playtimeMinutes: 5,
      },
    }),
    stubDeps({ catalogError: new Error("catalog unavailable") }),
  );

  assertEquals(response.status, 500);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(await response.json(), {
    error: "Playtime ingestion service unavailable.",
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

function sessionRequest() {
  return jsonRequest({
    gameId: catalogGameId,
    sessions: [{
      endedAt: "2026-06-15T11:00:00.000Z",
      id: sessionId,
      launcherDeviceId,
      platform: "linux",
      startedAt: "2026-06-15T10:00:00.000Z",
    }],
  });
}

function stubDeps(
  options: {
    authResponse?: Response;
    catalogError?: unknown;
    ingestError?: unknown;
    ingestions?: NormalizedPlaytimeIngestion[];
    missingGameIds?: string[];
    writeResult?: PlaytimeIngestionWriteResult;
  } = {},
): PlaytimeIngestionHandlerDeps {
  return {
    authenticateRequest: () =>
      Promise.resolve(
        options.authResponse ?? { adminClient: "stub", userId },
      ),
    findMissingCatalogGames: (auth, gameIds) => {
      assertEquals(auth.userId, userId);
      if (options.catalogError !== undefined) {
        return Promise.reject(options.catalogError);
      }
      return Promise.resolve(
        gameIds.length === 0 ? [] : options.missingGameIds ?? [],
      );
    },
    ingestPlaytime: (auth, ingestion) => {
      assertEquals(auth.userId, userId);
      options.ingestions?.push(ingestion);
      if (options.ingestError !== undefined) {
        return Promise.reject(options.ingestError);
      }
      return Promise.resolve(
        options.writeResult ?? {
          accepted: true,
          aggregatePushed: Boolean(ingestion.aggregate),
          ownerConflictSessionIds: [],
          payloadConflictSessionIds: [],
          sessionsPushed: ingestion.sessions.length,
        },
      );
    },
  };
}

function rejectedWrite(
  overrides: Partial<PlaytimeIngestionWriteResult>,
): PlaytimeIngestionWriteResult {
  return {
    accepted: false,
    aggregatePushed: false,
    ownerConflictSessionIds: [],
    payloadConflictSessionIds: [],
    sessionsPushed: 0,
    ...overrides,
  };
}
