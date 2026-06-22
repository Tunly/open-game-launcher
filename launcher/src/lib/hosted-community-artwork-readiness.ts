import {
  createProviderArtworkCapsProof,
  type ProviderArtworkCapsProof,
} from "./provider-artwork-policy";

export type HostedCommunityArtworkReadinessStatus = "blocked" | "ready" | "warning";

export interface HostedCommunityArtworkReadinessInput {
  adminModerationDashboardReady: boolean;
  clientHelpersReady: boolean;
  communityRolloutReady: boolean;
  contentScanningReady: boolean;
  localFallbackReady: boolean;
  moderationQueueReady: boolean;
  providerArtworkScrapingReady: boolean;
  publicUploadUiReady: boolean;
  rankingSyncReady: boolean;
  schemaRlsReady: boolean;
  storageBucketReady: boolean;
  trustedLiveReviewEndpointReady: boolean;
  votePersistenceReady: boolean;
}

export interface HostedCommunityArtworkGate {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: HostedCommunityArtworkReadinessStatus;
}

export interface HostedCommunityArtworkReadiness {
  blockedCount: number;
  gates: HostedCommunityArtworkGate[];
  guardCopy: string;
  guards: string[];
  nextAction: string;
  progress: number;
  providerCapsProof: ProviderArtworkCapsProof;
  readyCount: number;
  statusLabel: string;
  summary: string;
  warningCount: number;
}

const HOSTED_COMMUNITY_ARTWORK_GUARDS = [
  "Approved rows only in hosted deck",
  "Local artwork fallback remains available",
  "Pending uploads require moderation",
  "Admin review actions require service-role tooling",
  "Live review endpoint keeps service-role server-side",
  "Review decisions write audit rows",
  "Deterministic content scans gate approval",
  "Provider artwork imports require source policy evidence",
  "Epic artwork caps are local review only",
  "No ML image moderation claim",
  "No unvetted provider artwork scrape claim",
  "No destructive local artwork writes",
];

const HOSTED_COMMUNITY_ARTWORK_GUARD_COPY =
  "Hosted Community Artwork v1 stages Supabase schema, RLS, approved-feed listing, persistent votes, report-backed moderation queue, public upload UI, pending submissions, service-role review tooling, a trusted live review endpoint, deterministic content-scan evidence, provider artwork source-policy evidence, local Steam/RAWG/Epic caps proof, audit rows, and local fallback. It does not claim that ML image moderation, copyright fingerprinting, unvetted provider scraping, community-wide rollout, provider API approval, or destructive local artwork writes are live.";

export function buildHostedCommunityArtworkReadiness(
  input: HostedCommunityArtworkReadinessInput,
): HostedCommunityArtworkReadiness {
  const providerCapsProof = createProviderArtworkCapsProof();
  const gates: HostedCommunityArtworkGate[] = [
    {
      action: input.localFallbackReady
        ? "Keep the browser-local community deck as the offline fallback."
        : "Restore local community artwork candidates before hosted rollout.",
      detail: input.localFallbackReady
        ? "Local seed artwork and import actions remain available when Supabase is missing, unauthenticated, or the hosted schema is absent."
        : "No local fallback exists for hosted artwork outages.",
      id: "local-fallback",
      label: "Local Deck Fallback",
      status: input.localFallbackReady ? "ready" : "blocked",
    },
    {
      action: input.schemaRlsReady
        ? "Replay the community artwork migration in local Supabase and keep policy tests focused on approved/owner boundaries."
        : "Add community artwork tables, RLS, and moderation-safe grants.",
      detail: input.schemaRlsReady
        ? "The migration defines hosted items, votes, reports, RLS read/insert boundaries, service-role moderation, and approved-feed access."
        : "No hosted community artwork schema or RLS contract is staged.",
      id: "schema-rls",
      label: "Schema/RLS",
      status: input.schemaRlsReady ? "ready" : "blocked",
    },
    {
      action: input.storageBucketReady
        ? "Keep `game-artwork` uploads scoped to authenticated owner folders before approval."
        : "Stage a `game-artwork` bucket with owner-folder write policies.",
      detail: input.storageBucketReady
        ? "The migration creates the public `game-artwork` bucket with MIME limits and owner-folder write/update/delete policies."
        : "No hosted artwork storage bucket is staged.",
      id: "storage-bucket",
      label: "Artwork Storage",
      status: input.storageBucketReady ? "ready" : "blocked",
    },
    {
      action: input.clientHelpersReady
        ? "Use the helper as the only client path for hosted listing, uploads, votes, and reports."
        : "Add a typed client helper for hosted community artwork actions.",
      detail: input.clientHelpersReady
        ? "The launcher helper maps approved rows into `CommunityArtworkCandidate` and returns structured config/auth/schema/database failures."
        : "No launcher client helper exists for hosted community artwork.",
      id: "client-helpers",
      label: "Launcher Client",
      status: input.clientHelpersReady ? "ready" : "blocked",
    },
    {
      action: input.votePersistenceReady
        ? "Use the vote RPC for authenticated hosted rows and keep localStorage only for fallback rows."
        : "Persist hosted votes per user and aggregate score server-side.",
      detail: input.votePersistenceReady
        ? "The hosted vote RPC upserts/removes the signed-in user's vote and syncs aggregate score onto approved artwork."
        : "Hosted votes are not persisted yet.",
      id: "vote-persistence",
      label: "Vote Persistence",
      status: input.votePersistenceReady ? "ready" : "blocked",
    },
    {
      action: input.moderationQueueReady
        ? "Keep reports writing through the RPC and route three active reports back into pending review."
        : "Add report records, report thresholds, and moderation status transitions.",
      detail: input.moderationQueueReady
        ? "The report RPC upserts authenticated reports, rate-limits active reports, and returns approved art to pending review after three distinct reports."
        : "No hosted report or moderation queue path is staged.",
      id: "moderation-queue",
      label: "Moderation Queue",
      status: input.moderationQueueReady ? "ready" : "blocked",
    },
    {
      action: input.rankingSyncReady
        ? "Order the hosted feed by vote score, downloads, and created time while keeping approved-only filtering."
        : "Add server-side ranking order for hosted approved artwork.",
      detail: input.rankingSyncReady
        ? "The approved-feed RPC returns ranked rows and the client maps user vote state for the current signed-in user."
        : "No hosted ranking sync exists.",
      id: "ranking-sync",
      label: "Ranking Sync",
      status: input.rankingSyncReady ? "ready" : "blocked",
    },
    {
      action: input.publicUploadUiReady
        ? "Keep uploads behind moderation and show pending status to submitters."
        : "Build the public upload form and pending-submission state before claiming creator rollout.",
      detail: input.publicUploadUiReady
        ? "The GameDetails artwork popover has a public upload form, file guardrails, and pending-submission cards before approval."
        : "The upload helper exists, but the public upload UI and pending-submission surface are still not shipped.",
      id: "public-upload-ui",
      label: "Upload UI",
      status: input.publicUploadUiReady ? "ready" : "warning",
    },
    {
      action: input.adminModerationDashboardReady
        ? "Keep review actions service-role only and audit every decision."
        : "Build the admin moderation dashboard, audit log, and review actions before community-wide rollout.",
      detail: input.adminModerationDashboardReady
        ? "The launcher has a moderator console preview, service-role review RPC contract, private reviewer allowlist, and audit ledger evidence."
        : "No admin moderation dashboard, review audit log, or content-scanning workflow is shipped yet.",
      id: "admin-moderation-dashboard",
      label: "Moderator Console",
      status: input.adminModerationDashboardReady ? "ready" : "warning",
    },
    {
      action: input.trustedLiveReviewEndpointReady
        ? "Keep browser moderation calls routed through the authenticated Edge Function."
        : "Ship the trusted Edge Function before connecting live moderator actions.",
      detail: input.trustedLiveReviewEndpointReady
        ? "The community-artwork-moderation Edge Function authenticates the caller, checks the private moderator allowlist, and calls service-role queue/review RPCs server-side."
        : "No trusted live endpoint exists for browser moderation actions.",
      id: "trusted-live-review-endpoint",
      label: "Live Review Endpoint",
      status: input.trustedLiveReviewEndpointReady ? "ready" : "warning",
    },
    {
      action: input.contentScanningReady
        ? "Keep deterministic scan verdicts attached to review audit packets and require passed scans before approval."
        : "Add a deterministic server-side content-scan contract before broad creator rollout.",
      detail: input.contentScanningReady
        ? "The moderation Edge Function can run a service-role policy scan, store scan_result rows, attach scan snapshots to audit rows, and block approval unless the latest scan passed."
        : "No server-side content-scan evidence is shipped yet.",
      id: "content-scanning",
      label: "Content Scanning",
      status: input.contentScanningReady ? "ready" : "warning",
    },
    {
      action: input.providerArtworkScrapingReady
        ? "Keep provider artwork ingestion constrained to local caps, approved CDN paths, and source policies."
        : "Add provider artwork scraping/import policy checks before claiming provider artwork rollout.",
      detail: input.providerArtworkScrapingReady
        ? "Steam auto-artwork candidates carry approved CDN/app-id evidence, RAWG API responses return source-policy evidence, and Epic CDN candidates now have local host/source-id/path/pixel/byte caps while provider API approval stays open."
        : "The scanner can flag known provider-hosted sources for review, but provider artwork scraping/import rollout is not shipped.",
      id: "provider-artwork-scraping",
      label: "Provider Artwork",
      status: input.providerArtworkScrapingReady ? "ready" : "warning",
    },
    {
      action: input.communityRolloutReady
        ? "Keep rollout evidence tied to hosted scan, review, and storage gates."
        : "Run a controlled community rollout with real staging evidence before broad release.",
      detail: input.communityRolloutReady
        ? "Community rollout evidence is complete."
        : "Hosted artwork remains staged until real moderation staffing, scan monitoring, and rollout evidence are captured.",
      id: "community-rollout",
      label: "Community Rollout",
      status: input.communityRolloutReady ? "ready" : "warning",
    },
  ];
  const readyCount = gates.filter((gate) => gate.status === "ready").length;
  const warningCount = gates.filter((gate) => gate.status === "warning").length;
  const blockedCount = gates.filter((gate) => gate.status === "blocked").length;
  const nextGate =
    gates.find((gate) => gate.status === "blocked") ??
    gates.find((gate) => gate.status === "warning") ??
    null;

  return {
    blockedCount,
    gates,
    guardCopy: HOSTED_COMMUNITY_ARTWORK_GUARD_COPY,
    guards: [...HOSTED_COMMUNITY_ARTWORK_GUARDS],
    nextAction: nextGate?.action ?? "Hosted community artwork can enter controlled rollout.",
    progress: Math.round((readyCount / gates.length) * 100),
    providerCapsProof,
    readyCount,
    statusLabel:
      blockedCount > 0 ? "Local fallback" : warningCount > 0 ? "Hosted v1 staged" : "Rollout ready",
    summary:
      blockedCount > 0
        ? "Hosted Community Artwork still depends on local fallback until schema, client helpers, votes, moderation, and ranking are staged."
        : warningCount > 0
          ? "Hosted Community Artwork v1 now has schema/RLS, approved-feed listing, persistent votes, report moderation, ranking, public upload UI, pending submissions, moderator console, trusted live review endpoint, deterministic content-scan evidence, provider artwork source-policy evidence, local Steam/RAWG/Epic caps proof, and audit logging; community rollout remains staged work."
          : "Hosted Community Artwork has the required launch gates for a controlled creator rollout.",
    warningCount,
  };
}

export function createVerifyHostedCommunityArtworkReadiness(): HostedCommunityArtworkReadiness {
  return buildHostedCommunityArtworkReadiness({
    adminModerationDashboardReady: true,
    clientHelpersReady: true,
    communityRolloutReady: false,
    contentScanningReady: true,
    localFallbackReady: true,
    moderationQueueReady: true,
    providerArtworkScrapingReady: true,
    publicUploadUiReady: true,
    rankingSyncReady: true,
    schemaRlsReady: true,
    storageBucketReady: true,
    trustedLiveReviewEndpointReady: true,
    votePersistenceReady: true,
  });
}
