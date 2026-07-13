export type PlaytimePlatform =
  | "windows"
  | "linux"
  | "macos"
  | "web"
  | "unknown";

export type NormalizedPlaytimeAggregate = {
  firstPlayedAt?: string | null;
  gameId: string;
  installedVersion?: string | null;
  lastPlayedAt?: string | null;
  observedAt: string;
  operation: "snapshot" | "correction";
  operationId: string;
  playtimeMinutes: number;
  sessionCountDelta?: number;
};

export type NormalizedPlaytimeSession = {
  durationMinutes: number | null;
  endedAt: string | null;
  gameId: string;
  id: string;
  launcherDeviceId: string | null;
  platform: PlaytimePlatform;
  startedAt: string;
};

export type NormalizedPlaytimeIngestion = {
  aggregate: NormalizedPlaytimeAggregate | null;
  sessions: NormalizedPlaytimeSession[];
};

export class PlaytimeIngestionValidationError extends Error {
  details: string[];

  constructor(details: string[]) {
    super("Invalid playtime ingestion payload.");
    this.name = "PlaytimeIngestionValidationError";
    this.details = details;
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const validPlatforms = new Set<PlaytimePlatform>([
  "windows",
  "linux",
  "macos",
  "web",
  "unknown",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNullableString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
  errors: string[],
): string | null | undefined {
  if (!(key in record)) {
    return undefined;
  }
  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    errors.push(`${key} must be a string or null.`);
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    errors.push(`${key} must be ${maxLength} characters or shorter.`);
    return undefined;
  }
  return trimmed || null;
}

function readInteger(
  record: Record<string, unknown>,
  key: string,
  errors: string[],
  options: { max?: number; min?: number; required?: boolean } = {},
): number | undefined {
  if (!(key in record)) {
    if (options.required) {
      errors.push(`${key} is required.`);
    }
    return undefined;
  }

  const value = record[key];
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())
    ? Number(value.trim())
    : Number.NaN;
  if (!Number.isFinite(parsed)) {
    errors.push(`${key} must be a finite numeric value.`);
    return undefined;
  }

  const min = options.min ?? 0;
  const max = options.max ?? 1_000_000;
  const normalized = Math.floor(parsed);
  if (normalized < min || normalized > max) {
    errors.push(`${key} must be between ${min} and ${max}.`);
    return undefined;
  }
  return normalized;
}

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function readIsoDate(
  record: Record<string, unknown>,
  key: string,
  errors: string[],
  required = false,
): string | null | undefined {
  if (!(key in record)) {
    if (required) {
      errors.push(`${key} is required.`);
    }
    return undefined;
  }

  const value = record[key];
  if (value === null && !required) {
    return null;
  }
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${key} must be an ISO timestamp.`);
    return undefined;
  }

  const match = isoTimestampPattern.exec(value.trim());
  if (!match) {
    errors.push(`${key} must be a valid ISO timestamp.`);
    return undefined;
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fraction,
    zone,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offset = zone === "Z" ? null : zone.slice(1).split(":").map(Number);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    (offset && (offset[0] > 23 || offset[1] > 59))
  ) {
    errors.push(`${key} must be a valid ISO timestamp.`);
    return undefined;
  }

  const date = new Date(value.trim());
  if (!Number.isFinite(date.getTime())) {
    errors.push(`${key} must be a valid ISO timestamp.`);
    return undefined;
  }
  const normalized = date.toISOString();
  if (!fraction || fraction.length <= 3) {
    return normalized;
  }

  return normalized.replace(/\.\d{3}Z$/, `.${fraction}Z`);
}

function aliasKey(
  record: Record<string, unknown>,
  primary: string,
  legacy: string,
): string | null {
  if (primary in record) return primary;
  if (legacy in record) return legacy;
  return null;
}

function normalizeGameId(
  record: Record<string, unknown>,
  defaultGameId: string | null,
  fieldPrefix: string,
  errors: string[],
) {
  const gameId = readString(record, "gameId") ??
    readString(record, "game_id") ?? defaultGameId;
  if (!gameId) {
    errors.push(`${fieldPrefix}gameId is required.`);
    return "";
  }
  if (!uuidPattern.test(gameId)) {
    errors.push(`${fieldPrefix}gameId must be a catalog game UUID.`);
    return "";
  }
  return gameId.toLowerCase();
}

function hasAggregateFields(record: Record<string, unknown>) {
  return [
    "playtimeMinutes",
    "playtime_minutes",
    "sessionCountDelta",
    "session_count_delta",
    "firstPlayedAt",
    "first_played_at",
    "lastPlayedAt",
    "last_played_at",
    "installedVersion",
    "installed_version",
    "observedAt",
    "observed_at",
    "operation",
    "operationId",
    "operation_id",
  ].some((key) => key in record);
}

function normalizeAggregate(
  body: Record<string, unknown>,
  defaultGameId: string | null,
  errors: string[],
): NormalizedPlaytimeAggregate | null {
  let aggregateRecord: Record<string, unknown> | null = null;
  if ("aggregate" in body) {
    if (body.aggregate === null) {
      return null;
    }
    aggregateRecord = asRecord(body.aggregate);
    if (!aggregateRecord) {
      errors.push("aggregate must be an object or null.");
      return null;
    }
  } else if (hasAggregateFields(body)) {
    aggregateRecord = body;
  }
  if (!aggregateRecord) {
    return null;
  }

  const aggregateErrors: string[] = [];
  const gameId = normalizeGameId(
    aggregateRecord,
    defaultGameId,
    "aggregate.",
    aggregateErrors,
  );
  const playtimeKey = aliasKey(
    aggregateRecord,
    "playtimeMinutes",
    "playtime_minutes",
  );
  const playtimeMinutes = playtimeKey
    ? readInteger(aggregateRecord, playtimeKey, aggregateErrors, {
      max: 10_000_000,
    })
    : readInteger(aggregateRecord, "playtimeMinutes", aggregateErrors, {
      max: 10_000_000,
      required: true,
    });
  if (
    "totalSessions" in aggregateRecord || "total_sessions" in aggregateRecord
  ) {
    aggregateErrors.push(
      "totalSessions is not supported; use sessionCountDelta for atomic increments.",
    );
  }
  const sessionCountDeltaKey = aliasKey(
    aggregateRecord,
    "sessionCountDelta",
    "session_count_delta",
  );
  const sessionCountDelta = sessionCountDeltaKey
    ? readInteger(aggregateRecord, sessionCountDeltaKey, aggregateErrors, {
      max: 100,
    })
    : undefined;
  const firstPlayedAtKey = aliasKey(
    aggregateRecord,
    "firstPlayedAt",
    "first_played_at",
  );
  const firstPlayedAt = firstPlayedAtKey
    ? readIsoDate(aggregateRecord, firstPlayedAtKey, aggregateErrors)
    : undefined;
  const lastPlayedAtKey = aliasKey(
    aggregateRecord,
    "lastPlayedAt",
    "last_played_at",
  );
  const lastPlayedAt = lastPlayedAtKey
    ? readIsoDate(aggregateRecord, lastPlayedAtKey, aggregateErrors)
    : undefined;
  const installedVersionKey = aliasKey(
    aggregateRecord,
    "installedVersion",
    "installed_version",
  );
  const installedVersion = installedVersionKey
    ? readNullableString(
      aggregateRecord,
      installedVersionKey,
      128,
      aggregateErrors,
    )
    : undefined;
  const observedAtKey = aliasKey(
    aggregateRecord,
    "observedAt",
    "observed_at",
  );
  const observedAt = observedAtKey
    ? readIsoDate(aggregateRecord, observedAtKey, aggregateErrors, true)
    : readIsoDate(aggregateRecord, "observedAt", aggregateErrors, true);
  const operationIdKey = aliasKey(
    aggregateRecord,
    "operationId",
    "operation_id",
  );
  const operationIdRaw = operationIdKey
    ? readString(aggregateRecord, operationIdKey)
    : null;
  const operationId = operationIdRaw?.toLowerCase() ?? "";
  if (!operationId) {
    aggregateErrors.push("operationId is required for idempotent ingestion.");
  } else if (!uuidPattern.test(operationId)) {
    aggregateErrors.push("operationId must be a UUID.");
  }

  const operationRaw =
    readString(aggregateRecord, "operation")?.toLowerCase() ??
      "snapshot";
  const operation = operationRaw === "snapshot" || operationRaw === "correction"
    ? operationRaw
    : null;
  if (!operation) {
    aggregateErrors.push("operation must be snapshot or correction.");
  } else if (operation === "correction" && (sessionCountDelta ?? 0) !== 0) {
    aggregateErrors.push("correction aggregates cannot increment sessions.");
  }

  errors.push(...aggregateErrors);
  if (
    !gameId || playtimeMinutes === undefined || !observedAt || !operationId ||
    !operation
  ) {
    return null;
  }

  return {
    gameId,
    observedAt,
    operation,
    operationId,
    playtimeMinutes,
    ...(sessionCountDelta !== undefined ? { sessionCountDelta } : {}),
    ...(firstPlayedAt !== undefined ? { firstPlayedAt } : {}),
    ...(lastPlayedAt !== undefined ? { lastPlayedAt } : {}),
    ...(installedVersion !== undefined ? { installedVersion } : {}),
  };
}

function normalizePlatform(value: unknown): PlaytimePlatform {
  if (typeof value !== "string") {
    return "unknown";
  }
  const platform = value.trim().toLowerCase() as PlaytimePlatform;
  return validPlatforms.has(platform) ? platform : "unknown";
}

function normalizeSession(
  value: unknown,
  index: number,
  defaultGameId: string | null,
  errors: string[],
): NormalizedPlaytimeSession | null {
  const record = asRecord(value);
  if (!record) {
    errors.push(`sessions[${index}] must be an object.`);
    return null;
  }

  const sessionErrors: string[] = [];
  const prefix = `sessions[${index}].`;
  const rawId = readString(record, "id");
  const id = rawId?.toLowerCase() ?? null;
  if (!id) {
    sessionErrors.push(`${prefix}id is required for idempotent ingestion.`);
  } else if (!uuidPattern.test(id)) {
    sessionErrors.push(`${prefix}id must be a UUID.`);
  }

  const gameId = normalizeGameId(record, defaultGameId, prefix, sessionErrors);
  const startedAtKey = aliasKey(record, "startedAt", "started_at");
  const startedAt = startedAtKey
    ? readIsoDate(record, startedAtKey, sessionErrors, true)
    : readIsoDate(record, "startedAt", sessionErrors, true);
  const endedAtKey = aliasKey(record, "endedAt", "ended_at");
  const endedAt = endedAtKey
    ? readIsoDate(record, endedAtKey, sessionErrors)
    : undefined;
  const durationMinutesKey = aliasKey(
    record,
    "durationMinutes",
    "duration_minutes",
  );
  let durationMinutes = durationMinutesKey
    ? readInteger(record, durationMinutesKey, sessionErrors, {
      max: 10_000_000,
    })
    : undefined;

  if (startedAt && endedAt) {
    const startedMs = Date.parse(startedAt);
    const endedMs = Date.parse(endedAt);
    if (endedMs < startedMs) {
      sessionErrors.push(`${prefix}endedAt must be after startedAt.`);
    } else if (durationMinutes === undefined) {
      durationMinutes = Math.floor((endedMs - startedMs) / 60_000);
    }
  }

  const launcherDeviceIdKey = aliasKey(
    record,
    "launcherDeviceId",
    "launcher_device_id",
  );
  const launcherDeviceIdRaw = launcherDeviceIdKey
    ? readNullableString(record, launcherDeviceIdKey, 128, sessionErrors)
    : undefined;
  const launcherDeviceId = launcherDeviceIdRaw?.toLowerCase() ?? null;
  if (launcherDeviceId && !uuidPattern.test(launcherDeviceId)) {
    sessionErrors.push(`${prefix}launcherDeviceId must be a UUID.`);
  }

  errors.push(...sessionErrors);
  if (!id || !gameId || !startedAt) {
    return null;
  }

  return {
    durationMinutes: durationMinutes ?? null,
    endedAt: endedAt ?? null,
    gameId,
    id,
    launcherDeviceId,
    platform: normalizePlatform(record.platform),
    startedAt,
  };
}

export function normalizePlaytimeIngestionPayload(
  payload: unknown,
): NormalizedPlaytimeIngestion {
  const body = asRecord(payload);
  if (!body) {
    throw new PlaytimeIngestionValidationError([
      "Payload must be a JSON object.",
    ]);
  }

  const errors: string[] = [];
  const defaultGameId = readString(body, "gameId") ??
    readString(body, "game_id");
  const aggregate = normalizeAggregate(body, defaultGameId, errors);
  const rawSessions = "sessions" in body ? body.sessions : [];
  const sessions: NormalizedPlaytimeSession[] = [];

  if (!Array.isArray(rawSessions)) {
    errors.push("sessions must be an array.");
  } else if (rawSessions.length > 100) {
    errors.push("sessions must contain at most 100 rows.");
  } else {
    rawSessions.forEach((session, index) => {
      const normalized = normalizeSession(
        session,
        index,
        defaultGameId,
        errors,
      );
      if (normalized) {
        sessions.push(normalized);
      }
    });
  }

  if (errors.length === 0 && !aggregate && sessions.length === 0) {
    errors.push("At least one aggregate row or session row is required.");
  }

  if (errors.length > 0) {
    throw new PlaytimeIngestionValidationError(errors);
  }

  return { aggregate, sessions };
}

export function listPlaytimeIngestionGameIds(
  ingestion: NormalizedPlaytimeIngestion,
): string[] {
  return Array.from(
    new Set([
      ...(ingestion.aggregate ? [ingestion.aggregate.gameId] : []),
      ...ingestion.sessions.map((session) => session.gameId),
    ]),
  );
}
