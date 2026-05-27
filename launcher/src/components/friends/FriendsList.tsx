import { Circle, Gamepad2 } from "lucide-react";

import type { Friendship, UserPresence } from "../../lib/types/profile";

export function FriendsList({
  currentUserId,
  friends,
  onSelectFriend,
  presenceByUserId = {},
  selectedFriendId,
}: {
  currentUserId: string;
  friends: Friendship[];
  onSelectFriend?: (friendId: string) => void;
  presenceByUserId?: Record<string, UserPresence>;
  selectedFriendId?: string | null;
}) {
  return (
    <div className="space-y-3">
      {friends.length > 0 ? (
        friends.map((friendship) => {
          const friendId = friendship.requesterId === currentUserId ? friendship.addresseeId : friendship.requesterId;
          const presence = presenceByUserId[friendId];
          const status = presence?.status ?? "offline";
          const isSelected = selectedFriendId === friendId;

          return (
            <button
              key={friendship.id}
              className={`block w-full border-[3px] border-black p-4 text-left shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 ${
                isSelected ? "bg-[#8cf5e4]" : "bg-[#f6edd8]"
              }`}
              type="button"
              onClick={() => onSelectFriend?.(friendId)}
            >
              <p className="neo-title break-all text-2xl leading-none text-[#171411]">
                Player {friendId.slice(0, 8)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <p className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#007166] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
                  {friendship.status}
                </p>
                <p className={statusBadgeClassName(status)}>
                  <Circle className="h-2.5 w-2.5 fill-current" />
                  {status}
                </p>
              </div>
              {presence?.currentGameTitle ? (
                <p className="neo-copy mt-3 inline-flex max-w-full items-center gap-2 border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[2px_2px_0_#171411]">
                  <Gamepad2 className="h-4 w-4 shrink-0 text-[#b7102a]" />
                  <span className="truncate">Playing {presence.currentGameTitle}</span>
                </p>
              ) : null}
            </button>
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

function statusBadgeClassName(status: UserPresence["status"]) {
  const baseClassName =
    "neo-copy inline-flex items-center gap-1 border-2 border-black px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#171411]";

  if (status === "online") {
    return `${baseClassName} bg-[#007166] text-white`;
  }
  if (status === "away" || status === "busy") {
    return `${baseClassName} bg-[#f2c14e] text-[#171411]`;
  }

  return `${baseClassName} bg-[#e3d5ba] text-[#5b403f]`;
}
