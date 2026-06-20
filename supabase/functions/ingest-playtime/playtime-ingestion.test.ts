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

Deno.test("normalizes aggregate and session rows for trusted ingestion", () => {
  const result = normalizePlaytimeIngestionPayload({
    aggregate: {
      gameId: catalogGameId,
      installedVersion: "1.2.3",
      lastPlayedAt: "2026-06-10T12:00:00+02:00",
      playtimeMinutes: 92.9,
      totalSessions: 3,
    },
    sessions: [
      {
        endedAt: "2026-06-10T11:30:00.000Z",
        id: "local-session-1",
        platform: "WINDOWS",
        startedAt: "2026-06-10T10:00:00.000Z",
      },
    ],
    gameId: catalogGameId,
  });

  assertEquals(result.aggregate?.playtimeMinutes, 92);
  assertEquals(result.aggregate?.lastPlayedAt, "2026-06-10T10:00:00.000Z");
  assertEquals(result.aggregate?.installedVersion, "1.2.3");
  assertEquals(result.sessions[0], {
    durationMinutes: 90,
    endedAt: "2026-06-10T11:30:00.000Z",
    gameId: catalogGameId,
    id: "local-session-1",
    launcherDeviceId: null,
    platform: "windows",
    startedAt: "2026-06-10T10:00:00.000Z",
  });
});

Deno.test("deduplicates catalog game ids across aggregate and sessions", () => {
  const result = normalizePlaytimeIngestionPayload({
    aggregate: {
      gameId: catalogGameId,
      playtimeMinutes: 15,
    },
    sessions: [
      {
        gameId: catalogGameId,
        id: "same-game",
        startedAt: "2026-06-10T10:00:00.000Z",
      },
      {
        gameId: secondGameId,
        id: "second-game",
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

Deno.test("rejects empty payloads", () => {
  const error = assertThrows(
    () => normalizePlaytimeIngestionPayload({}),
    PlaytimeIngestionValidationError,
  );

  assertEquals(error.details, [
    "At least one aggregate row or session row is required.",
  ]);
});
