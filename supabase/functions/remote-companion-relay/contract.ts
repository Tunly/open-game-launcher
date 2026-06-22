export type RemoteCompanionRelayAction =
  | "claim_jobs"
  | "create_pairing"
  | "enqueue_install"
  | "ping"
  | "redeem_pairing"
  | "update_job_status";

export type RemoteCompanionRelayParseResult =
  | {
    action: RemoteCompanionRelayAction;
    args: Record<string, unknown>;
    rpcName: string;
    status: "ok";
  }
  | {
    error: string;
    status: "error";
    statusCode: number;
  };

export type RemoteCompanionRelayErrorContract = {
  body: Record<string, unknown>;
  status: "error";
  statusCode: number;
};

export type RemoteCompanionRelayMethodGuard =
  | { status: "ok" }
  | { status: "options" }
  | RemoteCompanionRelayErrorContract;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unsafePackageRefKeys = new Set([
  "access_token",
  "accesstoken",
  "authorization",
  "bearer",
  "cookie",
  "downloadurl",
  "download_url",
  "installmanifesturl",
  "install_manifest_url",
  "signature",
  "signedurl",
  "signed_url",
  "secret",
  "sig",
  "token",
]);
const allowedDeviceKinds = new Set(["desktop", "mobile", "web"]);
const allowedSources = new Set([
  "desktop-deep-link",
  "mobile-companion",
  "web-dashboard",
]);

export function guardRemoteCompanionRelayMethod(
  method: string,
): RemoteCompanionRelayMethodGuard {
  const normalized = method.trim().toUpperCase();
  if (normalized === "OPTIONS") return { status: "options" };
  if (normalized === "POST") return { status: "ok" };
  return buildRemoteCompanionRelayErrorContract("Method not allowed.", 405);
}

export function guardRemoteCompanionRelayAuth(
  authData: unknown,
  authError: unknown,
): { status: "ok" } | RemoteCompanionRelayErrorContract {
  const record = readRecord(authData);
  if (authError || !record?.user) {
    return buildRemoteCompanionRelayErrorContract(
      "Invalid or expired token.",
      401,
    );
  }

  return { status: "ok" };
}

export function buildRemoteCompanionRelayErrorContract(
  error: string,
  statusCode = 400,
): RemoteCompanionRelayErrorContract {
  return { body: { error }, status: "error", statusCode };
}

export function buildRemoteCompanionRelayRpcErrorContract(input: {
  action: RemoteCompanionRelayAction;
  errorMessage: string;
  rpcName: string;
}): RemoteCompanionRelayErrorContract {
  return {
    body: {
      action: input.action,
      error: input.errorMessage,
      rpc: input.rpcName,
    },
    status: "error",
    statusCode: 400,
  };
}

export function parseRemoteCompanionRelayRequest(
  body: unknown,
): RemoteCompanionRelayParseResult {
  const record = readRecord(body);
  if (!record) {
    return errorResult("Request body must be a JSON object.");
  }

  const action = normalizeAction(readString(record.action));
  if (!action) {
    return errorResult("Remote companion action is not supported.");
  }

  if (action === "create_pairing") {
    return {
      action,
      args: {
        device_kind_input: cleanDeviceKind(
          record.deviceKind ?? record.device_kind,
          "desktop",
        ),
        device_label_input: cleanShortText(
          record.deviceLabel ?? record.device_label,
          "OG Launcher Desktop",
          80,
        ),
        ttl_seconds_input: cleanInteger(
          record.ttlSeconds ?? record.ttl_seconds,
          900,
          300,
          3600,
        ),
      },
      rpcName: "create_remote_companion_pairing",
      status: "ok",
    };
  }

  if (action === "redeem_pairing") {
    const pairingCode = cleanRequiredText(
      record.pairingCode ?? record.pairing_code,
      256,
    );
    if (!pairingCode) return errorResult("Pairing code is required.");
    return {
      action,
      args: {
        device_kind_input: cleanDeviceKind(
          record.deviceKind ?? record.device_kind,
          "mobile",
        ),
        device_label_input: cleanShortText(
          record.deviceLabel ?? record.device_label,
          "Mobile Companion",
          80,
        ),
        pairing_code_input: pairingCode,
      },
      rpcName: "redeem_remote_companion_pairing",
      status: "ok",
    };
  }

  if (action === "ping") {
    const deviceId = cleanUuid(record.deviceId ?? record.device_id);
    const deviceSecret = cleanRequiredText(
      record.deviceSecret ?? record.device_secret,
      256,
    );
    if (!deviceId) {
      return errorResult("Active companion device id is required.");
    }
    if (!deviceSecret) {
      return errorResult("Active companion device secret is required.");
    }
    return {
      action,
      args: {
        device_id_input: deviceId,
        device_secret_input: deviceSecret,
      },
      rpcName: "record_remote_companion_ping",
      status: "ok",
    };
  }

  if (action === "enqueue_install") {
    const buildId = cleanUuid(record.buildId ?? record.build_id);
    const companionDeviceId = cleanUuid(
      record.companionDeviceId ?? record.companion_device_id,
    );
    const gameId = cleanRequiredText(record.gameId ?? record.game_id, 160);
    const productId = cleanUuid(record.productId ?? record.product_id);
    const title = cleanRequiredText(record.title, 180);
    const packageRef = sanitizeRemotePackageRef(
      record.packageRef ?? record.package_ref,
    );
    if (!companionDeviceId) {
      return errorResult("Active companion device id is required.");
    }
    if (!gameId || !title) {
      return errorResult("Remote install job requires a game id and title.");
    }
    if (!packageRef.ok) return errorResult(packageRef.error);
    if (buildId && !productId) {
      return errorResult("Store remote install jobs require a store product id.");
    }
    if ((productId || buildId) && !isStoreBuildTicketPackageRef(packageRef.value)) {
      return errorResult(
        "Store remote install jobs require a store-build-ticket package reference.",
      );
    }

    return {
      action,
      args: {
        build_id_input: buildId,
        companion_device_id_input: companionDeviceId,
        game_id_input: gameId,
        package_ref_input: packageRef.value,
        platform_input: cleanOptionalShortText(record.platform, 32),
        product_id_input: productId,
        source_input: cleanSource(record.source),
        title_input: title,
      },
      rpcName: "enqueue_remote_install_job",
      status: "ok",
    };
  }

  if (action === "update_job_status") {
    const deviceId = cleanUuid(record.deviceId ?? record.device_id);
    const deviceSecret = cleanRequiredText(
      record.deviceSecret ?? record.device_secret,
      256,
    );
    const jobId = cleanUuid(record.jobId ?? record.job_id);
    const status = cleanJobStatus(record.status);
    const message = cleanSafeStatusText(record.message, 240);
    const localQueueId = cleanSafeStatusText(
      record.localQueueId ?? record.local_queue_id,
      80,
    );
    if (!deviceId) return errorResult("Desktop device id is required.");
    if (!deviceSecret) return errorResult("Desktop device secret is required.");
    if (!jobId) return errorResult("Remote install job id is required.");
    if (!status) {
      return errorResult("Remote install job status is not supported.");
    }
    if (message === false || localQueueId === false) {
      return errorResult(
        "Remote install job status must not contain package locations or secrets.",
      );
    }

    return {
      action,
      args: {
        device_id_input: deviceId,
        device_secret_input: deviceSecret,
        job_id_input: jobId,
        local_queue_id_input: localQueueId,
        message_input: message,
        status_input: status,
      },
      rpcName: "update_remote_install_job_status",
      status: "ok",
    };
  }

  const deviceId = cleanUuid(record.deviceId ?? record.device_id);
  const deviceSecret = cleanRequiredText(
    record.deviceSecret ?? record.device_secret,
    256,
  );
  if (!deviceId) return errorResult("Desktop device id is required.");
  if (!deviceSecret) return errorResult("Desktop device secret is required.");
  return {
    action,
    args: {
      device_id_input: deviceId,
      device_secret_input: deviceSecret,
      limit_input: cleanInteger(record.limit, 5, 1, 25),
    },
    rpcName: "claim_remote_install_jobs",
    status: "ok",
  };
}

export function redactRemoteCompanionRelayArgs(args: Record<string, unknown>) {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    redacted[key] = key.toLowerCase().includes("secret") ? "[redacted]" : value;
  }
  return redacted;
}

export function sanitizeRemotePackageRef(
  value: unknown,
): { ok: true; value: Record<string, unknown> } | { error: string; ok: false } {
  const record = readRecord(value ?? {});
  if (!record) {
    return { error: "Remote package reference must be an object.", ok: false };
  }

  const sanitized = sanitizeJsonObject(record);
  if (!sanitized.ok) return sanitized;
  return { ok: true, value: sanitized.value };
}

function sanitizeJsonObject(
  record: Record<string, unknown>,
  depth = 0,
): { ok: true; value: Record<string, unknown> } | { error: string; ok: false } {
  if (depth > 4) {
    return {
      error: "Remote package reference is too deeply nested.",
      ok: false,
    };
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isUnsafePackageRefKey(key)) {
      return {
        error:
          "Remote package reference must not contain package locations or secrets.",
        ok: false,
      };
    }

    const sanitized = sanitizeJsonValue(value, depth + 1);
    if (!sanitized.ok) return sanitized;
    output[key.slice(0, 80)] = sanitized.value;
  }
  return { ok: true, value: output };
}

function sanitizeJsonValue(
  value: unknown,
  depth: number,
): { ok: true; value: unknown } | { error: string; ok: false } {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return { ok: true, value };
  }

  if (typeof value === "string") {
    if (containsUnsafePackageRefText(value)) {
      return {
        error:
          "Remote package reference must not contain package locations or secrets.",
        ok: false,
      };
    }
    return { ok: true, value: value.slice(0, 500) };
  }

  if (Array.isArray(value)) {
    const output: unknown[] = [];
    for (const item of value.slice(0, 25)) {
      const sanitized = sanitizeJsonValue(item, depth + 1);
      if (!sanitized.ok) return sanitized;
      output.push(sanitized.value);
    }
    return { ok: true, value: output };
  }

  const record = readRecord(value);
  if (!record) {
    return {
      error: "Remote package reference contains unsupported JSON.",
      ok: false,
    };
  }
  return sanitizeJsonObject(record, depth);
}

function normalizeAction(
  value: string | null,
): RemoteCompanionRelayAction | null {
  const normalized = value?.trim().toLowerCase().replace(/-/g, "_");
  if (
    normalized === "claim_jobs" ||
    normalized === "create_pairing" ||
    normalized === "enqueue_install" ||
    normalized === "ping" ||
    normalized === "redeem_pairing" ||
    normalized === "update_job_status"
  ) {
    return normalized;
  }
  return null;
}

function errorResult(
  error: string,
  statusCode = 400,
): RemoteCompanionRelayParseResult {
  return { error, status: "error", statusCode };
}

function cleanDeviceKind(value: unknown, fallback: string) {
  const normalized = readString(value)?.trim().toLowerCase() ?? fallback;
  return allowedDeviceKinds.has(normalized) ? normalized : fallback;
}

function cleanSource(value: unknown) {
  const normalized = readString(value)?.trim().toLowerCase() ??
    "mobile-companion";
  return allowedSources.has(normalized) ? normalized : "mobile-companion";
}

function cleanJobStatus(value: unknown) {
  const normalized = readString(value)?.trim().toLowerCase();
  return normalized === "started" ||
      normalized === "completed" ||
      normalized === "failed" ||
      normalized === "cancelled"
    ? normalized
    : null;
}

function cleanSafeStatusText(
  value: unknown,
  maxLength: number,
): string | null | false {
  const text = cleanOptionalShortText(value, maxLength);
  if (!text) return null;
  return containsUnsafePackageRefText(text) ? false : text;
}

function cleanInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const numberValue = typeof value === "number"
    ? value
    : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(min, Math.min(Math.trunc(numberValue), max));
}

function cleanOptionalShortText(value: unknown, maxLength: number) {
  const text = readString(value)?.trim();
  return text ? text.slice(0, maxLength) : null;
}

function cleanRequiredText(value: unknown, maxLength: number) {
  const text = cleanOptionalShortText(value, maxLength);
  return text && text.length > 0 ? text : null;
}

function cleanShortText(value: unknown, fallback: string, maxLength: number) {
  return cleanRequiredText(value, maxLength) ?? fallback;
}

function cleanUuid(value: unknown) {
  const text = readString(value)?.trim();
  return text && uuidPattern.test(text) ? text : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function isUnsafePackageRefKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return (
    unsafePackageRefKeys.has(normalized) ||
    normalized.includes("secret") ||
    normalized.includes("signature") ||
    normalized.endsWith("token")
  );
}

function containsUnsafePackageRefText(value: string) {
  return /(https?:\/\/|oglauncher:\/\/|access_token|accesstoken|authorization|bearer|cookie|signature|token=|sig=|signedurl|signed_url|downloadurl|download_url|installmanifesturl|install_manifest_url)/i
    .test(
      value,
    );
}

function isStoreBuildTicketPackageRef(record: Record<string, unknown>) {
  return (
    record.delivery === "store-build-ticket" &&
    record.downloadTicketRequired === true
  );
}
