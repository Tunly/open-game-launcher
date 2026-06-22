export type BroadcastLiveSessionRehearsalStatus = "blocked" | "review";

export interface BroadcastLiveSessionRehearsalInput {
  audienceStatusStaged: boolean;
  callbackReplayStaged: boolean;
  desktopVaultHandoffReviewed: boolean;
  hostedModerationStaged: boolean;
  localPreflightReviewed: boolean;
  providerChatAttachStaged: boolean;
  providerOAuthLaunchStaged: boolean;
  rollbackDrillReviewed: boolean;
  rtmpNegotiationStaged: boolean;
  vodArchiveHandoffStaged: boolean;
}

export interface BroadcastLiveSessionRehearsalStep {
  action: string;
  detail: string;
  evidence: string;
  id: string;
  label: string;
  status: BroadcastLiveSessionRehearsalStatus;
}

export interface BroadcastLiveSessionRehearsal {
  blockedCount: number;
  guardCopy: string;
  guards: string[];
  reviewCount: number;
  statusLabel: string;
  steps: BroadcastLiveSessionRehearsalStep[];
  summary: string;
}

const BROADCAST_LIVE_SESSION_REHEARSAL_GUARDS = [
  "Local rehearsal only",
  "Review-only provider sequence",
  "No provider OAuth launch",
  "No RTMP socket",
  "No stream-key live use",
  "No provider chat read",
  "No hosted moderation execution",
  "No VOD provider sync",
  "No provider callback replay",
  "No live audience status",
];

const BROADCAST_LIVE_SESSION_REHEARSAL_GUARD_COPY =
  "Broadcast live-session rehearsal only. The launcher reviews the go-live order from deterministic local evidence; it does not open provider OAuth, create an RTMP socket, use stream keys for broadcast, read provider chat, execute hosted moderation, sync VOD archives, replay provider callbacks, or update audience status.";

export function buildBroadcastLiveSessionRehearsal(
  input: BroadcastLiveSessionRehearsalInput,
): BroadcastLiveSessionRehearsal {
  const steps: BroadcastLiveSessionRehearsalStep[] = [
    buildStep({
      action: input.localPreflightReviewed
        ? "Keep the local capture, overlay, upload, chat, and VOD checklist as rehearsal input."
        : "Restore local broadcast preflight before any live-session rehearsal.",
      detail: input.localPreflightReviewed
        ? "Local preflight supplies deterministic capture and upload evidence for the dry-run sequence."
        : "No local preflight evidence is staged for this broadcast rehearsal.",
      evidence: input.localPreflightReviewed ? "capture + overlay + upload checklist" : "missing",
      id: "local-preflight",
      label: "Local preflight",
      ready: input.localPreflightReviewed,
    }),
    buildStep({
      action: input.desktopVaultHandoffReviewed
        ? "Keep stream-key metadata in the desktop vault boundary before live-provider review."
        : "Review desktop-vault handoff before provider launch rehearsal.",
      detail: input.desktopVaultHandoffReviewed
        ? "Vault handoff is reviewed without exposing or using the secret for broadcast."
        : "Desktop stream-key handoff has not been reviewed for the rehearsal.",
      evidence: input.desktopVaultHandoffReviewed ? "desktop vault metadata only" : "blocked",
      id: "desktop-vault-handoff",
      label: "Desktop vault handoff",
      ready: input.desktopVaultHandoffReviewed,
    }),
    buildStep({
      action: input.providerOAuthLaunchStaged
        ? "Keep provider authorization in review mode until callback and token storage pass."
        : "Stage OAuth consent, scopes, callback URI, and redacted token logs before provider launch.",
      detail: input.providerOAuthLaunchStaged
        ? "OAuth launch evidence exists as a review artifact; no browser is opened."
        : "Twitch/YouTube OAuth launch remains blocked for this local rehearsal.",
      evidence: input.providerOAuthLaunchStaged ? "scope + redirect review" : "blocked",
      id: "provider-oauth-launch",
      label: "Provider OAuth launch",
      ready: input.providerOAuthLaunchStaged,
    }),
    buildStep({
      action: input.rtmpNegotiationStaged
        ? "Keep RTMP negotiation in dry-run review until stream safety and rollback pass."
        : "Stage RTMP handshake, ingest URL redaction, bitrate cap, and rollback review.",
      detail: input.rtmpNegotiationStaged
        ? "RTMP negotiation is represented as dry-run packet evidence only."
        : "No RTMP socket or ingest negotiation is staged for live output.",
      evidence: input.rtmpNegotiationStaged ? "dry-run ingest packet" : "blocked",
      id: "rtmp-negotiation",
      label: "RTMP ingest negotiation",
      ready: input.rtmpNegotiationStaged,
    }),
    buildStep({
      action: input.providerChatAttachStaged
        ? "Keep provider chat attach review-only until OAuth and moderation audit pass."
        : "Stage provider chat read contract, channel IDs, and redacted sample events.",
      detail: input.providerChatAttachStaged
        ? "Provider chat attach is represented as local event-shape evidence only."
        : "No provider chat connection or read path is staged.",
      evidence: input.providerChatAttachStaged ? "chat event contract" : "blocked",
      id: "provider-chat-attach",
      label: "Provider chat attach",
      ready: input.providerChatAttachStaged,
    }),
    buildStep({
      action: input.hostedModerationStaged
        ? "Keep hosted moderation in shadow review until provider chat replay is tested."
        : "Stage hosted moderation queue, action audit, and rollback rules.",
      detail: input.hostedModerationStaged
        ? "Hosted moderation handoff is represented as shadow-queue evidence only."
        : "No hosted moderation action runner is staged.",
      evidence: input.hostedModerationStaged ? "shadow queue packet" : "blocked",
      id: "hosted-moderation-handoff",
      label: "Hosted moderation handoff",
      ready: input.hostedModerationStaged,
    }),
    buildStep({
      action: input.vodArchiveHandoffStaged
        ? "Keep VOD archive handoff in review until provider import/delete coverage passes."
        : "Stage archive visibility, retention, delete coverage, and provider import review.",
      detail: input.vodArchiveHandoffStaged
        ? "VOD archive handoff is represented as local policy evidence only."
        : "No provider VOD sync or archive import is staged.",
      evidence: input.vodArchiveHandoffStaged ? "archive policy packet" : "blocked",
      id: "vod-archive-handoff",
      label: "VOD archive handoff",
      ready: input.vodArchiveHandoffStaged,
    }),
    buildStep({
      action: input.callbackReplayStaged
        ? "Keep provider callback replay in review until hosted endpoint secrets exist."
        : "Stage callback signatures, idempotency, replay-window, and redacted audit rows.",
      detail: input.callbackReplayStaged
        ? "Callback replay is represented as deterministic duplicate-event fixture evidence only."
        : "No provider callback or replay runner is staged.",
      evidence: input.callbackReplayStaged ? "duplicate event fixture" : "blocked",
      id: "callback-replay",
      label: "Provider callback replay",
      ready: input.callbackReplayStaged,
    }),
    buildStep({
      action: input.audienceStatusStaged
        ? "Keep audience status behind review until provider live-state contracts pass."
        : "Stage audience/live-status contract before any public status update.",
      detail: input.audienceStatusStaged
        ? "Audience status update is represented as review-only state transition evidence."
        : "No audience count, live status, or public status update is staged.",
      evidence: input.audienceStatusStaged ? "status transition packet" : "blocked",
      id: "audience-status",
      label: "Audience status update",
      ready: input.audienceStatusStaged,
    }),
    buildStep({
      action: input.rollbackDrillReviewed
        ? "Keep rollback order visible before provider staging: stop output, detach chat, clear UI state."
        : "Review rollback order before any hosted/provider session attempt.",
      detail: input.rollbackDrillReviewed
        ? "Rollback drill is local sequence evidence; it does not stop a real provider session."
        : "No rollback drill is staged for failed go-live paths.",
      evidence: input.rollbackDrillReviewed ? "stop + detach + clear sequence" : "missing",
      id: "rollback-drill",
      label: "Rollback drill",
      ready: input.rollbackDrillReviewed,
    }),
  ];

  const reviewCount = steps.filter((step) => step.status === "review").length;
  const blockedCount = steps.filter((step) => step.status === "blocked").length;

  return {
    blockedCount,
    guardCopy: BROADCAST_LIVE_SESSION_REHEARSAL_GUARD_COPY,
    guards: [...BROADCAST_LIVE_SESSION_REHEARSAL_GUARDS],
    reviewCount,
    statusLabel:
      blockedCount > 0 && reviewCount < steps.length - 1
        ? "Local rehearsal only"
        : "Needs live staging",
    steps,
    summary:
      blockedCount > 0
        ? "Broadcasting live-session rehearsal is a local dry-run sequence; provider OAuth, RTMP ingest, chat, hosted moderation, VOD handoff, callback replay, audience status, and live output remain blocked."
        : "Broadcasting live-session rehearsal has review evidence for each lane, but audience status and provider execution still require live staging.",
  };
}

export function createVerifyBroadcastLiveSessionRehearsal(): BroadcastLiveSessionRehearsal {
  return buildBroadcastLiveSessionRehearsal({
    audienceStatusStaged: false,
    callbackReplayStaged: false,
    desktopVaultHandoffReviewed: true,
    hostedModerationStaged: false,
    localPreflightReviewed: true,
    providerChatAttachStaged: false,
    providerOAuthLaunchStaged: false,
    rollbackDrillReviewed: true,
    rtmpNegotiationStaged: false,
    vodArchiveHandoffStaged: false,
  });
}

function buildStep({
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
}): BroadcastLiveSessionRehearsalStep {
  return {
    action,
    detail,
    evidence,
    id,
    label,
    status: ready ? "review" : "blocked",
  };
}
