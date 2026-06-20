import { Circle, Gamepad2, LogIn, MessageSquare, Send, Trash2, UserRound } from "lucide-react";
import { Link } from "react-router-dom";

import { getPresenceGameLine, getPresencePlatformLabel } from "../../lib/supabase/presence";
import type { Friendship, UserPresence } from "../../lib/types/profile";

export function FriendsList({
  currentUserId,
  friends,
  onRemove,
  onOpenChat,
  onOpenInvite,
  onSelectFriend,
  onJoinGame,
  presenceByUserId = {},
  selectedFriendId,
}: {
  currentUserId: string;
  friends: Friendship[];
  onRemove?: (friendship: Friendship) => void;
  onOpenChat?: (friendId: string) => void;
  onOpenInvite?: (friendId: string) => void;
  onSelectFriend?: (friendId: string) => void;
  onJoinGame?: (gameId: string) => void;
  presenceByUserId?: Record<string, UserPresence>;
  selectedFriendId?: string | null;
}) {
  return (
    <div className="space-y-3">
      {friends.length > 0 ? (
        friends.map((friendship) => {
          const friendId =
            friendship.requesterId === currentUserId
              ? friendship.addresseeId
              : friendship.requesterId;
          const presence = presenceByUserId[friendId];
          const status = presence?.status ?? "offline";
          const gameLine = presence ? getPresenceGameLine(presence) : null;
          const platformLabel = presence
            ? getPresencePlatformLabel(presence.platform, presence.platformSource)
            : null;
          const isSelected = selectedFriendId === friendId;
          const displayName = friendship.profile?.displayName ?? friendship.profile?.username;
          const username = friendship.profile?.username;

          return (
            <div
              key={friendship.id}
              className={`block w-full border-[3px] border-black shadow-[3px_3px_0_#171411] transition ${
                isSelected ? "bg-[#8cf5e4]" : "bg-[#f6edd8] hover:-translate-y-0.5"
              }`}
            >
              <button
                className="block w-full cursor-pointer p-4 text-left"
                type="button"
                onClick={() => onSelectFriend?.(friendId)}
              >
                <div className="flex items-start gap-3">
                  <Avatar
                    avatarUrl={friendship.profile?.avatarUrl ?? null}
                    displayName={displayName ?? null}
                    username={username ?? null}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="neo-title truncate text-2xl leading-none text-[#171411]">
                      {displayName ?? "Unknown player"}
                    </p>
                    {username ? (
                      <p className="neo-copy mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                        @{username}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <p className={statusBadgeClassName(status)}>
                        <Circle className="h-2.5 w-2.5 fill-current" />
                        {status}
                      </p>
                    </div>
                  </div>
                </div>
              </button>
              {gameLine ? (
                <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
                  <p className="neo-copy inline-flex max-w-full items-center gap-2 border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[2px_2px_0_#171411]">
                    <Gamepad2 className="h-4 w-4 shrink-0 text-[#b7102a]" />
                    <span className="truncate">{gameLine}</span>
                  </p>
                  <span className={platformBadgeClassName(Boolean(platformLabel))}>
                    {platformLabel ?? "Source unknown"}
                  </span>
                  {onJoinGame && presence?.currentGameId ? (
                    <button
                      className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#087d6d] px-2 py-1 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#065e53]"
                      type="button"
                      onClick={() => onJoinGame(presence.currentGameId!)}
                    >
                      <LogIn className="h-3 w-3" />
                      Smart Join
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-black bg-[#efe6d4] px-3 py-2">
                {username ? (
                  <Link
                    className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[1px_1px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
                    to={`/u/${username}`}
                  >
                    <UserRound className="h-3 w-3" />
                    Profile
                  </Link>
                ) : null}
                {onOpenChat ? (
                  <button
                    className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[1px_1px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
                    type="button"
                    onClick={() => onOpenChat(friendId)}
                  >
                    <MessageSquare className="h-3 w-3" />
                    Chat
                  </button>
                ) : null}
                {onOpenInvite ? (
                  <button
                    className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[1px_1px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
                    type="button"
                    onClick={() => onOpenInvite(friendId)}
                  >
                    <Send className="h-3 w-3" />
                    Invite
                  </button>
                ) : null}
                {onRemove ? (
                  <button
                    className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a] shadow-[1px_1px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#f3c3c9] disabled:opacity-60"
                    disabled={!onRemove}
                    type="button"
                    onClick={() => onRemove(friendship)}
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          );
        })
      ) : (
        <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[12px] font-bold uppercase leading-5 text-[#655f58]">
          No friends yet.
        </p>
      )}
    </div>
  );
}

function Avatar({
  avatarUrl,
  displayName,
  username,
}: {
  avatarUrl: string | null;
  displayName: string | null;
  username: string | null;
}) {
  const initials = (displayName || username || "?").slice(0, 2).toUpperCase();
  if (avatarUrl) {
    return (
      <img
        alt={displayName ?? username ?? "Friend"}
        className="h-12 w-12 shrink-0 border-2 border-black object-cover shadow-[2px_2px_0_#171411]"
        src={avatarUrl}
      />
    );
  }
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center border-2 border-black bg-[#007166] text-[12px] font-black uppercase text-white shadow-[2px_2px_0_#171411]">
      {initials}
    </div>
  );
}

function statusBadgeClassName(status: UserPresence["status"]) {
  const baseClassName =
    "neo-copy inline-flex items-center gap-1 border-2 border-black px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#171411]";

  if (status === "online") {
    return `${baseClassName} bg-[#007166] text-white`;
  }
  if (status === "away" || status === "busy") {
    return `${baseClassName} bg-[#8cf5e4] text-[#171411]`;
  }

  return `${baseClassName} bg-[#e3d5ba] text-[#5b403f]`;
}

function platformBadgeClassName(hasPlatform: boolean) {
  const baseClassName =
    "neo-copy inline-flex items-center border-2 border-black px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#171411]";

  return hasPlatform
    ? `${baseClassName} bg-[#8cf5e4] text-[#171411]`
    : `${baseClassName} bg-[#efe6d4] text-[#5b403f]`;
}
