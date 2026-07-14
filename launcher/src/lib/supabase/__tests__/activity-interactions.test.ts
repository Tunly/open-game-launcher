import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: mocks.authGetUser },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
  supabase: null,
}));

import {
  addActivityComment,
  getActivityComments,
  getActivityInteractionSummaries,
  setActivityRateUp,
  subscribeToActivityInteractions,
} from "../activity-interactions";

describe("activity interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  it("deduplicates activity ids when loading interaction summaries", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          activity_id: "activity-1",
          comment_count: 2,
          reacted_by_current_user: true,
          reaction_count: 4,
        },
      ],
      error: null,
    });

    const summaries = await getActivityInteractionSummaries(["activity-1", "activity-1", ""]);

    expect(mocks.rpc).toHaveBeenCalledWith("get_activity_interaction_summaries", {
      p_activity_ids: ["activity-1"],
    });
    expect(summaries.get("activity-1")).toEqual({
      activityId: "activity-1",
      commentCount: 2,
      reactedByCurrentUser: true,
      reactionCount: 4,
    });
  });

  it("returns comments chronologically after requesting the latest rows", async () => {
    const query = {
      eq: vi.fn(),
      limit: vi.fn(),
      order: vi.fn(),
      select: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockResolvedValue({
      data: [
        {
          activity_id: "activity-1",
          author_id: "user-2",
          body: "Second",
          created_at: "2026-07-14T12:01:00.000Z",
          id: "comment-2",
        },
        {
          activity_id: "activity-1",
          author_id: "user-1",
          body: "First",
          created_at: "2026-07-14T12:00:00.000Z",
          id: "comment-1",
        },
      ],
      error: null,
    });
    mocks.from.mockReturnValue(query);

    const comments = await getActivityComments("activity-1", 8);

    expect(query.eq).toHaveBeenCalledWith("activity_id", "activity-1");
    expect(query.limit).toHaveBeenCalledWith(8);
    expect(comments.map((comment) => comment.body)).toEqual(["First", "Second"]);
  });

  it("trims comments, binds them to the signed-in author, and validates empty input", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        activity_id: "activity-1",
        author_id: "user-1",
        body: "Ready!",
        created_at: "2026-07-14T12:00:00.000Z",
        id: "comment-1",
      },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    mocks.from.mockReturnValue({ insert });

    await expect(addActivityComment("activity-1", "  Ready!  ")).resolves.toMatchObject({
      authorId: "user-1",
      body: "Ready!",
    });
    expect(insert).toHaveBeenCalledWith({
      activity_id: "activity-1",
      author_id: "user-1",
      body: "Ready!",
    });
    await expect(addActivityComment("activity-1", "   ")).rejects.toThrow(
      "between 1 and 1000 characters",
    );
  });

  it("uses the idempotent Rate Up RPC and stays inert without realtime configuration", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          activity_id: "activity-1",
          reacted_by_current_user: true,
          reaction_count: 5,
        },
      ],
      error: null,
    });

    await expect(setActivityRateUp("activity-1", true)).resolves.toEqual({
      activityId: "activity-1",
      reactedByCurrentUser: true,
      reactionCount: 5,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("set_activity_rate_up", {
      p_active: true,
      p_activity_id: "activity-1",
    });

    const unsubscribe = subscribeToActivityInteractions(["activity-1"], {
      onCommentDeleted: vi.fn(),
      onCommentUpsert: vi.fn(),
      onReactionChanged: vi.fn(),
    });
    expect(unsubscribe()).toBeUndefined();
  });
});
