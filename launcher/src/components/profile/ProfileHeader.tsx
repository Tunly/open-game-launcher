import type { ProfilePageData } from "../../lib/types/profile";
import { ProfileActions } from "./ProfileActions";
import { ProfileAvatar } from "./ProfileAvatar";
import { ProfileBadgeList } from "./ProfileBadgeList";
import { ProfileBanner } from "./ProfileBanner";
import { ProfileLevelBar } from "./ProfileLevelBar";

export function ProfileHeader({
  data,
  isOwnProfile = false,
}: {
  data: ProfilePageData;
  isOwnProfile?: boolean;
}) {
  const { profile, theme } = data;

  return (
    <section className="relative overflow-hidden border-4 border-black bg-[#fff9ed] shadow-[9px_9px_0_#1f1c0f]">
      <ProfileBanner profile={profile} theme={theme} />
      <div className="relative z-10 -mt-20 p-5 lg:p-8">
        <div className="grid gap-6 border-4 border-black bg-[#fff9ed] p-4 shadow-[6px_6px_0_#1f1c0f] lg:grid-cols-[auto_minmax(0,1fr)_300px] lg:items-center">
          <ProfileAvatar profile={profile} />
          <div className="min-w-0">
            <p className="neo-copy inline-block border-2 border-black bg-[#007166] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
              @{profile.username}
            </p>
            <h1 className="neo-title mt-2 truncate text-[clamp(2.4rem,6vw,5.2rem)] leading-none text-[#171411]">
              {profile.displayName ?? profile.username}
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#5b403f]">
              {profile.bio ??
                "This player has not written a bio yet. Their gaming room is waiting for a first story."}
            </p>
            <div className="mt-4">
              <ProfileBadgeList badges={data.badges} />
            </div>
            <div className="mt-5">
              <ProfileActions isOwnProfile={isOwnProfile} />
            </div>
          </div>
          <ProfileLevelBar
            isEmbedded
            level={profile.profileLevel}
            xp={profile.profileXp}
          />
        </div>
      </div>
    </section>
  );
}
