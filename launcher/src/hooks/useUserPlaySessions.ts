import { useCallback, useEffect, useRef, useState } from "react";

import {
  getUserPlaySessionYears,
  getUserPlaySessions,
  type GetUserPlaySessionsOptions,
  type UserPlaySession,
} from "../lib/supabase/playtime";
import { useCurrentUser } from "./useCurrentUser";

export interface UseUserPlaySessionsOptions {
  includeAvailableYears?: boolean;
  since?: Date | string;
  until?: Date | string;
}

export interface UseUserPlaySessionsResult {
  availableYears: number[];
  error: string | null;
  isAuthenticated: boolean;
  isConfigured: boolean;
  isLoading: boolean;
  refetch: () => void;
  sessions: UserPlaySession[];
}

function stableTimestamp(value: Date | string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return (value instanceof Date ? value : new Date(value)).toISOString();
}

/**
 * Loads the signed-in user's `game_sessions` rows from Supabase and
 * re-fetches whenever the auth state, calendar range, or reload token changes.
 */
export function useUserPlaySessions(
  options: UseUserPlaySessionsOptions = {},
): UseUserPlaySessionsResult {
  const { isConfigured, isLoading: isAuthLoading, session } = useCurrentUser();
  const userId = session?.user?.id ?? null;
  const isAuthenticated = userId !== null;
  const includeAvailableYears = options.includeAvailableYears === true;
  const sinceTimestamp = stableTimestamp(options.since);
  const untilTimestamp = stableTimestamp(options.until);
  const [sessions, setSessions] = useState<UserPlaySession[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(isConfigured);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const committedUserIdRef = useRef<string | null>(null);

  const refetch = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!isConfigured) {
      committedUserIdRef.current = null;
      setSessions([]);
      setAvailableYears([]);
      setIsLoading(false);
      setError(null);
      return () => {
        isMounted = false;
      };
    }

    if (isAuthLoading) {
      committedUserIdRef.current = null;
      setSessions([]);
      setAvailableYears([]);
      setIsLoading(true);
      setError(null);
      return () => {
        isMounted = false;
      };
    }

    if (!userId) {
      committedUserIdRef.current = null;
      setSessions([]);
      setAvailableYears([]);
      setIsLoading(false);
      setError(null);
      return () => {
        isMounted = false;
      };
    }

    if (committedUserIdRef.current !== userId) {
      setSessions([]);
      setAvailableYears([]);
    }

    setIsLoading(true);
    setError(null);
    if (!includeAvailableYears) {
      setAvailableYears([]);
    }

    const sessionOptions: GetUserPlaySessionsOptions = {};
    if (sinceTimestamp) {
      sessionOptions.since = new Date(sinceTimestamp);
    }
    if (untilTimestamp) {
      sessionOptions.until = new Date(untilTimestamp);
    }

    const sessionsRequest =
      sinceTimestamp || untilTimestamp
        ? getUserPlaySessions(sessionOptions)
        : getUserPlaySessions();
    const availableYearsRequest = includeAvailableYears
      ? getUserPlaySessionYears()
      : Promise.resolve<number[] | null>(null);

    void Promise.all([sessionsRequest, availableYearsRequest])
      .then(([rows, years]) => {
        if (!isMounted) {
          return;
        }
        committedUserIdRef.current = userId;
        setSessions(rows);
        if (years) {
          setAvailableYears(years);
        }
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
  }, [
    includeAvailableYears,
    isAuthLoading,
    isConfigured,
    reloadToken,
    sinceTimestamp,
    untilTimestamp,
    userId,
  ]);

  const ownsCommittedActivity = userId !== null && committedUserIdRef.current === userId;

  return {
    availableYears: ownsCommittedActivity ? availableYears : [],
    error,
    isAuthenticated,
    isConfigured,
    isLoading: isConfigured && (isAuthLoading || isLoading),
    refetch,
    sessions: ownsCommittedActivity ? sessions : [],
  };
}
