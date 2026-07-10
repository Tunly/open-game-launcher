import {
  Copy,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

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
  const location = useLocation();
  const moreMenuId = useId();
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [pendingAction, setPendingAction] = useState<"friend" | "message" | null>(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isMoreMenuOpen) return;

    const firstMenuItem =
      moreMenuRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])");
    firstMenuItem?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      setIsMoreMenuOpen(false);
      moreButtonRef.current?.focus();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isMoreMenuOpen]);

  if (isOwnProfile) {
    return <EditProfileButton />;
  }

  const canSubmit = canUseSocialActions && Boolean(profileUserId) && pendingAction === null;
  const profileShareUrl = buildProfileShareUrl(location.pathname, location.search);

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

  async function copyProfileLink() {
    setIsMoreMenuOpen(false);
    setStatus(null);
    setError(null);

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }

      await navigator.clipboard.writeText(profileShareUrl);
      setStatus("Profile link copied.");
    } catch {
      setError("Clipboard unavailable. Use the browser address bar to copy this profile.");
    }
  }

  function openFriendsHub() {
    if (!canUseSocialActions) return;

    setIsMoreMenuOpen(false);
    setStatus(null);
    setError(null);
    navigate("/friends");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          className="neo-copy inline-flex h-11 items-center gap-2 border-[3px] border-black bg-[#007166] px-4 text-[11px] font-black tracking-[0.12em] text-white uppercase shadow-[4px_4px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#b7102a] disabled:cursor-not-allowed disabled:bg-[#655f58] disabled:hover:translate-y-0"
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
          className="neo-copy inline-flex h-11 items-center gap-2 border-[3px] border-black bg-[#fff9ed] px-4 text-[11px] font-black tracking-[0.12em] text-[#1f1c0f] uppercase shadow-[4px_4px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#efe6d4] disabled:text-[#655f58] disabled:hover:translate-y-0"
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
          ref={moreButtonRef}
          aria-controls={isMoreMenuOpen ? moreMenuId : undefined}
          aria-expanded={isMoreMenuOpen}
          aria-haspopup="menu"
          aria-label="More profile actions"
          className="inline-flex h-11 w-11 items-center justify-center border-[3px] border-black bg-[#fff9ed] text-[#1f1c0f] shadow-[4px_4px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#efe6d4] disabled:text-[#655f58] disabled:hover:translate-y-0"
          type="button"
          onClick={() => {
            setIsMoreMenuOpen((isOpen) => !isOpen);
            setStatus(null);
            setError(null);
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      {isMoreMenuOpen ? (
        <div
          ref={moreMenuRef}
          aria-label="More profile actions"
          className="w-full max-w-sm border-[3px] border-black bg-[#fff9ed] p-3 shadow-[5px_5px_0_#1f1c0f]"
          id={moreMenuId}
          role="menu"
        >
          <div className="mb-3 border-b-2 border-black pb-2">
            <p className="neo-copy text-[9px] font-black tracking-[0.16em] text-[#b7102a] uppercase">
              Player Actions
            </p>
            <p className="neo-title text-2xl leading-none text-[#1f1c0f]">More</p>
          </div>
          <div className="space-y-2">
            <ProfileMoreMenuItem
              icon={<Copy className="h-4 w-4" />}
              label="Copy Profile Link"
              onClick={() => void copyProfileLink()}
            />
            <ProfileMoreMenuItem
              disabled={!canUseSocialActions}
              icon={<Users className="h-4 w-4" />}
              label="Open Friends Hub"
              onClick={openFriendsHub}
            />
            <ProfileMoreMenuItem
              icon={<X className="h-4 w-4" />}
              label="Close Menu"
              onClick={() => {
                setIsMoreMenuOpen(false);
                moreButtonRef.current?.focus();
              }}
            />
          </div>
          {!canUseSocialActions ? (
            <p className="neo-copy mt-3 border-2 border-dashed border-black bg-[#efe6d4] p-2 text-[9px] leading-4 font-black text-[#655f58] uppercase">
              Sign in to route social handoffs from this menu.
            </p>
          ) : null}
        </div>
      ) : null}
      {!canUseSocialActions ? (
        <p className="neo-copy border-2 border-dashed border-black bg-[#efe6d4] p-2 text-[10px] leading-4 font-black text-[#655f58] uppercase">
          Sign in with Supabase to use social actions.
        </p>
      ) : null}
      {status ? (
        <p className="neo-copy border-2 border-black bg-[#007166] p-2 text-[10px] font-black text-white uppercase">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="neo-copy border-2 border-black bg-[#b7102a] p-2 text-[10px] font-black text-white uppercase">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ProfileMoreMenuItem({
  disabled = false,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="neo-copy flex min-h-11 w-full items-center gap-3 border-2 border-black bg-[#f6edd8] px-3 py-2 text-left text-[10px] font-black tracking-[0.1em] text-[#1f1c0f] uppercase shadow-[2px_2px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#efe6d4] disabled:text-[#655f58] disabled:hover:translate-y-0"
      disabled={disabled}
      role="menuitem"
      type="button"
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function buildProfileShareUrl(pathname: string, search: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${pathname}${search}`;
}

export function EditProfileButton({ className = "" }: { className?: string }) {
  return (
    <Link
      className={`neo-copy inline-flex h-11 items-center justify-center gap-2 border-[3px] border-black bg-[#b7102a] px-4 text-[11px] font-black tracking-[0.12em] text-white uppercase shadow-[4px_4px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#007166] ${className}`}
      to="/settings/profile"
    >
      <Pencil className="h-4 w-4" />
      Edit Profile
    </Link>
  );
}
