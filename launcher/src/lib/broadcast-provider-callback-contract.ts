export type BroadcastProviderCallbackContractStatus = "blocked" | "review";

export interface BroadcastProviderCallbackContractInput {
  audienceStatusCallbackStaged: boolean;
  eventSchemaFixtureDrafted: boolean;
  hostedEndpointStaged: boolean;
  idempotencyKeyPlanDrafted: boolean;
  providerDeliveryStaged: boolean;
  redactedAuditRowShapeDrafted: boolean;
  replayDuplicateFixtureDrafted: boolean;
  replayRunnerStaged: boolean;
  signatureHeaderChecklistDrafted: boolean;
  supabaseCallbackWriteStaged: boolean;
  vodSyncCallbackStaged: boolean;
}

export interface BroadcastProviderCallbackContractItem {
  action: string;
  detail: string;
  evidence: string;
  id: string;
  label: string;
  status: BroadcastProviderCallbackContractStatus;
}

export interface BroadcastProviderCallbackContract {
  blockedCount: number;
  guardCopy: string;
  guards: string[];
  items: BroadcastProviderCallbackContractItem[];
  reviewCount: number;
  statusLabel: string;
  summary: string;
}

const BROADCAST_PROVIDER_CALLBACK_CONTRACT_GUARDS = [
  "Local contract fixtures only",
  "No Twitch/YouTube OAuth",
  "No OAuth token exchange",
  "No RTMP/live output",
  "No hosted endpoint deployment",
  "No callback runner",
  "No provider delivery proof",
  "No signature proof",
  "No Supabase callback row mutation",
  "Replay fixture only",
  "No replay runner",
  "No VOD sync job",
  "No audience/live-status claim",
];

const BROADCAST_PROVIDER_CALLBACK_CONTRACT_GUARD_COPY =
  "Provider callback/webhook contract review only. The launcher renders deterministic local event, signature-header, idempotency, and replay-window fixtures; it does not run Twitch/YouTube OAuth, start RTMP/live output, execute hosted callback code, persist callback rows in Supabase, accept provider webhook deliveries, process replay deliveries, sync VOD archives, or update audience/live status.";

export function buildBroadcastProviderCallbackContract(
  input: BroadcastProviderCallbackContractInput,
): BroadcastProviderCallbackContract {
  const items: BroadcastProviderCallbackContractItem[] = [
    {
      action: input.eventSchemaFixtureDrafted
        ? "Keep provider event shape local until real webhook payloads and schema versioning are approved."
        : "Draft local event schema fixtures before any hosted endpoint work.",
      detail: input.eventSchemaFixtureDrafted
        ? "Event schema fixture maps provider, event type, hashed event id, and redaction notes only."
        : "No local event schema fixture is staged.",
      evidence: input.eventSchemaFixtureDrafted
        ? "stream.started // stream.ended // vod.archived"
        : "missing",
      id: "event-schema-fixture",
      label: "Event schema fixture",
      status: input.eventSchemaFixtureDrafted ? "review" : "blocked",
    },
    {
      action: input.signatureHeaderChecklistDrafted
        ? "Keep header allowlist, timestamp skew, and body digest checks local until live provider secrets exist."
        : "Draft callback signature header checklist before any hosted endpoint work.",
      detail: input.signatureHeaderChecklistDrafted
        ? "Signature header checklist is a deterministic local contract; no provider secret or live signature proof is used."
        : "No callback signature header checklist is staged.",
      evidence: input.signatureHeaderChecklistDrafted
        ? "x-provider-signature // timestamp skew // body digest"
        : "missing",
      id: "signature-header-checklist",
      label: "Signature header checklist",
      status: input.signatureHeaderChecklistDrafted ? "review" : "blocked",
    },
    {
      action: input.idempotencyKeyPlanDrafted
        ? "Keep idempotency keys local until callback storage and replay TTL are reviewed."
        : "Draft an idempotency key plan before provider callback delivery.",
      detail: input.idempotencyKeyPlanDrafted
        ? "Idempotency key plan combines provider, hashed event id, and replay window without storing payloads."
        : "No idempotency key plan is staged.",
      evidence: input.idempotencyKeyPlanDrafted
        ? "provider // hashed event id // replay window"
        : "missing",
      id: "idempotency-key-plan",
      label: "Idempotency key plan",
      status: input.idempotencyKeyPlanDrafted ? "review" : "blocked",
    },
    {
      action: input.replayDuplicateFixtureDrafted
        ? "Keep duplicate-event fixture local until provider callback storage exists."
        : "Draft replay duplicate fixture before provider webhooks are accepted.",
      detail: input.replayDuplicateFixtureDrafted
        ? "Replay duplicate handling is listed as fixture evidence only; no replay payload is processed."
        : "No replay duplicate fixture is staged for provider callbacks.",
      evidence: input.replayDuplicateFixtureDrafted
        ? "duplicate event id // stale timestamp // nonce reuse"
        : "missing",
      id: "replay-duplicate-fixture",
      label: "Replay duplicate fixture",
      status: input.replayDuplicateFixtureDrafted ? "review" : "blocked",
    },
    {
      action: input.redactedAuditRowShapeDrafted
        ? "Keep audit fields sanitized and local until Supabase callback rows and RLS are reviewed."
        : "Draft redacted callback audit row shape before any database handoff.",
      detail: input.redactedAuditRowShapeDrafted
        ? "Audit row shape contains event type, hashed id, provider label, and redaction notes only."
        : "No redacted callback audit row shape is staged.",
      evidence: input.redactedAuditRowShapeDrafted
        ? "event type // hashed id // redaction note"
        : "missing",
      id: "redacted-audit-row-shape",
      label: "Redacted audit row shape",
      status: input.redactedAuditRowShapeDrafted ? "review" : "blocked",
    },
    {
      action: input.hostedEndpointStaged
        ? "Keep hosted endpoint work behind review until secrets, replay storage, and rollback pass."
        : "Block hosted endpoint deployment until callback secrets and replay storage are staged.",
      detail: input.hostedEndpointStaged
        ? "Hosted endpoint evidence exists, but callback execution remains disabled."
        : "No hosted callback endpoint is staged.",
      evidence: input.hostedEndpointStaged ? "contract draft only" : "blocked",
      id: "hosted-endpoint",
      label: "Hosted endpoint",
      status: input.hostedEndpointStaged ? "review" : "blocked",
    },
    {
      action: input.providerDeliveryStaged
        ? "Keep provider delivery behind review until endpoint secrets and replay checks pass."
        : "Block provider delivery proof until Twitch/YouTube webhook contracts are staged.",
      detail: input.providerDeliveryStaged
        ? "Provider delivery evidence exists, but live provider traffic remains disabled."
        : "No provider webhook delivery proof is staged.",
      evidence: input.providerDeliveryStaged ? "contract draft only" : "blocked",
      id: "provider-delivery",
      label: "Provider delivery",
      status: input.providerDeliveryStaged ? "review" : "blocked",
    },
    {
      action: input.supabaseCallbackWriteStaged
        ? "Keep callback row storage behind review until RLS and deletion retention pass."
        : "Block callback row mutation until RLS, retention, and redaction are staged.",
      detail: input.supabaseCallbackWriteStaged
        ? "Supabase callback row evidence is represented as a local schema checklist only."
        : "No Supabase callback row mutation path is staged.",
      evidence: input.supabaseCallbackWriteStaged ? "schema checklist only" : "blocked",
      id: "supabase-callback-write",
      label: "Supabase callback row",
      status: input.supabaseCallbackWriteStaged ? "review" : "blocked",
    },
    {
      action: input.replayRunnerStaged
        ? "Keep replay runner behind review until event storage and retry safety are tested."
        : "Block replay runner until duplicate fixtures and callback rows are staged.",
      detail: input.replayRunnerStaged
        ? "Replay runner evidence is represented as a local scheduler checklist only."
        : "No replay runner is staged.",
      evidence: input.replayRunnerStaged ? "scheduler checklist only" : "blocked",
      id: "replay-runner",
      label: "Replay runner",
      status: input.replayRunnerStaged ? "review" : "blocked",
    },
    {
      action: input.vodSyncCallbackStaged
        ? "Keep VOD callback handling behind review until archive imports and retries are tested."
        : "Block VOD sync callback handling until provider archive callbacks are staged.",
      detail: input.vodSyncCallbackStaged
        ? "VOD callback handling is represented as a local scheduler checklist only."
        : "No VOD sync callback handling is staged.",
      evidence: input.vodSyncCallbackStaged ? "scheduler checklist only" : "blocked",
      id: "vod-sync-callback",
      label: "VOD sync callback",
      status: input.vodSyncCallbackStaged ? "review" : "blocked",
    },
    {
      action: input.audienceStatusCallbackStaged
        ? "Keep audience callback handling behind review until live status contracts are approved."
        : "Block audience status callbacks until provider live-status contracts are staged.",
      detail: input.audienceStatusCallbackStaged
        ? "Audience callback evidence exists, but live status updates remain disabled."
        : "No audience/live-status callback handling is staged.",
      evidence: input.audienceStatusCallbackStaged ? "status checklist only" : "blocked",
      id: "audience-status-callback",
      label: "Audience status callback",
      status: input.audienceStatusCallbackStaged ? "review" : "blocked",
    },
  ];

  const reviewCount = items.filter((item) => item.status === "review").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;

  return {
    blockedCount,
    guardCopy: BROADCAST_PROVIDER_CALLBACK_CONTRACT_GUARD_COPY,
    guards: [...BROADCAST_PROVIDER_CALLBACK_CONTRACT_GUARDS],
    items,
    reviewCount,
    statusLabel: "Local contract review",
    summary:
      "Local provider callback contract review covers event schema, signature headers, idempotency, replay duplicate fixtures, and redacted audit rows while hosted endpoints, provider delivery, Supabase callback rows, replay runners, VOD sync callbacks, audience status callbacks, OAuth, and RTMP/live output stay blocked.",
  };
}

export function createVerifyBroadcastProviderCallbackContract(): BroadcastProviderCallbackContract {
  return buildBroadcastProviderCallbackContract({
    audienceStatusCallbackStaged: false,
    eventSchemaFixtureDrafted: true,
    hostedEndpointStaged: false,
    idempotencyKeyPlanDrafted: true,
    providerDeliveryStaged: false,
    redactedAuditRowShapeDrafted: true,
    replayDuplicateFixtureDrafted: true,
    replayRunnerStaged: false,
    signatureHeaderChecklistDrafted: true,
    supabaseCallbackWriteStaged: false,
    vodSyncCallbackStaged: false,
  });
}
