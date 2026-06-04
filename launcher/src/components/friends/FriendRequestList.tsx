import { Check, X } from "lucide-react";
import { Link } from "react-router-dom";

import type { FriendRequest } from "../../lib/types/profile";

export function FriendRequestList({
  currentUserId,
  isMutating,
  onAccept,
  onCancel,
  onDecline,
  requests,
}: {
  currentUserId: string;
  isMutating?: boolean;
  onAccept: (request: FriendRequest) => void;
  onCancel: (request: FriendRequest) => void;
  onDecline: (request: FriendRequest) => void;
  requests: FriendRequest[];
}) {
  return (
    <div className="space-y-3">
      {requests.length > 0 ? (
        requests.map((request) => {
          const isIncoming = request.addresseeId === currentUserId;
          const otherUser = isIncoming ? request.requesterProfile : request.addresseeProfile;
          const otherUserId = isIncoming ? request.requesterId : request.addresseeId;
          const displayName = otherUser?.displayName ?? otherUser?.username;
          const username = otherUser?.username;
          const avatarUrl = otherUser?.avatarUrl ?? null;

          return (
            <div
              key={request.id}
              className="border-[3px] border-black bg-[#f6edd8] p-4 shadow-[3px_3px_0_#171411]"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar avatarUrl={avatarUrl} displayName={displayName ?? null} username={username ?? null} />
                  <div className="min-w-0 flex-1">
                    <p className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
                      {isIncoming ? "Incoming request" : "Sent request"}
                    </p>
                    <p className="neo-title mt-2 truncate text-2xl leading-none text-[#171411]">
                      {displayName ?? "Unknown player"}
                    </p>
                    {username ? (
                      <p className="neo-copy mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                        @{username}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                  <p className="neo-copy inline-flex border-2 border-black bg-[#fff9ed] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
                    {request.status}
                  </p>
                  {username ? (
                    <Link
                      className="neo-copy inline-flex items-center justify-center border-2 border-black bg-[#fff9ed] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[1px_1px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
                      to={`/u/${username}`}
                    >
                      Profile
                    </Link>
                  ) : null}
                </div>
              </div>

              {isIncoming ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#007166] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a] disabled:opacity-60"
                    disabled={isMutating}
                    type="button"
                    onClick={() => onAccept(request)}
                  >
                    <Check className="h-3 w-3" />
                    Accept
                  </button>
                  <button
                    className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4] disabled:opacity-60"
                    disabled={isMutating}
                    type="button"
                    onClick={() => onDecline(request)}
                  >
                    <X className="h-3 w-3" />
                    Decline
                  </button>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="neo-copy inline-flex items-center gap-1 border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a] shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#f3c3c9] disabled:opacity-60"
                    disabled={isMutating}
                    type="button"
                    onClick={() => onCancel(request)}
                  >
                    <X className="h-3 w-3" />
                    Withdraw
                  </button>
                </div>
              )}

              {!username ? (
                <p className="neo-copy mt-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[#655f58]">
                  ID: {otherUserId}
                </p>
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
        alt={displayName ?? username ?? "Player"}
        className="h-12 w-12 shrink-0 border-2 border-black object-cover shadow-[2px_2px_0_#171411]"
        src={avatarUrl}
      />
    );
  }
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center border-2 border-black bg-[#b7102a] text-[12px] font-black uppercase text-white shadow-[2px_2px_0_#171411]">
      {initials}
    </div>
  );
}
