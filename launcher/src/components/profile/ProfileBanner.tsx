import type { Profile, ProfileTheme } from "../../lib/types/profile";

export function ProfileBanner({
  profile,
  theme,
}: {
  profile: Profile;
  theme: ProfileTheme | null;
}) {
  const background =
    profile.bannerUrl !== null
      ? `linear-gradient(90deg, rgba(23,20,17,.76), rgba(23,20,17,.12)), url(${profile.bannerUrl})`
      : theme?.backgroundValue ??
        "radial-gradient(circle at 78% 24%, #8cf5e4 0 8%, transparent 9%), linear-gradient(115deg, transparent 0 34%, rgba(23,20,17,.24) 35% 37%, transparent 38%), repeating-linear-gradient(90deg, rgba(183,16,42,.32) 0 8px, transparent 9px 34px), linear-gradient(135deg, #f6edd8 0%, #087d6d 48%, #171411 49%, #c20b2f 100%)";

  return (
    <div
      className="relative z-0 min-h-72 overflow-hidden border-b-4 border-black bg-cover bg-center"
      style={{ background }}
    >
      <div className="absolute bottom-0 left-0 right-0 z-0 h-8 border-t-4 border-black bg-[repeating-linear-gradient(90deg,#171411_0_12px,#fff9ed_12px_24px)]" />
    </div>
  );
}
