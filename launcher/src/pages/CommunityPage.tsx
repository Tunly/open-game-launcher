import {
  BookOpen,
  Compass,
  Gamepad2,
  Image as ImageIcon,
  KeyRound,
  MessageSquare,
  Newspaper,
  Radio,
  Search,
  Shield,
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
import type { BroadcastStreamKeyVaultStatus } from "../lib/types";

const BROADCAST_VAULT_CHANNEL_ID = "local-preview";
const BROADCAST_VAULT_PROVIDER = "twitch" as const;
const COMMUNITY_LOCAL_POSTS_STORAGE_KEY = "og-launcher:community-posts:v1";
const COMMUNITY_LOCAL_POST_LIMIT = 5;
const COMMUNITY_LOCAL_POST_MAX_LENGTH = 120;

type CommunityContentType =
  | "all"
  | "artwork"
  | "broadcasts"
  | "videos"
  | "workshop"
  | "news"
  | "guides"
  | "reviews";

type CommunitySortMode = "popular" | "recent";
type CommunitySectionId = "home" | "discussions" | "workshop" | "market" | "broadcasts";

type CommunityActivityItem = {
  artClass: string;
  channel: string;
  headline: string;
  heat: number;
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

const popularHubs = [
  {
    artClass: "library-art-tokyo",
    meta: "36 new guides this week",
    stat: "12.4k members",
    title: "Neo-Tokyo Drift",
  },
  {
    artClass: "library-art-mech",
    meta: "18 new artwork drops",
    stat: "8.7k members",
    title: "Steel Battalion X",
  },
  {
    artClass: "library-art-phantom",
    meta: "9 fresh discussions",
    stat: "5.2k members",
    title: "Netrunner Phantom",
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
    channel: "Patch Notes",
    heat: 98,
    headline: "Neo-Tokyo Drift ranked queue opens",
    meta: "12 min // 248 reactions",
    recentRank: 1,
    summary: "Official update thread with balance notes, driver tags, and event comments.",
    tone: "bg-[#b7102a] text-white",
    type: "news",
  },
  {
    artClass: "library-art-mech",
    channel: "Squad Search",
    heat: 86,
    headline: "Steel Battalion X raid slot free",
    meta: "22 min // 4 slots",
    recentRank: 2,
    summary: "Players are forming a hard-mode group with voice and cross-play tags.",
    tone: "bg-[#087d6d] text-white",
    type: "workshop",
  },
  {
    artClass: "library-art-phantom",
    channel: "Tournament",
    heat: 74,
    headline: "Netrunner Phantom Cup locks Friday",
    meta: "1 hr // 96 registered",
    recentRank: 3,
    summary: "Community bracket page, replay requests, and rules questions in one thread.",
    tone: "bg-[#efe6d4] text-[#171411]",
    type: "broadcasts",
  },
  {
    artClass: "library-art-mech",
    channel: "Artwork",
    heat: 71,
    headline: "Steel Battalion zine cover wins",
    meta: "2 hr // 18 remixes",
    recentRank: 4,
    summary: "Panel-frame cover art, creator notes, and local gallery requests are pinned.",
    tone: "bg-[#8cf5e4] text-[#171411]",
    type: "artwork",
  },
  {
    artClass: "library-art-tokyo",
    channel: "Replay Lab",
    heat: 69,
    headline: "Drift lap replay cut uploads",
    meta: "3 hr // 41 clips",
    recentRank: 5,
    summary: "Short run breakdowns with route tags, controller notes, and local clip metadata.",
    tone: "bg-[#171411] text-[#8cf5e4]",
    type: "videos",
  },
  {
    artClass: "library-art-phantom",
    channel: "Guide Desk",
    heat: 65,
    headline: "Netrunner stealth route map",
    meta: "5 hr // 12 revisions",
    recentRank: 6,
    summary: "Community guide edits track safe routes, timing windows, and spoiler tags.",
    tone: "bg-[#efe6d4] text-[#171411]",
    type: "guides",
  },
  {
    artClass: "library-art-tokyo",
    channel: "Discussion",
    heat: 61,
    headline: "Boss rush thread flags balance",
    meta: "6 hr // 73 replies",
    recentRank: 7,
    summary: "Player review thread with patch questions, build notes, and local post handoff.",
    tone: "bg-[#087d6d] text-white",
    type: "reviews",
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
  const [activeCommunitySection, setActiveCommunitySection] = useState<CommunitySectionId>("home");
  const [activeContentFilter, setActiveContentFilter] = useState<CommunityContentType>("all");
  const [activeSort, setActiveSort] = useState<CommunitySortMode>("popular");
  const [hubSearch, setHubSearch] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");
  const trimmedLocalPostDraft = localPostDraft.trim();
  const activeCommunitySectionData =
    communitySections.find((section) => section.id === activeCommunitySection) ??
    communitySections[0];
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
    const filtered =
      activeContentFilter === "all"
        ? activityFeed
        : activityFeed.filter((item) => item.type === activeContentFilter);

    return [...filtered].sort((left, right) => {
      if (activeSort === "recent") return left.recentRank - right.recentRank;
      return right.heat - left.heat;
    });
  }, [activeContentFilter, activeSort]);
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
              visiblePopularHubs.map((hub) => <PopularHubCard hub={hub} key={hub.title} />)
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

function PopularHubCard({ hub }: { hub: (typeof popularHubs)[number] }) {
  return (
    <article className="min-w-0 border-[3px] border-black bg-[#fff9ed] p-3 shadow-[4px_4px_0_#171411]">
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
    </article>
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
