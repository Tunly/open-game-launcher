// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  listPlaytimeIngestionGameIds,
  normalizePlaytimeIngestionPayload,
  PlaytimeIngestionValidationError,
} from "./playtime-ingestion.ts";

const catalogGameId = "123e4567-e89b-42d3-a456-426614174000";
const secondGameId = "123e4567-e89b-42d3-a456-426614174001";
const firstSessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secondSessionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const launcherDeviceId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const aggregateOperationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const observedAt = "2026-06-15T12:00:00.000Z";

Deno.test("normalizes aggregate and session rows for trusted ingestion", () => {
  const result = normalizePlaytimeIngestionPayload({
    aggregate: {
      gameId: catalogGameId,
      installedVersion: "1.2.3",
      lastPlayedAt: "2026-06-10T12:00:00+02:00",
      observedAt,
      operationId: aggregateOperationId,
      playtimeMinutes: 92.9,
      sessionCountDelta: 3,
    },
    sessions: [
      {
        endedAt: "2026-06-10T11:30:00.000Z",
        id: firstSessionId,
        launcherDeviceId,
        platform: "WINDOWS",
        startedAt: "2026-06-10T10:00:00.000Z",
      },
    ],
    gameId: catalogGameId,
  });

  assertEquals(result.aggregate?.playtimeMinutes, 92);
  assertEquals(result.aggregate?.lastPlayedAt, "2026-06-10T10:00:00.000Z");
  assertEquals(result.aggregate?.installedVersion, "1.2.3");
  assertEquals(result.aggregate?.operation, "snapshot");
  assertEquals(result.aggregate?.operationId, aggregateOperationId);
  assertEquals(result.aggregate?.sessionCountDelta, 3);
  assertEquals(result.sessions[0], {
    durationMinutes: 90,
    endedAt: "2026-06-10T11:30:00.000Z",
    gameId: catalogGameId,
    id: firstSessionId,
    launcherDeviceId,
    platform: "windows",
    startedAt: "2026-06-10T10:00:00.000Z",
  });
});

Deno.test("deduplicates catalog game ids across aggregate and sessions", () => {
  const result = normalizePlaytimeIngestionPayload({
    aggregate: {
      gameId: catalogGameId,
      observedAt,
      operationId: aggregateOperationId,
      playtimeMinutes: 15,
    },
    sessions: [
      {
        gameId: catalogGameId,
        id: firstSessionId,
        startedAt: "2026-06-10T10:00:00.000Z",
      },
      {
        gameId: secondGameId,
        id: secondSessionId,
        startedAt: "2026-06-10T10:00:00.000Z",
      },
    ],
  });

  assertEquals(listPlaytimeIngestionGameIds(result), [
    catalogGameId,
    secondGameId,
  ]);
});

Deno.test("rejects non-idempotent or spoofable session payloads", () => {
  const error = assertThrows(
    () =>
      normalizePlaytimeIngestionPayload({
        gameId: "not-a-uuid",
        sessions: [
          {
            endedAt: "2026-06-10T09:00:00.000Z",
            startedAt: "2026-06-10T10:00:00.000Z",
          },
        ],
      }),
    PlaytimeIngestionValidationError,
  );

  assertEquals(error.details, [
    "sessions[0].id is required for idempotent ingestion.",
    "sessions[0].gameId must be a catalog game UUID.",
    "sessions[0].endedAt must be after startedAt.",
  ]);
});

Deno.test("rejects session and device ids that cannot reach UUID columns", () => {
  const error = assertThrows(
    () =>
      normalizePlaytimeIngestionPayload({
        gameId: catalogGameId,
        sessions: [
          {
            id: "local-session-1",
            launcherDeviceId: "device-1",
            startedAt: "2026-06-10T10:00:00.000Z",
          },
        ],
      }),
    PlaytimeIngestionValidationError,
  );

  assertEquals(error.details, [
    "sessions[0].id must be a UUID.",
    "sessions[0].launcherDeviceId must be a UUID.",
  ]);
});

Deno.test("rejects empty payloads", () => {
  const error = assertThrows(
    () => normalizePlaytimeIngestionPayload({}),
    PlaytimeIngestionValidationError,
  );

  assertEquals(error.details, [
    "At least one aggregate row or session row is required.",
  ]);
});

Deno.test("treats explicit null aggregate as absent and preserves nullable aliases", () => {
  const sessionOnly = normalizePlaytimeIngestionPayload({
    aggregate: null,
    gameId: catalogGameId,
    playtimeMinutes: 999,
    sessions: [{
      endedAt: null,
      id: firstSessionId,
      launcherDeviceId: null,
      startedAt: "2026-06-10T10:00:00.000Z",
    }],
  });
  assertEquals(sessionOnly.aggregate, null);
  assertEquals(sessionOnly.sessions[0].endedAt, null);
  assertEquals(sessionOnly.sessions[0].launcherDeviceId, null);

  const nullableAggregate = normalizePlaytimeIngestionPayload({
    aggregate: {
      firstPlayedAt: null,
      gameId: catalogGameId,
      installedVersion: null,
      lastPlayedAt: null,
      observedAt,
      operationId: aggregateOperationId,
      playtimeMinutes: 10,
    },
  });
  assertEquals(nullableAggregate.aggregate, {
    firstPlayedAt: null,
    gameId: catalogGameId,
    installedVersion: null,
    lastPlayedAt: null,
    observedAt,
    operation: "snapshot",
    operationId: aggregateOperationId,
    playtimeMinutes: 10,
  });
});

Deno.test("canonicalizes accepted UUIDs before catalog lookup and RPC writes", () => {
  const result = normalizePlaytimeIngestionPayload({
    aggregate: {
      gameId: catalogGameId.toUpperCase(),
      observedAt,
      operationId: aggregateOperationId.toUpperCase(),
      playtimeMinutes: 10,
    },
    sessions: [{
      gameId: secondGameId.toUpperCase(),
      id: firstSessionId.toUpperCase(),
      launcherDeviceId: launcherDeviceId.toUpperCase(),
      startedAt: "2026-06-10T10:00:00.000Z",
    }],
  });

  assertEquals(result.aggregate?.gameId, catalogGameId);
  assertEquals(result.aggregate?.operationId, aggregateOperationId);
  assertEquals(result.sessions[0].gameId, secondGameId);
  assertEquals(result.sessions[0].id, firstSessionId);
  assertEquals(result.sessions[0].launcherDeviceId, launcherDeviceId);
});

Deno.test("rejects scalar coercion, out-of-range values, and normalized calendar dates", () => {
  const malformedNumber = assertThrows(
    () =>
      normalizePlaytimeIngestionPayload({
        aggregate: {
          gameId: catalogGameId,
          observedAt,
          operationId: aggregateOperationId,
          playtimeMinutes: "42junk",
        },
      }),
    PlaytimeIngestionValidationError,
  );
  assertEquals(malformedNumber.details, [
    "playtimeMinutes must be a finite numeric value.",
  ]);

  const negativeNumber = assertThrows(
    () =>
      normalizePlaytimeIngestionPayload({
        aggregate: {
          gameId: catalogGameId,
          observedAt,
          operationId: aggregateOperationId,
          playtimeMinutes: -1,
        },
      }),
    PlaytimeIngestionValidationError,
  );
  assertEquals(negativeNumber.details, [
    "playtimeMinutes must be between 0 and 10000000.",
  ]);

  const invalidDate = assertThrows(
    () =>
      normalizePlaytimeIngestionPayload({
        aggregate: {
          gameId: catalogGameId,
          observedAt: "2026-02-30T10:00:00.000Z",
          operationId: aggregateOperationId,
          playtimeMinutes: 10,
        },
      }),
    PlaytimeIngestionValidationError,
  );
  assertEquals(invalidDate.details, [
    "observedAt must be a valid ISO timestamp.",
  ]);
});

Deno.test("preserves valid microsecond observation precision", () => {
  const result = normalizePlaytimeIngestionPayload({
    aggregate: {
      gameId: catalogGameId,
      observedAt: "2026-06-15T14:00:00.123456+02:00",
      operationId: aggregateOperationId,
      playtimeMinutes: 10,
    },
  });

  assertEquals(result.aggregate?.observedAt, "2026-06-15T12:00:00.123456Z");
});

Deno.test("requires idempotent operations and atomic session deltas", () => {
  const missingOperation = assertThrows(
    () =>
      normalizePlaytimeIngestionPayload({
        aggregate: {
          gameId: catalogGameId,
          observedAt,
          playtimeMinutes: 10,
        },
      }),
    PlaytimeIngestionValidationError,
  );
  assertEquals(missingOperation.details, [
    "operationId is required for idempotent ingestion.",
  ]);

  const absoluteCount = assertThrows(
    () =>
      normalizePlaytimeIngestionPayload({
        aggregate: {
          gameId: catalogGameId,
          observedAt,
          operationId: aggregateOperationId,
          playtimeMinutes: 10,
          totalSessions: 2,
        },
      }),
    PlaytimeIngestionValidationError,
  );
  assertEquals(absoluteCount.details, [
    "totalSessions is not supported; use sessionCountDelta for atomic increments.",
  ]);

  const correctionDelta = assertThrows(
    () =>
      normalizePlaytimeIngestionPayload({
        aggregate: {
          gameId: catalogGameId,
          observedAt,
          operation: "correction",
          operationId: aggregateOperationId,
          playtimeMinutes: 10,
          sessionCountDelta: 1,
        },
      }),
    PlaytimeIngestionValidationError,
  );
  assertEquals(correctionDelta.details, [
    "correction aggregates cannot increment sessions.",
  ]);
});
