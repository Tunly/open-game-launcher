import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  type AchievementCatalogGame,
  type AchievementIngestionAuthContext,
  type AchievementIngestionHandlerDeps,
  handleAchievementIngestion,
} from "./handler.ts";
import type { NormalizedAchievement } from "./achievement-ingestion.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const catalogGameId = "123e4567-e89b-42d3-a456-426614174000";

Deno.test("achievement ingestion handler answers CORS and method guards", async () => {
  const optionsResponse = await handleAchievementIngestion(
    new Request("https://functions.example/ingest-achievements", {
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

  const getResponse = await handleAchievementIngestion(
    new Request("https://functions.example/ingest-achievements", {
      method: "GET",
    }),
    stubDeps(),
  );

  assertEquals(getResponse.status, 405);
  assertEquals(await getResponse.json(), { error: "Method not allowed." });
});

Deno.test(
  "achievement ingestion handler requires caller auth before parsing",
  async () => {
    const response = await handleAchievementIngestion(
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
  },
);

Deno.test("achievement ingestion handler returns parser details", async () => {
  const response = await handleAchievementIngestion(
    jsonRequest({}),
    stubDeps(),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    details: ["gameId is required.", "achievements must be an array."],
    error: "Invalid achievement ingestion payload.",
  });
});

Deno.test("achievement ingestion handler blocks unknown catalog games", async () => {
  const response = await handleAchievementIngestion(
    jsonRequest({
      achievements: [{ id: "FIRST_WIN", name: "First Win" }],
      gameId: catalogGameId,
      provider: "steam",
    }),
    stubDeps({ catalogGame: null }),
  );

  assertEquals(response.status, 404);
  assertEquals(await response.json(), {
    error: "Unknown catalog game id.",
    missingGameIds: [catalogGameId],
  });
});

Deno.test("achievement ingestion handler keeps ordinary client payloads local-only", async () => {
  const definitions: NormalizedAchievement[][] = [];
  const recordedUnlocks: NormalizedAchievement[][] = [];
  const response = await handleAchievementIngestion(
    jsonRequest({
      achievements: [{
        id: "FORGED",
        name: "Forged official unlock",
        unlockedAt: "2026-06-15T10:00:00.000Z",
      }],
      gameId: catalogGameId,
      provider: "steam",
      providerConfidence: "official",
      syncedAt: "2026-06-15T10:05:00.000Z",
    }),
    stubDeps({
      definitions,
      hasTrustedAttestation: false,
      recordedUnlocks,
    }),
  );

  assertEquals(response.status, 202);
  assertEquals(await response.json(), {
    achievementsSynced: 0,
    newUnlocks: 0,
    ok: true,
    persistence: "local_only",
    receivedAchievements: 1,
    receivedUnlocks: 1,
    trust: "unverified",
    unlockedCount: 0,
    userId,
    xpDelta: 0,
  });
  assertEquals(definitions, []);
  assertEquals(recordedUnlocks, []);
});

Deno.test(
  "achievement ingestion handler reports unresolved definitions",
  async () => {
    const response = await handleAchievementIngestion(
      jsonRequest({
        achievements: [{ id: "FIRST_WIN", name: "First Win" }],
        gameId: catalogGameId,
        provider: "steam",
        syncedAt: "2026-06-15T10:05:00.000Z",
      }),
      stubDeps({ definitionIdsByKey: new Map() }),
    );

    assertEquals(response.status, 409);
    assertEquals(await response.json(), {
      error: "Achievement definitions could not be resolved.",
      missingDefinitionKeys: ["steam:FIRST_WIN"],
    });
  },
);

Deno.test(
  "achievement ingestion handler records new unlocks atomically and reports xp",
  async () => {
    const definitions: NormalizedAchievement[][] = [];
    const recordedUnlocks: NormalizedAchievement[][] = [];
    const recordCalls: Array<{ gameTitle: string | null }> = [];

    const response = await handleAchievementIngestion(
      jsonRequest({
        achievements: [
          {
            id: "FIRST_WIN",
            name: "First Win",
            rarity: "uncommon",
            unlockedAt: "2026-06-15T10:00:00.000Z",
          },
          {
            id: "LOCKED_HINT",
            name: "Locked Hint",
            rarity: "legendary",
          },
        ],
        gameId: catalogGameId,
        launcherDeviceId: "device-1",
        provider: "steam",
        providerConfidence: "official",
        syncedAt: "2026-06-15T10:05:00.000Z",
      }),
      stubDeps({
        definitions,
        insertedUnlockKeys: new Set(["steam:FIRST_WIN"]),
        recordCalls,
        recordedUnlocks,
      }),
    );

    assertEquals(response.status, 200);
    assertEquals(await response.json(), {
      achievementsSynced: 2,
      newUnlocks: 1,
      ok: true,
      unlockedCount: 1,
      userId,
      xpDelta: 25,
    });
    assertEquals(definitions[0].map((achievement) => achievement.key), [
      "steam:FIRST_WIN",
      "steam:LOCKED_HINT",
    ]);
    assertEquals(recordedUnlocks[0].map((achievement) => achievement.key), [
      "steam:FIRST_WIN",
    ]);
    assertEquals(recordCalls, [{ gameTitle: "Fixture Game" }]);
  },
);

Deno.test("achievement ingestion handler rejects stale attested snapshots", async () => {
  const recordedUnlocks: NormalizedAchievement[][] = [];
  const response = await handleAchievementIngestion(
    jsonRequest({
      achievements: [{ id: "FIRST_WIN", name: "First Win" }],
      gameId: catalogGameId,
      provider: "steam",
      providerConfidence: "official",
      syncedAt: "2026-06-15T10:05:00.000Z",
    }),
    stubDeps({
      definitionAccepted: false,
      recordedUnlocks,
    }),
  );

  assertEquals(response.status, 202);
  assertEquals(await response.json(), {
    achievementsSynced: 0,
    ignored: true,
    newUnlocks: 0,
    ok: true,
    reason: "out_of_order",
    trust: "attested",
    unlockedCount: 0,
    userId,
    xpDelta: 0,
  });
  assertEquals(recordedUnlocks, []);
});

function jsonRequest(body: Record<string, unknown>) {
  return new Request("https://functions.example/ingest-achievements", {
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
    authResponse?: Response;
    catalogGame?: AchievementCatalogGame | null;
    definitionIdsByKey?: Map<string, string>;
    definitionAccepted?: boolean;
    definitions?: NormalizedAchievement[][];
    hasTrustedAttestation?: boolean;
    insertedUnlockKeys?: Set<string>;
    recordCalls?: Array<{ gameTitle: string | null }>;
    recordedUnlocks?: NormalizedAchievement[][];
  } = {},
): AchievementIngestionHandlerDeps {
  return {
    authenticateRequest: async () =>
      options.authResponse ?? {
        adminClient: "stub",
        hasTrustedAttestation: options.hasTrustedAttestation ?? true,
        userId,
      },
    getCatalogGame: async (auth, gameId) => {
      assertAuth(auth);
      assertEquals(gameId, catalogGameId);
      return options.catalogGame === undefined
        ? { id: catalogGameId, title: "Fixture Game" }
        : options.catalogGame;
    },
    recordNewAchievementUnlocks: async (
      auth,
      gameId,
      gameTitle,
      achievements,
    ) => {
      assertAuth(auth);
      assertEquals(gameId, catalogGameId);
      options.recordCalls?.push({ gameTitle });
      options.recordedUnlocks?.push(achievements);
      return options.insertedUnlockKeys ?? new Set();
    },
    upsertAchievementDefinitions: async (
      auth,
      gameId,
      provider,
      syncedAt,
      achievements,
    ) => {
      assertAuth(auth);
      assertEquals(gameId, catalogGameId);
      assertEquals(provider, "steam");
      assertEquals(typeof syncedAt, "string");
      options.definitions?.push(achievements);
      if (options.definitionIdsByKey) {
        return {
          accepted: options.definitionAccepted ?? true,
          achievementIdsByKey: options.definitionIdsByKey,
        };
      }
      return {
        accepted: options.definitionAccepted ?? true,
        achievementIdsByKey: new Map(
          achievements.map((achievement, index) => [
            achievement.key,
            `achievement-${index + 1}`,
          ]),
        ),
      };
    },
  };
}

function assertAuth(auth: AchievementIngestionAuthContext) {
  assertEquals(auth.userId, userId);
  assertEquals(auth.adminClient, "stub");
}
