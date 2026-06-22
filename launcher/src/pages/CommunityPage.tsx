import {
  Gamepad2,
  KeyRound,
  MessageSquare,
  Radio,
  Shield,
  Signal,
  Trash2,
  Trophy,
  UploadCloud,
  Users,
  Video,
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
import { PublicScreenshotFeedPanel } from "../components/community/PublicScreenshotFeedPanel";
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
  buildPublicScreenshotFeedReadinessFromScreenshots,
  createLocalPublicScreenshotFeedReadiness,
  createVerifyPublicScreenshotFeedReadiness,
  updatePublicScreenshotFeedLikeState,
  type PublicScreenshotFeedCard,
  type PublicScreenshotFeedReadiness,
} from "../lib/public-screenshot-feed-readiness";
import {
  clearBroadcastStreamKeySecret,
  getBroadcastStreamKeyVaultStatus,
  setBroadcastStreamKeySecret,
} from "../lib/launcher";
import { isSupabaseConfigured } from "../lib/supabase/client";
import {
  getScreenshotLikeState,
  listPublicScreenshotFeedScreenshots,
  setScreenshotLiked,
} from "../lib/supabase/screenshots";
import type { BroadcastStreamKeyVaultStatus } from "../lib/types";

const BROADCAST_VAULT_CHANNEL_ID = "local-preview";
const BROADCAST_VAULT_PROVIDER = "twitch" as const;
const COMMUNITY_LOCAL_POSTS_STORAGE_KEY = "og-launcher:community-posts:v1";
const COMMUNITY_LOCAL_POST_LIMIT = 5;
const COMMUNITY_LOCAL_POST_MAX_LENGTH = 120;

type CommunityLocalPost = {
  body: string;
  createdAt: string;
  id: string;
  persisted: boolean;
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

const activityFeed = [
  {
    channel: "Patch Notes",
    headline: "Neo-Tokyo Drift ranked queue opens",
    meta: "12 min // 248 reactions",
    tone: "bg-[#b7102a] text-white",
  },
  {
    channel: "Squad Search",
    headline: "Steel Battalion X raid slot free",
    meta: "22 min // 4 slots",
    tone: "bg-[#087d6d] text-white",
  },
  {
    channel: "Tournament",
    headline: "Netrunner Phantom Cup locks Friday",
    meta: "1 hr // 96 registered",
    tone: "bg-[#efe6d4] text-[#171411]",
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
  ["Hub Pulse", "128", "players online", Signal],
  ["Squads", "14", "active groups", Users],
  ["Events", "03", "live brackets", Radio],
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
  const isPublicScreenshotFeedVerify = verifyMode === "public-screenshot-feed";
  const shouldShowPublicScreenshotFeed = !verifyMode || isPublicScreenshotFeedVerify;
  const broadcastPlan = buildBroadcastReadinessPlan(createBroadcastChannels(isBroadcastVerify));
  const [streamKeyVaultStatus, setStreamKeyVaultStatus] =
    useState<BroadcastStreamKeyVaultStatus | null>(null);
  const [streamKeyVaultMessage, setStreamKeyVaultMessage] = useState<string | null>(null);
  const [streamKeyVaultBusy, setStreamKeyVaultBusy] = useState(false);
  const [streamKeySecret, setStreamKeySecret] = useState("");
  const [streamKeyConsent, setStreamKeyConsent] = useState(false);
  const [publicScreenshotFeedReadiness, setPublicScreenshotFeedReadiness] =
    useState<PublicScreenshotFeedReadiness>(() => createLocalPublicScreenshotFeedReadiness());
  const [publicScreenshotFeedMessage, setPublicScreenshotFeedMessage] = useState<string | null>(
    null,
  );
  const [publicScreenshotLikeMessage, setPublicScreenshotLikeMessage] = useState<string | null>(
    null,
  );
  const [publicScreenshotCanLike, setPublicScreenshotCanLike] = useState(false);
  const [publicScreenshotLikeBusyId, setPublicScreenshotLikeBusyId] = useState<string | null>(null);
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
  const trimmedLocalPostDraft = localPostDraft.trim();
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

  useEffect(() => {
    if (!shouldShowPublicScreenshotFeed) {
      setPublicScreenshotFeedReadiness(createLocalPublicScreenshotFeedReadiness());
      setPublicScreenshotFeedMessage(null);
      setPublicScreenshotLikeMessage(null);
      setPublicScreenshotCanLike(false);
      return;
    }

    setPublicScreenshotFeedReadiness(
      isPublicScreenshotFeedVerify
        ? createVerifyPublicScreenshotFeedReadiness()
        : createLocalPublicScreenshotFeedReadiness(),
    );
    setPublicScreenshotLikeMessage(null);
    setPublicScreenshotCanLike(false);
    if (!isSupabaseConfigured) {
      setPublicScreenshotFeedMessage(
        isPublicScreenshotFeedVerify
          ? "Supabase not configured; showing staged public screenshot feed evidence."
          : "Default community board uses local fixture embeds; hosted feed needs Supabase configuration.",
      );
      return;
    }

    let active = true;
    listPublicScreenshotFeedScreenshots({ limit: 6 })
      .then(async (result) => {
        if (!active) return;
        if (!result.ok) {
          setPublicScreenshotFeedMessage(result.message);
          return;
        }

        if (result.value.length === 0) {
          setPublicScreenshotFeedMessage(
            "No public Supabase screenshots returned; fixture evidence remains visible.",
          );
          return;
        }

        const likeState = await getScreenshotLikeState(
          result.value.map((screenshot) => screenshot.id),
        );
        if (!active) return;
        setPublicScreenshotCanLike(likeState.canLike);
        setPublicScreenshotFeedReadiness(
          buildPublicScreenshotFeedReadinessFromScreenshots(result.value, likeState.likes),
        );
        setPublicScreenshotFeedMessage(
          isPublicScreenshotFeedVerify
            ? "Public Supabase screenshot rows staged with signed media review."
            : "Hosted public screenshot rows loaded for the community board with signed media review.",
        );
        setPublicScreenshotLikeMessage(likeState.message ?? null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPublicScreenshotFeedMessage(error instanceof Error ? error.message : String(error));
      });

    return () => {
      active = false;
    };
  }, [isPublicScreenshotFeedVerify, shouldShowPublicScreenshotFeed]);

  async function handleTogglePublicScreenshotLike(card: PublicScreenshotFeedCard) {
    if (card.source !== "hosted-supabase" || card.visibility !== "public") {
      setPublicScreenshotLikeMessage("Only hosted public screenshot rows can be liked.");
      return;
    }

    if (!publicScreenshotCanLike) {
      setPublicScreenshotLikeMessage("Sign in to like public screenshots.");
      return;
    }

    const nextLiked = !card.likedByMe;
    setPublicScreenshotLikeBusyId(card.id);
    setPublicScreenshotLikeMessage(null);
    try {
      const result = await setScreenshotLiked(card.id, nextLiked);
      if (!result.ok) {
        setPublicScreenshotLikeMessage(result.message);
        return;
      }

      setPublicScreenshotFeedReadiness((current) =>
        updatePublicScreenshotFeedLikeState(current, card.id, result.value),
      );
      setPublicScreenshotLikeMessage(nextLiked ? "Like saved." : "Like removed.");
    } catch (error) {
      setPublicScreenshotLikeMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPublicScreenshotLikeBusyId(null);
    }
  }

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
        <div className="border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#171411]">
          <div className="border-b-4 border-black bg-[#171411] px-4 py-3 text-[#fbf4e7]">
            <span className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#000]">
              Network online
            </span>
            <h1 className="neo-title mt-3 text-5xl leading-none text-[#fbf4e7] md:text-7xl">
              Community Hub
            </h1>
            <p className="neo-copy mt-3 max-w-2xl text-[11px] font-black uppercase leading-5 text-[#8cf5e4]">
              128 players online // 14 active groups // 3 live events
            </p>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-3">
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

        <CommunityArtPanel />
      </div>

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
      {shouldShowPublicScreenshotFeed ? (
        <PublicScreenshotFeedPanel
          busyLikeId={publicScreenshotLikeBusyId}
          canLike={publicScreenshotCanLike}
          likeMessage={publicScreenshotLikeMessage}
          message={
            publicScreenshotFeedMessage ??
            "Default community board uses local fixture embeds; hosted feed rollout remains gated."
          }
          onToggleLike={(card) => void handleTogglePublicScreenshotLike(card)}
          readiness={publicScreenshotFeedReadiness}
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
                Relay Board
              </p>
              <h2 className="neo-title text-4xl leading-none text-[#171411]">Live Feed</h2>
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
            {localPosts.map((post, index) => (
              <CommunityLocalPostArticle index={index} key={post.id} post={post} />
            ))}
            {activityFeed.map((item, index) => (
              <article
                key={item.headline}
                className="grid gap-3 p-4 sm:grid-cols-[96px_minmax(0,1fr)]"
              >
                <div className="library-art-phantom grid h-24 place-items-center border-[3px] border-black text-[#f5eedf] shadow-[3px_3px_0_#171411]">
                  <span className="neo-title text-5xl leading-none">
                    {String(index + 1).padStart(2, "0")}
                  </span>
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
                  <p className="neo-copy mt-2 text-[10px] font-black uppercase text-[#5b403f]">
                    {item.meta}
                  </p>
                </div>
              </article>
            ))}
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
