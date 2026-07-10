import { beforeEach, describe, expect, it, vi } from "vitest";

interface QueryCall {
  column: string;
  table: string;
  type: "eq" | "in" | "is";
  value: unknown;
}

interface QueryRecord {
  calls: QueryCall[];
  payload: Record<string, unknown> | null;
  table: string;
}

const state = vi.hoisted(() => ({
  maybeSingleResults: [] as Array<{ data: unknown; error: null }>,
  queryResults: [] as Array<{ data: unknown; error: null }>,
  queries: [] as QueryRecord[],
}));

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: { id: "owner-1" } },
          error: null,
        }),
      ),
    },
    from: (table: string) => createQuery(table),
  }),
}));

function createQuery(table: string) {
  const query: QueryRecord = {
    calls: [],
    payload: null,
    table,
  };
  state.queries.push(query);

  const chain = {
    error: null,
    data: null,
    eq(column: string, value: unknown) {
      query.calls.push({ column, table, type: "eq", value });
      return chain;
    },
    in(column: string, value: unknown) {
      query.calls.push({ column, table, type: "in", value });
      return chain;
    },
    is(column: string, value: unknown) {
      query.calls.push({ column, table, type: "is", value });
      return chain;
    },
    maybeSingle: vi.fn(() => Promise.resolve(state.maybeSingleResults.shift())),
    select: vi.fn(() => chain),
    then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
      onfulfilled?:
        ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(state.queryResults.shift() ?? { data: null, error: null }).then(
        onfulfilled,
        onrejected,
      );
    },
    update(payload: Record<string, unknown>) {
      query.payload = payload;
      return chain;
    },
  };

  return chain;
}

function findUpdate(table: string, payloadKey: string) {
  const update = state.queries.find(
    (query) => query.table === table && query.payload?.[payloadKey],
  );
  if (!update) {
    throw new Error(`Missing ${table} update with ${payloadKey}`);
  }
  return update;
}

describe("friend link merge groups", () => {
  beforeEach(() => {
    state.maybeSingleResults = [];
    state.queryResults = [];
    state.queries = [];
    vi.restoreAllMocks();
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000111");
  });

  it("reuses an existing merge group when accepting a heuristic suggestion into a group", async () => {
    state.maybeSingleResults.push({
      data: {
        friend_link_a: "steam-link",
        friend_link_b: "epic-link",
        id: "suggestion-1",
        suggested_user_id: null,
        user_id: "owner-1",
      },
      error: null,
    });
    state.queryResults.push({
      data: [
        { id: "steam-link", merge_group_id: "existing-merge-group" },
        { id: "epic-link", merge_group_id: null },
      ],
      error: null,
    });

    const { acceptMergeSuggestion } = await import("../friend-links");
    await acceptMergeSuggestion("suggestion-1");

    const groupUpdate = findUpdate("friend_links", "merge_group_id");
    expect(groupUpdate.payload).toEqual({ merge_group_id: "existing-merge-group" });
    expect(groupUpdate.calls).toEqual(
      expect.arrayContaining([
        { column: "id", table: "friend_links", type: "in", value: ["steam-link", "epic-link"] },
        { column: "owner_id", table: "friend_links", type: "eq", value: "owner-1" },
      ]),
    );
    const statusUpdate = findUpdate("friend_merge_suggestions", "status");
    expect(statusUpdate.calls).toEqual(
      expect.arrayContaining([
        { column: "id", table: "friend_merge_suggestions", type: "eq", value: "suggestion-1" },
        { column: "user_id", table: "friend_merge_suggestions", type: "eq", value: "owner-1" },
      ]),
    );
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });

  it("links a suggested OG user manually without staging a merge group", async () => {
    state.maybeSingleResults.push({
      data: {
        friend_link_a: "steam-link",
        friend_link_b: "gog-link",
        id: "suggestion-2",
        suggested_user_id: "og-user-2",
        user_id: "owner-1",
      },
      error: null,
    });

    const { acceptMergeSuggestion } = await import("../friend-links");
    await acceptMergeSuggestion("suggestion-2");

    const manualUpdate = findUpdate("friend_links", "matched_user_id");
    expect(manualUpdate.payload).toEqual({
      matched_user_id: "og-user-2",
      match_method: "manual",
    });
    expect(state.queries.some((query) => query.payload?.merge_group_id)).toBe(false);
  });
});
