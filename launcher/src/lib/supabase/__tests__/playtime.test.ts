import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Game, PlaySession } from "../../types";

const mocks = vi.hoisted(() => {
  const from = vi.fn();
  const authGetUser = vi.fn();
  const authGetSession = vi.fn();
  return { from, authGetUser, authGetSession };
});

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
    from: mocks.from,
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

describe("listGameSessions", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
    mocks.authGetUser.mockReset();
    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
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
    mocks.from.mockReset();
    mocks.authGetUser.mockReset();
    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
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
});

describe("updateUserGamePlaytime", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
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
});

describe("syncGameSessions", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
    mocks.authGetUser.mockReset();
    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
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
});
