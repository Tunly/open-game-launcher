import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const getUser = vi.fn();
  return {
    createClient: vi.fn(() => ({ auth: { getUser } })),
    getUser,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("../config", () => ({
  isSupabaseConfigured: true,
  supabaseAnonKey: "anon-key",
  supabaseConfigError: null,
  supabaseUrl: "https://project.supabase.co",
}));

import { clearSupabaseAuthCache, getSupabaseClient } from "../client";

describe("Supabase auth request cache", () => {
  beforeEach(() => {
    clearSupabaseAuthCache();
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          app_metadata: {},
          aud: "authenticated",
          created_at: "2026-07-10T10:00:00.000Z",
          id: "user-1",
          user_metadata: {},
        },
      },
      error: null,
    });
  });

  it("deduplicates concurrent and repeated no-argument getUser calls", async () => {
    const client = getSupabaseClient();

    await Promise.all([client.auth.getUser(), client.auth.getUser(), client.auth.getUser()]);
    await client.auth.getUser();

    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });

  it("bypasses the shared cache for explicit JWT validation", async () => {
    const client = getSupabaseClient();

    await client.auth.getUser("explicit-token");
    await client.auth.getUser();

    expect(mocks.getUser).toHaveBeenNthCalledWith(1, "explicit-token");
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });
});
