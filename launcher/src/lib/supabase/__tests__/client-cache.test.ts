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

import { clearSupabaseAuthCache, getCurrentSupabaseUser, getSupabaseClient } from "../client";

function createUser(id: string) {
  return {
    app_metadata: {},
    aud: "authenticated",
    created_at: "2026-07-10T10:00:00.000Z",
    id,
    user_metadata: {},
  };
}

function createDeferredUserResponse(id: string) {
  let resolve!: (value: { data: { user: ReturnType<typeof createUser> }; error: null }) => void;
  const promise = new Promise<{
    data: { user: ReturnType<typeof createUser> };
    error: null;
  }>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return {
    promise,
    resolve: () => resolve({ data: { user: createUser(id) }, error: null }),
  };
}

describe("Supabase current-user request coordination", () => {
  beforeEach(() => {
    clearSupabaseAuthCache();
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue({
      data: {
        user: createUser("user-1"),
      },
      error: null,
    });
  });

  it("does not replace the Supabase client's getUser implementation", async () => {
    const client = getSupabaseClient();

    expect(client.auth.getUser).toBe(mocks.getUser);

    await client.auth.getUser("explicit-token");
    expect(mocks.getUser).toHaveBeenCalledWith("explicit-token");
  });

  it("deduplicates only concurrent current-user validations", async () => {
    const pending = createDeferredUserResponse("user-1");
    mocks.getUser.mockReturnValueOnce(pending.promise);

    const users = Promise.all([
      getCurrentSupabaseUser(),
      getCurrentSupabaseUser(),
      getCurrentSupabaseUser(),
    ]);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);

    pending.resolve();
    await expect(users).resolves.toEqual([
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ id: "user-1" }),
    ]);

    await getCurrentSupabaseUser();
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a settled identity after an account change", async () => {
    mocks.getUser
      .mockResolvedValueOnce({ data: { user: createUser("user-1") }, error: null })
      .mockResolvedValueOnce({ data: { user: createUser("user-2") }, error: null });

    await expect(getCurrentSupabaseUser()).resolves.toMatchObject({ id: "user-1" });
    await expect(getCurrentSupabaseUser()).resolves.toMatchObject({ id: "user-2" });

    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });

  it("retries an in-flight validation invalidated by an auth event", async () => {
    const oldIdentity = createDeferredUserResponse("user-1");
    const currentIdentity = createDeferredUserResponse("user-2");
    mocks.getUser
      .mockReturnValueOnce(oldIdentity.promise)
      .mockReturnValueOnce(currentIdentity.promise);

    const firstCaller = getCurrentSupabaseUser();
    clearSupabaseAuthCache();
    const secondCaller = getCurrentSupabaseUser();
    oldIdentity.resolve();
    await Promise.resolve();

    expect(mocks.getUser).toHaveBeenCalledTimes(2);

    currentIdentity.resolve();

    await expect(firstCaller).resolves.toMatchObject({ id: "user-2" });
    await expect(secondCaller).resolves.toMatchObject({ id: "user-2" });
  });
});
