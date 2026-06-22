import type { RealtimeChannel } from "@supabase/supabase-js";

import { getCurrentSessionUserId, getSupabaseClient, supabase } from "./client";
import type { UserPresence } from "../types/profile";
export type { UserPresence };
import type { PlatformType } from "../types/friends";
import {
  isMissingSchemaError,
  rowBoolean,
  rowNullableString,
  rowNumber,
  rowString,
  type SupabaseErrorLike,
  type UnknownRecord,
} from "./helpers";

const PRESENCE_PLATFORM_LABELS: Record<PlatformType, string> = {
  battlenet: "Battle.net",
  ea: "EA App",
  epic: "Epic",
  gog: "GOG",
  og: "OG Launcher",
  steam: "Steam",
  ubisoft: "Ubisoft",
  xbox: "Xbox",
};

const PRESENCE_PLATFORMS = new Set<PlatformType>(
  Object.keys(PRESENCE_PLATFORM_LABELS) as PlatformType[],
);

export type PresenceUpdateInput = {
  customStatus?: string | null;
  currentGameId?: string | null;
  currentGameTitle?: string | null;
  platform?: PlatformType | null;
  platformGameId?: string | null;
  platformLastPolledAt?: string | null;
  platformSource?: string | null;
  status?: UserPresence["status"];
};

export type PresencePollRunEvidence = {
  activityInsertedCount: number;
  completedAt: string | null;
  dryRun: boolean;
  forced: boolean;
  polledCount: number;
  presenceUpdatedCount: number;
  requestedUserCount: number;
  runId: string;
  scannedCount: number;
  skippedCount: number;
  status: "started" | "dry_run" | "completed" | "failed" | string;
  triggerSource: "manual" | "scheduled" | "hosted_deploy_gate" | string;
};

type PresencePollRunsQuery = {
  select: (columns: string) => {
    order: (
      column: string,
      options: { ascending: boolean },
    ) => {
      limit: (count: number) => {
        maybeSingle: () => Promise<{
          data: UnknownRecord | null;
          error: SupabaseErrorLike | null;
        }>;
      };
    };
  };
};

function toPresence(row: UnknownRecord): UserPresence {
  return {
    customStatus: rowNullableString(row, "custom_status"),
    currentGameId: rowNullableString(row, "current_game_id"),
    currentGameTitle: rowNullableString(row, "current_game_title"),
    lastHeartbeatAt: rowNullableString(row, "last_heartbeat_at"),
    platform: normalizePresencePlatform(rowNullableString(row, "platform")),
    platformGameId: rowNullableString(row, "platform_game_id"),
    platformLastPolledAt: rowNullableString(row, "platform_last_polled_at"),
    platformSource: rowNullableString(row, "platform_source"),
    status: rowString(row, "status", "offline") as UserPresence["status"],
    updatedAt: rowString(row, "updated_at"),
    userId: rowString(row, "user_id"),
  };
}

function toPresencePollRunEvidence(row: UnknownRecord): PresencePollRunEvidence {
  return {
    activityInsertedCount: rowNumber(row, "activity_inserted_count"),
    completedAt: rowNullableString(row, "completed_at"),
    dryRun: rowBoolean(row, "dry_run"),
    forced: rowBoolean(row, "forced"),
    polledCount: rowNumber(row, "polled_count"),
    presenceUpdatedCount: rowNumber(row, "presence_updated_count"),
    requestedUserCount: rowNumber(row, "requested_user_count"),
    runId: rowString(row, "run_id"),
    scannedCount: rowNumber(row, "scanned_count"),
    skippedCount: rowNumber(row, "skipped_count"),
    status: rowString(row, "status", "failed"),
    triggerSource: rowString(row, "trigger_source", "manual"),
  };
}

async function getCurrentUserId() {
  const userId = await getCurrentSessionUserId();
  if (!userId) {
    throw new Error("You must be signed in.");
  }

  return userId;
}

export async function setLauncherPresence(input: PresenceUpdateInput = {}) {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const payload: {
    last_heartbeat_at: string;
    status: string;
    user_id: string;
    custom_status?: string | null;
    current_game_id?: string | null;
    current_game_title?: string | null;
    platform?: PlatformType | null;
    platform_game_id?: string | null;
    platform_last_polled_at?: string | null;
    platform_source?: string | null;
  } = {
    last_heartbeat_at: new Date().toISOString(),
    status: input.status ?? "online",
    user_id: userId,
  };

  if ("customStatus" in input) {
    payload.custom_status = input.customStatus;
  }
  if ("currentGameId" in input) {
    payload.current_game_id = input.currentGameId;
  }
  if ("currentGameTitle" in input) {
    payload.current_game_title = input.currentGameTitle;
  }
  if ("platform" in input) {
    payload.platform = input.platform;
  }
  if ("platformGameId" in input) {
    payload.platform_game_id = input.platformGameId;
  }
  if ("platformLastPolledAt" in input) {
    payload.platform_last_polled_at = input.platformLastPolledAt;
  }
  if ("platformSource" in input) {
    payload.platform_source = input.platformSource;
  }

  const { error } = await client.from("user_presence").upsert(payload, { onConflict: "user_id" });
  if (isMissingSchemaError(error) && hasPlatformPayload(payload)) {
    const { error: fallbackError } = await client
      .from("user_presence")
      .upsert(stripPlatformPayload(payload), { onConflict: "user_id" });
    if (isMissingSchemaError(fallbackError)) {
      return null;
    }
    if (fallbackError) {
      throw new Error(fallbackError.message);
    }
    return null;
  }
  if (isMissingSchemaError(error)) {
    return null;
  }
  if (error) {
    throw new Error(error.message);
  }

  return null;
}

export function clearLauncherPresence() {
  return setLauncherPresence({
    customStatus: null,
    currentGameId: null,
    currentGameTitle: null,
    platform: null,
    platformGameId: null,
    platformLastPolledAt: null,
    platformSource: null,
    status: "offline",
  });
}

export async function getVisiblePresence(userIds: string[]) {
  if (userIds.length === 0) {
    return [];
  }

  const uniqueUserIds = Array.from(new Set(userIds));
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("user_presence")
    .select("*")
    .in("user_id", uniqueUserIds);
  if (isMissingSchemaError(error)) {
    return [];
  }
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => toPresence(row as UnknownRecord));
}

export async function getMyPresence() {
  const userId = await getCurrentSessionUserId();
  if (!userId) {
    return null;
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from("user_presence")
    .select(
      `user_id, status, custom_status, current_game_id, current_game_title,
      last_heartbeat_at, platform, platform_game_id, platform_last_polled_at,
      platform_source, updated_at`,
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (isMissingSchemaError(error)) {
    return null;
  }
  if (error) {
    throw new Error(error.message);
  }

  return data ? toPresence(data as UnknownRecord) : null;
}

export async function getLatestPresencePollRunEvidence() {
  const client = getSupabaseClient();
  const fromPresencePollRuns = client.from as unknown as (
    table: "presence_poll_runs",
  ) => PresencePollRunsQuery;
  const { data, error } = await fromPresencePollRuns("presence_poll_runs")
    .select(
      `run_id, trigger_source, dry_run, forced, requested_user_count,
      scanned_count, polled_count, presence_updated_count,
      activity_inserted_count, skipped_count, completed_at, status`,
    )
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (isMissingSchemaError(error)) {
    return null;
  }
  if (error) {
    throw new Error(error.message);
  }

  return data ? toPresencePollRunEvidence(data as UnknownRecord) : null;
}

export function isTrustedPresencePollRunEvidence(
  evidence: PresencePollRunEvidence | null,
  now: Date | number | string = Date.now(),
  freshnessWindowMs = 5 * 60 * 1000,
) {
  if (!evidence?.completedAt) {
    return false;
  }
  const completedAt = Date.parse(evidence.completedAt);
  const nowMs =
    now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(completedAt) || !Number.isFinite(nowMs)) {
    return false;
  }

  return (
    evidence.triggerSource === "scheduled" &&
    evidence.status === "completed" &&
    evidence.dryRun === false &&
    nowMs - completedAt >= 0 &&
    nowMs - completedAt <= freshnessWindowMs
  );
}

export function subscribeToPresenceChanges(
  userIds: string[],
  onChange: (presence: UserPresence) => void,
) {
  if (!supabase || userIds.length === 0) {
    return () => undefined;
  }

  const client = supabase;
  const watchedUsers = new Set(userIds);
  const channel: RealtimeChannel = client
    .channel(`og-presence-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, (payload) => {
      const row = (
        payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old
      ) as UnknownRecord;
      const userId = rowString(row, "user_id");

      if (watchedUsers.has(userId)) {
        onChange(toPresence(row));
      }
    })
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export function normalizePresencePlatform(value: string | null | undefined): PlatformType | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return PRESENCE_PLATFORMS.has(normalized as PlatformType) ? (normalized as PlatformType) : null;
}

export function getPresencePlatformLabel(
  platform: PlatformType | null | undefined,
  source?: string | null,
) {
  if (platform) {
    return PRESENCE_PLATFORM_LABELS[platform];
  }

  return source ? formatPresenceSource(source) : null;
}

export function getPresenceGameLine(
  presence: Pick<UserPresence, "currentGameTitle" | "platform" | "platformSource">,
) {
  if (!presence.currentGameTitle) {
    return null;
  }

  const platformLabel = getPresencePlatformLabel(presence.platform, presence.platformSource);
  return platformLabel
    ? `Playing ${presence.currentGameTitle} on ${platformLabel}`
    : `Playing ${presence.currentGameTitle}`;
}

export function getActivityPlatformLabel(metadata: Record<string, unknown>) {
  const platform = normalizePresencePlatform(readMetadataString(metadata, "platform"));
  const source =
    readMetadataString(metadata, "platformSource") ??
    readMetadataString(metadata, "platform_source");

  return getPresencePlatformLabel(platform, source);
}

function formatPresenceSource(source: string) {
  const normalized = source.trim();
  if (!normalized || normalized.toLowerCase() === "unknown") {
    return null;
  }

  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : ""))
    .join(" ");
}

function readMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasPlatformPayload(payload: Record<string, unknown>) {
  return (
    "platform" in payload ||
    "platform_game_id" in payload ||
    "platform_last_polled_at" in payload ||
    "platform_source" in payload
  );
}

function stripPlatformPayload<T extends Record<string, unknown>>(payload: T) {
  const rest = { ...payload };
  delete rest.platform;
  delete rest.platform_game_id;
  delete rest.platform_last_polled_at;
  delete rest.platform_source;
  return rest;
}
