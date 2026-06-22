import { STORAGE_KEYS } from "./storage-keys";
import type { Game } from "./types";
import type {
  ModProvider,
  NativeModSearchResult,
  SharedModProviderGameMapping,
} from "./types/mods";

export type NativeModProvider = Extract<ModProvider, "modio" | "curseforge">;
export type ModProviderGameIdMappings = Record<string, Partial<Record<NativeModProvider, string>>>;

export interface ModProviderGameIdHint {
  id: string;
  label: string;
  value: string;
  detail: string;
  confidence: "high" | "medium" | "low";
  action: "use" | "reference";
}

export interface ModProviderGameIdPromotionEvidence {
  provider: NativeModProvider;
  providerGameId: string;
  query: string;
  resultCount: number;
  sampleExternalIds: string[];
}

interface MutableHint extends ModProviderGameIdHint {
  priority: number;
}

const sharedConfidenceWeight: Record<SharedModProviderGameMapping["confidence"], number> = {
  verified: 50,
  high: 40,
  medium: 30,
  manual: 20,
  low: 10,
};

export function buildModProviderGameIdHints(
  game: Game | null,
  provider: NativeModProvider,
): ModProviderGameIdHint[] {
  if (!game) return [];

  const hints: MutableHint[] = [];
  const titleSlug = slugifyProviderId(game.title);
  const librarySlug = slugifyProviderId(game.slug ?? "");
  const steamAppId = resolveSteamAppId(game);
  const explicitCurseForgeId = resolveExplicitCurseForgeGameId(game);

  if (provider === "modio") {
    addHint(hints, {
      id: "modio-library-slug",
      label: "Library Slug",
      value: librarySlug,
      detail: "Use the local library slug as a mod.io game slug candidate.",
      confidence: "high",
      action: "use",
      priority: 10,
    });
    addHint(hints, {
      id: "modio-title-slug",
      label: "Title Slug",
      value: titleSlug,
      detail: "Use a normalized title slug for mod.io game lookup.",
      confidence: "medium",
      action: "use",
      priority: 20,
    });
    addHint(hints, {
      id: "modio-steam-appid",
      label: "Steam AppID",
      value: steamAppId,
      detail: "Reference only: Steam AppIDs are not mod.io game IDs.",
      confidence: "low",
      action: "reference",
      priority: 30,
    });
  } else {
    addHint(hints, {
      id: "curseforge-explicit-id",
      label: "CurseForge ID",
      value: explicitCurseForgeId,
      detail: "Use the explicit CurseForge numeric game ID stored with the local game.",
      confidence: "high",
      action: "use",
      priority: 10,
    });
    addHint(hints, {
      id: "curseforge-steam-appid",
      label: "Steam AppID",
      value: steamAppId,
      detail: "Reference only: CurseForge requires its own numeric game ID.",
      confidence: "low",
      action: "reference",
      priority: 20,
    });
    addHint(hints, {
      id: "curseforge-title",
      label: "Lookup Slug",
      value: librarySlug || titleSlug,
      detail: "Reference only: use this title clue to find the numeric CurseForge game ID.",
      confidence: "low",
      action: "reference",
      priority: 30,
    });
  }

  return hints.sort((left, right) => left.priority - right.priority).map(toPublicHint);
}

export function getPreferredModProviderGameId(
  game: Game | null,
  provider: NativeModProvider,
): string {
  return (
    buildModProviderGameIdHints(game, provider).find((hint) => hint.action === "use")?.value ?? ""
  );
}

export function getEffectiveModProviderGameId(
  game: Game | null,
  provider: NativeModProvider,
  mappings: ModProviderGameIdMappings,
  sharedMappings: ModProviderGameIdMappings = {},
): string {
  return (
    getStoredModProviderGameId(mappings, game, provider) ||
    getStoredModProviderGameId(sharedMappings, game, provider) ||
    getPreferredModProviderGameId(game, provider)
  );
}

export function getModProviderGameIdSource(
  game: Game | null,
  provider: NativeModProvider,
  mappings: ModProviderGameIdMappings,
  sharedMappings: ModProviderGameIdMappings = {},
): "local" | "shared" | "hint" | "none" {
  if (getStoredModProviderGameId(mappings, game, provider)) return "local";
  if (getStoredModProviderGameId(sharedMappings, game, provider)) return "shared";
  if (getPreferredModProviderGameId(game, provider)) return "hint";
  return "none";
}

export function mergeSharedModProviderGameIdMappings(
  mappings: ModProviderGameIdMappings,
  gameId: string,
  provider: NativeModProvider,
  value: string,
): ModProviderGameIdMappings {
  return setModProviderGameIdMapping(mappings, gameId, provider, value);
}

export function sharedModProviderGameMappingsToLocalShape(
  rows: SharedModProviderGameMapping[],
): ModProviderGameIdMappings {
  const sortedRows = [...rows].sort(compareSharedProviderGameMappings);
  let mappings: ModProviderGameIdMappings = {};

  for (const row of sortedRows) {
    if (row.status !== "active") continue;
    if (getStoredModProviderGameId(mappings, { id: row.localGameId }, row.provider)) continue;
    mappings = setModProviderGameIdMapping(
      mappings,
      row.localGameId,
      row.provider,
      row.providerGameId,
    );
  }

  return mappings;
}

export function buildModProviderGameIdPromotionEvidence(input: {
  provider: NativeModProvider;
  providerGameId: string;
  query: string;
  results: NativeModSearchResult[];
}): ModProviderGameIdPromotionEvidence | null {
  const providerGameId = normalizeModProviderGameId(input.provider, input.providerGameId);
  const query = input.query.trim();
  if (!providerGameId || !query) return null;

  const providerResults = input.results.filter(
    (result) => result.provider === input.provider && result.externalId.trim() && result.url.trim(),
  );
  if (providerResults.length === 0) return null;

  return {
    provider: input.provider,
    providerGameId,
    query,
    resultCount: providerResults.length,
    sampleExternalIds: providerResults.slice(0, 3).map((result) => result.externalId),
  };
}

export function getStoredModProviderGameId(
  mappings: ModProviderGameIdMappings,
  game: Pick<Game, "id"> | null,
  provider: NativeModProvider,
): string {
  if (!game) return "";
  return normalizeModProviderGameId(provider, mappings[game.id]?.[provider] ?? "");
}

export function setModProviderGameIdMapping(
  mappings: ModProviderGameIdMappings,
  gameId: string,
  provider: NativeModProvider,
  value: string,
): ModProviderGameIdMappings {
  const normalized = normalizeModProviderGameId(provider, value);
  if (!normalized) {
    return removeModProviderGameIdMapping(mappings, gameId, provider);
  }

  return {
    ...mappings,
    [gameId]: {
      ...(mappings[gameId] ?? {}),
      [provider]: normalized,
    },
  };
}

export function removeModProviderGameIdMapping(
  mappings: ModProviderGameIdMappings,
  gameId: string,
  provider: NativeModProvider,
): ModProviderGameIdMappings {
  const next = { ...mappings };
  const gameMappings = { ...(next[gameId] ?? {}) };
  delete gameMappings[provider];

  if (Object.keys(gameMappings).length > 0) {
    next[gameId] = gameMappings;
  } else {
    delete next[gameId];
  }

  return next;
}

export function readModProviderGameIdMappings(
  storage: Pick<Storage, "getItem"> | null = getLocalStorage(),
): ModProviderGameIdMappings {
  if (!storage) return {};

  try {
    const rawValue = storage.getItem(STORAGE_KEYS.MODS_PROVIDER_GAME_IDS);
    if (!rawValue) return {};
    return normalizeModProviderGameIdMappings(JSON.parse(rawValue));
  } catch {
    return {};
  }
}

export function writeModProviderGameIdMappings(
  mappings: ModProviderGameIdMappings,
  storage: Pick<Storage, "removeItem" | "setItem"> | null = getLocalStorage(),
) {
  if (!storage) return;

  const normalized = normalizeModProviderGameIdMappings(mappings);
  if (Object.keys(normalized).length === 0) {
    storage.removeItem(STORAGE_KEYS.MODS_PROVIDER_GAME_IDS);
    return;
  }

  storage.setItem(STORAGE_KEYS.MODS_PROVIDER_GAME_IDS, JSON.stringify(normalized));
}

export function normalizeModProviderGameId(
  provider: NativeModProvider,
  value: string | null | undefined,
): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  if (provider === "curseforge" && !/^\d+$/.test(trimmed)) return "";
  if (provider === "modio") {
    if (/^\d+$/.test(trimmed)) return trimmed;
    return slugifyProviderId(extractModioGameSlug(trimmed) ?? trimmed);
  }
  return trimmed;
}

export function normalizeModProviderGameIdMappings(input: unknown): ModProviderGameIdMappings {
  if (!isRecord(input)) return {};

  const mappings: ModProviderGameIdMappings = {};
  for (const [gameId, rawProviders] of Object.entries(input)) {
    if (!gameId.trim() || !isRecord(rawProviders)) continue;

    const gameMappings: Partial<Record<NativeModProvider, string>> = {};
    for (const provider of ["modio", "curseforge"] as const) {
      const value = rawProviders[provider];
      if (typeof value !== "string") continue;
      const normalized = normalizeModProviderGameId(provider, value);
      if (normalized) gameMappings[provider] = normalized;
    }

    if (Object.keys(gameMappings).length > 0) {
      mappings[gameId] = gameMappings;
    }
  }

  return mappings;
}

export function slugifyProviderId(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function addHint(
  hints: MutableHint[],
  hint: Omit<MutableHint, "value"> & { value?: string | null },
) {
  const value = hint.value?.trim();
  if (!value || hints.some((item) => item.value === value)) return;
  hints.push({ ...hint, value });
}

function compareSharedProviderGameMappings(
  left: SharedModProviderGameMapping,
  right: SharedModProviderGameMapping,
) {
  const verifiedDelta = Number(Boolean(right.verifiedAt)) - Number(Boolean(left.verifiedAt));
  if (verifiedDelta !== 0) return verifiedDelta;

  const confidenceDelta =
    sharedConfidenceWeight[right.confidence] - sharedConfidenceWeight[left.confidence];
  if (confidenceDelta !== 0) return confidenceDelta;

  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function resolveSteamAppId(game: Game): string | null {
  if (game.launcher !== "steam" && !game.id.startsWith("steam-")) return null;

  const externalId = normalizeNumericId(game.externalId);
  if (externalId) return externalId;

  const prefixedId = game.id.match(/^steam(?:-owned)?-(\d+)$/)?.[1] ?? null;
  if (prefixedId) return prefixedId;

  return normalizeNumericId(game.launchUri?.match(/^steam:\/\/(?:run|rungameid)\/(\d+)/i)?.[1]);
}

function resolveExplicitCurseForgeGameId(game: Game): string | null {
  const markers = [game.externalId, game.id, game.slug].filter(Boolean);
  for (const marker of markers) {
    const explicit = marker?.match(/^(?:curseforge|cf|curseforge-game)[:-](\d+)$/i)?.[1] ?? null;
    if (explicit) return explicit;
  }

  return null;
}

function normalizeNumericId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;
  return trimmed;
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractModioGameSlug(value: string): string | null {
  const normalized = value.trim();
  const modioPathMatch = normalized.match(/(?:^|\/\/|\b)mod\.io\/g\/([^/?#]+)/i);
  if (modioPathMatch?.[1]) return modioPathMatch[1];

  const shortPathMatch = normalized.match(/^g\/([^/?#]+)/i);
  if (shortPathMatch?.[1]) return shortPathMatch[1];

  return null;
}

function toPublicHint(hint: MutableHint): ModProviderGameIdHint {
  return {
    id: hint.id,
    label: hint.label,
    value: hint.value,
    detail: hint.detail,
    confidence: hint.confidence,
    action: hint.action,
  };
}
