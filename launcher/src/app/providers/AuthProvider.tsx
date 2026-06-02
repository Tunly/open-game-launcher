import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabaseConfigError } from "../../lib/supabase/config";
import { AuthContext, type AuthContextValue } from "./auth-context";

type SupabaseClientModule = typeof import("../../lib/supabase/client");

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabaseModuleRef = useRef<SupabaseClientModule | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(supabaseConfigError);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    void import("../../lib/supabase/client")
      .then((module) => {
        if (!isMounted) {
          return;
        }

        supabaseModuleRef.current = module;
        const { supabase } = module;
        if (!supabase) {
          setIsLoading(false);
          return;
        }

        void supabase.auth
          .getSession()
          .then(({ data, error: sessionError }) => {
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
          setSession(nextSession);
          setIsLoading(false);
        });
        subscription = authListener.data.subscription;
      })
      .catch((loadError: unknown) => {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : String(loadError));
        setIsLoading(false);
      });

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
    if (!isSupabaseConfigured || !session?.user) {
      return;
    }

    let isActive = true;
    let cleanup: (() => void) | null = null;

    void import("../../lib/supabase/presence").then(({ clearLauncherPresence, setLauncherPresence }) => {
      if (!isActive) {
        return;
      }

      const syncPresence = (status: "away" | "online") => {
        void setLauncherPresence({ status }).catch(() => undefined);
      };

      syncPresence(document.visibilityState === "hidden" ? "away" : "online");
      const heartbeat = window.setInterval(() => {
        syncPresence(document.visibilityState === "hidden" ? "away" : "online");
      }, 45_000);
      const handleVisibilityChange = () => {
        syncPresence(document.visibilityState === "hidden" ? "away" : "online");
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);

      cleanup = () => {
        window.clearInterval(heartbeat);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        void clearLauncherPresence().catch(() => undefined);
      };
    }).catch(() => undefined);

    return () => {
      isActive = false;
      cleanup?.();
    };
  }, [session?.user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      error,
      isConfigured: isSupabaseConfigured,
      isLoading,
      session,
      user: session?.user ?? null,
      signOut: async () => {
        const module = supabaseModuleRef.current ?? await import("../../lib/supabase/client");
        supabaseModuleRef.current = module;
        const { supabase } = module;
        if (!supabase) {
          return;
        }

        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          throw signOutError;
        }
      },
    }),
    [error, isLoading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
