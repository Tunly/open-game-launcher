import { MessageSquare, MoreHorizontal, Pencil, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";

export function ProfileActions({ isOwnProfile = false }: { isOwnProfile?: boolean }) {
  if (isOwnProfile) {
    return <EditProfileButton />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="neo-copy inline-flex h-11 items-center gap-2 border-[3px] border-black bg-[#007166] px-4 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[4px_4px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#b7102a]"
        type="button"
      >
        <UserPlus className="h-4 w-4" />
        Freund hinzufugen
      </button>
      <button
        className="neo-copy inline-flex h-11 items-center gap-2 border-[3px] border-black bg-[#fff9ed] px-4 text-[11px] font-black uppercase tracking-[0.12em] text-[#1f1c0f] shadow-[4px_4px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
        type="button"
      >
        <MessageSquare className="h-4 w-4" />
        Nachricht
      </button>
      <button
        aria-label="More profile actions"
        className="inline-flex h-11 w-11 items-center justify-center border-[3px] border-black bg-[#fff9ed] text-[#1f1c0f] shadow-[4px_4px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
        type="button"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
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
      Profil bearbeiten
    </Link>
  );
}
