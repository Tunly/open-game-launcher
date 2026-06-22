export type BroadcastVodArchivePolicyStatus = "blocked" | "review";

export interface BroadcastVodArchivePolicyInput {
  deleteCoverageDrafted: boolean;
  providerArchiveImportStaged: boolean;
  signedUrlPreviewStaged: boolean;
  supabaseArchiveWriteStaged: boolean;
  vodSyncJobStaged: boolean;
  localRetentionDraft: boolean;
  visibilityMatrixReviewed: boolean;
}

export interface BroadcastVodArchivePolicyItem {
  action: string;
  detail: string;
  evidence: string;
  id: string;
  label: string;
  status: BroadcastVodArchivePolicyStatus;
}

export interface BroadcastVodArchivePolicy {
  blockedCount: number;
  guardCopy: string;
  guards: string[];
  items: BroadcastVodArchivePolicyItem[];
  reviewCount: number;
  statusLabel: string;
  summary: string;
}

const BROADCAST_VOD_ARCHIVE_POLICY_GUARDS = [
  "Local fixtures only",
  "Review-only archive policy",
  "No Twitch/YouTube OAuth",
  "No OAuth token exchange",
  "No RTMP/live output",
  "No stream-key live use",
  "No hosted chat moderation",
  "No hosted enforcement",
  "No VOD provider sync",
  "No Supabase archive write",
  "No signed URL request",
  "No public storage serve",
  "No VOD sync job",
  "No provider archive import",
  "No delete request sent",
  "No audience/live-status claim",
];

const BROADCAST_VOD_ARCHIVE_POLICY_GUARD_COPY =
  "VOD archive policy review only. The launcher reviews deterministic local retention, visibility, and delete-coverage fixtures; it does not run Twitch/YouTube OAuth, start RTMP/live output, use stream keys, run hosted moderation, sync provider archives, write Supabase archive rows, request signed URLs, serve public storage, run a VOD sync job, import provider archives, send delete requests, or update audience/live status.";

export function buildBroadcastVodArchivePolicy(
  input: BroadcastVodArchivePolicyInput,
): BroadcastVodArchivePolicy {
  const items: BroadcastVodArchivePolicyItem[] = [
    {
      action: input.localRetentionDraft
        ? "Keep retention windows in local policy review until provider archive terms are approved."
        : "Draft local retention windows before any provider archive handoff.",
      detail: input.localRetentionDraft
        ? "Local fixtures map short replay, highlight, and manual-removal windows without touching provider or Supabase records."
        : "No local retention draft is staged for VOD archive review.",
      evidence: input.localRetentionDraft
        ? "14d replay // 90d highlights // manual removal"
        : "missing",
      id: "retention-draft",
      label: "Retention draft",
      status: input.localRetentionDraft ? "review" : "blocked",
    },
    {
      action: input.visibilityMatrixReviewed
        ? "Keep public, unlisted, and private archive visibility as local policy choices."
        : "Stage visibility review before archive surfaces are exposed.",
      detail: input.visibilityMatrixReviewed
        ? "Visibility choices are reviewed against local fixture cards only; no signed URL or public storage request is made."
        : "No visibility matrix is staged for archive review.",
      evidence: input.visibilityMatrixReviewed
        ? "public // unlisted // private fixture matrix"
        : "missing",
      id: "visibility-review",
      label: "Visibility review",
      status: input.visibilityMatrixReviewed ? "review" : "blocked",
    },
    {
      action: input.deleteCoverageDrafted
        ? "Keep delete coverage as a local checklist until provider and storage deletion contracts exist."
        : "Draft delete request coverage before archive rollout.",
      detail: input.deleteCoverageDrafted
        ? "Removal, appeal, and privacy deletion paths are listed locally; no delete request is sent."
        : "No delete coverage checklist is staged for archive review.",
      evidence: input.deleteCoverageDrafted ? "remove // appeal // privacy request" : "missing",
      id: "delete-coverage",
      label: "Delete coverage",
      status: input.deleteCoverageDrafted ? "review" : "blocked",
    },
    {
      action: input.providerArchiveImportStaged
        ? "Keep provider archive import behind review until OAuth, callbacks, and privacy checks pass."
        : "Block provider archive import until Twitch/YouTube contracts are staged.",
      detail: input.providerArchiveImportStaged
        ? "Provider archive import evidence is present, but the action remains review-only."
        : "No Twitch/YouTube archive import contract is staged.",
      evidence: input.providerArchiveImportStaged ? "contract draft only" : "blocked",
      id: "provider-archive-import",
      label: "Provider archive import",
      status: input.providerArchiveImportStaged ? "review" : "blocked",
    },
    {
      action: input.supabaseArchiveWriteStaged
        ? "Keep Supabase archive rows behind review until storage and RLS policies are validated."
        : "Block Supabase archive rows until storage, RLS, and deletion audits are staged.",
      detail: input.supabaseArchiveWriteStaged
        ? "Archive row evidence is represented as a local schema checklist only."
        : "No Supabase archive write path is staged.",
      evidence: input.supabaseArchiveWriteStaged ? "schema checklist only" : "blocked",
      id: "supabase-archive-write",
      label: "Supabase archive write",
      status: input.supabaseArchiveWriteStaged ? "review" : "blocked",
    },
    {
      action: input.signedUrlPreviewStaged
        ? "Keep signed URL preview behind review until private archive access is audited."
        : "Block signed URL requests until private archive access rules are staged.",
      detail: input.signedUrlPreviewStaged
        ? "Signed URL handling is represented as a local privacy checklist only."
        : "No signed URL request path is staged.",
      evidence: input.signedUrlPreviewStaged ? "privacy checklist only" : "blocked",
      id: "signed-url-request",
      label: "Signed URL request",
      status: input.signedUrlPreviewStaged ? "review" : "blocked",
    },
    {
      action: input.vodSyncJobStaged
        ? "Keep VOD sync job evidence behind review until provider archives and retries are tested."
        : "Block VOD sync jobs until provider archive callbacks and retry policy are staged.",
      detail: input.vodSyncJobStaged
        ? "VOD sync job evidence is listed as a local scheduler checklist only."
        : "No VOD sync job is staged.",
      evidence: input.vodSyncJobStaged ? "scheduler checklist only" : "blocked",
      id: "vod-sync-job",
      label: "VOD sync job",
      status: input.vodSyncJobStaged ? "review" : "blocked",
    },
  ];

  const reviewCount = items.filter((item) => item.status === "review").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;

  return {
    blockedCount,
    guardCopy: BROADCAST_VOD_ARCHIVE_POLICY_GUARD_COPY,
    guards: [...BROADCAST_VOD_ARCHIVE_POLICY_GUARDS],
    items,
    reviewCount,
    statusLabel: "Local policy review",
    summary:
      "Local VOD archive policy review covers retention, visibility, and delete coverage while provider archive import, VOD sync jobs, Supabase archive rows, signed URLs, public storage, RTMP/live output, and audience status stay blocked.",
  };
}

export function createVerifyBroadcastVodArchivePolicy(): BroadcastVodArchivePolicy {
  return buildBroadcastVodArchivePolicy({
    deleteCoverageDrafted: true,
    localRetentionDraft: true,
    providerArchiveImportStaged: false,
    signedUrlPreviewStaged: false,
    supabaseArchiveWriteStaged: false,
    visibilityMatrixReviewed: true,
    vodSyncJobStaged: false,
  });
}
