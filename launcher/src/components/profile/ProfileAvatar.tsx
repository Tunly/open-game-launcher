import type { Profile } from "../../lib/types/profile";

export function ProfileAvatar({ profile, size = "lg" }: { profile: Profile; size?: "md" | "lg" }) {
  const dimension = size === "lg" ? "h-32 w-32 text-4xl" : "h-16 w-16 text-xl";
  const label = profile.displayName ?? profile.username;

  if (profile.avatarUrl) {
    return (
      <img
        alt={label}
        className={`${dimension} relative z-20 shrink-0 border-4 border-black bg-[#f6edd8] object-cover shadow-[7px_7px_0_#1f1c0f]`}
        src={profile.avatarUrl}
      />
    );
  }

  return (
    <div
      className={`${dimension} neo-title relative z-20 flex shrink-0 items-center justify-center border-4 border-black bg-[#007166] text-white shadow-[7px_7px_0_#1f1c0f]`}
    >
      {profile.username.slice(0, 2).toUpperCase()}
    </div>
  );
}
