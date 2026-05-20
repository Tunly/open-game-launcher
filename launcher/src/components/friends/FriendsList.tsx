import type { Friendship } from "../../lib/types/profile";

export function FriendsList({ friends }: { friends: Friendship[] }) {
  return (
    <div className="space-y-3">
      {friends.length > 0 ? (
        friends.map((friendship) => (
          <div key={friendship.id} className="border border-white/10 bg-white/[0.05] p-4">
            <p className="font-bold text-white">{friendship.requesterId}</p>
            <p className="text-sm text-slate-400">{friendship.status}</p>
          </div>
        ))
      ) : (
        <p className="text-sm text-slate-400">No friends yet.</p>
      )}
    </div>
  );
}
