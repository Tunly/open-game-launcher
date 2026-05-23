import { useEffect, useState } from "react";

import { isSupabaseConfigured } from "../../../lib/supabase/client";
import { searchProfiles } from "../../../lib/supabase/profile";
import type { Profile } from "../../../lib/types/profile";

export function useFriendSearch(query: string, currentUserId?: string) {
  const [results, setResults] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const trimmed = query.trim();

    if (!isSupabaseConfigured || trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeout = window.setTimeout(() => {
      void searchProfiles(trimmed)
        .then((profiles) => {
          if (isMounted) {
            setResults(
              profiles.filter((profile) => profile.id !== currentUserId),
            );
          }
        })
        .catch((searchError: unknown) => {
          if (isMounted) {
            setError(
              searchError instanceof Error
                ? searchError.message
                : String(searchError),
            );
          }
        })
        .finally(() => {
          if (isMounted) setIsSearching(false);
        });
    }, 250);

    return () => {
      isMounted = false;
      window.clearTimeout(timeout);
    };
  }, [currentUserId, query]);

  return { error, isSearching, results };
}
