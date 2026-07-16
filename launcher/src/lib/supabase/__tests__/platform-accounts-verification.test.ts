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
}));

function verificationQuery(data: unknown, error: { code?: string; message: string } | null = null) {
  const query = {
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve({ data, error })),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
  };
  return query;
}

function platformAccountsQuery(data: unknown[]) {
  const ordered = Promise.resolve({ data, error: null });
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ order: vi.fn(() => ordered) })),
    })),
  };
}

describe("provider account verification reads", () => {
  beforeEach(() => {
    mocks.authGetUser.mockReset();
    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.from.mockReset();
  });

  it("requires a server-only Steam OpenID verification matching the platform account", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "provider_account_verifications") {
        return verificationQuery({
          platform: "steam",
          platform_user_id: "76561198000000000",
          user_id: "user-1",
          verification_method: "steam_openid",
          verified_at: "2026-07-16T12:00:00.000Z",
        });
      }
      if (table === "platform_accounts") {
        return platformAccountsQuery([
          {
            created_at: "2026-07-16T12:00:00.000Z",
            id: "account-1",
            linked_at: "2026-07-16T12:00:00.000Z",
            metadata: { client_claimed_verified: true },
            platform: "steam",
            platform_avatar_url: null,
            platform_user_id: "76561198000000000",
            platform_username: "Manga Pilot",
            updated_at: "2026-07-16T12:00:00.000Z",
            user_id: "user-1",
          },
        ]);
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const { getMyVerifiedSteamPlatformAccount } = await import("../platform-accounts");
    await expect(getMyVerifiedSteamPlatformAccount()).resolves.toMatchObject({
      platform: "steam",
      platformUserId: "76561198000000000",
      platformUsername: "Manga Pilot",
      verificationMethod: "steam_openid",
      verifiedAt: "2026-07-16T12:00:00.000Z",
    });
  });

  it("does not trust client-writable platform account metadata without a proof row", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "provider_account_verifications") return verificationQuery(null);
      throw new Error(`Unexpected table ${table}`);
    });

    const { getMyVerifiedSteamPlatformAccount } = await import("../platform-accounts");
    await expect(getMyVerifiedSteamPlatformAccount()).resolves.toBeNull();
    expect(mocks.from).not.toHaveBeenCalledWith("platform_accounts");
  });

  it("rejects a verification row that does not match the linked Steam account", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "provider_account_verifications") {
        return verificationQuery({
          platform: "steam",
          platform_user_id: "76561198000000000",
          user_id: "user-1",
          verification_method: "steam_openid",
          verified_at: "2026-07-16T12:00:00.000Z",
        });
      }
      if (table === "platform_accounts") {
        return platformAccountsQuery([
          {
            created_at: "2026-07-16T12:00:00.000Z",
            id: "account-1",
            linked_at: "2026-07-16T12:00:00.000Z",
            metadata: {},
            platform: "steam",
            platform_avatar_url: null,
            platform_user_id: "76561198000000001",
            platform_username: null,
            updated_at: "2026-07-16T12:00:00.000Z",
            user_id: "user-1",
          },
        ]);
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const { getMyVerifiedSteamPlatformAccount } = await import("../platform-accounts");
    await expect(getMyVerifiedSteamPlatformAccount()).resolves.toBeNull();
  });
});
