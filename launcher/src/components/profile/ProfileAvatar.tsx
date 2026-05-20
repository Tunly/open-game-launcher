import type { Profile } from "../../lib/types/profile";

export function ProfileAvatar({ profile, size = "lg" }: { profile: Profile; size?: "md" | "lg" }) {
  const dimension = size === "lg" ? "h-28 w-28 text-3xl" : "h-16 w-16 text-xl";
  const label = profile.displayName ?? profile.username;

  if (profile.avatarUrl) {
    return (
      <img
        alt={label}
        className={`${dimension} border border-white/20 object-cover shadow-2xl`}
        src={profile.avatarUrl}
      />
    );
  }

  return (
    <div className={`${dimension} flex items-center justify-center border border-white/20 bg-teal-400 font-black text-slate-950 shadow-2xl`}>
      {profile.username.slice(0, 2).toUpperCase()}
    </div>
  );
}
