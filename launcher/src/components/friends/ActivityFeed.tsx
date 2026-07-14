import {
  Gamepad2,
  Heart,
  Loader2,
  MessageSquare,
  PackageCheck,
  Send,
  ShoppingBag,
  ThumbsUp,
  Trash2,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type {
  ActivityComment,
  ActivityFeedItem,
  ActivityInteractionSummary,
} from "../../lib/types/friends";
import { getFriendActivityFeed, subscribeToFriendActivity } from "../../lib/supabase/activity";
import {
  addActivityComment,
  deleteActivityComment,
  getActivityComments,
  getActivityInteractionSummaries,
  setActivityRateUp,
  subscribeToActivityInteractions,
} from "../../lib/supabase/activity-interactions";
import { getActivityPlatformLabel } from "../../lib/supabase/presence";
import { getProfilesForUsers } from "../../lib/supabase/profile";

interface ActivityFeedProps {
  currentUserId?: string | null;
  friendIds: string[];
  previewInteractions?: {
    comments: ActivityComment[];
    summaries: ActivityInteractionSummary[];
  };
  previewItems?: ActivityFeedItem[];
  profiles?: ReadonlyMap<string, ActivityFeedProfile>;
}

export interface ActivityFeedProfile {
  avatarUrl: string | null;
  displayName: string | null;
  username: string;
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

function playerLabel(userId: string, profiles?: ReadonlyMap<string, ActivityFeedProfile>): string {
  const profile = profiles?.get(userId);
  return profile?.displayName ?? profile?.username ?? `Player ${userId.slice(0, 8)}`;
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
    case "wishlist_added":
      return <Heart className="h-4 w-4 text-[#c20b2f]" />;
    case "game_purchased":
      return <ShoppingBag className="h-4 w-4 text-[#087d6d]" />;
    case "status":
      return <MessageSquare className="h-4 w-4 text-[#087d6d]" />;
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
    case "wishlist_added":
      return `Added ${item.gameTitle ?? "a game"} to their wishlist`;
    case "game_purchased":
      return `Now owns ${item.gameTitle ?? "a new game"}`;
    case "status":
      return item.gameTitle ? `Posted a status about ${item.gameTitle}` : "Posted a status";
    default:
      return "Activity";
  }
}

function appendPlatform(copy: string, platformLabel: string | null) {
  return platformLabel ? `${copy} on ${platformLabel}` : copy;
}

function statusText(item: ActivityFeedItem) {
  const text = item.metadata.text;
  return typeof text === "string" && text.trim() ? text.trim() : "Status text unavailable.";
}

function activityDetail(item: ActivityFeedItem) {
  if (item.type === "achievement_unlocked") {
    return `Achievement unlocked: ${item.achievementName ?? "New achievement"}`;
  }
  if (item.type === "wishlist_added") {
    return "Saved for later // friends-only wishlist signal";
  }
  if (item.type === "game_purchased") {
    const price = item.metadata.priceCents;
    const currency = item.metadata.currency;
    let priceLabel = "Store purchase verified";
    if (typeof price === "number" && typeof currency === "string" && /^[A-Z]{3}$/i.test(currency)) {
      try {
        priceLabel = new Intl.NumberFormat("en", {
          style: "currency",
          currency: currency.toUpperCase(),
        }).format(price / 100);
      } catch {
        priceLabel = "Store purchase verified";
      }
    }
    return `${priceLabel} // added to library`;
  }
  return "Session activity posted from launcher presence.";
}

function ActivityFeedArticle({
  comments,
  currentUserId,
  errorMessage,
  index,
  interactionsEnabled,
  item,
  loadingComments,
  mutationPending,
  onAddComment,
  onDeleteComment,
  onLoadComments,
  onToggleReaction,
  profiles,
  summary,
}: {
  comments: ActivityComment[] | undefined;
  currentUserId: string | null;
  errorMessage: string | null;
  index: number;
  interactionsEnabled: boolean;
  item: ActivityFeedItem;
  loadingComments: boolean;
  mutationPending: boolean;
  onAddComment: (body: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onLoadComments: () => Promise<void>;
  onToggleReaction: () => Promise<void>;
  profiles?: ReadonlyMap<string, ActivityFeedProfile>;
  summary: ActivityInteractionSummary;
}) {
  const platformLabel = getActivityPlatformLabel(item.metadata);
  const showPlatformBadge = item.gameTitle || platformLabel;
  const gameTitle = item.gameTitle ?? "Unknown game";
  const player = item.userId === currentUserId ? "You" : playerLabel(item.userId, profiles);
  const profile = profiles?.get(item.userId);
  const artClassName = gameArtClassName(item.gameTitle, index);
  const coverImageUrl =
    typeof item.metadata.coverImageUrl === "string" && item.metadata.coverImageUrl.trim()
      ? item.metadata.coverImageUrl
      : null;
  const isStatus = item.type === "status";

  return (
    <article className="border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex items-start gap-3">
        {profile?.avatarUrl ? (
          <img
            alt={player}
            className="h-12 w-12 shrink-0 border-[3px] border-black object-cover shadow-[2px_2px_0_#c20b2f]"
            src={profile.avatarUrl}
          />
        ) : (
          <div className="neo-title flex h-12 w-12 shrink-0 items-center justify-center border-[3px] border-black bg-[#171411] text-xl leading-none text-[#fff9ed] shadow-[2px_2px_0_#c20b2f]">
            {player.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {profile?.username ? (
              <a
                className="neo-copy text-[11px] font-black tracking-[0.08em] text-[#171411] uppercase underline-offset-2 hover:text-[#b7102a] hover:underline"
                href={`/u/${encodeURIComponent(profile.username)}`}
              >
                {player}
              </a>
            ) : (
              <p className="neo-copy text-[11px] font-black tracking-[0.08em] text-[#171411] uppercase">
                {player}
              </p>
            )}
            <time
              className="neo-copy text-[10px] font-black text-[#655f58] uppercase"
              dateTime={item.createdAt}
            >
              {timeAgo(item.createdAt)}
            </time>
          </div>
          <p className="mt-1 text-sm leading-5 font-bold text-[#5b403f]">
            {activityDescription(item)}
          </p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-black bg-[#f6edd8] shadow-[2px_2px_0_#171411]">
          <ActivityIcon type={item.type} />
        </span>
      </div>

      {isStatus ? (
        <div className="mt-3 border-[3px] border-black bg-[#f6edd8] p-4 shadow-[3px_3px_0_#171411]">
          <p className="text-sm leading-6 font-black text-[#171411]">{statusText(item)}</p>
          <span className="neo-copy mt-3 inline-flex border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black tracking-[0.12em] text-[#171411] uppercase shadow-[1px_1px_0_#171411]">
            {item.visibility}
          </span>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(180px,260px)_minmax(0,1fr)]">
          {coverImageUrl ? (
            <img
              alt={`${gameTitle} activity artwork`}
              className="h-32 w-full border-[3px] border-black object-cover shadow-[3px_3px_0_#171411]"
              src={coverImageUrl}
            />
          ) : (
            <div
              aria-label={`${gameTitle} activity artwork`}
              className={`min-h-28 border-[3px] border-black shadow-[3px_3px_0_#171411] ${artClassName}`}
              role="img"
            />
          )}
          <div className="min-w-0 border-[3px] border-black bg-[#f6edd8] p-3">
            {typeof item.metadata.productSlug === "string" ? (
              <a
                className="neo-title block truncate text-3xl leading-none text-[#171411] underline-offset-4 hover:text-[#b7102a] hover:underline"
                href={`/store?slug=${encodeURIComponent(item.metadata.productSlug)}`}
              >
                {gameTitle}
              </a>
            ) : (
              <p className="neo-title truncate text-3xl leading-none text-[#171411]">{gameTitle}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {showPlatformBadge ? (
                <span className={platformBadgeClassName(Boolean(platformLabel))}>
                  {platformLabel ?? "Source unknown"}
                </span>
              ) : null}
              <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black tracking-[0.12em] text-[#171411] uppercase shadow-[1px_1px_0_#171411]">
                {item.visibility}
              </span>
            </div>
            <p className="neo-copy mt-3 border-t-2 border-black pt-2 text-[10px] leading-4 font-black text-[#655f58] uppercase">
              {activityDetail(item)}
            </p>
          </div>
        </div>
      )}

      <ActivityInteractions
        comments={comments}
        currentUserId={currentUserId}
        enabled={interactionsEnabled}
        errorMessage={errorMessage}
        item={item}
        loadingComments={loadingComments}
        mutationPending={mutationPending}
        profiles={profiles}
        summary={summary}
        onAddComment={onAddComment}
        onDeleteComment={onDeleteComment}
        onLoadComments={onLoadComments}
        onToggleReaction={onToggleReaction}
      />

      <p className="neo-copy mt-3 border-t-2 border-black pt-2 text-[8px] font-black tracking-[0.12em] text-[#655f58] uppercase">
        Live feed item #{String(index + 1).padStart(2, "0")}
      </p>
    </article>
  );
}

function ActivityInteractions({
  comments,
  currentUserId,
  enabled,
  errorMessage,
  item,
  loadingComments,
  mutationPending,
  onAddComment,
  onDeleteComment,
  onLoadComments,
  onToggleReaction,
  profiles,
  summary,
}: {
  comments: ActivityComment[] | undefined;
  currentUserId: string | null;
  enabled: boolean;
  errorMessage: string | null;
  item: ActivityFeedItem;
  loadingComments: boolean;
  mutationPending: boolean;
  onAddComment: (body: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onLoadComments: () => Promise<void>;
  onToggleReaction: () => Promise<void>;
  profiles?: ReadonlyMap<string, ActivityFeedProfile>;
  summary: ActivityInteractionSummary;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [body, setBody] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const panelId = `activity-comments-${item.id}`;
  const counterId = `${panelId}-counter`;

  async function toggleComments() {
    const nextOpen = !commentsOpen;
    setCommentsOpen(nextOpen);
    if (nextOpen && comments === undefined) {
      await onLoadComments().catch(() => undefined);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextBody = body.trim();
    if (!nextBody || !enabled || mutationPending) return;
    setStatusMessage(null);
    try {
      await onAddComment(nextBody);
      setBody("");
      setStatusMessage("Comment posted.");
    } catch {
      // The parent exposes the actionable error in this card.
    }
  }

  return (
    <div className="mt-3 border-t-[3px] border-black pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-busy={mutationPending}
          aria-label={`Rate up ${item.gameTitle ?? "this activity"}`}
          aria-pressed={summary.reactedByCurrentUser}
          className={`neo-copy inline-flex h-9 items-center gap-2 border-2 border-black px-3 text-[9px] font-black tracking-[0.1em] uppercase shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55 ${
            summary.reactedByCurrentUser
              ? "bg-[#b7102a] text-white"
              : "bg-[#f6edd8] text-[#171411] hover:bg-[#8cf5e4]"
          }`}
          disabled={!enabled || mutationPending}
          type="button"
          onClick={() => void onToggleReaction()}
        >
          <ThumbsUp className="h-4 w-4" /> Rate Up {summary.reactionCount}
        </button>
        <button
          aria-controls={panelId}
          aria-expanded={commentsOpen}
          className="neo-copy inline-flex h-9 items-center gap-2 border-2 border-black bg-[#fff9ed] px-3 text-[9px] font-black tracking-[0.1em] text-[#171411] uppercase shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
          type="button"
          onClick={() => void toggleComments()}
        >
          <MessageSquare className="h-4 w-4" /> Comments {summary.commentCount}
        </button>
        {!enabled ? (
          <span className="neo-copy text-[8px] font-black text-[#655f58] uppercase">
            Preview // read only
          </span>
        ) : null}
      </div>

      {commentsOpen ? (
        <div className="mt-3 space-y-2 border-[3px] border-black bg-[#efe6d4] p-3" id={panelId}>
          {loadingComments ? (
            <p className="neo-copy flex items-center gap-2 text-[9px] font-black text-[#655f58] uppercase">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading comments...
            </p>
          ) : comments && comments.length > 0 ? (
            comments.map((comment) => {
              const author =
                comment.authorId === currentUserId
                  ? "You"
                  : playerLabel(comment.authorId, profiles);
              const canDelete =
                enabled && (comment.authorId === currentUserId || item.userId === currentUserId);
              return (
                <article
                  className="border-2 border-black bg-[#fff9ed] p-2 shadow-[1px_1px_0_#171411]"
                  key={comment.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="neo-copy text-[8px] font-black tracking-[0.1em] text-[#b7102a] uppercase">
                        {author} // {timeAgo(comment.createdAt)}
                      </p>
                      <p className="mt-1 text-sm leading-5 font-bold text-[#5b403f]">
                        {comment.body}
                      </p>
                    </div>
                    {canDelete ? (
                      <button
                        aria-label={`Delete comment by ${author}`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-black bg-[#b7102a] text-white shadow-[1px_1px_0_#171411] disabled:opacity-50"
                        disabled={mutationPending}
                        type="button"
                        onClick={() => void onDeleteComment(comment.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <p className="neo-copy border-2 border-dashed border-black bg-[#fff9ed] p-2 text-[9px] font-black text-[#655f58] uppercase">
              No comments yet. Start the thread.
            </p>
          )}

          {enabled ? (
            <form
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
              onSubmit={(event) => void submitComment(event)}
            >
              <div>
                <label className="sr-only" htmlFor={`${panelId}-input`}>
                  Comment on {item.gameTitle ?? "this activity"}
                </label>
                <textarea
                  aria-describedby={counterId}
                  className="neo-copy min-h-16 w-full resize-y border-2 border-black bg-[#fff9ed] p-2 text-[10px] leading-5 font-bold text-[#171411] outline-none placeholder:text-[#655f58] focus:bg-[#8cf5e4]"
                  disabled={mutationPending}
                  id={`${panelId}-input`}
                  maxLength={1000}
                  placeholder="Add a comment..."
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
                <p
                  className="neo-copy mt-1 text-[8px] font-black text-[#655f58] uppercase"
                  id={counterId}
                >
                  {body.length}/1000
                </p>
              </div>
              <button
                className="neo-copy inline-flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#007166] px-3 text-[9px] font-black text-white uppercase shadow-[2px_2px_0_#171411] disabled:opacity-50"
                disabled={!body.trim() || mutationPending}
                type="submit"
              >
                <Send className="h-4 w-4" /> Post
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {statusMessage ? (
        <p className="neo-copy mt-2 text-[9px] font-black text-[#007166] uppercase" role="status">
          {statusMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p
          className="neo-copy mt-2 border-2 border-black bg-[#f3c3c9] p-2 text-[9px] font-black text-[#171411] uppercase"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

type ActivityFilter = "all" | "achievements" | "library" | "sessions" | "status";

const ACTIVITY_FILTERS: Array<{ key: ActivityFilter; label: string }> = [
  { key: "all", label: "All activity" },
  { key: "achievements", label: "Achievements" },
  { key: "library", label: "Wishlist + owned" },
  { key: "sessions", label: "Played" },
  { key: "status", label: "Status" },
];

function matchesFilter(item: ActivityFeedItem, filter: ActivityFilter) {
  if (filter === "all") return true;
  if (filter === "achievements") return item.type === "achievement_unlocked";
  if (filter === "library") {
    return item.type === "wishlist_added" || item.type === "game_purchased";
  }
  if (filter === "sessions") return item.type === "game_start" || item.type === "game_stop";
  return item.type === "status";
}

function summariesByActivity(values: ActivityInteractionSummary[] = []) {
  return new Map(values.map((summary) => [summary.activityId, summary]));
}

function commentsByActivity(values: ActivityComment[] = []) {
  const grouped = new Map<string, ActivityComment[]>();
  for (const comment of values) {
    grouped.set(comment.activityId, [...(grouped.get(comment.activityId) ?? []), comment]);
  }
  return grouped;
}

function emptySummary(activityId: string): ActivityInteractionSummary {
  return {
    activityId,
    commentCount: 0,
    reactedByCurrentUser: false,
    reactionCount: 0,
  };
}

export function ActivityFeed({
  currentUserId = null,
  friendIds,
  previewInteractions,
  previewItems,
  profiles,
}: ActivityFeedProps) {
  const [items, setItems] = useState<ActivityFeedItem[]>(previewItems ?? []);
  const [loading, setLoading] = useState(!previewItems);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paginationError, setPaginationError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [summaries, setSummaries] = useState(() =>
    summariesByActivity(previewInteractions?.summaries),
  );
  const [comments, setComments] = useState(() => commentsByActivity(previewInteractions?.comments));
  const [interactionProfiles, setInteractionProfiles] = useState<
    ReadonlyMap<string, ActivityFeedProfile>
  >(profiles ?? new Map());
  const [loadingCommentIds, setLoadingCommentIds] = useState<Set<string>>(new Set());
  const [pendingInteractionIds, setPendingInteractionIds] = useState<Set<string>>(new Set());
  const [interactionErrors, setInteractionErrors] = useState<Map<string, string>>(new Map());
  const [realtimeMessage, setRealtimeMessage] = useState("");
  const requestIdRef = useRef(0);
  const friendIdsKey = Array.from(new Set(friendIds.filter((id) => id.trim())))
    .sort()
    .join("|");
  const watchedUserIds = useMemo(
    () => (friendIdsKey ? friendIdsKey.split("|") : []),
    [friendIdsKey],
  );
  const activityIdsKey = items.map((item) => item.id).join("|");
  const activityIds = useMemo(
    () => (activityIdsKey ? activityIdsKey.split("|") : []),
    [activityIdsKey],
  );
  const interactionsEnabled = Boolean(currentUserId) && !previewItems;

  const loadFeed = useCallback(async () => {
    if (previewItems) {
      setItems(previewItems);
      setHasMore(false);
      setLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;

    setItems([]);
    setLoadError(null);

    if (watchedUserIds.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const feed = await getFriendActivityFeed(watchedUserIds, 30);
      if (requestId !== requestIdRef.current) return;
      setItems(feed);
      setHasMore(feed.length === 30);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setLoadError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Unknown friend activity error.",
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [previewItems, watchedUserIds]);

  const loadMore = useCallback(async () => {
    const lastItem = items.at(-1);
    if (!lastItem || loadingMore || !hasMore) return;
    setLoadingMore(true);
    setPaginationError(null);
    try {
      const older = await getFriendActivityFeed(watchedUserIds, 30, {
        createdAt: lastItem.createdAt,
        id: lastItem.id,
      });
      setItems((current) => [
        ...current,
        ...older.filter((candidate) => !current.some((item) => item.id === candidate.id)),
      ]);
      setHasMore(older.length === 30);
    } catch (error) {
      setPaginationError(
        error instanceof Error ? error.message : "Older activity could not be loaded.",
      );
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, items, loadingMore, watchedUserIds]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (previewItems || watchedUserIds.length === 0) return;

    const unsubscribe = subscribeToFriendActivity(watchedUserIds, (newItem) => {
      setItems((prev) => [newItem, ...prev.filter((i) => i.id !== newItem.id)].slice(0, 50));
    });

    return unsubscribe;
  }, [previewItems, watchedUserIds]);

  useEffect(() => {
    if (!profiles) return;
    setInteractionProfiles((current) => new Map([...current, ...profiles]));
  }, [profiles]);

  const refreshInteractionSummaries = useCallback(async (ids: string[]) => {
    const refreshed = await getActivityInteractionSummaries(ids);
    setSummaries((current) => new Map([...current, ...refreshed]));
  }, []);

  useEffect(() => {
    if (previewInteractions) {
      setSummaries(summariesByActivity(previewInteractions.summaries));
      setComments(commentsByActivity(previewInteractions.comments));
      return;
    }
    if (!interactionsEnabled || activityIds.length === 0) return;

    let active = true;
    void getActivityInteractionSummaries(activityIds)
      .then((next) => {
        if (active) setSummaries(next);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message =
          error instanceof Error ? error.message : "Interactions could not be loaded.";
        setInteractionErrors(new Map(activityIds.map((id) => [id, message])));
      });
    return () => {
      active = false;
    };
  }, [activityIds, interactionsEnabled, previewInteractions]);

  useEffect(() => {
    if (!interactionsEnabled || activityIds.length === 0) return;
    return subscribeToActivityInteractions(activityIds, {
      onCommentDeleted: (comment) => {
        setComments((current) => {
          if (!current.has(comment.activityId)) return current;
          const next = new Map(current);
          next.set(
            comment.activityId,
            (current.get(comment.activityId) ?? []).filter((item) => item.id !== comment.id),
          );
          return next;
        });
        void refreshInteractionSummaries([comment.activityId]);
        setRealtimeMessage("A friend activity comment was removed.");
      },
      onCommentUpsert: (comment) => {
        setComments((current) => {
          if (!current.has(comment.activityId)) return current;
          const existing = current.get(comment.activityId) ?? [];
          const next = new Map(current);
          next.set(
            comment.activityId,
            [...existing.filter((item) => item.id !== comment.id), comment].sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt),
            ),
          );
          return next;
        });
        void getProfilesForUsers([comment.authorId]).then((loadedProfiles) => {
          setInteractionProfiles((current) => new Map([...current, ...loadedProfiles]));
        });
        void refreshInteractionSummaries([comment.activityId]);
        setRealtimeMessage("New friend activity comment received.");
      },
      onReactionChanged: ({ activityId }) => {
        void refreshInteractionSummaries([activityId]);
        setRealtimeMessage("Friend activity ratings updated.");
      },
    });
  }, [activityIds, interactionsEnabled, refreshInteractionSummaries]);

  function setInteractionPending(activityId: string, pending: boolean) {
    setPendingInteractionIds((current) => {
      const next = new Set(current);
      if (pending) next.add(activityId);
      else next.delete(activityId);
      return next;
    });
  }

  function setInteractionError(activityId: string, message: string | null) {
    setInteractionErrors((current) => {
      const next = new Map(current);
      if (message) next.set(activityId, message);
      else next.delete(activityId);
      return next;
    });
  }

  async function loadComments(activityId: string) {
    if (comments.has(activityId) || loadingCommentIds.has(activityId)) return;
    setLoadingCommentIds((current) => new Set(current).add(activityId));
    setInteractionError(activityId, null);
    try {
      const loaded = await getActivityComments(activityId);
      setComments((current) => new Map(current).set(activityId, loaded));
      const authorIds = Array.from(new Set(loaded.map((comment) => comment.authorId)));
      if (authorIds.length > 0) {
        const loadedProfiles = await getProfilesForUsers(authorIds);
        setInteractionProfiles((current) => new Map([...current, ...loadedProfiles]));
      }
    } catch (error) {
      setInteractionError(
        activityId,
        error instanceof Error ? error.message : "Comments could not be loaded.",
      );
      throw error;
    } finally {
      setLoadingCommentIds((current) => {
        const next = new Set(current);
        next.delete(activityId);
        return next;
      });
    }
  }

  async function toggleReaction(activityId: string) {
    const current = summaries.get(activityId) ?? emptySummary(activityId);
    setInteractionPending(activityId, true);
    setInteractionError(activityId, null);
    try {
      const result = await setActivityRateUp(activityId, !current.reactedByCurrentUser);
      setSummaries((values) =>
        new Map(values).set(activityId, {
          ...current,
          reactedByCurrentUser: result.reactedByCurrentUser,
          reactionCount: result.reactionCount,
        }),
      );
    } catch (error) {
      setInteractionError(
        activityId,
        error instanceof Error ? error.message : "Rate Up could not be saved.",
      );
    } finally {
      setInteractionPending(activityId, false);
    }
  }

  async function addComment(activityId: string, body: string) {
    setInteractionPending(activityId, true);
    setInteractionError(activityId, null);
    try {
      const comment = await addActivityComment(activityId, body);
      setComments((current) => {
        const next = new Map(current);
        const existing = current.get(activityId) ?? [];
        next.set(activityId, [...existing.filter((item) => item.id !== comment.id), comment]);
        return next;
      });
      setSummaries((current) => {
        const previous = current.get(activityId) ?? emptySummary(activityId);
        return new Map(current).set(activityId, {
          ...previous,
          commentCount: previous.commentCount + 1,
        });
      });
    } catch (error) {
      setInteractionError(
        activityId,
        error instanceof Error ? error.message : "Comment could not be posted.",
      );
      throw error;
    } finally {
      setInteractionPending(activityId, false);
    }
  }

  async function removeComment(activityId: string, commentId: string) {
    setInteractionPending(activityId, true);
    setInteractionError(activityId, null);
    try {
      await deleteActivityComment(commentId);
      setComments((current) => {
        const next = new Map(current);
        next.set(
          activityId,
          (current.get(activityId) ?? []).filter((comment) => comment.id !== commentId),
        );
        return next;
      });
      setSummaries((current) => {
        const previous = current.get(activityId) ?? emptySummary(activityId);
        return new Map(current).set(activityId, {
          ...previous,
          commentCount: Math.max(0, previous.commentCount - 1),
        });
      });
    } catch (error) {
      setInteractionError(
        activityId,
        error instanceof Error ? error.message : "Comment could not be removed.",
      );
    } finally {
      setInteractionPending(activityId, false);
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-40 place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#b7102a]" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="border-[3px] border-black bg-[#f3c3c9] p-4 shadow-[4px_4px_0_#171411]"
        role="alert"
      >
        <p className="neo-title text-2xl leading-none text-[#171411]">
          Friend activity could not be loaded.
        </p>
        <p className="neo-copy mt-2 text-[11px] leading-5 font-bold text-[#5b403f]">{loadError}</p>
        <button
          className="neo-copy mt-3 border-2 border-black bg-[#b7102a] px-3 py-2 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 disabled:opacity-60"
          type="button"
          onClick={() => void loadFeed()}
        >
          Retry activity feed
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-4 text-center text-[11px] font-bold text-[#655f58] uppercase">
        No recent activity from friends.
      </p>
    );
  }

  const filteredItems = items.filter((item) => matchesFilter(item, filter));

  return (
    <div className="space-y-4">
      <div aria-label="Activity filters" className="flex flex-wrap gap-2" role="group">
        {ACTIVITY_FILTERS.map((option) => (
          <button
            aria-pressed={filter === option.key}
            className={`neo-copy border-2 border-black px-3 py-2 text-[9px] font-black tracking-[0.1em] uppercase shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 ${
              filter === option.key
                ? "bg-[#b7102a] text-white"
                : "bg-[#fff9ed] text-[#171411] hover:bg-[#8cf5e4]"
            }`}
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-4 text-center text-[10px] font-black text-[#655f58] uppercase">
          No activity matches this filter.
        </p>
      ) : null}

      {filteredItems.map((item, index) => {
        const day = feedDay(item.createdAt);
        const previousDay = index > 0 ? feedDay(filteredItems[index - 1].createdAt) : null;

        return (
          <div className="space-y-3" key={item.id}>
            {day !== previousDay ? (
              <div className="neo-copy border-y-[3px] border-black bg-[#171411] px-3 py-2 text-[10px] font-black tracking-[0.14em] text-[#fff9ed] uppercase">
                {day}
              </div>
            ) : null}
            <ActivityFeedArticle
              comments={comments.get(item.id)}
              currentUserId={currentUserId}
              errorMessage={interactionErrors.get(item.id) ?? null}
              index={index}
              interactionsEnabled={interactionsEnabled}
              item={item}
              loadingComments={loadingCommentIds.has(item.id)}
              mutationPending={pendingInteractionIds.has(item.id)}
              profiles={interactionProfiles}
              summary={summaries.get(item.id) ?? emptySummary(item.id)}
              onAddComment={(body) => addComment(item.id, body)}
              onDeleteComment={(commentId) => removeComment(item.id, commentId)}
              onLoadComments={() => loadComments(item.id)}
              onToggleReaction={() => toggleReaction(item.id)}
            />
          </div>
        );
      })}

      {hasMore && !paginationError ? (
        <button
          className="neo-copy flex h-11 w-full items-center justify-center gap-2 border-[3px] border-black bg-[#007166] px-4 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 disabled:opacity-60"
          disabled={loadingMore}
          type="button"
          onClick={() => void loadMore()}
        >
          {loadingMore ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PackageCheck className="h-4 w-4" />
          )}
          {loadingMore ? "Loading older activity..." : "Load older activity"}
        </button>
      ) : null}
      {paginationError ? (
        <div className="border-2 border-black bg-[#f3c3c9] p-3" role="alert">
          <p className="neo-copy text-[9px] font-black text-[#171411] uppercase">
            Older activity could not be loaded: {paginationError}
          </p>
          <button
            className="neo-copy mt-2 border-2 border-black bg-[#b7102a] px-3 py-1.5 text-[8px] font-black text-white uppercase shadow-[2px_2px_0_#171411]"
            type="button"
            onClick={() => void loadMore()}
          >
            Retry older activity
          </button>
        </div>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {realtimeMessage}
      </p>
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
