import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: mocks.getUser,
    },
    from: mocks.from,
    functions: {
      invoke: mocks.invoke,
    },
    rpc: mocks.rpc,
  }),
  isSupabaseConfigured: true,
}));

function mockRpcResult(data: unknown, error: { code?: string; message: string } | null = null) {
  const maybeSingle = vi.fn(() => Promise.resolve({ data, error }));
  mocks.rpc.mockReturnValue({ maybeSingle });
  return maybeSingle;
}

const shareToken =
  "ogl_eyJ0eXAiOiJvZ2wtc2hhcmUiLCJhbGciOiJIUzI1NiIsImtpZCI6InNoYXJlLXRva2VuLXYxIn0.eyJ2IjoxLCJqdGkiOiJpbnZpdGUtMTIzIiwiaWF0IjoxNzgxMTEyODAwLCJleHAiOjE3ODExMTQ2MDB9.VZRK5sql2xId2JWnCCprB3ViZnIJeWDC8BEvzLA9s-o";
const shareTokenHint = `${shareToken.slice(0, 10)}...${shareToken.slice(-6)}`;

describe("social share tokens", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
    mocks.getUser.mockReset();
    mocks.invoke.mockReset();
    mocks.rpc.mockReset();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
  });

  it("creates a game invite share token through the RPC and maps the returned row", async () => {
    mockRpcResult({
      expires_at: "2026-06-10T16:00:00.000Z",
      game_title: "Steel Battalion X",
      platform: "steam",
      token: shareToken,
      token_hint: shareTokenHint,
    });

    const { createGameInviteShareToken } = await import("../social");
    const result = await createGameInviteShareToken("user-1", "invite-123", "steam");

    expect(mocks.rpc).toHaveBeenCalledWith("create_game_invite_share_token", {
      invite_id_input: "invite-123",
      platform_input: "steam",
      ttl_seconds_input: 1800,
    });
    expect(result).toEqual({
      expiresAt: "2026-06-10T16:00:00.000Z",
      gameTitle: "Steel Battalion X",
      platform: "steam",
      token: shareToken,
      tokenHint: shareTokenHint,
    });
  });

  it("binds share-token creation to the expected signed-in account", async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: "user-2" } },
      error: null,
    });

    const { createGameInviteShareToken } = await import("../social");

    await expect(createGameInviteShareToken("user-1", "invite-123", "steam")).rejects.toThrow(
      "Your signed-in account changed. Please try again.",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("writes the expected account id into a cross-platform invite", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        created_at: "2026-06-10T15:30:00.000Z",
        expires_at: "2026-06-10T16:00:00.000Z",
        game_title: "Steel Battalion X",
        id: "invite-123",
        receiver_id: "friend-1",
        sender_id: "user-1",
        status: "pending",
        updated_at: "2026-06-10T15:30:00.000Z",
      },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    mocks.from.mockReturnValue({ insert });

    const { sendCrossplatformInvite } = await import("../social");
    await sendCrossplatformInvite(
      "user-1",
      "friend-1",
      "  Steel Battalion X  ",
      "steam",
      null,
      "possible",
    );

    expect(mocks.from).toHaveBeenCalledWith("game_invites");
    expect(insert).toHaveBeenCalledWith({
      game_title: "Steel Battalion X",
      launch_uri: null,
      message: null,
      receiver_id: "friend-1",
      sender_id: "user-1",
    });
  });

  it("never inserts as a new account when the session changes during auth lookup", async () => {
    let resolveAuth: ((value: { data: { user: { id: string } }; error: null }) => void) | undefined;
    mocks.getUser.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAuth = resolve;
      }),
    );

    const { sendCrossplatformInvite } = await import("../social");
    const request = sendCrossplatformInvite(
      "user-1",
      "friend-1",
      "Steel Battalion X",
      "steam",
      null,
      "possible",
    );

    resolveAuth?.({ data: { user: { id: "user-2" } }, error: null });

    await expect(request).rejects.toThrow("Your signed-in account changed. Please try again.");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("resolves a trimmed share token through the RPC and maps invite context", async () => {
    mockRpcResult({
      expires_at: "2026-06-10T16:00:00.000Z",
      game_invite_id: "invite-123",
      game_title: "Neon Circuit",
      platform: "steam",
    });

    const { resolveShareToken } = await import("../social");
    const result = await resolveShareToken(`  ${shareToken}  `);

    expect(mocks.rpc).toHaveBeenCalledWith("resolve_share_token", {
      token_input: shareToken,
    });
    expect(result).toEqual({
      expiresAt: "2026-06-10T16:00:00.000Z",
      gameInviteId: "invite-123",
      gameTitle: "Neon Circuit",
      platform: "steam",
    });
  });

  it("returns null when the share token RPC is missing from the schema", async () => {
    mockRpcResult(null, { code: "PGRST202", message: "Could not find the function" });

    const { createGameInviteShareToken } = await import("../social");
    const result = await createGameInviteShareToken("user-1", "invite-123", "steam");

    expect(result).toBeNull();
  });

  it("redeems a trimmed share token through the accept RPC", async () => {
    mockRpcResult({
      accepted_at: "2026-06-10T15:45:00.000Z",
      game_invite_id: "invite-123",
      game_title: "Neon Circuit",
      platform: "steam",
      status: "accepted",
    });

    const { redeemShareToken } = await import("../social");
    const result = await redeemShareToken(`  ${shareToken}  `);

    expect(mocks.rpc).toHaveBeenCalledWith("redeem_share_token", {
      token_input: shareToken,
    });
    expect(result).toEqual({
      acceptedAt: "2026-06-10T15:45:00.000Z",
      gameInviteId: "invite-123",
      gameTitle: "Neon Circuit",
      platform: "steam",
      status: "accepted",
    });
  });

  it("returns null when the redeem RPC is missing from the schema", async () => {
    mockRpcResult(null, { code: "42883", message: "function does not exist" });

    const { redeemShareToken } = await import("../social");
    const result = await redeemShareToken(shareToken);

    expect(result).toBeNull();
  });

  it("proves hosted replay denial through the invite proof function", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        checkedAt: "2026-06-13T09:30:00.000Z",
        deploymentScope: "hosted-staging",
        gameInviteId: "invite-123",
        gameTitle: "Neon Circuit",
        guards: ["No raw token echoed", "No token hash returned"],
        inviteStatus: "accepted",
        maxUses: 1,
        origin: "https://invite.og-launcher.test",
        originVerified: true,
        platform: "steam",
        replayDenied: true,
        replayError: "Invite token is not redeemable.",
        tokenHint: shareTokenHint,
        usedAt: "2026-06-13T09:29:20.000Z",
        usesCount: 1,
      },
      error: null,
    });

    const { proveInviteHostedReplay } = await import("../social");
    const result = await proveInviteHostedReplay(`  ${shareToken}  `);

    expect(mocks.invoke).toHaveBeenCalledWith("invite-hosted-proof", {
      body: { token: shareToken },
    });
    expect(result).toEqual({
      checkedAt: "2026-06-13T09:30:00.000Z",
      deploymentScope: "hosted-staging",
      gameInviteId: "invite-123",
      gameTitle: "Neon Circuit",
      guards: ["No raw token echoed", "No token hash returned"],
      inviteStatus: "accepted",
      maxUses: 1,
      origin: "https://invite.og-launcher.test",
      originVerified: true,
      platform: "steam",
      replayDenied: true,
      replayError: "Invite token is not redeemable.",
      tokenHint: shareTokenHint,
      usedAt: "2026-06-13T09:29:20.000Z",
      usesCount: 1,
    });
  });

  it("returns null when the hosted proof function is unavailable", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: { message: "Function not found", status: 404 },
    });

    const { proveInviteHostedReplay } = await import("../social");
    const result = await proveInviteHostedReplay(shareToken);

    expect(result).toBeNull();
  });

  it("returns the compatible sender platform instead of the first linked platform", async () => {
    const gameLimit = vi.fn().mockResolvedValue({ data: [{ id: "game-1" }] });
    const gameIlike = vi.fn(() => ({ limit: gameLimit }));
    const gameSelect = vi.fn(() => ({ ilike: gameIlike }));
    const enabledEq = vi.fn().mockResolvedValue({
      data: [
        { is_enabled: true, platform: "steam" },
        { is_enabled: true, platform: "xbox" },
      ],
    });
    const gameIdEq = vi.fn(() => ({ eq: enabledEq }));
    const crossPlaySelect = vi.fn(() => ({ eq: gameIdEq }));
    mocks.from
      .mockReturnValueOnce({ select: gameSelect })
      .mockReturnValueOnce({ select: crossPlaySelect });

    const { checkInviteFeasibility } = await import("../social");
    const result = await checkInviteFeasibility("Steel Battalion X", ["gog", "steam"], ["xbox"]);

    expect(result).toEqual({
      compatibleSenderPlatform: "steam",
      feasibility: "possible",
    });
    expect(mocks.from).toHaveBeenNthCalledWith(1, "games");
    expect(mocks.from).toHaveBeenNthCalledWith(2, "game_cross_play");
  });
});
