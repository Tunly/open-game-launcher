import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  channel: {
    on: vi.fn(),
    subscribe: vi.fn(),
  },
  createChannel: vi.fn(),
  from: vi.fn(),
  removeChannel: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: mocks.authGetUser },
    from: mocks.from,
    rpc: mocks.rpc,
  }),
  supabase: {
    channel: mocks.createChannel,
    removeChannel: mocks.removeChannel,
  },
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
    mocks.channel.on.mockReturnValue(mocks.channel);
    mocks.channel.subscribe.mockReturnValue(mocks.channel);
    mocks.createChannel.mockReturnValue(mocks.channel);
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

  it("returns a chronological comment page with a stable composite cursor", async () => {
    const query = {
      eq: vi.fn(),
      limit: vi.fn(),
      or: vi.fn(),
      order: vi.fn(),
      select: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.or.mockReturnValue(query);
    query.limit.mockResolvedValue({
      data: [
        {
          activity_id: "activity-1",
          author_id: "user-3",
          body: "Third",
          created_at: "2026-07-14T12:02:00.000Z",
          id: "comment-3",
        },
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

    const page = await getActivityComments("activity-1", {
      before: { createdAt: "2026-07-14T12:03:00.000Z", id: "comment-4" },
      limit: 2,
    });

    expect(query.eq).toHaveBeenCalledWith("activity_id", "activity-1");
    expect(query.or).toHaveBeenCalledWith(
      "created_at.lt.2026-07-14T12:03:00.000Z,and(created_at.eq.2026-07-14T12:03:00.000Z,id.lt.comment-4)",
    );
    expect(query.limit).toHaveBeenCalledWith(3);
    expect(page.comments.map((comment) => comment.body)).toEqual(["Second", "Third"]);
    expect(page.nextCursor).toEqual({
      createdAt: "2026-07-14T12:01:00.000Z",
      id: "comment-2",
    });
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

  it("uses the idempotent Rate Up RPC and stays inert without watched activities", async () => {
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

    const unsubscribe = subscribeToActivityInteractions([], {
      onCommentDeleted: vi.fn(),
      onCommentUpsert: vi.fn(),
      onReactionChanged: vi.fn(),
    });
    expect(unsubscribe()).toBeUndefined();
    expect(mocks.createChannel).not.toHaveBeenCalled();
  });

  it("receives RLS-safe comment deletion events with their parent activity id", () => {
    const onCommentDeleted = vi.fn();
    const unsubscribe = subscribeToActivityInteractions(["activity-1"], {
      onCommentDeleted,
      onCommentUpsert: vi.fn(),
      onReactionChanged: vi.fn(),
    });

    const deletionRegistration = mocks.channel.on.mock.calls.find(
      ([kind, config]) =>
        kind === "postgres_changes" &&
        config.event === "INSERT" &&
        config.table === "activity_comment_deletions",
    );
    expect(deletionRegistration?.[1]).toEqual({
      event: "INSERT",
      filter: "activity_id=in.(activity-1)",
      schema: "public",
      table: "activity_comment_deletions",
    });
    expect(mocks.channel.on).not.toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ event: "DELETE", table: "activity_comments" }),
      expect.any(Function),
    );

    const handleDeletion = deletionRegistration?.[2];
    expect(handleDeletion).toBeTypeOf("function");
    handleDeletion?.({
      eventType: "INSERT",
      new: {
        activity_id: "activity-1",
        comment_id: "comment-1",
        deleted_at: "2026-07-16T12:00:00.000Z",
        event_id: "event-1",
      },
      old: {},
    });
    handleDeletion?.({
      eventType: "INSERT",
      new: {
        activity_id: "activity-not-watched",
        comment_id: "comment-2",
        deleted_at: "2026-07-16T12:00:01.000Z",
        event_id: "event-2",
      },
      old: {},
    });

    expect(onCommentDeleted).toHaveBeenCalledOnce();
    expect(onCommentDeleted).toHaveBeenCalledWith({
      activityId: "activity-1",
      id: "comment-1",
    });

    unsubscribe();
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel);
  });
});
