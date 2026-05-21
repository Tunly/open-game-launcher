import type { Friendship } from "../../lib/types/profile";

export function FriendsList({
  currentUserId,
  friends,
}: {
  currentUserId: string;
  friends: Friendship[];
}) {
  return (
    <div className="space-y-3">
      {friends.length > 0 ? (
        friends.map((friendship) => {
          const friendId = friendship.requesterId === currentUserId ? friendship.addresseeId : friendship.requesterId;

          return (
            <div
              key={friendship.id}
              className="border-[3px] border-black bg-[#f6edd8] p-4 shadow-[3px_3px_0_#171411]"
            >
              <p className="neo-title break-all text-2xl leading-none text-[#171411]">
                Player {friendId.slice(0, 8)}
              </p>
              <p className="neo-copy mt-2 inline-flex border-2 border-black bg-[#007166] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
                {friendship.status}
              </p>
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
