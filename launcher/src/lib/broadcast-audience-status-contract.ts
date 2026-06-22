export type BroadcastAudienceStatusContractStatus = "blocked" | "review";

export interface BroadcastAudienceStatusContractInput {
  audienceCountReadStaged: boolean;
  chatPresenceMergeStaged: boolean;
  localPreviewStateDrafted: boolean;
  providerLiveStateCallbackStaged: boolean;
  publicStatusWriteStaged: boolean;
  rollbackClearStatusReviewed: boolean;
  staleStatusFallbackReviewed: boolean;
  supabaseAudienceRowStaged: boolean;
}

export interface BroadcastAudienceStatusContractItem {
  action: string;
  detail: string;
  evidence: string;
  id: string;
  label: string;
  status: BroadcastAudienceStatusContractStatus;
}

export interface BroadcastAudienceStatusContract {
  blockedCount: number;
  guardCopy: string;
  guards: string[];
  items: BroadcastAudienceStatusContractItem[];
  reviewCount: number;
  statusLabel: string;
  summary: string;
}

const BROADCAST_AUDIENCE_STATUS_GUARDS = [
  "Local contract fixtures only",
  "No Twitch/YouTube OAuth",
  "No RTMP/live output",
  "No provider live-state read",
  "No audience count polling",
  "No provider chat presence read",
  "No Supabase audience row mutation",
  "No public live badge update",
  "No callback replay",
  "No VOD sync job",
];

const BROADCAST_AUDIENCE_STATUS_GUARD_COPY =
  "Audience status contract review only. The launcher renders deterministic local state, stale-fallback, and rollback fixtures; it does not read provider live state, poll audience counts, merge provider chat presence, mutate Supabase audience rows, does not publish public status, replay callbacks, start RTMP output, or sync VOD jobs.";

export function buildBroadcastAudienceStatusContract(
  input: BroadcastAudienceStatusContractInput,
): BroadcastAudienceStatusContract {
  const items: BroadcastAudienceStatusContractItem[] = [
    buildItem({
      action: input.localPreviewStateDrafted
        ? "Keep the preview status fixture local until provider event contracts exist."
        : "Draft a local preview state fixture before provider status work.",
      detail: input.localPreviewStateDrafted
        ? "Local fixture covers planned, previewing, error, ended, and offline labels without public mutation."
        : "No local preview state fixture is staged.",
      evidence: input.localPreviewStateDrafted
        ? "planned // previewing // ended // offline"
        : "missing",
      id: "local-preview-state",
      label: "Local preview state",
      ready: input.localPreviewStateDrafted,
    }),
    buildItem({
      action: input.providerLiveStateCallbackStaged
        ? "Keep provider live-state events behind callback and signature review."
        : "Block provider live-state events until callback signatures and replay windows are staged.",
      detail: input.providerLiveStateCallbackStaged
        ? "Provider event shape is review-only; no provider traffic is consumed."
        : "No Twitch/YouTube live-state event delivery is staged.",
      evidence: input.providerLiveStateCallbackStaged ? "provider event shape only" : "blocked",
      id: "provider-live-state-event",
      label: "Provider live-state event",
      ready: input.providerLiveStateCallbackStaged,
    }),
    buildItem({
      action: input.audienceCountReadStaged
        ? "Keep count reads behind provider rate-limit and redaction review."
        : "Block audience-count reads until provider quota, cache, and redaction rules are staged.",
      detail: input.audienceCountReadStaged
        ? "Audience count shape is review-only; no provider endpoint is queried."
        : "No provider audience-count read or polling loop is staged.",
      evidence: input.audienceCountReadStaged ? "count shape only" : "blocked",
      id: "audience-count-snapshot",
      label: "Audience count snapshot",
      ready: input.audienceCountReadStaged,
    }),
    buildItem({
      action: input.chatPresenceMergeStaged
        ? "Keep chat presence merge behind provider chat and moderation review."
        : "Block chat presence merge until chat read scope and moderation audit are staged.",
      detail: input.chatPresenceMergeStaged
        ? "Presence merge shape is review-only; no provider chat stream is attached."
        : "No provider chat presence read or merge is staged.",
      evidence: input.chatPresenceMergeStaged ? "presence merge shape only" : "blocked",
      id: "chat-presence-merge",
      label: "Chat presence merge",
      ready: input.chatPresenceMergeStaged,
    }),
    buildItem({
      action: input.publicStatusWriteStaged
        ? "Keep public status writes behind consent, rollback, and provider proof review."
        : "Block public status mutation until provider proof and rollback are staged.",
      detail: input.publicStatusWriteStaged
        ? "Public status write shape is review-only; no community banner or profile state is changed."
        : "No public status write or live badge mutation is staged.",
      evidence: input.publicStatusWriteStaged ? "status write shape only" : "blocked",
      id: "public-status-write",
      label: "Public status write",
      ready: input.publicStatusWriteStaged,
    }),
    buildItem({
      action: input.supabaseAudienceRowStaged
        ? "Keep Supabase row shape behind RLS, retention, and delete review."
        : "Block Supabase audience rows until RLS, retention, and deletion rules are staged.",
      detail: input.supabaseAudienceRowStaged
        ? "Audience row shape is review-only; no database mutation is performed."
        : "No Supabase audience row insert, update, or retention path is staged.",
      evidence: input.supabaseAudienceRowStaged ? "row shape only" : "blocked",
      id: "supabase-audience-row",
      label: "Supabase audience row",
      ready: input.supabaseAudienceRowStaged,
    }),
    buildItem({
      action: input.staleStatusFallbackReviewed
        ? "Keep stale fallback visible before provider callback gaps are tested."
        : "Review stale fallback before provider status can be public.",
      detail: input.staleStatusFallbackReviewed
        ? "Fallback covers stale provider events, missing counts, and offline clear labels."
        : "No stale status fallback is reviewed.",
      evidence: input.staleStatusFallbackReviewed ? "stale // missing // offline clear" : "missing",
      id: "stale-status-fallback",
      label: "Stale status fallback",
      ready: input.staleStatusFallbackReviewed,
    }),
    buildItem({
      action: input.rollbackClearStatusReviewed
        ? "Keep clear-order review visible before any provider or public status handoff."
        : "Review rollback clear order before provider status handoff.",
      detail: input.rollbackClearStatusReviewed
        ? "Rollback fixture clears local preview labels before any future public state handoff."
        : "No rollback clear-status order is reviewed.",
      evidence: input.rollbackClearStatusReviewed
        ? "clear preview // detach counts // expire label"
        : "missing",
      id: "rollback-clear-status",
      label: "Rollback clear status",
      ready: input.rollbackClearStatusReviewed,
    }),
  ];

  const reviewCount = items.filter((item) => item.status === "review").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;

  return {
    blockedCount,
    guardCopy: BROADCAST_AUDIENCE_STATUS_GUARD_COPY,
    guards: [...BROADCAST_AUDIENCE_STATUS_GUARDS],
    items,
    reviewCount,
    statusLabel: blockedCount > 0 ? "Local status contract" : "Needs provider staging",
    summary:
      blockedCount > 0
        ? "Broadcasting audience status is a local contract review for state labels, stale fallback, and rollback order while provider state events, audience counts, chat presence, public status mutation, Supabase rows, callbacks, RTMP output, and VOD jobs stay blocked."
        : "Broadcasting audience status has local review coverage for every lane, but provider execution and public rollout still require external staging.",
  };
}

export function createVerifyBroadcastAudienceStatusContract(): BroadcastAudienceStatusContract {
  return buildBroadcastAudienceStatusContract({
    audienceCountReadStaged: false,
    chatPresenceMergeStaged: false,
    localPreviewStateDrafted: true,
    providerLiveStateCallbackStaged: false,
    publicStatusWriteStaged: false,
    rollbackClearStatusReviewed: true,
    staleStatusFallbackReviewed: true,
    supabaseAudienceRowStaged: false,
  });
}

function buildItem({
  action,
  detail,
  evidence,
  id,
  label,
  ready,
}: {
  action: string;
  detail: string;
  evidence: string;
  id: string;
  label: string;
  ready: boolean;
}): BroadcastAudienceStatusContractItem {
  return {
    action,
    detail,
    evidence,
    id,
    label,
    status: ready ? "review" : "blocked",
  };
}
