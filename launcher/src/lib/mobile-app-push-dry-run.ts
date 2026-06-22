export type MobilePushPlatform = "android" | "ios";
export type MobilePushDryRunStatus = "blocked" | "review";
export type MobilePushNotificationPermission = "denied" | "granted" | "prompt";

export interface MobilePushDryRunPayloadInput {
  action: string;
  body: string;
  buildId: string;
  jobId: string;
  title: string;
}

export interface MobileAppPushDryRunInput {
  consentGranted: boolean;
  deviceToken?: string | null;
  notificationPermission: MobilePushNotificationPermission;
  payload: MobilePushDryRunPayloadInput;
  platform: MobilePushPlatform;
  targetLabel: string;
}

export interface MobilePushDryRunCheck {
  detail: string;
  id: string;
  label: string;
  status: MobilePushDryRunStatus;
}

export interface MobilePushDryRunPayloadPreview {
  action: string;
  body: string;
  buildId: string;
  jobId: string;
  title: string;
}

export interface MobileAppPushDryRunPacket {
  blockedCount: number;
  checks: MobilePushDryRunCheck[];
  consentLabel: string;
  guardCopy: string;
  guards: string[];
  packetId: string;
  payloadPreview: MobilePushDryRunPayloadPreview;
  platform: MobilePushPlatform;
  platformLabel: string;
  statusLabel: "Blocked" | "Dry run";
  summary: string;
  targetLabel: string;
  tokenHint: string;
  writeMode: "Writes: none";
}

const PUSH_DRY_RUN_GUARDS = [
  "Dry-run packet only",
  "No push notification send",
  "No APNs/FCM network call",
  "No device-token write",
  "No Supabase write",
  "No background mobile download",
  "Writes: none",
];

const PUSH_DRY_RUN_GUARD_COPY =
  "Local mobile push dry-run packet only. The launcher redacts target token data and previews the notification envelope, but does not send push notifications, call APNs/FCM, write device tokens, write Supabase rows, or start background mobile downloads.";

export function buildMobileAppPushDryRunPacket(
  input: MobileAppPushDryRunInput,
): MobileAppPushDryRunPacket {
  const platformLabel = getPlatformLabel(input.platform);
  const targetLabel = sanitizeLabel(input.targetLabel, "Mobile Companion");
  const tokenHint = redactDeviceTokenHint(input.deviceToken);
  const tokenSafe = hasSafeDeviceTokenHint(input.deviceToken);
  const consentReady = input.consentGranted && input.notificationPermission === "granted";
  const payloadPreview = sanitizePayloadPreview(input.payload);
  const payloadReady =
    payloadPreview.title.length > 0 &&
    payloadPreview.body.length > 0 &&
    payloadPreview.action.length > 0 &&
    payloadPreview.jobId.length > 0;

  const checks: MobilePushDryRunCheck[] = [
    {
      detail: `${targetLabel} is staged for ${platformLabel}; no live mobile app handoff is claimed.`,
      id: "target-platform",
      label: "Target / Platform",
      status: "review",
    },
    {
      detail: consentReady
        ? "Notification consent is recorded as a local fixture for this packet preview."
        : "Notification consent or OS permission is missing; send remains blocked.",
      id: "consent",
      label: "Consent",
      status: consentReady ? "review" : "blocked",
    },
    {
      detail: tokenSafe
        ? `${tokenHint} is displayed as a redacted token hint only.`
        : "Device token is absent or unsafe for a preview hint.",
      id: "token-safety",
      label: "Token Safety",
      status: tokenSafe ? "review" : "blocked",
    },
    {
      detail: payloadReady
        ? `${payloadPreview.title} is previewed locally with action ${payloadPreview.action}.`
        : "Push title, body, action, and job id are required before packet review.",
      id: "payload-preview",
      label: "Payload Preview",
      status: payloadReady ? "review" : "blocked",
    },
    {
      detail:
        "Writes: none. This route does not insert rows, persist tokens, or mutate queue state.",
      id: "write-guard",
      label: "Write Guard",
      status: "review",
    },
    {
      detail:
        "APNs/FCM provider calls are intentionally skipped; this is local packet evidence only.",
      id: "provider-skip",
      label: "Provider Skip",
      status: "review",
    },
  ];
  const blockedCount = checks.filter((check) => check.status === "blocked").length;

  return {
    blockedCount,
    checks,
    consentLabel: consentReady ? "Consent staged" : "Consent missing",
    guardCopy: PUSH_DRY_RUN_GUARD_COPY,
    guards: [...PUSH_DRY_RUN_GUARDS],
    packetId: createMobilePushPacketId(input.platform, targetLabel, payloadPreview.jobId),
    payloadPreview,
    platform: input.platform,
    platformLabel,
    statusLabel: blockedCount > 0 ? "Blocked" : "Dry run",
    summary:
      blockedCount > 0
        ? "Mobile push packet preview is blocked until consent, token safety, and payload fields are reviewable."
        : "Mobile push packet preview is ready for local review only; no provider call or write is executed.",
    targetLabel,
    tokenHint,
    writeMode: "Writes: none",
  };
}

export function createVerifyMobileAppPushDryRunPacket(): MobileAppPushDryRunPacket {
  return buildMobileAppPushDryRunPacket({
    consentGranted: true,
    deviceToken: "apns-live-device-token-9999999999c999",
    notificationPermission: "granted",
    payload: {
      action: "oglauncher://downloads/remote/claim",
      body: "Neon Circuit is queued for desktop claim.",
      buildId: "build_neon_1_0_3",
      jobId: "job_mobile_push_demo",
      title: "Remote install ready",
    },
    platform: "ios",
    targetLabel: "Steam Deck Companion",
  });
}

export function parseMobilePushPlatform(value: string | null | undefined): MobilePushPlatform {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "android" || normalized === "fcm") return "android";
  return "ios";
}

function sanitizePayloadPreview(
  input: MobilePushDryRunPayloadInput,
): MobilePushDryRunPayloadPreview {
  return {
    action: sanitizeAction(input.action),
    body: sanitizeLabel(input.body, ""),
    buildId: sanitizeIdentifier(input.buildId),
    jobId: sanitizeIdentifier(input.jobId),
    title: sanitizeLabel(input.title, ""),
  };
}

function sanitizeAction(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "oglauncher:") return "invalid action";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/[?#].*$/, "");
  }
}

function sanitizeIdentifier(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "_")
    .replace(/^_+|_+$/g, "");
}

function sanitizeLabel(value: string, fallback: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : fallback;
}

function redactDeviceTokenHint(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length < 12) return "token redacted";
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function hasSafeDeviceTokenHint(value: string | null | undefined): boolean {
  return (value?.trim().length ?? 0) >= 12;
}

function createMobilePushPacketId(
  platform: MobilePushPlatform,
  targetLabel: string,
  jobId: string,
): string {
  return [
    "mobile-push-dry-run",
    platform,
    targetLabel
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase(),
    jobId || "no-job",
  ].join("-");
}

function getPlatformLabel(platform: MobilePushPlatform): string {
  if (platform === "android") return "Android / FCM staging";
  return "iOS / APNs staging";
}
