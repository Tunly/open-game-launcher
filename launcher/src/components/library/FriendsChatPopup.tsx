import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  MessageSquare,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useCurrentUser } from "../../hooks/useCurrentUser";
import {
  getPresencePlatformLabel,
  getVisiblePresence,
  subscribeToPresenceChanges,
} from "../../lib/supabase/presence";
import { getFriends } from "../../lib/supabase/profile";
import { getMyGroupChats, type GroupChatInfo } from "../../lib/supabase/social";
import type { Friendship, UserPresence } from "../../lib/types/profile";

type SocialTab = "friends" | "chat";

interface FriendsChatPopupProps {
  onClose: () => void;
  onOpenSocial: (tab: SocialTab, friendId?: string) => void;
}

interface RosterItem {
  avatarUrl: string | null;
  currentGameTitle: string | null;
  detail: string;
  displayName: string;
  id: string;
  meta: string;
  status: UserPresence["status"];
  username: string;
}

const LOCAL_ROSTER: RosterItem[] = [
  {
    avatarUrl: null,
    currentGameTitle: "Neon Drift",
    detail: "Ranked queue open",
    displayName: "Packet Ghost",
    id: "packet-ghost",
    meta: "Steam // party ready",
    status: "online",
    username: "packetghost",
  },
  {
    avatarUrl: null,
    currentGameTitle: null,
    detail: "Workbench relay",
    displayName: "Teal Shift",
    id: "teal-shift",
    meta: "Away // GOG + Epic",
    status: "away",
    username: "tealshift",
  },
  {
    avatarUrl: null,
    currentGameTitle: null,
    detail: "Last local session synced",
    displayName: "Arcade Witch",
    id: "arcade-witch",
    meta: "Offline // 2h ago",
    status: "offline",
    username: "arcadewitch",
  },
];

const LOCAL_GROUPS: GroupChatInfo[] = [
  {
    memberCount: 3,
    room: {
      createdAt: "",
      createdBy: "",
      id: "ranked-heat",
      name: "Ranked Heat",
      type: "group",
      updatedAt: "",
    },
  },
  {
    memberCount: 2,
    room: {
      createdAt: "",
      createdBy: "",
      id: "late-night-coop",
      name: "Late Night Co-op",
      type: "group",
      updatedAt: "",
    },
  },
];

const ACTIVE_STATUSES = new Set<UserPresence["status"]>(["online", "away", "busy"]);

export function FriendsChatPopup({ onClose, onOpenSocial }: FriendsChatPopupProps) {
  const { isConfigured, isLoading: isAuthLoading, user } = useCurrentUser();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [groups, setGroups] = useState<GroupChatInfo[]>([]);
  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, UserPresence>>({});
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(isConfigured && Boolean(user));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [areGroupsOpen, setAreGroupsOpen] = useState(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setErrorMessage(null);
    setFriends([]);
    setGroups([]);
    setPresenceByUserId({});

    if (!isConfigured || !userId) {
      setIsLoading(false);
      return;
    }

    let active = true;
    let unsubscribePresence: () => void = () => undefined;
    setIsLoading(true);

    void (async () => {
      try {
        const loadedFriends = await getFriends(userId);
        const friendIds = loadedFriends.map((friendship) =>
          friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId,
        );
        const [loadedPresence, loadedGroups] = await Promise.all([
          getVisiblePresence(friendIds).catch(() => []),
          getMyGroupChats().catch(() => []),
        ]);

        if (!active) return;

        setFriends(loadedFriends);
        setGroups(loadedGroups);
        setPresenceByUserId(
          Object.fromEntries(loadedPresence.map((presence) => [presence.userId, presence])),
        );

        unsubscribePresence = subscribeToPresenceChanges(friendIds, (presence) => {
          if (!active) return;
          setPresenceByUserId((current) => ({
            ...current,
            [presence.userId]: presence,
          }));
        });
      } catch (error: unknown) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      unsubscribePresence();
    };
  }, [isConfigured, userId]);

  const account = getAccountIdentity(user);
  const roster = useMemo(() => {
    if (!isConfigured) {
      return LOCAL_ROSTER;
    }

    if (!userId) {
      return [];
    }

    return friends
      .map((friendship): RosterItem => {
        const friendId =
          friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId;
        const profile = friendship.profile;
        const presence = presenceByUserId[friendId];
        const status =
          presence?.status === "invisible" ? "offline" : (presence?.status ?? "offline");
        const platformLabel = getPresencePlatformLabel(
          presence?.platform,
          presence?.platformSource,
        );

        return {
          avatarUrl: profile?.avatarUrl ?? null,
          currentGameTitle: presence?.currentGameTitle ?? null,
          detail:
            presence?.customStatus ??
            (presence?.currentGameTitle
              ? `Playing ${presence.currentGameTitle}`
              : status === "offline"
                ? "No active launcher signal"
                : formatStatus(status)),
          displayName:
            profile?.displayName ?? profile?.username ?? `Player ${friendId.slice(0, 8)}`,
          id: friendId,
          meta:
            status === "offline"
              ? formatLastSeen(presence)
              : [formatStatus(status), platformLabel].filter(Boolean).join(" // "),
          status,
          username: profile?.username ?? friendId.slice(0, 8),
        };
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [friends, isConfigured, presenceByUserId, userId]);

  const filteredRoster = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return roster;
    }

    return roster.filter((friend) =>
      [
        friend.displayName,
        friend.username,
        friend.currentGameTitle ?? "",
        friend.detail,
        friend.meta,
      ].some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [query, roster]);

  const playingFriends = filteredRoster.filter(
    (friend) => friend.currentGameTitle && ACTIVE_STATUSES.has(friend.status),
  );
  const onlineFriends = filteredRoster.filter(
    (friend) => !friend.currentGameTitle && ACTIVE_STATUSES.has(friend.status),
  );
  const offlineFriends = filteredRoster.filter((friend) => !ACTIVE_STATUSES.has(friend.status));
  const displayedGroups = isConfigured ? groups : LOCAL_GROUPS;

  function openSocial(tab: SocialTab, friendId?: string) {
    onClose();
    onOpenSocial(tab, friendId);
  }

  return (
    <section
      aria-label="Friends and chat"
      className="neo-dots fixed right-2 bottom-12 left-2 z-[75] flex max-h-[calc(100vh-6rem)] min-h-0 flex-col overflow-hidden border-4 border-black bg-[#fff9ed] shadow-[8px_8px_0_#171411] sm:right-4 sm:bottom-14 sm:left-auto sm:h-[min(700px,calc(100vh-7rem))] sm:w-[400px]"
      id="library-friends-chat-popup"
      role="dialog"
    >
      <div className="flex items-center justify-between gap-3 border-b-4 border-black bg-[#b7102a] px-3 py-2 text-white">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black tracking-[0.16em] text-[#fff9ed] uppercase">
            OG Social Relay
          </p>
          <h2 className="neo-title truncate text-2xl leading-none">Friends // Chat</h2>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            aria-label="Open full friends page"
            className="grid h-8 w-8 place-items-center border-2 border-black bg-[#fff9ed] text-[#171411] shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
            type="button"
            onClick={() => openSocial("friends")}
          >
            <ExternalLink className="h-4 w-4" />
          </button>
          <button
            ref={closeButtonRef}
            aria-label="Close friends and chat"
            className="grid h-8 w-8 place-items-center border-2 border-black bg-[#fff9ed] text-[#171411] shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
            type="button"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="border-b-4 border-black bg-[#f6edd8] p-3">
        <div className="flex min-w-0 items-center gap-3">
          <SocialAvatar
            artClass="library-art-tokyo"
            avatarUrl={account.avatarUrl}
            label={account.displayName}
          />
          <div className="min-w-0 flex-1">
            <p className="neo-title truncate text-2xl leading-none text-[#171411]">
              {account.displayName}
            </p>
            <p className="neo-copy mt-1 truncate text-[9px] font-black tracking-[0.12em] text-[#007166] uppercase">
              {!isConfigured ? "Local preview" : user ? "Online // Library" : "Signed out"}
            </p>
          </div>
          <button
            aria-label="Add or manage friends"
            className="grid h-9 w-9 shrink-0 place-items-center border-2 border-black bg-[#007166] text-white shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a]"
            type="button"
            onClick={() => openSocial("friends")}
          >
            <UserPlus className="h-4 w-4" />
          </button>
        </div>

        <label className="relative mt-3 block">
          <span className="sr-only">Search friends</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#5b403f]" />
          <input
            aria-label="Search friends"
            className="neo-copy h-10 w-full border-[3px] border-black bg-[#fff9ed] pr-3 pl-9 text-[10px] font-black tracking-[0.08em] uppercase shadow-[3px_3px_0_#171411] outline-none placeholder:text-[#655f58] focus:bg-[#8cf5e4]"
            placeholder="Search friend, game, status..."
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 border-b-4 border-black bg-[#171411] px-3 py-2 text-[#fff9ed]">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[#8cf5e4]" />
          <p className="neo-copy text-[10px] font-black tracking-[0.14em] uppercase">Friends</p>
        </div>
        <span className="neo-copy border-2 border-[#fff9ed] bg-[#007166] px-2 py-0.5 text-[9px] font-black uppercase">
          {roster.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f5eedf]">
        {isAuthLoading || isLoading ? (
          <div className="grid min-h-56 place-items-center">
            <Loader2 aria-label="Loading friends" className="h-7 w-7 animate-spin text-[#b7102a]" />
          </div>
        ) : isConfigured && !user ? (
          <PopupNotice
            copy="Sign in to load your friends, live status, and group chats."
            label="Login required"
            onClick={() => openSocial("friends")}
          />
        ) : errorMessage ? (
          <PopupNotice
            copy={errorMessage}
            label="Social relay unavailable"
            onClick={() => openSocial("friends")}
          />
        ) : filteredRoster.length === 0 ? (
          <PopupNotice
            copy={
              query.trim()
                ? "No friend matches this search."
                : "No friends yet. Open the social hub to add players."
            }
            label={query.trim() ? "No signal found" : "Roster empty"}
            onClick={() => openSocial("friends")}
          />
        ) : (
          <>
            <RosterSection
              friends={playingFriends}
              label="In Game"
              tone="red"
              onOpenChat={(friendId) => openSocial("chat", isConfigured ? friendId : undefined)}
            />
            <RosterSection
              friends={onlineFriends}
              label="Online"
              tone="teal"
              onOpenChat={(friendId) => openSocial("chat", isConfigured ? friendId : undefined)}
            />
            <RosterSection
              friends={offlineFriends}
              label="Offline"
              tone="ink"
              onOpenChat={(friendId) => openSocial("chat", isConfigured ? friendId : undefined)}
            />
          </>
        )}
      </div>

      <div className="shrink-0 border-t-4 border-black bg-[#f6edd8]">
        <button
          aria-expanded={areGroupsOpen}
          className="neo-copy flex w-full items-center justify-between gap-3 bg-[#171411] px-3 py-2 text-left text-[10px] font-black tracking-[0.12em] text-[#fff9ed] uppercase"
          type="button"
          onClick={() => setAreGroupsOpen((current) => !current)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <MessageSquare className="h-4 w-4 shrink-0 text-[#8cf5e4]" />
            <span className="truncate">Group Chats ({displayedGroups.length})</span>
          </span>
          {areGroupsOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronUp className="h-4 w-4 shrink-0" />
          )}
        </button>

        {areGroupsOpen ? (
          <div className="max-h-36 space-y-2 overflow-y-auto p-2">
            {displayedGroups.length > 0 ? (
              displayedGroups.map(({ memberCount, room }) => (
                <button
                  key={room.id}
                  className="neo-copy flex w-full items-center justify-between gap-3 border-2 border-black bg-[#fff9ed] px-3 py-2 text-left text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
                  type="button"
                  onClick={() => openSocial("chat")}
                >
                  <span className="truncate">{room.name ?? "Unnamed Group"}</span>
                  <span className="shrink-0 text-[8px] text-[#5b403f]">
                    {memberCount > 0 ? `${memberCount} members` : "Open"}
                  </span>
                </button>
              ))
            ) : (
              <p className="neo-copy border-2 border-dashed border-black bg-[#fff9ed] p-3 text-[9px] font-black text-[#655f58] uppercase">
                No group chats yet.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function RosterSection({
  friends,
  label,
  onOpenChat,
  tone,
}: {
  friends: RosterItem[];
  label: string;
  onOpenChat: (friendId: string) => void;
  tone: "ink" | "red" | "teal";
}) {
  if (friends.length === 0) {
    return null;
  }

  const toneClass =
    tone === "red"
      ? "bg-[#b7102a] text-white"
      : tone === "teal"
        ? "bg-[#007166] text-white"
        : "bg-[#efe6d4] text-[#171411]";

  return (
    <section>
      <div
        className={`flex items-center justify-between border-b-2 border-black px-3 py-1.5 ${toneClass}`}
      >
        <h3 className="neo-copy text-[10px] font-black tracking-[0.12em] uppercase">{label}</h3>
        <span className="neo-copy text-[9px] font-black">{friends.length}</span>
      </div>
      <div>
        {friends.map((friend, index) => (
          <button
            key={friend.id}
            className="group flex w-full items-center gap-3 border-b-2 border-black bg-[#fff9ed] p-2 text-left transition hover:bg-[#8cf5e4] focus-visible:bg-[#8cf5e4]"
            type="button"
            onClick={() => onOpenChat(friend.id)}
          >
            <SocialAvatar
              artClass={getFriendArtClass(index)}
              avatarUrl={friend.avatarUrl}
              label={friend.displayName}
              size="sm"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="neo-copy truncate text-[11px] font-black text-[#171411]">
                  {friend.displayName}
                </span>
                <StatusMark status={friend.status} />
              </span>
              <span className="neo-copy mt-0.5 block truncate text-[9px] font-bold text-[#007166]">
                {friend.currentGameTitle ? `Playing ${friend.currentGameTitle}` : friend.detail}
              </span>
              <span className="neo-copy mt-0.5 block truncate text-[8px] font-bold tracking-[0.06em] text-[#655f58] uppercase">
                @{friend.username} // {friend.meta}
              </span>
            </span>
            <MessageSquare className="h-4 w-4 shrink-0 text-[#b7102a] opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>
        ))}
      </div>
    </section>
  );
}

function SocialAvatar({
  artClass,
  avatarUrl,
  label,
  size = "md",
}: {
  artClass: string;
  avatarUrl: string | null;
  label: string;
  size?: "md" | "sm";
}) {
  const sizeClass = size === "sm" ? "h-10 w-10" : "h-12 w-12";

  if (avatarUrl) {
    return (
      <img
        alt=""
        className={`${sizeClass} shrink-0 border-[3px] border-black object-cover shadow-[2px_2px_0_#171411]`}
        src={avatarUrl}
      />
    );
  }

  return (
    <span
      aria-label={label}
      className={`neo-title ${artClass} ${sizeClass} flex shrink-0 items-center justify-center border-[3px] border-black text-sm text-white shadow-[2px_2px_0_#171411]`}
      role="img"
    >
      {getInitials(label)}
    </span>
  );
}

function StatusMark({ status }: { status: UserPresence["status"] }) {
  const statusClass =
    status === "online"
      ? "bg-[#007166]"
      : status === "away" || status === "busy"
        ? "bg-[#b7102a]"
        : "bg-[#655f58]";

  return (
    <span
      aria-label={formatStatus(status)}
      className={`h-2.5 w-2.5 shrink-0 border border-black ${statusClass}`}
      role="img"
    />
  );
}

function PopupNotice({
  copy,
  label,
  onClick,
}: {
  copy: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="m-3 border-[3px] border-black bg-[#fff9ed] p-4 shadow-[3px_3px_0_#171411]">
      <p className="neo-title text-2xl leading-none text-[#171411]">{label}</p>
      <p className="neo-copy mt-2 text-[9px] leading-5 font-black text-[#655f58] uppercase">
        {copy}
      </p>
      <button
        className="neo-copy mt-3 border-2 border-black bg-[#007166] px-3 py-2 text-[9px] font-black text-white uppercase shadow-[2px_2px_0_#171411]"
        type="button"
        onClick={onClick}
      >
        Open social hub
      </button>
    </div>
  );
}

function getAccountIdentity(user: ReturnType<typeof useCurrentUser>["user"]) {
  const metadata = user?.user_metadata as Record<string, unknown> | undefined;
  const displayName =
    readMetadataString(metadata, "display_name") ??
    readMetadataString(metadata, "full_name") ??
    readMetadataString(metadata, "username") ??
    readMetadataString(metadata, "user_name") ??
    user?.email?.split("@")[0] ??
    "OG Player";
  const avatarUrl =
    readMetadataString(metadata, "avatar_url") ?? readMetadataString(metadata, "picture");

  return { avatarUrl, displayName };
}

function readMetadataString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getInitials(label: string) {
  return label
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getFriendArtClass(index: number) {
  return ["library-art-tokyo", "library-art-mech", "library-art-phantom"][index % 3];
}

function formatStatus(status: UserPresence["status"]) {
  if (status === "busy") return "Busy";
  if (status === "away") return "Away";
  if (status === "online") return "Online";
  return "Offline";
}

function formatLastSeen(presence: UserPresence | undefined) {
  const rawTimestamp = presence?.lastHeartbeatAt ?? presence?.updatedAt;
  const timestamp = rawTimestamp ? Date.parse(rawTimestamp) : Number.NaN;
  if (!Number.isFinite(timestamp)) {
    return "Offline";
  }

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 1) return "Last seen just now";
  if (elapsedMinutes < 60) return `Last seen ${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Last seen ${elapsedHours}h ago`;

  return `Last seen ${Math.floor(elapsedHours / 24)}d ago`;
}
