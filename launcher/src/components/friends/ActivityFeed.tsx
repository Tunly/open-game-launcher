import { Gamepad2, Loader2, MessageSquare, ThumbsUp, Trophy } from "lucide-react";
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

function feedDay(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "Recent";

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfDate) / 86_400_000);

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function playerLabel(userId: string): string {
  return `Player ${userId.slice(0, 8)}`;
}

function gameArtClassName(gameTitle: string | null, index: number) {
  const title = gameTitle?.toLowerCase() ?? "";

  if (title.includes("mecha") || title.includes("shift")) return "library-art-mech";
  if (title.includes("phantom") || title.includes("boss")) return "library-art-phantom";
  if (title.includes("neon") || title.includes("drift")) return "library-art-tokyo";

  return ["card-art-drift", "card-art-crash", "card-art-blood"][index % 3];
}

function ActivityIcon({ type }: { type: string }) {
  switch (type) {
    case "game_start":
    case "game_stop":
      return <Gamepad2 className="h-4 w-4 text-[#087d6d]" />;
    case "achievement_unlocked":
      return <Trophy className="h-4 w-4 text-[#c20b2f]" />;
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
    default:
      return "Activity";
  }
}

function appendPlatform(copy: string, platformLabel: string | null) {
  return platformLabel ? `${copy} on ${platformLabel}` : copy;
}

function ActivityFeedArticle({ index, item }: { index: number; item: ActivityFeedItem }) {
  const platformLabel = getActivityPlatformLabel(item.metadata);
  const showPlatformBadge = item.gameTitle || platformLabel;
  const gameTitle = item.gameTitle ?? "Unknown game";
  const player = playerLabel(item.userId);
  const artClassName = gameArtClassName(item.gameTitle, index);

  return (
    <article className="border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex items-start gap-3">
        <div className="neo-title flex h-12 w-12 shrink-0 items-center justify-center border-[3px] border-black bg-[#171411] text-xl leading-none text-[#fff9ed] shadow-[2px_2px_0_#c20b2f]">
          {player.slice(7, 9).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="neo-copy text-[11px] font-black uppercase tracking-[0.08em] text-[#171411]">
              {player}
            </p>
            <span className="neo-copy text-[10px] font-black uppercase text-[#655f58]">
              {timeAgo(item.createdAt)}
            </span>
          </div>
          <p className="mt-1 text-sm font-bold leading-5 text-[#5b403f]">
            {activityDescription(item)}
          </p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-black bg-[#f6edd8] shadow-[2px_2px_0_#171411]">
          <ActivityIcon type={item.type} />
        </span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(180px,260px)_minmax(0,1fr)]">
        <div
          aria-label={`${gameTitle} activity artwork`}
          className={`min-h-28 border-[3px] border-black shadow-[3px_3px_0_#171411] ${artClassName}`}
          role="img"
        />
        <div className="min-w-0 border-[3px] border-black bg-[#f6edd8] p-3">
          <p className="neo-title truncate text-3xl leading-none text-[#171411]">{gameTitle}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {showPlatformBadge ? (
              <span className={platformBadgeClassName(Boolean(platformLabel))}>
                {platformLabel ?? "Source unknown"}
              </span>
            ) : null}
            <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[1px_1px_0_#171411]">
              {item.visibility}
            </span>
          </div>
          <div className="mt-3 h-4 border-2 border-black bg-[#fff9ed]">
            <div
              aria-hidden="true"
              className="h-full bg-[#087d6d]"
              style={{ width: item.type === "achievement_unlocked" ? "72%" : "48%" }}
            />
          </div>
          <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-4 text-[#655f58]">
            {item.type === "achievement_unlocked"
              ? `Achievement progress updated: ${item.achievementName ?? "Unlocked"}`
              : "Session activity posted from launcher presence."}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t-2 border-black pt-3">
        <button
          className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[1px_1px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
          type="button"
        >
          <ThumbsUp className="h-3 w-3" />
          Rate Up
        </button>
        <button
          className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[1px_1px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#f6edd8]"
          type="button"
        >
          <MessageSquare className="h-3 w-3" />
          Comment
        </button>
        <span className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#655f58]">
          Live feed item #{String(index + 1).padStart(2, "0")}
        </span>
      </div>
    </article>
  );
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
    <div className="max-h-[680px] space-y-4 overflow-y-auto pr-1">
      {items.map((item, index) => {
        const day = feedDay(item.createdAt);
        const previousDay = index > 0 ? feedDay(items[index - 1].createdAt) : null;

        return (
          <div className="space-y-3" key={item.id}>
            {day !== previousDay ? (
              <div className="neo-copy border-y-[3px] border-black bg-[#171411] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#fff9ed]">
                {day}
              </div>
            ) : null}
            <ActivityFeedArticle index={index} item={item} />
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
