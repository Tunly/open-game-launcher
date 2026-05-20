import type { ProfilePageData } from "../../lib/types/profile";
import { ProfileActions } from "./ProfileActions";
import { ProfileAvatar } from "./ProfileAvatar";
import { ProfileBadgeList } from "./ProfileBadgeList";
import { ProfileBanner } from "./ProfileBanner";
import { ProfileLevelBar } from "./ProfileLevelBar";

export function ProfileHeader({ data }: { data: ProfilePageData }) {
  const { profile, theme } = data;

  return (
    <section className="overflow-hidden border border-white/10 bg-[#111827] shadow-2xl">
      <ProfileBanner profile={profile} theme={theme} />
      <div className="-mt-16 grid gap-6 p-5 lg:grid-cols-[1fr_320px] lg:p-8">
        <div className="flex min-w-0 flex-col gap-5 sm:flex-row">
          <ProfileAvatar profile={profile} />
          <div className="min-w-0 pt-12 sm:pt-16">
            <p className="text-sm font-bold uppercase text-sky-200">
              @{profile.username}
            </p>
            <h1 className="mt-1 truncate text-4xl font-black text-white sm:text-6xl">
              {profile.displayName ?? profile.username}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              {profile.bio ??
                "This player has not written a bio yet. Their gaming room is waiting for a first story."}
            </p>
            <div className="mt-4">
              <ProfileBadgeList badges={data.badges} />
            </div>
            <div className="mt-5">
              <ProfileActions />
            </div>
          </div>
        </div>
        <div className="pt-0 lg:pt-16">
          <ProfileLevelBar level={profile.profileLevel} xp={profile.profileXp} />
        </div>
      </div>
    </section>
  );
}
