export type RemoteCompanionHandshakeStatus = "missing" | "pairing" | "linked" | "expired";

export interface RemoteCompanionHandshakeRecord {
  createdAt: number;
  deviceLabel: string;
  expiresAt: number;
  lastPingAt: number | null;
  pairingCode: string;
  version: 1;
}

export interface RemoteCompanionHandshakeSummary {
  detail: string;
  expiresInMs: number;
  isLinked: boolean;
  lastPingAgeMs: number | null;
  record: RemoteCompanionHandshakeRecord | null;
  status: RemoteCompanionHandshakeStatus;
}

const DEFAULT_PAIRING_TTL_MS = 15 * 60 * 1000;
const PING_FRESHNESS_MS = 2 * 60 * 1000;

export function createRemoteCompanionHandshake(
  input: {
    deviceLabel?: string;
    now?: number;
    pairingCode?: string;
    ttlMs?: number;
  } = {},
): RemoteCompanionHandshakeRecord {
  const now = normalizeNow(input.now);
  const ttlMs =
    Number.isFinite(input.ttlMs) && input.ttlMs && input.ttlMs > 0
      ? Math.floor(input.ttlMs)
      : DEFAULT_PAIRING_TTL_MS;

  return {
    createdAt: now,
    deviceLabel: sanitizeDeviceLabel(input.deviceLabel),
    expiresAt: now + ttlMs,
    lastPingAt: null,
    pairingCode: sanitizePairingCode(input.pairingCode) ?? createPairingCode(now),
    version: 1,
  };
}

export function recordRemoteCompanionPing(
  record: RemoteCompanionHandshakeRecord | null,
  now = Date.now(),
): RemoteCompanionHandshakeRecord | null {
  const normalized = normalizeRemoteCompanionHandshake(record, now);
  if (!normalized || normalized.expiresAt <= normalizeNow(now)) {
    return normalized;
  }

  return {
    ...normalized,
    lastPingAt: normalizeNow(now),
  };
}

export function summarizeRemoteCompanionHandshake(
  value: unknown,
  now = Date.now(),
): RemoteCompanionHandshakeSummary {
  const normalizedNow = normalizeNow(now);
  const record = normalizeRemoteCompanionHandshake(value, normalizedNow);
  if (!record) {
    return {
      detail: "No local companion pairing code has been staged on this device.",
      expiresInMs: 0,
      isLinked: false,
      lastPingAgeMs: null,
      record: null,
      status: "missing",
    };
  }

  const expiresInMs = Math.max(0, record.expiresAt - normalizedNow);
  if (expiresInMs === 0) {
    return {
      detail: "Local pairing code expired; generate a fresh companion code.",
      expiresInMs,
      isLinked: false,
      lastPingAgeMs: readPingAge(record, normalizedNow),
      record,
      status: "expired",
    };
  }

  const lastPingAgeMs = readPingAge(record, normalizedNow);
  const isLinked = lastPingAgeMs !== null && lastPingAgeMs <= PING_FRESHNESS_MS;
  return {
    detail: isLinked
      ? "Companion ping was recorded locally for this pairing code."
      : "Pairing code is staged locally; waiting for a companion ping.",
    expiresInMs,
    isLinked,
    lastPingAgeMs,
    record,
    status: isLinked ? "linked" : "pairing",
  };
}

export function normalizeRemoteCompanionHandshake(
  value: unknown,
  now = Date.now(),
): RemoteCompanionHandshakeRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Partial<RemoteCompanionHandshakeRecord>;
  const createdAt = readTimestamp(record.createdAt);
  const expiresAt = readTimestamp(record.expiresAt);
  const pairingCode = sanitizePairingCode(record.pairingCode);
  if (createdAt === null || expiresAt === null || !pairingCode || expiresAt <= createdAt) {
    return null;
  }

  return {
    createdAt,
    deviceLabel: sanitizeDeviceLabel(record.deviceLabel),
    expiresAt,
    lastPingAt: readPing(record.lastPingAt, normalizeNow(now)),
    pairingCode,
    version: 1,
  };
}

export function formatRemoteCompanionDuration(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0m";
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  return `${minutes}m`;
}

function createPairingCode(now: number) {
  const suffix = createRandomCodeSuffix() ?? createFallbackCodeSuffix(now);
  return `OG-${suffix.slice(0, 3)}-${suffix.slice(3)}`;
}

function createRandomCodeSuffix() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) return null;

  const values = new Uint8Array(6);
  cryptoApi.getRandomValues(values);
  return Array.from(values, (value) => (value % 36).toString(36).toUpperCase()).join("");
}

function createFallbackCodeSuffix(now: number) {
  return Math.abs(now)
    .toString(36)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(-6)
    .padStart(6, "0");
}

function sanitizePairingCode(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 16);
  return normalized.length >= 6 ? normalized : null;
}

function sanitizeDeviceLabel(value: unknown) {
  if (typeof value !== "string") return "Local Desktop";
  const normalized = value
    .replace(/[^\w .:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, 48) : "Local Desktop";
}

function normalizeNow(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : Date.now();
}

function readTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function readPing(value: unknown, now: number) {
  const timestamp = readTimestamp(value);
  if (timestamp === null || timestamp > now + 60_000) {
    return null;
  }
  return timestamp;
}

function readPingAge(record: RemoteCompanionHandshakeRecord, now: number) {
  if (record.lastPingAt === null) return null;
  if (record.lastPingAt > now + 60_000) return null;
  return Math.max(0, now - record.lastPingAt);
}
