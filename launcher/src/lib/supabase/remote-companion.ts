import { getSupabaseClient } from "./client";
import { isMissingSchemaError } from "./helpers";

export interface RemoteCompanionPairingResult {
  deviceId: string;
  deviceSecret: string;
  deviceSecretHint: string;
  expiresAt: string;
  pairingCode: string;
  pairingCodeHint: string;
}

export interface RemoteCompanionDeviceResult {
  deviceId: string;
  deviceKind: string;
  deviceLabel: string;
  expiresAt: string;
  pairedAt: string;
}

export interface RemoteCompanionPingResult {
  deviceId: string;
  lastSeenAt: string;
  status: string;
}

export interface RemoteInstallJobResult {
  expiresAt: string;
  jobId: string;
  status: string;
}

export interface RemoteInstallJobStatusResult {
  jobId: string;
  status: string;
  updatedAt: string;
}

export interface RemoteInstallClaimedJob {
  buildId: string | null;
  createdAt: string;
  expiresAt: string;
  gameId: string;
  jobId: string;
  packageRef: Record<string, unknown>;
  platform: string | null;
  productId: string | null;
  source: string;
  status: string;
  title: string;
}

export interface EnqueueRemoteInstallInput {
  companionDeviceId: string;
  gameId: string;
  title: string;
  buildId?: string | null;
  packageRef?: Record<string, unknown>;
  platform?: string | null;
  productId?: string | null;
  source?: "desktop-deep-link" | "mobile-companion" | "web-dashboard";
}

type RelayEnvelope<T> = {
  action?: string;
  data?: T[] | T | null;
  error?: string;
  rpc?: string;
};

export async function createRemoteCompanionCloudPairing(input: {
  deviceKind?: "desktop" | "mobile" | "web";
  deviceLabel?: string;
  ttlSeconds?: number;
}) {
  const row = await invokeRemoteCompanionRelay<RemoteCompanionPairingRow>({
    action: "create_pairing",
    deviceKind: input.deviceKind,
    deviceLabel: input.deviceLabel,
    ttlSeconds: input.ttlSeconds,
  });
  return row ? mapPairingRow(row) : null;
}

export async function redeemRemoteCompanionCloudPairing(input: {
  pairingCode: string;
  deviceKind?: "desktop" | "mobile" | "web";
  deviceLabel?: string;
}) {
  const row = await invokeRemoteCompanionRelay<RemoteCompanionDeviceRow>({
    action: "redeem_pairing",
    deviceKind: input.deviceKind,
    deviceLabel: input.deviceLabel,
    pairingCode: input.pairingCode.trim(),
  });
  return row ? mapDeviceRow(row) : null;
}

export async function recordRemoteCompanionCloudPing(input: {
  deviceId: string;
  deviceSecret: string;
}) {
  const row = await invokeRemoteCompanionRelay<RemoteCompanionPingRow>({
    action: "ping",
    deviceId: input.deviceId,
    deviceSecret: input.deviceSecret,
  });
  return row ? mapPingRow(row) : null;
}

export async function enqueueRemoteCompanionInstallJob(input: EnqueueRemoteInstallInput) {
  const row = await invokeRemoteCompanionRelay<RemoteInstallJobRow>({
    action: "enqueue_install",
    buildId: input.buildId,
    companionDeviceId: input.companionDeviceId,
    gameId: input.gameId,
    packageRef: input.packageRef ?? {},
    platform: input.platform,
    productId: input.productId,
    source: input.source ?? "mobile-companion",
    title: input.title,
  });
  return row ? mapInstallJobRow(row) : null;
}

export async function claimRemoteCompanionInstallJobs(input: {
  deviceId: string;
  deviceSecret: string;
  limit?: number;
}) {
  const rows = await invokeRemoteCompanionRelayRows<RemoteInstallClaimedJobRow>({
    action: "claim_jobs",
    deviceId: input.deviceId,
    deviceSecret: input.deviceSecret,
    limit: input.limit,
  });
  return rows.map(mapClaimedJobRow);
}

export async function updateRemoteCompanionInstallJobStatus(input: {
  deviceId: string;
  deviceSecret: string;
  jobId: string;
  status: "cancelled" | "completed" | "failed" | "started";
  localQueueId?: string | null;
  message?: string | null;
}) {
  const row = await invokeRemoteCompanionRelay<RemoteInstallJobStatusRow>({
    action: "update_job_status",
    deviceId: input.deviceId,
    deviceSecret: input.deviceSecret,
    jobId: input.jobId,
    localQueueId: input.localQueueId,
    message: input.message,
    status: input.status,
  });
  return row ? mapStatusRow(row) : null;
}

async function invokeRemoteCompanionRelay<T>(body: Record<string, unknown>) {
  const rows = await invokeRemoteCompanionRelayRows<T>(body);
  return rows[0] ?? null;
}

async function invokeRemoteCompanionRelayRows<T>(body: Record<string, unknown>): Promise<T[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<RelayEnvelope<T>>(
    "remote-companion-relay",
    { body },
  );

  if (isMissingSchemaError(error)) return [];
  if (error) {
    throw new Error(error.message);
  }
  if (data?.error) {
    throw new Error(data.error);
  }

  const payload = data?.data;
  if (!payload) return [];
  return Array.isArray(payload) ? payload : [payload];
}

interface RemoteCompanionPairingRow {
  device_id: string;
  device_secret: string;
  device_secret_hint: string;
  expires_at: string;
  pairing_code: string;
  pairing_code_hint: string;
}

interface RemoteCompanionDeviceRow {
  device_id: string;
  device_kind: string;
  device_label: string;
  expires_at: string;
  paired_at: string;
}

interface RemoteCompanionPingRow {
  device_id: string;
  last_seen_at: string;
  status: string;
}

interface RemoteInstallJobRow {
  expires_at: string;
  job_id: string;
  status: string;
}

interface RemoteInstallClaimedJobRow {
  build_id: string | null;
  created_at: string;
  expires_at: string;
  game_id: string;
  job_id: string;
  package_ref: Record<string, unknown> | null;
  platform: string | null;
  product_id: string | null;
  source: string;
  status: string;
  title: string;
}

interface RemoteInstallJobStatusRow {
  job_id: string;
  status: string;
  updated_at: string;
}

function mapPairingRow(row: RemoteCompanionPairingRow): RemoteCompanionPairingResult {
  return {
    deviceId: row.device_id,
    deviceSecret: row.device_secret,
    deviceSecretHint: row.device_secret_hint,
    expiresAt: row.expires_at,
    pairingCode: row.pairing_code,
    pairingCodeHint: row.pairing_code_hint,
  };
}

function mapDeviceRow(row: RemoteCompanionDeviceRow): RemoteCompanionDeviceResult {
  return {
    deviceId: row.device_id,
    deviceKind: row.device_kind,
    deviceLabel: row.device_label,
    expiresAt: row.expires_at,
    pairedAt: row.paired_at,
  };
}

function mapPingRow(row: RemoteCompanionPingRow): RemoteCompanionPingResult {
  return {
    deviceId: row.device_id,
    lastSeenAt: row.last_seen_at,
    status: row.status,
  };
}

function mapInstallJobRow(row: RemoteInstallJobRow): RemoteInstallJobResult {
  return {
    expiresAt: row.expires_at,
    jobId: row.job_id,
    status: row.status,
  };
}

function mapClaimedJobRow(row: RemoteInstallClaimedJobRow): RemoteInstallClaimedJob {
  return {
    buildId: row.build_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    gameId: row.game_id,
    jobId: row.job_id,
    packageRef: row.package_ref ?? {},
    platform: row.platform,
    productId: row.product_id,
    source: row.source,
    status: row.status,
    title: row.title,
  };
}

function mapStatusRow(row: RemoteInstallJobStatusRow): RemoteInstallJobStatusResult {
  return {
    jobId: row.job_id,
    status: row.status,
    updatedAt: row.updated_at,
  };
}
