import { MessageSquare, MoreHorizontal, UserPlus } from "lucide-react";

export function ProfileActions({ isOwnProfile = false }: { isOwnProfile?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="inline-flex h-10 items-center gap-2 bg-sky-400 px-4 text-sm font-bold text-slate-950 hover:bg-sky-300"
        type="button"
      >
        <UserPlus className="h-4 w-4" />
        {isOwnProfile ? "Edit profile" : "Add friend"}
      </button>
      <button
        className="inline-flex h-10 items-center gap-2 border border-white/10 bg-white/[0.06] px-4 text-sm font-bold text-white hover:bg-white/[0.1]"
        type="button"
      >
        <MessageSquare className="h-4 w-4" />
        Message
      </button>
      <button
        aria-label="More profile actions"
        className="inline-flex h-10 w-10 items-center justify-center border border-white/10 bg-white/[0.06] text-white hover:bg-white/[0.1]"
        type="button"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}
