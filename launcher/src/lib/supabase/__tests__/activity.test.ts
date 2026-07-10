import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  from: vi.fn(),
}));

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: mocks.authGetUser },
    from: mocks.from,
  }),
  supabase: null,
}));

import { getFriendActivityFeed, postActivity } from "../activity";

type QueryError = { code?: string; message: string } | null;

function result(data: unknown, error: QueryError = null) {
  return { data, error };
}

function activityRow(payload: Record<string, unknown>) {
  return {
    ...payload,
    created_at: "2026-07-09T12:00:00.000Z",
    id: "67b2f3b7-6ff8-4b8c-88e1-4505ec519755",
  };
}

function installActivityMock(options: { catalogId?: string | null; catalogError?: QueryError }) {
  let insertedPayload: Record<string, unknown> | null = null;
  const catalogResult = () =>
    Promise.resolve(
      result(options.catalogId ? { id: options.catalogId } : null, options.catalogError ?? null),
    );

  mocks.from.mockImplementation((table: string) => {
    if (table === "games") {
      return {
        select: () => ({
          contains: () => ({
            limit: () => ({ maybeSingle: catalogResult }),
          }),
          eq: () => ({
            limit: () => ({ maybeSingle: catalogResult }),
            maybeSingle: catalogResult,
          }),
        }),
      };
    }

    if (table === "activity_feed") {
      return {
        insert: (payload: Record<string, unknown>) => {
          insertedPayload = payload;
          return {
            select: () => ({
              single: () => Promise.resolve(result(activityRow(payload))),
            }),
          };
        },
      };
    }

    return {};
  });

  return () => insertedPayload;
}

function installFeedMock(rows: Array<Record<string, unknown>>, error: QueryError = null) {
  const queryResult = Promise.resolve(result(rows, error));
  const query = {
    in: vi.fn(),
    limit: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
    then: queryResult.then.bind(queryResult),
  };
  query.in.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.select.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  return query;
}

describe("activity posting", () => {
  beforeEach(() => {
    mocks.authGetUser.mockReset();
    mocks.from.mockReset();
    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  it("stores a local launcher ID in metadata instead of a UUID foreign-key column", async () => {
    const getInsertedPayload = installActivityMock({ catalogId: null });

    await postActivity("game_start", {
      gameId: "steam-owned-440",
      gameTitle: "Team Fortress 2",
      metadata: { platform: "steam", platformGameId: "440" },
    });

    expect(getInsertedPayload()).toMatchObject({
      game_id: null,
      metadata: {
        localGameId: "steam-owned-440",
        platform: "steam",
        platformGameId: "440",
      },
      type: "game_start",
    });
  });

  it("deduplicates concurrent lifecycle activity for the same game", async () => {
    installActivityMock({ catalogId: null });
    const input = {
      gameId: "steam-owned-570",
      gameTitle: "Dota 2",
      metadata: { platform: "steam", platformGameId: "570" },
    };

    await Promise.all([postActivity("game_start", input), postActivity("game_start", input)]);

    expect(mocks.from.mock.calls.filter(([table]) => table === "activity_feed")).toHaveLength(1);
  });

  it("uses the catalog UUID when the local game can be resolved", async () => {
    const catalogId = "d4426c21-12ad-4f85-b858-2bd25b9d12cf";
    const getInsertedPayload = installActivityMock({ catalogId });

    await postActivity("game_stop", {
      gameId: "steam-owned-440",
      gameTitle: "Team Fortress 2",
      metadata: { platform: "steam", platformGameId: "440" },
    });

    expect(getInsertedPayload()).toMatchObject({
      game_id: catalogId,
      metadata: { localGameId: "steam-owned-440" },
      type: "game_stop",
    });
  });

  it("still posts when the catalog lookup fails", async () => {
    const getInsertedPayload = installActivityMock({
      catalogError: { message: "catalog temporarily unavailable" },
    });

    await expect(
      postActivity("game_start", { gameId: "local-game-9", gameTitle: "Offline Arcade" }),
    ).resolves.toMatchObject({ gameId: null, type: "game_start" });
    expect(getInsertedPayload()).toMatchObject({
      game_id: null,
      metadata: { localGameId: "local-game-9" },
    });
  });

  it("posts trimmed text-only statuses without inventing a game ID", async () => {
    const getInsertedPayload = installActivityMock({});

    await postActivity("status", {
      metadata: { text: "  Ready for co-op tonight  " },
      visibility: "friends_only",
    });

    expect(getInsertedPayload()).toMatchObject({
      game_id: null,
      game_title: null,
      metadata: { text: "Ready for co-op tonight" },
      type: "status",
    });
  });

  it("rejects empty text-only statuses before writing", async () => {
    installActivityMock({});

    await expect(postActivity("status", { metadata: { text: "   " } })).rejects.toThrow(
      "between 1 and 1000 characters",
    );
    expect(mocks.from).not.toHaveBeenCalledWith("activity_feed");
  });
});

describe("friend activity feed", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("does not read activity when no friend IDs are provided", async () => {
    await expect(getFriendActivityFeed([])).resolves.toEqual([]);

    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("limits the server query to unique friend IDs and rejects unrelated rows defensively", async () => {
    const query = installFeedMock([
      activityRow({
        achievement_name: null,
        game_id: null,
        game_title: null,
        metadata: {},
        type: "status",
        user_id: "friend-1",
        visibility: "friends_only",
      }),
      activityRow({
        achievement_name: null,
        game_id: null,
        game_title: null,
        metadata: {},
        type: "status",
        user_id: "not-a-friend",
        visibility: "public",
      }),
    ]);

    const feed = await getFriendActivityFeed(["friend-1", "friend-2", "friend-1"], 12);

    expect(mocks.from).toHaveBeenCalledWith("activity_feed");
    expect(query.in).toHaveBeenCalledWith("user_id", ["friend-1", "friend-2"]);
    expect(query.limit).toHaveBeenCalledWith(12);
    expect(feed).toHaveLength(1);
    expect(feed[0]?.userId).toBe("friend-1");
  });
});
