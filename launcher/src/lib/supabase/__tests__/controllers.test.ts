import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const authGetUser = vi.fn();
  const from = vi.fn();
  const getSupabaseClient = vi.fn();
  const rpc = vi.fn();
  return {
    authGetUser,
    from,
    getSupabaseClient,
    rpc,
  };
});

vi.mock("../client", () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

describe("controller layout supabase helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.authGetUser.mockReset();
    mocks.from.mockReset();
    mocks.getSupabaseClient.mockReset();
    mocks.rpc.mockReset();

    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.getSupabaseClient.mockReturnValue({
      auth: { getUser: mocks.authGetUser },
      from: mocks.from,
      rpc: mocks.rpc,
    });
  });

  it("maps hosted community controller layouts from the approved-feed RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          author_name: "Pad Club",
          bindings: [{ input: "A / Cross", output: "Space" }],
          controller_type: "xbox",
          created_at: "2026-06-12T12:00:00.000Z",
          download_count: 22,
          game_id: "steam-440",
          gyro_enabled: false,
          haptics_enabled: true,
          id: "layout-1",
          moderation_status: "approved",
          name: "Arcade Twin-Stick",
          report_count: 0,
          template: "gamepad",
          updated_at: "2026-06-12T12:01:00.000Z",
          user_id: "author-1",
          user_vote: 1,
          vote_score: 14,
        },
      ],
      error: null,
    });

    const { listHostedControllerLayouts } = await import("../controllers");
    const result = await listHostedControllerLayouts({
      controllerType: "xbox",
      gameId: "steam-440",
      limit: 12,
    });

    expect(result.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("list_community_controller_layouts", {
      p_controller_type: "xbox",
      p_game_id: "steam-440",
      p_limit: 12,
    });
    if (!result.ok) return;
    expect(result.value[0]).toEqual(
      expect.objectContaining({
        authorName: "Pad Club",
        downloadCount: 22,
        id: "layout-1",
        isCommunity: true,
        moderationStatus: "approved",
        name: "Arcade Twin-Stick",
        userVote: 1,
        voteScore: 14,
      }),
    );
  });

  it("persists hosted controller layout votes through the vote RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ layout_id: "layout-1", user_vote: 1, vote_score: 15 }],
      error: null,
    });

    const { setHostedControllerLayoutVote } = await import("../controllers");
    const result = await setHostedControllerLayoutVote("layout-1", 1);

    expect(mocks.authGetUser).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("vote_controller_layout", {
      p_layout_id: "layout-1",
      p_vote: 1,
    });
    expect(result).toEqual({
      ok: true,
      value: { layoutId: "layout-1", userVote: 1, voteScore: 15 },
    });
  });

  it("records hosted controller layout downloads through the scoped RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ download_count: 23, layout_id: "layout-1" }],
      error: null,
    });

    const { recordHostedControllerLayoutDownload } = await import("../controllers");
    const result = await recordHostedControllerLayoutDownload("layout-1");

    expect(mocks.rpc).toHaveBeenCalledWith("record_controller_layout_download", {
      p_layout_id: "layout-1",
    });
    expect(result).toEqual({
      ok: true,
      value: { downloadCount: 23, layoutId: "layout-1" },
    });
  });

  it("reports hosted controller layouts through the moderation RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ layout_id: "layout-1", moderation_status: "pending", report_count: 3 }],
      error: null,
    });

    const { reportHostedControllerLayout } = await import("../controllers");
    const result = await reportHostedControllerLayout("layout-1", "Wrong bindings");

    expect(mocks.authGetUser).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("report_controller_layout", {
      p_layout_id: "layout-1",
      p_reason: "Wrong bindings",
    });
    expect(result).toEqual({
      ok: true,
      value: { layoutId: "layout-1", moderationStatus: "pending", reportCount: 3 },
    });
  });

  it("returns a schema fallback when hosted controller layout RPCs are absent", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "42883",
        message: "function list_community_controller_layouts does not exist",
      },
    });

    const { listHostedControllerLayouts } = await import("../controllers");
    const result = await listHostedControllerLayouts();

    expect(result).toEqual({
      ok: false,
      reason: "schema",
      message: "Hosted controller layout schema is not applied yet.",
    });
  });
});
