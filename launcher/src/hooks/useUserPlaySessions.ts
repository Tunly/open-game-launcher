import { useCallback, useEffect, useState } from "react";

import { getUserPlaySessions, type UserPlaySession } from "../lib/supabase/playtime";
import { useCurrentUser } from "./useCurrentUser";

export interface UseUserPlaySessionsResult {
  error: string | null;
  isConfigured: boolean;
  isLoading: boolean;
  refetch: () => void;
  sessions: UserPlaySession[];
}

/**
 * Loads the signed-in user's `game_sessions` rows from Supabase and
 * re-fetches whenever the auth state changes.
 */
export function useUserPlaySessions(): UseUserPlaySessionsResult {
  const { isConfigured, session } = useCurrentUser();
  const userId = session?.user?.id ?? null;
  const [sessions, setSessions] = useState<UserPlaySession[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(isConfigured);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!isConfigured || !userId) {
      setSessions([]);
      setIsLoading(false);
      setError(null);
      return () => {
        isMounted = false;
      };
    }

    setIsLoading(true);
    setError(null);

    void getUserPlaySessions()
      .then((rows) => {
        if (!isMounted) {
          return;
        }
        setSessions(rows);
      })
      .catch((loadError: unknown) => {
        if (!isMounted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isConfigured, userId, reloadToken]);

  return { sessions, isConfigured, isLoading, error, refetch };
}
