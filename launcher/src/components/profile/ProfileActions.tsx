import { Loader2, MessageSquare, MoreHorizontal, Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { sendFriendRequest } from "../../lib/supabase/profile";
import { getDirectThread } from "../../lib/supabase/social";

export function ProfileActions({
  canUseSocialActions = false,
  isOwnProfile = false,
  profileUserId,
}: {
  canUseSocialActions?: boolean;
  isOwnProfile?: boolean;
  profileUserId?: string;
}) {
  const navigate = useNavigate();
  const [pendingAction, setPendingAction] = useState<"friend" | "message" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isOwnProfile) {
    return <EditProfileButton />;
  }

  const canSubmit = canUseSocialActions && Boolean(profileUserId) && pendingAction === null;

  async function requestFriend() {
    if (!profileUserId || !canSubmit) return;

    setPendingAction("friend");
    setStatus(null);
    setError(null);

    try {
      await sendFriendRequest(profileUserId);
      setStatus("Friend request sent.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPendingAction(null);
    }
  }

  async function openDirectMessage() {
    if (!profileUserId || !canSubmit) return;

    setPendingAction("message");
    setStatus(null);
    setError(null);

    try {
      await getDirectThread(profileUserId);
      navigate("/friends");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          className="neo-copy inline-flex h-11 items-center gap-2 border-[3px] border-black bg-[#007166] px-4 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[4px_4px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#b7102a] disabled:cursor-not-allowed disabled:bg-[#655f58] disabled:hover:translate-y-0"
          disabled={!canSubmit}
          type="button"
          onClick={() => void requestFriend()}
        >
          {pendingAction === "friend" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          Add Friend
        </button>
        <button
          className="neo-copy inline-flex h-11 items-center gap-2 border-[3px] border-black bg-[#fff9ed] px-4 text-[11px] font-black uppercase tracking-[0.12em] text-[#1f1c0f] shadow-[4px_4px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#efe6d4] disabled:text-[#655f58] disabled:hover:translate-y-0"
          disabled={!canSubmit}
          type="button"
          onClick={() => void openDirectMessage()}
        >
          {pendingAction === "message" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageSquare className="h-4 w-4" />
          )}
          Message
        </button>
        <button
          aria-label="More profile actions"
          className="inline-flex h-11 w-11 items-center justify-center border-[3px] border-black bg-[#fff9ed] text-[#1f1c0f] shadow-[4px_4px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#efe6d4] disabled:text-[#655f58] disabled:hover:translate-y-0"
          disabled={!canUseSocialActions}
          type="button"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      {!canUseSocialActions ? (
        <p className="neo-copy border-2 border-dashed border-black bg-[#efe6d4] p-2 text-[10px] font-black uppercase leading-4 text-[#655f58]">
          Sign in with Supabase to use social actions.
        </p>
      ) : null}
      {status ? (
        <p className="neo-copy border-2 border-black bg-[#007166] p-2 text-[10px] font-black uppercase text-white">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="neo-copy border-2 border-black bg-[#b7102a] p-2 text-[10px] font-black uppercase text-white">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function EditProfileButton({ className = "" }: { className?: string }) {
  return (
    <Link
      className={`neo-copy inline-flex h-11 items-center justify-center gap-2 border-[3px] border-black bg-[#b7102a] px-4 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[4px_4px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#007166] ${className}`}
      to="/settings/profile"
    >
      <Pencil className="h-4 w-4" />
      Edit Profile
    </Link>
  );
}
