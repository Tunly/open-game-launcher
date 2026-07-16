import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Game } from "../../types";

const mocks = vi.hoisted(() => ({
  currentUserId: vi.fn(),
  functionsInvoke: vi.fn(),
  resolveCatalogGameId: vi.fn(),
}));

vi.mock("../client", () => ({
  getCurrentSessionUserId: mocks.currentUserId,
  getSupabaseClient: () => ({ functions: { invoke: mocks.functionsInvoke } }),
  isSupabaseConfigured: true,
}));

vi.mock("../playtime", () => ({
  resolveCatalogGameId: mocks.resolveCatalogGameId,
}));

const game: Game = {
  achievements: [],
  description: "",
  externalId: "440",
  id: "steam-owned-440",
  launcher: "steam",
  platform: "windows",
  status: "not_installed",
  title: "Team Fortress 2",
  version: "1.0.0",
};

const openidResponseUrl =
  "http://localhost:18234/?state=opaque&openid.mode=id_res&openid.sig=signed";

describe("Steam hosted relay client", () => {
  beforeEach(() => {
    mocks.currentUserId.mockReset();
    mocks.currentUserId.mockResolvedValue("user-1");
    mocks.functionsInvoke.mockReset();
    mocks.resolveCatalogGameId.mockReset();
    mocks.resolveCatalogGameId.mockResolvedValue("catalog-game-1");
  });

  it("forwards only the OpenID response URL to the server-side account verifier", async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: {
        ok: true,
        platformAccount: {
          platform: "steam",
          platformAvatarUrl: "https://avatars.example/steam.png",
          platformUserId: "76561198000000000",
          platformUsername: "Manga Pilot",
          verifiedAt: "2026-07-16T12:00:00.000Z",
        },
      },
      error: null,
    });

    const { linkSteamAccountThroughHostedVerifier } = await import("../steam-hosted-relay");
    await expect(linkSteamAccountThroughHostedVerifier(openidResponseUrl)).resolves.toMatchObject({
      platform: "steam",
      platformUserId: "76561198000000000",
      platformUsername: "Manga Pilot",
    });
    expect(mocks.functionsInvoke).toHaveBeenCalledWith("link-steam-account", {
      body: { openidResponseUrl },
    });
    expect(JSON.stringify(mocks.functionsInvoke.mock.calls)).not.toMatch(
      /api[_-]?key|service[_-]?role|steam[_-]?web[_-]?api[_-]?key/i,
    );
  });

  it("rejects callback URLs outside the native loopback boundary", async () => {
    const { linkSteamAccountThroughHostedVerifier } = await import("../steam-hosted-relay");
    await expect(
      linkSteamAccountThroughHostedVerifier(
        "https://attacker.example/?openid.mode=id_res&openid.sig=leak",
      ),
    ).rejects.toThrow(/response URL is invalid/i);
    expect(mocks.functionsInvoke).not.toHaveBeenCalled();
  });

  it("treats a missing future account verifier as unavailable without claiming a link", async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: { context: { status: 404 }, message: "Function not found" },
    });
    const { linkSteamAccountThroughHostedVerifier } = await import("../steam-hosted-relay");
    await expect(linkSteamAccountThroughHostedVerifier(openidResponseUrl)).resolves.toBeNull();
  });

  it("does not swallow a real account-verifier failure", async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: { error: "Steam rejected the OpenID assertion." },
      error: null,
    });
    const { linkSteamAccountThroughHostedVerifier } = await import("../steam-hosted-relay");
    await expect(linkSteamAccountThroughHostedVerifier(openidResponseUrl)).rejects.toThrow(
      "Steam rejected the OpenID assertion.",
    );
  });

  it("keeps an account-verifier conflict visible instead of treating it as relay fallback", async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: { context: { status: 409 }, message: "Steam account is already linked." },
    });
    const { linkSteamAccountThroughHostedVerifier } = await import("../steam-hosted-relay");
    await expect(linkSteamAccountThroughHostedVerifier(openidResponseUrl)).rejects.toThrow(
      "Steam account is already linked.",
    );
  });

  it("invokes the provider relay with the resolved catalog game and validates hosted trust", async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: {
        achievementsSynced: 520,
        gameId: "catalog-game-1",
        newUnlocks: 2,
        ok: true,
        persistence: "hosted",
        provider: "steam",
        syncedAt: "2026-07-16T12:05:00.000Z",
        trust: "provider_verified",
        unlockedCount: 42,
        xpDelta: 75,
      },
      error: null,
    });
    const { relaySteamAchievements } = await import("../steam-hosted-relay");
    await expect(relaySteamAchievements(game, "440")).resolves.toMatchObject({
      achievementsSynced: 520,
      gameId: "catalog-game-1",
      persistence: "hosted",
      trust: "provider_verified",
    });
    expect(mocks.functionsInvoke).toHaveBeenCalledWith("relay-steam-achievements", {
      body: { gameId: "catalog-game-1", steamAppId: "440" },
    });
  });

  it("returns null for unavailable relay transport so the caller can use local fallback", async () => {
    mocks.functionsInvoke.mockResolvedValue({
      data: null,
      error: { message: "Failed to fetch", name: "FunctionsFetchError" },
    });
    const { relaySteamAchievements } = await import("../steam-hosted-relay");
    await expect(relaySteamAchievements(game, "440")).resolves.toBeNull();
  });

  it.each([
    [409, "Steam account binding is required."],
    [503, "Achievement ingestion did not accept relay attestation."],
  ])(
    "returns null for expected relay prerequisite status %i so local sync can continue",
    async (status, message) => {
      mocks.functionsInvoke.mockResolvedValue({
        data: null,
        error: { context: { status }, message },
      });
      const { relaySteamAchievements } = await import("../steam-hosted-relay");
      await expect(relaySteamAchievements(game, "440")).resolves.toBeNull();
    },
  );

  it("rejects untrusted relay success shapes", async () => {
    const { relaySteamAchievements } = await import("../steam-hosted-relay");
    mocks.functionsInvoke.mockResolvedValue({
      data: {
        achievementsSynced: 1,
        gameId: "catalog-game-1",
        newUnlocks: 0,
        ok: true,
        persistence: "local_only",
        provider: "steam",
        syncedAt: "2026-07-16T12:05:00.000Z",
        trust: "unverified",
        unlockedCount: 0,
        xpDelta: 0,
      },
      error: null,
    });
    await expect(relaySteamAchievements(game, "440")).rejects.toThrow(/invalid response/i);
  });
});
