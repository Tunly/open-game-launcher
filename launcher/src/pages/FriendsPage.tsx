import {
  Gamepad2,
  Globe,
  Loader2,
  MessageSquare,
  Send,
  Shield,
  ThumbsUp,
  UserPlus,
  Users,
  Activity,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { FriendRequestList } from "../components/friends/FriendRequestList";
import { FriendsList } from "../components/friends/FriendsList";
import { UserSearch } from "../components/friends/UserSearch";
import { FriendImport } from "../components/friends/FriendImport";
import { GroupChatPanel } from "../components/friends/GroupChatPanel";
import { ActivityFeed } from "../components/friends/ActivityFeed";
import { CrossPlatformInvite } from "../components/friends/CrossPlatformInvite";
import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  declineFriendRequest,
  getFriends,
  getMyBlocks,
  getMyFriendRequests,
  getProfilesForUsers,
  removeFriend,
  searchProfiles,
  sendFriendRequest,
  unblockUser,
} from "../lib/supabase/profile";
import { getVisiblePresence, subscribeToPresenceChanges } from "../lib/supabase/presence";
import { getMyPlatformAccounts } from "../lib/supabase/platform-accounts";
import { launchCrossPlayJoin } from "../lib/launcher";
import { getCrossPlayPlatforms } from "../lib/supabase/crossplay";
import {
  getDirectThread,
  getMyGameInvites,
  sendDirectMessage,
  sendGameInvite,
  subscribeToGameInvites,
  subscribeToRoomMessages,
  updateGameInviteStatus,
  type DirectThread,
} from "../lib/supabase/social";
import type {
  FriendRequest,
  Friendship,
  GameInvite,
  Profile,
  UserPresence,
} from "../lib/types/profile";
import type { PlatformAccount, PlatformType } from "../lib/types/friends";

type TabKey = "friends" | "import" | "chat" | "activity" | "invites";

const TABS: Array<{ key: TabKey; label: string; icon: ReactNode }> = [
  { key: "friends", label: "Friends", icon: <Users className="h-3.5 w-3.5" /> },
  { key: "import", label: "Import", icon: <Globe className="h-3.5 w-3.5" /> },
  { key: "chat", label: "Chat", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { key: "activity", label: "Activity", icon: <Activity className="h-3.5 w-3.5" /> },
  { key: "invites", label: "Invites", icon: <Gamepad2 className="h-3.5 w-3.5" /> },
];

type LocalFriend = {
  id: string;
  artClass: string;
  displayName: string;
  gameTitle: string;
  note: string;
  platforms: string[];
  signal: string;
  status: "online" | "away" | "offline";
  username: string;
};

type LocalRequest = {
  id: string;
  copy: string;
  direction: "incoming" | "outgoing";
  displayName: string;
  username: string;
};

type LocalChatMessage = {
  id: string;
  content: string;
  sender: "friend" | "me";
};

type LocalInvite = {
  id: string;
  direction: "incoming" | "outgoing";
  friendId: string;
  friendName: string;
  gameTitle: string;
  message: string;
  platform: string;
  status: "pending" | "accepted" | "declined" | "staged";
};

type ActivitySidebarFriend = {
  detail: string;
  id: string;
  name: string;
  status: "online" | "away" | "offline" | "busy" | "invisible";
};

type LocalActivityItem = {
  action: string;
  actor: string;
  artClass: string;
  comments: Array<{ author: string; copy: string }>;
  dayLabel: string;
  detail: string;
  gameTitle: string;
  handle: string;
  id: string;
  meta: string;
  platform: string;
  reactions: number;
  timeLabel: string;
};

const LOCAL_FRIENDS: LocalFriend[] = [
  {
    id: "packet-ghost",
    artClass: "library-art-tokyo",
    displayName: "Packet Ghost",
    gameTitle: "Neon Drift",
    note: "Ranked queue open, party ready.",
    platforms: ["Steam", "Xbox"],
    signal: "Live party",
    status: "online",
    username: "packetghost",
  },
  {
    id: "teal-shift",
    artClass: "library-art-mech",
    displayName: "Teal Shift",
    gameTitle: "Mecha Signal",
    note: "Away in workshop, accepts async invites.",
    platforms: ["GOG", "Epic"],
    signal: "Workbench",
    status: "away",
    username: "tealshift",
  },
  {
    id: "arcade-witch",
    artClass: "library-art-phantom",
    displayName: "Arcade Witch",
    gameTitle: "Phantom Arcade",
    note: "Offline, last session synced locally.",
    platforms: ["Steam"],
    signal: "Last seen 2h",
    status: "offline",
    username: "arcadewitch",
  },
];

const LOCAL_REQUESTS: LocalRequest[] = [
  {
    id: "vector-kid",
    copy: "Wants to join your Neon Drift bracket.",
    direction: "incoming",
    displayName: "Vector Kid",
    username: "vectorkid",
  },
  {
    id: "chrome-runner",
    copy: "Invite staged from your local roster.",
    direction: "outgoing",
    displayName: "Chrome Runner",
    username: "chromerunner",
  },
];

const LOCAL_CHAT_MESSAGES: LocalChatMessage[] = [
  {
    id: "chat-1",
    content: "Lobby is open. Bring the teal build.",
    sender: "friend",
  },
  {
    id: "chat-2",
    content: "Copy. Local relay preview has the party note staged.",
    sender: "me",
  },
];

const LOCAL_INVITES: LocalInvite[] = [
  {
    id: "invite-neon-drift",
    direction: "incoming",
    friendId: "packet-ghost",
    friendName: "Packet Ghost",
    gameTitle: "Neon Drift",
    message: "Join the cross-play lobby before the next heat.",
    platform: "Steam -> Xbox",
    status: "pending",
  },
  {
    id: "invite-phantom-arcade",
    direction: "outgoing",
    friendId: "arcade-witch",
    friendName: "Arcade Witch",
    gameTitle: "Phantom Arcade",
    message: "Local invite envelope ready for app-link testing.",
    platform: "Steam -> Open Link",
    status: "pending",
  },
];

const LOCAL_SEARCH_RESULTS = [
  {
    id: "search-null-byte",
    displayName: "Null Byte",
    handle: "nullbyte",
    copy: "Shared games: Neon Drift, Mecha Signal",
  },
  {
    id: "search-juno-stack",
    displayName: "Juno Stack",
    handle: "junostack",
    copy: "Cross-play link detected via Steam and Epic",
  },
];

const LOCAL_IMPORT_ACCOUNTS = [
  { id: "steam", label: "Steam", count: 42, status: "Preview linked" },
  { id: "xbox", label: "Xbox", count: 18, status: "Token cached" },
  { id: "gog", label: "GOG", count: 11, status: "Manual review" },
];

const LOCAL_DEDUP_STRIP = [
  {
    accent: "bg-[#8cf5e4]",
    copy: "Packet Ghost // Steam + Xbox",
    label: "Merge group staged",
  },
  {
    accent: "bg-[#b7102a]",
    copy: "Owner-scoped propagation",
    label: "Friend link guard",
  },
  {
    accent: "bg-[#007166]",
    copy: "OG platform import allowed",
    label: "Platform contract",
  },
];

const LOCAL_ACTIVITY: LocalActivityItem[] = [
  {
    action: "shared a new session",
    actor: "Packet Ghost",
    artClass: "library-art-tokyo",
    comments: [
      {
        author: "You",
        copy: "Lobby link staged. Waiting for party check.",
      },
    ],
    dayLabel: "Today",
    detail: "Ranked heat ended with a clean drift chain and a squad invite ready for relay.",
    gameTitle: "Neon Drift",
    handle: "packetghost",
    id: "activity-packet-ghost-neon-drift",
    meta: "2.4 hrs this session / party open",
    platform: "Steam",
    reactions: 18,
    timeLabel: "12:44",
  },
  {
    action: "unlocked an achievement",
    actor: "Teal Shift",
    artClass: "library-art-mech",
    comments: [
      {
        author: "Packet Ghost",
        copy: "That boss phase finally cracked.",
      },
    ],
    dayLabel: "Today",
    detail: "MECHA-SIGNAL / Hard Reset popped after a workshop run.",
    gameTitle: "Mecha Signal",
    handle: "tealshift",
    id: "activity-teal-shift-mecha-signal",
    meta: "Rare unlock / 7.2% players",
    platform: "GOG",
    reactions: 11,
    timeLabel: "10:18",
  },
  {
    action: "posted a squad request",
    actor: "Vector Kid",
    artClass: "card-art-crash",
    comments: [
      {
        author: "Arcade Witch",
        copy: "Can fill support after sync finishes.",
      },
    ],
    dayLabel: "Yesterday",
    detail: "Tonight's co-op slot is pinned with cross-platform invite routing.",
    gameTitle: "Boss Rush EX",
    handle: "vectorkid",
    id: "activity-vector-kid-boss-rush",
    meta: "2 open slots / invite pending",
    platform: "Open Link",
    reactions: 7,
    timeLabel: "22:03",
  },
  {
    action: "synced screenshots",
    actor: "Arcade Witch",
    artClass: "library-art-phantom",
    comments: [
      {
        author: "Teal Shift",
        copy: "That final room belongs in the showcase.",
      },
    ],
    dayLabel: "Yesterday",
    detail: "Phantom Arcade save data and two gallery shots landed in the activity lane.",
    gameTitle: "Phantom Arcade",
    handle: "arcadewitch",
    id: "activity-arcade-witch-phantom",
    meta: "Cloud save verified / 2 images",
    platform: "Steam",
    reactions: 13,
    timeLabel: "19:41",
  },
];

export function FriendsPage() {
  const { isConfigured, isLoading: isAuthLoading, user } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabKey | null) ?? "friends";
  const [activeTab, setActiveTab] = useState<TabKey>(
    (TABS.some((t) => t.key === initialTab) ? initialTab : "friends") as TabKey,
  );

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (!tab) {
      if (activeTab !== "friends") {
        setActiveTab("friends");
      }
      return;
    }
    if (tab && TABS.some((t) => t.key === tab) && tab !== activeTab) {
      setActiveTab(tab as TabKey);
    }
  }, [searchParams, activeTab]);

  const switchTab = useCallback(
    (tab: TabKey) => {
      setActiveTab(tab);
      const next = new URLSearchParams(searchParams);
      if (tab === "friends") {
        next.delete("tab");
      } else {
        next.set("tab", tab);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, UserPresence>>({});
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [thread, setThread] = useState<DirectThread | null>(null);
  const [chatText, setChatText] = useState("");
  const [invites, setInvites] = useState<GameInvite[]>([]);
  const [inviteGameTitle, setInviteGameTitle] = useState("");
  const [myPlatforms, setMyPlatforms] = useState<PlatformAccount[]>([]);

  async function handleJoinGame(gameId: string) {
    try {
      const platforms = await getCrossPlayPlatforms(gameId);
      if (platforms.length === 0) {
        setErrorMessage("Cross-play is not available for this game.");
        return;
      }
      await launchCrossPlayJoin(platforms[0], gameId);
      setMessage("Launching game...");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }

  function openFriendChat(friendId: string) {
    setSelectedFriendId(friendId);
    switchTab("chat");
  }

  function openFriendInvite(friendId: string) {
    setSelectedFriendId(friendId);
    const gameTitle = presenceByUserId[friendId]?.currentGameTitle?.trim();
    setInviteGameTitle(gameTitle ?? "");
    switchTab("invites");
  }

  const friendIds = useMemo(() => (user ? getFriendIds(friends, user.id) : []), [friends, user]);
  const onlineFriends = useMemo(
    () => friendIds.filter((friendId) => presenceByUserId[friendId]?.status === "online").length,
    [friendIds, presenceByUserId],
  );
  const friendProfileById = useMemo(() => {
    const map: Record<
      string,
      { id: string; username: string; displayName: string | null; avatarUrl: string | null }
    > = {};
    for (const friendship of friends) {
      if (user && friendship.profile && friendship.profile.id !== user.id) {
        map[friendship.profile.id] = {
          id: friendship.profile.id,
          username: friendship.profile.username,
          displayName: friendship.profile.displayName,
          avatarUrl: friendship.profile.avatarUrl,
        };
      }
    }
    return map;
  }, [friends, user]);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [blockedProfiles, setBlockedProfiles] = useState<
    Record<string, { username: string; displayName: string | null; avatarUrl: string | null }>
  >({});

  const refreshBlocks = useCallback(async () => {
    if (!isConfigured) {
      setBlockedIds([]);
      setBlockedProfiles({});
      return;
    }
    try {
      const blocks = await getMyBlocks();
      const ids = blocks.map((block) => block.blockedId);
      setBlockedIds(ids);
      if (ids.length > 0) {
        const profiles = await getProfilesForUsers(ids).catch(() => new Map());
        const next: Record<
          string,
          { username: string; displayName: string | null; avatarUrl: string | null }
        > = {};
        for (const id of ids) {
          const profile = profiles.get(id);
          if (profile) {
            next[id] = {
              username: profile.username,
              displayName: profile.displayName,
              avatarUrl: profile.avatarUrl,
            };
          }
        }
        setBlockedProfiles(next);
      } else {
        setBlockedProfiles({});
      }
    } catch {
      setBlockedIds([]);
      setBlockedProfiles({});
    }
  }, [isConfigured]);

  useEffect(() => {
    void refreshBlocks();
  }, [refreshBlocks]);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [loadedFriends, loadedRequests, loadedInvites] = await Promise.all([
      getFriends(user.id),
      getMyFriendRequests(),
      getMyGameInvites(),
    ]);
    setFriends(loadedFriends);
    setRequests(loadedRequests);
    setInvites(loadedInvites);
  }, [user]);

  useEffect(() => {
    if (!isConfigured || !user) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    void Promise.all([refresh(), getMyPlatformAccounts().catch(() => [])])
      .then(([, platforms]) => {
        if (isMounted) setMyPlatforms(platforms);
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isConfigured, refresh, user]);

  useEffect(() => {
    let isMounted = true;
    const trimmed = query.trim();

    if (!isConfigured || trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      return () => {
        isMounted = false;
      };
    }

    setIsSearching(true);
    const timeout = window.setTimeout(() => {
      void searchProfiles(trimmed)
        .then((profiles) => {
          if (isMounted) setResults(profiles.filter((profile) => profile.id !== user?.id));
        })
        .catch((error: unknown) => {
          if (isMounted) setErrorMessage(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (isMounted) setIsSearching(false);
        });
    }, 250);

    return () => {
      isMounted = false;
      window.clearTimeout(timeout);
    };
  }, [isConfigured, query, user?.id]);

  useEffect(() => {
    if (!isConfigured || !user || friendIds.length === 0) {
      setPresenceByUserId({});
      return;
    }

    let isMounted = true;

    void getVisiblePresence(friendIds)
      .then((presences) => {
        if (!isMounted) return;
        setPresenceByUserId(
          Object.fromEntries(presences.map((presence) => [presence.userId, presence])),
        );
      })
      .catch((error: unknown) => {
        if (isMounted) setErrorMessage(error instanceof Error ? error.message : String(error));
      });

    const unsubscribe = subscribeToPresenceChanges(friendIds, (presence) => {
      if (!isMounted) return;
      setPresenceByUserId((current) => ({ ...current, [presence.userId]: presence }));
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [friendIds, isConfigured, user]);

  useEffect(() => {
    if (friendIds.length === 0) {
      setSelectedFriendId(null);
      setThread(null);
      return;
    }

    if (!selectedFriendId || !friendIds.includes(selectedFriendId)) {
      setSelectedFriendId(friendIds[0]);
    }
  }, [friendIds, selectedFriendId]);

  useEffect(() => {
    if (!isConfigured || !user) {
      return;
    }

    const unsubscribe = subscribeToGameInvites(user.id, (invite) => {
      setInvites((current) => [invite, ...current.filter((item) => item.id !== invite.id)]);
    });

    return unsubscribe;
  }, [isConfigured, user]);

  useEffect(() => {
    if (!isConfigured || !selectedFriendId) {
      setThread(null);
      return;
    }

    let isMounted = true;
    let unsubscribe: (() => void) | null = null;
    const friendId = selectedFriendId;

    void getDirectThread(friendId)
      .then((loadedThread) => {
        if (!isMounted) {
          return;
        }

        setThread(loadedThread);
        unsubscribe = subscribeToRoomMessages(loadedThread.room.id, (nextMessage) => {
          setThread((current) => {
            if (
              !current ||
              current.room.id !== loadedThread.room.id ||
              current.messages.some((item) => item.id === nextMessage.id)
            ) {
              return current;
            }

            return { ...current, messages: [...current.messages, nextMessage] };
          });
        });
      })
      .catch((error: unknown) => {
        if (isMounted) setErrorMessage(error instanceof Error ? error.message : String(error));
      });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [isConfigured, selectedFriendId]);

  async function runMutation(action: () => Promise<unknown>, success: string) {
    setIsMutating(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      await action();
      await Promise.all([refresh(), refreshBlocks()]);
      setMessage(success);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsMutating(false);
    }
  }

  async function submitChatMessage() {
    if (!selectedFriendId || !chatText.trim()) {
      return;
    }

    const content = chatText;
    setChatText("");
    await runMutation(async () => {
      const nextMessage = await sendDirectMessage(selectedFriendId, content);
      setThread((current) =>
        current && !current.messages.some((item) => item.id === nextMessage.id)
          ? { ...current, messages: [...current.messages, nextMessage] }
          : current,
      );
    }, "Message sent.");
  }

  async function submitGameInvite() {
    if (!selectedFriendId || !inviteGameTitle.trim()) {
      return;
    }

    const gameTitle = inviteGameTitle;
    setInviteGameTitle("");
    await runMutation(async () => {
      const invite = await sendGameInvite({ gameTitle, receiverId: selectedFriendId });
      setInvites((current) => [invite, ...current.filter((item) => item.id !== invite.id)]);
    }, "Game invite sent.");
  }

  const myPlatformTypes = myPlatforms.map((p) => p.platform) as PlatformType[];
  const displayedFriendCount = isConfigured ? friends.length : LOCAL_FRIENDS.length;
  const displayedRequestCount = isConfigured ? requests.length : LOCAL_REQUESTS.length;
  const displayedOnlineFriends = isConfigured
    ? onlineFriends
    : LOCAL_FRIENDS.filter((friend) => friend.status === "online").length;
  const activityFriends = useMemo(
    () => getConfiguredActivityFriends(friendIds, friendProfileById, presenceByUserId),
    [friendIds, friendProfileById, presenceByUserId],
  );

  return (
    <div className="mx-auto w-full max-w-[1220px] px-0 py-2">
      <div className="mb-7 flex flex-col gap-4 border-b-4 border-black pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-[3px_3px_0_#171411]">
            Social
          </p>
          <h1 className="neo-title mt-3 text-[3.8rem] leading-[0.82] text-[#171411] sm:text-[4.8rem] lg:text-[5.8rem] xl:text-[6.5rem]">
            Friends
          </h1>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Metric
            icon={<Users className="h-4 w-4" />}
            label="Friends"
            value={displayedFriendCount}
          />
          <Metric
            icon={<UserPlus className="h-4 w-4" />}
            label="Requests"
            value={displayedRequestCount}
          />
          <Metric
            icon={<Shield className="h-4 w-4" />}
            label="Online"
            value={displayedOnlineFriends}
          />
        </div>
      </div>

      {isAuthLoading || isLoading ? (
        <div className="grid min-h-80 place-items-center border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#171411]">
          <Loader2 className="h-8 w-8 animate-spin text-[#b7102a]" />
        </div>
      ) : !isConfigured ? (
        <LocalFriendsHub activeTab={activeTab} onSwitchTab={switchTab} />
      ) : !user ? (
        <Notice title="Login required" body="Sign in before managing friends." />
      ) : (
        <div className="space-y-5">
          <TabNavigation activeTab={activeTab} onSwitchTab={switchTab} />

          {/* Tab Content */}
          {activeTab === "friends" && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-5">
                <Panel title="Friend List">
                  <FriendsList
                    currentUserId={user.id}
                    friends={friends}
                    presenceByUserId={presenceByUserId}
                    selectedFriendId={selectedFriendId}
                    onRemove={(friendship) =>
                      void runMutation(() => removeFriend(friendship.id), "Friend removed.")
                    }
                    onOpenChat={openFriendChat}
                    onOpenInvite={openFriendInvite}
                    onSelectFriend={setSelectedFriendId}
                    onJoinGame={handleJoinGame}
                  />
                </Panel>
                <Panel title="Friend Requests">
                  <FriendRequestList
                    currentUserId={user.id}
                    isMutating={isMutating}
                    requests={requests}
                    onAccept={(request) =>
                      void runMutation(
                        () => acceptFriendRequest(request.id),
                        "Friend request accepted.",
                      )
                    }
                    onCancel={(request) =>
                      void runMutation(
                        () => cancelFriendRequest(request.id),
                        "Friend request withdrawn.",
                      )
                    }
                    onDecline={(request) =>
                      void runMutation(
                        () => declineFriendRequest(request.id),
                        "Friend request declined.",
                      )
                    }
                  />
                </Panel>
              </div>

              <aside className="space-y-5">
                <Panel title="Find Players">
                  <UserSearch query={query} onQueryChange={setQuery} />
                  <div className="mt-4 space-y-3">
                    {isSearching ? (
                      <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[12px] font-bold uppercase leading-5 text-[#655f58]">
                        Searching...
                      </p>
                    ) : results.length > 0 ? (
                      results.map((profile) => (
                        <div
                          key={profile.id}
                          className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]"
                        >
                          <p className="neo-title text-2xl leading-none text-[#171411]">
                            {profile.displayName ?? profile.username}
                          </p>
                          <p className="neo-copy mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                            @{profile.username}
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              className="neo-copy border-2 border-black bg-[#007166] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a] disabled:opacity-60"
                              disabled={isMutating}
                              type="button"
                              onClick={() =>
                                void runMutation(
                                  () => sendFriendRequest(profile.id),
                                  "Friend request sent.",
                                )
                              }
                            >
                              Add
                            </button>
                            <button
                              className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a] shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#f3c3c9] disabled:opacity-60"
                              disabled={isMutating}
                              type="button"
                              onClick={() =>
                                void runMutation(() => blockUser(profile.id), "User blocked.")
                              }
                            >
                              Block
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[12px] font-bold uppercase leading-5 text-[#655f58]">
                        Search by username or display name.
                      </p>
                    )}
                  </div>
                  {blockedIds.length > 0 ? (
                    <div className="mt-5 border-t-2 border-black pt-4">
                      <p className="neo-copy mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
                        Blocked players
                      </p>
                      <div className="space-y-2">
                        {blockedIds.map((id) => {
                          const profile = blockedProfiles[id];
                          const label = profile?.displayName ?? profile?.username ?? null;
                          return (
                            <div
                              key={id}
                              className="flex items-center justify-between gap-2 border-2 border-black bg-[#fff9ed] p-2 shadow-[1px_1px_0_#171411]"
                            >
                              <div className="min-w-0">
                                <p className="neo-copy truncate text-[11px] font-black uppercase text-[#171411]">
                                  {label ?? `Player ${id.slice(0, 8)}`}
                                </p>
                                {profile?.username ? (
                                  <p className="neo-copy truncate text-[9px] font-bold uppercase tracking-[0.12em] text-[#5b403f]">
                                    @{profile.username}
                                  </p>
                                ) : null}
                              </div>
                              <button
                                className="neo-copy shrink-0 border-2 border-black bg-[#007166] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[1px_1px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#065e53] disabled:opacity-60"
                                disabled={isMutating}
                                type="button"
                                onClick={() =>
                                  void runMutation(() => unblockUser(id), "User unblocked.")
                                }
                              >
                                Unblock
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </Panel>
                {errorMessage ? <Status tone="error" message={errorMessage} /> : null}
                {message ? <Status tone="success" message={message} /> : null}
              </aside>
            </div>
          )}

          {activeTab === "import" && (
            <Panel title="Import Platform Friends">
              <p className="neo-copy mb-4 text-[11px] font-bold uppercase leading-5 text-[#55504a]">
                Import your friends from connected gaming platforms. Deduplication runs
                automatically (linked accounts) and via heuristic name matching.
              </p>
              <FriendImport onImported={() => void refresh()} />
            </Panel>
          )}

          {activeTab === "chat" && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              {/* DM Chat */}
              <Panel title="Direct Messages">
                <div className="space-y-4">
                  <div className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]">
                    <div className="flex items-center gap-2 border-b-2 border-black pb-2">
                      <MessageSquare className="h-4 w-4 text-[#b7102a]" />
                      <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
                        Direct Message
                      </p>
                    </div>
                    {/* Friend selector */}
                    {friendIds.length > 0 && (
                      <div className="mb-2 mt-2">
                        <select
                          className="neo-copy w-full border-2 border-black bg-[#fff9ed] px-2 py-1.5 text-[10px] font-bold"
                          value={selectedFriendId ?? ""}
                          onChange={(e) => setSelectedFriendId(e.target.value || null)}
                        >
                          {friendIds.map((id) => {
                            const profile = friendProfileById[id];
                            const label = profile?.displayName ?? profile?.username ?? null;
                            return (
                              <option key={id} value={id}>
                                {label ?? `Player ${id.slice(0, 8)}`}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    )}
                    <div className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">
                      {thread?.messages.length ? (
                        thread.messages.map((chatMessage) => (
                          <div
                            key={chatMessage.id}
                            className={`border-2 border-black p-2 text-sm leading-5 shadow-[2px_2px_0_#171411] ${
                              chatMessage.senderId === user.id ? "bg-[#8cf5e4]" : "bg-[#fff9ed]"
                            }`}
                          >
                            {chatMessage.content}
                          </div>
                        ))
                      ) : (
                        <p className="neo-copy border-2 border-dashed border-black bg-[#fff9ed] p-3 text-[11px] font-bold uppercase leading-5 text-[#655f58]">
                          Pick a friend and start a text chat.
                        </p>
                      )}
                    </div>
                    <form
                      className="mt-3 flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void submitChatMessage();
                      }}
                    >
                      <input
                        className="neo-copy min-w-0 flex-1 border-2 border-black bg-[#fff9ed] px-3 text-[11px] font-bold outline-none placeholder:text-[#655f58]"
                        disabled={!selectedFriendId || isMutating}
                        maxLength={2000}
                        placeholder="Write message..."
                        value={chatText}
                        onChange={(event) => setChatText(event.target.value)}
                      />
                      <button
                        aria-label="Send message"
                        className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-black bg-[#007166] text-white shadow-[2px_2px_0_#171411] disabled:opacity-50"
                        disabled={!selectedFriendId || !chatText.trim() || isMutating}
                        type="submit"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                </div>
              </Panel>

              {/* Group Chat */}
              <Panel title="Group Chats">
                <GroupChatPanel
                  currentUserId={user.id}
                  friendIds={friendIds}
                  profilesById={friendProfileById}
                />
              </Panel>
            </div>
          )}

          {activeTab === "activity" && (
            <ActivityTabShell
              friends={activityFriends}
              modeLabel="Live Social Relay"
              onlineCount={onlineFriends}
              totalFriends={friendIds.length}
              onComposerPost={(copy) => {
                setMessage(`Activity post staged: ${copy.slice(0, 72)}`);
              }}
            >
              <ActivityFeed friendIds={friendIds} />
              {errorMessage ? <Status tone="error" message={errorMessage} /> : null}
              {message ? <Status tone="success" message={message} /> : null}
            </ActivityTabShell>
          )}

          {activeTab === "invites" && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <Panel title="Cross-Platform Invites">
                <CrossPlatformInvite
                  currentUserId={user.id}
                  receiverPlatforms={[]}
                  selectedFriendId={selectedFriendId}
                  senderPlatforms={myPlatformTypes}
                />
                <div className="mt-4 border-t-2 border-black pt-4">
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitGameInvite();
                    }}
                  >
                    <input
                      className="neo-copy min-w-0 flex-1 border-2 border-black bg-[#fff9ed] px-3 text-[11px] font-bold outline-none placeholder:text-[#655f58]"
                      disabled={!selectedFriendId || isMutating}
                      maxLength={160}
                      placeholder="Quick invite — game title..."
                      value={inviteGameTitle}
                      onChange={(event) => setInviteGameTitle(event.target.value)}
                    />
                    <button
                      className="neo-copy h-10 shrink-0 border-2 border-black bg-[#b7102a] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411] disabled:opacity-50"
                      disabled={!selectedFriendId || !inviteGameTitle.trim() || isMutating}
                      type="submit"
                    >
                      Invite
                    </button>
                  </form>
                </div>
              </Panel>
              <Panel title="Pending Invites">
                <InviteList
                  currentUserId={user.id}
                  invites={invites}
                  isMutating={isMutating}
                  onAccept={(invite) =>
                    void runMutation(
                      () => updateGameInviteStatus(invite.id, "accepted"),
                      "Invite accepted.",
                    )
                  }
                  onDecline={(invite) =>
                    void runMutation(
                      () => updateGameInviteStatus(invite.id, "declined"),
                      "Invite declined.",
                    )
                  }
                />
              </Panel>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getFriendIds(friends: Friendship[], currentUserId: string) {
  return friends.map((friendship) =>
    friendship.requesterId === currentUserId ? friendship.addresseeId : friendship.requesterId,
  );
}

function getConfiguredActivityFriends(
  friendIds: string[],
  friendProfileById: Record<
    string,
    { id: string; username: string; displayName: string | null; avatarUrl: string | null }
  >,
  presenceByUserId: Record<string, UserPresence>,
): ActivitySidebarFriend[] {
  return friendIds.slice(0, 8).map((friendId) => {
    const profile = friendProfileById[friendId];
    const presence = presenceByUserId[friendId];
    const name = profile?.displayName ?? profile?.username ?? `Player ${friendId.slice(0, 8)}`;
    const platform = presence?.platform ? ` / ${presence.platform}` : "";
    const detail = presence?.currentGameTitle
      ? `Playing ${presence.currentGameTitle}${platform}`
      : presence?.customStatus || "No active game session";

    return {
      detail,
      id: friendId,
      name,
      status: presence?.status ?? "offline",
    };
  });
}

function getLocalActivityFriends(): ActivitySidebarFriend[] {
  return LOCAL_FRIENDS.map((friend) => ({
    detail: `${friend.gameTitle} / ${friend.signal}`,
    id: friend.id,
    name: friend.displayName,
    status: friend.status,
  }));
}

function ActivityTabShell({
  children,
  friends,
  modeLabel,
  onComposerPost,
  onlineCount,
  totalFriends,
}: {
  children: ReactNode;
  friends: ActivitySidebarFriend[];
  modeLabel: string;
  onComposerPost: (copy: string) => void;
  onlineCount: number;
  totalFriends: number;
}) {
  const [composerText, setComposerText] = useState("");
  const spotlightFriend =
    friends.find((friend) => friend.status === "online" || friend.status === "busy") ?? friends[0];

  function submitComposer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const copy = composerText.trim();
    if (!copy) return;
    onComposerPost(copy);
    setComposerText("");
  }

  return (
    <section
      aria-label="Friend activity tab"
      className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div className="min-w-0 space-y-4">
        <section className="border-[5px] border-black bg-[#f5eedf] shadow-[6px_6px_0_#171411]">
          <div className="grid gap-4 border-b-[5px] border-black p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-w-0">
              <p className="neo-copy inline-flex border-2 border-black bg-[#007166] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411]">
                {modeLabel}
              </p>
              <h2 className="neo-title mt-3 text-5xl leading-none text-[#171411]">
                Friend Activity
              </h2>
              <p className="neo-copy mt-2 text-[11px] font-bold uppercase leading-5 text-[#5b403f]">
                Recent games, unlocks, comments, and quick reactions from your launcher network.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
                <p className="neo-title text-3xl leading-none text-[#b7102a]">{onlineCount}</p>
                <p className="neo-copy mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                  Online
                </p>
              </div>
              <div className="border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
                <p className="neo-title text-3xl leading-none text-[#007166]">{totalFriends}</p>
                <p className="neo-copy mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                  Friends
                </p>
              </div>
            </div>
          </div>

          <form
            className="grid gap-3 p-4 sm:grid-cols-[56px_minmax(0,1fr)]"
            onSubmit={submitComposer}
          >
            <div className="neo-title flex h-14 w-14 items-center justify-center border-[3px] border-black bg-[#b7102a] text-2xl leading-none text-white shadow-[3px_3px_0_#171411]">
              OG
            </div>
            <div className="min-w-0">
              <textarea
                className="neo-copy min-h-20 w-full resize-none border-[3px] border-black bg-[#fff9ed] px-3 py-2 text-[11px] font-bold uppercase leading-5 outline-none placeholder:text-[#655f58]"
                maxLength={240}
                placeholder="What's new, commander?"
                value={composerText}
                onChange={(event) => setComposerText(event.target.value)}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {["Screenshot", "Achievement", "Review"].map((label) => (
                    <button
                      key={label}
                      className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[1px_1px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
                      type="button"
                      onClick={() =>
                        setComposerText((current) => `${current}${current ? " " : ""}${label}: `)
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  className="neo-copy border-[3px] border-black bg-[#b7102a] px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#007166] disabled:opacity-50"
                  disabled={!composerText.trim()}
                  type="submit"
                >
                  Post Activity
                </button>
              </div>
            </div>
          </form>
        </section>

        {children}
      </div>

      <aside className="space-y-4">
        <section className="border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411]">
          <p className="neo-copy inline-flex border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#fff9ed]">
            Playing Now
          </p>
          {spotlightFriend ? (
            <div className="mt-3 border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]">
              <p className="neo-title text-3xl leading-none text-[#171411]">
                {spotlightFriend.name}
              </p>
              <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-5 text-[#5b403f]">
                {spotlightFriend.detail}
              </p>
              <p className={activityStatusClassName(spotlightFriend.status)}>
                {spotlightFriend.status}
              </p>
            </div>
          ) : (
            <p className="neo-copy mt-3 border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[11px] font-bold uppercase leading-5 text-[#655f58]">
              No friends loaded yet.
            </p>
          )}
        </section>

        <section className="border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411]">
          <div className="flex items-center justify-between gap-3 border-b-[3px] border-black pb-3">
            <h3 className="neo-title text-3xl leading-none text-[#171411]">Friends Online</h3>
            <span className="neo-copy border-2 border-black bg-[#007166] px-2 py-1 text-[10px] font-black uppercase text-white">
              {onlineCount}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {friends.length > 0 ? (
              friends.map((friend) => (
                <div
                  key={friend.id}
                  className="grid grid-cols-[34px_minmax(0,1fr)] gap-2 border-2 border-black bg-[#f6edd8] p-2 shadow-[2px_2px_0_#171411]"
                >
                  <div className="neo-title flex h-8 w-8 items-center justify-center border-2 border-black bg-[#171411] text-sm text-[#fff9ed]">
                    {friend.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="neo-copy truncate text-[10px] font-black uppercase text-[#171411]">
                      {friend.name}
                    </p>
                    <p className="neo-copy truncate text-[9px] font-bold uppercase text-[#5b403f]">
                      {friend.detail}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[11px] font-bold uppercase leading-5 text-[#655f58]">
                Add friends to fill the activity rail.
              </p>
            )}
          </div>
        </section>
      </aside>
    </section>
  );
}

function activityStatusClassName(status: ActivitySidebarFriend["status"]) {
  const baseClassName =
    "neo-copy mt-3 inline-flex border-2 border-black px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[1px_1px_0_#171411]";

  if (status === "online") return `${baseClassName} bg-[#007166] text-white`;
  if (status === "busy") return `${baseClassName} bg-[#b7102a] text-white`;
  if (status === "away") return `${baseClassName} bg-[#8cf5e4] text-[#171411]`;

  return `${baseClassName} bg-[#fff9ed] text-[#171411]`;
}

function LocalActivityFeed({ items }: { items: LocalActivityItem[] }) {
  return (
    <div className="space-y-4">
      {items.map((item, index) => {
        const previousDay = index > 0 ? items[index - 1].dayLabel : null;

        return (
          <div className="space-y-3" key={item.id}>
            {item.dayLabel !== previousDay ? (
              <div className="neo-copy border-y-[3px] border-black bg-[#171411] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#fff9ed]">
                {item.dayLabel}
              </div>
            ) : null}
            <article className="border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
              <div className="flex items-start gap-3">
                <div className="neo-title flex h-12 w-12 shrink-0 items-center justify-center border-[3px] border-black bg-[#171411] text-xl leading-none text-[#fff9ed] shadow-[2px_2px_0_#b7102a]">
                  {item.actor.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="neo-copy text-[11px] font-black uppercase tracking-[0.08em] text-[#171411]">
                      {item.actor}
                    </p>
                    <p className="neo-copy text-[10px] font-black uppercase text-[#655f58]">
                      @{item.handle} / {item.timeLabel}
                    </p>
                  </div>
                  <p className="mt-1 text-sm font-bold leading-5 text-[#5b403f]">{item.action}</p>
                </div>
                <span className="neo-copy shrink-0 border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[1px_1px_0_#171411]">
                  {item.platform}
                </span>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(190px,270px)_minmax(0,1fr)]">
                <div
                  aria-label={`${item.gameTitle} activity artwork`}
                  className={`min-h-32 border-[3px] border-black shadow-[3px_3px_0_#171411] ${item.artClass}`}
                  role="img"
                />
                <div className="min-w-0 border-[3px] border-black bg-[#f6edd8] p-3">
                  <p className="neo-title truncate text-4xl leading-none text-[#171411]">
                    {item.gameTitle}
                  </p>
                  <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-5 text-[#b7102a]">
                    {item.meta}
                  </p>
                  <p className="mt-2 text-sm font-bold leading-5 text-[#5b403f]">{item.detail}</p>
                  <div className="mt-3 h-4 border-2 border-black bg-[#fff9ed]">
                    <div
                      aria-hidden="true"
                      className="h-full bg-[#007166]"
                      style={{ width: `${Math.min(92, 32 + item.reactions * 3)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t-2 border-black pt-3">
                <button
                  className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[1px_1px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
                  type="button"
                >
                  <ThumbsUp className="h-3 w-3" />
                  Rate Up {item.reactions}
                </button>
                <button
                  className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[1px_1px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#f6edd8]"
                  type="button"
                >
                  <MessageSquare className="h-3 w-3" />
                  Comment
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {item.comments.map((comment) => (
                  <div
                    key={`${item.id}-${comment.author}`}
                    className="border-2 border-black bg-[#f6edd8] p-2 shadow-[1px_1px_0_#171411]"
                  >
                    <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
                      {comment.author}
                    </p>
                    <p className="mt-1 text-sm font-bold leading-5 text-[#5b403f]">
                      {comment.copy}
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        );
      })}
    </div>
  );
}

function TabNavigation({
  activeTab,
  onSwitchTab,
}: {
  activeTab: TabKey;
  onSwitchTab: (tab: TabKey) => void;
}) {
  return (
    <nav className="flex flex-wrap gap-1 border-4 border-black bg-[#efe6d4] p-2 shadow-[4px_4px_0_#171411]">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          className={`neo-copy flex items-center gap-1.5 border-2 border-black px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] shadow-[2px_2px_0_#171411] transition ${
            activeTab === tab.key
              ? "bg-[#b7102a] text-white"
              : "bg-[#fff9ed] text-[#171411] hover:bg-[#f6edd8]"
          }`}
          type="button"
          onClick={() => onSwitchTab(tab.key)}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function LocalFriendsHub({
  activeTab,
  onSwitchTab,
}: {
  activeTab: TabKey;
  onSwitchTab: (tab: TabKey) => void;
}) {
  const [selectedFriendId, setSelectedFriendId] = useState(LOCAL_FRIENDS[0]?.id ?? "");
  const [chatMessages, setChatMessages] = useState<LocalChatMessage[]>(LOCAL_CHAT_MESSAGES);
  const [chatText, setChatText] = useState("");
  const [invites, setInvites] = useState<LocalInvite[]>(LOCAL_INVITES);
  const [inviteGameTitle, setInviteGameTitle] = useState("Neon Drift");
  const [localSearch, setLocalSearch] = useState("neon");
  const [localMessage, setLocalMessage] = useState(
    "Local social relay is active because Supabase is not configured.",
  );
  const selectedFriend =
    LOCAL_FRIENDS.find((friend) => friend.id === selectedFriendId) ?? LOCAL_FRIENDS[0];
  const visibleSearchResults = LOCAL_SEARCH_RESULTS.filter((result) => {
    const needle = localSearch.trim().toLowerCase();
    return (
      needle.length === 0 ||
      result.displayName.toLowerCase().includes(needle) ||
      result.handle.toLowerCase().includes(needle) ||
      result.copy.toLowerCase().includes(needle)
    );
  });

  if (!selectedFriend) {
    return null;
  }

  function submitLocalChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = chatText.trim();
    if (!content) {
      return;
    }

    setChatMessages((current) => [
      ...current,
      {
        id: `local-chat-${Date.now()}`,
        content,
        sender: "me",
      },
    ]);
    setChatText("");
    setLocalMessage("Local message staged in this browser session.");
  }

  function submitLocalInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const gameTitle = inviteGameTitle.trim();
    if (!gameTitle) {
      return;
    }

    setInvites((current) => [
      {
        id: `local-invite-${Date.now()}`,
        direction: "outgoing",
        friendId: selectedFriend.id,
        friendName: selectedFriend.displayName,
        gameTitle,
        message: "Local quick invite staged for launcher handoff.",
        platform: "Local Relay -> Open Link",
        status: "staged",
      },
      ...current,
    ]);
    setInviteGameTitle("");
    setLocalMessage(`Local invite staged for ${selectedFriend.displayName}.`);
  }

  function updateLocalInviteStatus(
    inviteId: string,
    nextStatus: Extract<LocalInvite["status"], "accepted" | "declined">,
  ) {
    setInvites((current) =>
      current.map((invite) =>
        invite.id === inviteId ? { ...invite, status: nextStatus } : invite,
      ),
    );
    setLocalMessage(
      nextStatus === "accepted" ? "Local invite accepted." : "Local invite declined.",
    );
  }

  function stagePlayerAction(label: string) {
    setLocalMessage(`${label} staged locally. Connect Supabase to sync it across devices.`);
  }

  function openLocalChat(friend: LocalFriend) {
    setSelectedFriendId(friend.id);
    setLocalMessage(`Chat handoff staged for ${friend.displayName}.`);
    onSwitchTab("chat");
  }

  function openLocalInvite(friend: LocalFriend) {
    setSelectedFriendId(friend.id);
    setInviteGameTitle(friend.gameTitle);
    setLocalMessage(`Invite handoff staged for ${friend.displayName}.`);
    onSwitchTab("invites");
  }

  function stageLocalSmartJoin(friend: LocalFriend) {
    setSelectedFriendId(friend.id);
    setLocalMessage(
      `Smart Join staged for ${friend.displayName} on ${friend.gameTitle}. Connect providers to launch.`,
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 border-4 border-black bg-[#fff9ed] p-4 shadow-[6px_6px_0_#171411] lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="neo-copy inline-flex border-2 border-black bg-[#007166] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411]">
            Local Relay Preview
          </p>
          <h2 className="neo-title mt-3 text-4xl leading-none text-[#171411]">
            Offline Social Board
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-[12px] font-bold uppercase leading-6 text-[#5b403f]">
            Friends, chat, imports, activity, and invites stay usable as a launcher preview while
            the public Supabase keys are absent.
          </p>
        </div>
        <div className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
            Relay Signal
          </p>
          <p className="neo-title mt-2 text-3xl leading-none text-[#b7102a]">Local Only</p>
          <p className="neo-copy mt-2 text-[11px] font-bold uppercase leading-5 text-[#5b403f]">
            {localMessage}
          </p>
        </div>
      </section>

      <TabNavigation activeTab={activeTab} onSwitchTab={onSwitchTab} />

      {activeTab === "friends" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <Panel title="Local Roster">
              <div className="grid gap-3 lg:grid-cols-3">
                {LOCAL_FRIENDS.map((friend) => (
                  <LocalFriendCard
                    key={friend.id}
                    friend={friend}
                    isSelected={friend.id === selectedFriend.id}
                    onChat={() => openLocalChat(friend)}
                    onInvite={() => openLocalInvite(friend)}
                    onJoin={() => stageLocalSmartJoin(friend)}
                    onSelect={() => {
                      setSelectedFriendId(friend.id);
                      stagePlayerAction(`${friend.displayName} focused`);
                    }}
                  />
                ))}
              </div>
            </Panel>

            <Panel title="Friend Requests">
              <div className="grid gap-3 md:grid-cols-2">
                {LOCAL_REQUESTS.map((request) => (
                  <div
                    key={request.id}
                    className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]"
                  >
                    <p className="neo-copy inline-flex border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#171411]">
                      {request.direction === "incoming" ? "Incoming" : "Outgoing"}
                    </p>
                    <p className="neo-title mt-3 text-3xl leading-none text-[#171411]">
                      {request.displayName}
                    </p>
                    <p className="neo-copy mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
                      @{request.username}
                    </p>
                    <p className="mt-3 text-sm leading-5 text-[#5b403f]">{request.copy}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="neo-copy border-2 border-black bg-[#007166] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411]"
                        type="button"
                        onClick={() => stagePlayerAction(`${request.displayName} request action`)}
                      >
                        {request.direction === "incoming" ? "Accept" : "Cancel"}
                      </button>
                      {request.direction === "incoming" ? (
                        <button
                          className="neo-copy border-2 border-black bg-[#b7102a] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411]"
                          type="button"
                          onClick={() => stagePlayerAction(`${request.displayName} decline`)}
                        >
                          Decline
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <aside className="space-y-5">
            <Panel title="Find Players">
              <input
                className="neo-copy w-full border-2 border-black bg-[#fff9ed] px-3 py-2 text-[11px] font-bold uppercase outline-none placeholder:text-[#655f58]"
                placeholder="Search local relay..."
                value={localSearch}
                onChange={(event) => setLocalSearch(event.target.value)}
              />
              <div className="mt-4 space-y-3">
                {visibleSearchResults.length > 0 ? (
                  visibleSearchResults.map((result) => (
                    <div
                      key={result.id}
                      className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]"
                    >
                      <p className="neo-title text-2xl leading-none text-[#171411]">
                        {result.displayName}
                      </p>
                      <p className="neo-copy mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                        @{result.handle}
                      </p>
                      <p className="mt-2 text-sm leading-5 text-[#5b403f]">{result.copy}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          className="neo-copy border-2 border-black bg-[#007166] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411]"
                          type="button"
                          onClick={() => stagePlayerAction(`${result.displayName} add`)}
                        >
                          Add
                        </button>
                        <button
                          className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a] shadow-[2px_2px_0_#171411]"
                          type="button"
                          onClick={() => stagePlayerAction(`${result.displayName} block`)}
                        >
                          Block
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[11px] font-bold uppercase leading-5 text-[#655f58]">
                    No local relay matches.
                  </p>
                )}
              </div>
            </Panel>

            <Panel title="Muted Relay">
              <div className="flex items-center justify-between gap-3 border-2 border-black bg-[#f6edd8] p-3 shadow-[2px_2px_0_#171411]">
                <div className="min-w-0">
                  <p className="neo-copy truncate text-[11px] font-black uppercase text-[#171411]">
                    Static Knight
                  </p>
                  <p className="neo-copy truncate text-[9px] font-bold uppercase tracking-[0.12em] text-[#5b403f]">
                    @staticknight
                  </p>
                </div>
                <button
                  className="neo-copy shrink-0 border-2 border-black bg-[#007166] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[1px_1px_0_#171411]"
                  type="button"
                  onClick={() => stagePlayerAction("Static Knight unblock")}
                >
                  Unblock
                </button>
              </div>
            </Panel>
          </aside>
        </div>
      ) : null}

      {activeTab === "import" ? (
        <Panel title="Import Platform Friends">
          <div className="grid gap-3 md:grid-cols-3">
            {LOCAL_IMPORT_ACCOUNTS.map((account) => (
              <div
                key={account.id}
                className="border-[3px] border-black bg-[#f6edd8] p-4 shadow-[3px_3px_0_#171411]"
              >
                <p className="neo-title text-3xl leading-none text-[#171411]">{account.label}</p>
                <p className="neo-copy mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
                  {account.status}
                </p>
                <p className="neo-title mt-4 text-4xl leading-none text-[#b7102a]">
                  {account.count}
                </p>
                <p className="neo-copy mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
                  Friends queued
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
            <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
              Deduplication Strip
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {LOCAL_DEDUP_STRIP.map((item) => (
                <div
                  key={item.label}
                  className={`${item.accent} min-w-0 border-2 border-black p-2 shadow-[2px_2px_0_#171411]`}
                >
                  <p className="neo-copy break-words text-[9px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
                    {item.label}
                  </p>
                  <p className="neo-copy mt-1 break-words text-[10px] font-black uppercase leading-4 tracking-[0.1em] text-[#171411]">
                    {item.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      ) : null}

      {activeTab === "chat" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Panel title="Direct Messages">
            <div className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]">
              <select
                className="neo-copy w-full border-2 border-black bg-[#fff9ed] px-2 py-2 text-[10px] font-bold uppercase"
                value={selectedFriend.id}
                onChange={(event) => setSelectedFriendId(event.target.value)}
              >
                {LOCAL_FRIENDS.map((friend) => (
                  <option key={friend.id} value={friend.id}>
                    {friend.displayName}
                  </option>
                ))}
              </select>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                {chatMessages.map((chatMessage) => (
                  <div
                    key={chatMessage.id}
                    className={`border-2 border-black p-2 text-sm leading-5 shadow-[2px_2px_0_#171411] ${
                      chatMessage.sender === "me" ? "bg-[#8cf5e4]" : "bg-[#fff9ed]"
                    }`}
                  >
                    {chatMessage.content}
                  </div>
                ))}
              </div>
              <form className="mt-3 flex gap-2" onSubmit={submitLocalChat}>
                <input
                  className="neo-copy min-w-0 flex-1 border-2 border-black bg-[#fff9ed] px-3 text-[11px] font-bold outline-none placeholder:text-[#655f58]"
                  maxLength={2000}
                  placeholder="Write local message..."
                  value={chatText}
                  onChange={(event) => setChatText(event.target.value)}
                />
                <button
                  aria-label="Send local message"
                  className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-black bg-[#007166] text-white shadow-[2px_2px_0_#171411] disabled:opacity-50"
                  disabled={!chatText.trim()}
                  type="submit"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </Panel>

          <Panel title="Group Relay">
            <div className="space-y-3">
              {["Ranked Heat", "Late Night Co-op"].map((room, index) => (
                <div
                  key={room}
                  className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]"
                >
                  <p className="neo-title text-2xl leading-none text-[#171411]">{room}</p>
                  <p className="neo-copy mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
                    {index === 0 ? "3 players / Neon Drift" : "2 players / Phantom Arcade"}
                  </p>
                  <button
                    className="neo-copy mt-3 border-2 border-black bg-[#b7102a] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411]"
                    type="button"
                    onClick={() => stagePlayerAction(`${room} group ping`)}
                  >
                    Ping
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTab === "activity" ? (
        <ActivityTabShell
          friends={getLocalActivityFriends()}
          modeLabel="Local Activity Relay"
          onlineCount={LOCAL_FRIENDS.filter((friend) => friend.status === "online").length}
          totalFriends={LOCAL_FRIENDS.length}
          onComposerPost={(copy) => stagePlayerAction(`Activity post: ${copy.slice(0, 72)}`)}
        >
          <LocalActivityFeed items={LOCAL_ACTIVITY} />
        </ActivityTabShell>
      ) : null}

      {activeTab === "invites" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Panel title="Cross-Platform Invites">
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div
                className={`min-h-44 border-[3px] border-black shadow-[4px_4px_0_#171411] ${selectedFriend.artClass}`}
                aria-hidden="true"
              />
              <div>
                <p className="neo-copy inline-flex border-2 border-black bg-[#007166] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white">
                  Selected Friend
                </p>
                <p className="neo-title mt-3 text-4xl leading-none text-[#171411]">
                  {selectedFriend.displayName}
                </p>
                <p className="neo-copy mt-2 text-[11px] font-black uppercase leading-5 tracking-[0.12em] text-[#5b403f]">
                  {selectedFriend.platforms.join(" / ")} · {selectedFriend.signal}
                </p>
                <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={submitLocalInvite}>
                  <input
                    className="neo-copy min-w-0 flex-1 border-2 border-black bg-[#fff9ed] px-3 py-2 text-[11px] font-bold outline-none placeholder:text-[#655f58]"
                    maxLength={160}
                    placeholder="Quick invite game title..."
                    value={inviteGameTitle}
                    onChange={(event) => setInviteGameTitle(event.target.value)}
                  />
                  <button
                    className="neo-copy shrink-0 border-2 border-black bg-[#b7102a] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411] disabled:opacity-50"
                    disabled={!inviteGameTitle.trim()}
                    type="submit"
                  >
                    Invite
                  </button>
                </form>
              </div>
            </div>
          </Panel>

          <Panel title="Pending Invites">
            <div className="space-y-2">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]"
                >
                  <p className="neo-title text-2xl leading-none text-[#171411]">
                    {invite.gameTitle}
                  </p>
                  <p className="neo-copy mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
                    {invite.direction === "incoming" ? "From" : "To"} {invite.friendName} ·{" "}
                    {invite.platform}
                  </p>
                  <p className="mt-2 text-sm leading-5 text-[#5b403f]">{invite.message}</p>
                  <p className="neo-copy mt-2 inline-flex border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#171411]">
                    {invite.status}
                  </p>
                  {invite.direction === "incoming" && invite.status === "pending" ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        className="neo-copy border-2 border-black bg-[#007166] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411]"
                        type="button"
                        onClick={() => updateLocalInviteStatus(invite.id, "accepted")}
                      >
                        Accept
                      </button>
                      <button
                        className="neo-copy border-2 border-black bg-[#b7102a] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411]"
                        type="button"
                        onClick={() => updateLocalInviteStatus(invite.id, "declined")}
                      >
                        Decline
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

function LocalFriendCard({
  friend,
  isSelected,
  onChat,
  onInvite,
  onJoin,
  onSelect,
}: {
  friend: LocalFriend;
  isSelected: boolean;
  onChat: () => void;
  onInvite: () => void;
  onJoin: () => void;
  onSelect: () => void;
}) {
  const statusClass =
    friend.status === "online"
      ? "bg-[#007166] text-white"
      : friend.status === "away"
        ? "bg-[#8cf5e4] text-[#171411]"
        : "bg-[#fff9ed] text-[#171411]";

  return (
    <article
      className={`border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411] ${
        isSelected ? "outline outline-[3px] outline-offset-2 outline-[#b7102a]" : ""
      }`}
    >
      <div
        className={`h-28 border-[3px] border-black shadow-[3px_3px_0_#171411] ${friend.artClass}`}
        aria-hidden="true"
      />
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="neo-title truncate text-3xl leading-none text-[#171411]">
            {friend.displayName}
          </p>
          <p className="neo-copy mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
            @{friend.username}
          </p>
        </div>
        <p
          className={`neo-copy shrink-0 border-2 border-black px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] shadow-[1px_1px_0_#171411] ${statusClass}`}
        >
          {friend.status}
        </p>
      </div>
      <p className="neo-copy mt-3 text-[11px] font-black uppercase leading-5 tracking-[0.08em] text-[#171411]">
        {friend.gameTitle}
      </p>
      <p className="mt-1 text-sm leading-5 text-[#5b403f]">{friend.note}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {friend.platforms.map((platform) => (
          <span
            key={platform}
            className="neo-copy border-2 border-black bg-[#f6edd8] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#171411]"
          >
            {platform}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          className="neo-copy inline-flex items-center justify-center gap-1 border-2 border-black bg-[#fff9ed] px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
          type="button"
          onClick={onSelect}
        >
          <Users className="h-3 w-3" />
          Focus
        </button>
        <button
          className="neo-copy inline-flex items-center justify-center gap-1 border-2 border-black bg-[#fff9ed] px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
          type="button"
          onClick={onChat}
        >
          <MessageSquare className="h-3 w-3" />
          Chat
        </button>
        <button
          className="neo-copy inline-flex items-center justify-center gap-1 border-2 border-black bg-[#007166] px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#065e53]"
          type="button"
          onClick={onJoin}
        >
          <Gamepad2 className="h-3 w-3" />
          Smart Join
        </button>
        <button
          className="neo-copy inline-flex items-center justify-center gap-1 border-2 border-black bg-[#b7102a] px-2 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8b0c20]"
          type="button"
          onClick={onInvite}
        >
          <Send className="h-3 w-3" />
          Invite
        </button>
      </div>
    </article>
  );
}

function InviteList({
  currentUserId,
  invites,
  isMutating,
  onAccept,
  onDecline,
  profileById,
}: {
  currentUserId: string;
  invites: GameInvite[];
  isMutating: boolean;
  onAccept: (invite: GameInvite) => void;
  onDecline: (invite: GameInvite) => void;
  profileById?: Record<
    string,
    { username: string; displayName: string | null; avatarUrl: string | null }
  >;
}) {
  const pendingInvites = invites.filter((invite) => invite.status === "pending").slice(0, 5);

  if (pendingInvites.length === 0) {
    return (
      <p className="neo-copy border-2 border-dashed border-black bg-[#fff9ed] p-3 text-[11px] font-bold uppercase leading-5 text-[#655f58]">
        No pending invites.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {pendingInvites.map((invite) => {
        const isIncoming = invite.receiverId === currentUserId;
        const otherId = isIncoming ? invite.senderId : invite.receiverId;
        const profile = otherId ? profileById?.[otherId] : null;
        const label = profile?.displayName ?? profile?.username ?? null;
        const otherLabel = label ?? (otherId ? `Player ${otherId.slice(0, 8)}` : "Open Link");

        return (
          <div
            key={invite.id}
            className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]"
          >
            <p className="neo-title text-2xl leading-none text-[#171411]">{invite.gameTitle}</p>
            <p className="neo-copy mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-[#655f58]">
              {isIncoming ? `From ${otherLabel}` : `To ${otherLabel}`}
            </p>
            {invite.message ? (
              <p className="mt-2 text-sm leading-5 text-[#5b403f]">{invite.message}</p>
            ) : null}
            {isIncoming ? (
              <div className="mt-3 flex gap-2">
                <button
                  className="neo-copy border-2 border-black bg-[#007166] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411] disabled:opacity-50"
                  disabled={isMutating}
                  type="button"
                  onClick={() => onAccept(invite)}
                >
                  Accept
                </button>
                <button
                  className="neo-copy border-2 border-black bg-[#b7102a] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411] disabled:opacity-50"
                  disabled={isMutating}
                  type="button"
                  onClick={() => onDecline(invite)}
                >
                  Decline
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="border-[3px] border-black bg-[#fff9ed] px-4 py-3 shadow-[4px_4px_0_#171411]">
      <div className="flex items-center justify-center gap-2 text-[#b7102a]">
        {icon}
        <span className="neo-copy text-[10px] font-black uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className="neo-title mt-1 text-3xl leading-none text-[#171411]">{value}</p>
    </div>
  );
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="relative border-4 border-black bg-[#fff9ed] p-5 shadow-[6px_6px_0_#171411]">
      <h2 className="neo-title border-b-[3px] border-black pb-3 text-3xl leading-none text-[#171411]">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Notice({ body, title }: { body: string; title: string }) {
  return (
    <div className="border-4 border-black bg-[#fff9ed] p-6 shadow-[6px_6px_0_#171411]">
      <h2 className="neo-title text-4xl leading-none text-[#171411]">{title}</h2>
      <p className="neo-copy mt-3 text-[12px] font-bold uppercase leading-6 text-[#5b403f]">
        {body}
      </p>
    </div>
  );
}

function Status({ message, tone }: { message: string; tone: "error" | "success" }) {
  return (
    <div
      className={
        tone === "error"
          ? "neo-copy border-2 border-black bg-[#b7102a] p-4 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411]"
          : "neo-copy border-2 border-black bg-[#007166] p-4 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411]"
      }
    >
      {message}
    </div>
  );
}
