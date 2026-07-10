import type { PlatformAccount, PlatformType } from "./types/friends";
import type { UserPresence } from "./types/profile";

export type PresencePollingReadinessStatus = "pass" | "warning" | "blocked";
export type PresencePollCacheReason =
  "cached" | "missing-provider" | "provider-error" | "rate-limited";

export interface PresencePollingReadinessCheck {
  detail: string;
  label: string;
  status: PresencePollingReadinessStatus;
}

export interface PresencePollCacheEvidence {
  dryRun: boolean;
  fetchedAt: string | null;
  platform: PlatformType | null;
  reason: PresencePollCacheReason | null;
  retryAfterSeconds: number | null;
  runId: string | null;
  source: string | null;
  status: string | null;
  writeMode: "dry-run" | "writeback" | null;
}

export interface PresencePollDryRunEvidenceRow {
  fetchedAt: string | null;
  platform: PlatformType;
  reason: PresencePollCacheReason | null;
  runId: string;
  source: string;
  status: string | null;
  writeMode: "dry-run";
}

export interface PresenceProviderBridgeContractRow {
  authBoundary: string;
  evidence: string;
  platform: PlatformType;
  requestShape: string;
  responseShape: string;
  status: PresencePollingReadinessStatus;
  tokenHandling: string;
}

export interface PresenceHostedCronStagingEvidence {
  dryRunPayload: string;
  environment: string;
  expectedNoWriteKeys: string[];
  functionName: string;
  reviewedAt: string;
  runbookPath: string;
  schedulerCadence: string;
  schedulerPayload: string;
  secretEnv: string;
  status: PresencePollingReadinessStatus;
  workflow: string;
}

export interface PresencePollingReadiness {
  blockedCount: number;
  bridgeCoverageCount: number;
  checks: PresencePollingReadinessCheck[];
  connectedPlatformCount: number;
  dryRunEvidence: PresencePollDryRunEvidenceRow[];
  dryRunEvidenceCount: number;
  freshCacheCount: number;
  hasRecentWriteback: boolean;
  hostedCronStaging: PresenceHostedCronStagingEvidence | null;
  passedCount: number;
  progress: number;
  providerBridgeContractCount: number;
  providerBridgeContracts: PresenceProviderBridgeContractRow[];
  providerBridgeReadyCount: number;
  statusLabel: "Ready" | "Needs hosted cron" | "Needs provider bridge" | "Blocked";
  summary: string;
  warningCount: number;
}

export type PresenceReadinessPlatformAccount = Pick<PlatformAccount, "metadata" | "platform">;
export type PresenceReadinessUserPresence = Pick<UserPresence, "platformLastPolledAt">;

const PROVIDER_BRIDGE_PLATFORMS: PlatformType[] = [
  "epic",
  "gog",
  "ea",
  "xbox",
  "battlenet",
  "ubisoft",
];
const ALL_PRESENCE_PLATFORMS: PlatformType[] = ["steam", ...PROVIDER_BRIDGE_PLATFORMS, "og"];
const DEFAULT_FRESHNESS_WINDOW_MS = 5 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 60 * 1000;
const POLL_CACHE_KEY = "presencePollCache";
const PROVIDER_BRIDGE_CONTRACT_KEY = "presenceProviderBridgeContract";
const POLL_CACHE_REASONS = new Set<string>([
  "cached",
  "missing-provider",
  "provider-error",
  "rate-limited",
]);

function normalizePlatform(value: unknown): PlatformType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return ALL_PRESENCE_PLATFORMS.includes(normalized as PlatformType)
    ? (normalized as PlatformType)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readReason(value: unknown): PresencePollCacheReason | null {
  const reason = readString(value);
  return reason && POLL_CACHE_REASONS.has(reason) ? (reason as PresencePollCacheReason) : null;
}

function readPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

function readReadinessStatus(value: unknown): PresencePollingReadinessStatus {
  return value === "pass" || value === "blocked" ? value : "warning";
}

function timestampAgeMs(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  if (timestamp - nowMs > MAX_FUTURE_SKEW_MS) return null;
  return Math.max(0, nowMs - timestamp);
}

function isRecentTimestamp(value: string | null, nowMs: number, freshnessWindowMs: number) {
  const ageMs = timestampAgeMs(value, nowMs);
  return ageMs !== null && ageMs <= freshnessWindowMs;
}

function getNowMs(now: Date | number | string | undefined) {
  if (now instanceof Date) return now.getTime();
  if (typeof now === "number") return now;
  if (typeof now === "string") {
    const parsed = Date.parse(now);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }
  return Date.now();
}

export function readPresencePollCache(
  metadata: Record<string, unknown> | null | undefined,
): PresencePollCacheEvidence | null {
  const value = metadata?.[POLL_CACHE_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    dryRun: readBoolean(record.dryRun),
    fetchedAt: readString(record.fetchedAt),
    platform: normalizePlatform(record.platform),
    reason: readReason(record.reason),
    retryAfterSeconds: readPositiveNumber(record.retryAfterSeconds),
    runId: readString(record.runId),
    source: readString(record.source),
    status: readString(record.status),
    writeMode: readString(record.writeMode) === "dry-run" ? "dry-run" : null,
  };
}

export function readPresenceProviderBridgeContract(
  metadata: Record<string, unknown> | null | undefined,
  platform: PlatformType,
): PresenceProviderBridgeContractRow | null {
  if (!PROVIDER_BRIDGE_PLATFORMS.includes(platform)) return null;

  const value = metadata?.[PROVIDER_BRIDGE_CONTRACT_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    authBoundary: readString(record.authBoundary) ?? "Hosted bridge secret boundary not staged",
    evidence: readString(record.evidence) ?? "Local contract fixture only",
    platform,
    requestShape: readString(record.requestShape) ?? "Provider request shape not staged",
    responseShape: readString(record.responseShape) ?? "Provider response shape not staged",
    status: readReadinessStatus(record.status),
    tokenHandling: readString(record.tokenHandling) ?? "No provider token handling evidence",
  };
}

export function getPresencePollingReadiness(input: {
  connectedPlatforms?: Partial<Record<PlatformType, boolean>>;
  evidenceError?: string | null;
  freshnessWindowMs?: number;
  hostedCronStaging?: PresenceHostedCronStagingEvidence | null;
  now?: Date | number | string;
  ownPresence?: PresenceReadinessUserPresence | null;
  platformAccounts?: PresenceReadinessPlatformAccount[];
  supabaseConfigured: boolean;
  trustedEvidence?: boolean;
}): PresencePollingReadiness {
  const connectedPlatforms = input.connectedPlatforms ?? {};
  const platformAccounts = input.platformAccounts ?? [];
  const connectedPlatformSet = new Set<PlatformType>();
  for (const platform of ALL_PRESENCE_PLATFORMS) {
    if (connectedPlatforms[platform]) connectedPlatformSet.add(platform);
  }
  for (const account of platformAccounts) {
    connectedPlatformSet.add(account.platform);
  }

  const connectedPlatformCount = connectedPlatformSet.size;
  const nowMs = getNowMs(input.now);
  const freshnessWindowMs = Math.max(1, input.freshnessWindowMs ?? DEFAULT_FRESHNESS_WINDOW_MS);
  const cachesByPlatform = new Map<PlatformType, PresencePollCacheEvidence>();
  for (const account of platformAccounts) {
    const cache = readPresencePollCache(account.metadata);
    if (cache) {
      cachesByPlatform.set(cache.platform ?? account.platform, cache);
    }
  }
  const providerBridgeContracts = platformAccounts
    .map((account) => readPresenceProviderBridgeContract(account.metadata, account.platform))
    .filter((row): row is PresenceProviderBridgeContractRow => row !== null)
    .sort(
      (a, b) =>
        PROVIDER_BRIDGE_PLATFORMS.indexOf(a.platform) -
        PROVIDER_BRIDGE_PLATFORMS.indexOf(b.platform),
    );
  const freshCaches = Array.from(cachesByPlatform.values()).filter((cache) =>
    isRecentTimestamp(cache.fetchedAt, nowMs, freshnessWindowMs),
  );
  const dryRunEvidence = Array.from(cachesByPlatform.entries())
    .filter(
      ([, cache]) =>
        cache.dryRun === true &&
        cache.writeMode === "dry-run" &&
        cache.runId &&
        isRecentTimestamp(cache.fetchedAt, nowMs, freshnessWindowMs),
    )
    .map(([platform, cache]): PresencePollDryRunEvidenceRow => ({
      fetchedAt: cache.fetchedAt,
      platform,
      reason: cache.reason,
      runId: cache.runId ?? "unknown-dry-run",
      source: cache.source ?? "trusted-dry-run",
      status: cache.status,
      writeMode: "dry-run",
    }));
  const hasTrustedEvidence = Boolean(input.trustedEvidence);
  const freshSuccessfulPlatforms = new Set(
    Array.from(cachesByPlatform.entries())
      .filter(
        ([, cache]) =>
          !cache.reason && isRecentTimestamp(cache.fetchedAt, nowMs, freshnessWindowMs),
      )
      .map(([platform]) => platform),
  );
  const hasRecentWriteback = isRecentTimestamp(
    input.ownPresence?.platformLastPolledAt ?? null,
    nowMs,
    freshnessWindowMs,
  );
  const hostedCronStaging = input.hostedCronStaging ?? null;
  const connectedProviderBridgeCount = PROVIDER_BRIDGE_PLATFORMS.filter((platform) =>
    connectedPlatformSet.has(platform),
  ).length;
  const providerBridgeReadyCount = providerBridgeContracts.filter(
    (contract) => contract.status === "pass",
  ).length;
  const coveredProviderBridgeCount = PROVIDER_BRIDGE_PLATFORMS.filter((platform) =>
    freshSuccessfulPlatforms.has(platform),
  ).length;
  const steamCache = cachesByPlatform.get("steam") ?? null;
  const steamIsCovered = freshSuccessfulPlatforms.has("steam");
  const connectedProvidersWithoutFreshSuccess = PROVIDER_BRIDGE_PLATFORMS.filter(
    (platform) => connectedPlatformSet.has(platform) && !freshSuccessfulPlatforms.has(platform),
  );
  const checks: PresencePollingReadinessCheck[] = [
    {
      detail: input.supabaseConfigured
        ? "Supabase client config is present for realtime reads."
        : "Local preview is missing Supabase client env; hosted staging still needs a real project.",
      label: "Supabase client",
      status: input.supabaseConfigured ? "pass" : "warning",
    },
    {
      detail: "user_presence table, realtime publication, and launcher read/write helpers exist.",
      label: "Realtime contract",
      status: "pass",
    },
    {
      detail:
        "poll-platform-presence Edge Function batches platform accounts and supports dry-run.",
      label: "Polling function",
      status: "pass",
    },
    {
      detail: "Function enforces PRESENCE_POLL_SECRET for trusted cron/manual calls.",
      label: "Secret gate",
      status: "pass",
    },
    {
      detail: hostedCronStaging
        ? `${hostedCronStaging.workflow} targets ${hostedCronStaging.environment} for ${hostedCronStaging.functionName}; dry-run smoke expects ${hostedCronStaging.expectedNoWriteKeys.join(", ")} before ${hostedCronStaging.schedulerCadence} scheduler handoff.`
        : "Manual hosted deploy gate and user-data-safe poll-platform-presence smoke must be reviewed before scheduler handoff.",
      label: "Hosted deploy gate",
      status: hostedCronStaging?.status === "pass" ? "pass" : "warning",
    },
    {
      detail:
        dryRunEvidence.length > 0
          ? `${dryRunEvidence.length} trusted dry-run review packet(s) are fresh (${dryRunEvidence.map((row) => row.runId).join(", ")}); no user_presence writeback or activity insert is claimed.`
          : "No trusted dry-run review packet is visible yet; run the secret-gated poll-platform-presence dry-run before promoting hosted cron.",
      label: "Trusted dry-run review",
      status: dryRunEvidence.length > 0 ? "pass" : "warning",
    },
    {
      detail: input.evidenceError
        ? `Presence evidence read failed: ${input.evidenceError}.`
        : freshCaches.length > 0 && hasTrustedEvidence
          ? `${freshCaches.length} recent trusted poll evidence record(s) prove a scheduler or trusted manual poll ran.`
          : freshCaches.length > 0
            ? `${freshCaches.length} recent client-readable presencePollCache record(s) are visible; hosted cron still needs trusted scheduler evidence.`
            : "Supabase Scheduled Function or external cron must run every minute in hosted staging.",
      label: "Hosted cron",
      status:
        freshCaches.length > 0 && hasTrustedEvidence && !input.evidenceError ? "pass" : "warning",
    },
    {
      detail:
        hasRecentWriteback && hasTrustedEvidence
          ? `Trusted user_presence.platform_last_polled_at writeback is fresh (${input.ownPresence?.platformLastPolledAt}).`
          : hasRecentWriteback
            ? `Own user_presence.platform_last_polled_at is fresh (${input.ownPresence?.platformLastPolledAt}), but client-writable evidence is not a hosted scheduler proof.`
            : "No fresh own user_presence.platform_last_polled_at writeback is visible yet.",
      label: "Presence writeback",
      status: hasRecentWriteback && hasTrustedEvidence ? "pass" : "warning",
    },
    {
      detail: !connectedPlatformSet.has("steam")
        ? "Steam direct polling is implemented, but no linked Steam account is visible in this local state."
        : steamIsCovered && hasTrustedEvidence
          ? "Linked Steam account has fresh trusted successful presencePollCache evidence."
          : steamIsCovered
            ? "Linked Steam account has fresh successful client-readable cache evidence; trusted scheduler proof is still required."
            : describeMissingBridgeEvidence("Steam", steamCache, nowMs, freshnessWindowMs),
      label: "Steam bridge",
      status: steamIsCovered && hasTrustedEvidence ? "pass" : "warning",
    },
    {
      detail:
        providerBridgeContracts.length > 0 &&
        providerBridgeContracts.length < PROVIDER_BRIDGE_PLATFORMS.length
          ? `${providerBridgeContracts.length}/${PROVIDER_BRIDGE_PLATFORMS.length} provider bridge contract row(s) are staged; remaining provider fixtures need review before hosted bridge rollout.`
          : providerBridgeContracts.length === PROVIDER_BRIDGE_PLATFORMS.length
            ? `${providerBridgeContracts.length}/${PROVIDER_BRIDGE_PLATFORMS.length} provider bridge contract row(s) are staged locally with request/response and token-redaction boundaries.`
            : connectedProviderBridgeCount > 0 &&
                connectedProvidersWithoutFreshSuccess.length === 0 &&
                hasTrustedEvidence
              ? `${connectedProviderBridgeCount} connected non-Steam platform bridge(s) have fresh trusted successful poll evidence.`
              : connectedProviderBridgeCount > 0 &&
                  connectedProvidersWithoutFreshSuccess.length === 0
                ? `${connectedProviderBridgeCount} connected non-Steam bridge(s) have client-readable poll cache evidence; trusted provider bridge staging remains open.`
                : connectedProviderBridgeCount > 0
                  ? `${coveredProviderBridgeCount}/${connectedProviderBridgeCount} connected non-Steam bridge(s) have fresh successful poll evidence. Missing: ${connectedProvidersWithoutFreshSuccess.join(", ")}.`
                  : "Epic/GOG/EA/Xbox/Battle.net/Ubisoft bridges remain provider-specific staging tracks.",
      label: "Provider bridges",
      status:
        connectedProviderBridgeCount > 0 &&
        connectedProvidersWithoutFreshSuccess.length === 0 &&
        hasTrustedEvidence
          ? "pass"
          : "warning",
    },
  ];
  const passedCount = checks.filter((check) => check.status === "pass").length;
  const warningCount = checks.filter((check) => check.status === "warning").length;
  const blockedCount = checks.filter((check) => check.status === "blocked").length;
  const progress = Math.round((passedCount / checks.length) * 100);
  const statusLabel =
    blockedCount > 0
      ? "Blocked"
      : warningCount > 0
        ? hasTrustedEvidence
          ? "Needs provider bridge"
          : "Needs hosted cron"
        : "Ready";

  return {
    blockedCount,
    bridgeCoverageCount: freshSuccessfulPlatforms.size,
    checks,
    connectedPlatformCount,
    dryRunEvidence,
    dryRunEvidenceCount: dryRunEvidence.length,
    freshCacheCount: freshCaches.length,
    hasRecentWriteback,
    hostedCronStaging,
    passedCount,
    progress,
    providerBridgeContractCount: providerBridgeContracts.length,
    providerBridgeContracts,
    providerBridgeReadyCount,
    statusLabel,
    summary:
      statusLabel === "Ready"
        ? "Presence polling has hosted evidence."
        : hasTrustedEvidence
          ? "Presence polling has trusted scheduler evidence; provider bridges or review gates remain open."
          : hostedCronStaging
            ? "Presence polling has local hosted deploy-gate staging and provider bridge fixtures; live hosted cron and real provider services remain open."
            : "Presence polling is locally wired; hosted cron and provider bridge evidence remain open.",
    warningCount,
  };
}

function describeMissingBridgeEvidence(
  label: string,
  cache: PresencePollCacheEvidence | null,
  nowMs: number,
  freshnessWindowMs: number,
) {
  if (!cache) {
    return `${label} account is linked, but no presencePollCache evidence is visible yet.`;
  }
  if (!isRecentTimestamp(cache.fetchedAt, nowMs, freshnessWindowMs)) {
    return `${label} presencePollCache is missing or stale; wait for hosted cron or run a trusted dry-run.`;
  }
  if (cache.reason) {
    return `${label} poll cache is fresh but not successful (${cache.reason}).`;
  }
  return `${label} poll cache is fresh but missing a successful provider result.`;
}
