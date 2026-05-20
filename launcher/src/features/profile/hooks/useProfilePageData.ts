import { useEffect, useState } from "react";

import { isSupabaseConfigured } from "../../../lib/supabase/client";
import { getProfilePageData } from "../../../lib/supabase/profile";
import type { ProfilePageData } from "../../../lib/types/profile";

export function useProfilePageData(username: string | undefined) {
  const [data, setData] = useState<ProfilePageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(username));

  useEffect(() => {
    let isMounted = true;

    if (!username || !isSupabaseConfigured) {
      setData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    void getProfilePageData(username)
      .then((result) => {
        if (isMounted) setData(result);
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [username]);

  return { data, error, isLoading };
}
