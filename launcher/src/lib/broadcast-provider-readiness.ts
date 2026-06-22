export type BroadcastProviderReadinessStatus = "blocked" | "ready" | "warning";

export interface BroadcastProviderReadinessInput {
  capturePreflightReady: boolean;
  hostedChatModerationReady: boolean;
  providerOAuthReady: boolean;
  providerPolicyReady: boolean;
  rtmpIngestReady: boolean;
  streamKeyVaultReady: boolean;
  vodProviderSyncReady: boolean;
  webhookCallbackReady: boolean;
}

export interface BroadcastProviderReadinessGate {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: BroadcastProviderReadinessStatus;
}

export interface BroadcastProviderPolicyRule {
  blockedAutomation: string;
  provider: string;
  redaction: string;
  scopeBoundary: string;
  stagingLimit: string;
}

export interface BroadcastProviderPolicyEvidence {
  guards: string[];
  label: string;
  providerRules: BroadcastProviderPolicyRule[];
  status: Extract<BroadcastProviderReadinessStatus, "warning">;
  summary: string;
}

export interface BroadcastProviderReadiness {
  blockedCount: number;
  gates: BroadcastProviderReadinessGate[];
  guardCopy: string;
  guards: string[];
  nextAction: string;
  providerPolicyEvidence: BroadcastProviderPolicyEvidence | null;
  progress: number;
  readyCount: number;
  statusLabel: string;
  summary: string;
  warningCount: number;
}

const BROADCAST_PROVIDER_GUARDS = [
  "Local fixtures only",
  "No Twitch/YouTube OAuth",
  "No RTMP/live output",
  "No stream-key live use",
  "No hosted chat moderation",
  "No VOD provider sync",
  "No audience/live-status claim",
];

const BROADCAST_PROVIDER_GUARD_COPY =
  "Local broadcasting hosted/provider readiness only. This panel reviews local capture, overlay, upload, and desktop-vault evidence; it does not run Twitch/YouTube OAuth, start RTMP ingest or live output, use stream keys for broadcast, verify hosted chat moderation, sync VOD archives, or claim audience/live status.";

const BROADCAST_PROVIDER_POLICY_EVIDENCE: BroadcastProviderPolicyEvidence = {
  guards: [
    "OAuth scope review only",
    "No authorization redirect launch",
    "No OAuth token exchange",
    "No provider chat/VOD writes",
    "Stream keys stay desktop-vault only",
    "Provider terms approval required before rollout",
  ],
  label: "Provider Scope + Terms Policy",
  providerRules: [
    {
      blockedAutomation:
        "No authorization URL launch, token exchange, chat read, stream start, or webhook write is staged.",
      provider: "Twitch",
      redaction:
        "Client ids, auth codes, access tokens, refresh tokens, and stream keys stay redacted.",
      scopeBoundary:
        "Review-only scope packet for stream read/manage, chat moderation, VOD archive, and event callbacks.",
      stagingLimit: "Local fixtures and dry-run packets only; no public channel mutation.",
    },
    {
      blockedAutomation:
        "No Google OAuth launch, token exchange, liveBroadcast mutation, chat attach, or callback write is staged.",
      provider: "YouTube",
      redaction:
        "OAuth codes, access tokens, refresh tokens, broadcast ids, and stream keys stay redacted.",
      scopeBoundary:
        "Review-only scope packet for live broadcasts, live chat, VOD privacy, and callback/audit rows.",
      stagingLimit: "Local fixtures and dry-run packets only; no public live event creation.",
    },
    {
      blockedAutomation:
        "No socket connect, ingest negotiation, RTMP publish, or stream-key live use is staged.",
      provider: "Custom RTMP",
      redaction: "Ingest hosts, path tokens, and stream-key hints stay masked in UI and logs.",
      scopeBoundary:
        "Manual endpoint review only; provider-specific terms must be approved outside this route.",
      stagingLimit: "Redacted dry-run packet only; no network output.",
    },
  ],
  status: "warning",
  summary:
    "Provider policy is local evidence only: OG-Launcher can review scopes, terms boundaries, staging limits, and redaction rules, but this verify route never launches OAuth, exchanges tokens, opens RTMP sockets, writes provider chat/VOD state, or creates a live broadcast.",
};

export function buildBroadcastProviderReadiness(
  input: BroadcastProviderReadinessInput,
): BroadcastProviderReadiness {
  const gates: BroadcastProviderReadinessGate[] = [
    {
      action: input.capturePreflightReady
        ? "Keep local capture, overlay, upload, chat, and VOD checks as the baseline."
        : "Restore local broadcast preflight before provider staging.",
      detail: input.capturePreflightReady
        ? "The local Broadcast Readiness panel can rank preview lanes without provider execution."
        : "No local broadcast preflight evidence is available.",
      id: "capture-preflight",
      label: "Local Capture Evidence",
      status: input.capturePreflightReady ? "ready" : "blocked",
    },
    {
      action: input.capturePreflightReady
        ? "Keep overlay review tied to local preview state until provider E2E exists."
        : "Restore overlay capture safety evidence before provider staging.",
      detail: input.capturePreflightReady
        ? "Overlay safety is local preflight evidence only."
        : "No overlay safety review evidence is staged.",
      id: "overlay-safety-review",
      label: "Overlay Safety Review",
      status: input.capturePreflightReady ? "ready" : "blocked",
    },
    {
      action: input.capturePreflightReady
        ? "Keep upload estimates local until RTMP probes are explicitly staged."
        : "Restore upload headroom estimates before provider live review.",
      detail: input.capturePreflightReady
        ? "Upload headroom is estimated from local preflight inputs only."
        : "No upload headroom estimate is available.",
      id: "upload-headroom-estimate",
      label: "Upload Headroom Estimate",
      status: input.capturePreflightReady ? "ready" : "blocked",
    },
    {
      action: input.streamKeyVaultReady
        ? "Keep stream-key evidence in the desktop vault and out of browser state."
        : "Stage a desktop stream-key vault before any provider live run.",
      detail: input.streamKeyVaultReady
        ? "Stream-key handling is represented as local vault readiness only."
        : "No desktop stream-key vault evidence is staged.",
      id: "stream-key-vault",
      label: "Desktop Vault Slot",
      status: input.streamKeyVaultReady ? "warning" : "blocked",
    },
    {
      action: input.providerPolicyReady
        ? "Review provider scopes, terms boundaries, and redaction before OAuth."
        : "Document Twitch/YouTube scopes, rate limits, logging, and terms before OAuth.",
      detail: input.providerPolicyReady
        ? "Provider policy evidence exists for scopes, staging limits, redaction, and no live provider mutation."
        : "No provider policy, scope, or terms review is staged.",
      id: "provider-policy",
      label: "Provider Policy",
      status: input.providerPolicyReady ? "warning" : "blocked",
    },
    {
      action: input.providerOAuthReady
        ? "Keep provider OAuth review-only until callback and token storage are verified."
        : "Stage Twitch/YouTube OAuth with scoped consent and redacted token logs.",
      detail: input.providerOAuthReady
        ? "Provider OAuth evidence exists, but live sign-in remains disabled."
        : "No Twitch or YouTube OAuth flow is staged.",
      id: "provider-oauth",
      label: "Provider OAuth Gate",
      status: input.providerOAuthReady ? "warning" : "blocked",
    },
    {
      action: input.rtmpIngestReady
        ? "Keep RTMP ingest in dry-run review until safety and rollback pass."
        : "Stage RTMP ingest negotiation without publishing a public live stream.",
      detail: input.rtmpIngestReady
        ? "RTMP evidence exists, but public stream output remains disabled."
        : "No RTMP ingest, stream start, or live output is staged.",
      id: "rtmp-ingest",
      label: "RTMP Live Output Gate",
      status: input.rtmpIngestReady ? "warning" : "blocked",
    },
    {
      action: input.hostedChatModerationReady
        ? "Keep hosted moderation shadow-only until provider chat replay is tested."
        : "Stage hosted chat moderation, queue review, and ban/timeout audit logs.",
      detail: input.hostedChatModerationReady
        ? "Hosted moderation evidence exists, but provider chat remains disabled."
        : "No hosted chat moderation service is staged.",
      id: "hosted-chat-moderation",
      label: "Hosted Chat Moderation Gate",
      status: input.hostedChatModerationReady ? "warning" : "blocked",
    },
    {
      action: input.vodProviderSyncReady
        ? "Keep VOD sync review-only until provider archives and privacy are verified."
        : "Stage VOD provider sync, archive visibility, retention, and delete coverage.",
      detail: input.vodProviderSyncReady
        ? "VOD sync evidence exists, but provider archive sync remains disabled."
        : "No Twitch/YouTube VOD provider sync is staged.",
      id: "vod-provider-sync",
      label: "VOD Provider Sync Gate",
      status: input.vodProviderSyncReady ? "warning" : "blocked",
    },
    {
      action: input.webhookCallbackReady
        ? "Keep webhook callbacks in audit-only mode before live rollout."
        : "Stage provider webhooks/callbacks with signature checks, replay guards, and audit rows.",
      detail: input.webhookCallbackReady
        ? "Provider callback evidence exists, but hosted live handling remains disabled."
        : "No provider webhook/callback verification is staged.",
      id: "webhook-callback",
      label: "Go-Live Review Gate",
      status: input.webhookCallbackReady ? "warning" : "blocked",
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
    guardCopy: BROADCAST_PROVIDER_GUARD_COPY,
    guards: [...BROADCAST_PROVIDER_GUARDS],
    nextAction: nextGate?.action ?? "Broadcast provider gates can enter controlled staging.",
    providerPolicyEvidence: input.providerPolicyReady
      ? {
          ...BROADCAST_PROVIDER_POLICY_EVIDENCE,
          guards: [...BROADCAST_PROVIDER_POLICY_EVIDENCE.guards],
          providerRules: BROADCAST_PROVIDER_POLICY_EVIDENCE.providerRules.map((rule) => ({
            ...rule,
          })),
        }
      : null,
    progress: Math.round((readyCount / gates.length) * 100),
    readyCount,
    statusLabel:
      blockedCount > 0 ? "Local only" : warningCount > 0 ? "Needs staging" : "Review ready",
    summary:
      blockedCount > 0
        ? "Broadcasting provider rollout is still local readiness evidence with provider policy review; OAuth, RTMP ingest, hosted chat, VOD sync, and provider callbacks remain open."
        : warningCount > 0
          ? "Broadcasting provider staging and policy evidence exists, but live provider rollout still needs review."
          : "Broadcasting provider rollout can enter controlled staging.",
    warningCount,
  };
}

export function createVerifyBroadcastProviderReadiness(): BroadcastProviderReadiness {
  return buildBroadcastProviderReadiness({
    capturePreflightReady: true,
    hostedChatModerationReady: false,
    providerOAuthReady: false,
    providerPolicyReady: true,
    rtmpIngestReady: false,
    streamKeyVaultReady: false,
    vodProviderSyncReady: false,
    webhookCallbackReady: false,
  });
}
