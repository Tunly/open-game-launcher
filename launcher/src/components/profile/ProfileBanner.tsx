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
      ? `linear-gradient(90deg, rgba(0,0,0,.78), rgba(0,0,0,.2)), url(${profile.bannerUrl})`
      : theme?.backgroundValue ??
        "radial-gradient(circle at 20% 20%, rgba(56,189,248,.22), transparent 30%), linear-gradient(135deg,#111827,#020617)";

  return (
    <div
      className="min-h-72 border border-white/10 bg-cover bg-center"
      style={{ background }}
    />
  );
}
