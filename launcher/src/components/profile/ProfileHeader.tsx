import type { ProfilePageData } from "../../lib/types/profile";
import { EditProfileButton, ProfileActions } from "./ProfileActions";
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
      <div className="relative z-10 bg-[#fff9ed] px-5 pb-5 pt-4 lg:px-8 lg:pb-8 lg:pt-6">
        <div className="grid gap-6 border-4 border-black bg-[#fff9ed] p-4 shadow-[6px_6px_0_#1f1c0f] lg:grid-cols-[auto_minmax(0,1fr)_300px] lg:items-center">
          <ProfileAvatar profile={profile} />
          <div className="min-w-0">
            <h1 className="neo-title truncate text-[clamp(2.4rem,6vw,5.2rem)] leading-none text-[#171411]">
              {profile.displayName ?? profile.username}
            </h1>
            <div className="mt-4">
              <ProfileBadgeList badges={data.badges} />
            </div>
            {!isOwnProfile ? (
              <div className="mt-5">
                <ProfileActions />
              </div>
            ) : null}
          </div>
          <div className="space-y-4">
            <ProfileLevelBar
              isEmbedded
              level={profile.profileLevel}
              xp={profile.profileXp}
            />
            {isOwnProfile ? <EditProfileButton className="w-full" /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
