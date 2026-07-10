import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Game } from "../../types";

const mocks = vi.hoisted(() => {
  const authGetUser = vi.fn();
  const from = vi.fn();
  const functionsInvoke = vi.fn();
  return { authGetUser, from, functionsInvoke };
});

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: mocks.authGetUser,
    },
    from: mocks.from,
    functions: {
      invoke: mocks.functionsInvoke,
    },
  }),
  getCurrentSessionUserId: async () => {
    const result = await mocks.authGetUser();
    return result.data.user?.id ?? null;
  },
  isSupabaseConfigured: true,
}));

type QueryError = { code?: string; message: string } | null;

function makeQueryResult(data: unknown, error: QueryError = null) {
  return { data, error };
}

function mockAuthedUser(id = "user-1") {
  mocks.authGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
}

function mockCatalogGame(id = "catalog-1") {
  mocks.from.mockImplementation((table: string) => {
    if (table !== "games") {
      return {};
    }
    return {
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: () => Promise.resolve(makeQueryResult({ id, slug: "half-life-2" })),
          }),
        }),
      }),
    };
  });
}

function mockMissingCatalogGame() {
  mocks.from.mockImplementation((table: string) => {
    if (table !== "games") {
      return {};
    }
    return {
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: () => Promise.resolve(makeQueryResult(null)),
          }),
        }),
      }),
    };
  });
}

function makeRemoteHydrationHandler(options: {
  definitions: unknown[];
  unlocks: unknown[];
  catalogId?: string;
}) {
  return (table: string) => {
    if (table === "games") {
      return {
        select: () => ({
          eq: () => ({
            limit: () => ({
              maybeSingle: () =>
                Promise.resolve(
                  makeQueryResult({ id: options.catalogId ?? "catalog-1", slug: "half-life-2" }),
                ),
            }),
          }),
        }),
      };
    }
    if (table === "achievements") {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn((column: string) =>
          column === "is_active" ? Promise.resolve(makeQueryResult(options.definitions)) : chain,
        ),
      };
      return chain;
    }
    if (table === "user_achievements") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: () => Promise.resolve(makeQueryResult(options.unlocks)),
            }),
          }),
        }),
      };
    }
    return {};
  };
}

const game: Game = {
  achievements: [
    {
      id: "ACH_WIN_ONE_GAME",
      name: "First Win",
      rarity: 22.5,
      sourceAchievementId: "ACH_WIN_ONE_GAME",
      unlockedAt: "2026-06-10T08:15:00.000Z",
    },
  ],
  achievementsSyncedAt: "2026-06-10T08:30:00.000Z",
  description: "",
  id: "manual-half-life-2",
  launcher: "manual",
  platform: "windows",
  slug: "half-life-2",
  status: "installed",
  title: "Half-Life 2",
  version: "1.0.0",
};

describe("ingestTrustedAchievements", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mocks.authGetUser.mockReset();
    mocks.from.mockReset();
    mocks.functionsInvoke.mockReset();
    mockAuthedUser();
    mockCatalogGame();
  });

  it("invokes the trusted achievements function", async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: {
        achievementsSynced: 1,
        newUnlocks: 1,
        ok: true,
        unlockedCount: 1,
        xpDelta: 10,
      },
      error: null,
    });

    const { ingestTrustedAchievements } = await import("../achievements");
    const result = await ingestTrustedAchievements({
      game,
      provider: "steam",
      providerConfidence: "official",
    });

    expect(result).toMatchObject({
      achievementsSynced: 1,
      newUnlocks: 1,
      ok: true,
      skipped: false,
      unlockedCount: 1,
      xpDelta: 10,
    });
    expect(mocks.functionsInvoke).toHaveBeenCalledWith("ingest-achievements", {
      body: {
        achievements: [
          {
            description: null,
            iconUrl: null,
            id: "ACH_WIN_ONE_GAME",
            name: "First Win",
            rarity: 22.5,
            sourceAchievementId: "ACH_WIN_ONE_GAME",
            unlockedAt: "2026-06-10T08:15:00.000Z",
          },
        ],
        gameId: "catalog-1",
        provider: "steam",
        providerConfidence: "official",
        syncedAt: "2026-06-10T08:30:00.000Z",
      },
    });
  });

  it("does not use direct table fallback when the function is unavailable", async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: { message: "Function not found", context: { status: 404 } },
    });

    const { ingestTrustedAchievements } = await import("../achievements");
    const result = await ingestTrustedAchievements({
      game,
      provider: "steam",
      providerConfidence: "official",
    });

    expect(result).toMatchObject({ ok: false, skipped: true });
    expect(mocks.from).not.toHaveBeenCalledWith("achievements");
    expect(mocks.from).not.toHaveBeenCalledWith("user_achievements");
    expect(mocks.from).not.toHaveBeenCalledWith("profiles");
  });

  it("maps the server local-only trust result without claiming hosted persistence", async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: {
        achievementsSynced: 0,
        newUnlocks: 0,
        ok: true,
        persistence: "local_only",
        trust: "unverified",
        unlockedCount: 0,
        xpDelta: 0,
      },
      error: null,
    });

    const { ingestTrustedAchievements } = await import("../achievements");
    await expect(
      ingestTrustedAchievements({ game, provider: "steam", providerConfidence: "official" }),
    ).resolves.toMatchObject({
      ok: true,
      persistence: "local_only",
      skipped: false,
      trust: "unverified",
    });
  });

  it("rejects a local-only acknowledgement when trusted ingestion strict mode is enabled", async () => {
    vi.stubEnv("VITE_OG_TRUSTED_INGESTION_STRICT", "true");
    mocks.functionsInvoke.mockResolvedValue({
      data: {
        ok: true,
        persistence: "local_only",
        trust: "unverified",
      },
      error: null,
    });

    const { ingestTrustedAchievements } = await import("../achievements");
    await expect(
      ingestTrustedAchievements({ game, provider: "steam", providerConfidence: "official" }),
    ).rejects.toThrow(/local-only, unattested achievement evidence/i);
  });

  it("rejects unavailable trusted achievement ingestion in strict mode", async () => {
    vi.stubEnv("VITE_OG_TRUSTED_INGESTION_STRICT", "true");
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: { message: "Function not found", context: { status: 404 } },
    });

    const { ingestTrustedAchievements } = await import("../achievements");

    await expect(
      ingestTrustedAchievements({
        game,
        provider: "steam",
        providerConfidence: "official",
      }),
    ).rejects.toThrow(/Trusted achievement ingestion is required in production/);
    expect(mocks.from).not.toHaveBeenCalledWith("achievements");
    expect(mocks.from).not.toHaveBeenCalledWith("user_achievements");
    expect(mocks.from).not.toHaveBeenCalledWith("profiles");
  });

  it("rejects unresolved catalog games in strict mode before invoking ingestion", async () => {
    vi.stubEnv("VITE_OG_TRUSTED_INGESTION_STRICT", "true");
    mockMissingCatalogGame();

    const { ingestTrustedAchievements } = await import("../achievements");

    await expect(
      ingestTrustedAchievements({
        game,
        provider: "steam",
        providerConfidence: "official",
      }),
    ).rejects.toThrow(/catalog game mapping unavailable/);
    expect(mocks.functionsInvoke).not.toHaveBeenCalled();
  });

  it("rejects hard function errors without direct writes", async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: { message: "Unauthorized", context: { status: 401 } },
    });

    const { ingestTrustedAchievements } = await import("../achievements");
    await expect(
      ingestTrustedAchievements({
        game,
        provider: "steam",
        providerConfidence: "official",
      }),
    ).rejects.toThrow("Unauthorized");
    expect(mocks.from).not.toHaveBeenCalledWith("user_achievements");
    expect(mocks.from).not.toHaveBeenCalledWith("profiles");
  });

  it("hydrates real provider games from remote achievement definitions and unlocks", async () => {
    mocks.from.mockImplementation(
      makeRemoteHydrationHandler({
        definitions: [
          {
            description: "Synced from Supabase",
            icon_url: "https://example.com/remote.png",
            id: "definition-1",
            key: "steam:ACH_REMOTE",
            name: "Remote Win",
            rarity_percent: 3.5,
          },
          {
            id: "definition-2",
            key: "gog:ACH_OTHER_PROVIDER",
            name: "Other Provider",
          },
        ],
        unlocks: [
          {
            achievement_id: "definition-1",
            metadata: { provider_confidence: "official" },
            unlocked_at: "2026-06-10T09:15:00.000Z",
          },
        ],
      }),
    );
    const steamGame: Game = {
      ...game,
      achievements: [],
      id: "steam-local-half-life-2",
      launcher: "steam",
    };

    const { hydrateGamesWithRemoteAchievements } = await import("../achievements");
    const [hydrated] = await hydrateGamesWithRemoteAchievements([steamGame]);

    expect(hydrated.achievements).toEqual([
      {
        description: "Synced from Supabase",
        iconUrl: "https://example.com/remote.png",
        id: "ACH_REMOTE",
        name: "Remote Win",
        providerConfidence: "official",
        rarity: 3.5,
        source: "steam",
        sourceAchievementId: "ACH_REMOTE",
        unlockedAt: "2026-06-10T09:15:00.000Z",
      },
    ]);
    expect(
      hydrated.achievements?.some((achievement) => achievement.id.startsWith("grouped-")),
    ).toBe(false);
  });

  it("merges remote unlocks into existing local provider achievements", async () => {
    mocks.from.mockImplementation(
      makeRemoteHydrationHandler({
        definitions: [
          {
            description: "Remote description",
            id: "definition-1",
            key: "steam:ACH_WIN_ONE_GAME",
            name: "Remote First Win",
          },
        ],
        unlocks: [
          {
            achievement_id: "definition-1",
            metadata: { provider_confidence: "official" },
            unlocked_at: "2026-06-10T10:00:00.000Z",
          },
        ],
      }),
    );
    const steamGame: Game = {
      ...game,
      achievements: [
        {
          id: "ACH_WIN_ONE_GAME",
          name: "Local First Win",
          source: "steam",
          sourceAchievementId: "ACH_WIN_ONE_GAME",
          unlockedAt: null,
        },
      ],
      id: "steam-local-half-life-2",
      launcher: "steam",
    };

    const { hydrateGamesWithRemoteAchievements } = await import("../achievements");
    const [hydrated] = await hydrateGamesWithRemoteAchievements([steamGame]);

    expect(hydrated.achievements).toEqual([
      {
        description: "Remote description",
        id: "ACH_WIN_ONE_GAME",
        name: "Local First Win",
        providerConfidence: "official",
        source: "steam",
        sourceAchievementId: "ACH_WIN_ONE_GAME",
        unlockedAt: "2026-06-10T10:00:00.000Z",
      },
    ]);
  });

  it("skips auth and catalog queries for unsupported games when the user is already known", async () => {
    const { hydrateGamesWithRemoteAchievements } = await import("../achievements");

    const hydrated = await hydrateGamesWithRemoteAchievements([game], { userId: "user-1" });

    expect(hydrated).toEqual([game]);
    expect(mocks.authGetUser).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("stops scheduling more remote games after a transport failure", async () => {
    let catalogQueries = 0;
    let definitionQueries = 0;
    mocks.from.mockImplementation((table: string) => {
      if (table === "games") {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: () => {
                  catalogQueries += 1;
                  return Promise.resolve(makeQueryResult({ id: "catalog-1" }));
                },
              }),
            }),
          }),
        };
      }
      if (table === "achievements") {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn((column: string) => {
            if (column !== "is_active") return chain;
            definitionQueries += 1;
            return Promise.resolve(makeQueryResult(null, { message: "Failed to fetch" }));
          }),
        };
        return chain;
      }
      return {};
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const remoteGames = Array.from(
      { length: 8 },
      (_, index): Game => ({
        ...game,
        achievements: [],
        id: `steam-${index}`,
        launcher: "steam",
        slug: `remote-game-${index}`,
        title: `Remote Game ${index}`,
      }),
    );

    const { hydrateGamesWithRemoteAchievements } = await import("../achievements");
    const hydrated = await hydrateGamesWithRemoteAchievements(remoteGames, { userId: "user-1" });

    expect(hydrated).toEqual(remoteGames);
    expect(catalogQueries).toBeGreaterThan(0);
    expect(catalogQueries).toBeLessThanOrEqual(4);
    expect(definitionQueries).toBeGreaterThan(0);
    expect(definitionQueries).toBeLessThanOrEqual(4);
    expect(warn).toHaveBeenCalled();
  });

  it("keeps hydrating later games when one remote game query fails", async () => {
    let definitionQueryCount = 0;
    mocks.from.mockImplementation((table: string) => {
      if (table === "games") {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: () =>
                  Promise.resolve(makeQueryResult({ id: "catalog-1", slug: "half-life-2" })),
              }),
            }),
          }),
        };
      }
      if (table === "achievements") {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn((column: string) => {
            if (column !== "is_active") return chain;
            definitionQueryCount += 1;
            return Promise.resolve(
              definitionQueryCount === 1
                ? makeQueryResult(null, { message: "temporary achievement read failure" })
                : makeQueryResult([
                    {
                      id: "definition-1",
                      key: "steam:ACH_REMOTE",
                      name: "Remote Win",
                    },
                  ]),
            );
          }),
        };
        return chain;
      }
      if (table === "user_achievements") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () => Promise.resolve(makeQueryResult([])),
              }),
            }),
          }),
        };
      }
      return {};
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const first: Game = { ...game, achievements: [], id: "steam-first", launcher: "steam" };
    const second: Game = {
      ...game,
      achievements: [],
      id: "steam-second",
      launcher: "steam",
      slug: "half-life-2-second",
    };

    const { hydrateGamesWithRemoteAchievements } = await import("../achievements");
    const hydrated = await hydrateGamesWithRemoteAchievements([first, second]);

    expect(hydrated[0]?.achievements).toEqual([]);
    expect(hydrated[1]?.achievements?.[0]).toMatchObject({ id: "ACH_REMOTE", name: "Remote Win" });
    expect(warn).toHaveBeenCalledWith(
      "[OG-Launcher] Remote achievements unavailable for Half-Life 2:",
      expect.any(Error),
    );
  });
});
