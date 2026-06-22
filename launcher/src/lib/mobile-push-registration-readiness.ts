export type MobilePushRegistrationPlatform = "android" | "ios";
export type MobilePushRegistrationStatus = "blocked" | "ready" | "review";

export interface MobilePushRegistrationContractInput {
  consentGranted: boolean;
  platform: MobilePushRegistrationPlatform;
  registrationId?: string | null;
  targetLabel: string;
  tokenHash?: string | null;
  tokenHint?: string | null;
  unregisterReady: boolean;
}

export interface MobilePushRegistrationCheck {
  detail: string;
  id: string;
  label: string;
  status: MobilePushRegistrationStatus;
}

export interface MobilePushRegistrationContract {
  blockedCount: number;
  checks: MobilePushRegistrationCheck[];
  consentLabel: string;
  guardCopy: string;
  guards: string[];
  platform: MobilePushRegistrationPlatform;
  platformLabel: string;
  registrationIdLabel: string;
  statusLabel: "Blocked" | "Contract staged";
  summary: string;
  targetLabel: string;
  tokenHashLabel: string;
  tokenHintLabel: string;
  writeMode: "Verify route: no write; hosted Edge Function writes only";
}

const TOKEN_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const TOKEN_HINT_PATTERN = /^(apns|fcm)-?\.\.\.[a-z0-9_-]{4,12}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MOBILE_PUSH_REGISTRATION_GUARDS = [
  "No raw device token",
  "No APNs/FCM send",
  "No push notification send",
  "No verify-route Supabase write",
  "Hosted Edge Function uses service role",
  "Owner-scoped token hash",
  "Unregister path staged",
];

const MOBILE_PUSH_REGISTRATION_GUARD_COPY =
  "Mobile push registration is staged through a caller-authenticated Edge Function that writes only consented owner-scoped token hashes with the service role. This panel never stores raw device tokens, sends APNs/FCM notifications, writes Supabase rows from the verify route, or claims mobile background delivery.";

export function buildMobilePushRegistrationContract(
  input: MobilePushRegistrationContractInput,
): MobilePushRegistrationContract {
  const targetLabel = sanitizeLabel(input.targetLabel, "Mobile Companion");
  const tokenHash = normalizeTokenHash(input.tokenHash);
  const tokenHint = buildTokenHintLabel(input.tokenHint, tokenHash);
  const hasRegistrationId = isUuid(input.registrationId);
  const consentReady = input.consentGranted;
  const tokenHashReady = tokenHash !== null;
  const unregisterReady = input.unregisterReady && hasRegistrationId;
  const checks: MobilePushRegistrationCheck[] = [
    {
      detail: consentReady
        ? "Notification consent is attached to the local registration contract."
        : "Notification consent must be explicit before a registration write contract is valid.",
      id: "consent",
      label: "Consent",
      status: consentReady ? "ready" : "blocked",
    },
    {
      detail: tokenHash
        ? `${formatTokenHashLabel(tokenHash)} is staged; raw tokens are rejected before storage.`
        : "A sha256 token hash is required; raw device tokens are not accepted.",
      id: "token-hash",
      label: "Token Hash",
      status: tokenHashReady ? "ready" : "blocked",
    },
    {
      detail: `${targetLabel} registration rows are scoped to the authenticated owner id by contract.`,
      id: "owner-scope",
      label: "Owner Scope",
      status: "ready",
    },
    {
      detail:
        "mobile-push-registration is deployable as a verify_jwt Edge Function; service-role writes stay inside the function runtime.",
      id: "hosted-edge-function",
      label: "Hosted Edge Function",
      status: "ready",
    },
    {
      detail: unregisterReady
        ? "The same contract includes an owner-scoped unregister/delete path."
        : "A reviewed registration id is required before unregister evidence is complete.",
      id: "unregister",
      label: "Unregister",
      status: unregisterReady ? "ready" : "blocked",
    },
    {
      detail: "Provider send remains blocked; this contract only stages registration metadata.",
      id: "provider-send-block",
      label: "Provider Send Block",
      status: "review",
    },
  ];
  const blockedCount = checks.filter((check) => check.status === "blocked").length;

  return {
    blockedCount,
    checks,
    consentLabel: consentReady ? "Consent staged" : "Consent missing",
    guardCopy: MOBILE_PUSH_REGISTRATION_GUARD_COPY,
    guards: [...MOBILE_PUSH_REGISTRATION_GUARDS],
    platform: input.platform,
    platformLabel: getPlatformLabel(input.platform),
    registrationIdLabel: hasRegistrationId ? input.registrationId!.trim().toLowerCase() : "missing",
    statusLabel: blockedCount > 0 ? "Blocked" : "Contract staged",
    summary:
      blockedCount > 0
        ? "Mobile push registration contract is blocked until consent, token hash, and unregister evidence are reviewable."
        : "Mobile push registration contract is staged with a caller-authenticated Edge Function; push send and verify-route writes remain disabled.",
    targetLabel,
    tokenHashLabel: tokenHash ? formatTokenHashLabel(tokenHash) : "missing valid token hash",
    tokenHintLabel: tokenHint,
    writeMode: "Verify route: no write; hosted Edge Function writes only",
  };
}

export function createVerifyMobilePushRegistrationContract(): MobilePushRegistrationContract {
  return buildMobilePushRegistrationContract({
    consentGranted: true,
    platform: "ios",
    registrationId: "22222222-2222-4222-8222-222222222222",
    targetLabel: "Steam Deck Companion",
    tokenHash: "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    tokenHint: "apns...c999",
    unregisterReady: true,
  });
}

function normalizeTokenHash(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return TOKEN_HASH_PATTERN.test(normalized) ? normalized : null;
}

function formatTokenHashLabel(tokenHash: string) {
  const digest = tokenHash.slice("sha256:".length);
  return `sha256:${digest.slice(0, 8)}...${digest.slice(-8)}`;
}

function buildTokenHintLabel(value: string | null | undefined, tokenHash: string | null) {
  const trimmed = value?.trim() ?? "";
  if (TOKEN_HINT_PATTERN.test(trimmed)) return trimmed.toLowerCase();
  if (tokenHash) return "token hint redacted";
  return "missing token hint";
}

function isUuid(value: string | null | undefined) {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

function sanitizeLabel(value: string, fallback: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : fallback;
}

function getPlatformLabel(platform: MobilePushRegistrationPlatform): string {
  if (platform === "android") return "Android / FCM token hash";
  return "iOS / APNs token hash";
}
