import type { FriendRequest } from "../../lib/types/profile";

export function FriendRequestList({ requests }: { requests: FriendRequest[] }) {
  return (
    <div className="space-y-3">
      {requests.length > 0 ? (
        requests.map((request) => (
          <div key={request.id} className="border border-white/10 bg-white/[0.05] p-4">
            <p className="font-bold text-white">Request {request.id.slice(0, 8)}</p>
            <p className="text-sm text-slate-400">{request.status}</p>
          </div>
        ))
      ) : (
        <p className="text-sm text-slate-400">No pending requests.</p>
      )}
    </div>
  );
}
