import { AlertTriangle, ExternalLink, Loader2, Lock } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";

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
        <div className="flex min-h-[420px] items-center justify-center border-4 border-black bg-[#fff9ed] shadow-[7px_7px_0_#1f1c0f]">
          <Loader2 className="h-9 w-9 animate-spin text-[#b7102a]" />
        </div>
      </ProfileShell>
    );
  }

  if (state.status === "error") {
    return (
      <ProfileShell>
        <EmptyPanel
          icon={<AlertTriangle className="h-8 w-8" />}
          title="Profile Load Error"
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
          title="Profile Offline"
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

  function handleCommentsChange(comments: ProfilePageData["comments"]) {
    setState((current) =>
      current.status === "ready"
        ? { ...current, data: { ...current.data, comments } }
        : current,
    );
  }

  return (
    <ProfileShell>
      {state.isMock ? (
        <div className="neo-copy mb-4 border-[3px] border-black bg-[#f6edd8] p-4 text-[11px] font-black uppercase tracking-[0.08em] text-[#5b403f] shadow-[4px_4px_0_#1f1c0f]">
          Supabase env vars are missing, so this route is showing MVP fallback
          profile data.
        </div>
      ) : null}

      {isPrivateForViewer ? (
        <PrivateProfileState data={state.data} />
      ) : (
        <div className="space-y-5">
          <ProfileHeader data={state.data} isOwnProfile={isOwnProfile} />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <ProfileShowcaseGrid data={state.data} />
            <aside className="space-y-4">
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
                        className="neo-copy flex items-center justify-between gap-3 border-[3px] border-black bg-[#f6edd8] px-3 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-[#171411] shadow-[3px_3px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
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
                  <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[12px] font-bold uppercase leading-5 text-[#655f58]">
                    No public social links yet.
                  </p>
                )}
              </ProfileSidePanel>
            </aside>
          </div>

          {canShowComments ? (
            <ProfileComments
              canWrite={Boolean(user) && !state.isMock}
              comments={state.data.comments}
              currentUserId={user?.id ?? null}
              isMock={state.isMock}
              profileUserId={state.data.profile.id}
              onCommentsChange={handleCommentsChange}
            />
          ) : (
            <ProfileSidePanel title="Guestbook">
              <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[12px] font-bold uppercase leading-5 text-[#655f58]">
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
    <div className="mx-auto w-full max-w-[1220px] px-4 py-7 sm:px-6 lg:px-8">
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
    <div className="grid min-h-[420px] place-items-center border-4 border-black bg-[#fff9ed] p-8 text-center shadow-[7px_7px_0_#1f1c0f]">
      <div className="max-w-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center border-[3px] border-black bg-[#b7102a] text-white shadow-[4px_4px_0_#1f1c0f]">
          {icon}
        </div>
        <h1 className="neo-title mt-5 text-5xl leading-none text-[#171411]">
          {title}
        </h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-[#5b403f]">{body}</p>
      </div>
    </div>
  );
}

function PrivateProfileState({ data }: { data: ProfilePageData }) {
  return (
    <div className="overflow-hidden border-4 border-black bg-[#fff9ed] shadow-[7px_7px_0_#1f1c0f]">
      <div className="min-h-52 border-b-4 border-black bg-[repeating-linear-gradient(112deg,#171411_0_12px,#2f2b25_12px_24px,#007166_24px_27px)]" />
      <div className="-mt-12 p-6">
        <div className="flex items-end gap-4">
          <div className="neo-title flex h-24 w-24 items-center justify-center border-4 border-black bg-[#007166] text-3xl text-white shadow-[5px_5px_0_#1f1c0f]">
            {data.profile.username.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="neo-copy inline-block border-2 border-black bg-[#f6edd8] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
              @{data.profile.username}
            </p>
            <h1 className="neo-title mt-2 text-5xl leading-none text-[#171411]">
              Private Profile
            </h1>
          </div>
        </div>
        <p className="mt-5 max-w-xl text-sm font-semibold leading-6 text-[#5b403f]">
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
    <section className="border-4 border-black bg-[#fff9ed] p-5 shadow-[5px_5px_0_#1f1c0f]">
      <h2 className="neo-title border-b-[3px] border-black pb-3 text-3xl leading-none text-[#171411]">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FeaturedText({ body, title }: { body: string; title: string }) {
  return (
    <div>
      <p className="neo-title text-2xl leading-none text-[#171411]">{title}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-[#5b403f]">{body}</p>
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
      language: "en",
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
