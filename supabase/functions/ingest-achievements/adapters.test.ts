import {
  assertEquals,
  assertObjectMatch,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import type { AuthenticatedRequest } from "../_shared/privacy.ts";
import type { NormalizedAchievement } from "./achievement-ingestion.ts";
import { createAchievementIngestionAdapters } from "./adapters.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const gameId = "22222222-2222-4222-8222-222222222222";

Deno.test("achievement ingestion adapters bridge auth responses and admin clients", async () => {
  const unauthorized = new Response(
    JSON.stringify({ error: "Invalid or expired session." }),
    { status: 401 },
  );
  const adminClient = supabaseStub();
  const calls: string[] = [];
  const adapters = createAchievementIngestionAdapters({
    authenticateRequest: async (request) => {
      calls.push(request.url);
      return request.headers.has("Authorization")
        ? authResult(adminClient)
        : unauthorized;
    },
  });

  assertEquals(
    await adapters.authenticateRequest(new Request("https://example.test")),
    unauthorized,
  );
  assertEquals(
    await adapters.authenticateRequest(
      new Request("https://example.test/achievements", {
        headers: { Authorization: "Bearer user-jwt" },
      }),
    ),
    { adminClient, hasTrustedAttestation: false, userId },
  );
  assertEquals(calls, [
    "https://example.test/",
    "https://example.test/achievements",
  ]);
});

Deno.test("achievement ingestion adapters trust only a configured server relay secret", async () => {
  const secret = "server-only-achievement-relay-secret-123456";
  const adapters = createAchievementIngestionAdapters({
    authenticateRequest: async () => authResult(supabaseStub()),
    getEnv: (name) =>
      name === "ACHIEVEMENT_INGESTION_ATTESTATION_SECRET" ? secret : undefined,
  });

  const trusted = await adapters.authenticateRequest(
    new Request("https://example.test", {
      headers: {
        Authorization: "Bearer user-jwt",
        "x-achievement-attestation": secret,
      },
    }),
  );
  if (trusted instanceof Response) {
    throw new Error("Expected authenticated context.");
  }
  assertEquals(trusted.hasTrustedAttestation, true);

  const spoofed = await adapters.authenticateRequest(
    new Request("https://example.test", {
      headers: {
        Authorization: "Bearer user-jwt",
        "x-achievement-attestation": "device-derived-or-wrong-secret",
      },
    }),
  );
  if (spoofed instanceof Response) {
    throw new Error("Expected authenticated context.");
  }
  assertEquals(spoofed.hasTrustedAttestation, false);
});

Deno.test("achievement ingestion adapters read catalog games by id", async () => {
  const operations: Operation[] = [];
  const adapters = createAchievementIngestionAdapters({
    authenticateRequest: async () =>
      authResult(supabaseStub({
        dataByMethod: {
          maybeSingle: { id: gameId, title: "  Fixture Game  " },
        },
        operations,
      })),
  });
  const auth = await authenticatedContext(adapters);

  assertEquals(await adapters.getCatalogGame(auth, gameId), {
    id: gameId,
    title: "  Fixture Game  ",
  });
  assertEquals(operations, [
    { args: ["games"], method: "from" },
    { args: ["id, title"], method: "select", table: "games" },
    { args: ["id", gameId], method: "eq", table: "games" },
    { args: [], method: "maybeSingle", table: "games" },
  ]);
});

Deno.test("achievement ingestion adapters return null for missing catalog games", async () => {
  const missingAdapters = createAchievementIngestionAdapters({
    authenticateRequest: async () =>
      authResult(supabaseStub({ dataByMethod: { maybeSingle: null } })),
  });
  assertEquals(
    await missingAdapters.getCatalogGame(
      await authenticatedContext(missingAdapters),
      gameId,
    ),
    null,
  );

  const invalidAdapters = createAchievementIngestionAdapters({
    authenticateRequest: async () =>
      authResult(supabaseStub({
        dataByMethod: { maybeSingle: { id: 42, title: "bad" } },
      })),
  });
  assertEquals(
    await invalidAdapters.getCatalogGame(
      await authenticatedContext(invalidAdapters),
      gameId,
    ),
    null,
  );
});

Deno.test("achievement ingestion adapters upsert definitions and return id map", async () => {
  const operations: Operation[] = [];
  const adapters = createAchievementIngestionAdapters({
    authenticateRequest: async () =>
      authResult(supabaseStub({
        dataByRpc: {
          upsert_trusted_achievement_definitions: [
            {
              achievement_id: "achievement-1",
              achievement_key: "steam:FIRST_WIN",
              ingestion_accepted: true,
            },
            {
              achievement_id: null,
              achievement_key: "steam:IGNORED",
              ingestion_accepted: true,
            },
            {
              achievement_id: "achievement-2",
              achievement_key: "steam:LOCKED_HINT",
              ingestion_accepted: true,
            },
          ],
        },
        operations,
      })),
  });

  const ids = await adapters.upsertAchievementDefinitions(
    await authenticatedContext(adapters),
    gameId,
    "steam",
    "2026-06-15T10:05:00.000Z",
    [
      achievement({
        description: "Win once.",
        iconUrl: "https://cdn.example/first.png",
        key: "steam:FIRST_WIN",
        name: "First Win",
        points: 25,
        rarity: "uncommon",
      }),
      achievement({
        key: "steam:LOCKED_HINT",
        name: "Locked Hint",
      }),
    ],
  );

  assertEquals(ids.accepted, true);
  assertEquals(Array.from(ids.achievementIdsByKey.entries()), [
    ["steam:FIRST_WIN", "achievement-1"],
    ["steam:LOCKED_HINT", "achievement-2"],
  ]);
  const upsert = operations.find((operation) => operation.method === "rpc");
  const rpcArgs = upsert?.args[1] as Record<string, unknown>;
  const rows = rpcArgs.p_achievements as Array<Record<string, unknown>>;
  assertEquals(upsert?.args[0], "upsert_trusted_achievement_definitions");
  assertObjectMatch(rows[0], {
    description: "Win once.",
    icon_url: "https://cdn.example/first.png",
    key: "steam:FIRST_WIN",
    name: "First Win",
    points: 25,
    rarity: "uncommon",
    rarity_percent: null,
  });
  assertObjectMatch(rpcArgs, {
    p_game_id: gameId,
    p_provider: "steam",
    p_synced_at: "2026-06-15T10:05:00.000Z",
  });
});

Deno.test("achievement ingestion adapters skip RPC when no unlock rows resolve", async () => {
  const operations: Operation[] = [];
  const adapters = createAchievementIngestionAdapters({
    authenticateRequest: async () => authResult(supabaseStub({ operations })),
  });

  assertEquals(
    await adapters.recordNewAchievementUnlocks(
      await authenticatedContext(adapters),
      gameId,
      "Fixture Game",
      [
        achievement({ key: "steam:LOCKED", unlockedAt: null }),
        achievement({
          key: "steam:MISSING_ID",
          unlockedAt: "2026-06-15T10:00:00.000Z",
        }),
      ],
      new Map(),
      "device-1",
    ),
    new Set(),
  );
  assertEquals(operations, []);
});

Deno.test("achievement ingestion adapters call trusted unlock RPC with sanitized rows", async () => {
  const operations: Operation[] = [];
  const adapters = createAchievementIngestionAdapters({
    authenticateRequest: async () =>
      authResult(supabaseStub({
        dataByRpc: {
          record_trusted_achievement_unlocks: [
            { recorded_achievement_key: "steam:FIRST_WIN" },
            { recorded_achievement_key: 42 },
          ],
        },
        operations,
      })),
  });

  assertEquals(
    await adapters.recordNewAchievementUnlocks(
      await authenticatedContext(adapters),
      gameId,
      "Fixture Game",
      [
        achievement({
          key: "steam:FIRST_WIN",
          name: "First Win",
          points: 25,
          providerConfidence: "official",
          sourceAchievementId: "FIRST_WIN",
          unlockedAt: "2026-06-15T10:00:00.000Z",
        }),
      ],
      new Map([["steam:FIRST_WIN", "achievement-1"]]),
      "device-1",
    ),
    new Set(["steam:FIRST_WIN"]),
  );
  assertEquals(operations, [
    {
      args: [
        "record_trusted_achievement_unlocks",
        {
          p_game_id: gameId,
          p_game_title: "Fixture Game",
          p_launcher_device_id: null,
          p_unlocks: [
            {
              achievement_id: "achievement-1",
              achievement_key: "steam:FIRST_WIN",
              achievement_name: "First Win",
              metadata: {
                provider: "steam",
                provider_confidence: "official",
                source_achievement_id: "FIRST_WIN",
              },
              points: 25,
              unlocked_at: "2026-06-15T10:00:00.000Z",
            },
          ],
          p_user_id: userId,
        },
      ],
      method: "rpc",
    },
  ]);
});

Deno.test("achievement ingestion adapters surface Supabase errors", async () => {
  const readAdapters = createAchievementIngestionAdapters({
    authenticateRequest: async () =>
      authResult(supabaseStub({
        errorByMethod: { maybeSingle: new Error("game read failed") },
      })),
  });
  await assertRejects(
    () =>
      readAdapters.getCatalogGame(
        {
          adminClient: supabaseStub({
            errorByMethod: { maybeSingle: new Error("game read failed") },
          }),
          hasTrustedAttestation: true,
          userId,
        },
        gameId,
      ),
    Error,
    "game read failed",
  );

  const upsertAdapters = createAchievementIngestionAdapters({
    authenticateRequest: async () =>
      authResult(supabaseStub({
        errorByRpc: {
          upsert_trusted_achievement_definitions: new Error(
            "definition upsert failed",
          ),
        },
      })),
  });
  await assertRejects(
    async () =>
      upsertAdapters.upsertAchievementDefinitions(
        await authenticatedContext(upsertAdapters),
        gameId,
        "steam",
        "2026-06-15T10:05:00.000Z",
        [achievement()],
      ),
    Error,
    "definition upsert failed",
  );

  const rpcAdapters = createAchievementIngestionAdapters({
    authenticateRequest: async () =>
      authResult(supabaseStub({
        errorByRpc: {
          record_trusted_achievement_unlocks: new Error("unlock RPC failed"),
        },
      })),
  });
  await assertRejects(
    async () =>
      rpcAdapters.recordNewAchievementUnlocks(
        await authenticatedContext(rpcAdapters),
        gameId,
        null,
        [achievement({ unlockedAt: "2026-06-15T10:00:00.000Z" })],
        new Map([["steam:FIRST_WIN", "achievement-1"]]),
        null,
      ),
    Error,
    "unlock RPC failed",
  );
});

type Operation = {
  args: unknown[];
  method: string;
  table?: string;
};

async function authenticatedContext(
  adapters: ReturnType<typeof createAchievementIngestionAdapters>,
) {
  const auth = await adapters.authenticateRequest(
    new Request("https://example.test", {
      headers: { Authorization: "Bearer user-jwt" },
    }),
  );
  if (auth instanceof Response) {
    throw new Error("Expected authenticated context.");
  }
  return auth;
}

function authResult(adminClient: unknown): AuthenticatedRequest {
  return {
    adminClient: adminClient as AuthenticatedRequest["adminClient"],
    token: "user-jwt",
    user: { id: userId } as AuthenticatedRequest["user"],
  };
}

function achievement(
  overrides: Partial<NormalizedAchievement> = {},
): NormalizedAchievement {
  return {
    description: null,
    iconUrl: null,
    key: "steam:FIRST_WIN",
    name: "First Win",
    points: 10,
    provider: "steam",
    providerConfidence: "official",
    rarity: "common",
    rarityPercent: null,
    sourceAchievementId: "FIRST_WIN",
    unlockedAt: null,
    ...overrides,
  };
}

function supabaseStub(options: {
  dataByMethod?: Record<string, unknown>;
  dataByRpc?: Record<string, unknown>;
  errorByMethod?: Record<string, Error | null>;
  errorByRpc?: Record<string, Error | null>;
  operations?: Operation[];
} = {}) {
  const operations = options.operations ?? [];
  return {
    from: (table: string) => {
      operations.push({ args: [table], method: "from" });
      const result = (method: string) => ({
        data: options.dataByMethod?.[method] ?? null,
        error: options.errorByMethod?.[method] ?? null,
      });
      const query = {
        eq(column: string, value: unknown) {
          operations.push({ args: [column, value], method: "eq", table });
          return query;
        },
        in(column: string, values: unknown[]) {
          operations.push({ args: [column, values], method: "in", table });
          return Promise.resolve(result("in"));
        },
        maybeSingle() {
          operations.push({ args: [], method: "maybeSingle", table });
          return Promise.resolve(result("maybeSingle"));
        },
        select(columns: string) {
          operations.push({ args: [columns], method: "select", table });
          return query;
        },
        upsert(value: unknown, upsertOptions: { onConflict: string }) {
          operations.push({
            args: [value, upsertOptions],
            method: "upsert",
            table,
          });
          return Promise.resolve(result("upsert"));
        },
      };
      return query;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      operations.push({ args: [name, args], method: "rpc" });
      return Promise.resolve({
        data: options.dataByRpc?.[name] ?? null,
        error: options.errorByRpc?.[name] ?? null,
      });
    },
  };
}
