import {
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AchievementIngestionValidationError,
  calculateProfileLevel,
  normalizeAchievementIngestionPayload,
  summarizeAchievementXp,
} from "./achievement-ingestion.ts";

const catalogGameId = "123e4567-e89b-42d3-a456-426614174000";

Deno.test("normalizes trusted achievement payloads for catalog ingestion", () => {
  const result = normalizeAchievementIngestionPayload({
    achievements: [
      {
        description: "Finish the prologue",
        iconUrl: "https://example.com/first.png",
        id: "FIRST_WIN",
        name: "First Win",
        rarity: 3.2,
        unlockedAt: "2026-06-10T10:15:00+02:00",
      },
      {
        id: "LOCAL_HINT",
        name: "Local Hint",
        rarity: "uncommon",
      },
    ],
    gameId: catalogGameId,
    launcherDeviceId: "device-1",
    provider: "Steam",
    providerConfidence: "official",
    syncedAt: "2026-06-10T10:30:00+02:00",
  });

  assertEquals(result.gameId, catalogGameId);
  assertEquals(result.launcherDeviceId, "device-1");
  assertEquals(result.provider, "steam");
  assertEquals(result.providerConfidence, "official");
  assertEquals(result.syncedAt, "2026-06-10T08:30:00.000Z");
  assertEquals(result.achievements[0], {
    description: "Finish the prologue",
    iconUrl: "https://example.com/first.png",
    key: "steam:FIRST_WIN",
    name: "First Win",
    points: 100,
    provider: "steam",
    providerConfidence: "official",
    rarity: "epic",
    sourceAchievementId: "FIRST_WIN",
    unlockedAt: "2026-06-10T08:15:00.000Z",
  });
  assertEquals(result.achievements[1].key, "steam:LOCAL_HINT");
  assertEquals(result.achievements[1].points, 25);
  assertEquals(result.achievements[1].unlockedAt, null);
});

Deno.test("rejects spoofable or non-idempotent achievement payloads", () => {
  const error = assertThrows(
    () =>
      normalizeAchievementIngestionPayload({
        achievements: [
          {
            name: "",
            unlockedAt: "not-a-date",
          },
        ],
        gameId: "not-a-uuid",
      }),
    AchievementIngestionValidationError,
  );

  assertEquals(error.details, [
    "gameId must be a catalog game UUID.",
    "achievements[0].id or sourceAchievementId is required.",
    "achievements[0].name is required.",
    "unlockedAt must be a valid ISO timestamp.",
  ]);
});

Deno.test("rejects official confidence for non-official achievement providers", () => {
  const error = assertThrows(
    () =>
      normalizeAchievementIngestionPayload({
        achievements: [{ id: "SPOOFED", name: "Spoofed" }],
        gameId: catalogGameId,
        provider: "gog",
        providerConfidence: "official",
      }),
    AchievementIngestionValidationError,
  );

  assertEquals(error.details, [
    "providerConfidence official is only accepted for official providers.",
  ]);
});

Deno.test("rejects duplicate achievement ids within one payload", () => {
  const error = assertThrows(
    () =>
      normalizeAchievementIngestionPayload({
        achievements: [
          { id: "DUPLICATE", name: "One" },
          { id: "DUPLICATE", name: "Two" },
        ],
        gameId: catalogGameId,
        provider: "steam",
      }),
    AchievementIngestionValidationError,
  );

  assertEquals(error.details, [
    "achievements[1].id duplicates another achievement in this payload.",
  ]);
});

Deno.test("summarizes idempotent unlocks and profile xp deltas", () => {
  const result = normalizeAchievementIngestionPayload({
    achievements: [
      {
        id: "already-unlocked",
        name: "Already Unlocked",
        rarity: "rare",
        unlockedAt: "2026-06-10T08:00:00.000Z",
      },
      {
        id: "new-unlock",
        name: "New Unlock",
        rarity: "uncommon",
        unlockedAt: "2026-06-10T09:00:00.000Z",
      },
      {
        id: "locked",
        name: "Locked",
        rarity: "legendary",
      },
    ],
    gameId: catalogGameId,
    provider: "gog",
    providerConfidence: "unofficial",
  });

  assertEquals(
    summarizeAchievementXp(result.achievements, new Set(["gog:new-unlock"])),
    { newUnlocks: 1, xpDelta: 12 },
  );
  assertEquals(summarizeAchievementXp(result.achievements, new Set()), {
    newUnlocks: 0,
    xpDelta: 0,
  });
  assertEquals(calculateProfileLevel(0), 1);
  assertEquals(calculateProfileLevel(999), 1);
  assertEquals(calculateProfileLevel(1_000), 2);
});

Deno.test(
  "trusted achievement unlock migration records side effects atomically",
  async () => {
    const migration = await Deno.readTextFile(
      new URL(
        "../../migrations/20260615170000_trusted_achievement_unlock_rpc.sql",
        import.meta.url,
      ),
    );

    assertStringIncludes(
      migration,
      "create or replace function public.record_trusted_achievement_unlocks(",
    );
    assertStringIncludes(migration, "security definer");
    assertStringIncludes(
      migration,
      "coalesce(auth.role(), '') <> 'service_role'",
    );
    assertStringIncludes(
      migration,
      "on conflict on constraint user_achievements_user_achievement_unique do nothing",
    );
    assertStringIncludes(
      migration,
      "profile_xp = greatest(0, profiles.profile_xp + xp_delta.value)",
    );
    assertStringIncludes(migration, "insert into public.user_activity");
    assertStringIncludes(migration, "insert into public.activity_feed");
    assertStringIncludes(
      migration,
      "grant execute on function public.record_trusted_achievement_unlocks(",
    );
    assertStringIncludes(migration, "to service_role");
  },
);
