// deno-lint-ignore-file no-import-prefix
import { ed25519 } from "https://esm.sh/@noble/curves@1.9.1/ed25519?target=deno";

export type StoreLicenseKeyResult =
  | {
    key: string;
    mode: "signed";
  }
  | {
    key: string;
    mode: "unsigned_staging";
    reason: "missing_device_id" | "missing_signing_key";
  };

export type StoreLicenseSigningPlan =
  | {
    mode: "signed";
    signingKey: Uint8Array;
  }
  | {
    mode: "unsigned_staging";
    reason: "missing_device_id" | "missing_signing_key";
  };

export type StoreLicenseConfigErrorReason =
  | "invalid_signing_key"
  | "missing_device_id"
  | "missing_signing_key";

export type StoreLicenseKeyInput = {
  allowUnsignedFallback?: boolean;
  deviceId: string | null;
  now?: Date;
  platform: string;
  productId: string;
  randomUuid?: () => string;
  signingKey?: string | null;
};

export class StoreLicenseConfigError extends Error {
  reason: StoreLicenseConfigErrorReason;

  constructor(reason: StoreLicenseConfigErrorReason) {
    super(storeLicenseConfigErrorMessage(reason));
    this.name = "StoreLicenseConfigError";
    this.reason = reason;
  }
}

export function createStoreLicenseKey(
  input: StoreLicenseKeyInput,
): StoreLicenseKeyResult {
  const plan = planStoreLicenseSigning({
    allowUnsignedFallback: input.allowUnsignedFallback,
    deviceId: input.deviceId,
    signingKey: input.signingKey,
  });
  if (plan.mode === "unsigned_staging") {
    return unsignedStagingLicense(plan.reason, input.randomUuid);
  }

  const issuedAt = input.now ?? new Date();
  const expiresAt = new Date(issuedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const payload = {
    product_id: input.productId,
    platform: input.platform,
    device_id: input.deviceId,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadEncoded = base64UrlNoPad(payloadBytes);
  const signingInput = `OGL1.${payloadEncoded}`;
  const signature = ed25519.sign(
    new TextEncoder().encode(signingInput),
    plan.signingKey,
  );

  return {
    key: `${signingInput}.${base64UrlNoPad(signature)}`,
    mode: "signed",
  };
}

export function planStoreLicenseSigning(input: {
  allowUnsignedFallback?: boolean;
  deviceId: string | null;
  signingKey?: string | null;
}): StoreLicenseSigningPlan {
  const allowUnsignedFallback = input.allowUnsignedFallback === true;
  const signingKeyState = readLicenseSigningKeyState(input.signingKey);

  if (!input.deviceId) {
    if (allowUnsignedFallback) {
      return { mode: "unsigned_staging", reason: "missing_device_id" };
    }
    throw new StoreLicenseConfigError("missing_device_id");
  }

  if (signingKeyState.status === "invalid") {
    throw new StoreLicenseConfigError("invalid_signing_key");
  }

  if (signingKeyState.status === "missing") {
    if (allowUnsignedFallback) {
      return { mode: "unsigned_staging", reason: "missing_signing_key" };
    }
    throw new StoreLicenseConfigError("missing_signing_key");
  }

  return { mode: "signed", signingKey: signingKeyState.signingKey };
}

export function cleanStoreLicenseDeviceId(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 128) return null;
  return trimmed;
}

function readLicenseSigningKeyState(
  value: string | null | undefined,
):
  | { status: "invalid" }
  | { status: "missing" }
  | { signingKey: Uint8Array; status: "ready" } {
  if (!value?.trim()) return { status: "missing" };
  const signingKey = parseLicenseSigningKey(value);
  return signingKey ? { signingKey, status: "ready" } : { status: "invalid" };
}

export function parseLicenseSigningKey(
  value: string | undefined,
): Uint8Array | null {
  if (!value) return null;
  for (const bytes of [hexToBytes(value), base64UrlToBytes(value)]) {
    if (!bytes) continue;
    if (bytes.length === 32) return bytes;
    if (bytes.length === 64) return bytes.slice(0, 32);
  }
  return null;
}

export function base64UrlNoPad(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function storeLicenseConfigErrorMessage(
  reason: StoreLicenseConfigErrorReason,
) {
  switch (reason) {
    case "invalid_signing_key":
      return "OGL_LICENSE_SIGNING_KEY must be a valid 32-byte Ed25519 seed.";
    case "missing_device_id":
      return "device_id is required for signed Store license issuance.";
    case "missing_signing_key":
      return "OGL_LICENSE_SIGNING_KEY is required for signed Store license issuance.";
  }
}

function unsignedStagingLicense(
  reason: "missing_device_id" | "missing_signing_key",
  randomUuid: (() => string) | undefined,
): StoreLicenseKeyResult {
  const id = randomUuid ? randomUuid() : crypto.randomUUID();
  return {
    key: `OGL-STAGING-UNSIGNED-${id}`,
    mode: "unsigned_staging",
    reason,
  };
}

function hexValue(char: string): number | null {
  const value = Number.parseInt(char, 16);
  return Number.isFinite(value) ? value : null;
}

function hexToBytes(value: string): Uint8Array | null {
  const trimmed = value.trim();
  if (trimmed.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(trimmed)) {
    return null;
  }

  const bytes = new Uint8Array(trimmed.length / 2);
  for (let index = 0; index < trimmed.length; index += 2) {
    const high = hexValue(trimmed[index]);
    const low = hexValue(trimmed[index + 1]);
    if (high === null || low === null) return null;
    bytes[index / 2] = (high << 4) | low;
  }
  return bytes;
}

function base64UrlToBytes(value: string): Uint8Array | null {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );

  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}
