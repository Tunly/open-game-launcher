import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getCurrentSessionUserId: vi.fn(),
  getSupabaseClient: vi.fn(),
}));

vi.mock("../config", () => ({
  supabaseAnonKey: "anon-public-key",
  supabaseUrl: "https://project.supabase.co/",
}));

vi.mock("../client", () => ({
  getCurrentSessionUserId: mocks.getCurrentSessionUserId,
  getSupabaseClient: mocks.getSupabaseClient,
  supabase: null,
}));

import {
  clearLauncherPresenceForSession,
  setLauncherPresenceForSession,
  setLauncherPresenceForUser,
} from "../presence";

describe("captured launcher presence sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears only the captured user row with the captured user token", async () => {
    await clearLauncherPresenceForSession({
      accessToken: "old-user-access-token",
      generation: "11111111-1111-4111-8111-111111111111",
      userId: "old-user-id",
    });

    expect(mocks.fetch).toHaveBeenCalledOnce();
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://project.supabase.co/rest/v1/user_presence?user_id=eq.old-user-id&session_generation=eq.11111111-1111-4111-8111-111111111111",
    );
    expect(init).toMatchObject({
      headers: {
        apikey: "anon-public-key",
        Authorization: "Bearer old-user-access-token",
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      method: "PATCH",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      current_game_id: null,
      current_game_title: null,
      platform: null,
      status: "offline",
    });
  });

  it("does not redirect an account-bound heartbeat to the newly active session", async () => {
    mocks.getCurrentSessionUserId.mockResolvedValue("new-user-id");

    await setLauncherPresenceForUser("old-user-id", { status: "online" });

    expect(mocks.getSupabaseClient).not.toHaveBeenCalled();
  });

  it("writes the captured auth-effect generation with each session heartbeat", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.getCurrentSessionUserId.mockResolvedValue("current-user-id");
    mocks.getSupabaseClient.mockReturnValue({
      from: vi.fn(() => ({ upsert })),
    });

    await setLauncherPresenceForSession(
      {
        generation: "22222222-2222-4222-8222-222222222222",
        userId: "current-user-id",
      },
      { status: "away" },
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_generation: "22222222-2222-4222-8222-222222222222",
        status: "away",
        user_id: "current-user-id",
      }),
      { onConflict: "user_id" },
    );
  });

  it("does not issue a captured clear without both an account and token", async () => {
    await clearLauncherPresenceForSession({
      accessToken: "",
      generation: "11111111-1111-4111-8111-111111111111",
      userId: "old-user-id",
    });
    await clearLauncherPresenceForSession({
      accessToken: "old-user-access-token",
      generation: "11111111-1111-4111-8111-111111111111",
      userId: "",
    });
    await clearLauncherPresenceForSession({
      accessToken: "old-user-access-token",
      generation: "",
      userId: "old-user-id",
    });

    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
