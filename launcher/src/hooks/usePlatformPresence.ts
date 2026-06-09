import { useCallback, useEffect, useState } from "react";

import type {
  AggregatedPresence,
  FriendLink,
  PlatformPresenceInfo,
  PlatformType,
} from "../lib/types/friends";
import type { UserPresence } from "../lib/types/profile";
import { getVisiblePresence, subscribeToPresenceChanges } from "../lib/supabase/presence";
import { getMyFriendLinks } from "../lib/supabase/friend-links";

const STATUS_PRIORITY: Record<string, number> = {
  online: 0,
  away: 1,
  busy: 2,
  offline: 3,
};

function bestStatus(statuses: string[]): AggregatedPresence["bestStatus"] {
  let best: AggregatedPresence["bestStatus"] = "offline";
  let bestPriority = 3;

  for (const status of statuses) {
    const priority = STATUS_PRIORITY[status] ?? 3;
    if (priority < bestPriority) {
      bestPriority = priority;
      best = status as AggregatedPresence["bestStatus"];
    }
  }

  return best;
}

/**
 * Hook that combines OG Launcher presence with imported platform friend data
 * to produce an aggregated presence view per friend.
 */
export function usePlatformPresence(friendIds: string[]) {
  const [ogPresence, setOgPresence] = useState<Record<string, UserPresence>>({});
  const [friendLinks, setFriendLinks] = useState<FriendLink[]>([]);
  const [aggregated, setAggregated] = useState<Record<string, AggregatedPresence>>({});

  // Load OG presence
  useEffect(() => {
    if (friendIds.length === 0) {
      setOgPresence({});
      return;
    }

    let isMounted = true;

    void getVisiblePresence(friendIds).then((presences) => {
      if (!isMounted) return;
      setOgPresence(Object.fromEntries(presences.map((p) => [p.userId, p])));
    });

    const unsubscribe = subscribeToPresenceChanges(friendIds, (presence) => {
      if (!isMounted) return;
      setOgPresence((current) => ({ ...current, [presence.userId]: presence }));
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [friendIds]);

  // Load friend links for platform presence info
  const loadLinks = useCallback(async () => {
    try {
      const links = await getMyFriendLinks();
      setFriendLinks(links);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  // Aggregate presence
  useEffect(() => {
    const result: Record<string, AggregatedPresence> = {};

    for (const friendId of friendIds) {
      const ogP = ogPresence[friendId];
      const statuses: string[] = [];
      const platforms: PlatformPresenceInfo[] = [];

      // OG Launcher presence
      if (ogP) {
        statuses.push(ogP.status);
        platforms.push({
          platform: "og" as PlatformType,
          status: ogP.status as PlatformPresenceInfo["status"],
          currentGame: ogP.currentGameTitle,
        });
      }

      // Platform friend link presence (from last import)
      const matchedLinks = friendLinks.filter((link) => link.matchedUserId === friendId);
      for (const link of matchedLinks) {
        // Platform status from last import stored in friend_links isn't live,
        // but it gives context about which platforms the friend uses
        platforms.push({
          platform: link.platform,
          status: "unknown",
          currentGame: null,
        });
      }

      if (statuses.length === 0) {
        statuses.push("offline");
      }

      result[friendId] = {
        userId: friendId,
        bestStatus: bestStatus(statuses),
        platforms,
        currentGame: ogP?.currentGameTitle ?? null,
      };
    }

    setAggregated(result);
  }, [friendIds, ogPresence, friendLinks]);

  return aggregated;
}
