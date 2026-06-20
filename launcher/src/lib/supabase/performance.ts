import type {
  ListPerformanceSessionsOptions,
  ListPerformanceSnapshotsOptions,
  PerformanceHistoryRange,
  PerformanceSession,
  PerformanceSessionInput,
  PerformanceSnapshot,
  PerformanceSnapshotInput,
  RealtimeMetrics,
} from "../types/performance";
import { OVERLAY_RUNTIME_GAME_ID } from "../performance-context";
import { getCurrentSessionUserId, getSupabaseClient, isSupabaseConfigured } from "./client";
import {
  handleError,
  isMissingSchemaError,
  rowNullableString,
  rowNumber,
  rowString,
  type UnknownRecord,
} from "./helpers";

const rangeDays: Record<Exclude<PerformanceHistoryRange, "all">, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "365d": 365,
};

type PerformanceSessionInsert = {
  user_id: string;
  game_id: string;
  sample_count: number;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  avg_cpu_percent: number;
  max_cpu_percent: number;
  avg_ram_mb: number;
  max_ram_mb: number;
  avg_fps: number | null;
  max_fps: number | null;
  avg_gpu_percent: number | null;
  max_gpu_percent: number | null;
};

function toPerformanceSnapshot(row: UnknownRecord): PerformanceSnapshot {
  return {
    id: rowString(row, "id"),
    userId: rowString(row, "user_id"),
    gameId: rowString(row, "game_id"),
    cpuPercent: rowNumber(row, "cpu_percent"),
    ramMb: rowNumber(row, "ram_mb"),
    gpuPercent: rowNullableNumber(row, "gpu_percent"),
    gpuVramMb: null,
    gpuTempC: rowNullableNumber(row, "gpu_temp_c"),
    fps: rowNullableNumber(row, "fps"),
    frameTimeMs: rowNullableNumber(row, "frame_time_ms"),
    diskReadMbps: rowNumber(row, "disk_read_mbps"),
    diskWriteMbps: rowNumber(row, "disk_write_mbps"),
    networkUpKbps: rowNumber(row, "network_up_kbps"),
    networkDownKbps: rowNumber(row, "network_down_kbps"),
    durationSeconds: rowNullableNumber(row, "duration_seconds"),
    createdAt: rowNullableString(row, "created_at") ?? "",
  };
}

function toPerformanceSession(row: UnknownRecord): PerformanceSession {
  return {
    id: rowString(row, "id"),
    userId: rowString(row, "user_id"),
    gameId: rowString(row, "game_id"),
    sampleCount: rowNumber(row, "sample_count"),
    startedAt: rowNullableString(row, "started_at") ?? "",
    endedAt: rowNullableString(row, "ended_at") ?? "",
    durationSeconds: rowNumber(row, "duration_seconds"),
    avgCpuPercent: rowNumber(row, "avg_cpu_percent"),
    maxCpuPercent: rowNumber(row, "max_cpu_percent"),
    avgRamMb: rowNumber(row, "avg_ram_mb"),
    maxRamMb: rowNumber(row, "max_ram_mb"),
    avgFps: rowNullableNumber(row, "avg_fps"),
    maxFps: rowNullableNumber(row, "max_fps"),
    avgGpuPercent: rowNullableNumber(row, "avg_gpu_percent"),
    maxGpuPercent: rowNullableNumber(row, "max_gpu_percent"),
    createdAt: rowNullableString(row, "created_at") ?? "",
  };
}

function rowNullableNumber(row: UnknownRecord, key: string) {
  const value = row[key];
  return typeof value === "number" ? value : null;
}

function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function max(values: number[]) {
  return values.length > 0 ? Math.max(...values) : null;
}

function coerceIsoDate(value: Date | number | string | undefined, fallback: Date) {
  if (value == null) {
    return fallback.toISOString();
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback.toISOString() : date.toISOString();
}

function sinceIsoForRange(range: PerformanceHistoryRange) {
  if (range === "all") {
    return null;
  }

  const date = new Date();
  date.setDate(date.getDate() - rangeDays[range]);
  return date.toISOString();
}

function normalizeSnapshotInput(input: PerformanceSnapshotInput, userId: string) {
  return {
    user_id: userId,
    game_id: input.gameId,
    cpu_percent: input.cpuPercent,
    ram_mb: input.ramMb,
    gpu_percent: input.gpuPercent ?? null,
    gpu_temp_c: input.gpuTempC ?? null,
    fps: input.fps ?? null,
    frame_time_ms: input.frameTimeMs ?? null,
    disk_read_mbps: input.diskReadMbps ?? 0,
    disk_write_mbps: input.diskWriteMbps ?? 0,
    network_up_kbps: input.networkUpKbps ?? 0,
    network_down_kbps: input.networkDownKbps ?? 0,
    duration_seconds: input.durationSeconds ?? null,
    ...(input.createdAt ? { created_at: input.createdAt } : {}),
  };
}

function normalizeSessionInput(
  input: PerformanceSessionInput,
  userId: string,
): PerformanceSessionInsert | null {
  const validSamples = input.samples.filter(
    (sample) => finiteNumber(sample.cpuPercent) != null && finiteNumber(sample.ramMb) != null,
  );

  if (validSamples.length === 0) {
    return null;
  }

  const now = new Date();
  const endedAt = coerceIsoDate(input.endedAt, now);
  const startedAt = coerceIsoDate(input.startedAt, new Date(endedAt));
  const durationSeconds = Math.max(
    0,
    Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000),
  );
  const cpuValues = validSamples
    .map((sample) => finiteNumber(sample.cpuPercent))
    .filter((value): value is number => value != null);
  const ramValues = validSamples
    .map((sample) => finiteNumber(sample.ramMb))
    .filter((value): value is number => value != null);
  const fpsValues = validSamples
    .map((sample) => finiteNumber(sample.fps))
    .filter((value): value is number => value != null);
  const gpuValues = validSamples
    .map((sample) => finiteNumber(sample.gpuPercent))
    .filter((value): value is number => value != null);

  const avgCpuPercent = average(cpuValues);
  const maxCpuPercent = max(cpuValues);
  const avgRamMb = average(ramValues);
  const maxRamMb = max(ramValues);

  if (avgCpuPercent == null || maxCpuPercent == null || avgRamMb == null || maxRamMb == null) {
    return null;
  }

  return {
    user_id: userId,
    game_id: input.gameId ?? OVERLAY_RUNTIME_GAME_ID,
    sample_count: validSamples.length,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: durationSeconds,
    avg_cpu_percent: avgCpuPercent,
    max_cpu_percent: maxCpuPercent,
    avg_ram_mb: avgRamMb,
    max_ram_mb: maxRamMb,
    avg_fps: average(fpsValues),
    max_fps: max(fpsValues),
    avg_gpu_percent: average(gpuValues),
    max_gpu_percent: max(gpuValues),
  };
}

export async function savePerformanceSnapshot(input: PerformanceSnapshotInput): Promise<boolean> {
  if (!isSupabaseConfigured) {
    return false;
  }

  const userId = await getCurrentSessionUserId();
  if (!userId) {
    return false;
  }

  const { error } = await getSupabaseClient()
    .from("performance_snapshots")
    .insert(normalizeSnapshotInput(input, userId));

  if (isMissingSchemaError(error)) {
    return false;
  }
  handleError(error);
  return true;
}

export async function savePerformanceSnapshotFromMetrics(
  metrics: RealtimeMetrics,
  options: { gameId?: string; durationSeconds?: number | null } = {},
): Promise<boolean> {
  return savePerformanceSnapshot({
    gameId: options.gameId ?? OVERLAY_RUNTIME_GAME_ID,
    cpuPercent: metrics.cpuPercent,
    ramMb: metrics.ramMb,
    gpuPercent: metrics.gpuPercent,
    gpuTempC: metrics.gpuTempC,
    fps: metrics.fps,
    frameTimeMs: metrics.frameTimeMs,
    durationSeconds: options.durationSeconds ?? null,
  });
}

export async function savePerformanceSession(input: PerformanceSessionInput): Promise<boolean> {
  if (!isSupabaseConfigured) {
    return false;
  }

  const userId = await getCurrentSessionUserId();
  if (!userId) {
    return false;
  }

  const row = normalizeSessionInput(input, userId);
  if (!row) {
    return false;
  }

  const { error } = await getSupabaseClient().from("performance_sessions").insert(row);

  if (isMissingSchemaError(error)) {
    return false;
  }
  handleError(error);
  return true;
}

export async function listPerformanceSnapshots(
  options: ListPerformanceSnapshotsOptions = {},
): Promise<PerformanceSnapshot[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  const userId = await getCurrentSessionUserId();
  if (!userId) {
    return [];
  }

  const range = options.range ?? "7d";
  const limit = options.limit ?? 240;
  const sinceIso = sinceIsoForRange(range);
  let query = getSupabaseClient().from("performance_snapshots").select("*").eq("user_id", userId);

  if (options.gameId) {
    query = query.eq("game_id", options.gameId);
  }

  if (sinceIso) {
    query = query.gte("created_at", sinceIso);
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);

  if (isMissingSchemaError(error)) {
    return [];
  }
  handleError(error);

  return ((data ?? []) as UnknownRecord[]).map(toPerformanceSnapshot);
}

export async function listPerformanceSessions(
  options: ListPerformanceSessionsOptions = {},
): Promise<PerformanceSession[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  const userId = await getCurrentSessionUserId();
  if (!userId) {
    return [];
  }

  const range = options.range ?? "7d";
  const limit = options.limit ?? 60;
  const sinceIso = sinceIsoForRange(range);
  let query = getSupabaseClient().from("performance_sessions").select("*").eq("user_id", userId);

  if (options.gameId) {
    query = query.eq("game_id", options.gameId);
  }

  if (sinceIso) {
    query = query.gte("ended_at", sinceIso);
  }

  const { data, error } = await query.order("ended_at", { ascending: false }).limit(limit);

  if (isMissingSchemaError(error)) {
    return [];
  }
  handleError(error);

  return ((data ?? []) as UnknownRecord[]).map(toPerformanceSession);
}
