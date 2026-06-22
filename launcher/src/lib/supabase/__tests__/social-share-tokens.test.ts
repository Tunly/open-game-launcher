import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
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
    mocks.invoke.mockReset();
    mocks.rpc.mockReset();
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
    const result = await createGameInviteShareToken("invite-123", "steam");

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
    const result = await createGameInviteShareToken("invite-123", "steam");

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
});
