import type { Profile, ProfileTheme } from "../../lib/types/profile";

export function ProfileBanner({
  profile,
  theme,
}: {
  profile: Profile;
  theme: ProfileTheme | null;
}) {
  const safeThemeBackground =
    theme?.backgroundType === "solid" && theme.backgroundValue ? theme.backgroundValue : null;
  const background =
    profile.bannerUrl !== null
      ? `linear-gradient(90deg, rgba(23,20,17,.76), rgba(23,20,17,.12)), url(${profile.bannerUrl})`
      : safeThemeBackground;

  return (
    <div
      className={`relative z-0 min-h-72 overflow-hidden border-b-4 border-black bg-cover bg-center ${
        background ? "" : "hero-art"
      }`}
      style={background ? { background } : undefined}
    >
      <div className="absolute left-5 top-5 border-[3px] border-black bg-[#fff9ed] px-4 py-3 shadow-[4px_4px_0_#171411]">
        <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
          Player Banner
        </p>
        <p className="neo-title mt-1 text-4xl leading-none text-[#171411]">{profile.username}</p>
      </div>
      <div className="absolute bottom-0 left-0 right-0 z-0 h-8 border-t-4 border-black bg-[repeating-linear-gradient(90deg,#171411_0_12px,#fff9ed_12px_24px)]" />
    </div>
  );
}
