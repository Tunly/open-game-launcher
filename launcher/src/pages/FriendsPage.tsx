import { Gamepad2, Globe, Loader2, MessageSquare, Send, Shield, UserPlus, Users, Activity } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import type { FriendRequest, Friendship, GameInvite, Profile, UserPresence } from "../lib/types/profile";
import type { PlatformAccount, PlatformType } from "../lib/types/friends";

type TabKey = "friends" | "import" | "chat" | "activity" | "invites";

const TABS: Array<{ key: TabKey; label: string; icon: ReactNode }> = [
  { key: "friends", label: "Friends", icon: <Users className="h-3.5 w-3.5" /> },
  { key: "import", label: "Import", icon: <Globe className="h-3.5 w-3.5" /> },
  { key: "chat", label: "Chat", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { key: "activity", label: "Activity", icon: <Activity className="h-3.5 w-3.5" /> },
  { key: "invites", label: "Invites", icon: <Gamepad2 className="h-3.5 w-3.5" /> },
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


  const friendIds = useMemo(() => (user ? getFriendIds(friends, user.id) : []), [friends, user]);
  const onlineFriends = useMemo(
    () => friendIds.filter((friendId) => presenceByUserId[friendId]?.status === "online").length,
    [friendIds, presenceByUserId],
  );
  const friendProfileById = useMemo(() => {
    const map: Record<string, { id: string; username: string; displayName: string | null; avatarUrl: string | null }> = {};
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
        const next: Record<string, { username: string; displayName: string | null; avatarUrl: string | null }> = {};
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
            if (!current || current.room.id !== loadedThread.room.id || current.messages.some((item) => item.id === nextMessage.id)) {
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

  return (
    <div className="mx-auto w-full max-w-[1220px] px-0 py-2">
      <div className="mb-7 flex flex-col gap-4 border-b-4 border-black pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-[3px_3px_0_#171411]">
            Social
          </p>
          <h1 className="neo-title mt-3 text-[clamp(3.8rem,13vw,6.5rem)] leading-[0.82] text-[#171411]">
            Friends
          </h1>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Metric icon={<Users className="h-4 w-4" />} label="Friends" value={friends.length} />
          <Metric icon={<UserPlus className="h-4 w-4" />} label="Requests" value={requests.length} />
          <Metric icon={<Shield className="h-4 w-4" />} label="Online" value={onlineFriends} />
        </div>
      </div>

      {isAuthLoading || isLoading ? (
        <div className="grid min-h-80 place-items-center border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#171411]">
          <Loader2 className="h-8 w-8 animate-spin text-[#b7102a]" />
        </div>
      ) : !isConfigured ? (
        <Notice title="Supabase is not connected" body="Friends and requests require the public Supabase environment variables." />
      ) : !user ? (
        <Notice title="Login required" body="Sign in before managing friends." />
      ) : (
        <div className="space-y-5">
          {/* Tab Navigation */}
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
                onClick={() => switchTab(tab.key)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>

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
                      void runMutation(() => acceptFriendRequest(request.id), "Friend request accepted.")
                    }
                    onCancel={(request) =>
                      void runMutation(() => cancelFriendRequest(request.id), "Friend request withdrawn.")
                    }
                    onDecline={(request) =>
                      void runMutation(() => declineFriendRequest(request.id), "Friend request declined.")
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
                              onClick={() => void runMutation(() => sendFriendRequest(profile.id), "Friend request sent.")}
                            >
                              Add
                            </button>
                            <button
                              className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a] shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#f3c3c9] disabled:opacity-60"
                              disabled={isMutating}
                              type="button"
                              onClick={() => void runMutation(() => blockUser(profile.id), "User blocked.")}
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
                                onClick={() => void runMutation(() => unblockUser(id), "User unblocked.")}
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
                Import your friends from connected gaming platforms. Deduplication runs automatically
                (linked accounts) and via heuristic name matching.
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
                      <div className="mt-2 mb-2">
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
            <Panel title="Friend Activity Feed">
              <p className="neo-copy mb-4 text-[11px] font-bold uppercase leading-5 text-[#55504a]">
                Real-time updates from your friends: game launches, achievements, and screenshots.
              </p>
              <ActivityFeed friendIds={friendIds} />
            </Panel>
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
                    void runMutation(() => updateGameInviteStatus(invite.id, "accepted"), "Invite accepted.")
                  }
                  onDecline={(invite) =>
                    void runMutation(() => updateGameInviteStatus(invite.id, "declined"), "Invite declined.")
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
  profileById?: Record<string, { username: string; displayName: string | null; avatarUrl: string | null }>;
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
        const profile = profileById?.[otherId];
        const label = profile?.displayName ?? profile?.username ?? null;
        const otherLabel = label ?? `Player ${otherId.slice(0, 8)}`;

        return (
          <div key={invite.id} className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
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

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="border-[3px] border-black bg-[#fff9ed] px-4 py-3 shadow-[4px_4px_0_#171411]">
      <div className="flex items-center justify-center gap-2 text-[#b7102a]">
        {icon}
        <span className="neo-copy text-[10px] font-black uppercase tracking-[0.12em]">
          {label}
        </span>
      </div>
      <p className="neo-title mt-1 text-3xl leading-none text-[#171411]">
        {value}
      </p>
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
      <p className="neo-copy mt-3 text-[12px] font-bold uppercase leading-6 text-[#5b403f]">{body}</p>
    </div>
  );
}

function Status({ message, tone }: { message: string; tone: "error" | "success" }) {
  return (
    <div className={tone === "error" ? "neo-copy border-2 border-black bg-[#b7102a] p-4 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411]" : "neo-copy border-2 border-black bg-[#007166] p-4 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411]"}>
      {message}
    </div>
  );
}
