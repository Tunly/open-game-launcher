import { Gamepad2, Loader2, Camera, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { ActivityFeedItem } from "../../lib/types/friends";
import { getFriendActivityFeed, subscribeToFriendActivity } from "../../lib/supabase/activity";
import { getActivityPlatformLabel } from "../../lib/supabase/presence";

interface ActivityFeedProps {
  friendIds: string[];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ActivityIcon({ type }: { type: string }) {
  switch (type) {
    case "game_start":
    case "game_stop":
      return <Gamepad2 className="h-4 w-4 text-[#087d6d]" />;
    case "achievement_unlocked":
      return <Trophy className="h-4 w-4 text-[#f56c2d]" />;
    case "screenshot_taken":
      return <Camera className="h-4 w-4 text-[#0074e0]" />;
    default:
      return <Gamepad2 className="h-4 w-4 text-[#55504a]" />;
  }
}

function activityDescription(item: ActivityFeedItem): string {
  const platformLabel = getActivityPlatformLabel(item.metadata);

  switch (item.type) {
    case "game_start":
      return appendPlatform(`Started playing ${item.gameTitle ?? "a game"}`, platformLabel);
    case "game_stop":
      return appendPlatform(`Stopped playing ${item.gameTitle ?? "a game"}`, platformLabel);
    case "achievement_unlocked":
      return appendPlatform(
        `Unlocked "${item.achievementName ?? "achievement"}" in ${item.gameTitle ?? "a game"}`,
        platformLabel,
      );
    case "screenshot_taken":
      return appendPlatform(`Took a screenshot in ${item.gameTitle ?? "a game"}`, platformLabel);
    default:
      return "Activity";
  }
}

function appendPlatform(copy: string, platformLabel: string | null) {
  return platformLabel ? `${copy} on ${platformLabel}` : copy;
}

export function ActivityFeed({ friendIds }: ActivityFeedProps) {
  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const feed = await getFriendActivityFeed(30);
      setItems(feed);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (friendIds.length === 0) return;

    const unsubscribe = subscribeToFriendActivity(friendIds, (newItem) => {
      setItems((prev) => [newItem, ...prev.filter((i) => i.id !== newItem.id)].slice(0, 50));
    });

    return unsubscribe;
  }, [friendIds]);

  if (loading) {
    return (
      <div className="grid min-h-40 place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#b7102a]" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-4 text-center text-[11px] font-bold uppercase text-[#655f58]">
        No recent activity from friends.
      </p>
    );
  }

  return (
    <div className="max-h-[500px] space-y-2 overflow-y-auto pr-1">
      {items.map((item) => {
        const platformLabel = getActivityPlatformLabel(item.metadata);
        const showPlatformBadge = item.gameTitle || platformLabel;

        return (
          <div
            key={item.id}
            className="flex items-start gap-3 border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]"
          >
            <div className="mt-0.5 shrink-0">
              <ActivityIcon type={item.type} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="neo-copy text-[11px] font-bold leading-5 text-[#171411]">
                {activityDescription(item)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="neo-copy text-[9px] font-bold uppercase text-[#55504a]">
                  {timeAgo(item.createdAt)}
                </p>
                {showPlatformBadge ? (
                  <span className={platformBadgeClassName(Boolean(platformLabel))}>
                    {platformLabel ?? "Source unknown"}
                  </span>
                ) : null}
              </div>
              {item.screenshotUrl && (
                <div className="mt-2 border-2 border-black">
                  <img
                    alt="Screenshot"
                    className="h-24 w-full object-cover"
                    src={item.screenshotUrl}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function platformBadgeClassName(hasPlatform: boolean) {
  const baseClassName =
    "neo-copy inline-flex border-2 border-black px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] shadow-[1px_1px_0_#171411]";

  return hasPlatform
    ? `${baseClassName} bg-[#8cf5e4] text-[#171411]`
    : `${baseClassName} bg-[#efe6d4] text-[#5b403f]`;
}
