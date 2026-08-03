import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabaseConfigError } from "../../lib/supabase/config";
import { clearSupabaseAuthCache, supabase } from "../../lib/supabase/client";
import type { CapturedPresenceSession } from "../../lib/supabase/presence";
import type { GameLifecycleEvent } from "../../lib/types";
import { AuthContext, type AuthContextValue } from "./auth-context";

type CapturedPresenceIdentity = CapturedPresenceSession;
const presenceHeartbeatMs = 5 * 60_000;

function isSameCapturedPresenceIdentity(
  left: CapturedPresenceIdentity | null | undefined,
  right: CapturedPresenceIdentity,
) {
  return (
    left?.accessToken === right.accessToken &&
    left.generation === right.generation &&
    left.userId === right.userId
  );
}

function forgetCapturedPresenceIdentity(
  identities: Map<string, CapturedPresenceIdentity>,
  capturedIdentity: CapturedPresenceIdentity,
) {
  if (isSameCapturedPresenceIdentity(identities.get(capturedIdentity.userId), capturedIdentity)) {
    identities.delete(capturedIdentity.userId);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const activePresenceIdentityRef = useRef<CapturedPresenceIdentity | null>(null);
  const latestPresenceSessionByUserRef = useRef(new Map<string, CapturedPresenceIdentity>());
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(supabaseConfigError);
  const sessionUserId = session?.user.id ?? null;
  const sessionAccessToken = session?.access_token?.trim() ?? null;

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    if (!supabase) {
      setIsLoading(false);
      return;
    }

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!isMounted) {
        return;
      }
      if (sessionError) {
        setError(sessionError.message);
      }
      setSession(data.session);
      setIsLoading(false);
    });

    const authListener = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }
      clearSupabaseAuthCache();
      setSession(nextSession);
      setIsLoading(false);
    });
    subscription = authListener.data.subscription;

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const accessToken = session?.access_token?.trim();
    void invoke("cache_supabase_access_token", { token: accessToken ?? "" }).catch(() => undefined);
  }, [session?.access_token]);

  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user?.id) {
      return;
    }

    let isActive = true;
    void import("../../lib/supabase/local-entity-sync")
      .then(({ syncLocalEntitiesWithSupabase }) => {
        if (!isActive) {
          return;
        }
        return syncLocalEntitiesWithSupabase(session.user.id);
      })
      .catch((syncError: unknown) => {
        console.warn("Local entity Supabase sync failed", syncError);
      });

    return () => {
      isActive = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured || !sessionUserId || !sessionAccessToken) {
      return;
    }

    const presenceUserId = sessionUserId;
    const presenceSessions = latestPresenceSessionByUserRef.current;
    const capturedPresenceSession: CapturedPresenceIdentity = {
      accessToken: sessionAccessToken,
      generation: crypto.randomUUID(),
      userId: presenceUserId,
    };
    let isActive = true;
    let cleanup: (() => void) | null = null;
    let clearPresenceForSession:
      typeof import("../../lib/supabase/presence").clearLauncherPresenceForSession | null = null;
    let unlistenGameStarted: (() => void) | null = null;
    let unlistenGameStopped: (() => void) | null = null;
    let lifecycleQueue = Promise.resolve();
    presenceSessions.set(presenceUserId, capturedPresenceSession);
    activePresenceIdentityRef.current = capturedPresenceSession;

    void import("../../lib/supabase/presence")
      .then(({ clearLauncherPresenceForSession, setLauncherPresenceForSession }) => {
        if (!isActive) {
          return;
        }
        clearPresenceForSession = clearLauncherPresenceForSession;

        const syncPresence = (status: "away" | "online") => {
          void setLauncherPresenceForSession(capturedPresenceSession, { status }).catch(
            () => undefined,
          );
        };

        let heartbeat: number | null = null;
        const stopHeartbeat = () => {
          if (heartbeat !== null) {
            window.clearInterval(heartbeat);
            heartbeat = null;
          }
        };
        const startHeartbeat = () => {
          if (heartbeat !== null || document.visibilityState === "hidden") return;
          heartbeat = window.setInterval(() => syncPresence("online"), presenceHeartbeatMs);
        };
        const handleVisibilityChange = () => {
          const isHidden = document.visibilityState === "hidden";
          syncPresence(isHidden ? "away" : "online");
          if (isHidden) {
            stopHeartbeat();
          } else {
            startHeartbeat();
          }
        };

        syncPresence(document.visibilityState === "hidden" ? "away" : "online");
        startHeartbeat();
        document.addEventListener("visibilitychange", handleVisibilityChange);

        if (isTauri()) {
          void Promise.all([
            import("@tauri-apps/api/event"),
            import("../../lib/supabase/game-lifecycle-social"),
          ])
            .then(async ([{ listen }, { syncGameLifecycleSocial }]) => {
              const handleLifecycleEvent = (event: { payload: GameLifecycleEvent }) => {
                lifecycleQueue = lifecycleQueue
                  .then(() => {
                    if (!isActive) return null;
                    return syncGameLifecycleSocial(
                      event.payload,
                      document.visibilityState === "hidden" ? "away" : "online",
                      capturedPresenceSession,
                    );
                  })
                  .then(() => undefined)
                  .catch((lifecycleError: unknown) => {
                    console.warn("Game lifecycle social sync failed", lifecycleError);
                  });
              };
              const started = await listen<GameLifecycleEvent>(
                "game_started",
                handleLifecycleEvent,
              );
              if (!isActive) {
                started();
                return;
              }
              unlistenGameStarted = started;
              const stopped = await listen<GameLifecycleEvent>(
                "game_stopped",
                handleLifecycleEvent,
              );
              if (!isActive) {
                started();
                stopped();
                return;
              }
              unlistenGameStopped = stopped;
            })
            .catch((lifecycleListenerError: unknown) => {
              console.warn(
                "Game lifecycle listeners could not be registered",
                lifecycleListenerError,
              );
            });
        }

        cleanup = () => {
          stopHeartbeat();
          document.removeEventListener("visibilitychange", handleVisibilityChange);
          unlistenGameStarted?.();
          unlistenGameStopped?.();
        };
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
      if (
        isSameCapturedPresenceIdentity(activePresenceIdentityRef.current, capturedPresenceSession)
      ) {
        activePresenceIdentityRef.current = null;
      }
      cleanup?.();
      queueMicrotask(() => {
        if (activePresenceIdentityRef.current?.userId === presenceUserId) return;
        const clearPromise = clearPresenceForSession
          ? clearPresenceForSession(capturedPresenceSession)
          : import("../../lib/supabase/presence").then(({ clearLauncherPresenceForSession }) =>
              clearLauncherPresenceForSession(capturedPresenceSession),
            );
        void clearPromise
          .catch(() => undefined)
          .finally(() => {
            forgetCapturedPresenceIdentity(presenceSessions, capturedPresenceSession);
          });
      });
    };
  }, [sessionAccessToken, sessionUserId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      error,
      isConfigured: isSupabaseConfigured,
      isLoading,
      session,
      user: session?.user ?? null,
      signOut: async () => {
        if (!supabase) {
          return;
        }

        const capturedSession = session?.user.id
          ? latestPresenceSessionByUserRef.current.get(session.user.id)
          : null;
        if (capturedSession) {
          try {
            const { clearLauncherPresenceForSession } = await import("../../lib/supabase/presence");
            await clearLauncherPresenceForSession(capturedSession);
          } catch (presenceError) {
            console.warn("Launcher presence could not be cleared before sign out", presenceError);
          }
        }

        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          throw signOutError;
        }
        if (capturedSession) {
          forgetCapturedPresenceIdentity(latestPresenceSessionByUserRef.current, capturedSession);
        }
        clearSupabaseAuthCache();
      },
    }),
    [error, isLoading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
