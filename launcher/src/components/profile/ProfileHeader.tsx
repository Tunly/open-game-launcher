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
      <div className="relative z-10 bg-[#fff9ed] px-5 pt-4 pb-5 lg:px-8 lg:pt-6 lg:pb-8">
        <div className="grid gap-6 bg-[#fff9ed] p-4 lg:grid-cols-[auto_minmax(0,1fr)_300px] lg:items-center">
          <ProfileAvatar profile={profile} />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="neo-title max-w-full pr-2 pb-1 text-[clamp(2.4rem,6vw,5.2rem)] leading-[0.95] break-words text-[#171411]">
                {profile.displayName ?? profile.username}
              </h1>
              <span className="neo-copy inline-flex shrink-0 items-center gap-2 border-2 border-black bg-[#007166] px-2.5 py-1.5 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#1f1c0f]">
                <span className="h-2.5 w-2.5 border-2 border-black bg-[#8cf5e4]" />
                Online
              </span>
            </div>
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
            <ProfileLevelBar isEmbedded level={profile.profileLevel} xp={profile.profileXp} />
            {isOwnProfile ? <EditProfileButton className="w-full" /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
