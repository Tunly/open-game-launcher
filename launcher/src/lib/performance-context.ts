import { STORAGE_KEYS } from "./storage-keys";

const ACTIVE_GAME_TTL_MS = 8 * 60 * 60 * 1000;

export const OVERLAY_RUNTIME_GAME_ID = "overlay-runtime";

export interface ActivePerformanceGameContext {
  gameId: string;
  gameTitle: string | null;
  launcher: string | null;
  startedAt: string;
  expiresAt: string;
}

export interface ActivePerformanceGameContextInput {
  gameId: string;
  gameTitle?: string | null;
  launcher?: string | null;
}

export type PerformanceAttributionKind = "active-game" | "standalone-overlay";

export interface PerformanceAttribution {
  detail: string;
  gameId: string;
  isFallback: boolean;
  kind: PerformanceAttributionKind;
  label: string;
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function removeStoredPerformanceContext(storage: Storage) {
  try {
    storage.removeItem(STORAGE_KEYS.PERFORMANCE_ACTIVE_GAME);
  } catch {
    // Storage can be readable but reject writes in privacy-restricted browsers.
  }
}

function isFiniteIsoDate(value: string) {
  return Number.isFinite(Date.parse(value));
}

function normalizeText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeContext(value: unknown): ActivePerformanceGameContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const gameId = normalizeText(record.gameId);
  if (!gameId) return null;

  const startedAt = normalizeText(record.startedAt);
  const expiresAt = normalizeText(record.expiresAt);
  if (!startedAt || !expiresAt) return null;
  if (!isFiniteIsoDate(startedAt) || !isFiniteIsoDate(expiresAt)) return null;

  return {
    gameId,
    gameTitle: normalizeText(record.gameTitle),
    launcher: normalizeText(record.launcher),
    startedAt,
    expiresAt,
  };
}

function readSearchParamsFromHash(hash: string): URLSearchParams | null {
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) return null;
  return new URLSearchParams(hash.slice(queryIndex + 1));
}

function readContextFromParams(
  params: URLSearchParams | null,
  nowMs = Date.now(),
): ActivePerformanceGameContext | null {
  if (!params) return null;
  const gameId = normalizeText(params.get("gameId") ?? params.get("game"));
  if (!gameId) return null;
  const now = new Date(nowMs).toISOString();
  const context = normalizeContext({
    gameId,
    gameTitle: normalizeText(params.get("gameTitle") ?? params.get("title")),
    launcher: normalizeText(params.get("launcher") ?? params.get("platform")),
    startedAt: normalizeText(params.get("startedAt")) ?? now,
    expiresAt:
      normalizeText(params.get("expiresAt")) ?? new Date(nowMs + ACTIVE_GAME_TTL_MS).toISOString(),
  });
  if (!context) return null;
  return Date.parse(context.expiresAt) > nowMs ? context : null;
}

export function readActivePerformanceGameContextFromLocation(
  location: Pick<Location, "search" | "hash">,
  nowMs = Date.now(),
): ActivePerformanceGameContext | null {
  return (
    readContextFromParams(new URLSearchParams(location.search), nowMs) ??
    readContextFromParams(readSearchParamsFromHash(location.hash), nowMs)
  );
}

export function writeActivePerformanceGameContext(
  input: ActivePerformanceGameContextInput,
  nowMs = Date.now(),
): ActivePerformanceGameContext | null {
  const gameId = normalizeText(input.gameId);
  const storage = getBrowserStorage();
  if (!gameId || !storage) return null;

  const context: ActivePerformanceGameContext = {
    gameId,
    gameTitle: normalizeText(input.gameTitle),
    launcher: normalizeText(input.launcher),
    startedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ACTIVE_GAME_TTL_MS).toISOString(),
  };

  try {
    storage.setItem(STORAGE_KEYS.PERFORMANCE_ACTIVE_GAME, JSON.stringify(context));
    return context;
  } catch {
    return null;
  }
}

export function readStoredActivePerformanceGameContext(
  nowMs = Date.now(),
): ActivePerformanceGameContext | null {
  const storage = getBrowserStorage();
  if (!storage) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEYS.PERFORMANCE_ACTIVE_GAME);
  } catch {
    return null;
  }

  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    removeStoredPerformanceContext(storage);
    return null;
  }

  const context = normalizeContext(parsed);
  if (!context) {
    removeStoredPerformanceContext(storage);
    return null;
  }

  if (Date.parse(context.expiresAt) <= nowMs) {
    removeStoredPerformanceContext(storage);
    return null;
  }

  return context;
}

export function readActivePerformanceGameContext(
  nowMs = Date.now(),
): ActivePerformanceGameContext | null {
  if (typeof window === "undefined") return null;
  return (
    readActivePerformanceGameContextFromLocation(window.location, nowMs) ??
    readStoredActivePerformanceGameContext(nowMs)
  );
}

export function isStandalonePerformanceGameId(gameId: string | null | undefined): boolean {
  return gameId === OVERLAY_RUNTIME_GAME_ID;
}

export function resolvePerformanceAttribution(
  context: ActivePerformanceGameContext | null | undefined,
): PerformanceAttribution {
  if (context) {
    return {
      detail: context.launcher
        ? `Library launch context via ${context.launcher}`
        : "Library launch context",
      gameId: context.gameId,
      isFallback: false,
      kind: "active-game",
      label: context.gameTitle ?? context.gameId,
    };
  }

  return {
    detail: "Standalone overlay session without active library launch context",
    gameId: OVERLAY_RUNTIME_GAME_ID,
    isFallback: true,
    kind: "standalone-overlay",
    label: "Standalone Overlay",
  };
}
