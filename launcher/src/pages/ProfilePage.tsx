import { AlertTriangle, ExternalLink, Loader2, Lock } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { ProfileComments } from "../components/profile/ProfileComments";
import { ProfileHeader } from "../components/profile/ProfileHeader";
import { ProfileShowcaseGrid } from "../components/profile/ProfileShowcaseGrid";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { isSupabaseConfigured } from "../lib/supabase/client";
import { getProfilePageData } from "../lib/supabase/profile";
import type { ProfilePageData } from "../lib/types/profile";

type LoadState =
  | { status: "loading"; data: null; error: null; isMock: false }
  | { status: "ready"; data: ProfilePageData; error: null; isMock: boolean }
  | { status: "empty"; data: null; error: null; isMock: false }
  | { status: "error"; data: null; error: string; isMock: false };

export function ProfilePage() {
  const { username } = useParams();
  const { user } = useCurrentUser();
  const [state, setState] = useState<LoadState>({
    status: "loading",
    data: null,
    error: null,
    isMock: false,
  });

  useEffect(() => {
    let isMounted = true;
    const resolvedUsername = username?.trim();

    if (!resolvedUsername) {
      setState({ status: "empty", data: null, error: null, isMock: false });
      return;
    }

    if (!isSupabaseConfigured) {
      setState({
        status: "ready",
        data: createMockProfilePageData(resolvedUsername),
        error: null,
        isMock: true,
      });
      return;
    }

    setState({ status: "loading", data: null, error: null, isMock: false });

    void getProfilePageData(resolvedUsername)
      .then((data) => {
        if (!isMounted) return;
        setState(
          data
            ? { status: "ready", data, error: null, isMock: false }
            : { status: "empty", data: null, error: null, isMock: false },
        );
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        setState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : String(error),
          isMock: false,
        });
      });

    return () => {
      isMounted = false;
    };
  }, [username]);

  if (state.status === "loading") {
    return (
      <ProfileShell>
        <div className="flex min-h-[420px] items-center justify-center border border-white/10 bg-white/[0.04]">
          <Loader2 className="h-8 w-8 animate-spin text-sky-300" />
        </div>
      </ProfileShell>
    );
  }

  if (state.status === "error") {
    return (
      <ProfileShell>
        <EmptyPanel
          icon={<AlertTriangle className="h-8 w-8" />}
          title="Profile could not be loaded"
          body={state.error}
        />
      </ProfileShell>
    );
  }

  if (state.status === "empty") {
    return (
      <ProfileShell>
        <EmptyPanel
          icon={<Lock className="h-8 w-8" />}
          title="Profile not found or private"
          body="Supabase RLS may hide private profiles from viewers who are not allowed to see them."
        />
      </ProfileShell>
    );
  }

  const isOwnProfile = user?.id === state.data.profile.id;
  const isPrivateForViewer =
    state.data.profile.profileVisibility === "private" && !isOwnProfile;
  const canShowComments =
    isOwnProfile || state.data.profile.commentsVisibility !== "private";

  return (
    <ProfileShell>
      {state.isMock ? (
        <div className="mb-4 border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
          Supabase env vars are missing, so this route is showing MVP fallback
          profile data.
        </div>
      ) : null}

      {isPrivateForViewer ? (
        <PrivateProfileState data={state.data} />
      ) : (
        <div className="space-y-5">
          <ProfileHeader data={state.data} />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <ProfileShowcaseGrid data={state.data} />
            <aside className="space-y-4">
              <ProfileSidePanel title="Online Status">
                <div className="inline-flex items-center gap-2 border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm font-bold text-emerald-100">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  Visible by privacy rules
                </div>
              </ProfileSidePanel>
              <ProfileSidePanel title="Featured Game">
                <FeaturedText
                  title={state.data.libraryPreview[0]?.title ?? "No featured game"}
                  body={
                    state.data.libraryPreview[0]
                      ? `${Math.floor(
                          state.data.libraryPreview[0].playtimeMinutes / 60,
                        )}h played`
                      : "Pick a featured game after library data exists."
                  }
                />
              </ProfileSidePanel>
              <ProfileSidePanel title="Featured Achievement">
                <FeaturedText
                  title={
                    state.data.achievementPreview[0]?.name ??
                    "No featured achievement"
                  }
                  body={
                    state.data.achievementPreview[0]?.description ??
                    "Achievements are read-only from the client in this MVP."
                  }
                />
              </ProfileSidePanel>
              <ProfileSidePanel title="Social Links">
                {state.data.socialLinks.length > 0 ? (
                  <div className="space-y-2">
                    {state.data.socialLinks.map((link) => (
                      <a
                        key={link.id}
                        className="flex items-center justify-between gap-3 border border-white/10 bg-black/20 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-sky-300/40"
                        href={link.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {link.label ?? link.platform}
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    No public social links yet.
                  </p>
                )}
              </ProfileSidePanel>
              {isOwnProfile ? (
                <Link
                  className="block bg-sky-400 px-4 py-3 text-center text-sm font-black text-slate-950 hover:bg-sky-300"
                  to="/settings/profile"
                >
                  Edit Profile
                </Link>
              ) : null}
            </aside>
          </div>

          {canShowComments ? (
            <ProfileComments comments={state.data.comments} />
          ) : (
            <ProfileSidePanel title="Guestbook">
              <p className="text-sm text-slate-400">
                Comments are private for this profile.
              </p>
            </ProfileSidePanel>
          )}
        </div>
      )}
    </ProfileShell>
  );
}

function ProfileShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}

function EmptyPanel({
  body,
  icon,
  title,
}: {
  body: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="grid min-h-[420px] place-items-center border border-white/10 bg-white/[0.04] p-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center border border-white/10 bg-white/[0.06] text-sky-200">
          {icon}
        </div>
        <h1 className="mt-5 text-3xl font-black text-white">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
      </div>
    </div>
  );
}

function PrivateProfileState({ data }: { data: ProfilePageData }) {
  return (
    <div className="overflow-hidden border border-white/10 bg-[#111827]">
      <div className="min-h-52 bg-gradient-to-br from-slate-900 via-slate-800 to-black" />
      <div className="-mt-12 p-6">
        <div className="flex items-end gap-4">
          <div className="flex h-24 w-24 items-center justify-center border border-white/20 bg-teal-400 text-2xl font-black text-slate-950">
            {data.profile.username.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-bold uppercase text-sky-200">
              @{data.profile.username}
            </p>
            <h1 className="text-4xl font-black text-white">Private Profile</h1>
          </div>
        </div>
        <p className="mt-5 max-w-xl text-sm leading-6 text-slate-400">
          This player keeps their room private. Library, activity, achievements,
          and comments are hidden by profile visibility rules.
        </p>
      </div>
    </div>
  );
}

function ProfileSidePanel({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="border border-white/10 bg-white/[0.05] p-5">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FeaturedText({ body, title }: { body: string; title: string }) {
  return (
    <div>
      <p className="font-bold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}

function createMockProfilePageData(username: string): ProfilePageData {
  const now = new Date().toISOString();

  return {
    profile: {
      id: "mock-user",
      username,
      displayName: "Demo Player",
      avatarUrl: null,
      bannerUrl: null,
      bio: "A customizable gaming profile with showcases, badges, comments, hardware, and privacy controls.",
      countryCode: "DE",
      language: "de",
      timezone: "Europe/Berlin",
      profileVisibility: "public",
      onlineStatusVisibility: "public",
      gameActivityVisibility: "friends_only",
      achievementVisibility: "public",
      libraryVisibility: "friends_only",
      wishlistVisibility: "public",
      commentsVisibility: "friends_only",
      profileThemeId: null,
      featuredBadgeId: null,
      featuredGameId: null,
      featuredAchievementId: null,
      profileLevel: 18,
      profileXp: 7400,
      isBanned: false,
      isDeleted: false,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    },
    theme: null,
    badges: [],
    socialLinks: [],
    hardware: {
      userId: "mock-user",
      cpu: "Ryzen 7",
      gpu: "RTX class GPU",
      ram: "32 GB",
      monitor: "144 Hz ultrawide",
      keyboard: "Low-profile mechanical",
      mouse: "Wireless esports mouse",
      headset: null,
      controller: null,
      setupImageUrl: null,
      visibility: "public",
      createdAt: now,
      updatedAt: now,
    },
    showcases: [],
    comments: [],
    activity: [
      {
        id: "mock-activity",
        userId: "mock-user",
        type: "achievement_unlocked",
        gameId: null,
        achievementId: null,
        visibility: "public",
        data: {},
        createdAt: now,
      },
    ],
    libraryPreview: [
      {
        id: "mock-library",
        gameId: "mock-game",
        title: "Neon Drift",
        coverUrl: null,
        playtimeMinutes: 1860,
        lastPlayedAt: now,
      },
    ],
    achievementPreview: [
      {
        id: "mock-achievement",
        achievementId: "mock-achievement",
        gameId: "mock-game",
        gameTitle: "Neon Drift",
        name: "Perfect Lap",
        description: "Finish a race without taking damage.",
        iconUrl: null,
        rarity: "rare",
        unlockedAt: now,
      },
    ],
    wishlistPreview: [],
    stats: {
      achievementsUnlocked: 1,
      friendsCount: 0,
      gamesOwned: 1,
      playtimeMinutes: 1860,
    },
  };
}
