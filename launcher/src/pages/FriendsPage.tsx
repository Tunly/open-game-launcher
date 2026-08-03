import {
  Gamepad2,
  Globe,
  Loader2,
  MessageSquare,
  Send,
  Shield,
  UserPlus,
  Users,
  Activity,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";

import { FriendRequestList } from "../components/friends/FriendRequestList";
import { FriendsList } from "../components/friends/FriendsList";
import { UserSearch } from "../components/friends/UserSearch";
import { FriendImport } from "../components/friends/FriendImport";
import { GroupChatPanel } from "../components/friends/GroupChatPanel";
import { ActivityFeed } from "../components/friends/ActivityFeed";
import { CrossPlatformInvite } from "../components/friends/CrossPlatformInvite";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { getUnifiedFriendCount } from "../lib/friends-roster";
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
import { getMyFriendLinks } from "../lib/supabase/friend-links";
import {
  getMyPlatformAccounts,
  getPlatformAccountsForUser,
} from "../lib/supabase/platform-accounts";
import { postActivity } from "../lib/supabase/activity";
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
import type { FriendLink, PlatformAccount, PlatformType } from "../lib/types/friends";

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
    action: "updated their showcase",
    actor: "Arcade Witch",
    artClass: "library-art-phantom",
    comments: [
      {
        author: "Teal Shift",
        copy: "That final room belongs in the showcase.",
      },
    ],
    dayLabel: "Yesterday",
    detail: "Phantom Arcade challenge notes landed in the activity lane.",
    gameTitle: "Phantom Arcade",
    handle: "arcadewitch",
    id: "activity-arcade-witch-phantom",
    meta: "Challenge route verified",
    platform: "Steam",
    reactions: 13,
    timeLabel: "19:41",
  },
];

export function FriendsPage() {
  const auth = useCurrentUser();

  return <FriendsPageForAccount key={auth.user?.id ?? "signed-out"} auth={auth} />;
}

function FriendsPageForAccount({ auth }: { auth: ReturnType<typeof useCurrentUser> }) {
  const { isConfigured, isLoading: isAuthLoading, user } = auth;
  const accountUserId = user?.id ?? null;
  const accountRef = useRef({ active: true, userId: accountUserId });

  useLayoutEffect(() => {
    const accountInstance = { active: true, userId: accountUserId };
    accountRef.current = accountInstance;
    return () => {
      if (accountRef.current === accountInstance) {
        accountInstance.active = false;
      }
    };
  }, [accountUserId]);

  const isCurrentAccount = useCallback(
    (expectedUserId: string | null) =>
      accountRef.current.active && accountRef.current.userId === expectedUserId,
    [],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const updateSearchParams = useCallback(
    (update: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParamsRef.current);
      update(next);
      searchParamsRef.current = next;
      setSearchParams(next, { replace: true });
    },
    [setSearchParams],
  );
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
      updateSearchParams((next) => {
        if (tab === "friends") {
          next.delete("tab");
        } else {
          next.set("tab", tab);
        }
      });
    },
    [updateSearchParams],
  );
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [friendLinks, setFriendLinks] = useState<FriendLink[]>([]);
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
  const [receiverPlatforms, setReceiverPlatforms] = useState<PlatformType[]>([]);
  const [activityFeedVersion, setActivityFeedVersion] = useState(0);

  function selectFriend(friendId: string | null) {
    setThread(null);
    setSelectedFriendId(friendId);
    updateSearchParams((next) => {
      if (friendId) {
        next.set("friend", friendId);
      } else {
        next.delete("friend");
      }
    });
  }

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
    selectFriend(friendId);
    switchTab("chat");
  }

  function openFriendInvite(friendId: string) {
    selectFriend(friendId);
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
    const expectedUserId = accountUserId;
    if (!isConfigured || !expectedUserId) {
      setBlockedIds([]);
      setBlockedProfiles({});
      return;
    }
    try {
      const blocks = await getMyBlocks();
      const ids = blocks.map((block) => block.blockedId);
      if (!isCurrentAccount(expectedUserId)) return;
      setBlockedIds(ids);
      if (ids.length > 0) {
        const profiles = await getProfilesForUsers(ids).catch(() => new Map());
        if (!isCurrentAccount(expectedUserId)) return;
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
      if (!isCurrentAccount(expectedUserId)) return;
      setBlockedIds([]);
      setBlockedProfiles({});
    }
  }, [accountUserId, isConfigured, isCurrentAccount]);

  useEffect(() => {
    void refreshBlocks();
  }, [refreshBlocks]);

  const refresh = useCallback(async () => {
    const expectedUserId = accountUserId;
    if (!expectedUserId || !isCurrentAccount(expectedUserId)) return;
    const [loadedFriends, loadedRequests, loadedInvites, loadedFriendLinks] = await Promise.all([
      getFriends(expectedUserId),
      getMyFriendRequests(),
      getMyGameInvites(),
      getMyFriendLinks(),
    ]);
    if (!isCurrentAccount(expectedUserId)) return;
    setFriends(loadedFriends);
    setRequests(loadedRequests);
    setInvites(loadedInvites);
    setFriendLinks(loadedFriendLinks.filter((link) => !link.dismissed));
  }, [accountUserId, isCurrentAccount]);

  useEffect(() => {
    if (!isConfigured || !user) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    void Promise.all([refresh(), getMyPlatformAccounts().catch(() => [])])
      .then(([, platforms]) => {
        if (isMounted && isCurrentAccount(accountUserId)) setMyPlatforms(platforms);
      })
      .catch((error: unknown) => {
        if (isMounted && isCurrentAccount(accountUserId)) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (isMounted && isCurrentAccount(accountUserId)) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [accountUserId, isConfigured, isCurrentAccount, refresh, user]);

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
          if (isMounted && isCurrentAccount(accountUserId)) {
            setResults(profiles.filter((profile) => profile.id !== accountUserId));
          }
        })
        .catch((error: unknown) => {
          if (isMounted && isCurrentAccount(accountUserId)) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
          }
        })
        .finally(() => {
          if (isMounted && isCurrentAccount(accountUserId)) setIsSearching(false);
        });
    }, 250);

    return () => {
      isMounted = false;
      window.clearTimeout(timeout);
    };
  }, [accountUserId, isConfigured, isCurrentAccount, query]);

  useEffect(() => {
    if (!isConfigured || !user || friendIds.length === 0) {
      setPresenceByUserId({});
      return;
    }

    let isMounted = true;

    void getVisiblePresence(friendIds)
      .then((presences) => {
        if (!isMounted || !isCurrentAccount(accountUserId)) return;
        setPresenceByUserId(
          Object.fromEntries(presences.map((presence) => [presence.userId, presence])),
        );
      })
      .catch((error: unknown) => {
        if (isMounted && isCurrentAccount(accountUserId)) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      });

    const unsubscribe = subscribeToPresenceChanges(friendIds, (presence) => {
      if (!isMounted || !isCurrentAccount(accountUserId)) return;
      setPresenceByUserId((current) => ({ ...current, [presence.userId]: presence }));
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [accountUserId, friendIds, isConfigured, isCurrentAccount, user]);

  useEffect(() => {
    if (friendIds.length === 0) {
      setSelectedFriendId(null);
      setThread(null);
      return;
    }

    const requestedFriendId = searchParams.get("friend");
    if (requestedFriendId && friendIds.includes(requestedFriendId)) {
      if (selectedFriendId !== requestedFriendId) {
        setThread(null);
        setSelectedFriendId(requestedFriendId);
      }
      return;
    }

    if (requestedFriendId) {
      updateSearchParams((next) => next.delete("friend"));
    }

    if (!selectedFriendId || !friendIds.includes(selectedFriendId)) {
      setThread(null);
      setSelectedFriendId(friendIds[0]);
    }
  }, [friendIds, searchParams, selectedFriendId, updateSearchParams]);

  useEffect(() => {
    if (!isConfigured || !user) {
      return;
    }

    const expectedUserId = user.id;
    const unsubscribe = subscribeToGameInvites(expectedUserId, (invite) => {
      if (!isCurrentAccount(expectedUserId)) return;
      setInvites((current) => [invite, ...current.filter((item) => item.id !== invite.id)]);
    });

    return unsubscribe;
  }, [isConfigured, isCurrentAccount, user]);

  useEffect(() => {
    if (!isConfigured || !accountUserId || !selectedFriendId) {
      setThread(null);
      return;
    }

    let isMounted = true;
    let unsubscribe: (() => void) | null = null;
    const friendId = selectedFriendId;
    const expectedUserId = accountUserId;
    setThread(null);

    void getDirectThread(friendId)
      .then((loadedThread) => {
        if (!isMounted || !isCurrentAccount(expectedUserId)) {
          return;
        }

        setThread(loadedThread);
        unsubscribe = subscribeToRoomMessages(loadedThread.room.id, (nextMessage) => {
          if (!isMounted || !isCurrentAccount(expectedUserId)) return;
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
        if (isMounted && isCurrentAccount(expectedUserId)) {
          setThread(null);
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [accountUserId, isConfigured, isCurrentAccount, selectedFriendId]);

  useEffect(() => {
    if (!isConfigured || !selectedFriendId) {
      setReceiverPlatforms([]);
      return;
    }

    let isMounted = true;
    void getPlatformAccountsForUser(selectedFriendId)
      .then((accounts) => {
        if (!isMounted) return;
        setReceiverPlatforms(Array.from(new Set(accounts.map((account) => account.platform))));
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        setReceiverPlatforms([]);
        setErrorMessage(error instanceof Error ? error.message : String(error));
      });

    return () => {
      isMounted = false;
    };
  }, [isConfigured, selectedFriendId]);

  async function runMutation(action: () => Promise<unknown>, success: string) {
    const expectedUserId = accountUserId;
    if (!isCurrentAccount(expectedUserId)) return;
    setIsMutating(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      await action();
      if (!isCurrentAccount(expectedUserId)) return;
      await Promise.all([refresh(), refreshBlocks()]);
      if (!isCurrentAccount(expectedUserId)) return;
      setMessage(success);
    } catch (error) {
      if (!isCurrentAccount(expectedUserId)) return;
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      if (isCurrentAccount(expectedUserId)) setIsMutating(false);
    }
  }

  async function submitChatMessage() {
    if (!selectedFriendId || !chatText.trim()) {
      return;
    }

    const content = chatText;
    const recipientId = selectedFriendId;
    setChatText("");
    await runMutation(async () => {
      const nextMessage = await sendDirectMessage(recipientId, content);
      setThread((current) =>
        current &&
        current.room.id === nextMessage.roomId &&
        !current.messages.some((item) => item.id === nextMessage.id)
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
  const displayedFriendCount = isConfigured
    ? getUnifiedFriendCount(user?.id ?? "", friends, friendLinks)
    : LOCAL_FRIENDS.length;
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
          <p className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[11px] font-black tracking-[0.14em] text-white uppercase shadow-[3px_3px_0_#171411]">
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
                <Panel title="Friends / All Platforms">
                  <FriendsList
                    currentUserId={user.id}
                    friendLinks={friendLinks}
                    friends={friends}
                    presenceByUserId={presenceByUserId}
                    selectedFriendId={selectedFriendId}
                    onRemove={(friendship) =>
                      void runMutation(() => removeFriend(friendship.id), "Friend removed.")
                    }
                    onOpenChat={openFriendChat}
                    onOpenInvite={openFriendInvite}
                    onSelectFriend={selectFriend}
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
                      <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[12px] leading-5 font-bold text-[#655f58] uppercase">
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
                          <p className="neo-copy mt-1 text-[10px] font-black tracking-[0.12em] text-[#5b403f] uppercase">
                            @{profile.username}
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              className="neo-copy border-2 border-black bg-[#007166] px-3 py-2 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a] disabled:opacity-60"
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
                              className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black tracking-[0.12em] text-[#b7102a] uppercase shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#f3c3c9] disabled:opacity-60"
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
                      <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[12px] leading-5 font-bold text-[#655f58] uppercase">
                        Search by username or display name.
                      </p>
                    )}
                  </div>
                  {blockedIds.length > 0 ? (
                    <div className="mt-5 border-t-2 border-black pt-4">
                      <p className="neo-copy mb-2 text-[10px] font-black tracking-[0.12em] text-[#171411] uppercase">
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
                                <p className="neo-copy truncate text-[11px] font-black text-[#171411] uppercase">
                                  {label ?? `Player ${id.slice(0, 8)}`}
                                </p>
                                {profile?.username ? (
                                  <p className="neo-copy truncate text-[9px] font-bold tracking-[0.12em] text-[#5b403f] uppercase">
                                    @{profile.username}
                                  </p>
                                ) : null}
                              </div>
                              <button
                                className="neo-copy shrink-0 border-2 border-black bg-[#007166] px-2 py-1 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[1px_1px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#065e53] disabled:opacity-60"
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
              <p className="neo-copy mb-4 text-[11px] leading-5 font-bold text-[#55504a] uppercase">
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
                      <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#171411] uppercase">
                        Direct Message
                      </p>
                    </div>
                    {/* Friend selector */}
                    {friendIds.length > 0 && (
                      <div className="mt-2 mb-2">
                        <select
                          className="neo-copy w-full border-2 border-black bg-[#fff9ed] px-2 py-1.5 text-[10px] font-bold"
                          value={selectedFriendId ?? ""}
                          onChange={(event) => selectFriend(event.target.value || null)}
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
                        <p className="neo-copy border-2 border-dashed border-black bg-[#fff9ed] p-3 text-[11px] leading-5 font-bold text-[#655f58] uppercase">
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
                setErrorMessage(null);
                return postActivity("status", {
                  gameId: null,
                  gameTitle: null,
                  metadata: { text: copy },
                  visibility: "friends_only",
                })
                  .then(() => {
                    setMessage("Status posted to friend activity.");
                    setActivityFeedVersion((version) => version + 1);
                  })
                  .catch((error: unknown) => {
                    setErrorMessage(error instanceof Error ? error.message : String(error));
                    throw error;
                  });
              }}
              onSwitchTab={switchTab}
            >
              <ActivityFeed friendIds={friendIds} key={activityFeedVersion} />
              {errorMessage ? <Status tone="error" message={errorMessage} /> : null}
              {message ? <Status tone="success" message={message} /> : null}
            </ActivityTabShell>
          )}

          {activeTab === "invites" && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <Panel title="Cross-Platform Invites">
                <CrossPlatformInvite
                  currentUserId={user.id}
                  receiverPlatforms={receiverPlatforms}
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
                      className="neo-copy h-10 shrink-0 border-2 border-black bg-[#b7102a] px-3 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#171411] disabled:opacity-50"
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
  composerEnabled = true,
  friends,
  modeLabel,
  onComposerPost,
  onSwitchTab,
  onlineCount,
  totalFriends,
}: {
  children: ReactNode;
  composerEnabled?: boolean;
  friends: ActivitySidebarFriend[];
  modeLabel: string;
  onComposerPost?: (copy: string) => Promise<void> | void;
  onSwitchTab?: (tab: TabKey) => void;
  onlineCount: number;
  totalFriends: number;
}) {
  const [composerText, setComposerText] = useState("");
  const [composerBusy, setComposerBusy] = useState(false);
  const spotlightFriend =
    friends.find((friend) => friend.status === "online" || friend.status === "busy") ?? friends[0];
  async function submitComposer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const copy = composerText.trim();
    if (!copy || !onComposerPost || composerBusy) return;
    setComposerBusy(true);
    try {
      await onComposerPost(copy);
      setComposerText("");
    } finally {
      setComposerBusy(false);
    }
  }

  return (
    <section
      aria-label="Friend activity tab"
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_318px]"
    >
      <div className="min-w-0">
        <section className="border-[5px] border-black bg-[#f5eedf] shadow-[6px_6px_0_#171411]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-[5px] border-black bg-[#171411] px-4 py-3 text-[#fff9ed]">
            <div className="min-w-0">
              <h2 className="neo-title text-4xl leading-none text-[#fff9ed]">Friend Activity</h2>
              <p className="neo-copy mt-1 text-[10px] leading-4 font-black text-[#8cf5e4] uppercase">
                {modeLabel}
              </p>
            </div>
          </div>

          <div className="border-b-[5px] border-black bg-[#efe6d4] p-3">
            {composerEnabled ? (
              <form
                aria-label="Friend activity status composer"
                className="grid gap-3 sm:grid-cols-[48px_minmax(0,1fr)]"
                onSubmit={(event) => void submitComposer(event)}
              >
                <ActivityAvatar name="OG" tone="red" />
                <div className="min-w-0">
                  <label className="sr-only" htmlFor="friend-activity-status">
                    Post a status to your friends
                  </label>
                  <textarea
                    className="neo-copy min-h-16 w-full resize-none border-[3px] border-black bg-[#fff9ed] px-3 py-2 text-[11px] leading-5 font-black text-[#171411] uppercase shadow-[3px_3px_0_#171411] outline-none placeholder:text-[#655f58] focus:bg-[#8cf5e4]"
                    disabled={composerBusy}
                    id="friend-activity-status"
                    maxLength={240}
                    placeholder="Post a status to your friends..."
                    value={composerText}
                    onChange={(event) => setComposerText(event.target.value)}
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      className="neo-copy inline-flex h-9 items-center border-[3px] border-black bg-[#b7102a] px-5 text-[10px] font-black text-white uppercase shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#087d6d] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
                      disabled={!composerText.trim() || composerBusy}
                      type="submit"
                    >
                      {composerBusy ? "Posting..." : "Post Status"}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <p className="neo-copy border-[3px] border-black bg-[#fff9ed] p-3 text-[10px] leading-5 font-black text-[#5b403f] uppercase shadow-[3px_3px_0_#171411]">
                Sign in to post activity. Local preview entries are read-only and are never saved.
              </p>
            )}
          </div>

          <div className="grid gap-3 border-b-[5px] border-black bg-[#fff9ed] p-3 sm:grid-cols-3">
            <ActivityMiniStat label="Online" value={onlineCount} />
            <ActivityMiniStat label="Friends" value={totalFriends} />
            <ActivityMiniStat
              label="Spotlight"
              value={spotlightFriend ? spotlightFriend.status : "idle"}
            />
          </div>

          <div className="bg-[#f5eedf] p-3">{children}</div>
        </section>
      </div>

      <aside className="space-y-3">
        <section className="border-4 border-black bg-[#fff9ed] shadow-[5px_5px_0_#171411]">
          <div className="border-b-4 border-black bg-[#171411] p-3 text-[#fff9ed]">
            <h3 className="neo-title text-3xl leading-none">Welcome to the OG Friends</h3>
            <p className="neo-copy mt-2 text-[9px] leading-4 font-black text-[#8cf5e4] uppercase">
              Real launcher status posts and provider activity are grouped in one feed.
            </p>
          </div>
          <div className="grid gap-2 p-3">
            <ActivitySidebarButton
              icon={<Users aria-hidden="true" className="h-4 w-4" />}
              label="View Friends List"
              meta={`${onlineCount} of ${totalFriends} online`}
              onClick={() => onSwitchTab?.("friends")}
            />
            <ActivitySidebarButton
              icon={<UserPlus aria-hidden="true" className="h-4 w-4" />}
              label="Add Friends"
              meta="Search launcher accounts"
              onClick={() => onSwitchTab?.("friends")}
            />
            <ActivitySidebarButton
              icon={<Shield aria-hidden="true" className="h-4 w-4" />}
              label="Import Provider Friends"
              meta="Steam, Epic, and GOG"
              onClick={() => onSwitchTab?.("import")}
            />
          </div>
        </section>

        <section className="border-4 border-black bg-[#fff9ed] p-3 shadow-[5px_5px_0_#171411]">
          <div className="flex items-center justify-between gap-3 border-b-[3px] border-black pb-3">
            <h3 className="neo-title text-3xl leading-none text-[#171411]">Friends Online</h3>
            <span className="neo-copy border-2 border-black bg-[#087d6d] px-2 py-1 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#171411]">
              {onlineCount}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {friends.length > 0 ? (
              friends.map((friend) => <ActivityFriendRow friend={friend} key={friend.id} />)
            ) : (
              <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[11px] leading-5 font-bold text-[#655f58] uppercase">
                Add friends to fill the activity rail.
              </p>
            )}
          </div>
        </section>

        <section className="border-4 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[5px_5px_0_#171411]">
          <h3 className="neo-title border-b-2 border-[#fff9ed] pb-2 text-3xl leading-none">
            Upcoming Events
          </h3>
          <div className="mt-3 space-y-2">
            {["No events in the next 30 days", "Group announcements: none"].map((event) => (
              <p
                className="neo-copy border-2 border-[#fff9ed] bg-[#24201c] px-2 py-2 text-[9px] leading-4 font-black text-[#f5eedf] uppercase"
                key={event}
              >
                {event}
              </p>
            ))}
          </div>
        </section>
      </aside>
    </section>
  );
}

function ActivityMiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border-[3px] border-black bg-[#f5eedf] px-3 py-2 shadow-[3px_3px_0_#171411]">
      <p className="neo-title text-3xl leading-none text-[#171411]">{value}</p>
      <p className="neo-copy text-[8px] font-black text-[#5b403f] uppercase">{label}</p>
    </div>
  );
}

function ActivityAvatar({ name, tone }: { name: string; tone: "ink" | "red" | "teal" }) {
  const toneClassName =
    tone === "red"
      ? "bg-[#b7102a] text-white"
      : tone === "teal"
        ? "bg-[#8cf5e4] text-[#171411]"
        : "bg-[#171411] text-[#fff9ed]";

  return (
    <div
      className={`neo-title flex h-12 w-12 shrink-0 items-center justify-center border-[3px] border-black text-lg leading-none shadow-[3px_3px_0_#171411] ${toneClassName}`}
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function ActivitySidebarButton({
  icon,
  label,
  meta,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      className="grid grid-cols-[34px_minmax(0,1fr)] items-center gap-2 border-2 border-black bg-[#f6edd8] p-2 text-left shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
      type="button"
      onClick={onClick}
    >
      <span className="flex h-8 w-8 items-center justify-center border-2 border-black bg-[#fff9ed] text-[#b7102a]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="neo-copy block truncate text-[10px] font-black text-[#171411] uppercase">
          {label}
        </span>
        <span className="neo-copy block truncate text-[8px] font-black text-[#5b403f] uppercase">
          {meta}
        </span>
      </span>
    </button>
  );
}

function ActivityFriendRow({ friend }: { friend: ActivitySidebarFriend }) {
  return (
    <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-2 border-2 border-black bg-[#f6edd8] p-2 shadow-[2px_2px_0_#171411]">
      <ActivityAvatar name={friend.name} tone={friend.status === "away" ? "teal" : "ink"} />
      <div className="min-w-0">
        <p className="neo-copy truncate text-[10px] font-black text-[#171411] uppercase">
          {friend.name}
        </p>
        <p className="neo-copy truncate text-[9px] font-bold text-[#5b403f] uppercase">
          {friend.detail}
        </p>
        <p className={activityStatusClassName(friend.status)}>{friend.status}</p>
      </div>
    </div>
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
    <div className="space-y-3">
      {items.map((item, index) => {
        const previousDay = index > 0 ? items[index - 1].dayLabel : null;
        const progress = Math.min(92, 34 + item.reactions * 3);

        return (
          <div className="space-y-3" key={item.id}>
            {item.dayLabel !== previousDay ? <ActivityDateDivider label={item.dayLabel} /> : null}
            <article className="border-[3px] border-black bg-[#fff9ed] shadow-[3px_3px_0_#171411]">
              <div className="grid gap-3 border-b-[3px] border-black bg-[#f6edd8] p-3 sm:grid-cols-[48px_minmax(0,1fr)_auto]">
                <ActivityAvatar name={item.actor} tone="ink" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="neo-copy text-[11px] font-black tracking-[0.08em] text-[#171411] uppercase">
                      {item.actor}
                    </p>
                    <p className="neo-copy text-[10px] font-black text-[#655f58] uppercase">
                      @{item.handle} / {item.timeLabel}
                    </p>
                  </div>
                  <p className="mt-1 text-sm leading-5 font-bold text-[#5b403f]">{item.action}</p>
                </div>
                <span className="neo-copy h-fit shrink-0 border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[9px] font-black tracking-[0.12em] uppercase shadow-[1px_1px_0_#171411]">
                  {item.platform}
                </span>
              </div>

              <div className="grid gap-3 p-3 lg:grid-cols-[minmax(190px,280px)_minmax(0,1fr)]">
                <div
                  aria-label={`${item.gameTitle} activity artwork`}
                  className={`min-h-36 border-[3px] border-black shadow-[3px_3px_0_#171411] ${item.artClass}`}
                  role="img"
                >
                  <div className="flex h-full min-h-36 items-end p-3">
                    <span className="neo-copy border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black text-[#8cf5e4] uppercase shadow-[2px_2px_0_#b7102a]">
                      {item.gameTitle}
                    </span>
                  </div>
                </div>
                <div className="min-w-0 border-[3px] border-black bg-[#f6edd8] p-3 shadow-[2px_2px_0_#171411]">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="neo-title truncate text-4xl leading-none text-[#171411]">
                        {item.gameTitle}
                      </p>
                      <p className="neo-copy mt-2 text-[10px] leading-5 font-black text-[#b7102a] uppercase">
                        {item.meta}
                      </p>
                    </div>
                    <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black text-[#171411] uppercase">
                      Activity Progress
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-5 font-bold text-[#5b403f]">{item.detail}</p>
                  <ActivityProgressBar value={progress} />
                  <p className="neo-copy mt-2 text-[9px] font-black text-[#5b403f] uppercase">
                    {item.reactions} ratings // {Math.max(1, Math.round(progress / 12))} feed
                    signals
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t-[3px] border-black bg-[#efe6d4] px-3 py-2">
                <span className="neo-copy text-[9px] font-black text-[#5b403f] uppercase">
                  Preview record // {item.timeLabel} // {item.platform}
                </span>
              </div>

              <div className="space-y-2 p-3">
                {item.comments.map((comment) => (
                  <div
                    key={`${item.id}-${comment.author}`}
                    className="border-2 border-black bg-[#f6edd8] p-2 shadow-[1px_1px_0_#171411]"
                  >
                    <p className="neo-copy text-[9px] font-black tracking-[0.12em] text-[#b7102a] uppercase">
                      {comment.author}
                    </p>
                    <p className="mt-1 text-sm leading-5 font-bold text-[#5b403f]">
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

function ActivityDateDivider({ label }: { label: string }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
      <span className="neo-copy border-2 border-black bg-[#171411] px-3 py-1 text-[10px] font-black tracking-[0.14em] text-[#fff9ed] uppercase shadow-[2px_2px_0_#b7102a]">
        {label}
      </span>
      <span className="h-[3px] bg-[#171411]" aria-hidden="true" />
    </div>
  );
}

function ActivityProgressBar({ value }: { value: number }) {
  return (
    <div className="mt-3 h-5 border-2 border-black bg-[#fff9ed] p-0.5">
      <div
        aria-hidden="true"
        className="h-full border-r-2 border-black bg-[#087d6d]"
        style={{ width: `${Math.max(8, Math.min(100, value))}%` }}
      />
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
          className={`neo-copy flex items-center gap-1.5 border-2 border-black px-3 py-2 text-[10px] font-black tracking-[0.1em] uppercase shadow-[2px_2px_0_#171411] transition ${
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
  const [localFriends, setLocalFriends] = useState<LocalFriend[]>(LOCAL_FRIENDS);
  const [localRequests, setLocalRequests] = useState<LocalRequest[]>(LOCAL_REQUESTS);
  const [blockedFriendIds, setBlockedFriendIds] = useState<string[]>(["static-knight"]);
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
    localFriends.find((friend) => friend.id === selectedFriendId) ?? localFriends[0];
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

  function updateLocalRequest(request: LocalRequest, action: "accept" | "decline" | "cancel") {
    setLocalRequests((current) => current.filter((item) => item.id !== request.id));
    if (action === "accept") {
      const friend: LocalFriend = {
        id: request.id,
        artClass: "library-art-mech",
        displayName: request.displayName,
        gameTitle: "Open to play",
        note: "Added from the local relay preview.",
        platforms: ["OG-Launcher"],
        signal: "New friend",
        status: "offline",
        username: request.username,
      };
      setLocalFriends((current) =>
        current.some((item) => item.id === friend.id) ? current : [...current, friend],
      );
      setSelectedFriendId(friend.id);
    }
    setLocalMessage(
      action === "accept"
        ? `${request.displayName} added to your local roster.`
        : `${request.displayName} request ${action}ed locally.`,
    );
  }

  function toggleLocalBlock(id: string, label: string) {
    const isBlocked = blockedFriendIds.includes(id);
    setBlockedFriendIds((current) =>
      isBlocked ? current.filter((item) => item !== id) : [...current, id],
    );
    setLocalMessage(`${label} ${isBlocked ? "unblocked" : "blocked"} locally.`);
  }

  function stagePlayerAction(label: string) {
    setLocalMessage(`${label}. Changes are local because Supabase is not configured.`);
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
          <p className="neo-copy inline-flex border-2 border-black bg-[#007166] px-3 py-1 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#171411]">
            Local Relay Preview
          </p>
          <h2 className="neo-title mt-3 text-4xl leading-none text-[#171411]">
            Offline Social Board
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-[12px] leading-6 font-bold text-[#5b403f] uppercase">
            Friends, chat, imports, activity, and invites stay usable as a launcher preview while
            the public Supabase keys are absent.
          </p>
        </div>
        <div className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#171411] uppercase">
            Relay Signal
          </p>
          <p className="neo-title mt-2 text-3xl leading-none text-[#b7102a]">Local Only</p>
          <p className="neo-copy mt-2 text-[11px] leading-5 font-bold text-[#5b403f] uppercase">
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
                {localFriends.map((friend) => (
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
                {localRequests.map((request) => (
                  <div
                    key={request.id}
                    className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]"
                  >
                    <p className="neo-copy inline-flex border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black tracking-[0.12em] text-[#171411] uppercase">
                      {request.direction === "incoming" ? "Incoming" : "Outgoing"}
                    </p>
                    <p className="neo-title mt-3 text-3xl leading-none text-[#171411]">
                      {request.displayName}
                    </p>
                    <p className="neo-copy mt-1 text-[10px] font-black tracking-[0.12em] text-[#655f58] uppercase">
                      @{request.username}
                    </p>
                    <p className="mt-3 text-sm leading-5 text-[#5b403f]">{request.copy}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="neo-copy border-2 border-black bg-[#007166] px-3 py-2 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#171411]"
                        type="button"
                        onClick={() =>
                          updateLocalRequest(
                            request,
                            request.direction === "incoming" ? "accept" : "cancel",
                          )
                        }
                      >
                        {request.direction === "incoming" ? "Accept" : "Cancel"}
                      </button>
                      {request.direction === "incoming" ? (
                        <button
                          className="neo-copy border-2 border-black bg-[#b7102a] px-3 py-2 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#171411]"
                          type="button"
                          onClick={() => updateLocalRequest(request, "decline")}
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
                      <p className="neo-copy mt-1 text-[10px] font-black tracking-[0.12em] text-[#5b403f] uppercase">
                        @{result.handle}
                      </p>
                      <p className="mt-2 text-sm leading-5 text-[#5b403f]">{result.copy}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          className="neo-copy border-2 border-black bg-[#007166] px-3 py-2 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#171411]"
                          type="button"
                          onClick={() => {
                            const friend: LocalFriend = {
                              id: result.id,
                              artClass: "library-art-tokyo",
                              displayName: result.displayName,
                              gameTitle: "Ready to connect",
                              note: "Added from local player search.",
                              platforms: ["OG-Launcher"],
                              signal: "New friend",
                              status: "offline",
                              username: result.handle,
                            };
                            setLocalFriends((current) =>
                              current.some((item) => item.id === friend.id)
                                ? current
                                : [...current, friend],
                            );
                            setLocalMessage(`${result.displayName} added to your local roster.`);
                          }}
                        >
                          Add
                        </button>
                        <button
                          className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black tracking-[0.12em] text-[#b7102a] uppercase shadow-[2px_2px_0_#171411]"
                          type="button"
                          onClick={() => toggleLocalBlock(result.id, result.displayName)}
                        >
                          Block
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[11px] leading-5 font-bold text-[#655f58] uppercase">
                    No local relay matches.
                  </p>
                )}
              </div>
            </Panel>

            <Panel title="Muted Relay">
              {blockedFriendIds.includes("static-knight") ? (
                <div className="flex items-center justify-between gap-3 border-2 border-black bg-[#f6edd8] p-3 shadow-[2px_2px_0_#171411]">
                  <div className="min-w-0">
                    <p className="neo-copy truncate text-[11px] font-black text-[#171411] uppercase">
                      Static Knight
                    </p>
                    <p className="neo-copy truncate text-[9px] font-bold tracking-[0.12em] text-[#5b403f] uppercase">
                      @staticknight
                    </p>
                  </div>
                  <button
                    className="neo-copy shrink-0 border-2 border-black bg-[#007166] px-2 py-1 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[1px_1px_0_#171411]"
                    type="button"
                    onClick={() => toggleLocalBlock("static-knight", "Static Knight")}
                  >
                    Unblock
                  </button>
                </div>
              ) : (
                <p className="neo-copy border-2 border-dashed border-black bg-[#fff9ed] p-3 text-[11px] font-bold text-[#655f58] uppercase">
                  No muted players.
                </p>
              )}
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
                <p className="neo-copy mt-1 text-[10px] font-black tracking-[0.12em] text-[#655f58] uppercase">
                  {account.status}
                </p>
                <p className="neo-title mt-4 text-4xl leading-none text-[#b7102a]">
                  {account.count}
                </p>
                <p className="neo-copy mt-1 text-[10px] font-black tracking-[0.12em] text-[#171411] uppercase">
                  Friends queued
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 border-[3px] border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
            <p className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#171411] uppercase">
              Deduplication Strip
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {LOCAL_DEDUP_STRIP.map((item) => (
                <div
                  key={item.label}
                  className={`${item.accent} min-w-0 border-2 border-black p-2 shadow-[2px_2px_0_#171411]`}
                >
                  <p className="neo-copy text-[9px] font-black tracking-[0.1em] break-words text-[#5b403f] uppercase">
                    {item.label}
                  </p>
                  <p className="neo-copy mt-1 text-[10px] leading-4 font-black tracking-[0.1em] break-words text-[#171411] uppercase">
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
                {localFriends.map((friend) => (
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
                  <p className="neo-copy mt-1 text-[10px] font-black tracking-[0.12em] text-[#655f58] uppercase">
                    {index === 0 ? "3 players / Neon Drift" : "2 players / Phantom Arcade"}
                  </p>
                  <button
                    className="neo-copy mt-3 border-2 border-black bg-[#b7102a] px-3 py-2 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#171411]"
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
          composerEnabled={false}
          friends={getLocalActivityFriends()}
          modeLabel="Local Activity Relay"
          onlineCount={localFriends.filter((friend) => friend.status === "online").length}
          totalFriends={localFriends.length}
          onSwitchTab={onSwitchTab}
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
                <p className="neo-copy inline-flex border-2 border-black bg-[#007166] px-2 py-1 text-[9px] font-black tracking-[0.12em] text-white uppercase">
                  Selected Friend
                </p>
                <p className="neo-title mt-3 text-4xl leading-none text-[#171411]">
                  {selectedFriend.displayName}
                </p>
                <p className="neo-copy mt-2 text-[11px] leading-5 font-black tracking-[0.12em] text-[#5b403f] uppercase">
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
                    className="neo-copy shrink-0 border-2 border-black bg-[#b7102a] px-3 py-2 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#171411] disabled:opacity-50"
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
                  <p className="neo-copy mt-1 text-[10px] font-black tracking-[0.12em] text-[#655f58] uppercase">
                    {invite.direction === "incoming" ? "From" : "To"} {invite.friendName} ·{" "}
                    {invite.platform}
                  </p>
                  <p className="mt-2 text-sm leading-5 text-[#5b403f]">{invite.message}</p>
                  <p className="neo-copy mt-2 inline-flex border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[9px] font-black tracking-[0.12em] text-[#171411] uppercase">
                    {invite.status}
                  </p>
                  {invite.direction === "incoming" && invite.status === "pending" ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        className="neo-copy border-2 border-black bg-[#007166] px-3 py-2 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#171411]"
                        type="button"
                        onClick={() => updateLocalInviteStatus(invite.id, "accepted")}
                      >
                        Accept
                      </button>
                      <button
                        className="neo-copy border-2 border-black bg-[#b7102a] px-3 py-2 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#171411]"
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
          <p className="neo-copy mt-1 truncate text-[10px] font-black tracking-[0.12em] text-[#655f58] uppercase">
            @{friend.username}
          </p>
        </div>
        <p
          className={`neo-copy shrink-0 border-2 border-black px-2 py-1 text-[9px] font-black tracking-[0.12em] uppercase shadow-[1px_1px_0_#171411] ${statusClass}`}
        >
          {friend.status}
        </p>
      </div>
      <p className="neo-copy mt-3 text-[11px] leading-5 font-black tracking-[0.08em] text-[#171411] uppercase">
        {friend.gameTitle}
      </p>
      <p className="mt-1 text-sm leading-5 text-[#5b403f]">{friend.note}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {friend.platforms.map((platform) => (
          <span
            key={platform}
            className="neo-copy border-2 border-black bg-[#f6edd8] px-2 py-1 text-[9px] font-black tracking-[0.12em] text-[#171411] uppercase"
          >
            {platform}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          className="neo-copy inline-flex items-center justify-center gap-1 border-2 border-black bg-[#fff9ed] px-2 py-2 text-[10px] font-black tracking-[0.12em] text-[#171411] uppercase shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
          type="button"
          onClick={onSelect}
        >
          <Users className="h-3 w-3" />
          Focus
        </button>
        <button
          className="neo-copy inline-flex items-center justify-center gap-1 border-2 border-black bg-[#fff9ed] px-2 py-2 text-[10px] font-black tracking-[0.12em] text-[#171411] uppercase shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
          type="button"
          onClick={onChat}
        >
          <MessageSquare className="h-3 w-3" />
          Chat
        </button>
        <button
          className="neo-copy inline-flex items-center justify-center gap-1 border-2 border-black bg-[#007166] px-2 py-2 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#065e53]"
          type="button"
          onClick={onJoin}
        >
          <Gamepad2 className="h-3 w-3" />
          Smart Join
        </button>
        <button
          className="neo-copy inline-flex items-center justify-center gap-1 border-2 border-black bg-[#b7102a] px-2 py-2 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8b0c20]"
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
      <p className="neo-copy border-2 border-dashed border-black bg-[#fff9ed] p-3 text-[11px] leading-5 font-bold text-[#655f58] uppercase">
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
            <p className="neo-copy mt-1 truncate text-[10px] font-black tracking-[0.12em] text-[#655f58] uppercase">
              {isIncoming ? `From ${otherLabel}` : `To ${otherLabel}`}
            </p>
            {invite.message ? (
              <p className="mt-2 text-sm leading-5 text-[#5b403f]">{invite.message}</p>
            ) : null}
            {isIncoming ? (
              <div className="mt-3 flex gap-2">
                <button
                  className="neo-copy border-2 border-black bg-[#007166] px-3 py-2 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#171411] disabled:opacity-50"
                  disabled={isMutating}
                  type="button"
                  onClick={() => onAccept(invite)}
                >
                  Accept
                </button>
                <button
                  className="neo-copy border-2 border-black bg-[#b7102a] px-3 py-2 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#171411] disabled:opacity-50"
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
        <span className="neo-copy text-[10px] font-black tracking-[0.12em] uppercase">{label}</span>
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
      <p className="neo-copy mt-3 text-[12px] leading-6 font-bold text-[#5b403f] uppercase">
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
          ? "neo-copy border-2 border-black bg-[#b7102a] p-4 text-[11px] font-black tracking-[0.1em] text-white uppercase shadow-[3px_3px_0_#171411]"
          : "neo-copy border-2 border-black bg-[#007166] p-4 text-[11px] font-black tracking-[0.1em] text-white uppercase shadow-[3px_3px_0_#171411]"
      }
    >
      {message}
    </div>
  );
}
