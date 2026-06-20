import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const authGetUser = vi.fn();
  const from = vi.fn();
  const functionsInvoke = vi.fn();
  const getPublicUrl = vi.fn();
  const getSupabaseClient = vi.fn();
  const rpc = vi.fn();
  const storageFrom = vi.fn();
  const upload = vi.fn();
  return {
    authGetUser,
    from,
    functionsInvoke,
    getPublicUrl,
    getSupabaseClient,
    rpc,
    storageFrom,
    upload,
  };
});

vi.mock("../client", () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

describe("community artwork supabase helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.authGetUser.mockReset();
    mocks.from.mockReset();
    mocks.functionsInvoke.mockReset();
    mocks.getPublicUrl.mockReset();
    mocks.getSupabaseClient.mockReset();
    mocks.rpc.mockReset();
    mocks.storageFrom.mockReset();
    mocks.upload.mockReset();

    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.getSupabaseClient.mockReturnValue({
      auth: { getUser: mocks.authGetUser },
      from: mocks.from,
      functions: { invoke: mocks.functionsInvoke },
      rpc: mocks.rpc,
      storage: { from: mocks.storageFrom },
    });
    mocks.storageFrom.mockReturnValue({
      getPublicUrl: mocks.getPublicUrl,
      upload: mocks.upload,
    });
    mocks.getPublicUrl.mockImplementation((path: string) => ({
      data: { publicUrl: `https://cdn.example/${path}` },
    }));
  });

  it("maps approved hosted artwork rows into community candidates", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          artist_name: "Inkline Crew",
          created_at: "2026-06-12T10:00:00.000Z",
          description: "Approved cover.",
          download_count: 7,
          id: "art-1",
          kind: "cover",
          moderation_status: "approved",
          report_count: 0,
          source_url: "https://cdn.example/cover.png",
          tags: ["cover", "manga"],
          title: "Hosted Cover",
          updated_at: "2026-06-12T10:01:00.000Z",
          user_vote: 1,
          vote_score: 12,
        },
      ],
      error: null,
    });

    const { listHostedCommunityArtworkCandidates } = await import("../community-artwork");
    const result = await listHostedCommunityArtworkCandidates("steam-123");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mocks.rpc).toHaveBeenCalledWith("list_community_artwork", {
      p_game_id: "steam-123",
      p_limit: 24,
    });
    expect(result.value[0]).toEqual(
      expect.objectContaining({
        artist: "Inkline Crew",
        hosted: true,
        id: "art-1",
        kind: "cover",
        title: "Hosted Cover",
        userVote: 1,
        votes: 12,
      }),
    );
  });

  it("returns a schema fallback when hosted artwork RPCs are absent", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "42883", message: "function list_community_artwork does not exist" },
    });

    const { listHostedCommunityArtworkCandidates } = await import("../community-artwork");
    const result = await listHostedCommunityArtworkCandidates("steam-123");

    expect(result).toEqual({
      ok: false,
      reason: "schema",
      message: "Hosted community artwork schema is not applied yet.",
    });
  });

  it("persists hosted vote state through the vote RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ artwork_id: "art-1", user_vote: 1, vote_score: 13 }],
      error: null,
    });

    const { setHostedCommunityArtworkVote } = await import("../community-artwork");
    const result = await setHostedCommunityArtworkVote("art-1", 1);

    expect(mocks.authGetUser).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("vote_community_artwork", {
      p_artwork_id: "art-1",
      p_vote: 1,
    });
    expect(result).toEqual({
      ok: true,
      value: { artworkId: "art-1", userVote: 1, voteScore: 13 },
    });
  });

  it("uploads artwork to the game-artwork bucket and inserts pending metadata", async () => {
    mocks.upload.mockResolvedValue({ data: null, error: null });
    const insertChain = makeArtworkInsertChain({
      artist_name: "Manga Relay",
      created_at: "2026-06-12T10:00:00.000Z",
      description: "Pending cover.",
      download_count: 0,
      id: "art-2",
      kind: "cover",
      moderation_status: "pending",
      report_count: 0,
      source_url: "https://cdn.example/user-1/games/steam-123/cover-id.png",
      tags: ["cover"],
      title: "Pending Cover",
      updated_at: "2026-06-12T10:00:00.000Z",
      user_vote: 0,
      vote_score: 0,
    });
    mocks.from.mockReturnValue(insertChain);

    const { uploadCommunityArtworkForGame } = await import("../community-artwork");
    const result = await uploadCommunityArtworkForGame({
      artistName: "Manga Relay",
      file: new File(["image"], "cover.png", { type: "image/png" }),
      gameId: "steam-123",
      kind: "cover",
      tags: ["cover"],
      title: "Pending Cover",
    });

    expect(result.ok).toBe(true);
    expect(mocks.storageFrom).toHaveBeenCalledWith("game-artwork");
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringContaining("user-1/games/steam-123/cover-"),
      expect.any(File),
      expect.objectContaining({ contentType: "image/png", upsert: false }),
    );
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        artist_name: "Manga Relay",
        game_id: "steam-123",
        kind: "cover",
        moderation_status: "pending",
        submitter_id: "user-1",
        title: "Pending Cover",
      }),
    );
  });

  it("keeps upload unavailable when Supabase is not configured", async () => {
    mocks.getSupabaseClient.mockImplementation(() => {
      throw new Error("Missing Supabase config");
    });

    const { uploadCommunityArtworkForGame } = await import("../community-artwork");
    const result = await uploadCommunityArtworkForGame({
      artistName: "Manga Relay",
      file: new File(["image"], "cover.png", { type: "image/png" }),
      gameId: "steam-123",
      kind: "cover",
      title: "Pending Cover",
    });

    expect(result).toEqual({
      ok: false,
      reason: "config",
      message: "Hosted community artwork needs Supabase configuration.",
    });
  });

  it("surfaces hosted artwork storage failures before metadata insert", async () => {
    mocks.upload.mockResolvedValue({
      data: null,
      error: { message: "bucket rejected upload" },
    });

    const { uploadCommunityArtworkForGame } = await import("../community-artwork");
    const result = await uploadCommunityArtworkForGame({
      artistName: " Manga Relay ",
      file: new File(["image"], "cover.png", { type: "image/png" }),
      gameId: "steam-123",
      kind: "cover",
      title: " Pending Cover ",
    });

    expect(result).toEqual({
      ok: false,
      reason: "storage",
      message: "bucket rejected upload",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("maps hosted moderation queue rows for trusted review consoles", async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: {
        action: "list_queue",
        data: [
          {
            artist_name: "Manga Relay",
            created_at: "2026-06-12T10:00:00.000Z",
            description: "Pending cover.",
            download_count: 0,
            game_id: "steam-123",
            id: "art-queue-1",
            kind: "cover",
            last_audit_action: "queued",
            last_audit_at: "2026-06-12T10:00:00.000Z",
            last_report_reason: "wrong_game",
            last_reported_at: "2026-06-12T10:10:00.000Z",
            last_scan_verdict: "needs_review",
            last_scanned_at: "2026-06-12T10:05:00.000Z",
            moderation_reason: "reported-by-community",
            moderation_status: "pending",
            report_count: 3,
            source_url: "https://cdn.example/cover.png",
            storage_path: "user-1/games/steam-123/cover-id.png",
            submitter_id: "submitter-1",
            tags: ["cover"],
            title: "Queue Cover",
            updated_at: "2026-06-12T10:10:00.000Z",
            user_vote: 0,
            vote_score: 0,
          },
        ],
        reviewerRole: "moderator",
        rpc: "list_community_artwork_moderation_queue",
      },
      error: null,
    });

    const { listCommunityArtworkModerationQueue } = await import("../community-artwork");
    const result = await listCommunityArtworkModerationQueue("pending", 25);

    expect(mocks.functionsInvoke).toHaveBeenCalledWith("community-artwork-moderation", {
      body: {
        action: "list_queue",
        limit: 25,
        status: "pending",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toEqual(
      expect.objectContaining({
        gameId: "steam-123",
        lastReportReason: "wrong_game",
        lastScannedAt: "2026-06-12T10:05:00.000Z",
        lastScanVerdict: "needs_review",
        moderationReason: "reported-by-community",
        storagePath: "user-1/games/steam-123/cover-id.png",
        submitterId: "submitter-1",
        title: "Queue Cover",
      }),
    );
  });

  it("returns a trusted-endpoint message when moderation endpoint rejects the reviewer", async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: { error: "Community artwork reviewer is not active." },
      error: { message: "Edge Function returned a non-2xx status code" },
    });

    const { listCommunityArtworkModerationQueue } = await import("../community-artwork");
    const result = await listCommunityArtworkModerationQueue();

    expect(result).toEqual({
      ok: false,
      reason: "auth",
      message: "Community artwork moderation requires a trusted service-role endpoint.",
    });
  });

  it("maps review results into audit evidence", async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: {
        action: "review_artwork",
        data: [
          {
            approved_at: "2026-06-12T10:30:00.000Z",
            artwork_id: "art-queue-1",
            audit_action: "approved",
            audit_id: "audit-1",
            audit_reason: "Looks correct.",
            moderation_reason: "Looks correct.",
            moderation_status: "approved",
            rejected_at: null,
            report_count: 0,
          },
        ],
        reviewerRole: "moderator",
        rpc: "review_community_artwork",
      },
      error: null,
    });

    const { reviewCommunityArtwork } = await import("../community-artwork");
    const result = await reviewCommunityArtwork({
      artworkId: "art-queue-1",
      decision: "approve",
      reason: " Looks correct. ",
    });

    expect(mocks.functionsInvoke).toHaveBeenCalledWith("community-artwork-moderation", {
      body: {
        action: "review_artwork",
        artworkId: "art-queue-1",
        decision: "approve",
        reason: "Looks correct.",
      },
    });
    expect(result).toEqual({
      ok: true,
      value: {
        approvedAt: "2026-06-12T10:30:00.000Z",
        artworkId: "art-queue-1",
        auditAction: "approved",
        auditId: "audit-1",
        auditReason: "Looks correct.",
        moderationReason: "Looks correct.",
        moderationStatus: "approved",
        rejectedAt: undefined,
        reportCount: 0,
      },
      message: "Community artwork review saved to the audit log.",
    });
  });
});

function makeArtworkInsertChain(row: unknown) {
  const maybeSingle = vi.fn(() => Promise.resolve({ data: row, error: null }));
  const select = vi.fn(() => ({ maybeSingle }));
  return {
    insert: vi.fn(() => ({ select })),
  };
}
