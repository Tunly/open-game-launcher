import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Game, PlaySession } from "../../types";

const mocks = vi.hoisted(() => {
  const from = vi.fn();
  const functionsInvoke = vi.fn();
  const authGetUser = vi.fn();
  const authGetSession = vi.fn();
  return { from, functionsInvoke, authGetUser, authGetSession };
});

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
    from: mocks.from,
    functions: {
      invoke: mocks.functionsInvoke,
    },
    auth: {
      getUser: mocks.authGetUser,
      getSession: mocks.authGetSession,
    },
  }),
  isSupabaseConfigured: true,
  getCurrentSessionUserId: async () => {
    const result = await mocks.authGetUser();
    return result.data.user?.id ?? null;
  },
}));

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

function makeQueryResult(
  data: unknown,
  error: { message: string; code?: string } | null = null,
  count?: number | null,
): QueryResult {
  return { data, error, count };
}

type PagedQueryBuilder = PromiseLike<QueryResult> & {
  eq: (column: string, value: unknown) => PagedQueryBuilder;
  gte: (column: string, value: string) => PagedQueryBuilder;
  limit: (limit: number) => PagedQueryBuilder;
  lt: (column: string, value: string) => PagedQueryBuilder;
  lte: (column: string, value: string) => PagedQueryBuilder;
  or: (filters: string) => PagedQueryBuilder;
  order: (column: string, options: { ascending: boolean }) => PagedQueryBuilder;
  range: (from: number, to: number) => Promise<QueryResult>;
};

function makePagedGameSessionsHandler(results: QueryResult[]) {
  const spies = {
    eq: vi.fn(),
    gte: vi.fn(),
    limit: vi.fn(),
    lt: vi.fn(),
    lte: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    select: vi.fn(),
  };
  let resultIndex = 0;

  const nextResult = () => results[resultIndex++] ?? makeQueryResult([]);
  const handler: TableHandler = (table) => {
    if (table !== "game_sessions") {
      return {};
    }

    const builder = {} as PagedQueryBuilder;
    builder.eq = (column, value) => {
      spies.eq(column, value);
      return builder;
    };
    builder.gte = (column, value) => {
      spies.gte(column, value);
      return builder;
    };
    builder.limit = (limit) => {
      spies.limit(limit);
      return builder;
    };
    builder.lt = (column, value) => {
      spies.lt(column, value);
      return builder;
    };
    builder.lte = (column, value) => {
      spies.lte(column, value);
      return builder;
    };
    builder.or = (filters) => {
      spies.or(filters);
      return builder;
    };
    builder.order = (column, options) => {
      spies.order(column, options);
      return builder;
    };
    builder.range = (from, to) => {
      spies.range(from, to);
      return Promise.resolve(nextResult());
    };
    builder.then = (onfulfilled, onrejected) =>
      Promise.resolve(nextResult()).then(onfulfilled, onrejected);

    return {
      select: (columns: string) => {
        spies.select(columns);
        return builder;
      },
    };
  };

  return { handler, spies };
}

interface SessionRowRaw {
  id: string;
  user_id: string;
  game_id: string;
  launcher_device_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  platform: string | null;
}

function buildSessionRow(overrides: Partial<SessionRowRaw> = {}): SessionRowRaw {
  return {
    id: "session-1",
    user_id: "user-1",
    game_id: "catalog-1",
    launcher_device_id: "device-1",
    started_at: "2025-01-01T10:00:00.000Z",
    ended_at: "2025-01-01T11:00:00.000Z",
    duration_minutes: 60,
    platform: "windows",
    ...overrides,
  };
}

type TableHandler = (table: string) => Record<string, unknown>;

function makeCatalogThenSessionsHandler(options: {
  sessions: SessionRowRaw[];
  total: number;
  catalogFound: boolean;
}): TableHandler {
  return (table: string) => {
    if (table === "games") {
      const games = options.catalogFound
        ? { id: "catalog-1", external_ids: { steam: "440" } }
        : null;
      return {
        select: () => ({
          contains: () => ({
            limit: () => ({
              maybeSingle: () => Promise.resolve(makeQueryResult(games)),
            }),
          }),
          eq: () => ({
            limit: () => ({
              maybeSingle: () => Promise.resolve(makeQueryResult(games)),
            }),
          }),
          limit: () => ({
            maybeSingle: () => Promise.resolve(makeQueryResult(games)),
          }),
        }),
      };
    }
    if (table === "game_sessions") {
      return {
        select: (_columns: string, opts?: { count?: string; head?: boolean }): unknown => {
          if (opts?.head) {
            return {
              eq: () => ({
                eq: () => Promise.resolve(makeQueryResult([], null, options.total)),
              }),
            };
          }
          return {
            eq: () => ({
              eq: () => ({
                order: () => ({
                  range: () => Promise.resolve(makeQueryResult(options.sessions, null)),
                }),
              }),
            }),
          };
        },
      };
    }
    return {};
  };
}

const game: Game = {
  id: "steam-owned-440",
  title: "Team Fortress 2",
  slug: "team-fortress-2",
  description: "",
  version: "1.0",
  launcher: "steam",
  externalId: "440",
  status: "installed",
  platform: "windows",
};

function mockAuthedUser(id = "user-1") {
  mocks.authGetUser.mockResolvedValue({ data: { user: { id } } });
}

function mockTrustedIngestionUnavailable() {
  mocks.functionsInvoke.mockResolvedValue({
    data: null,
    error: { message: "Function not found", context: { status: 404 } },
  });
}

function makeCatalogThenStatsHandler(options: {
  catalogFound: boolean;
  existingStats?: Record<string, unknown> | null;
  upsert: ReturnType<typeof vi.fn>;
}): TableHandler {
  return (table: string) => {
    if (table === "games") {
      const games = options.catalogFound
        ? { id: "catalog-1", external_ids: { steam: "440" } }
        : null;
      return {
        select: () => ({
          contains: () => ({
            limit: () => ({
              maybeSingle: () => Promise.resolve(makeQueryResult(games)),
            }),
          }),
          eq: () => ({
            limit: () => ({
              maybeSingle: () => Promise.resolve(makeQueryResult(games)),
            }),
          }),
          limit: () => ({
            maybeSingle: () => Promise.resolve(makeQueryResult(games)),
          }),
        }),
      };
    }
    if (table === "user_game_stats") {
      const maybeSingle = () => Promise.resolve(makeQueryResult(options.existingStats ?? null));
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle,
            }),
          }),
        }),
        upsert: options.upsert,
      };
    }
    return {};
  };
}

describe("listGameSessions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mocks.from.mockReset();
    mocks.functionsInvoke.mockReset();
    mocks.authGetUser.mockReset();
    mockAuthedUser();
    mockTrustedIngestionUnavailable();
  });

  it("resolves the catalog game and returns paginated rows + total", async () => {
    mocks.from.mockImplementation(
      makeCatalogThenSessionsHandler({
        sessions: [buildSessionRow()],
        total: 42,
        catalogFound: true,
      }),
    );

    const { listGameSessions } = await import("../playtime");
    const result = await listGameSessions(game, { page: 0, pageSize: 10 });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].id).toBe("session-1");
    expect(result.sessions[0].durationMinutes).toBe(60);
    expect(result.sessions[0].platform).toBe("windows");
    expect(result.sessions[0].endedAt).toBe("2025-01-01T11:00:00.000Z");
    expect(result.total).toBe(42);
  });

  it("returns an empty result when the game is not in the catalog", async () => {
    mocks.from.mockImplementation(
      makeCatalogThenSessionsHandler({ sessions: [], total: 0, catalogFound: false }),
    );

    const { listGameSessions } = await import("../playtime");
    const result = await listGameSessions(game, { page: 0, pageSize: 10 });
    expect(result).toEqual({ sessions: [], total: 0 });
  });
});

describe("updateGameSession", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mocks.from.mockReset();
    mocks.functionsInvoke.mockReset();
    mocks.authGetUser.mockReset();
    mockAuthedUser();
    mockTrustedIngestionUnavailable();
  });

  it("sends the patch scoped to user_id and returns true on success", async () => {
    const update = vi.fn();
    const eq = vi.fn();
    mocks.from.mockImplementation((table: string) => {
      if (table === "game_sessions") {
        return { update, eq };
      }
      return {};
    });
    update.mockReturnValue({ eq });
    eq.mockReturnValue({ eq });

    const { updateGameSession } = await import("../playtime");
    const ok = await updateGameSession("s1", {
      startedAt: "2025-01-01T10:00:00.000Z",
      endedAt: "2025-01-01T11:00:00.000Z",
      durationMinutes: 60,
    });

    expect(ok).toBe(true);
    expect(update).toHaveBeenCalledWith({
      started_at: "2025-01-01T10:00:00.000Z",
      ended_at: "2025-01-01T11:00:00.000Z",
      duration_minutes: 60,
    });
    expect(eq).toHaveBeenCalledWith("id", "s1");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns true without hitting supabase when the patch is empty", async () => {
    const { updateGameSession } = await import("../playtime");
    const ok = await updateGameSession("s1", {});
    expect(ok).toBe(true);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("blocks direct session edits in strict trusted-ingestion mode", async () => {
    vi.stubEnv("VITE_OG_TRUSTED_INGESTION_STRICT", "true");
    const update = vi.fn();
    const eq = vi.fn();
    mocks.from.mockImplementation((table: string) => {
      if (table === "game_sessions") {
        return { update, eq };
      }
      return {};
    });

    const { updateGameSession } = await import("../playtime");

    await expect(updateGameSession("s1", { durationMinutes: 60 })).rejects.toThrow(
      /Trusted playtime ingestion is required in production/,
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe("syncGamePlaytimeStats", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mocks.from.mockReset();
    mocks.functionsInvoke.mockReset();
    mocks.authGetUser.mockReset();
    mockAuthedUser();
    mockTrustedIngestionUnavailable();
  });

  it("falls back to direct aggregate upsert when strict ingestion is disabled", async () => {
    const upsert = vi.fn().mockResolvedValue(makeQueryResult([], null));
    mocks.from.mockImplementation(
      makeCatalogThenStatsHandler({
        catalogFound: true,
        existingStats: {
          first_played_at: null,
          playtime_minutes: 10,
          total_sessions: 1,
        },
        upsert,
      }),
    );

    const { syncGamePlaytimeStats } = await import("../playtime");
    await syncGamePlaytimeStats({
      countSessionStart: true,
      game: { ...game, playtimeMinutes: 75 },
      lastPlayedAt: "2026-06-13T10:00:00.000Z",
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      first_played_at: "2026-06-13T10:00:00.000Z",
      game_id: "catalog-1",
      last_played_at: "2026-06-13T10:00:00.000Z",
      playtime_minutes: 75,
      total_sessions: 2,
      user_id: "user-1",
    });
  });

  it("blocks direct aggregate upsert when strict ingestion is enabled", async () => {
    vi.stubEnv("VITE_OG_TRUSTED_INGESTION_STRICT", "true");
    const upsert = vi.fn().mockResolvedValue(makeQueryResult([], null));
    mocks.from.mockImplementation(
      makeCatalogThenStatsHandler({
        catalogFound: true,
        existingStats: {
          first_played_at: null,
          playtime_minutes: 10,
          total_sessions: 1,
        },
        upsert,
      }),
    );

    const { syncGamePlaytimeStats } = await import("../playtime");

    await expect(
      syncGamePlaytimeStats({
        countSessionStart: true,
        game: { ...game, playtimeMinutes: 75 },
      }),
    ).rejects.toThrow(/Trusted playtime ingestion is required in production/);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("updateUserGamePlaytime", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mocks.from.mockReset();
    mocks.functionsInvoke.mockReset();
    mocks.authGetUser.mockReset();
    mockAuthedUser();
    mockTrustedIngestionUnavailable();
  });

  it("upserts the aggregate row with updated_at", async () => {
    const upsert = vi.fn().mockResolvedValue(makeQueryResult([], null));
    mocks.from.mockImplementation(() => ({ upsert }));

    const { updateUserGamePlaytime } = await import("../playtime");
    await updateUserGamePlaytime("user-1", "game-1", 90);

    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.user_id).toBe("user-1");
    expect(arg.game_id).toBe("game-1");
    expect(arg.playtime_minutes).toBe(90);
    expect(typeof arg.updated_at).toBe("string");
    expect(arg.updated_at).toMatch(/T.+Z$/);
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: "user_id,game_id" });
  });

  it("floors negative minutes to zero", async () => {
    const upsert = vi.fn().mockResolvedValue(makeQueryResult([], null));
    mocks.from.mockImplementation(() => ({ upsert }));

    const { updateUserGamePlaytime } = await import("../playtime");
    await updateUserGamePlaytime("user-1", "game-1", -10);
    expect(upsert.mock.calls[0][0].playtime_minutes).toBe(0);
  });

  it("uses trusted ingestion instead of direct upsert when the function is available", async () => {
    const upsert = vi.fn().mockResolvedValue(makeQueryResult([], null));
    mocks.from.mockImplementation(() => ({ upsert }));
    mocks.functionsInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    const { updateUserGamePlaytime } = await import("../playtime");
    await updateUserGamePlaytime("user-1", "game-1", 33);

    expect(mocks.functionsInvoke).toHaveBeenCalledWith("ingest-playtime", {
      body: {
        aggregate: {
          gameId: "game-1",
          playtimeMinutes: 33,
        },
      },
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("does not fall back when trusted ingestion rejects the payload", async () => {
    const upsert = vi.fn().mockResolvedValue(makeQueryResult([], null));
    mocks.from.mockImplementation(() => ({ upsert }));
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: { message: "Unauthorized", context: { status: 401 } },
    });

    const { updateUserGamePlaytime } = await import("../playtime");

    await expect(updateUserGamePlaytime("user-1", "game-1", 33)).rejects.toThrow("Unauthorized");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("blocks direct aggregate fallback in strict trusted-ingestion mode", async () => {
    vi.stubEnv("VITE_OG_TRUSTED_INGESTION_STRICT", "true");
    const upsert = vi.fn().mockResolvedValue(makeQueryResult([], null));
    mocks.from.mockImplementation(() => ({ upsert }));
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: { message: "Function not found", context: { status: 404 } },
    });

    const { updateUserGamePlaytime } = await import("../playtime");

    await expect(updateUserGamePlaytime("user-1", "game-1", 33)).rejects.toThrow(
      /Trusted playtime ingestion is required in production/,
    );
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("syncGameSessions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mocks.from.mockReset();
    mocks.functionsInvoke.mockReset();
    mocks.authGetUser.mockReset();
    mockAuthedUser();
    mockTrustedIngestionUnavailable();
  });

  it("resolves each game once and upserts sessions in one batch", async () => {
    const upsert = vi.fn().mockResolvedValue(makeQueryResult([], null));
    mocks.from.mockImplementation((table: string) => {
      if (table === "games") {
        return makeCatalogThenSessionsHandler({
          sessions: [],
          total: 0,
          catalogFound: true,
        })(table);
      }
      if (table === "game_sessions") {
        return { upsert };
      }
      return {};
    });

    const sessions: PlaySession[] = [
      {
        durationMinutes: 30,
        endedAt: 1_735_729_200,
        gameId: "steam-owned-440",
        id: "session-1",
        launcherDeviceId: "device-1",
        platform: "windows",
        startedAt: 1_735_727_400,
      },
      {
        durationMinutes: 45,
        endedAt: 1_735_733_000,
        gameId: "steam-owned-440",
        id: "session-2",
        launcherDeviceId: "device-1",
        platform: "windows",
        startedAt: 1_735_730_300,
      },
    ];

    const { syncGameSessions } = await import("../playtime");
    const result = await syncGameSessions(sessions);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toHaveLength(2);
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: "id" });
    expect(result).toEqual({
      pushed: 2,
      pushedIds: ["session-1", "session-2"],
      skipped: 0,
      failed: 0,
    });
    expect(mocks.from.mock.calls.filter(([table]) => table === "games")).toHaveLength(1);
  });

  it("uses trusted ingestion for session batches before falling back to direct upsert", async () => {
    const upsert = vi.fn().mockResolvedValue(makeQueryResult([], null));
    mocks.functionsInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === "games") {
        return makeCatalogThenSessionsHandler({
          sessions: [],
          total: 0,
          catalogFound: true,
        })(table);
      }
      if (table === "game_sessions") {
        return { upsert };
      }
      return {};
    });

    const sessions: PlaySession[] = [
      {
        durationMinutes: 30,
        endedAt: 1_735_729_200,
        gameId: "steam-owned-440",
        id: "session-1",
        launcherDeviceId: "device-1",
        platform: "windows",
        startedAt: 1_735_727_400,
      },
    ];

    const { syncGameSessions } = await import("../playtime");
    const result = await syncGameSessions(sessions);

    expect(mocks.functionsInvoke).toHaveBeenCalledWith("ingest-playtime", {
      body: {
        sessions: [
          {
            durationMinutes: 30,
            endedAt: "2025-01-01T11:00:00.000Z",
            gameId: "catalog-1",
            id: "session-1",
            launcherDeviceId: "device-1",
            platform: "windows",
            startedAt: "2025-01-01T10:30:00.000Z",
          },
        ],
      },
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual({
      pushed: 1,
      pushedIds: ["session-1"],
      skipped: 0,
      failed: 0,
    });
  });

  it("blocks direct session fallback in strict trusted-ingestion mode", async () => {
    vi.stubEnv("VITE_OG_TRUSTED_INGESTION_STRICT", "true");
    const upsert = vi.fn().mockResolvedValue(makeQueryResult([], null));
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: { message: "Function not found", context: { status: 404 } },
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === "games") {
        return makeCatalogThenSessionsHandler({
          sessions: [],
          total: 0,
          catalogFound: true,
        })(table);
      }
      if (table === "game_sessions") {
        return { upsert };
      }
      return {};
    });

    const { syncGameSessions } = await import("../playtime");

    await expect(
      syncGameSessions([
        {
          durationMinutes: 30,
          endedAt: 1_735_729_200,
          gameId: "steam-owned-440",
          id: "session-1",
          launcherDeviceId: "device-1",
          platform: "windows",
          startedAt: 1_735_727_400,
        },
      ]),
    ).rejects.toThrow(/Trusted playtime ingestion is required in production/);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("getUserPlaySessions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mocks.from.mockReset();
    mocks.functionsInvoke.mockReset();
    mocks.authGetUser.mockReset();
    mockAuthedUser();
  });

  it("selects relational game metadata and maps the nested title and cover", async () => {
    const query = makePagedGameSessionsHandler([
      makeQueryResult([
        {
          ...buildSessionRow(),
          games: {
            cover_url: "https://cdn.example/cover.jpg",
            title: "Team Fortress 2",
          },
        },
      ]),
    ]);
    mocks.from.mockImplementation(query.handler);

    const { getUserPlaySessions } = await import("../playtime");
    const result = await getUserPlaySessions();

    expect(query.spies.select).toHaveBeenCalledWith(
      expect.stringContaining("games(title, cover_url)"),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      gameCoverUrl: "https://cdn.example/cover.jpg",
      gameId: "catalog-1",
      gameTitle: "Team Fortress 2",
    });
  });

  it("uses Unknown Game rather than a catalog UUID when related metadata is missing", async () => {
    const query = makePagedGameSessionsHandler([
      makeQueryResult([
        {
          ...buildSessionRow({ game_id: "orphaned-game-uuid" }),
          games: null,
        },
      ]),
    ]);
    mocks.from.mockImplementation(query.handler);

    const { getUserPlaySessions } = await import("../playtime");
    const [session] = await getUserPlaySessions();

    expect(session.gameId).toBe("orphaned-game-uuid");
    expect(session.gameTitle).toBe("Unknown Game");
    expect(session.gameTitle).not.toBe(session.gameId);
    expect(session.gameCoverUrl).toBeNull();
  });

  it("uses a composite keyset cursor so same-timestamp sessions are not shifted", async () => {
    const cursorStartedAt = "2025-01-01T10:00:00.000Z";
    const firstPage = Array.from({ length: 1_000 }, (_, index) => {
      const sequence = 1_000 - index;
      return {
        ...buildSessionRow({
          id: `session-${String(sequence).padStart(4, "0")}`,
          started_at: cursorStartedAt,
        }),
        games: { cover_url: null, title: `Game ${sequence}` },
      };
    });
    const query = makePagedGameSessionsHandler([
      makeQueryResult(firstPage),
      makeQueryResult([
        {
          ...buildSessionRow({ id: "session-0000", started_at: cursorStartedAt }),
          games: { cover_url: null, title: "Final Game" },
        },
      ]),
    ]);
    mocks.from.mockImplementation(query.handler);

    const { getUserPlaySessions } = await import("../playtime");
    const result = await getUserPlaySessions();

    expect(result).toHaveLength(1_001);
    expect(result.at(-1)?.gameTitle).toBe("Final Game");
    expect(query.spies.limit.mock.calls).toEqual([[1_000], [1_000], [1_000]]);
    expect(query.spies.range).not.toHaveBeenCalled();
    expect(query.spies.or).toHaveBeenCalledTimes(2);
    expect(query.spies.or).toHaveBeenCalledWith(
      `started_at.lt.${cursorStartedAt},and(started_at.eq.${cursorStartedAt},id.lt.session-0001)`,
    );
    expect(query.spies.order).toHaveBeenCalledWith("started_at", { ascending: false });
    expect(query.spies.order).toHaveBeenCalledWith("id", { ascending: false });
    expect(mocks.from.mock.calls.filter(([table]) => table === "game_sessions")).toHaveLength(3);
  });

  it("continues after a backend-capped short page until the cursor returns no rows", async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      ...buildSessionRow({
        id: `capped-session-${String(500 - index).padStart(4, "0")}`,
        started_at: "2025-01-01T10:00:00.000Z",
      }),
      games: { cover_url: null, title: `Capped Game ${index}` },
    }));
    const query = makePagedGameSessionsHandler([
      makeQueryResult(firstPage),
      makeQueryResult([
        {
          ...buildSessionRow({
            id: "capped-session-0000",
            started_at: "2024-12-31T10:00:00.000Z",
          }),
          games: { cover_url: null, title: "Capped Final Game" },
        },
      ]),
      makeQueryResult([]),
    ]);
    mocks.from.mockImplementation(query.handler);

    const { getUserPlaySessions } = await import("../playtime");
    const result = await getUserPlaySessions();

    expect(result).toHaveLength(501);
    expect(result.at(-1)?.gameTitle).toBe("Capped Final Game");
    expect(query.spies.limit).toHaveBeenCalledTimes(3);
    expect(query.spies.or).toHaveBeenCalledTimes(2);
  });

  it("applies inclusive-start and exclusive-end filters before pagination", async () => {
    const since = new Date("2025-01-01T00:00:00.000Z");
    const until = new Date("2026-01-01T00:00:00.000Z");
    const query = makePagedGameSessionsHandler([
      makeQueryResult([
        {
          ...buildSessionRow(),
          games: { cover_url: null, title: "Team Fortress 2" },
        },
      ]),
    ]);
    mocks.from.mockImplementation(query.handler);

    const { getUserPlaySessions } = await import("../playtime");
    await getUserPlaySessions({ gameId: "catalog-1", limit: 1, since, until });

    expect(query.spies.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(query.spies.eq).toHaveBeenCalledWith("game_id", "catalog-1");
    expect(query.spies.gte).toHaveBeenCalledWith("started_at", since.toISOString());
    expect(query.spies.lt).toHaveBeenCalledWith("started_at", until.toISOString());
    expect(query.spies.lte).not.toHaveBeenCalled();
    expect(query.spies.limit).toHaveBeenCalledWith(1);
    expect(query.spies.range).not.toHaveBeenCalled();
  });

  it("keeps missing-schema fallback and propagates other read errors", async () => {
    const missingSchema = makePagedGameSessionsHandler([
      makeQueryResult(null, { code: "42P01", message: "relation does not exist" }),
    ]);
    mocks.from.mockImplementation(missingSchema.handler);

    const { getUserPlaySessions } = await import("../playtime");
    await expect(getUserPlaySessions()).resolves.toEqual([]);

    const failed = makePagedGameSessionsHandler([
      makeQueryResult(null, { message: "network unavailable" }),
    ]);
    mocks.from.mockImplementation(failed.handler);
    await expect(getUserPlaySessions()).rejects.toThrow("network unavailable");
  });
});

describe("getUserPlaySessionYears", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mocks.from.mockReset();
    mocks.functionsInvoke.mockReset();
    mocks.authGetUser.mockReset();
    mockAuthedUser();
  });

  it("uses a composite cursor and returns unique non-future local years descending", async () => {
    const currentYear = new Date().getFullYear();
    const cursorStartedAt = `${currentYear}-06-01T12:00:00.000Z`;
    const firstPage = Array.from({ length: 1_000 }, (_, index) => ({
      id: `year-session-${String(1_000 - index).padStart(4, "0")}`,
      started_at: cursorStartedAt,
    }));
    const query = makePagedGameSessionsHandler([
      makeQueryResult(firstPage),
      makeQueryResult([
        { id: "year-session-0000", started_at: cursorStartedAt },
        { id: "older", started_at: `${currentYear - 2}-06-01T12:00:00.000Z` },
        { id: "future", started_at: `${currentYear + 1}-01-01T12:00:00.000Z` },
        { id: "invalid", started_at: "not-a-date" },
      ]),
    ]);
    mocks.from.mockImplementation(query.handler);

    const { getUserPlaySessionYears } = await import("../playtime");
    const result = await getUserPlaySessionYears();

    expect(result).toEqual([currentYear, currentYear - 2]);
    expect(query.spies.select).toHaveBeenCalledTimes(3);
    expect(query.spies.select).toHaveBeenCalledWith("started_at, id");
    expect(query.spies.limit.mock.calls).toEqual([[1_000], [1_000], [1_000]]);
    expect(query.spies.range).not.toHaveBeenCalled();
    expect(query.spies.or).toHaveBeenCalledTimes(2);
    expect(query.spies.or).toHaveBeenCalledWith(
      `started_at.lt.${cursorStartedAt},and(started_at.eq.${cursorStartedAt},id.lt.year-session-0001)`,
    );
    expect(query.spies.order).toHaveBeenCalledWith("started_at", { ascending: false });
    expect(query.spies.order).toHaveBeenCalledWith("id", { ascending: false });
  });

  it("assigns a UTC year-boundary session to its local calendar year", async () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = "Europe/Berlin";

    try {
      const localYear = new Date().getFullYear();
      const query = makePagedGameSessionsHandler([
        makeQueryResult([
          {
            id: "year-boundary-session",
            started_at: `${localYear - 1}-12-31T23:30:00.000Z`,
          },
        ]),
      ]);
      mocks.from.mockImplementation(query.handler);

      const { getUserPlaySessionYears } = await import("../playtime");
      await expect(getUserPlaySessionYears()).resolves.toEqual([localYear]);
    } finally {
      if (previousTimezone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTimezone;
      }
    }
  });

  it("keeps missing-schema fallback and propagates other year-index errors", async () => {
    const missingSchema = makePagedGameSessionsHandler([
      makeQueryResult(null, { code: "42P01", message: "relation does not exist" }),
    ]);
    mocks.from.mockImplementation(missingSchema.handler);

    const { getUserPlaySessionYears } = await import("../playtime");
    await expect(getUserPlaySessionYears()).resolves.toEqual([]);

    const failed = makePagedGameSessionsHandler([
      makeQueryResult(null, { message: "year index failed" }),
    ]);
    mocks.from.mockImplementation(failed.handler);
    await expect(getUserPlaySessionYears()).rejects.toThrow("year index failed");
  });
});
