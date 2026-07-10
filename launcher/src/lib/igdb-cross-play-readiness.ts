import type { CrossPlayPlatform } from "./types/crossplay";

export type IgdbCrossPlayStatus = "blocked" | "ready" | "warning";

export interface IgdbExternalIdInput {
  source: string;
  value?: string | null;
}

export interface IgdbExternalIdCandidate {
  source: string;
  value: string;
}

export interface IgdbCrossPlayCandidateInput {
  externalId?: string | null;
  id: string;
  igdbPlatformName: string;
  label: string;
}

export interface IgdbCrossPlayCandidate {
  action: string;
  detail: string;
  externalId?: string;
  id: string;
  igdbPlatformName: string;
  label: string;
  mappedPlatform: CrossPlayPlatform | null;
  status: IgdbCrossPlayStatus;
}

export interface IgdbCrossPlayImportPreviewRow {
  candidateId: string;
  externalIdSource: string;
  externalIdValue: string;
  isVerified: false;
  label: string;
  mappedPlatform: CrossPlayPlatform;
  targetTables: string[];
}

export type IgdbCrossPlayImportIssueDecision =
  "dedupe_incoming" | "skip_incoming" | "stage_external_id_only";

export type IgdbCrossPlayImportIssueReason =
  "conflicting_external_id" | "duplicate_external_id" | "duplicate_platform";

export interface IgdbCrossPlayImportIssueRow {
  candidateIds: string[];
  decision: IgdbCrossPlayImportIssueDecision;
  incomingCandidateId: string;
  incomingValue: string;
  keptCandidateId: string;
  keptValue: string;
  labels: string[];
  reason: IgdbCrossPlayImportIssueReason;
  targetKey: string;
  targetTable: "game_cross_play" | "games.external_ids";
}

export interface IgdbCrossPlayImportSkippedRow {
  candidateId: string;
  label: string;
  reason:
    | "conflicting_external_id"
    | "duplicate_external_id"
    | "duplicate_platform"
    | "missing_external_id"
    | "unmapped_platform";
  status: IgdbCrossPlayStatus;
}

export interface IgdbCrossPlayImportPreview {
  externalIdRows: IgdbCrossPlayImportPreviewRow[];
  gameExternalIdsPatch: Record<string, string>;
  gameCrossPlayRows: IgdbCrossPlayImportPreviewRow[];
  issueRows: IgdbCrossPlayImportIssueRow[];
  skippedRows: IgdbCrossPlayImportSkippedRow[];
  writeMode: "preview-only";
}

export interface IgdbCrossPlayUpsertPayload {
  game_id: string;
  is_enabled: true;
  is_verified: false;
  metadata: {
    candidate_id: string;
    external_id_source: string;
    external_id_value: string;
    label: string;
    planner: "igdb-cross-play-staged-sync";
    write_mode: "supabase-write-blocked";
  };
  notes: string;
  platform: CrossPlayPlatform;
  verified_at: null;
  verified_by_user_id: null;
}

export type IgdbCrossPlaySyncPlanBlockedReason =
  | "conflicting_existing_external_id"
  | "conflicting_preview_external_id"
  | "duplicate_existing_platform"
  | "duplicate_preview_external_id"
  | "duplicate_preview_platform"
  | "missing_external_id"
  | "unmapped_platform";

export interface IgdbCrossPlaySyncPlanBlockedRow {
  candidateId: string;
  label: string;
  reason: IgdbCrossPlaySyncPlanBlockedReason;
  targetKey: string;
  targetTable: "game_cross_play" | "games.external_ids";
}

export interface IgdbCrossPlaySyncPlanIssueSummary {
  blockerCount: number;
  conflictCount: number;
  duplicateCount: number;
  externalIdMergeCount: number;
  platformOnlyCount: number;
  skippedCount: number;
}

export interface IgdbCrossPlayImportSyncPlan {
  blockedRows: IgdbCrossPlaySyncPlanBlockedRow[];
  gameCrossPlayUpserts: IgdbCrossPlayUpsertPayload[];
  gameId: string;
  issueSummary: IgdbCrossPlaySyncPlanIssueSummary;
  mergedExternalIds: Record<string, string>;
  mode: "supabase-write-blocked";
  skippedRows: IgdbCrossPlaySyncPlanBlockedRow[];
  supabaseWriteBlocked: true;
  writeClaims: {
    hostedSync: false;
    supabaseWrites: false;
  };
}

export interface IgdbCrossPlayReadinessPlan {
  blockedCount: number;
  candidates: IgdbCrossPlayCandidate[];
  guardCopy: string;
  guards: string[];
  importPreview: IgdbCrossPlayImportPreview;
  issueCount: number;
  nextAction: string;
  progress: number;
  readyCount: number;
  stageableCount: number;
  statusLabel: string;
  summary: string;
  syncPlan: IgdbCrossPlayImportSyncPlan;
  warningCount: number;
}

const IGDB_IMPORT_GUARDS = [
  "No IGDB API access",
  "No Supabase writes",
  "No provider telemetry",
  "No hosted sync",
  "No live cross-play verification",
  "Preview rows only",
];

const IGDB_IMPORT_GUARD_COPY =
  "Local import preflight only. This panel stages how IGDB-shaped cross-play metadata could map into game_cross_play and games.external_ids as review-only rows; it does not call IGDB, write Supabase rows, read provider telemetry, run hosted sync, or verify live cross-play.";

const PLATFORM_ALIASES: Array<{ aliases: string[]; platform: CrossPlayPlatform }> = [
  { aliases: ["steam"], platform: "steam" },
  { aliases: ["epic games store", "epic"], platform: "epic" },
  { aliases: ["gog", "good old games"], platform: "gog" },
  { aliases: ["ea app", "origin"], platform: "origin" },
  { aliases: ["ubisoft connect", "uplay", "ubisoft"], platform: "uplay" },
  { aliases: ["battle.net", "battlenet", "blizzard"], platform: "battlenet" },
  {
    aliases: ["pc (microsoft windows)", "microsoft windows", "windows", "pc"],
    platform: "windows",
  },
  { aliases: ["mac", "macos", "mac os"], platform: "macos" },
  { aliases: ["linux"], platform: "linux" },
  { aliases: ["xbox series x|s", "xbox series x/s", "xbox one", "xbox"], platform: "xbox" },
  {
    aliases: ["playstation 5", "playstation 4", "playstation", "ps5", "ps4"],
    platform: "playstation",
  },
  { aliases: ["nintendo switch", "switch"], platform: "switch" },
  { aliases: ["ios", "iphone", "ipad"], platform: "ios" },
  { aliases: ["android"], platform: "android" },
  { aliases: ["web browser", "browser", "web"], platform: "web" },
];

export function mapIgdbPlatformToCrossPlayPlatform(platformName: string): CrossPlayPlatform | null {
  const normalized = normalizePlatformName(platformName);
  const match = PLATFORM_ALIASES.find(({ aliases }) => aliases.includes(normalized));
  return match?.platform ?? null;
}

export function normalizeIgdbExternalIdCandidates(
  inputs: IgdbExternalIdInput[],
): IgdbExternalIdCandidate[] {
  const seen = new Set<string>();
  const candidates: IgdbExternalIdCandidate[] = [];

  for (const input of inputs) {
    const source = input.source.trim().toLowerCase();
    const value = input.value?.trim();
    if (!source || !value) continue;

    const key = `${source}:${value}`;
    if (seen.has(key)) continue;

    seen.add(key);
    candidates.push({ source, value });
  }

  return candidates;
}

export function buildIgdbCrossPlayReadinessPlan(
  inputs: IgdbCrossPlayCandidateInput[],
): IgdbCrossPlayReadinessPlan {
  const candidates = inputs.map(toCandidate);
  const importPreview = buildIgdbCrossPlayImportPreview(candidates);
  const syncPlan = buildIgdbCrossPlayImportSyncPlan("local-preview-game", importPreview);
  const readyCount = candidates.filter((candidate) => candidate.status === "ready").length;
  const stageableCount = importPreview.gameCrossPlayRows.length;
  const issueCount = importPreview.issueRows.length;
  const warningCount = candidates.filter((candidate) => candidate.status === "warning").length;
  const blockedCount = candidates.filter((candidate) => candidate.status === "blocked").length;
  const nextCandidate =
    candidates.find((candidate) => candidate.status === "blocked") ??
    candidates.find((candidate) => candidate.status === "warning") ??
    null;

  return {
    blockedCount,
    candidates,
    guardCopy: IGDB_IMPORT_GUARD_COPY,
    guards: [...IGDB_IMPORT_GUARDS],
    importPreview,
    issueCount,
    nextAction:
      nextCandidate?.action ??
      (issueCount > 0
        ? "Resolve duplicate or conflicting import keys before write-mode planning."
        : "IGDB-shaped cross-play metadata is ready for staged review."),
    progress: candidates.length === 0 ? 0 : Math.round((stageableCount / candidates.length) * 100),
    readyCount,
    stageableCount,
    statusLabel:
      blockedCount > 0
        ? "Local only"
        : warningCount > 0
          ? "Needs mapping"
          : issueCount > 0
            ? "Needs review"
            : "Review ready",
    summary:
      blockedCount > 0
        ? "IGDB Cross-Play is a local import preflight with review-only row previews; API calls, hosted sync, and live verification remain open."
        : warningCount > 0
          ? "IGDB-shaped metadata can map locally, but IDs still need staged review before row preview."
          : issueCount > 0
            ? "IGDB-shaped metadata is local-only and found duplicate or conflicting target keys that need review before writes."
            : "IGDB-shaped platform metadata can enter staged cross-play import review with preview rows only.",
    syncPlan,
    warningCount,
  };
}

export function buildIgdbCrossPlayImportPreview(
  candidates: IgdbCrossPlayCandidate[],
): IgdbCrossPlayImportPreview {
  const gameCrossPlayRows: IgdbCrossPlayImportPreviewRow[] = [];
  const externalIdRows: IgdbCrossPlayImportPreviewRow[] = [];
  const gameExternalIdsPatch: Record<string, string> = {};
  const externalIdOwners: Record<string, IgdbCrossPlayImportPreviewRow> = {};
  const platformOwners: Partial<Record<CrossPlayPlatform, IgdbCrossPlayImportPreviewRow>> = {};
  const issueRows: IgdbCrossPlayImportIssueRow[] = [];
  const skippedRows: IgdbCrossPlayImportSkippedRow[] = [];

  for (const candidate of candidates) {
    if (candidate.status !== "ready" || !candidate.mappedPlatform || !candidate.externalId) {
      skippedRows.push({
        candidateId: candidate.id,
        label: candidate.label,
        reason: candidate.status === "blocked" ? "unmapped_platform" : "missing_external_id",
        status: candidate.status,
      });
      continue;
    }

    const externalId = parseExternalId(candidate.externalId, candidate.mappedPlatform);
    const existingOwner = externalIdOwners[externalId.source];
    const incomingExternalId = formatExternalId(externalId);
    if (existingOwner) {
      const keptExternalId = formatRowExternalId(existingOwner);
      issueRows.push({
        candidateIds: [existingOwner.candidateId, candidate.id],
        decision:
          existingOwner.externalIdValue === externalId.value ? "dedupe_incoming" : "skip_incoming",
        incomingCandidateId: candidate.id,
        incomingValue: incomingExternalId,
        keptCandidateId: existingOwner.candidateId,
        keptValue: keptExternalId,
        labels: [existingOwner.label, candidate.label],
        reason:
          existingOwner.externalIdValue === externalId.value
            ? "duplicate_external_id"
            : "conflicting_external_id",
        targetKey: externalId.source,
        targetTable: "games.external_ids",
      });
      skippedRows.push({
        candidateId: candidate.id,
        label: candidate.label,
        reason:
          existingOwner.externalIdValue === externalId.value
            ? "duplicate_external_id"
            : "conflicting_external_id",
        status: candidate.status,
      });
      continue;
    }

    gameExternalIdsPatch[externalId.source] = externalId.value;
    const existingPlatformOwner = platformOwners[candidate.mappedPlatform];
    const targetTables = existingPlatformOwner
      ? ["games.external_ids"]
      : ["game_cross_play", "games.external_ids"];
    const row: IgdbCrossPlayImportPreviewRow = {
      candidateId: candidate.id,
      externalIdSource: externalId.source,
      externalIdValue: externalId.value,
      isVerified: false,
      label: candidate.label,
      mappedPlatform: candidate.mappedPlatform,
      targetTables,
    };
    externalIdOwners[externalId.source] = row;
    externalIdRows.push(row);
    if (existingPlatformOwner) {
      issueRows.push({
        candidateIds: [existingPlatformOwner.candidateId, candidate.id],
        decision: "stage_external_id_only",
        incomingCandidateId: candidate.id,
        incomingValue: incomingExternalId,
        keptCandidateId: existingPlatformOwner.candidateId,
        keptValue: formatRowExternalId(existingPlatformOwner),
        labels: [existingPlatformOwner.label, candidate.label],
        reason: "duplicate_platform",
        targetKey: candidate.mappedPlatform,
        targetTable: "game_cross_play",
      });
      skippedRows.push({
        candidateId: candidate.id,
        label: candidate.label,
        reason: "duplicate_platform",
        status: candidate.status,
      });
      continue;
    }

    platformOwners[candidate.mappedPlatform] = row;
    gameCrossPlayRows.push(row);
  }

  return {
    externalIdRows,
    gameCrossPlayRows,
    gameExternalIdsPatch,
    issueRows,
    skippedRows,
    writeMode: "preview-only",
  };
}

export function buildIgdbCrossPlayImportSyncPlan(
  gameId: string,
  preview: IgdbCrossPlayImportPreview,
  existingExternalIds: Record<string, string | null | undefined> = {},
  existingPlatforms: CrossPlayPlatform[] = [],
): IgdbCrossPlayImportSyncPlan {
  const mergedExternalIds = normalizeExistingExternalIds(existingExternalIds);
  const existingPlatformSet = new Set(existingPlatforms);
  const blockedRows: IgdbCrossPlaySyncPlanBlockedRow[] = [];
  const blockedCandidateIds = new Set<string>();
  const skippedRows: IgdbCrossPlaySyncPlanBlockedRow[] = [];
  const gameCrossPlayUpserts: IgdbCrossPlayUpsertPayload[] = [];

  for (const row of preview.externalIdRows) {
    const existingValue = mergedExternalIds[row.externalIdSource];
    if (existingValue && existingValue !== row.externalIdValue) {
      blockedCandidateIds.add(row.candidateId);
      blockedRows.push({
        candidateId: row.candidateId,
        label: row.label,
        reason: "conflicting_existing_external_id",
        targetKey: row.externalIdSource,
        targetTable: "games.external_ids",
      });
      continue;
    }

    mergedExternalIds[row.externalIdSource] = row.externalIdValue;
  }

  for (const row of preview.gameCrossPlayRows) {
    if (blockedCandidateIds.has(row.candidateId)) {
      continue;
    }

    if (existingPlatformSet.has(row.mappedPlatform)) {
      blockedRows.push({
        candidateId: row.candidateId,
        label: row.label,
        reason: "duplicate_existing_platform",
        targetKey: row.mappedPlatform,
        targetTable: "game_cross_play",
      });
      continue;
    }

    gameCrossPlayUpserts.push({
      game_id: gameId,
      is_enabled: true,
      is_verified: false,
      metadata: {
        candidate_id: row.candidateId,
        external_id_source: row.externalIdSource,
        external_id_value: row.externalIdValue,
        label: row.label,
        planner: "igdb-cross-play-staged-sync",
        write_mode: "supabase-write-blocked",
      },
      notes:
        "Staged from IGDB cross-play local sync plan; unverified until user/provider evidence.",
      platform: row.mappedPlatform,
      verified_at: null,
      verified_by_user_id: null,
    });
  }

  for (const issue of preview.issueRows) {
    const row: IgdbCrossPlaySyncPlanBlockedRow = {
      candidateId: issue.incomingCandidateId,
      label: issue.labels[1] ?? issue.incomingCandidateId,
      reason: syncPlanReasonForIssue(issue.reason),
      targetKey: issue.targetKey,
      targetTable: issue.targetTable,
    };

    if (issue.reason === "conflicting_external_id") {
      blockedRows.push(row);
    } else {
      skippedRows.push(row);
    }
  }

  for (const skipped of preview.skippedRows) {
    if (
      skipped.reason === "conflicting_external_id" ||
      skipped.reason === "duplicate_external_id" ||
      skipped.reason === "duplicate_platform"
    ) {
      continue;
    }

    skippedRows.push({
      candidateId: skipped.candidateId,
      label: skipped.label,
      reason: skipped.reason,
      targetKey: skipped.candidateId,
      targetTable:
        skipped.reason === "unmapped_platform" ? "game_cross_play" : "games.external_ids",
    });
  }

  const allIssueRows = [...blockedRows, ...skippedRows];

  return {
    blockedRows,
    gameCrossPlayUpserts,
    gameId,
    issueSummary: {
      blockerCount: blockedRows.length,
      conflictCount: allIssueRows.filter((row) => row.reason.includes("conflicting")).length,
      duplicateCount: allIssueRows.filter((row) => row.reason.includes("duplicate")).length,
      externalIdMergeCount: Object.keys(mergedExternalIds).length,
      platformOnlyCount: skippedRows.filter((row) => row.reason === "duplicate_preview_platform")
        .length,
      skippedCount: skippedRows.length,
    },
    mergedExternalIds,
    mode: "supabase-write-blocked",
    skippedRows,
    supabaseWriteBlocked: true,
    writeClaims: {
      hostedSync: false,
      supabaseWrites: false,
    },
  };
}

export function createVerifyIgdbCrossPlayReadinessPlan(): IgdbCrossPlayReadinessPlan {
  return buildIgdbCrossPlayReadinessPlan([
    {
      externalId: "steam:1091500",
      id: "verify-steam",
      igdbPlatformName: "Steam",
      label: "Steam PC Row",
    },
    {
      externalId: "xbox:9p3wxwcxzl50",
      id: "verify-xbox",
      igdbPlatformName: "Xbox Series X|S",
      label: "Xbox Console Row",
    },
    {
      externalId: "steam:999999",
      id: "verify-steam-conflict",
      igdbPlatformName: "Steam",
      label: "Steam Conflicting Row",
    },
    {
      externalId: "steam:1091500",
      id: "verify-steam-duplicate-id",
      igdbPlatformName: "Steam",
      label: "Steam Duplicate ID Row",
    },
    {
      externalId: "igdb:steam-alt-001",
      id: "verify-steam-platform-duplicate",
      igdbPlatformName: "Steam",
      label: "Steam Platform Duplicate Row",
    },
    {
      externalId: null,
      id: "verify-switch",
      igdbPlatformName: "Nintendo Switch",
      label: "Switch Candidate",
    },
    {
      externalId: "arcade:unknown",
      id: "verify-arcade",
      igdbPlatformName: "Arcade Cabinet",
      label: "Unknown Platform",
    },
  ]);
}

function toCandidate(input: IgdbCrossPlayCandidateInput): IgdbCrossPlayCandidate {
  const mappedPlatform = mapIgdbPlatformToCrossPlayPlatform(input.igdbPlatformName);
  const externalId = input.externalId?.trim() || undefined;
  const hasExternalId = externalId ? hasExternalIdValue(externalId) : false;
  const status: IgdbCrossPlayStatus = !mappedPlatform
    ? "blocked"
    : hasExternalId
      ? "ready"
      : "warning";

  return {
    action: buildAction(status, mappedPlatform),
    detail: buildDetail(status, input.igdbPlatformName, mappedPlatform, externalId),
    externalId,
    id: input.id,
    igdbPlatformName: input.igdbPlatformName,
    label: input.label,
    mappedPlatform,
    status,
  };
}

function buildAction(status: IgdbCrossPlayStatus, mappedPlatform: CrossPlayPlatform | null) {
  if (status === "blocked") {
    return "Map this IGDB platform to an OG cross-play platform before import.";
  }
  if (status === "warning") {
    return `Attach a reviewed external id before staging ${mappedPlatform} cross-play rows.`;
  }
  return `Stage ${mappedPlatform} as an import candidate without writing Supabase rows.`;
}

function buildDetail(
  status: IgdbCrossPlayStatus,
  igdbPlatformName: string,
  mappedPlatform: CrossPlayPlatform | null,
  externalId?: string,
) {
  if (status === "blocked") {
    return `${igdbPlatformName} has no local platform mapping.`;
  }
  if (status === "warning") {
    return `${igdbPlatformName} maps to ${mappedPlatform}, but no external id is staged.`;
  }
  return `${igdbPlatformName} maps to ${mappedPlatform} with ${externalId}.`;
}

function normalizePlatformName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseExternalId(
  externalId: string,
  fallbackSource: CrossPlayPlatform,
): { source: string; value: string } {
  const trimmed = externalId.trim();
  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex <= 0) {
    return { source: fallbackSource, value: trimmed };
  }
  const source = trimmed.slice(0, separatorIndex).trim().toLowerCase() || fallbackSource;
  const value = trimmed.slice(separatorIndex + 1).trim();
  return { source, value };
}

function formatExternalId(externalId: { source: string; value: string }) {
  return `${externalId.source}:${externalId.value}`;
}

function formatRowExternalId(row: IgdbCrossPlayImportPreviewRow) {
  return `${row.externalIdSource}:${row.externalIdValue}`;
}

function hasExternalIdValue(externalId: string) {
  const separatorIndex = externalId.indexOf(":");
  if (separatorIndex <= 0) return externalId.trim().length > 0;
  return externalId.slice(separatorIndex + 1).trim().length > 0;
}

function normalizeExistingExternalIds(
  existingExternalIds: Record<string, string | null | undefined>,
) {
  const normalized: Record<string, string> = {};

  for (const [source, value] of Object.entries(existingExternalIds)) {
    const normalizedSource = source.trim().toLowerCase();
    const normalizedValue = value?.trim();
    if (!normalizedSource || !normalizedValue) continue;
    normalized[normalizedSource] = normalizedValue;
  }

  return normalized;
}

function syncPlanReasonForIssue(
  reason: IgdbCrossPlayImportIssueReason,
): IgdbCrossPlaySyncPlanBlockedReason {
  if (reason === "conflicting_external_id") return "conflicting_preview_external_id";
  if (reason === "duplicate_external_id") return "duplicate_preview_external_id";
  return "duplicate_preview_platform";
}
