export type MobilePushRegistrationPlatform = "android" | "ios";
export type MobilePushRegistrationPermissionStatus =
  | "denied"
  | "granted"
  | "prompt";

export type MobilePushRegistrationParseResult =
  | {
      action: "register";
      consentGranted: true;
      deviceLabel: string;
      permissionStatus: MobilePushRegistrationPermissionStatus;
      platform: MobilePushRegistrationPlatform;
      status: "ok";
      tokenHash: string;
      tokenHint: string;
    }
  | {
      action: "unregister";
      registrationId: string;
      status: "ok";
    }
  | {
      error: string;
      status: "error";
      statusCode: number;
    };

export type MobilePushRegistrationMutationPlan =
  | {
      action: "upsert";
      registrationId: null;
      row: {
        consent_granted: true;
        owner_id: string;
        permission_status: MobilePushRegistrationPermissionStatus;
        platform: MobilePushRegistrationPlatform;
        token_hash: string;
        token_hint: string;
      };
      status: "ok";
    }
  | {
      action: "delete";
      ownerId: string;
      registrationId: string;
      status: "ok";
    }
  | {
      error: string;
      status: "error";
      statusCode: number;
    };

const tokenHashPattern = /^sha256:[0-9a-f]{64}$/;
const tokenHintPattern = /^(apns|fcm)-?\.\.\.[a-z0-9_-]{4,12}$/i;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rawTokenKeys = new Set([
  "devicetoken",
  "device_token",
  "pushtoken",
  "push_token",
  "rawtoken",
  "raw_token",
  "token",
]);

export function readMobilePushRegistrationRequest(
  body: unknown,
): MobilePushRegistrationParseResult {
  const record = readRecord(body);
  if (!record) {
    return errorResult("Request body must be a JSON object.");
  }

  if (hasRawTokenKey(record)) {
    return errorResult("Raw device tokens are not accepted.");
  }

  const action = normalizeAction(record.action);
  if (action === "unregister") {
    const registrationId = cleanUuid(
      record.registrationId ?? record.registration_id,
    );
    if (!registrationId) return errorResult("registration_id is required.");
    return { action, registrationId, status: "ok" };
  }

  if (action !== "register") {
    return errorResult("Mobile push registration action is not supported.");
  }

  const consentGranted = readConsentGranted(
    record.consentGranted ?? record.consent_granted,
  );
  if (!consentGranted) {
    return errorResult("consent_granted must be true for registration.");
  }

  const tokenHash = cleanTokenHash(record.tokenHash ?? record.token_hash);
  if (!tokenHash) {
    return errorResult("token_hash must be sha256:<64 hex>");
  }

  return {
    action,
    consentGranted: true,
    deviceLabel: cleanShortText(
      record.deviceLabel ?? record.device_label,
      "Mobile Companion",
      80,
    ),
    permissionStatus: cleanPermissionStatus(
      record.permissionStatus ?? record.permission_status,
    ),
    platform: cleanPlatform(record.platform),
    status: "ok",
    tokenHash,
    tokenHint: cleanTokenHint(record.tokenHint ?? record.token_hint),
  };
}

export function buildMobilePushRegistrationMutationPlan(
  userId: string,
  request: MobilePushRegistrationParseResult,
): MobilePushRegistrationMutationPlan {
  if (request.status === "error") return request;

  const ownerId = cleanUuid(userId);
  if (!ownerId) return errorResult("Authenticated user id is required.");

  if (request.action === "unregister") {
    return {
      action: "delete",
      ownerId,
      registrationId: request.registrationId,
      status: "ok",
    };
  }

  return {
    action: "upsert",
    registrationId: null,
    row: {
      consent_granted: true,
      owner_id: ownerId,
      permission_status: request.permissionStatus,
      platform: request.platform,
      token_hash: request.tokenHash,
      token_hint: request.tokenHint,
    },
    status: "ok",
  };
}

function errorResult(
  error: string,
  statusCode = 400,
): MobilePushRegistrationParseResult & { status: "error" } {
  return { error, status: "error", statusCode };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasRawTokenKey(record: Record<string, unknown>) {
  return Object.keys(record).some((key) =>
    rawTokenKeys.has(key.trim().toLowerCase()),
  );
}

function normalizeAction(value: unknown) {
  if (typeof value !== "string") return "register";
  const action = value.trim().toLowerCase().replace(/-/g, "_");
  if (action === "register" || action === "unregister") return action;
  return null;
}

function readConsentGranted(value: unknown) {
  if (value === true) return true;
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

function cleanTokenHash(value: unknown) {
  if (typeof value !== "string") return null;
  const tokenHash = value.trim().toLowerCase();
  return tokenHashPattern.test(tokenHash) ? tokenHash : null;
}

function cleanUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const uuid = value.trim().toLowerCase();
  return uuidPattern.test(uuid) ? uuid : null;
}

function cleanPlatform(value: unknown): MobilePushRegistrationPlatform {
  if (typeof value !== "string") return "ios";
  const platform = value.trim().toLowerCase();
  if (platform === "android" || platform === "fcm") return "android";
  return "ios";
}

function cleanPermissionStatus(
  value: unknown,
): MobilePushRegistrationPermissionStatus {
  if (typeof value !== "string") return "granted";
  const status = value.trim().toLowerCase();
  if (status === "denied" || status === "prompt") return status;
  return "granted";
}

function cleanShortText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const text = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return text || fallback;
}

function cleanTokenHint(value: unknown) {
  if (typeof value !== "string") return "token hint redacted";
  const tokenHint = value.trim().replace(/\s+/g, " ");
  if (!tokenHintPattern.test(tokenHint)) return "token hint redacted";
  return tokenHint.toLowerCase();
}
