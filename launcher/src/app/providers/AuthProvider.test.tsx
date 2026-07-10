import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authChange: null as ((event: string, session: Session | null) => void) | null,
  clearLauncherPresenceForSession: vi.fn(),
  clearSupabaseAuthCache: vi.fn(),
  getSession: vi.fn(),
  invoke: vi.fn(),
  onAuthStateChange: vi.fn(),
  setLauncherPresenceForSession: vi.fn(),
  signOut: vi.fn(),
  syncLocalEntitiesWithSupabase: vi.fn(),
  unsubscribeAuth: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  isTauri: () => false,
}));

vi.mock("../../lib/supabase/config", () => ({
  isSupabaseConfigured: true,
  supabaseConfigError: null,
}));

vi.mock("../../lib/supabase/client", () => ({
  clearSupabaseAuthCache: mocks.clearSupabaseAuthCache,
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
    },
  },
}));

vi.mock("../../lib/supabase/local-entity-sync", () => ({
  syncLocalEntitiesWithSupabase: mocks.syncLocalEntitiesWithSupabase,
}));

vi.mock("../../lib/supabase/presence", () => ({
  clearLauncherPresenceForSession: mocks.clearLauncherPresenceForSession,
  setLauncherPresenceForSession: mocks.setLauncherPresenceForSession,
}));

import { AuthProvider } from "./AuthProvider";
import { useAuthContext } from "./auth-context";

function createSession(userId: string, accessToken: string): Session {
  return {
    access_token: accessToken,
    expires_at: 2_000_000_000,
    expires_in: 3600,
    refresh_token: `${accessToken}-refresh`,
    token_type: "bearer",
    user: {
      app_metadata: {},
      aud: "authenticated",
      created_at: "2026-07-10T10:00:00.000Z",
      id: userId,
      role: "authenticated",
      updated_at: "2026-07-10T10:00:00.000Z",
      user_metadata: {},
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function AuthConsumer() {
  const { signOut, user } = useAuthContext();
  return (
    <div>
      <span>{user?.id ?? "signed-out"}</span>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

describe("AuthProvider account-bound presence", () => {
  const firstSession = createSession("user-1", "access-token-1");

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authChange = null;
    mocks.getSession.mockResolvedValue({ data: { session: firstSession }, error: null });
    mocks.onAuthStateChange.mockImplementation(
      (callback: (event: string, session: Session | null) => void) => {
        mocks.authChange = callback;
        return { data: { subscription: { unsubscribe: mocks.unsubscribeAuth } } };
      },
    );
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.invoke.mockResolvedValue(undefined);
    mocks.clearLauncherPresenceForSession.mockResolvedValue(null);
    mocks.setLauncherPresenceForSession.mockResolvedValue(null);
    mocks.syncLocalEntitiesWithSupabase.mockResolvedValue(undefined);
  });

  it("clears the captured old session and never redirects its heartbeat on account switch", async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    expect(await screen.findByText("user-1")).toBeVisible();
    await waitFor(() => {
      expect(mocks.setLauncherPresenceForSession).toHaveBeenCalledWith(
        {
          accessToken: "access-token-1",
          generation: expect.any(String),
          userId: "user-1",
        },
        { status: "online" },
      );
    });

    const secondSession = createSession("user-2", "access-token-2");
    act(() => {
      mocks.authChange?.("SIGNED_IN", secondSession);
    });

    expect(await screen.findByText("user-2")).toBeVisible();
    await waitFor(() => {
      expect(mocks.clearLauncherPresenceForSession).toHaveBeenCalledWith({
        accessToken: "access-token-1",
        generation: expect.any(String),
        userId: "user-1",
      });
      expect(mocks.setLauncherPresenceForSession).toHaveBeenCalledWith(
        {
          accessToken: "access-token-2",
          generation: expect.any(String),
          userId: "user-2",
        },
        { status: "online" },
      );
    });
    expect(mocks.clearLauncherPresenceForSession).not.toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "access-token-2", userId: "user-2" }),
    );
  });

  it("awaits the captured presence clear before signing out", async () => {
    const pendingClear = new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), 0);
    });
    mocks.clearLauncherPresenceForSession.mockReturnValue(pendingClear);
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    expect(await screen.findByText("user-1")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
    expect(mocks.clearLauncherPresenceForSession).toHaveBeenCalledWith({
      accessToken: "access-token-1",
      generation: expect.any(String),
      userId: "user-1",
    });
    expect(mocks.clearLauncherPresenceForSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signOut.mock.invocationCallOrder[0],
    );
  });

  it("keeps the returned A identity when its older A-to-B clear finishes late", async () => {
    const firstClear = deferred<null>();
    mocks.clearLauncherPresenceForSession.mockImplementation(
      ({ accessToken }: { accessToken: string }) =>
        accessToken === "access-token-1" ? firstClear.promise : Promise.resolve(null),
    );
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );
    expect(await screen.findByText("user-1")).toBeVisible();
    await waitFor(() => expect(mocks.setLauncherPresenceForSession).toHaveBeenCalled());

    act(() => {
      mocks.authChange?.("SIGNED_IN", createSession("user-2", "access-token-2"));
    });
    await waitFor(() => {
      expect(mocks.clearLauncherPresenceForSession).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: "access-token-1", userId: "user-1" }),
      );
    });
    const firstGeneration = (
      mocks.clearLauncherPresenceForSession.mock.calls as Array<
        [{ accessToken: string; generation: string; userId: string }]
      >
    ).find(([identity]) => identity.accessToken === "access-token-1")?.[0].generation as string;

    act(() => {
      mocks.authChange?.("SIGNED_IN", createSession("user-1", "access-token-1"));
    });
    expect(await screen.findByText("user-1")).toBeVisible();
    await waitFor(() => {
      expect(mocks.setLauncherPresenceForSession).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: "access-token-1", userId: "user-1" }),
        { status: "online" },
      );
    });
    const currentGeneration = (
      mocks.setLauncherPresenceForSession.mock.calls.slice().reverse() as Array<
        [{ accessToken: string; generation: string; userId: string }]
      >
    ).find(
      ([identity]) =>
        identity.accessToken === "access-token-1" && identity.generation !== firstGeneration,
    )?.[0].generation as string;
    expect(currentGeneration).not.toBe(firstGeneration);
    await act(async () => {
      firstClear.resolve(null);
      await firstClear.promise;
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => {
      expect(mocks.clearLauncherPresenceForSession).toHaveBeenCalledWith({
        accessToken: "access-token-1",
        generation: currentGeneration,
        userId: "user-1",
      });
      expect(mocks.signOut).toHaveBeenCalledOnce();
    });
  });
});
