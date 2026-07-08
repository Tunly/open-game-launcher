import { AlertTriangle, ExternalLink, Loader2, Lock } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { ProfileComments } from "../components/profile/ProfileComments";
import { ProfileHeader } from "../components/profile/ProfileHeader";
import { ProfilePrivacyGuardPanel } from "../components/profile/ProfilePrivacyGuardPanel";
import { ProfileShowcaseGrid } from "../components/profile/ProfileShowcaseGrid";
import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  applyProfilePrivacyGuard,
  canViewVisibility,
  createVerifyProfilePrivacyGuardData,
} from "../lib/profile-privacy-guard";
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
  const [searchParams] = useSearchParams();
  const { user } = useCurrentUser();
  const verifyMode = searchParams.get("verify");
  const isPrivacyGuardVerify =
    verifyMode === "profile-privacy-guard" || verifyMode === "public-profile-privacy-guard";
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

    if (isPrivacyGuardVerify) {
      setState({
        status: "ready",
        data: createVerifyProfilePrivacyGuardData(),
        error: null,
        isMock: true,
      });
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
  }, [isPrivacyGuardVerify, username]);

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

  const route = `/u/${state.data.profile.username}`;
  const isOwnProfile = user?.id === state.data.profile.id;
  const viewerContext = {
    isFriend: false,
    isOwnProfile,
    route,
  };
  const isPrivateForViewer = !canViewVisibility(
    state.data.profile.profileVisibility,
    viewerContext,
  );
  const { data: visibleData, guard: privacyGuard } = applyProfilePrivacyGuard(
    state.data,
    viewerContext,
  );
  const canShowComments = privacyGuard.laneStates.comments !== "guarded";

  function handleCommentsChange(comments: ProfilePageData["comments"]) {
    setState((current) =>
      current.status === "ready" ? { ...current, data: { ...current.data, comments } } : current,
    );
  }

  return (
    <ProfileShell>
      {state.isMock ? (
        <div className="neo-copy mb-4 border-[3px] border-black bg-[#8cf5e4] p-4 text-[11px] font-black uppercase tracking-[0.08em] text-[#171411] shadow-[4px_4px_0_#1f1c0f]">
          Local profile relay active: Supabase env vars are missing, so this public route is using
          deterministic launcher fallback data.
        </div>
      ) : null}

      {isPrivateForViewer ? (
        <PrivateProfileState data={state.data} />
      ) : (
        <div className="space-y-5">
          {isPrivacyGuardVerify ? <ProfilePrivacyGuardPanel guard={privacyGuard} /> : null}

          <ProfileIntelDeck data={visibleData} isMock={state.isMock} isOwnProfile={isOwnProfile} />
          <ProfileHeader
            canUseSocialActions={Boolean(user) && !state.isMock}
            data={visibleData}
            isOwnProfile={isOwnProfile}
          />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <ProfileShowcaseGrid data={visibleData} privacyGuard={privacyGuard} />
            <aside className="space-y-4">
              <ProfileSidePanel title="Featured Game">
                <FeaturedText
                  title={visibleData.libraryPreview[0]?.title ?? "No featured game"}
                  body={
                    visibleData.libraryPreview[0]
                      ? `${Math.floor(visibleData.libraryPreview[0].playtimeMinutes / 60)}h played`
                      : "Pick a featured game after library data exists."
                  }
                />
              </ProfileSidePanel>
              <ProfileSidePanel title="Featured Achievement">
                <FeaturedText
                  title={visibleData.achievementPreview[0]?.name ?? "No featured achievement"}
                  body={
                    visibleData.achievementPreview[0]?.description ??
                    "Achievements are read-only from the client in this MVP."
                  }
                />
              </ProfileSidePanel>
              <ProfileSidePanel title="Social Links">
                {visibleData.socialLinks.length > 0 ? (
                  <div className="space-y-2">
                    {visibleData.socialLinks.map((link) => (
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
              comments={visibleData.comments}
              currentUserId={user?.id ?? null}
              isMock={state.isMock}
              profileUserId={visibleData.profile.id}
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
  return <div className="mx-auto w-full max-w-[1220px] px-4 py-7 sm:px-6 lg:px-8">{children}</div>;
}

function ProfileIntelDeck({
  data,
  isMock,
  isOwnProfile,
}: {
  data: ProfilePageData;
  isMock: boolean;
  isOwnProfile: boolean;
}) {
  const { profile, stats } = data;
  const readouts = [
    ["Route", `/u/${profile.username}`],
    ["Access", profile.profileVisibility],
    ["Mode", isMock ? "Local fallback" : "Supabase live"],
    ["Viewer", isOwnProfile ? "Owner" : "Public"],
  ];

  return (
    <section className="overflow-hidden border-4 border-black bg-[#171411] shadow-[7px_7px_0_#1f1c0f]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="p-5 text-[#fff9ed] sm:p-6">
          <span className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#000]">
            Public Player Card
          </span>
          <h1 className="neo-title mt-3 text-5xl leading-none md:text-7xl">
            {profile.displayName ?? profile.username}
          </h1>
          <p className="neo-copy mt-3 max-w-3xl text-[11px] font-black uppercase leading-5 text-[#8cf5e4]">
            Manga-profile dossier for library flex, rare unlocks, hardware rig, social links, and
            guestbook activity inside the OG-Launcher network.
          </p>
        </div>
        <div className="grid grid-cols-2 border-t-4 border-black bg-[#fff9ed] lg:border-l-4 lg:border-t-0">
          {readouts.map(([label, value]) => (
            <div key={label} className="min-w-0 border-b-[3px] border-r-[3px] border-black p-4">
              <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                {label}
              </p>
              <p className="neo-title mt-2 truncate text-2xl leading-none text-[#171411]">
                {value}
              </p>
            </div>
          ))}
          <div className="col-span-2 grid grid-cols-3 gap-0">
            {[
              ["Games", stats.gamesOwned],
              ["Hours", Math.floor(stats.playtimeMinutes / 60)],
              ["Friends", stats.friendsCount],
            ].map(([label, value]) => (
              <div key={label} className="border-r-[3px] border-black bg-[#f6edd8] p-4">
                <p className="neo-title text-3xl leading-none text-[#b7102a]">{value}</p>
                <p className="neo-copy mt-1 text-[9px] font-black uppercase text-[#5b403f]">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyPanel({ body, icon, title }: { body: string; icon: ReactNode; title: string }) {
  return (
    <div className="grid min-h-[420px] place-items-center border-4 border-black bg-[#fff9ed] p-8 text-center shadow-[7px_7px_0_#1f1c0f]">
      <div className="max-w-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center border-[3px] border-black bg-[#b7102a] text-white shadow-[4px_4px_0_#1f1c0f]">
          {icon}
        </div>
        <h1 className="neo-title mt-5 text-5xl leading-none text-[#171411]">{title}</h1>
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
            <h1 className="neo-title mt-2 text-5xl leading-none text-[#171411]">Private Profile</h1>
          </div>
        </div>
        <p className="mt-5 max-w-xl text-sm font-semibold leading-6 text-[#5b403f]">
          This player keeps their room private. Library, activity, achievements, and comments are
          hidden by profile visibility rules.
        </p>
      </div>
    </div>
  );
}

function ProfileSidePanel({ children, title }: { children: ReactNode; title: string }) {
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
      appShellSkinId: null,
      customTheme: null,
      username,
      displayName: `${username} Prime`,
      avatarUrl: null,
      bannerUrl: null,
      bio: "Retro launcher profile tuned for speedruns, co-op nights, rare badge hunts, and hardware brag panels.",
      countryCode: "DE",
      language: "en",
      timezone: "Europe/Berlin",
      profileVisibility: "public",
      onlineStatusVisibility: "public",
      gameActivityVisibility: "friends_only",
      achievementVisibility: "public",
      libraryVisibility: "friends_only",
      wishlistVisibility: "public",
      commentsVisibility: "public",
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
    badges: [
      {
        id: "mock-badge-founder",
        userId: "mock-user",
        key: "founder",
        name: "Founder",
        description: "Early OG-Launcher profile badge.",
        iconUrl: null,
        rarity: "legendary",
        source: "founder",
        earnedAt: now,
      },
      {
        id: "mock-badge-arcade",
        userId: "mock-user",
        key: "arcade-rat",
        name: "Arcade Rat",
        description: "Played across several libraries this week.",
        iconUrl: null,
        rarity: "rare",
        source: "system",
        earnedAt: now,
      },
      {
        id: "mock-badge-tuner",
        userId: "mock-user",
        key: "rig-tuner",
        name: "Rig Tuner",
        description: "Shared a public hardware setup.",
        iconUrl: null,
        rarity: "epic",
        source: "event",
        earnedAt: now,
      },
    ],
    socialLinks: [
      {
        id: "mock-social-speedrun",
        userId: "mock-user",
        platform: "speedrun",
        label: "Speedrun Board",
        url: "https://example.com/speedrun",
        sortOrder: 0,
        visibility: "public",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "mock-social-clips",
        userId: "mock-user",
        platform: "clips",
        label: "Match Clips",
        url: "https://example.com/clips",
        sortOrder: 1,
        visibility: "public",
        createdAt: now,
        updatedAt: now,
      },
    ],
    hardware: {
      userId: "mock-user",
      cpu: "Ryzen 7",
      gpu: "RTX class GPU",
      ram: "32 GB",
      monitor: "144 Hz ultrawide",
      keyboard: "Low-profile mechanical",
      mouse: "Wireless esports mouse",
      headset: null,
      setupImageUrl: null,
      visibility: "public",
      createdAt: now,
      updatedAt: now,
    },
    showcases: [],
    comments: [
      {
        id: "mock-comment-1",
        profileUserId: "mock-user",
        authorId: "mock-friend-1",
        body: "Clean launch panel. Invite me when the Neon Drift lobby opens.",
        parentCommentId: null,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        author: {
          id: "mock-friend-1",
          username: "packetghost",
          displayName: "Packet Ghost",
          avatarUrl: null,
        },
      },
      {
        id: "mock-comment-2",
        profileUserId: "mock-user",
        authorId: "mock-friend-2",
        body: "That Perfect Lap unlock belongs in the top strip.",
        parentCommentId: null,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        author: {
          id: "mock-friend-2",
          username: "tealshift",
          displayName: "Teal Shift",
          avatarUrl: null,
        },
      },
    ],
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
      {
        id: "mock-activity-2",
        userId: "mock-user",
        type: "wishlist_added",
        gameId: "mock-game-2",
        achievementId: null,
        visibility: "public",
        data: {},
        createdAt: now,
      },
      {
        id: "mock-activity-3",
        userId: "mock-user",
        type: "hardware_updated",
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
      {
        id: "mock-library-2",
        gameId: "mock-game-2",
        title: "Mecha Signal",
        coverUrl: null,
        playtimeMinutes: 920,
        lastPlayedAt: now,
      },
      {
        id: "mock-library-3",
        gameId: "mock-game-3",
        title: "Phantom Arcade",
        coverUrl: null,
        playtimeMinutes: 540,
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
      {
        id: "mock-achievement-2",
        achievementId: "mock-achievement-2",
        gameId: "mock-game-2",
        gameTitle: "Mecha Signal",
        name: "Boss Rush Clear",
        description: "Clear the late-night rush board without a continue.",
        iconUrl: null,
        rarity: "epic",
        unlockedAt: now,
      },
    ],
    wishlistPreview: [
      {
        id: "mock-wishlist-1",
        gameId: "mock-wish-1",
        title: "Circuit Witches",
        coverUrl: null,
        addedAt: now,
      },
      {
        id: "mock-wishlist-2",
        gameId: "mock-wish-2",
        title: "Chrome Dungeon",
        coverUrl: null,
        addedAt: now,
      },
    ],
    stats: {
      achievementsUnlocked: 42,
      friendsCount: 12,
      gamesOwned: 18,
      playtimeMinutes: 3320,
    },
  };
}
