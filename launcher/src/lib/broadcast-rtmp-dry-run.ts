export type BroadcastRtmpDryRunStatus = "blocked" | "review";

export interface BroadcastRtmpDryRunInput {
  bitrateKbps: number;
  ingestUrl: string;
  keyConfigured: boolean;
  provider: "custom" | "twitch" | "youtube";
  resolution: string;
  streamKeyHint?: string | null;
}

export interface BroadcastRtmpDryRunCheck {
  detail: string;
  id: string;
  label: string;
  status: BroadcastRtmpDryRunStatus;
}

export interface BroadcastRtmpDryRunPacket {
  bitrateKbps: number;
  checks: BroadcastRtmpDryRunCheck[];
  guardCopy: string;
  guards: string[];
  keyHint: string;
  packetId: string;
  provider: string;
  redactedIngestUrl: string;
  resolution: string;
  summary: string;
}

const BROADCAST_RTMP_DRY_RUN_GUARDS = [
  "Dry-run packet only",
  "No socket opened",
  "No RTMP publish attempt",
  "No stream-key reveal",
  "No OAuth token exchange",
  "No live output",
  "No audience status",
];

const BROADCAST_RTMP_DRY_RUN_GUARD_COPY =
  "RTMP dry-run packet only. The launcher parses and redacts local staging fields, but does not open a socket, publish RTMP media, use stream keys for broadcast, exchange OAuth tokens, create a public stream, or update audience/live status.";

export function buildBroadcastRtmpDryRunPacket(
  input: BroadcastRtmpDryRunInput,
): BroadcastRtmpDryRunPacket {
  const redactedIngestUrl = redactRtmpIngestUrl(input.ingestUrl);
  const keyHint = redactStreamKeyHint(input.streamKeyHint, input.keyConfigured);
  const validEndpoint = redactedIngestUrl !== "invalid endpoint";
  const checks: BroadcastRtmpDryRunCheck[] = [
    {
      detail: validEndpoint
        ? `${redactedIngestUrl} parsed locally with path and query removed.`
        : "Endpoint could not be parsed as rtmp or rtmps.",
      id: "endpoint-parse",
      label: "Endpoint Parse",
      status: validEndpoint ? "review" : "blocked",
    },
    {
      detail: input.keyConfigured
        ? `${keyHint} staged as a redacted hint only.`
        : "No stream-key hint staged for this dry run.",
      id: "stream-key-redaction",
      label: "Stream-Key Redaction",
      status: input.keyConfigured ? "review" : "blocked",
    },
    {
      detail: `${input.resolution} at ${input.bitrateKbps} kbps is recorded as a local planning envelope.`,
      id: "encoder-envelope",
      label: "Encoder Envelope",
      status: input.bitrateKbps > 0 && input.resolution.trim().length > 0 ? "review" : "blocked",
    },
    {
      detail: "Network probe intentionally skipped; no socket or publish attempt is made.",
      id: "network-skip",
      label: "Network Skip",
      status: "review",
    },
    {
      detail:
        "Provider OAuth, public stream creation, chat, VOD, and audience status remain out of scope.",
      id: "provider-skip",
      label: "Provider Skip",
      status: "review",
    },
  ];

  return {
    bitrateKbps: Math.max(0, Math.round(input.bitrateKbps)),
    checks,
    guardCopy: BROADCAST_RTMP_DRY_RUN_GUARD_COPY,
    guards: [...BROADCAST_RTMP_DRY_RUN_GUARDS],
    keyHint,
    packetId: createDryRunPacketId(input, redactedIngestUrl),
    provider: getProviderLabel(input.provider),
    redactedIngestUrl,
    resolution: input.resolution,
    summary:
      "Local RTMP staging packet created for review only; stream keys stay redacted and no network or provider action is executed.",
  };
}

export function createVerifyBroadcastRtmpDryRunPacket(): BroadcastRtmpDryRunPacket {
  return buildBroadcastRtmpDryRunPacket({
    bitrateKbps: 6000,
    ingestUrl: "rtmps://live.twitch.tv/app/live_123456789_abcdef",
    keyConfigured: true,
    provider: "twitch",
    resolution: "1920x1080@60",
    streamKeyHint: "live_123456789_abcdef",
  });
}

function redactRtmpIngestUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "rtmp:" && parsed.protocol !== "rtmps:") {
      return "invalid endpoint";
    }

    return `${parsed.protocol}//${parsed.hostname}/[path-redacted]`;
  } catch {
    return "invalid endpoint";
  }
}

function redactStreamKeyHint(value: string | null | undefined, configured: boolean) {
  if (!configured) return "not configured";
  const trimmed = value?.trim() ?? "";
  if (trimmed.length < 8) return "stored key redacted";
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function createDryRunPacketId(input: BroadcastRtmpDryRunInput, redactedIngestUrl: string) {
  return [
    input.provider,
    redactedIngestUrl
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase(),
    Math.max(0, Math.round(input.bitrateKbps)),
  ].join("-");
}

function getProviderLabel(provider: BroadcastRtmpDryRunInput["provider"]) {
  if (provider === "twitch") return "Twitch staging";
  if (provider === "youtube") return "YouTube staging";
  return "Custom RTMP staging";
}
