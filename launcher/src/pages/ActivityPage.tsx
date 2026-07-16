import { Loader2, Search, Shield, Trophy, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ActivityFeed, type ActivityFeedProfile } from "../components/friends/ActivityFeed";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { postActivity } from "../lib/supabase/activity";
import { getVisiblePresence, subscribeToPresenceChanges } from "../lib/supabase/presence";
import { getFriends, getProfilesForUsers } from "../lib/supabase/profile";
import type {
  ActivityComment,
  ActivityFeedItem,
  ActivityInteractionSummary,
} from "../lib/types/friends";
import type { UserPresence } from "../lib/types/profile";

type ActivityFriend = ActivityFeedProfile & {
  currentGame: string | null;
  id: string;
  status: UserPresence["status"];
};

const PREVIEW_CURRENT_USER_ID = "preview-self";

const PREVIEW_PROFILES = new Map<string, ActivityFeedProfile>([
  [
    PREVIEW_CURRENT_USER_ID,
    { avatarUrl: null, displayName: "OG Operator", username: "ogoperator" },
  ],
  ["preview-packet", { avatarUrl: null, displayName: "Packet Ghost", username: "packetghost" }],
  ["preview-teal", { avatarUrl: null, displayName: "Teal Shift", username: "tealshift" }],
  ["preview-arcade", { avatarUrl: null, displayName: "Arcade Witch", username: "arcadewitch" }],
]);

const PREVIEW_FRIENDS: ActivityFriend[] = [
  {
    avatarUrl: null,
    currentGame: "Neon Drift",
    displayName: "Packet Ghost",
    id: "preview-packet",
    status: "online",
    username: "packetghost",
  },
  {
    avatarUrl: null,
    currentGame: "Mecha Signal",
    displayName: "Teal Shift",
    id: "preview-teal",
    status: "away",
    username: "tealshift",
  },
  {
    avatarUrl: null,
    currentGame: null,
    displayName: "Arcade Witch",
    id: "preview-arcade",
    status: "offline",
    username: "arcadewitch",
  },
];

function previewActivity(isMyActivity: boolean): ActivityFeedItem[] {
  const now = Date.now();
  if (isMyActivity) {
    return [
      {
        achievementName: null,
        createdAt: new Date(now - 12 * 60_000).toISOString(),
        gameId: null,
        gameTitle: "Neon Drift",
        id: "preview-self-status",
        metadata: { text: "Loadout locked. Night run starts at 21:00." },
        type: "status",
        userId: PREVIEW_CURRENT_USER_ID,
        visibility: "friends_only",
      },
      {
        achievementName: "Perfect Line",
        createdAt: new Date(now - 74 * 60_000).toISOString(),
        gameId: null,
        gameTitle: "Neon Drift",
        id: "preview-self-achievement",
        metadata: { platform: "steam" },
        type: "achievement_unlocked",
        userId: PREVIEW_CURRENT_USER_ID,
        visibility: "friends_only",
      },
    ];
  }

  return [
    {
      achievementName: null,
      createdAt: new Date(now - 8 * 60_000).toISOString(),
      gameId: null,
      gameTitle: "Neon Drift",
      id: "preview-wishlist",
      metadata: { platform: "steam", productSlug: "neon-drift" },
      type: "wishlist_added",
      userId: "preview-packet",
      visibility: "friends_only",
    },
    {
      achievementName: "Hard Reset",
      createdAt: new Date(now - 56 * 60_000).toISOString(),
      gameId: null,
      gameTitle: "Mecha Signal",
      id: "preview-achievement",
      metadata: { platform: "gog" },
      type: "achievement_unlocked",
      userId: "preview-teal",
      visibility: "friends_only",
    },
    {
      achievementName: null,
      createdAt: new Date(now - 3 * 60 * 60_000).toISOString(),
      gameId: null,
      gameTitle: "Phantom Arcade",
      id: "preview-purchase",
      metadata: { currency: "EUR", priceCents: 2499, productSlug: "phantom-arcade" },
      type: "game_purchased",
      userId: "preview-arcade",
      visibility: "friends_only",
    },
    {
      achievementName: null,
      createdAt: new Date(now - 26 * 60 * 60_000).toISOString(),
      gameId: null,
      gameTitle: "Neon Drift",
      id: "preview-playing",
      metadata: { platform: "steam" },
      type: "game_start",
      userId: "preview-packet",
      visibility: "friends_only",
    },
  ];
}

function previewInteractions(isMyActivity: boolean): {
  comments: ActivityComment[];
  summaries: ActivityInteractionSummary[];
} {
  const now = Date.now();
  if (isMyActivity) {
    return {
      comments: [],
      summaries: [
        {
          activityId: "preview-self-status",
          commentCount: 0,
          reactedByCurrentUser: false,
          reactionCount: 5,
        },
        {
          activityId: "preview-self-achievement",
          commentCount: 0,
          reactedByCurrentUser: false,
          reactionCount: 9,
        },
      ],
    };
  }

  return {
    comments: [
      {
        activityId: "preview-wishlist",
        authorId: "preview-teal",
        body: "That one is perfect for the next co-op night.",
        createdAt: new Date(now - 4 * 60_000).toISOString(),
        id: "preview-comment-1",
      },
    ],
    summaries: [
      {
        activityId: "preview-wishlist",
        commentCount: 1,
        reactedByCurrentUser: false,
        reactionCount: 18,
      },
      {
        activityId: "preview-achievement",
        commentCount: 0,
        reactedByCurrentUser: false,
        reactionCount: 11,
      },
      {
        activityId: "preview-purchase",
        commentCount: 0,
        reactedByCurrentUser: false,
        reactionCount: 7,
      },
      {
        activityId: "preview-playing",
        commentCount: 0,
        reactedByCurrentUser: false,
        reactionCount: 4,
      },
    ],
  };
}

function friendId(friend: { addresseeId: string; requesterId: string }, userId: string) {
  return friend.requesterId === userId ? friend.addresseeId : friend.requesterId;
}

export function ActivityPage() {
  const { isConfigured, isLoading: authLoading, user } = useCurrentUser();
  const [searchParams] = useSearchParams();
  const [friends, setFriends] = useState<ActivityFriend[]>([]);
  const [profiles, setProfiles] = useState<ReadonlyMap<string, ActivityFeedProfile>>(new Map());
  const [friendDataUserId, setFriendDataUserId] = useState<string | null>(null);
  const [friendDataLoading, setFriendDataLoading] = useState(false);
  const [friendDataWarning, setFriendDataWarning] = useState<string | null>(null);
  const [friendDataVersion, setFriendDataVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [statusText, setStatusText] = useState("");
  const [statusGameTitle, setStatusGameTitle] = useState("");
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);
  const requestedFriendDataUserIdRef = useRef<string | null>(null);
  const isPreview =
    !isConfigured || (import.meta.env.DEV && searchParams.get("verify") === "activity-preview");
  const isMyActivity = searchParams.get("view") === "mine";
  const presenceFriendIdsKey = friends.map((friend) => friend.id).join("|");

  useEffect(() => {
    if (!isConfigured || !user) {
      requestedFriendDataUserIdRef.current = null;
      setFriends([]);
      setProfiles(new Map());
      setFriendDataUserId(null);
      setFriendDataLoading(false);
      setFriendDataWarning(null);
      return;
    }

    let active = true;
    const isNewUser = requestedFriendDataUserIdRef.current !== user.id;
    requestedFriendDataUserIdRef.current = user.id;
    setFriendDataUserId(user.id);
    if (isNewUser) {
      setFriends([]);
      setProfiles(new Map());
    }
    setFriendDataLoading(true);
    setFriendDataWarning(null);

    void (async () => {
      try {
        const friendships = await getFriends(user.id);
        const ids = friendships.map((friendship) => friendId(friendship, user.id));
        if (!active) return;

        setFriends(
          ids.map((id) => ({
            avatarUrl: null,
            currentGame: null,
            displayName: null,
            id,
            status: "offline",
            username: `player-${id.slice(0, 8)}`,
          })),
        );

        const [profileResult, presenceResult] = await Promise.allSettled([
          getProfilesForUsers(ids),
          getVisiblePresence(ids),
        ]);
        if (!active) return;
        const profileMap = profileResult.status === "fulfilled" ? profileResult.value : new Map();
        const presences = presenceResult.status === "fulfilled" ? presenceResult.value : [];
        const presenceMap = new Map(presences.map((presence) => [presence.userId, presence]));
        setProfiles(profileMap);
        setFriends(
          ids.map((id) => {
            const profile = profileMap.get(id);
            const presence = presenceMap.get(id);
            return {
              avatarUrl: profile?.avatarUrl ?? null,
              currentGame: presence?.currentGameTitle ?? null,
              displayName: profile?.displayName ?? null,
              id,
              status: presence?.status ?? "offline",
              username: profile?.username ?? `player-${id.slice(0, 8)}`,
            };
          }),
        );

        const unavailableSignals = [
          profileResult.status === "rejected" ? "profiles" : null,
          presenceResult.status === "rejected" ? "presence" : null,
        ].filter((value): value is string => Boolean(value));
        if (unavailableSignals.length > 0) {
          setFriendDataWarning(
            `Friend ${unavailableSignals.join(" and ")} unavailable. Activity is still available; names or online status may be incomplete.`,
          );
        }
      } catch (error) {
        if (!active) return;
        setFriends([]);
        setProfiles(new Map());
        const detail = error instanceof Error && error.message.trim() ? ` ${error.message}` : "";
        setFriendDataWarning(
          `Friend roster unavailable. Activity is still available, but friend coverage may be incomplete.${detail}`,
        );
      } finally {
        if (active) setFriendDataLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [friendDataVersion, isConfigured, user]);

  useEffect(() => {
    const ids = presenceFriendIdsKey ? presenceFriendIdsKey.split("|") : [];
    if (!isConfigured || ids.length === 0) return;
    return subscribeToPresenceChanges(ids, (presence) => {
      setFriends((current) =>
        current.map((friend) =>
          friend.id === presence.userId
            ? {
                ...friend,
                currentGame: presence.currentGameTitle,
                status: presence.status,
              }
            : friend,
        ),
      );
    });
  }, [isConfigured, presenceFriendIdsKey]);

  const friendDataBelongsToCurrentUser = friendDataUserId === (user?.id ?? null);
  const visibleFriends = useMemo(
    () => (isPreview ? PREVIEW_FRIENDS : friendDataBelongsToCurrentUser ? friends : []),
    [friendDataBelongsToCurrentUser, friends, isPreview],
  );
  const visibleProfiles = useMemo(
    () =>
      isPreview
        ? PREVIEW_PROFILES
        : friendDataBelongsToCurrentUser
          ? profiles
          : new Map<string, ActivityFeedProfile>(),
    [friendDataBelongsToCurrentUser, isPreview, profiles],
  );
  const onlineCount = visibleFriends.filter((friend) =>
    ["online", "away", "busy"].includes(friend.status),
  ).length;
  const filteredFriends = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return visibleFriends;
    return visibleFriends.filter((friend) =>
      `${friend.displayName ?? ""} ${friend.username} ${friend.currentGame ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [query, visibleFriends]);
  const feedUserIds = useMemo(() => {
    if (isPreview) {
      return isMyActivity ? [PREVIEW_CURRENT_USER_ID] : visibleFriends.map((friend) => friend.id);
    }
    if (!user) return [];
    if (isMyActivity) return [user.id];
    return [user.id, ...visibleFriends.map((friend) => friend.id)];
  }, [isMyActivity, isPreview, user, visibleFriends]);
  const visiblePreviewItems = useMemo(
    () => (isPreview ? previewActivity(isMyActivity) : undefined),
    [isMyActivity, isPreview],
  );
  const visiblePreviewInteractions = useMemo(
    () => (isPreview ? previewInteractions(isMyActivity) : undefined),
    [isMyActivity, isPreview],
  );

  async function submitStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = statusText.trim();
    if (!text || posting || !user) return;
    setPosting(true);
    setNotice(null);
    try {
      await postActivity("status", {
        gameTitle: statusGameTitle.trim() || null,
        metadata: { text },
        visibility: "friends_only",
      });
      setStatusText("");
      setStatusGameTitle("");
      setNotice("Status posted to your friends.");
      setFeedVersion((value) => value + 1);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Status could not be posted.");
    } finally {
      setPosting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="grid min-h-[420px] place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#b7102a]" />
      </div>
    );
  }

  return (
    <section aria-label="Friend activity page" className="space-y-5">
      <header className="grid overflow-hidden border-[5px] border-black bg-[#171411] text-[#fff9ed] shadow-[7px_7px_0_#171411] lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="neo-dots-ink p-5 sm:p-6">
          <h1 className="neo-title text-4xl leading-none sm:text-6xl">
            {isMyActivity ? "My Activity" : "Friend Activity"}
          </h1>
        </div>
        <div className="grid grid-cols-2 border-t-[5px] border-black bg-[#f5eedf] text-[#171411] lg:w-72 lg:border-t-0 lg:border-l-[5px]">
          <ActivityStat label="Friends" value={visibleFriends.length} />
          <ActivityStat label="Online" value={onlineCount} accent />
          <div className="col-span-2 grid grid-cols-2 border-t-[3px] border-black">
            <Link
              className="neo-copy flex items-center justify-center border-r-[3px] border-black bg-[#007166] px-2 py-3 text-center text-[9px] font-black tracking-[0.08em] text-white uppercase hover:bg-[#b7102a]"
              to={isMyActivity ? "/activity" : "/activity?view=mine"}
            >
              {isMyActivity ? "Friend Activity" : "My Activity"}
            </Link>
            <Link
              className="neo-copy flex items-center justify-center gap-1 bg-[#b7102a] px-2 py-3 text-center text-[9px] font-black tracking-[0.08em] text-white uppercase hover:bg-[#007166]"
              to="/activity/recap"
            >
              <Trophy className="h-3.5 w-3.5" /> Year Recap
            </Link>
          </div>
        </div>
      </header>

      {isPreview ? (
        <p className="neo-copy border-[3px] border-black bg-[#8cf5e4] p-3 text-[10px] leading-5 font-black text-[#171411] uppercase shadow-[3px_3px_0_#171411]">
          {isMyActivity
            ? "Local preview // Showing sample activity for your own player profile."
            : "Local preview // Connect Supabase to replace these examples with your real friend feed."}
        </p>
      ) : null}

      {isConfigured && !user && !isPreview ? (
        <section className="border-[5px] border-black bg-[#fff9ed] p-6 shadow-[6px_6px_0_#171411]">
          <h2 className="neo-title text-4xl leading-none text-[#171411]">
            Sign in for friend activity
          </h2>
          <p className="neo-copy mt-3 text-[11px] leading-5 font-bold text-[#5b403f] uppercase">
            Your activity feed follows friendship and privacy rules. Sign in to load it.
          </p>
          <Link
            className="neo-copy mt-4 inline-flex border-[3px] border-black bg-[#b7102a] px-5 py-3 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[3px_3px_0_#171411]"
            to="/auth"
          >
            Sign in
          </Link>
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
          <div className="min-w-0 space-y-4">
            <section className="border-[5px] border-black bg-[#efe6d4] shadow-[6px_6px_0_#171411]">
              <div className="border-b-[5px] border-black bg-[#171411] px-4 py-3 text-[#fff9ed]">
                <h2 className="neo-title text-4xl leading-none">Activity Transmission</h2>
              </div>
              {isPreview ? (
                <p className="neo-copy m-3 border-[3px] border-black bg-[#fff9ed] p-3 text-[10px] font-black text-[#5b403f] uppercase shadow-[3px_3px_0_#171411]">
                  Status posting is disabled in local preview mode.
                </p>
              ) : (
                <form
                  className="grid gap-3 p-3 sm:grid-cols-[52px_minmax(0,1fr)]"
                  onSubmit={(event) => void submitStatus(event)}
                >
                  <Avatar name="OG" />
                  <div>
                    <label className="sr-only" htmlFor="activity-status">
                      Post a status to your friends
                    </label>
                    <textarea
                      className="neo-copy min-h-20 w-full resize-y border-[3px] border-black bg-[#fff9ed] p-3 text-[11px] font-black text-[#171411] uppercase shadow-[3px_3px_0_#171411] outline-none placeholder:text-[#655f58] focus:bg-[#8cf5e4]"
                      id="activity-status"
                      maxLength={1000}
                      placeholder="Post a status to your friends..."
                      value={statusText}
                      onChange={(event) => setStatusText(event.target.value)}
                    />
                    <label
                      className="neo-copy mt-3 block text-[9px] font-black tracking-[0.1em] text-[#171411] uppercase"
                      htmlFor="activity-game-title"
                    >
                      Tag with game <span className="text-[#655f58]">// optional</span>
                    </label>
                    <input
                      className="neo-copy mt-1 h-10 w-full border-[3px] border-black bg-[#fff9ed] px-3 text-[10px] font-black text-[#171411] uppercase shadow-[3px_3px_0_#171411] outline-none placeholder:text-[#655f58] focus:bg-[#8cf5e4]"
                      id="activity-game-title"
                      maxLength={200}
                      placeholder="Game title"
                      value={statusGameTitle}
                      onChange={(event) => setStatusGameTitle(event.target.value)}
                    />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="neo-copy text-[9px] font-black text-[#655f58] uppercase">
                        {statusText.length}/1000 // friends only
                      </span>
                      <button
                        className="neo-copy border-[3px] border-black bg-[#b7102a] px-5 py-2 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[3px_3px_0_#171411] disabled:opacity-50"
                        disabled={!statusText.trim() || posting}
                        type="submit"
                      >
                        {posting ? "Posting..." : "Post status"}
                      </button>
                    </div>
                    {notice ? (
                      <p className="neo-copy mt-2 text-[10px] font-black text-[#007166] uppercase">
                        {notice}
                      </p>
                    ) : null}
                  </div>
                </form>
              )}
            </section>

            <section className="border-[5px] border-black bg-[#f5eedf] p-3 shadow-[6px_6px_0_#171411]">
              {!isPreview && friendDataWarning ? (
                <div
                  className="mb-4 border-[3px] border-black bg-[#f3c3c9] p-3 shadow-[3px_3px_0_#171411]"
                  role="alert"
                >
                  <p className="neo-title text-2xl leading-none text-[#171411]">
                    Friend signal partially unavailable
                  </p>
                  <p className="neo-copy mt-2 text-[10px] leading-5 font-black text-[#5b403f] uppercase">
                    {friendDataWarning}
                  </p>
                  <button
                    className="neo-copy mt-3 inline-flex items-center gap-2 border-2 border-black bg-[#b7102a] px-3 py-2 text-[9px] font-black tracking-[0.1em] text-white uppercase shadow-[2px_2px_0_#171411] disabled:opacity-60"
                    disabled={friendDataLoading}
                    type="button"
                    onClick={() => setFriendDataVersion((value) => value + 1)}
                  >
                    {friendDataLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {friendDataLoading ? "Retrying friend data..." : "Retry friend data"}
                  </button>
                </div>
              ) : null}
              {!isPreview && friendDataLoading ? (
                <p
                  className="neo-copy mb-3 flex items-center gap-2 border-2 border-black bg-[#8cf5e4] p-2 text-[9px] font-black text-[#171411] uppercase"
                  role="status"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing friend signals... Feed
                  remains available.
                </p>
              ) : null}
              <ActivityFeed
                currentUserId={isPreview ? PREVIEW_CURRENT_USER_ID : (user?.id ?? null)}
                friendIds={feedUserIds}
                key={feedVersion}
                previewInteractions={visiblePreviewInteractions}
                previewItems={visiblePreviewItems}
                profiles={visibleProfiles}
                scope={isMyActivity ? "mine" : "friends"}
              />
            </section>
          </div>

          <aside className="space-y-4">
            <RailPanel icon={<Users className="h-4 w-4" />} title="Friend List">
              <label className="relative block">
                <span className="sr-only">Search friends</span>
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#5b403f]" />
                <input
                  className="neo-copy h-11 w-full border-[3px] border-black bg-[#f6edd8] pr-3 pl-9 text-[10px] font-black text-[#171411] uppercase outline-none focus:bg-[#8cf5e4]"
                  placeholder="Search friends or games"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="mt-3 space-y-2">
                {filteredFriends.slice(0, 8).map((friend) => (
                  <FriendRow friend={friend} key={friend.id} />
                ))}
                {filteredFriends.length === 0 ? (
                  <p className="neo-copy border-2 border-dashed border-black p-3 text-[9px] font-black text-[#655f58] uppercase">
                    No matching friends.
                  </p>
                ) : null}
              </div>
              <Link
                className="neo-copy mt-3 flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#007166] text-[9px] font-black text-white uppercase shadow-[2px_2px_0_#171411]"
                to="/friends"
              >
                <UserPlus className="h-4 w-4" /> Manage friends
              </Link>
            </RailPanel>

            <Link
              className="neo-copy flex items-center gap-3 border-4 border-black bg-[#fff9ed] p-3 text-[10px] font-black text-[#171411] uppercase shadow-[4px_4px_0_#171411] hover:bg-[#8cf5e4]"
              to="/settings/privacy"
            >
              <Shield className="h-5 w-5 text-[#b7102a]" /> Activity privacy settings
            </Link>
          </aside>
        </div>
      )}
    </section>
  );
}

function ActivityStat({
  accent = false,
  label,
  value,
}: {
  accent?: boolean;
  label: string;
  value: number;
}) {
  return (
    <div
      className={`p-4 text-center first:border-r-[3px] first:border-black ${accent ? "bg-[#8cf5e4]" : ""}`}
    >
      <p className="neo-title text-4xl leading-none">{value}</p>
      <p className="neo-copy mt-1 text-[8px] font-black uppercase">{label}</p>
    </div>
  );
}

function Avatar({ avatarUrl, name }: { avatarUrl?: string | null; name: string }) {
  if (avatarUrl)
    return (
      <img
        alt={name}
        className="h-12 w-12 border-[3px] border-black object-cover shadow-[2px_2px_0_#b7102a]"
        src={avatarUrl}
      />
    );
  return (
    <span className="neo-title flex h-12 w-12 items-center justify-center border-[3px] border-black bg-[#171411] text-lg text-[#fff9ed] shadow-[2px_2px_0_#b7102a]">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function FriendRow({ friend }: { friend: ActivityFriend }) {
  const name = friend.displayName ?? friend.username;
  const statusClass =
    friend.status === "online"
      ? "bg-[#007166] text-white"
      : friend.status === "away"
        ? "bg-[#8cf5e4] text-[#171411]"
        : friend.status === "busy"
          ? "bg-[#b7102a] text-white"
          : "bg-[#efe6d4] text-[#655f58]";
  return (
    <Link
      aria-label={`Open ${name}'s profile`}
      className="grid grid-cols-[48px_minmax(0,1fr)] gap-2 border-2 border-black bg-[#f6edd8] p-2 shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
      to={`/u/${encodeURIComponent(friend.username)}`}
    >
      <Avatar avatarUrl={friend.avatarUrl} name={name} />
      <div className="min-w-0">
        <p className="neo-copy truncate text-[10px] font-black text-[#171411] uppercase">{name}</p>
        <p className="neo-copy truncate text-[8px] font-bold text-[#5b403f] uppercase">
          {friend.currentGame ? `Playing ${friend.currentGame}` : `@${friend.username}`}
        </p>
        <span
          className={`neo-copy mt-1 inline-flex border border-black px-1.5 py-0.5 text-[7px] font-black uppercase ${statusClass}`}
        >
          {friend.status}
        </span>
      </div>
    </Link>
  );
}

function RailPanel({
  children,
  icon,
  title,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <section className="border-4 border-black bg-[#fff9ed] p-3 text-[#171411] shadow-[5px_5px_0_#171411]">
      <h2 className="neo-title flex items-center gap-2 border-b-[3px] border-black pb-2 text-3xl leading-none">
        {icon}
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
