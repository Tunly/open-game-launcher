import {
  BookOpen,
  CheckCircle2,
  Compass,
  Flag,
  Gamepad2,
  Heart,
  Image as ImageIcon,
  KeyRound,
  MessageSquare,
  Newspaper,
  Radio,
  Search,
  Shield,
  ShoppingCart,
  Signal,
  Star,
  Trash2,
  Trophy,
  UploadCloud,
  Users,
  Video,
  Wrench,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { ActivityFeed } from "../components/friends/ActivityFeed";
import { BroadcastChatModerationShadowPanel } from "../components/community/BroadcastChatModerationShadowPanel";
import { BroadcastAudienceStatusContractPanel } from "../components/community/BroadcastAudienceStatusContractPanel";
import { BroadcastProviderCallbackContractPanel } from "../components/community/BroadcastProviderCallbackContractPanel";
import { BroadcastProviderOAuthContractPanel } from "../components/community/BroadcastProviderOAuthContractPanel";
import { BroadcastProviderReadinessPanel } from "../components/community/BroadcastProviderReadinessPanel";
import { BroadcastLiveSessionRehearsalPanel } from "../components/community/BroadcastLiveSessionRehearsalPanel";
import { BroadcastRtmpDryRunPanel } from "../components/community/BroadcastRtmpDryRunPanel";
import { BroadcastVodArchivePolicyPanel } from "../components/community/BroadcastVodArchivePolicyPanel";
import {
  buildBroadcastReadinessPlan,
  type BroadcastChannelCandidate,
  type BroadcastPlannedChannel,
  type BroadcastReadinessPlan,
} from "../lib/broadcast-readiness";
import { createVerifyBroadcastAudienceStatusContract } from "../lib/broadcast-audience-status-contract";
import {
  buildBroadcastProviderReadiness,
  createVerifyBroadcastProviderReadiness,
} from "../lib/broadcast-provider-readiness";
import { createVerifyBroadcastChatModerationShadowQueue } from "../lib/broadcast-chat-moderation-shadow";
import { createVerifyBroadcastProviderCallbackContract } from "../lib/broadcast-provider-callback-contract";
import { createVerifyBroadcastLiveSessionRehearsal } from "../lib/broadcast-live-session-rehearsal";
import { createVerifyBroadcastProviderOAuthContract } from "../lib/broadcast-provider-oauth-contract";
import { createVerifyBroadcastRtmpDryRunPacket } from "../lib/broadcast-rtmp-dry-run";
import { createVerifyBroadcastVodArchivePolicy } from "../lib/broadcast-vod-archive-policy";
import {
  clearBroadcastStreamKeySecret,
  getBroadcastStreamKeyVaultStatus,
  setBroadcastStreamKeySecret,
} from "../lib/launcher";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { postActivity } from "../lib/supabase/activity";
import { getFriends } from "../lib/supabase/profile";
import type { BroadcastStreamKeyVaultStatus } from "../lib/types";

const BROADCAST_VAULT_CHANNEL_ID = "local-preview";
const BROADCAST_VAULT_PROVIDER = "twitch" as const;
const COMMUNITY_LOCAL_POSTS_STORAGE_KEY = "og-launcher:community-posts:v1";
const COMMUNITY_LOCAL_POST_LIMIT = 5;
const COMMUNITY_LOCAL_POST_MAX_LENGTH = 120;
const COMMUNITY_STATUS_MAX_LENGTH = 1000;
const COMMUNITY_VERIFY_ROUTES = new Set([
  "community-preview",
  "community-create-post",
  "broadcasting-readiness",
  "broadcasting-provider-live-readiness",
  "broadcasting-rtmp-dry-run",
  "broadcasting-chat-moderation-shadow",
  "broadcasting-vod-archive-policy",
  "broadcasting-provider-oauth-contract",
  "broadcasting-provider-callback-contract",
  "broadcasting-live-session-rehearsal",
  "broadcasting-audience-status-contract",
]);

type CommunityContentType =
  "all" | "artwork" | "broadcasts" | "videos" | "workshop" | "news" | "guides" | "reviews";

type CommunitySortMode = "popular" | "recent";
type CommunitySectionId = "home" | "discussions" | "workshop" | "market" | "broadcasts";

type CommunityActivityItem = {
  artClass: string;
  author: string;
  channel: string;
  hubId: string;
  headline: string;
  heat: number;
  id: string;
  meta: string;
  recentRank: number;
  summary: string;
  tone: string;
  type: Exclude<CommunityContentType, "all">;
};

type CommunityLocalPost = {
  body: string;
  createdAt: string;
  id: string;
  persisted: boolean;
};

type CommunitySection = {
  cards: Array<{
    label: string;
    meta: string;
    value: string;
  }>;
  description: string;
  filter: CommunityContentType;
  id: CommunitySectionId;
  kicker: string;
  label: string;
  stat: string;
  statLabel: string;
  title: string;
  tone: string;
};

type CommunityHub = {
  artClass: string;
  broadcasts: number;
  description: string;
  discussions: number;
  id: string;
  marketListings: number;
  meta: string;
  members: string;
  stat: string;
  tags: string[];
  title: string;
  workshopItems: number;
};

type CommunityDiscussionTopic = {
  author: string;
  hubId: string;
  id: string;
  replies: string[];
  status: "open" | "pinned" | "locked";
  title: string;
  updated: string;
};

type CommunityWorkshopItem = {
  creator: string;
  downloads: string;
  hubId: string;
  id: string;
  title: string;
};

type CommunityMarketListing = {
  hubId: string;
  id: string;
  price: string;
  seller: string;
  title: string;
};

type CommunityModerationItem = {
  content: string;
  id: string;
  reason: string;
  status: "pending" | "cleared" | "hidden";
};

function readCommunityLocalPosts(): CommunityLocalPost[] {
  try {
    const rawPosts = window.localStorage.getItem(COMMUNITY_LOCAL_POSTS_STORAGE_KEY);
    if (!rawPosts) return [];

    const parsedPosts: unknown = JSON.parse(rawPosts);
    if (!Array.isArray(parsedPosts)) return [];

    return parsedPosts
      .map((post, index) => toCommunityLocalPost(post, index))
      .filter((post): post is CommunityLocalPost => Boolean(post))
      .slice(0, COMMUNITY_LOCAL_POST_LIMIT);
  } catch {
    return [];
  }
}

function toCommunityLocalPost(value: unknown, index: number): CommunityLocalPost | null {
  if (!value || typeof value !== "object") return null;

  const post = value as Record<string, unknown>;
  if (typeof post.body !== "string") return null;

  const body = post.body.trim().slice(0, COMMUNITY_LOCAL_POST_MAX_LENGTH);
  if (!body) return null;

  return {
    body,
    createdAt:
      typeof post.createdAt === "string" && post.createdAt.trim()
        ? post.createdAt
        : "browser-local",
    id: typeof post.id === "string" && post.id.trim() ? post.id : `browser-local-${index}`,
    persisted: true,
  };
}

function writeCommunityLocalPosts(posts: CommunityLocalPost[]) {
  try {
    window.localStorage.setItem(
      COMMUNITY_LOCAL_POSTS_STORAGE_KEY,
      JSON.stringify(posts.slice(0, COMMUNITY_LOCAL_POST_LIMIT)),
    );
    return true;
  } catch {
    return false;
  }
}

function createCommunityLocalPostId() {
  return `browser-local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createVerifyCommunityLocalPostProof(): CommunityLocalPost[] {
  return [
    {
      body: "Verify route local proof post",
      createdAt: "2026-06-14T00:00:00.000Z",
      id: "verify-community-create-post",
      persisted: false,
    },
  ];
}

const communitySections: CommunitySection[] = [
  {
    cards: [
      { label: "Pinned signal", meta: "Official events and hot threads", value: "Arcade lobby" },
      { label: "Local lane", meta: "Browser posts stay on this machine", value: "Post board" },
      { label: "Next jump", meta: "Broadcast preflight stays local-only", value: "Stream desk" },
    ],
    description:
      "A compact launcher board for hubs, player posts, squads, guides, artwork, and local broadcast staging.",
    filter: "all",
    id: "home",
    kicker: "Front board",
    label: "Home",
    stat: "128",
    statLabel: "players online",
    title: "Live Arcade Lobby",
    tone: "bg-[#b7102a] text-white",
  },
  {
    cards: [
      { label: "Hot topic", meta: "Balance debate needs votes", value: "Boss rush" },
      { label: "Guide ask", meta: "Route notes requested", value: "Stealth map" },
      { label: "Local posts", meta: "Create Post writes browser-local", value: "Draft lane" },
    ],
    description:
      "Discussion cards favor player questions, reviews, guide requests, and browser-local posts.",
    filter: "reviews",
    id: "discussions",
    kicker: "Forum deck",
    label: "Discussions",
    stat: "14",
    statLabel: "active groups",
    title: "Thread Relay",
    tone: "bg-[#087d6d] text-white",
  },
  {
    cards: [
      { label: "Build drop", meta: "Hard-mode squad script", value: "Raid slot" },
      { label: "Mod queue", meta: "Workshop tags reviewed", value: "24 builds" },
      { label: "Safe launch", meta: "No provider writes", value: "Local proof" },
    ],
    description:
      "Workshop mode narrows the feed to builds, squad tools, mod-style drops, and launcher-safe previews.",
    filter: "workshop",
    id: "workshop",
    kicker: "Creator bench",
    label: "Workshop",
    stat: "24",
    statLabel: "builds staged",
    title: "Workshop Dispatch",
    tone: "bg-[#171411] text-[#8cf5e4]",
  },
  {
    cards: [
      { label: "Artwork desk", meta: "Community panels and cover drops", value: "18 drops" },
      { label: "Trade lane", meta: "Cosmetic requests only", value: "No checkout" },
      { label: "Gallery guard", meta: "Hosted rollout remains gated", value: "Local deck" },
    ],
    description:
      "Market mode shows community artwork, collection requests, and non-commerce showcase signals.",
    filter: "artwork",
    id: "market",
    kicker: "Market board",
    label: "Market",
    stat: "18",
    statLabel: "art drops",
    title: "Poster Market",
    tone: "bg-[#8cf5e4] text-[#171411]",
  },
  {
    cards: [
      { label: "Broadcast desk", meta: "Local readiness only", value: "3 lanes" },
      { label: "RTMP guard", meta: "No socket or provider publish", value: "Dry-run" },
      { label: "Audience state", meta: "Contract preview without mutation", value: "Review" },
    ],
    description:
      "Broadcasts collect tournaments, local stream rehearsal, audience-status contracts, and guarded RTMP packets.",
    filter: "broadcasts",
    id: "broadcasts",
    kicker: "Stream booth",
    label: "Broadcasts",
    stat: "03",
    statLabel: "live brackets",
    title: "Broadcast Switchboard",
    tone: "bg-[#b7102a] text-white",
  },
];

const contentFilters: Array<{
  icon: typeof Signal;
  id: CommunityContentType;
  label: string;
}> = [
  { icon: Star, id: "all", label: "All" },
  { icon: ImageIcon, id: "artwork", label: "Artwork" },
  { icon: Radio, id: "broadcasts", label: "Broadcasts" },
  { icon: Video, id: "videos", label: "Videos" },
  { icon: Wrench, id: "workshop", label: "Workshop" },
  { icon: Newspaper, id: "news", label: "News" },
  { icon: BookOpen, id: "guides", label: "Guides" },
  { icon: MessageSquare, id: "reviews", label: "Reviews" },
];

const popularHubs: CommunityHub[] = [
  {
    artClass: "library-art-tokyo",
    broadcasts: 3,
    description: "Racing hub with ranked lobbies, lap replays, build guides, and tournament cuts.",
    discussions: 48,
    id: "neo-tokyo-drift",
    marketListings: 12,
    meta: "36 new guides this week",
    members: "12.4k",
    stat: "12.4k members",
    tags: ["racing", "arcade", "ranked"],
    title: "Neo-Tokyo Drift",
    workshopItems: 17,
  },
  {
    artClass: "library-art-mech",
    broadcasts: 1,
    description: "Co-op mech hub for raid squads, workshop loadouts, and community cover art.",
    discussions: 34,
    id: "steel-battalion-x",
    marketListings: 9,
    meta: "18 new artwork drops",
    members: "8.7k",
    stat: "8.7k members",
    tags: ["co-op", "mech", "raid"],
    title: "Steel Battalion X",
    workshopItems: 24,
  },
  {
    artClass: "library-art-phantom",
    broadcasts: 2,
    description: "Stealth puzzle hub with route maps, tournament brackets, and guide revisions.",
    discussions: 21,
    id: "netrunner-phantom",
    marketListings: 5,
    meta: "9 fresh discussions",
    members: "5.2k",
    stat: "5.2k members",
    tags: ["stealth", "puzzle", "tournament"],
    title: "Netrunner Phantom",
    workshopItems: 8,
  },
];

const peopleMatches = [
  ["KiraByte", "In Neo-Tokyo Drift", "online"],
  ["NullVector", "Browsing workshop builds", "away"],
  ["ArcLight", "Posted a new guide", "online"],
] as const;

type PeopleMatch = (typeof peopleMatches)[number];

const activityFeed: CommunityActivityItem[] = [
  {
    artClass: "library-art-tokyo",
    author: "OG Dispatch",
    channel: "Patch Notes",
    hubId: "neo-tokyo-drift",
    heat: 98,
    headline: "Neo-Tokyo Drift ranked queue opens",
    id: "news-neo-ranked",
    meta: "12 min // 248 reactions",
    recentRank: 1,
    summary: "Official update thread with balance notes, driver tags, and event comments.",
    tone: "bg-[#b7102a] text-white",
    type: "news",
  },
  {
    artClass: "library-art-mech",
    author: "Redline Unit",
    channel: "Squad Search",
    hubId: "steel-battalion-x",
    heat: 86,
    headline: "Steel Battalion X raid slot free",
    id: "workshop-steel-raid",
    meta: "22 min // 4 slots",
    recentRank: 2,
    summary: "Players are forming a hard-mode group with voice and cross-play tags.",
    tone: "bg-[#087d6d] text-white",
    type: "workshop",
  },
  {
    artClass: "library-art-phantom",
    author: "ArcLight",
    channel: "Tournament",
    hubId: "netrunner-phantom",
    heat: 74,
    headline: "Netrunner Phantom Cup locks Friday",
    id: "broadcast-phantom-cup",
    meta: "1 hr // 96 registered",
    recentRank: 3,
    summary: "Community bracket page, replay requests, and rules questions in one thread.",
    tone: "bg-[#efe6d4] text-[#171411]",
    type: "broadcasts",
  },
  {
    artClass: "library-art-mech",
    author: "PanelForge",
    channel: "Artwork",
    hubId: "steel-battalion-x",
    heat: 71,
    headline: "Steel Battalion zine cover wins",
    id: "art-steel-cover",
    meta: "2 hr // 18 remixes",
    recentRank: 4,
    summary: "Panel-frame cover art, creator notes, and local gallery requests are pinned.",
    tone: "bg-[#8cf5e4] text-[#171411]",
    type: "artwork",
  },
  {
    artClass: "library-art-tokyo",
    author: "KiraByte",
    channel: "Replay Lab",
    hubId: "neo-tokyo-drift",
    heat: 69,
    headline: "Drift lap replay cut uploads",
    id: "video-drift-replay",
    meta: "3 hr // 41 clips",
    recentRank: 5,
    summary: "Short run breakdowns with route tags, timing notes, and local clip metadata.",
    tone: "bg-[#171411] text-[#8cf5e4]",
    type: "videos",
  },
  {
    artClass: "library-art-phantom",
    author: "NullVector",
    channel: "Guide Desk",
    hubId: "netrunner-phantom",
    heat: 65,
    headline: "Netrunner stealth route map",
    id: "guide-phantom-route",
    meta: "5 hr // 12 revisions",
    recentRank: 6,
    summary: "Community guide edits track safe routes, timing windows, and spoiler tags.",
    tone: "bg-[#efe6d4] text-[#171411]",
    type: "guides",
  },
  {
    artClass: "library-art-tokyo",
    author: "BossFrame",
    channel: "Discussion",
    hubId: "neo-tokyo-drift",
    heat: 61,
    headline: "Boss rush thread flags balance",
    id: "review-boss-rush",
    meta: "6 hr // 73 replies",
    recentRank: 7,
    summary: "Player review thread with patch questions, build notes, and local post handoff.",
    tone: "bg-[#087d6d] text-white",
    type: "reviews",
  },
];

const discussionTopics: CommunityDiscussionTopic[] = [
  {
    author: "KiraByte",
    hubId: "neo-tokyo-drift",
    id: "topic-drift-balance",
    replies: [
      "Brake assist feels heavy after the patch.",
      "Counterpoint: hairpins finally reward timing.",
    ],
    status: "pinned",
    title: "Ranked balance notes and drift assist",
    updated: "12 min",
  },
  {
    author: "NullVector",
    hubId: "netrunner-phantom",
    id: "topic-phantom-route",
    replies: ["Route B skips the camera sweep if you delay two beats."],
    status: "open",
    title: "Stealth route map corrections",
    updated: "44 min",
  },
  {
    author: "ArcLight",
    hubId: "steel-battalion-x",
    id: "topic-steel-raid",
    replies: ["Looking for one shield build and one repair pilot."],
    status: "open",
    title: "Hard-mode raid squad finder",
    updated: "1 hr",
  },
];

const workshopItems: CommunityWorkshopItem[] = [
  {
    creator: "NullVector",
    downloads: "1.8k",
    hubId: "steel-battalion-x",
    id: "workshop-raid-script",
    title: "Raid Signal Loadout Script",
  },
  {
    creator: "KiraByte",
    downloads: "940",
    hubId: "neo-tokyo-drift",
    id: "workshop-drift-hud",
    title: "Drift Sector HUD Overlay",
  },
  {
    creator: "ArcLight",
    downloads: "620",
    hubId: "netrunner-phantom",
    id: "workshop-route-cards",
    title: "Route Card Pack",
  },
];

const marketListings: CommunityMarketListing[] = [
  {
    hubId: "steel-battalion-x",
    id: "market-mech-poster",
    price: "18 local credits",
    seller: "PanelForge",
    title: "Mech Poster Variant",
  },
  {
    hubId: "neo-tokyo-drift",
    id: "market-neon-badge",
    price: "9 local credits",
    seller: "KiraByte",
    title: "Neon Driver Badge",
  },
  {
    hubId: "netrunner-phantom",
    id: "market-phantom-card",
    price: "12 local credits",
    seller: "NullVector",
    title: "Phantom Route Card",
  },
];

const moderationQueue: CommunityModerationItem[] = [
  {
    content: "Spoiler artwork without tag",
    id: "mod-spoiler-shot",
    reason: "Missing spoiler tag",
    status: "pending",
  },
  {
    content: "Workshop item duplicate report",
    id: "mod-workshop-dupe",
    reason: "Duplicate content review",
    status: "pending",
  },
];

const squads = [
  ["Redline Unit", "12 online", "Racing / Arcade"],
  ["Cipher Core", "8 online", "Puzzle / Hacking"],
  ["Iron Choir", "24 online", "Action / RPG"],
];

const leaderboard = [
  ["01", "KiraByte", "9.842"],
  ["02", "NullVector", "8.119"],
  ["03", "ArcLight", "7.604"],
];

const relays = [
  ["Community", "128", "players online", Signal],
  ["Discussions", "14", "active groups", Users],
  ["Broadcasts", "03", "live brackets", Radio],
];

function CommunityArtPanel() {
  return (
    <div className="hero-art relative min-h-[250px] overflow-hidden border-4 border-black p-4 shadow-[6px_6px_0_#171411]">
      <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,249,237,0.16)_1px,transparent_1px)] bg-[length:8px_8px]" />
      <div className="relative flex h-full min-h-[218px] flex-col justify-between">
        <span className="neo-copy w-fit border-2 border-black bg-[#8cf5e4] px-3 py-1 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
          Community relay
        </span>

        <div>
          <div className="mb-3 grid h-16 w-16 place-items-center border-[3px] border-black bg-[#b7102a] text-white shadow-[3px_3px_0_#000]">
            <Gamepad2 className="h-9 w-9" />
          </div>
          <h2 className="neo-title text-4xl leading-none text-[#fff9ed] [text-shadow:3px_3px_0_#171411]">
            Live Arcade
          </h2>
          <p className="neo-copy mt-2 max-w-[290px] text-[10px] font-black uppercase leading-5 text-[#f5eedf]">
            Feed, squads, rankings, and event slots in one launcher board.
          </p>
        </div>
      </div>
    </div>
  );
}

function RelayCard({
  icon: Icon,
  label,
  meta,
  value,
}: {
  icon: typeof Signal;
  label: string;
  meta: string;
  value: string;
}) {
  return (
    <div className="border-4 border-black bg-[#f5eedf] p-4 shadow-[4px_4px_0_#171411]">
      <div className="flex items-center justify-between gap-3">
        <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
          {label}
        </p>
        <Icon className="h-5 w-5 text-[#b7102a]" />
      </div>
      <p className="neo-title mt-3 text-5xl leading-none text-[#171411]">{value}</p>
      <p className="neo-copy mt-1 text-[9px] font-black uppercase text-[#5b403f]">{meta}</p>
    </div>
  );
}

export function CommunityPage() {
  const verifyMode = new URLSearchParams(window.location.search).get("verify");

  return verifyMode && COMMUNITY_VERIFY_ROUTES.has(verifyMode) ? (
    <CommunityVerificationPage />
  ) : (
    <CommunityLivePage />
  );
}

function CommunityLivePage() {
  const { error: authError, isConfigured, isLoading: isAuthLoading, user } = useCurrentUser();
  const userId = user?.id ?? null;
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [isFriendsLoading, setIsFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [friendsRefreshVersion, setFriendsRefreshVersion] = useState(0);
  const [feedVersion, setFeedVersion] = useState(0);
  const [statusDraft, setStatusDraft] = useState("");
  const [isPostingStatus, setIsPostingStatus] = useState(false);
  const [postMessage, setPostMessage] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const trimmedStatusDraft = statusDraft.trim();
  const canUseCommunity = isConfigured && !isAuthLoading && Boolean(userId);
  const friendCountLabel =
    canUseCommunity && !isFriendsLoading && !friendsError ? String(friendIds.length) : "—";

  useEffect(() => {
    if (!isConfigured || !userId) {
      setFriendIds([]);
      setFriendsError(null);
      setIsFriendsLoading(false);
      return;
    }

    let active = true;
    setIsFriendsLoading(true);
    setFriendsError(null);

    void getFriends(userId)
      .then((friends) => {
        if (!active) return;

        const nextFriendIds = Array.from(
          new Set(
            friends
              .map((friendship) =>
                friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId,
              )
              .filter((friendId) => friendId && friendId !== userId),
          ),
        );
        setFriendIds(nextFriendIds);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setFriendIds([]);
        setFriendsError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setIsFriendsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [friendsRefreshVersion, isConfigured, userId]);

  async function handlePostStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUseCommunity || !trimmedStatusDraft || isPostingStatus) return;

    setIsPostingStatus(true);
    setPostError(null);
    setPostMessage(null);

    try {
      await postActivity("status", {
        metadata: { text: trimmedStatusDraft },
        visibility: "friends_only",
      });
      setStatusDraft("");
      setPostMessage("Status posted to your accepted friends.");
      setFeedVersion((version) => version + 1);
    } catch (error) {
      setPostError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPostingStatus(false);
    }
  }

  let feedContent;
  if (isAuthLoading) {
    feedContent = <CommunityLiveNotice copy="Checking your community session..." />;
  } else if (!isConfigured) {
    feedContent = (
      <CommunityLiveNotice copy="Community is unavailable because Supabase is not configured for this launcher build." />
    );
  } else if (authError) {
    feedContent = (
      <CommunityLiveNotice copy={`Community sign-in failed: ${authError}`} tone="error" />
    );
  } else if (!userId) {
    feedContent = (
      <CommunityLiveNotice copy="Sign in to load friend activity and publish friends-only status posts." />
    );
  } else if (isFriendsLoading) {
    feedContent = <CommunityLiveNotice copy="Loading accepted friends and activity..." />;
  } else if (friendsError) {
    feedContent = (
      <div className="space-y-3">
        <CommunityLiveNotice
          copy={`Friend activity could not be loaded: ${friendsError}`}
          tone="error"
        />
        <button
          className="neo-copy inline-flex h-10 items-center border-[3px] border-black bg-[#8cf5e4] px-4 text-[10px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#fff9ed]"
          onClick={() => setFriendsRefreshVersion((version) => version + 1)}
          type="button"
        >
          Retry live feed
        </button>
      </div>
    );
  } else {
    feedContent = (
      <>
        {friendIds.length === 0 ? (
          <CommunityLiveNotice copy="You have no accepted friends yet. Your feed can still show your own visible activity; add friends to receive their updates." />
        ) : null}
        <ActivityFeed friendIds={friendIds} key={feedVersion} />
      </>
    );
  }

  return (
    <section className="neo-dots space-y-5">
      <header
        aria-label="Community live activity"
        className="border-4 border-black bg-[#171411] p-5 text-[#fff9ed] shadow-[6px_6px_0_#b7102a]"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="neo-copy inline-flex border-2 border-black bg-[#8cf5e4] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#171411] shadow-[2px_2px_0_#000]">
              Supabase live relay
            </p>
            <h1 className="neo-title mt-3 text-5xl leading-none text-[#fff9ed] md:text-7xl">
              Community Activity
            </h1>
            <p className="neo-copy mt-3 max-w-2xl text-[11px] font-black uppercase leading-5 text-[#8cf5e4]">
              Real launcher activity shared under your account and privacy rules. No local hub,
              market, workshop, or moderation fixtures are shown here.
            </p>
          </div>
          <div className="border-[3px] border-black bg-[#f5eedf] px-4 py-3 text-[#171411] shadow-[3px_3px_0_#8cf5e4]">
            <p className="neo-copy text-[9px] font-black uppercase tracking-[0.14em] text-[#5b403f]">
              Accepted friends
            </p>
            <p className="neo-title mt-1 text-4xl leading-none">{friendCountLabel}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section
          aria-label="Community feed"
          className="border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]"
        >
          <div className="border-b-4 border-black bg-[#efe6d4] p-4">
            <p className="neo-copy text-[10px] font-black uppercase tracking-[0.14em] text-[#b7102a]">
              Friends-only data lane
            </p>
            <h2 className="neo-title mt-1 text-4xl leading-none text-[#171411]">Activity Feed</h2>
          </div>
          <div className="space-y-4 p-4">{feedContent}</div>
        </section>

        <aside className="space-y-5">
          <form
            aria-label="Friends-only status composer"
            className="border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411]"
            onSubmit={(event) => void handlePostStatus(event)}
          >
            <div className="flex items-center gap-3 border-b-[3px] border-black pb-3">
              <span className="grid h-10 w-10 place-items-center border-[3px] border-black bg-[#087d6d] text-white shadow-[2px_2px_0_#171411]">
                <MessageSquare aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <p className="neo-copy text-[9px] font-black uppercase tracking-[0.14em] text-[#b7102a]">
                  Real account post
                </p>
                <h2 className="neo-title text-3xl leading-none text-[#171411]">Share Status</h2>
              </div>
            </div>
            <label
              className="neo-copy mt-4 block text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]"
              htmlFor="community-live-status"
            >
              Status for accepted friends
            </label>
            <textarea
              className="mt-2 min-h-32 w-full resize-y border-[3px] border-black bg-[#f5eedf] p-3 text-sm font-bold leading-5 text-[#171411] shadow-[3px_3px_0_#171411] outline-none focus:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canUseCommunity || isPostingStatus}
              id="community-live-status"
              maxLength={COMMUNITY_STATUS_MAX_LENGTH}
              onChange={(event) => setStatusDraft(event.target.value)}
              placeholder="What are you playing?"
              value={statusDraft}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="neo-copy text-[9px] font-black uppercase text-[#655f58]">
                {statusDraft.length}/{COMMUNITY_STATUS_MAX_LENGTH} // friends only
              </span>
              <button
                className="neo-copy inline-flex h-10 items-center gap-2 border-[3px] border-black bg-[#b7102a] px-4 text-[10px] font-black uppercase text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#087d6d] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
                disabled={!canUseCommunity || !trimmedStatusDraft || isPostingStatus}
                type="submit"
              >
                <MessageSquare aria-hidden="true" className="h-4 w-4" />
                {isPostingStatus ? "Posting..." : "Post status"}
              </button>
            </div>
            {postMessage ? (
              <p
                aria-live="polite"
                className="neo-copy mt-4 border-[3px] border-black bg-[#8cf5e4] p-3 text-[10px] font-black uppercase leading-5 text-[#171411]"
                role="status"
              >
                {postMessage}
              </p>
            ) : null}
            {postError ? (
              <p
                className="neo-copy mt-4 border-[3px] border-black bg-[#b7102a] p-3 text-[10px] font-black uppercase leading-5 text-white"
                role="alert"
              >
                Status could not be posted: {postError}
              </p>
            ) : null}
          </form>

          <section className="border-4 border-black bg-[#8cf5e4] p-4 shadow-[5px_5px_0_#171411]">
            <div className="flex items-center gap-3">
              <Shield aria-hidden="true" className="h-6 w-6 text-[#171411]" />
              <h2 className="neo-title text-3xl leading-none text-[#171411]">Privacy Lane</h2>
            </div>
            <p className="neo-copy mt-3 text-[10px] font-black uppercase leading-5 text-[#171411]">
              Status posts use friends-only visibility. Feed rows are loaded from Supabase under the
              signed-in user's row-level security policy.
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}

function CommunityLiveNotice({
  copy,
  tone = "neutral",
}: {
  copy: string;
  tone?: "error" | "neutral";
}) {
  return (
    <p
      className={`neo-copy border-[3px] border-black p-4 text-[10px] font-black uppercase leading-5 shadow-[3px_3px_0_#171411] ${
        tone === "error" ? "bg-[#b7102a] text-white" : "bg-[#fff9ed] text-[#5b403f]"
      }`}
      role={tone === "error" ? "alert" : "status"}
    >
      {copy}
    </p>
  );
}

function CommunityVerificationPage() {
  const verifyMode = new URLSearchParams(window.location.search).get("verify");
  const isBroadcastVerify = verifyMode === "broadcasting-readiness";
  const isBroadcastProviderVerify = verifyMode === "broadcasting-provider-live-readiness";
  const isBroadcastRtmpDryRunVerify = verifyMode === "broadcasting-rtmp-dry-run";
  const isBroadcastChatModerationVerify = verifyMode === "broadcasting-chat-moderation-shadow";
  const isBroadcastVodArchivePolicyVerify = verifyMode === "broadcasting-vod-archive-policy";
  const isBroadcastProviderOAuthContractVerify =
    verifyMode === "broadcasting-provider-oauth-contract";
  const isBroadcastProviderCallbackContractVerify =
    verifyMode === "broadcasting-provider-callback-contract";
  const isBroadcastLiveSessionRehearsalVerify =
    verifyMode === "broadcasting-live-session-rehearsal";
  const isBroadcastAudienceStatusContractVerify =
    verifyMode === "broadcasting-audience-status-contract";
  const isCommunityCreatePostVerify = verifyMode === "community-create-post";
  const broadcastPlan = buildBroadcastReadinessPlan(createBroadcastChannels(isBroadcastVerify));
  const [streamKeyVaultStatus, setStreamKeyVaultStatus] =
    useState<BroadcastStreamKeyVaultStatus | null>(null);
  const [streamKeyVaultMessage, setStreamKeyVaultMessage] = useState<string | null>(null);
  const [streamKeyVaultBusy, setStreamKeyVaultBusy] = useState(false);
  const [streamKeySecret, setStreamKeySecret] = useState("");
  const [streamKeyConsent, setStreamKeyConsent] = useState(false);
  const [localPosts, setLocalPosts] = useState<CommunityLocalPost[]>(() =>
    isCommunityCreatePostVerify ? createVerifyCommunityLocalPostProof() : readCommunityLocalPosts(),
  );
  const [localPostDraft, setLocalPostDraft] = useState("");
  const [localPostMessage, setLocalPostMessage] = useState<string | null>(() =>
    isCommunityCreatePostVerify
      ? "Verify route rendered a local post proof without browser storage writes."
      : null,
  );
  const [isLocalPostComposerOpen, setIsLocalPostComposerOpen] = useState(false);
  const [isContentComposerOpen, setIsContentComposerOpen] = useState(false);
  const [activeCommunitySection, setActiveCommunitySection] = useState<CommunitySectionId>("home");
  const [activeContentFilter, setActiveContentFilter] = useState<CommunityContentType>("all");
  const [activeSort, setActiveSort] = useState<CommunitySortMode>("popular");
  const [hubSearch, setHubSearch] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [selectedHubId, setSelectedHubId] = useState(popularHubs[0].id);
  const [contentDraftTitle, setContentDraftTitle] = useState("");
  const [contentDraftType, setContentDraftType] =
    useState<Exclude<CommunityContentType, "all">>("artwork");
  const [contentMessage, setContentMessage] = useState<string | null>(null);
  const [uploadedContent, setUploadedContent] = useState<CommunityActivityItem[]>([]);
  const [activeTopicId, setActiveTopicId] = useState(discussionTopics[0].id);
  const [topicReplyDraft, setTopicReplyDraft] = useState("");
  const [topicReplies, setTopicReplies] = useState<Record<string, string[]>>({});
  const [subscribedWorkshopIds, setSubscribedWorkshopIds] = useState<string[]>([]);
  const [watchedMarketIds, setWatchedMarketIds] = useState<string[]>([]);
  const [moderationStatuses, setModerationStatuses] = useState<
    Record<string, CommunityModerationItem["status"]>
  >({});
  const trimmedLocalPostDraft = localPostDraft.trim();
  const trimmedContentDraftTitle = contentDraftTitle.trim();
  const trimmedTopicReplyDraft = topicReplyDraft.trim();
  const activeCommunitySectionData =
    communitySections.find((section) => section.id === activeCommunitySection) ??
    communitySections[0];
  const selectedHub = popularHubs.find((hub) => hub.id === selectedHubId) ?? popularHubs[0];
  const visiblePopularHubs = useMemo(() => {
    const query = hubSearch.trim().toLowerCase();
    if (!query) return popularHubs;

    return popularHubs.filter((hub) => hub.title.toLowerCase().includes(query));
  }, [hubSearch]);
  const visiblePeopleMatches = useMemo(() => {
    const query = peopleSearch.trim().toLowerCase();
    if (!query) return peopleMatches;

    return peopleMatches.filter(([name]) => name.toLowerCase().includes(query));
  }, [peopleSearch]);
  const displayedActivityFeed = useMemo(() => {
    const combinedFeed = [...uploadedContent, ...activityFeed];
    const filtered =
      activeContentFilter === "all"
        ? combinedFeed
        : combinedFeed.filter((item) => item.type === activeContentFilter);

    return [...filtered].sort((left, right) => {
      if (activeSort === "recent") return left.recentRank - right.recentRank;
      return right.heat - left.heat;
    });
  }, [activeContentFilter, activeSort, uploadedContent]);
  const selectedHubActivityCount = displayedActivityFeed.filter(
    (item) => item.hubId === selectedHub.id,
  ).length;
  const selectedTopic =
    discussionTopics.find((topic) => topic.id === activeTopicId) ?? discussionTopics[0];
  const selectedTopicReplies = [
    ...selectedTopic.replies,
    ...(topicReplies[selectedTopic.id] ?? []),
  ];
  const selectedHubTopics = discussionTopics.filter((topic) => topic.hubId === selectedHub.id);
  const selectedHubWorkshopItems = workshopItems.filter((item) => item.hubId === selectedHub.id);
  const selectedHubMarketListings = marketListings.filter(
    (listing) => listing.hubId === selectedHub.id,
  );
  const visibleModerationQueue = moderationQueue.map((item) => ({
    ...item,
    status: moderationStatuses[item.id] ?? item.status,
  }));
  const shouldShowLocalPosts =
    activeContentFilter === "all" ||
    activeContentFilter === "reviews" ||
    activeContentFilter === "news";
  const broadcastProviderReadiness = useMemo(() => {
    if (!isBroadcastProviderVerify) return createVerifyBroadcastProviderReadiness();
    return buildBroadcastProviderReadiness({
      capturePreflightReady: true,
      hostedChatModerationReady: false,
      providerOAuthReady: false,
      providerPolicyReady: true,
      rtmpIngestReady: false,
      streamKeyVaultReady: Boolean(streamKeyVaultStatus?.configured),
      vodProviderSyncReady: false,
      webhookCallbackReady: false,
    });
  }, [isBroadcastProviderVerify, streamKeyVaultStatus?.configured]);

  function handleCommunitySectionChange(sectionId: CommunitySectionId) {
    const section = communitySections.find((item) => item.id === sectionId) ?? communitySections[0];
    setActiveCommunitySection(section.id);
    setActiveContentFilter(section.filter);
    setActiveSort(section.id === "home" ? "popular" : "recent");
  }

  function handleContentFilterChange(filter: CommunityContentType) {
    setActiveCommunitySection("home");
    setActiveContentFilter(filter);
  }

  useEffect(() => {
    if (!isBroadcastProviderVerify) return;
    let active = true;
    getBroadcastStreamKeyVaultStatus({
      channelId: BROADCAST_VAULT_CHANNEL_ID,
      provider: BROADCAST_VAULT_PROVIDER,
    })
      .then((status) => {
        if (!active) return;
        setStreamKeyVaultStatus(status);
        setStreamKeyVaultMessage(status.message);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStreamKeyVaultMessage(error instanceof Error ? error.message : String(error));
      });

    return () => {
      active = false;
    };
  }, [isBroadcastProviderVerify]);

  async function handleSaveStreamKey() {
    if (!streamKeyConsent) {
      setStreamKeyVaultMessage("Stream-key vault consent is required.");
      return;
    }
    setStreamKeyVaultBusy(true);
    try {
      const status = await setBroadcastStreamKeySecret({
        channelId: BROADCAST_VAULT_CHANNEL_ID,
        consent: {
          accepted: true,
          channelId: BROADCAST_VAULT_CHANNEL_ID,
          operation: "broadcast_stream_key_vault_save",
          provider: BROADCAST_VAULT_PROVIDER,
        },
        provider: BROADCAST_VAULT_PROVIDER,
        secret: streamKeySecret,
      });
      setStreamKeySecret("");
      setStreamKeyVaultStatus(status);
      setStreamKeyVaultMessage(status.message);
    } catch (error) {
      setStreamKeyVaultMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setStreamKeyVaultBusy(false);
    }
  }

  async function handleClearStreamKey() {
    if (!streamKeyConsent) {
      setStreamKeyVaultMessage("Stream-key vault consent is required.");
      return;
    }
    setStreamKeyVaultBusy(true);
    try {
      const status = await clearBroadcastStreamKeySecret({
        channelId: BROADCAST_VAULT_CHANNEL_ID,
        consent: {
          accepted: true,
          channelId: BROADCAST_VAULT_CHANNEL_ID,
          operation: "broadcast_stream_key_vault_clear",
          provider: BROADCAST_VAULT_PROVIDER,
        },
        provider: BROADCAST_VAULT_PROVIDER,
      });
      setStreamKeyVaultStatus(status);
      setStreamKeyVaultMessage(status.message);
    } catch (error) {
      setStreamKeyVaultMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setStreamKeyVaultBusy(false);
    }
  }

  function handleCreateLocalPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = trimmedLocalPostDraft.slice(0, COMMUNITY_LOCAL_POST_MAX_LENGTH);
    if (!body) return;

    const post: CommunityLocalPost = {
      body,
      createdAt: new Date().toISOString(),
      id: createCommunityLocalPostId(),
      persisted: true,
    };

    const nextPersistedPosts = [post, ...localPosts].slice(0, COMMUNITY_LOCAL_POST_LIMIT);
    const persisted = isCommunityCreatePostVerify
      ? false
      : writeCommunityLocalPosts(nextPersistedPosts);
    setLocalPosts(
      persisted
        ? nextPersistedPosts
        : [{ ...post, persisted: false }, ...localPosts].slice(0, COMMUNITY_LOCAL_POST_LIMIT),
    );
    setLocalPostMessage(
      persisted
        ? "Local post saved in this browser."
        : "Browser storage unavailable; post kept for this session.",
    );
    setActiveCommunitySection("home");
    setActiveContentFilter("all");
    setActiveSort("recent");
    setLocalPostDraft("");
    setIsLocalPostComposerOpen(false);
  }

  function handleCancelLocalPost() {
    setLocalPostDraft("");
    setIsLocalPostComposerOpen(false);
    setLocalPostMessage("Local post draft closed.");
  }

  function handleCreateCommunityContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedContentDraftTitle) return;

    const contentTypeLabel = contentFilters.find((filter) => filter.id === contentDraftType)?.label;
    const nextItem: CommunityActivityItem = {
      artClass: selectedHub.artClass,
      author: "Browser Local",
      channel: contentTypeLabel ?? "Local Upload",
      heat: 50 + uploadedContent.length,
      headline: trimmedContentDraftTitle.slice(0, COMMUNITY_LOCAL_POST_MAX_LENGTH),
      hubId: selectedHub.id,
      id: `local-content-${Date.now().toString(36)}-${uploadedContent.length}`,
      meta: "Browser local // upload draft",
      recentRank: 0,
      summary:
        "Local community content draft attached to this hub. No hosted upload, CDN publish, or provider sync is executed.",
      tone: "bg-[#8cf5e4] text-[#171411]",
      type: contentDraftType,
    };

    setUploadedContent((current) => [nextItem, ...current].slice(0, 8));
    setActiveContentFilter(contentDraftType);
    setActiveSort("recent");
    setContentMessage(`${contentTypeLabel ?? "Content"} staged locally for ${selectedHub.title}.`);
    setContentDraftTitle("");
    setIsContentComposerOpen(false);
  }

  function handleAddTopicReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedTopicReplyDraft) return;

    setTopicReplies((current) => ({
      ...current,
      [selectedTopic.id]: [
        ...(current[selectedTopic.id] ?? []),
        trimmedTopicReplyDraft.slice(0, COMMUNITY_LOCAL_POST_MAX_LENGTH),
      ],
    }));
    setTopicReplyDraft("");
  }

  function handleToggleWorkshopSubscription(itemId: string) {
    setSubscribedWorkshopIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
    );
  }

  function handleToggleMarketWatch(listingId: string) {
    setWatchedMarketIds((current) =>
      current.includes(listingId)
        ? current.filter((id) => id !== listingId)
        : [...current, listingId],
    );
  }

  function handleSetModerationStatus(
    itemId: string,
    status: Exclude<CommunityModerationItem["status"], "pending">,
  ) {
    setModerationStatuses((current) => ({ ...current, [itemId]: status }));
  }

  return (
    <section className="neo-dots space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section
          aria-label="Community activity home"
          className="border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#171411]"
        >
          <div className="border-b-4 border-black bg-[#171411] px-4 py-3 text-[#fbf4e7]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#000]">
                Community
              </span>
              <nav aria-label="Community sections" className="flex flex-wrap gap-2 text-[#171411]">
                {communitySections.map((section) => (
                  <button
                    aria-current={activeCommunitySection === section.id ? "page" : undefined}
                    className={`neo-copy inline-flex h-8 items-center border-2 border-black px-3 text-[9px] font-black uppercase shadow-[2px_2px_0_#000] transition hover:-translate-y-0.5 ${
                      activeCommunitySection === section.id
                        ? "bg-[#8cf5e4] text-[#171411]"
                        : "bg-[#f5eedf] text-[#171411] hover:bg-[#b7102a] hover:text-white"
                    }`}
                    key={section.id}
                    onClick={() => handleCommunitySectionChange(section.id)}
                    type="button"
                  >
                    {section.label}
                  </button>
                ))}
              </nav>
            </div>
            <h1 className="neo-title mt-3 text-5xl leading-none text-[#fbf4e7] md:text-7xl">
              Community Activity
            </h1>
            <p className="neo-copy mt-3 max-w-2xl text-[11px] font-black uppercase leading-5 text-[#8cf5e4]">
              {activeCommunitySectionData.description}
            </p>
          </div>

          <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="grid gap-4">
              <CommunityWelcomePanel />
              <CommunitySectionBoard section={activeCommunitySectionData} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              {relays.map(([label, value, meta, Icon]) => (
                <RelayCard
                  key={label as string}
                  icon={Icon as typeof Signal}
                  label={label as string}
                  meta={meta as string}
                  value={value as string}
                />
              ))}
            </div>
          </div>
        </section>

        <CommunityArtPanel />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section
          aria-label="Popular hubs"
          className="border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-black bg-[#efe6d4] p-4">
            <div>
              <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
                Browse hubs
              </p>
              <h2 className="neo-title text-4xl leading-none text-[#171411]">Popular Hubs</h2>
            </div>
            <span className="neo-copy inline-flex border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
              Updated this week
            </span>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-3">
            {visiblePopularHubs.length > 0 ? (
              visiblePopularHubs.map((hub) => (
                <PopularHubCard
                  hub={hub}
                  isActive={selectedHub.id === hub.id}
                  key={hub.title}
                  onSelect={() => setSelectedHubId(hub.id)}
                />
              ))
            ) : (
              <p className="neo-copy border-2 border-black bg-[#fff9ed] p-4 text-[10px] font-black uppercase leading-5 text-[#5b403f] shadow-[3px_3px_0_#171411] md:col-span-3">
                No hubs match that search.
              </p>
            )}
          </div>
        </section>

        <CommunitySearchPanel
          hubSearch={hubSearch}
          peopleMatches={visiblePeopleMatches}
          peopleSearch={peopleSearch}
          onHubSearchChange={setHubSearch}
          onPeopleSearchChange={setPeopleSearch}
        />
      </div>

      <CommunityHubDetailPanel
        activityCount={selectedHubActivityCount}
        hub={selectedHub}
        hubs={popularHubs}
        onSelectHub={setSelectedHubId}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <CommunityContentStudioPanel
            contentDraftTitle={contentDraftTitle}
            contentDraftType={contentDraftType}
            isOpen={isContentComposerOpen}
            message={contentMessage}
            selectedHub={selectedHub}
            onContentDraftTitleChange={setContentDraftTitle}
            onContentDraftTypeChange={setContentDraftType}
            onSubmit={handleCreateCommunityContent}
            onToggleOpen={() => setIsContentComposerOpen((isOpen) => !isOpen)}
          />
          <CommunityDiscussionPanel
            activeTopicId={selectedTopic.id}
            replyDraft={topicReplyDraft}
            replies={selectedTopicReplies}
            selectedTopic={selectedTopic}
            topics={selectedHubTopics.length > 0 ? selectedHubTopics : discussionTopics}
            onReplyDraftChange={setTopicReplyDraft}
            onSelectTopic={setActiveTopicId}
            onSubmitReply={handleAddTopicReply}
          />
        </div>

        <aside className="grid gap-4">
          <CommunityWorkshopPanel
            items={selectedHubWorkshopItems.length > 0 ? selectedHubWorkshopItems : workshopItems}
            subscribedIds={subscribedWorkshopIds}
            onToggleSubscribe={handleToggleWorkshopSubscription}
          />
          <CommunityMarketPanel
            listings={
              selectedHubMarketListings.length > 0 ? selectedHubMarketListings : marketListings
            }
            watchedIds={watchedMarketIds}
            onToggleWatch={handleToggleMarketWatch}
          />
          <CommunityModerationPanel
            items={visibleModerationQueue}
            onSetStatus={handleSetModerationStatus}
          />
        </aside>
      </div>

      <CommunityFilterDock
        activeContentFilter={activeContentFilter}
        activeSort={activeSort}
        onContentFilterChange={handleContentFilterChange}
        onSortChange={setActiveSort}
      />

      <BroadcastReadinessPanel plan={broadcastPlan} />
      {isBroadcastRtmpDryRunVerify ? (
        <BroadcastRtmpDryRunPanel packet={createVerifyBroadcastRtmpDryRunPacket()} />
      ) : null}
      {isBroadcastChatModerationVerify ? (
        <BroadcastChatModerationShadowPanel
          queue={createVerifyBroadcastChatModerationShadowQueue()}
        />
      ) : null}
      {isBroadcastVodArchivePolicyVerify ? (
        <BroadcastVodArchivePolicyPanel policy={createVerifyBroadcastVodArchivePolicy()} />
      ) : null}
      {isBroadcastProviderOAuthContractVerify ? (
        <BroadcastProviderOAuthContractPanel
          contract={createVerifyBroadcastProviderOAuthContract()}
        />
      ) : null}
      {isBroadcastProviderCallbackContractVerify ? (
        <BroadcastProviderCallbackContractPanel
          contract={createVerifyBroadcastProviderCallbackContract()}
        />
      ) : null}
      {isBroadcastLiveSessionRehearsalVerify ? (
        <BroadcastLiveSessionRehearsalPanel
          rehearsal={createVerifyBroadcastLiveSessionRehearsal()}
        />
      ) : null}
      {isBroadcastAudienceStatusContractVerify ? (
        <BroadcastAudienceStatusContractPanel
          contract={createVerifyBroadcastAudienceStatusContract()}
        />
      ) : null}
      {isBroadcastProviderVerify ? (
        <>
          <BroadcastProviderReadinessPanel readiness={broadcastProviderReadiness} />
          <BroadcastStreamKeyVaultPanel
            busy={streamKeyVaultBusy}
            consentAccepted={streamKeyConsent}
            message={streamKeyVaultMessage}
            onClear={() => void handleClearStreamKey()}
            onConsentChange={setStreamKeyConsent}
            onSave={() => void handleSaveStreamKey()}
            onSecretChange={setStreamKeySecret}
            secret={streamKeySecret}
            status={streamKeyVaultStatus}
          />
        </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section
          aria-label="Community feed"
          className="border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-black bg-[#efe6d4] p-4">
            <div>
              <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
                Viewing // {activeSort === "popular" ? "Most Popular" : "Most Recent"}
              </p>
              <h2 className="neo-title text-4xl leading-none text-[#171411]">Activity Feed</h2>
            </div>
            <button
              aria-controls="community-local-post-composer"
              aria-expanded={isLocalPostComposerOpen}
              className="neo-copy inline-flex h-10 items-center gap-2 border-[3px] border-black bg-[#087d6d] px-4 text-[10px] font-black uppercase text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a]"
              onClick={() => setIsLocalPostComposerOpen(true)}
              type="button"
            >
              <MessageSquare className="h-4 w-4" />
              Create Post
            </button>
          </div>

          {isLocalPostComposerOpen ? (
            <form
              aria-label="Browser local post composer"
              className="border-b-4 border-black bg-[#fff9ed] p-4"
              id="community-local-post-composer"
              onSubmit={handleCreateLocalPost}
            >
              <label
                className="neo-copy block text-[10px] font-black uppercase tracking-[0.16em] text-[#b7102a]"
                htmlFor="community-local-post"
              >
                Local Post
              </label>
              <textarea
                className="neo-copy mt-2 min-h-24 w-full resize-none border-[3px] border-black bg-[#f5eedf] p-3 text-[12px] font-black uppercase leading-5 text-[#171411] shadow-[3px_3px_0_#171411] outline-none focus:bg-[#8cf5e4]"
                id="community-local-post"
                maxLength={COMMUNITY_LOCAL_POST_MAX_LENGTH}
                onChange={(event) => setLocalPostDraft(event.target.value)}
                value={localPostDraft}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
                  Browser Local // Draft only
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="neo-copy inline-flex h-10 items-center gap-2 border-[3px] border-black bg-[#efe6d4] px-4 text-[10px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#fff9ed]"
                    onClick={handleCancelLocalPost}
                    type="button"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                    Cancel
                  </button>
                  <button
                    className="neo-copy inline-flex h-10 items-center gap-2 border-[3px] border-black bg-[#b7102a] px-4 text-[10px] font-black uppercase text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#087d6d] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
                    disabled={trimmedLocalPostDraft.length === 0}
                    type="submit"
                  >
                    <MessageSquare aria-hidden="true" className="h-4 w-4" />
                    Save Locally
                  </button>
                </div>
              </div>
            </form>
          ) : null}

          {localPostMessage ? (
            <p
              aria-live="polite"
              className="neo-copy border-b-4 border-black bg-[#8cf5e4] px-4 py-3 text-[10px] font-black uppercase leading-5 text-[#171411]"
              role="status"
            >
              {localPostMessage}
            </p>
          ) : null}

          <div className="divide-y-4 divide-black">
            {shouldShowLocalPosts
              ? localPosts.map((post, index) => (
                  <CommunityLocalPostArticle index={index} key={post.id} post={post} />
                ))
              : null}
            {displayedActivityFeed.map((item, index) => (
              <CommunityActivityArticle item={item} key={item.headline} rank={index + 1} />
            ))}
            {displayedActivityFeed.length === 0 &&
            (!shouldShowLocalPosts || localPosts.length === 0) ? (
              <p className="neo-copy bg-[#fff9ed] p-4 text-[10px] font-black uppercase leading-5 text-[#5b403f]">
                No more content. Switch filters or create a browser-local post.
              </p>
            ) : null}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="border-4 border-black bg-[#171411] p-4 text-[#f5eedf] shadow-[5px_5px_0_#171411]">
            <div className="flex items-center gap-3 border-b-2 border-[#f5eedf] pb-3">
              <Trophy className="h-6 w-6 text-[#8cf5e4]" />
              <h2 className="neo-title text-3xl leading-none">Leaderboard</h2>
            </div>
            <div className="mt-4 space-y-3">
              {leaderboard.map(([rank, name, score]) => (
                <div
                  key={name}
                  className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 border-2 border-[#f5eedf] bg-[#24201c] p-3"
                >
                  <span className="neo-title text-3xl leading-none text-[#8cf5e4]">{rank}</span>
                  <span className="truncate font-black uppercase">{name}</span>
                  <span className="neo-copy text-xs font-black">{score}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]">
            <div className="border-b-4 border-black bg-[#efe6d4] p-4">
              <div className="flex items-center gap-3">
                <Shield className="h-6 w-6 text-[#087d6d]" />
                <h2 className="neo-title text-3xl leading-none text-[#171411]">Squads</h2>
              </div>
            </div>
            <div className="divide-y-4 divide-black">
              {squads.map(([name, online, genre]) => (
                <div key={name} className="p-4">
                  <h3 className="text-xl font-black uppercase text-[#171411]">{name}</h3>
                  <p className="neo-copy mt-2 text-[10px] font-black uppercase text-[#5b403f]">
                    {online} // {genre}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function CommunityWelcomePanel() {
  return (
    <section
      aria-label="Community welcome"
      className="border-[3px] border-black bg-[#f5eedf] p-4 shadow-[4px_4px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
            Welcome to the OG Community
          </p>
          <h2 className="neo-title mt-2 text-4xl leading-none text-[#171411]">
            Hubs, posts, guides, broadcasts
          </h2>
          <p className="neo-copy mt-3 max-w-2xl text-[10px] font-black uppercase leading-5 text-[#5b403f]">
            Browse game hubs, find players, inspect workshop-style drops, and keep local posts in
            this browser.
          </p>
        </div>
        <Compass aria-hidden="true" className="h-10 w-10 text-[#087d6d]" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a
          className="neo-copy inline-flex h-10 items-center gap-2 border-[3px] border-black bg-[#b7102a] px-4 text-[10px] font-black uppercase text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#087d6d]"
          href="/auth"
        >
          <Users aria-hidden="true" className="h-4 w-4" />
          Sign In
        </a>
        <a
          className="neo-copy inline-flex h-10 items-center gap-2 border-[3px] border-black bg-[#087d6d] px-4 text-[10px] font-black uppercase text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a]"
          href="/settings/profile"
        >
          <Star aria-hidden="true" className="h-4 w-4" />
          Join OG-Launcher
        </a>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-black uppercase text-[#5b403f] shadow-[2px_2px_0_#171411]">
          New here? Build your player card first.
        </span>
      </div>
    </section>
  );
}

function CommunitySectionBoard({ section }: { section: CommunitySection }) {
  return (
    <section
      aria-label="Community section board"
      className="border-[3px] border-black bg-[#fff9ed] p-4 shadow-[4px_4px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-[3px] border-black pb-3">
        <div className="min-w-0">
          <span
            className={`neo-copy inline-flex border-2 border-black px-3 py-1 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] ${section.tone}`}
          >
            {section.kicker}
          </span>
          <h2 className="neo-title mt-2 text-4xl leading-none text-[#171411]">{section.title}</h2>
        </div>
        <div className="border-2 border-black bg-[#f5eedf] px-3 py-2 text-right shadow-[2px_2px_0_#171411]">
          <p className="neo-title text-3xl leading-none text-[#171411]">{section.stat}</p>
          <p className="neo-copy text-[8px] font-black uppercase text-[#5b403f]">
            {section.statLabel}
          </p>
        </div>
      </div>

      <p className="neo-copy mt-3 text-[10px] font-black uppercase leading-5 text-[#5b403f]">
        {section.description}
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {section.cards.map((card) => (
          <article
            className="min-w-0 border-2 border-black bg-[#f5eedf] p-3 shadow-[3px_3px_0_#171411]"
            key={`${section.id}-${card.label}`}
          >
            <p className="neo-copy text-[8px] font-black uppercase tracking-[0.14em] text-[#b7102a]">
              {card.label}
            </p>
            <h3 className="mt-2 truncate text-lg font-black uppercase leading-tight text-[#171411]">
              {card.value}
            </h3>
            <p className="neo-copy mt-2 text-[9px] font-black uppercase leading-4 text-[#5b403f]">
              {card.meta}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function PopularHubCard({
  hub,
  isActive,
  onSelect,
}: {
  hub: CommunityHub;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={isActive}
      className={`min-w-0 border-[3px] border-black bg-[#fff9ed] p-3 text-left shadow-[4px_4px_0_#171411] transition hover:-translate-y-0.5 ${
        isActive ? "outline outline-4 outline-[#8cf5e4]" : ""
      }`}
      type="button"
      onClick={onSelect}
    >
      <div
        className={`${hub.artClass} grid aspect-[16/9] place-items-end border-[3px] border-black p-3 text-[#fff9ed] shadow-[3px_3px_0_#171411]`}
      >
        <span className="neo-copy border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black uppercase text-[#8cf5e4]">
          {hub.stat}
        </span>
      </div>
      <h3 className="mt-3 truncate text-2xl font-black uppercase leading-tight text-[#171411]">
        {hub.title}
      </h3>
      <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-5 text-[#5b403f]">
        {hub.meta}
      </p>
    </button>
  );
}

function CommunityHubDetailPanel({
  activityCount,
  hub,
  hubs,
  onSelectHub,
}: {
  activityCount: number;
  hub: CommunityHub;
  hubs: CommunityHub[];
  onSelectHub: (hubId: string) => void;
}) {
  return (
    <section
      aria-label="Game community hub details"
      className="border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div
          className={`${hub.artClass} min-h-52 border-[3px] border-black p-4 text-[#fff9ed] shadow-[4px_4px_0_#171411]`}
        >
          <span className="neo-copy inline-flex border-2 border-black bg-[#171411] px-3 py-1 text-[9px] font-black uppercase text-[#8cf5e4]">
            Game Hub
          </span>
          <h2 className="neo-title mt-16 text-4xl leading-none [text-shadow:3px_3px_0_#171411]">
            {hub.title}
          </h2>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
            <div>
              <p className="neo-copy text-[10px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
                Per-game community hub
              </p>
              <h2 className="neo-title mt-1 text-4xl leading-none text-[#171411]">{hub.title}</h2>
            </div>
            <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
              {hub.members} members
            </span>
          </div>

          <p className="neo-copy mt-3 text-[10px] font-black uppercase leading-5 text-[#5b403f]">
            {hub.description}
          </p>

          <div className="mt-3 grid gap-3 md:grid-cols-5">
            <HubStat label="Threads" value={hub.discussions} />
            <HubStat label="Workshop" value={hub.workshopItems} />
            <HubStat label="Market" value={hub.marketListings} />
            <HubStat label="Broadcasts" value={hub.broadcasts} />
            <HubStat label="Visible feed" value={activityCount} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {hub.tags.map((tag) => (
              <span
                className="neo-copy border-2 border-black bg-[#f5eedf] px-3 py-1 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Switch game hub">
            {hubs.map((item) => (
              <button
                aria-pressed={hub.id === item.id}
                className={`neo-copy border-[3px] border-black px-3 py-2 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 ${
                  hub.id === item.id
                    ? "bg-[#b7102a] text-white"
                    : "bg-[#efe6d4] text-[#171411] hover:bg-[#8cf5e4]"
                }`}
                key={item.id}
                type="button"
                onClick={() => onSelectHub(item.id)}
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function HubStat({ label, value }: { label: string; value: number }) {
  return (
    <article className="border-2 border-black bg-[#f5eedf] p-3 shadow-[2px_2px_0_#171411]">
      <p className="neo-title text-3xl leading-none text-[#171411]">{value}</p>
      <p className="neo-copy mt-1 text-[8px] font-black uppercase text-[#5b403f]">{label}</p>
    </article>
  );
}

function CommunityContentStudioPanel({
  contentDraftTitle,
  contentDraftType,
  isOpen,
  message,
  onContentDraftTitleChange,
  onContentDraftTypeChange,
  onSubmit,
  onToggleOpen,
  selectedHub,
}: {
  contentDraftTitle: string;
  contentDraftType: Exclude<CommunityContentType, "all">;
  isOpen: boolean;
  message: string | null;
  onContentDraftTitleChange: (value: string) => void;
  onContentDraftTypeChange: (value: Exclude<CommunityContentType, "all">) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleOpen: () => void;
  selectedHub: CommunityHub;
}) {
  const uploadTypes = contentFilters.filter(
    (filter): filter is typeof filter & { id: Exclude<CommunityContentType, "all"> } =>
      filter.id !== "all",
  );

  return (
    <section
      aria-label="Community content studio"
      className="border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-black bg-[#efe6d4] p-4">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
            Artwork Videos Guides Reviews
          </p>
          <h2 className="neo-title text-4xl leading-none text-[#171411]">Share Content</h2>
        </div>
        <button
          aria-expanded={isOpen}
          className="neo-copy inline-flex h-10 items-center gap-2 border-[3px] border-black bg-[#b7102a] px-4 text-[10px] font-black uppercase text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#087d6d]"
          type="button"
          onClick={onToggleOpen}
        >
          <UploadCloud aria-hidden="true" className="h-4 w-4" />
          {isOpen ? "Close Studio" : "Upload Local"}
        </button>
      </div>

      {isOpen ? (
        <form
          aria-label="Local community content upload"
          className="grid gap-3 p-4"
          onSubmit={onSubmit}
        >
          <p className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[9px] font-black uppercase leading-5 text-[#171411] shadow-[2px_2px_0_#171411]">
            Local draft for {selectedHub.title} // no hosted upload, CDN publish, or provider sync.
          </p>
          <label className="neo-copy text-[10px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
            Content title
            <input
              className="mt-2 w-full border-[3px] border-black bg-[#fff9ed] px-3 py-2 text-[12px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411] outline-none focus:bg-[#8cf5e4]"
              maxLength={COMMUNITY_LOCAL_POST_MAX_LENGTH}
              onChange={(event) => onContentDraftTitleChange(event.target.value)}
              placeholder="Name the artwork, guide, video, or review"
              value={contentDraftTitle}
            />
          </label>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Local content type">
            {uploadTypes.map(({ icon: Icon, id, label }) => (
              <button
                aria-pressed={contentDraftType === id}
                className={`neo-copy inline-flex h-9 items-center gap-2 border-[3px] border-black px-3 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] ${
                  contentDraftType === id
                    ? "bg-[#087d6d] text-white"
                    : "bg-[#fff9ed] text-[#171411]"
                }`}
                key={id}
                type="button"
                onClick={() => onContentDraftTypeChange(id)}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <button
            className="neo-copy inline-flex h-10 w-fit items-center gap-2 border-[3px] border-black bg-[#b7102a] px-4 text-[10px] font-black uppercase text-white shadow-[3px_3px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
            disabled={contentDraftTitle.trim().length === 0}
            type="submit"
          >
            <UploadCloud aria-hidden="true" className="h-4 w-4" />
            Stage Content
          </button>
        </form>
      ) : null}

      {message ? (
        <p className="neo-copy border-t-4 border-black bg-[#8cf5e4] px-4 py-3 text-[10px] font-black uppercase text-[#171411]">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function CommunityDiscussionPanel({
  activeTopicId,
  onReplyDraftChange,
  onSelectTopic,
  onSubmitReply,
  replies,
  replyDraft,
  selectedTopic,
  topics,
}: {
  activeTopicId: string;
  onReplyDraftChange: (value: string) => void;
  onSelectTopic: (topicId: string) => void;
  onSubmitReply: (event: FormEvent<HTMLFormElement>) => void;
  replies: string[];
  replyDraft: string;
  selectedTopic: CommunityDiscussionTopic;
  topics: CommunityDiscussionTopic[];
}) {
  return (
    <section
      aria-label="Community discussions"
      className="border-4 border-black bg-[#fff9ed] shadow-[5px_5px_0_#171411]"
    >
      <div className="border-b-4 border-black bg-[#171411] p-4 text-[#fff9ed]">
        <p className="neo-copy text-[10px] font-black uppercase tracking-[0.16em] text-[#8cf5e4]">
          Forum topics replies reports
        </p>
        <h2 className="neo-title text-4xl leading-none">Discussions</h2>
      </div>

      <div className="grid gap-3 p-4 lg:grid-cols-[270px_minmax(0,1fr)]">
        <div className="grid gap-2">
          {topics.map((topic) => (
            <button
              aria-pressed={activeTopicId === topic.id}
              className={`border-2 border-black p-3 text-left shadow-[2px_2px_0_#171411] ${
                activeTopicId === topic.id ? "bg-[#8cf5e4]" : "bg-[#f5eedf]"
              }`}
              key={topic.id}
              type="button"
              onClick={() => onSelectTopic(topic.id)}
            >
              <p className="neo-copy text-[8px] font-black uppercase text-[#b7102a]">
                {topic.status} // {topic.updated}
              </p>
              <h3 className="mt-1 text-base font-black uppercase leading-tight text-[#171411]">
                {topic.title}
              </h3>
              <p className="neo-copy mt-1 text-[9px] font-black uppercase text-[#5b403f]">
                by {topic.author}
              </p>
            </button>
          ))}
        </div>

        <div className="border-2 border-black bg-[#f5eedf] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy text-[9px] font-black uppercase text-[#b7102a]">Active topic</p>
          <h3 className="mt-1 text-2xl font-black uppercase leading-tight text-[#171411]">
            {selectedTopic.title}
          </h3>
          <div className="mt-3 grid gap-2">
            {replies.map((reply, index) => (
              <p
                className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase leading-5 text-[#171411]"
                key={`${selectedTopic.id}-${index}-${reply}`}
              >
                {reply}
              </p>
            ))}
          </div>
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={onSubmitReply}>
            <label className="sr-only" htmlFor="community-topic-reply">
              Topic reply
            </label>
            <input
              className="neo-copy min-w-[220px] flex-1 border-[3px] border-black bg-[#fff9ed] px-3 py-2 text-[11px] font-black uppercase text-[#171411] outline-none focus:bg-[#8cf5e4]"
              id="community-topic-reply"
              maxLength={COMMUNITY_LOCAL_POST_MAX_LENGTH}
              onChange={(event) => onReplyDraftChange(event.target.value)}
              placeholder="Reply locally"
              value={replyDraft}
            />
            <button
              className="neo-copy border-[3px] border-black bg-[#087d6d] px-4 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#d8cbb7] disabled:text-[#655f58]"
              disabled={replyDraft.trim().length === 0}
              type="submit"
            >
              Reply
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function CommunityWorkshopPanel({
  items,
  onToggleSubscribe,
  subscribedIds,
}: {
  items: CommunityWorkshopItem[];
  onToggleSubscribe: (itemId: string) => void;
  subscribedIds: string[];
}) {
  return (
    <section
      aria-label="Community workshop"
      className="border-4 border-black bg-[#f5eedf] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="flex items-center gap-3 border-b-4 border-black pb-3">
        <Wrench aria-hidden="true" className="h-6 w-6 text-[#087d6d]" />
        <h2 className="neo-title text-3xl leading-none text-[#171411]">Workshop</h2>
      </div>
      <div className="mt-3 grid gap-2">
        {items.map((item) => {
          const isSubscribed = subscribedIds.includes(item.id);
          return (
            <article
              className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]"
              key={item.id}
            >
              <p className="neo-copy text-[8px] font-black uppercase text-[#b7102a]">
                {item.downloads} local installs // {item.creator}
              </p>
              <h3 className="mt-1 text-lg font-black uppercase leading-tight text-[#171411]">
                {item.title}
              </h3>
              <button
                aria-pressed={isSubscribed}
                className={`neo-copy mt-3 inline-flex h-9 items-center gap-2 border-2 border-black px-3 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] ${
                  isSubscribed ? "bg-[#8cf5e4] text-[#171411]" : "bg-[#087d6d] text-white"
                }`}
                type="button"
                onClick={() => onToggleSubscribe(item.id)}
              >
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                {isSubscribed ? "Subscribed locally" : "Subscribe"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CommunityMarketPanel({
  listings,
  onToggleWatch,
  watchedIds,
}: {
  listings: CommunityMarketListing[];
  onToggleWatch: (listingId: string) => void;
  watchedIds: string[];
}) {
  return (
    <section
      aria-label="Community market"
      className="border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="flex items-center gap-3 border-b-4 border-black pb-3">
        <ShoppingCart aria-hidden="true" className="h-6 w-6 text-[#b7102a]" />
        <h2 className="neo-title text-3xl leading-none text-[#171411]">Market</h2>
      </div>
      <div className="mt-3 grid gap-2">
        {listings.map((listing) => {
          const isWatched = watchedIds.includes(listing.id);
          return (
            <article
              className="border-2 border-black bg-[#f5eedf] p-3 shadow-[2px_2px_0_#171411]"
              key={listing.id}
            >
              <p className="neo-copy text-[8px] font-black uppercase text-[#5b403f]">
                {listing.seller} // {listing.price}
              </p>
              <h3 className="mt-1 text-lg font-black uppercase leading-tight text-[#171411]">
                {listing.title}
              </h3>
              <button
                aria-pressed={isWatched}
                className={`neo-copy mt-3 inline-flex h-9 items-center gap-2 border-2 border-black px-3 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] ${
                  isWatched ? "bg-[#8cf5e4] text-[#171411]" : "bg-[#b7102a] text-white"
                }`}
                type="button"
                onClick={() => onToggleWatch(listing.id)}
              >
                <Heart aria-hidden="true" className="h-4 w-4" />
                {isWatched ? "Watching locally" : "Watch"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CommunityModerationPanel({
  items,
  onSetStatus,
}: {
  items: CommunityModerationItem[];
  onSetStatus: (
    itemId: string,
    status: Exclude<CommunityModerationItem["status"], "pending">,
  ) => void;
}) {
  return (
    <section
      aria-label="Community moderation queue"
      className="border-4 border-black bg-[#171411] p-4 text-[#f5eedf] shadow-[5px_5px_0_#171411]"
    >
      <div className="flex items-center gap-3 border-b-2 border-[#f5eedf] pb-3">
        <Flag aria-hidden="true" className="h-6 w-6 text-[#8cf5e4]" />
        <h2 className="neo-title text-3xl leading-none">Moderation</h2>
      </div>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <article className="border-2 border-[#f5eedf] bg-[#24201c] p-3" key={item.id}>
            <p className="neo-copy text-[8px] font-black uppercase text-[#8cf5e4]">
              {item.status} // {item.reason}
            </p>
            <h3 className="mt-1 text-base font-black uppercase leading-tight">{item.content}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-1 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#fff9ed]"
                disabled={item.status === "cleared"}
                type="button"
                onClick={() => onSetStatus(item.id, "cleared")}
              >
                Clear
              </button>
              <button
                className="neo-copy border-2 border-black bg-[#b7102a] px-3 py-1 text-[9px] font-black uppercase text-white shadow-[2px_2px_0_#fff9ed]"
                disabled={item.status === "hidden"}
                type="button"
                onClick={() => onSetStatus(item.id, "hidden")}
              >
                Hide
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CommunitySearchPanel({
  hubSearch,
  onHubSearchChange,
  onPeopleSearchChange,
  peopleMatches,
  peopleSearch,
}: {
  hubSearch: string;
  onHubSearchChange: (value: string) => void;
  onPeopleSearchChange: (value: string) => void;
  peopleMatches: readonly PeopleMatch[];
  peopleSearch: string;
}) {
  return (
    <aside className="grid gap-4">
      <form
        aria-label="Find hubs"
        className="border-4 border-black bg-[#171411] p-4 text-[#f5eedf] shadow-[5px_5px_0_#171411]"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="flex items-center gap-3 border-b-2 border-[#f5eedf] pb-3">
          <Search aria-hidden="true" className="h-6 w-6 text-[#8cf5e4]" />
          <h2 className="neo-title text-3xl leading-none">Find Hubs</h2>
        </div>
        <label className="neo-copy mt-4 block text-[10px] font-black uppercase tracking-[0.16em] text-[#8cf5e4]">
          Hub name
          <input
            className="mt-2 w-full border-[3px] border-black bg-[#fff9ed] px-3 py-2 text-[11px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#b7102a] outline-none focus:bg-[#8cf5e4]"
            onChange={(event) => onHubSearchChange(event.target.value)}
            placeholder="Search game hubs"
            value={hubSearch}
          />
        </label>
      </form>

      <form
        aria-label="Find people"
        className="border-4 border-black bg-[#f5eedf] p-4 shadow-[5px_5px_0_#171411]"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="flex items-center gap-3 border-b-4 border-black pb-3">
          <Users aria-hidden="true" className="h-6 w-6 text-[#087d6d]" />
          <h2 className="neo-title text-3xl leading-none text-[#171411]">Find People</h2>
        </div>
        <label className="neo-copy mt-4 block text-[10px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
          Player name
          <input
            className="mt-2 w-full border-[3px] border-black bg-[#fff9ed] px-3 py-2 text-[11px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411] outline-none focus:bg-[#8cf5e4]"
            onChange={(event) => onPeopleSearchChange(event.target.value)}
            placeholder="Search players"
            value={peopleSearch}
          />
        </label>
        <div className="mt-3 divide-y-2 divide-black border-2 border-black bg-[#fff9ed]">
          {peopleMatches.length > 0 ? (
            peopleMatches.map(([name, status, presence]) => (
              <div className="grid gap-1 p-3" key={name}>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-black uppercase text-[#171411]">{name}</p>
                  <span
                    className={`neo-copy border-2 border-black px-2 py-1 text-[8px] font-black uppercase ${
                      presence === "online"
                        ? "bg-[#8cf5e4] text-[#171411]"
                        : "bg-[#efe6d4] text-[#5b403f]"
                    }`}
                  >
                    {presence}
                  </span>
                </div>
                <p className="neo-copy text-[9px] font-black uppercase text-[#5b403f]">{status}</p>
              </div>
            ))
          ) : (
            <p className="neo-copy p-3 text-[10px] font-black uppercase text-[#5b403f]">
              No player matches.
            </p>
          )}
        </div>
      </form>
    </aside>
  );
}

function CommunityFilterDock({
  activeContentFilter,
  activeSort,
  onContentFilterChange,
  onSortChange,
}: {
  activeContentFilter: CommunityContentType;
  activeSort: CommunitySortMode;
  onContentFilterChange: (filter: CommunityContentType) => void;
  onSortChange: (sort: CommunitySortMode) => void;
}) {
  return (
    <section
      aria-label="Community content filters"
      className="border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
            Community content
          </p>
          <h2 className="neo-title mt-1 text-3xl leading-none text-[#171411]">
            All Artwork Broadcasts Videos Workshop News Guides Reviews
          </h2>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Viewing sort">
          {(["popular", "recent"] as CommunitySortMode[]).map((sort) => (
            <button
              aria-pressed={activeSort === sort}
              className={`neo-copy inline-flex h-9 items-center border-[3px] border-black px-3 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 ${
                activeSort === sort
                  ? "bg-[#087d6d] text-white"
                  : "bg-[#efe6d4] text-[#171411] hover:bg-[#8cf5e4]"
              }`}
              key={sort}
              onClick={() => onSortChange(sort)}
              type="button"
            >
              {sort === "popular" ? "Most Popular" : "Most Recent"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Content type">
        {contentFilters.map(({ icon: Icon, id, label }) => (
          <button
            aria-pressed={activeContentFilter === id}
            className={`neo-copy inline-flex h-10 items-center gap-2 border-[3px] border-black px-3 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 ${
              activeContentFilter === id
                ? "bg-[#b7102a] text-white"
                : "bg-[#f5eedf] text-[#171411] hover:bg-[#8cf5e4]"
            }`}
            key={id}
            onClick={() => onContentFilterChange(id)}
            type="button"
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function CommunityActivityArticle({ item, rank }: { item: CommunityActivityItem; rank: number }) {
  return (
    <article className="grid gap-3 p-4 sm:grid-cols-[112px_minmax(0,1fr)]">
      <div
        className={`${item.artClass} grid h-28 place-items-center border-[3px] border-black text-[#f5eedf] shadow-[3px_3px_0_#171411]`}
      >
        <span className="neo-title text-5xl leading-none">{String(rank).padStart(2, "0")}</span>
      </div>
      <div className="min-w-0">
        <span
          className={`neo-copy inline-flex border-2 border-black px-3 py-1 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] ${item.tone}`}
        >
          {item.channel}
        </span>
        <h3 className="mt-3 text-2xl font-black uppercase leading-tight text-[#171411]">
          {item.headline}
        </h3>
        <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-5 text-[#5b403f]">
          {item.summary}
        </p>
        <p className="neo-copy mt-2 text-[10px] font-black uppercase text-[#5b403f]">
          {item.meta} // heat {item.heat}
        </p>
      </div>
    </article>
  );
}

function CommunityLocalPostArticle({ index, post }: { index: number; post: CommunityLocalPost }) {
  const localPostMeta = post.persisted
    ? "Saved locally // Browser Local"
    : "Session only // Browser Local";

  return (
    <article className="grid gap-3 bg-[#fff9ed] p-4 sm:grid-cols-[96px_minmax(0,1fr)]">
      <div className="grid h-24 place-items-center border-[3px] border-black bg-[#8cf5e4] text-[#171411] shadow-[3px_3px_0_#171411]">
        <span className="neo-title text-4xl leading-none">L{index + 1}</span>
      </div>
      <div className="min-w-0">
        <span className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411]">
          Local Post
        </span>
        <h3 className="mt-3 text-2xl font-black uppercase leading-tight text-[#171411]">
          {post.body}
        </h3>
        <p className="neo-copy mt-2 text-[10px] font-black uppercase text-[#5b403f]">
          {localPostMeta}
        </p>
      </div>
    </article>
  );
}

function BroadcastStreamKeyVaultPanel({
  busy,
  consentAccepted,
  message,
  onClear,
  onConsentChange,
  onSave,
  onSecretChange,
  secret,
  status,
}: {
  busy: boolean;
  consentAccepted: boolean;
  message: string | null;
  onClear: () => void;
  onConsentChange: (accepted: boolean) => void;
  onSave: () => void;
  onSecretChange: (value: string) => void;
  secret: string;
  status: BroadcastStreamKeyVaultStatus | null;
}) {
  const configured = Boolean(status?.configured);

  return (
    <section
      aria-label="Broadcast stream-key vault"
      className="border-4 border-black bg-[#f5eedf] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Desktop Secret Vault
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <KeyRound aria-hidden="true" className="h-8 w-8" />
            Stream-Key Vault
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
            Store a local Twitch staging key in the desktop vault. This does not start RTMP, OAuth,
            live output, chat moderation, VOD sync, or audience status.
          </p>
        </div>
        <span
          className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#171411] ${
            configured ? "bg-[#8cf5e4] text-[#171411]" : "bg-[#efe3cf] text-[#171411]"
          }`}
        >
          {configured ? "Vault Ready" : "Desktop Required"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="neo-copy border-2 border-black bg-[#fff9ed] p-3 text-[9px] font-black uppercase tracking-[0.12em] text-[#5b403f] shadow-[3px_3px_0_#171411]">
            Channel ID
            <input
              className="mt-2 w-full border-2 border-black bg-[#f5eedf] px-3 py-2 text-[11px] font-black uppercase text-[#171411]"
              readOnly
              value={BROADCAST_VAULT_CHANNEL_ID}
            />
          </label>
          <label className="neo-copy border-2 border-black bg-[#fff9ed] p-3 text-[9px] font-black uppercase tracking-[0.12em] text-[#5b403f] shadow-[3px_3px_0_#171411]">
            Broadcast Stream Key
            <input
              aria-label="Broadcast stream key"
              className="mt-2 w-full border-2 border-black bg-[#f5eedf] px-3 py-2 text-[11px] font-black text-[#171411] outline-none focus:bg-[#8cf5e4]"
              onChange={(event) => onSecretChange(event.target.value)}
              placeholder="Paste local staging key"
              type="password"
              value={secret}
            />
          </label>
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#8cf5e4]">Vault Consent</p>
          <label className="neo-copy mt-3 flex items-start gap-2 border-2 border-[#fff9ed] bg-[#2a221b] p-2 text-[9px] font-black uppercase leading-5">
            <input
              checked={consentAccepted}
              className="mt-1 h-4 w-4 accent-[#8cf5e4]"
              onChange={(event) => onConsentChange(event.target.checked)}
              type="checkbox"
            />
            <span>Store or clear this stream key only in the local desktop vault.</span>
          </label>
          <div className="mt-3 grid gap-2">
            <button
              className="neo-copy flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#8cf5e4] text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#fff9ed] disabled:cursor-not-allowed disabled:bg-[#5f574d] disabled:text-[#fff9ed]"
              disabled={busy || !consentAccepted || secret.trim().length === 0}
              onClick={onSave}
              type="button"
            >
              <KeyRound aria-hidden="true" className="h-4 w-4" />
              {busy ? "Saving" : "Save Key"}
            </button>
            <button
              className="neo-copy flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#b7102a] text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#fff9ed] disabled:cursor-not-allowed disabled:bg-[#5f574d]"
              disabled={busy || !consentAccepted || !configured}
              onClick={onClear}
              type="button"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              {busy ? "Clearing" : "Clear Key"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <VaultStat label="Provider" value="Twitch staging" />
        <VaultStat label="Secret" value={status?.secretHint ?? "Not stored"} />
        <VaultStat label="Storage" value={status?.storage ?? "Desktop keychain slot"} />
      </div>

      <p className="neo-copy mt-3 border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black uppercase leading-5 text-[#171411] shadow-[2px_2px_0_#171411]">
        {message ?? "Checking desktop stream-key vault status."}
      </p>
    </section>
  );
}

function VaultStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
        {label}
      </p>
      <p className="neo-copy mt-2 text-[11px] font-black uppercase leading-5 text-[#171411]">
        {value}
      </p>
    </article>
  );
}

function BroadcastReadinessPanel({ plan }: { plan: BroadcastReadinessPlan }) {
  return (
    <section
      aria-label="Local broadcasting readiness"
      className="border-4 border-black bg-[#fbf4e7] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Local Stream Preflight
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl leading-none text-[#171411]">
            <Video aria-hidden="true" className="h-8 w-8" /> Broadcasting Readiness
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
            Rank local broadcast preflight lanes from account evidence, desktop vault, capture
            source, upload headroom, chat controls, VOD policy, and overlay safety.
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411]">
          Local Preview Only
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">Local Lanes</p>
          <p className="neo-title mt-1 text-5xl leading-none text-[#171411]">
            {plan.readyCount}/{plan.channels.length}
          </p>
          <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-5 text-[#5f574d]">
            {plan.summary}
          </p>
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#8cf5e4]">Live Guard</p>
          <div className="mt-3 grid gap-2">
            {[
              "Provider OAuth not executed",
              "RTMP ingest not started",
              "Hosted chat moderation unverified",
              "No VOD provider sync",
            ].map((item) => (
              <p
                className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[10px] font-black uppercase leading-5"
                key={item}
              >
                {item}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {plan.channels.map((channel) => (
          <BroadcastChannelCard channel={channel} key={channel.id} />
        ))}
      </div>

      <div className="mt-4 border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
        <p className="neo-copy text-[10px] font-black uppercase tracking-[0.18em] text-[#b7102a]">
          Broadcast Checklist
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {plan.checklist.map((item) => (
            <p
              className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase leading-5 text-[#171411]"
              key={item}
            >
              {item}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

function BroadcastChannelCard({ channel }: { channel: BroadcastPlannedChannel }) {
  return (
    <article
      className={`min-h-[210px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${getBroadcastChannelClass(
        channel.status,
      )}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#5f574d]">
            {channel.provider} // {channel.captureSource}
          </p>
          <h3 className="mt-1 text-lg font-black uppercase leading-tight text-[#171411]">
            {channel.label}
          </h3>
        </div>
        <UploadCloud aria-hidden="true" className="h-6 w-6 text-[#087d6d]" />
      </div>
      <p className="neo-title mt-3 text-3xl uppercase text-[#171411]">{channel.score}</p>
      <p className="neo-copy text-[9px] font-black uppercase text-[#5f574d]">
        {getBroadcastStatusLabel(channel.status)} // {channel.uploadHeadroomKbps} kbps headroom
      </p>
      <div className="mt-3 space-y-2">
        {[...channel.blockers, ...channel.warnings].slice(0, 3).map((item) => (
          <p
            className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase leading-4 text-[#171411]"
            key={item}
          >
            {item}
          </p>
        ))}
      </div>
    </article>
  );
}

function getBroadcastChannelClass(status: BroadcastPlannedChannel["status"]) {
  if (status === "ready") return "bg-[#8cf5e4]";
  if (status === "warning") return "bg-[#fff9ed]";
  return "bg-[#efe3cf]";
}

function getBroadcastStatusLabel(status: BroadcastPlannedChannel["status"]) {
  if (status === "ready") return "local-ready";
  return status;
}

function createBroadcastChannels(verifyMode: boolean): BroadcastChannelCandidate[] {
  if (verifyMode) {
    return [
      {
        captureSource: "game",
        chatRelayReady: true,
        id: "verify-twitch",
        label: "Twitch Staging",
        linkedAccount: true,
        moderationReady: true,
        overlaySafety: "safe",
        provider: "twitch",
        streamKeyVaultReady: true,
        targetBitrateKbps: 6000,
        uploadMbps: 24,
        vodPolicyReady: true,
      },
      {
        captureSource: "window",
        chatRelayReady: false,
        id: "verify-local-recording",
        label: "Local Recording Lane",
        linkedAccount: true,
        moderationReady: false,
        overlaySafety: "review",
        provider: "local",
        streamKeyVaultReady: true,
        targetBitrateKbps: 4500,
        uploadMbps: 14,
        vodPolicyReady: false,
      },
      {
        captureSource: "none",
        chatRelayReady: false,
        id: "verify-youtube",
        label: "Unlinked YouTube Slot",
        linkedAccount: false,
        moderationReady: false,
        overlaySafety: "unsafe",
        provider: "youtube",
        streamKeyVaultReady: false,
        targetBitrateKbps: 8000,
        uploadMbps: 4,
        vodPolicyReady: false,
      },
    ];
  }

  return [
    {
      captureSource: "window",
      chatRelayReady: false,
      id: "local-stream-preview",
      label: "Local Stream Preview",
      linkedAccount: true,
      moderationReady: false,
      overlaySafety: "review",
      provider: "local",
      streamKeyVaultReady: false,
      targetBitrateKbps: 4500,
      uploadMbps: 10,
      vodPolicyReady: false,
    },
    {
      captureSource: "none",
      chatRelayReady: false,
      id: "provider-slot",
      label: "Provider Slot",
      linkedAccount: false,
      moderationReady: false,
      overlaySafety: "unsafe",
      provider: "unknown",
      streamKeyVaultReady: false,
      targetBitrateKbps: 6000,
      uploadMbps: 5,
      vodPolicyReady: false,
    },
  ];
}
