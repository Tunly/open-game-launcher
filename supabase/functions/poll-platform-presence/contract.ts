export type PresencePollPlatform =
  | "steam"
  | "epic"
  | "gog"
  | "ea"
  | "xbox"
  | "battlenet"
  | "ubisoft"
  | "og";

export type PresencePollTriggerSource =
  | "manual"
  | "scheduled"
  | "hosted_deploy_gate";

export type PresencePollStatus = "offline" | "online" | "away" | "busy";

export type PresencePollSkipReason =
  | "cached"
  | "missing-provider"
  | "provider-error"
  | "rate-limited";

export type PresencePollRunStatus =
  | "started"
  | "dry_run"
  | "completed"
  | "failed";

export type PresencePollRequestContract = {
  dryRun: boolean;
  force: boolean;
  limit: number;
  platforms: PresencePollPlatform[];
  triggerSource: PresencePollTriggerSource;
  userIds: string[];
};

export type PresencePollRunSkip = {
  platform: PresencePollPlatform;
  reason: PresencePollSkipReason;
  retryAfterSeconds?: number;
};

export type PresencePollRunProviderResult = {
  platform: PresencePollPlatform;
  status: PresencePollStatus;
};

export type PresencePollRunEvidenceInput = {
  activityInsertedCount: number;
  completedAt: string;
  dryRun: boolean;
  forced: boolean;
  platforms: PresencePollPlatform[];
  polledCount: number;
  presenceUpdatedCount: number;
  providerResults: PresencePollRunProviderResult[];
  requestedUserCount: number;
  runId: string;
  scannedCount: number;
  skipped: PresencePollRunSkip[];
  startedAt: string;
  status?: PresencePollRunStatus;
  triggerSource: PresencePollTriggerSource;
};

export type PresencePollRunEvidenceRecord = {
  activity_inserted_count: number;
  completed_at: string;
  dry_run: boolean;
  forced: boolean;
  platforms: PresencePollPlatform[];
  polled_count: number;
  presence_updated_count: number;
  provider_result_summary: Record<string, unknown>;
  requested_user_count: number;
  run_id: string;
  scanned_count: number;
  skipped_count: number;
  skipped_summary: Record<string, unknown>;
  started_at: string;
  status: PresencePollRunStatus;
  trigger_source: PresencePollTriggerSource;
};

const platformIds: PresencePollPlatform[] = [
  "steam",
  "epic",
  "gog",
  "ea",
  "xbox",
  "battlenet",
  "ubisoft",
  "og",
];

const triggerSources: PresencePollTriggerSource[] = [
  "manual",
  "scheduled",
  "hosted_deploy_gate",
];

const presenceStatuses: PresencePollStatus[] = [
  "offline",
  "online",
  "away",
  "busy",
];

const skipReasons: PresencePollSkipReason[] = [
  "cached",
  "missing-provider",
  "provider-error",
  "rate-limited",
];

export function readBodyBoolean(body: unknown, key: string) {
  if (!body || typeof body !== "object") {
    return false;
  }

  const value = (body as Record<string, unknown>)[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

export function parsePollRequestBody(
  body: unknown,
  maxBatchSize: number,
): PresencePollRequestContract {
  const requestedLimit = readBodyNumber(body, "limit", maxBatchSize);
  const userIds = readBodyStringArray(body, "userIds");
  const platforms = readBodyStringArray(body, "platforms")
    .map((platform) => normalizePlatform(platform))
    .filter((platform): platform is PresencePollPlatform => Boolean(platform));

  return {
    dryRun: readBodyBoolean(body, "dryRun") || readBodyBoolean(body, "dry_run"),
    force: readBodyBoolean(body, "force"),
    limit: Math.max(1, Math.min(requestedLimit, maxBatchSize)),
    platforms,
    triggerSource: normalizeTriggerSource(
      readBodyString(body, "triggerSource") ??
        readBodyString(body, "trigger_source"),
    ) ?? "manual",
    userIds,
  };
}

export function buildPresencePollRunEvidence(
  input: PresencePollRunEvidenceInput,
): PresencePollRunEvidenceRecord {
  const runId = input.runId.trim();
  if (!runId) {
    throw new Error("Presence poll evidence requires a runId.");
  }
  const status = input.status ?? (input.dryRun ? "dry_run" : "completed");

  const skipped = input.skipped.map((item) => ({
    platform: normalizePlatform(item.platform) ?? "og",
    reason: normalizeSkipReason(item.reason) ?? "provider-error",
    retryAfterSeconds: nonNegativeInteger(item.retryAfterSeconds),
  }));
  const providerResults = input.providerResults.map((item) => ({
    platform: normalizePlatform(item.platform) ?? "og",
    status: normalizePresenceStatus(item.status) ?? "offline",
  }));
  const activityInsertedCount = nonNegativeInteger(input.activityInsertedCount);
  const polledCount = nonNegativeInteger(input.polledCount);
  const presenceUpdatedCount = nonNegativeInteger(input.presenceUpdatedCount);
  const requestedUserCount = nonNegativeInteger(input.requestedUserCount);
  const scannedCount = nonNegativeInteger(input.scannedCount);
  const skippedCount = skipped.length;

  if (status !== "failed") {
    validateCompletedEvidenceCounts({
      activityInsertedCount,
      polledCount,
      presenceUpdatedCount,
      providerResultCount: providerResults.length,
      scannedCount,
      skippedCount,
    });
  }

  return {
    activity_inserted_count: activityInsertedCount,
    completed_at: input.completedAt,
    dry_run: input.dryRun,
    forced: input.forced,
    platforms: uniquePlatforms(input.platforms),
    polled_count: polledCount,
    presence_updated_count: presenceUpdatedCount,
    provider_result_summary: {
      byPlatform: countBy(providerResults, (item) => item.platform),
      byStatus: countBy(providerResults, (item) => item.status),
      total: providerResults.length,
    },
    requested_user_count: requestedUserCount,
    run_id: runId,
    scanned_count: scannedCount,
    skipped_count: skippedCount,
    skipped_summary: {
      byPlatform: countBy(skipped, (item) => item.platform),
      byReason: countBy(skipped, (item) => item.reason),
      maxRetryAfterSeconds: maxRetryAfterSeconds(skipped),
      rateLimited: skipped.filter((item) => item.reason === "rate-limited")
        .length,
      total: skipped.length,
    },
    started_at: input.startedAt,
    status,
    trigger_source: input.triggerSource,
  };
}

function validateCompletedEvidenceCounts(
  counts: {
    activityInsertedCount: number;
    polledCount: number;
    presenceUpdatedCount: number;
    providerResultCount: number;
    scannedCount: number;
    skippedCount: number;
  },
) {
  if (counts.polledCount + counts.skippedCount !== counts.scannedCount) {
    throw new Error("Invalid presence poll evidence totals.");
  }
  if (counts.providerResultCount !== counts.polledCount) {
    throw new Error("Invalid presence poll provider totals.");
  }
  if (counts.presenceUpdatedCount > counts.polledCount) {
    throw new Error("Invalid presence poll update totals.");
  }
  if (counts.activityInsertedCount > counts.presenceUpdatedCount) {
    throw new Error("Invalid presence poll activity totals.");
  }
}

function readBodyStringArray(body: unknown, key: string) {
  if (!body || typeof body !== "object") {
    return [];
  }

  const value = (body as Record<string, unknown>)[key];
  return Array.isArray(value)
    ? value.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    )
    : [];
}

function readBodyString(body: unknown, key: string) {
  if (!body || typeof body !== "object") {
    return null;
  }

  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readBodyNumber(body: unknown, key: string, fallback: number) {
  if (!body || typeof body !== "object") {
    return fallback;
  }

  const value = (body as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizePlatform(value: string | null): PresencePollPlatform | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return platformIds.includes(normalized as PresencePollPlatform)
    ? (normalized as PresencePollPlatform)
    : null;
}

function normalizeTriggerSource(
  value: string | null,
): PresencePollTriggerSource | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase().replaceAll("-", "_");
  return triggerSources.includes(normalized as PresencePollTriggerSource)
    ? (normalized as PresencePollTriggerSource)
    : null;
}

function normalizePresenceStatus(
  value: string | null,
): PresencePollStatus | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return presenceStatuses.includes(normalized as PresencePollStatus)
    ? (normalized as PresencePollStatus)
    : null;
}

function normalizeSkipReason(
  value: string | null,
): PresencePollSkipReason | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return skipReasons.includes(normalized as PresencePollSkipReason)
    ? (normalized as PresencePollSkipReason)
    : null;
}

function uniquePlatforms(platforms: PresencePollPlatform[]) {
  const seen = new Set<PresencePollPlatform>();
  for (const platform of platforms) {
    const normalized = normalizePlatform(platform);
    if (normalized) {
      seen.add(normalized);
    }
  }
  return [...seen];
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function maxRetryAfterSeconds(skipped: Array<{ retryAfterSeconds?: number }>) {
  const values = skipped
    .map((item) => item.retryAfterSeconds)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  return values.length > 0 ? Math.max(...values) : null;
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}
