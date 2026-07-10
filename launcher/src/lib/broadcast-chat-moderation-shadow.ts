export type BroadcastChatModerationSeverity = "allow" | "block" | "review";
export type BroadcastChatModerationRuleId =
  "caps-spike" | "clean" | "link-drop" | "secret-leak" | "spoiler-tag";

export interface BroadcastChatModerationMessage {
  authorHandle: string;
  channel: "local-fixture" | "twitch-staging" | "youtube-staging";
  id: string;
  message: string;
  timestamp: string;
}

export interface BroadcastChatModerationRuleHit {
  detail: string;
  id: BroadcastChatModerationRuleId;
  label: string;
  severity: BroadcastChatModerationSeverity;
}

export interface BroadcastChatModerationQueueItem {
  actionLabel: string;
  authorHandle: string;
  channelLabel: string;
  id: string;
  messagePreview: string;
  ruleHits: BroadcastChatModerationRuleHit[];
  severity: BroadcastChatModerationSeverity;
  timestamp: string;
}

export interface BroadcastChatModerationShadowQueue {
  allowCount: number;
  blockCount: number;
  guardCopy: string;
  guards: string[];
  queue: BroadcastChatModerationQueueItem[];
  reviewCount: number;
  statusLabel: string;
  summary: string;
}

const BROADCAST_CHAT_MODERATION_SHADOW_GUARDS = [
  "Local shadow review",
  "No provider chat read",
  "No Twitch/YouTube OAuth",
  "No hosted enforcement",
  "No moderation action sent",
  "No Supabase moderation logs",
  "No live chat replay",
];

const BROADCAST_CHAT_MODERATION_SHADOW_GUARD_COPY =
  "Broadcast chat moderation shadow queue only. The launcher evaluates deterministic local fixtures and redacts risky previews; it does not read provider chat, connect Twitch/YouTube OAuth, run hosted moderation, send timeout/ban/delete actions, write Supabase moderation logs, replay live chat, start RTMP/live output, sync VOD, or update audience/live status.";

const SECRET_LEAK_PATTERN =
  /\b(?:(?:stream\s+key|token|secret)\s*[:=]?\s*[a-z0-9][a-z0-9_:-]{2,}|(?:live|sk|token)_[a-z0-9_:-]+)\b/i;
const SECRET_LEAK_REDACTION_PATTERN =
  /\b(?:(?:stream\s+key|token|secret)\s*[:=]?\s*[a-z0-9][a-z0-9_:-]{2,}|(?:live|sk|token)_[a-z0-9_:-]+)\b/gi;

const VERIFY_BROADCAST_CHAT_MESSAGES: BroadcastChatModerationMessage[] = [
  {
    authorHandle: "KiraByte",
    channel: "local-fixture",
    id: "chat-clean-combo",
    message: "GG squad, clean drift finish.",
    timestamp: "2026-06-10T19:00:00.000Z",
  },
  {
    authorHandle: "ArcLight",
    channel: "twitch-staging",
    id: "chat-link-drop",
    message: "Free coins at https://spam.example/og-drop",
    timestamp: "2026-06-10T19:01:00.000Z",
  },
  {
    authorHandle: "NullVector",
    channel: "youtube-staging",
    id: "chat-spoiler-caps",
    message: "SPOILER FINAL BOSS PHASE THREE",
    timestamp: "2026-06-10T19:02:00.000Z",
  },
  {
    authorHandle: "StreamOps",
    channel: "local-fixture",
    id: "chat-secret-leak",
    message: "rotate stream key live_123456789_abcdef before queue",
    timestamp: "2026-06-10T19:03:00.000Z",
  },
];

export function buildBroadcastChatModerationShadowQueue(
  messages: BroadcastChatModerationMessage[],
): BroadcastChatModerationShadowQueue {
  const queue = messages.map(mapModerationQueueItem).sort((left, right) => {
    const severityDelta = severityWeight(right.severity) - severityWeight(left.severity);
    if (severityDelta !== 0) return severityDelta;
    return Date.parse(left.timestamp) - Date.parse(right.timestamp);
  });

  const allowCount = queue.filter((item) => item.severity === "allow").length;
  const reviewCount = queue.filter((item) => item.severity === "review").length;
  const blockCount = queue.filter((item) => item.severity === "block").length;

  return {
    allowCount,
    blockCount,
    guardCopy: BROADCAST_CHAT_MODERATION_SHADOW_GUARD_COPY,
    guards: [...BROADCAST_CHAT_MODERATION_SHADOW_GUARDS],
    queue,
    reviewCount,
    statusLabel: "Local shadow review",
    summary: `${reviewCount + blockCount}/${queue.length} local chat fixtures enter the shadow queue; actions are preview-only and never sent to a provider.`,
  };
}

export function createVerifyBroadcastChatModerationShadowQueue(): BroadcastChatModerationShadowQueue {
  return buildBroadcastChatModerationShadowQueue(VERIFY_BROADCAST_CHAT_MESSAGES);
}

function mapModerationQueueItem(
  message: BroadcastChatModerationMessage,
): BroadcastChatModerationQueueItem {
  const ruleHits = evaluateMessageRules(message.message);
  const severity = getQueueSeverity(ruleHits);

  return {
    actionLabel: getActionLabel(severity),
    authorHandle: message.authorHandle,
    channelLabel: getChannelLabel(message.channel),
    id: message.id,
    messagePreview: redactMessagePreview(message.message),
    ruleHits,
    severity,
    timestamp: message.timestamp,
  };
}

function evaluateMessageRules(message: string): BroadcastChatModerationRuleHit[] {
  const hits: BroadcastChatModerationRuleHit[] = [];
  const upperMessage = message.toUpperCase();
  const wordCharacters = message.replace(/[^a-z]/gi, "");
  const upperCharacters = wordCharacters.replace(/[^A-Z]/g, "");

  if (/https?:\/\/|discord\.gg\/|invite/i.test(message)) {
    hits.push({
      detail: "External link is redacted and queued for local review only.",
      id: "link-drop",
      label: "Link drop",
      severity: "review",
    });
  }

  if (SECRET_LEAK_PATTERN.test(message)) {
    hits.push({
      detail: "Sensitive token-shaped text is redacted and shadow-blocked in the local queue.",
      id: "secret-leak",
      label: "Secret leak",
      severity: "block",
    });
  }

  if (/\bSPOILER\b/i.test(message)) {
    hits.push({
      detail: "Spoiler wording is routed to local review before any public replay surface.",
      id: "spoiler-tag",
      label: "Spoiler tag",
      severity: "review",
    });
  }

  if (
    wordCharacters.length >= 12 &&
    upperCharacters.length / Math.max(1, wordCharacters.length) >= 0.78 &&
    upperMessage !== message.toLowerCase()
  ) {
    hits.push({
      detail: "Caps-heavy message is marked for local review only.",
      id: "caps-spike",
      label: "Caps spike",
      severity: "review",
    });
  }

  if (hits.length === 0) {
    hits.push({
      detail: "No shadow moderation rule matched this local fixture.",
      id: "clean",
      label: "Clean fixture",
      severity: "allow",
    });
  }

  return hits;
}

function getQueueSeverity(hits: BroadcastChatModerationRuleHit[]): BroadcastChatModerationSeverity {
  if (hits.some((hit) => hit.severity === "block")) return "block";
  if (hits.some((hit) => hit.severity === "review")) return "review";
  return "allow";
}

function getActionLabel(severity: BroadcastChatModerationSeverity) {
  if (severity === "block") return "Shadow block preview";
  if (severity === "review") return "Queue local review";
  return "Allow locally";
}

function getChannelLabel(channel: BroadcastChatModerationMessage["channel"]) {
  if (channel === "twitch-staging") return "Twitch fixture";
  if (channel === "youtube-staging") return "YouTube fixture";
  return "Local fixture";
}

function redactMessagePreview(message: string) {
  return message
    .replace(/https?:\/\/\S+/gi, "[link-redacted]")
    .replace(SECRET_LEAK_REDACTION_PATTERN, "[secret-redacted]")
    .slice(0, 96);
}

function severityWeight(severity: BroadcastChatModerationSeverity) {
  if (severity === "block") return 3;
  if (severity === "review") return 2;
  return 1;
}
