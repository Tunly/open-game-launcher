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
  playtimeMinutes: number;
  totalSessions?: number;
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
    : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    errors.push(`${key} must be a finite number.`);
    return undefined;
  }

  const min = options.min ?? 0;
  const max = options.max ?? 1_000_000;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
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

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    errors.push(`${key} must be a valid ISO timestamp.`);
    return undefined;
  }
  return date.toISOString();
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
  return gameId;
}

function hasAggregateFields(record: Record<string, unknown>) {
  return [
    "aggregate",
    "playtimeMinutes",
    "playtime_minutes",
    "totalSessions",
    "total_sessions",
    "firstPlayedAt",
    "first_played_at",
    "lastPlayedAt",
    "last_played_at",
    "installedVersion",
    "installed_version",
  ].some((key) => key in record);
}

function normalizeAggregate(
  body: Record<string, unknown>,
  defaultGameId: string | null,
  errors: string[],
): NormalizedPlaytimeAggregate | null {
  const aggregateRecord = asRecord(body.aggregate) ??
    (hasAggregateFields(body) ? body : null);
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
  const playtimeMinutes = "playtimeMinutes" in aggregateRecord
    ? readInteger(aggregateRecord, "playtimeMinutes", aggregateErrors, {
      max: 10_000_000,
    })
    : readInteger(aggregateRecord, "playtime_minutes", aggregateErrors, {
      max: 10_000_000,
      required: true,
    });
  const totalSessions =
    readInteger(aggregateRecord, "totalSessions", aggregateErrors, {
      max: 1_000_000,
    }) ??
      readInteger(aggregateRecord, "total_sessions", aggregateErrors, {
        max: 1_000_000,
      });
  const firstPlayedAt =
    readIsoDate(aggregateRecord, "firstPlayedAt", aggregateErrors) ??
      readIsoDate(aggregateRecord, "first_played_at", aggregateErrors);
  const lastPlayedAt =
    readIsoDate(aggregateRecord, "lastPlayedAt", aggregateErrors) ??
      readIsoDate(aggregateRecord, "last_played_at", aggregateErrors);
  const installedVersion = readNullableString(
    aggregateRecord,
    "installedVersion",
    128,
    aggregateErrors,
  ) ??
    readNullableString(
      aggregateRecord,
      "installed_version",
      128,
      aggregateErrors,
    );

  errors.push(...aggregateErrors);
  if (!gameId || playtimeMinutes === undefined) {
    return null;
  }

  return {
    gameId,
    playtimeMinutes,
    ...(totalSessions !== undefined ? { totalSessions } : {}),
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
  const id = readString(record, "id");
  if (!id) {
    sessionErrors.push(`${prefix}id is required for idempotent ingestion.`);
  } else if (id.length > 128) {
    sessionErrors.push(`${prefix}id must be 128 characters or shorter.`);
  }

  const gameId = normalizeGameId(record, defaultGameId, prefix, sessionErrors);
  const startedAt = readIsoDate(record, "startedAt", sessionErrors, true) ??
    readIsoDate(record, "started_at", sessionErrors, true);
  const endedAt = readIsoDate(record, "endedAt", sessionErrors) ??
    readIsoDate(record, "ended_at", sessionErrors);
  let durationMinutes = readInteger(record, "durationMinutes", sessionErrors, {
    max: 10_000_000,
  }) ??
    readInteger(record, "duration_minutes", sessionErrors, {
      max: 10_000_000,
    });

  if (startedAt && endedAt) {
    const startedMs = Date.parse(startedAt);
    const endedMs = Date.parse(endedAt);
    if (endedMs < startedMs) {
      sessionErrors.push(`${prefix}endedAt must be after startedAt.`);
    } else if (durationMinutes === undefined) {
      durationMinutes = Math.floor((endedMs - startedMs) / 60_000);
    }
  }

  const launcherDeviceId =
    readNullableString(record, "launcherDeviceId", 128, sessionErrors) ??
      readNullableString(record, "launcher_device_id", 128, sessionErrors) ??
      null;

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
