import type { FriendRequest } from "../../lib/types/profile";

export function FriendRequestList({
  currentUserId,
  isMutating,
  onAccept,
  onDecline,
  requests,
}: {
  currentUserId: string;
  isMutating?: boolean;
  onAccept: (request: FriendRequest) => void;
  onDecline: (request: FriendRequest) => void;
  requests: FriendRequest[];
}) {
  return (
    <div className="space-y-3">
      {requests.length > 0 ? (
        requests.map((request) => {
          const isIncoming = request.addresseeId === currentUserId;
          const otherUserId = isIncoming ? request.requesterId : request.addresseeId;

          return (
            <div
              key={request.id}
              className="border-[3px] border-black bg-[#f6edd8] p-4 shadow-[3px_3px_0_#171411]"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
                    {isIncoming ? "Incoming request" : "Sent request"}
                  </p>
                  <p className="neo-title mt-2 break-all text-2xl leading-none text-[#171411]">
                    Player {otherUserId.slice(0, 8)}
                  </p>
                </div>
                <p className="neo-copy inline-flex shrink-0 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
                  {request.status}
                </p>
              </div>

              {isIncoming ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="neo-copy border-2 border-black bg-[#007166] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a] disabled:opacity-60"
                    disabled={isMutating}
                    type="button"
                    onClick={() => onAccept(request)}
                  >
                    Accept
                  </button>
                  <button
                    className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4] disabled:opacity-60"
                    disabled={isMutating}
                    type="button"
                    onClick={() => onDecline(request)}
                  >
                    Decline
                  </button>
                </div>
              ) : null}
            </div>
          );
        })
      ) : (
        <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[12px] font-bold uppercase leading-5 text-[#655f58]">
          No pending requests.
        </p>
      )}
    </div>
  );
}
