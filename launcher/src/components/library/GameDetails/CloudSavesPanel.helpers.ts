import type {
  CheckGameSaveConflictsResponse,
  CloudSaveConflictFile,
  Game,
} from "../../../lib/types";
import { listProviderSaveMappingFixtures } from "../../../lib/provider-save-mapping-fixtures";
import { getGameSource } from "../../../lib/formatters";

export type CloudSaveResolutionChoice = "local" | "cloud";
export type CloudSaveResolutionChoices = Record<string, CloudSaveResolutionChoice | undefined>;
export type CloudSaveActionKind = "upload" | "download" | "restore";
export type CloudKeyReadinessState = "checking" | "present" | "missing" | "error" | "unknown";

export interface DivergentConflictFile {
  file: CloudSaveConflictFile;
  key: string;
}

export interface CloudSaveActionTimestamps {
  lastDownloadAt: string | null;
  lastRestoreAt: string | null;
  lastUploadAt: string | null;
}

export interface CloudSavePendingActionCounts {
  review: number;
  restore: number;
  total: number;
  upload: number;
}

export interface CloudSaveMixedResolutionPlan {
  cloudDeleteRelativePaths: string[];
  cloudRestoreRelativePaths: string[];
  hasWork: boolean;
  isComplete: boolean;
  localDeletePaths: string[];
  localUploadRelativePaths: string[];
  totalFiles: number;
  unresolvedCount: number;
  unsupportedFiles: DivergentConflictFile[];
}

export interface CloudSaveReadinessItem {
  label: string;
  ready: boolean;
  value: string;
}

export interface CloudSaveReadinessSummary {
  blockers: string[];
  isReady: boolean;
  items: CloudSaveReadinessItem[];
  label: string;
  readyCount: number;
  totalCount: number;
}

export interface CloudSaveProviderPathSuggestion {
  alreadyTracked: boolean;
  externalId: string | null;
  guard: string;
  id: string;
  path: string;
  pathRuleCount: number;
  provider: string;
  providerLabel: string;
  saveRootShape: string;
  source: "local_save_files" | "fixture_exemplar";
}

export interface CloudSaveProviderPathProvenance {
  appliedAt: string;
  externalId: string | null;
  path: string;
  pathKey: string;
  pathRuleCount: number;
  provider: string;
  saveRootShape: string;
  source: CloudSaveProviderPathSuggestion["source"];
}

export interface ConflictResolutionGuard {
  canRestore: boolean;
  canUpload: boolean;
  cloudCount: number;
  divergentFiles: DivergentConflictFile[];
  hasDivergentFiles: boolean;
  localCount: number;
  restoreBlockReason: string | null;
  totalFiles: number;
  unresolvedCount: number;
  uploadBlockReason: string | null;
}

const ACTION_TIMESTAMP_KEYS: Record<CloudSaveActionKind, keyof CloudSaveActionTimestamps> = {
  download: "lastDownloadAt",
  restore: "lastRestoreAt",
  upload: "lastUploadAt",
};

const ACTION_TIMESTAMP_FALLBACK_KEYS: Record<CloudSaveActionKind, string[]> = {
  download: ["lastDownloadedAt", "lastCloudDownloadAt"],
  restore: ["lastRestoredAt", "lastCloudRestoreAt"],
  upload: ["lastUploadedAt", "lastCloudUploadAt"],
};

export function getConflictBadge(check: CheckGameSaveConflictsResponse | null): {
  className: string;
  label: string;
} {
  if (!check) {
    return { className: "bg-[#ded3c1] text-[#171411]", label: "Conflicts unchecked" };
  }

  if (check.checkedFiles === 0) {
    return { className: "bg-[#ded3c1] text-[#171411]", label: "No metadata" };
  }

  if (check.conflictCount > 0) {
    return {
      className: "bg-[#b7102a] text-white",
      label: `${check.conflictCount} conflict${check.conflictCount === 1 ? "" : "s"}`,
    };
  }

  return {
    className: "bg-[#087d6d] text-white",
    label: "No conflicts",
  };
}

export function getConflictFileChoiceKey(file: CloudSaveConflictFile, index: number): string {
  return `${file.relativePath || file.path || "save-file"}::${file.status}::${index}`;
}

export function getDivergentConflictFiles(
  check: CheckGameSaveConflictsResponse | null,
): DivergentConflictFile[] {
  if (!check) return [];

  return check.files
    .map((file, index) => ({ file, key: getConflictFileChoiceKey(file, index) }))
    .filter(({ file }) => file.status !== "matching");
}

export function getCloudSavePendingActionCounts(
  check: CheckGameSaveConflictsResponse | null,
): CloudSavePendingActionCounts {
  const counts: CloudSavePendingActionCounts = {
    restore: 0,
    review: 0,
    total: 0,
    upload: 0,
  };

  for (const { file } of getDivergentConflictFiles(check)) {
    counts.total += 1;
    if (file.status === "local_newer" || file.status === "cloud_missing") {
      counts.upload += 1;
    } else if (file.status === "cloud_newer" || file.status === "local_missing") {
      counts.restore += 1;
    } else {
      counts.review += 1;
    }
  }

  return counts;
}

export function getCloudSaveMixedResolutionPlan(
  check: CheckGameSaveConflictsResponse | null,
  choices: CloudSaveResolutionChoices,
): CloudSaveMixedResolutionPlan {
  const divergentFiles = getDivergentConflictFiles(check);
  const plan: CloudSaveMixedResolutionPlan = {
    cloudDeleteRelativePaths: [],
    cloudRestoreRelativePaths: [],
    hasWork: false,
    isComplete: false,
    localDeletePaths: [],
    localUploadRelativePaths: [],
    totalFiles: divergentFiles.length,
    unresolvedCount: 0,
    unsupportedFiles: [],
  };

  for (const divergent of divergentFiles) {
    const choice = choices[divergent.key];
    if (!choice) {
      plan.unresolvedCount += 1;
      continue;
    }

    const { file } = divergent;
    const relativePath = normalizeRelativePath(file.relativePath);
    const cloudRelativePath = getCloudActionRelativePath(file);

    if (choice === "local") {
      if (file.status === "local_missing") {
        if (cloudRelativePath !== null) {
          plan.cloudDeleteRelativePaths.push(cloudRelativePath);
        }
      } else {
        plan.localUploadRelativePaths.push(relativePath ?? "");
      }
      continue;
    }

    if (file.status === "cloud_missing") {
      if (file.path.trim().length === 0) {
        plan.unsupportedFiles.push(divergent);
      } else {
        plan.localDeletePaths.push(file.path);
      }
    } else if (cloudRelativePath === null) {
      plan.unsupportedFiles.push(divergent);
    } else {
      plan.cloudRestoreRelativePaths.push(cloudRelativePath);
    }
  }

  plan.cloudDeleteRelativePaths = uniqueStrings(plan.cloudDeleteRelativePaths);
  plan.cloudRestoreRelativePaths = uniqueStrings(plan.cloudRestoreRelativePaths);
  plan.localDeletePaths = uniqueStrings(plan.localDeletePaths);
  plan.localUploadRelativePaths = uniqueStrings(plan.localUploadRelativePaths);
  plan.hasWork =
    plan.cloudDeleteRelativePaths.length > 0 ||
    plan.cloudRestoreRelativePaths.length > 0 ||
    plan.localDeletePaths.length > 0 ||
    plan.localUploadRelativePaths.length > 0;
  plan.isComplete =
    plan.totalFiles > 0 && plan.unresolvedCount === 0 && plan.unsupportedFiles.length === 0;

  return plan;
}

export function getConflictCheckSummary(check: CheckGameSaveConflictsResponse | null): string {
  if (!check) return "Not checked";
  if (check.checkedFiles === 0) return "No cloud metadata found";

  const parts = [
    formatCount(check.checkedFiles, "file", "files"),
    formatCount(check.conflictCount, "conflict", "conflicts"),
    `${check.matchingCount} match${check.matchingCount === 1 ? "" : "es"}`,
  ];

  if (check.missingLocalCount > 0) {
    parts.push(`${check.missingLocalCount} local missing`);
  }
  if (check.missingCloudCount > 0) {
    parts.push(`${check.missingCloudCount} cloud missing`);
  }

  return parts.join(" / ");
}

export function getResolutionDecisionLabel(
  check: CheckGameSaveConflictsResponse | null,
  guard: ConflictResolutionGuard,
): string {
  if (!check) return "Awaiting conflict check";
  if (!guard.hasDivergentFiles) return "No decision needed";
  if (guard.canUpload) return `Local wins selected (${guard.localCount}/${guard.totalFiles})`;
  if (guard.canRestore) return `Cloud wins selected (${guard.cloudCount}/${guard.totalFiles})`;
  if (guard.unresolvedCount === guard.totalFiles) {
    return `No side selected (${guard.totalFiles} open)`;
  }

  return `Mixed: ${guard.localCount} local / ${guard.cloudCount} cloud / ${guard.unresolvedCount} open`;
}

export function getCloudSaveActionTimestamps(
  metadata: Record<string, unknown> | null | undefined,
): CloudSaveActionTimestamps {
  const syncStatus = readRecord(metadata?.syncStatus);

  return {
    lastDownloadAt: readActionTimestamp(metadata, syncStatus, "download"),
    lastRestoreAt: readActionTimestamp(metadata, syncStatus, "restore"),
    lastUploadAt: readActionTimestamp(metadata, syncStatus, "upload"),
  };
}

export function withCloudSaveActionTimestamp(
  metadata: Record<string, unknown> | null | undefined,
  kind: CloudSaveActionKind,
  timestamp: string,
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) };
  const syncStatus = readRecord(base.syncStatus) ?? {};

  return {
    ...base,
    syncStatus: {
      ...syncStatus,
      [ACTION_TIMESTAMP_KEYS[kind]]: timestamp,
    },
  };
}

export function withCloudSavePaths(
  metadata: Record<string, unknown> | null | undefined,
  savePaths: string[],
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    savePaths,
  };
}

export function getCloudSaveProviderPathSuggestions(
  game: Game,
  trackedPaths: string[],
): CloudSaveProviderPathSuggestion[] {
  const source = getGameSource(game).trim().toLowerCase();
  const fixture = listProviderSaveMappingFixtures().find(
    (candidate) =>
      candidate.provider === source ||
      candidate.providerLabel.toLowerCase() === source ||
      candidate.providerSource.toLowerCase().includes(`${source} `),
  );
  if (!fixture) return [];

  const localRoot = commonParentPath((game.saveFiles ?? []).map((file) => file.path));
  const path = localRoot ?? fixture.saveRoot.exemplarRoot;
  const trackedPathKeys = new Set(trackedPaths.map(normalizePathKey));

  return [
    {
      alreadyTracked: trackedPathKeys.has(normalizePathKey(path)),
      externalId: game.externalId ?? fixture.canonicalExternalId,
      guard:
        "Local provider save-root suggestion only; no provider API, cloud transfer, live Supabase/keychain E2E, or migration runs.",
      id: `provider-save-path-${fixture.provider}-${fixture.saveRoot.shape}`,
      path,
      pathRuleCount: fixture.mappingRules.length,
      provider: fixture.provider,
      providerLabel: fixture.providerLabel,
      saveRootShape: fixture.saveRoot.shape,
      source: localRoot ? "local_save_files" : "fixture_exemplar",
    },
  ];
}

export function withCloudSaveProviderPathProvenance(
  metadata: Record<string, unknown> | null | undefined,
  suggestion: CloudSaveProviderPathSuggestion,
  appliedAt: string,
): Record<string, unknown> {
  const base = { ...(metadata ?? {}) };
  const current = Array.isArray(base.providerSavePathProvenance)
    ? base.providerSavePathProvenance.filter(isProviderPathProvenance)
    : [];
  const next: CloudSaveProviderPathProvenance = {
    appliedAt,
    externalId: suggestion.externalId,
    path: suggestion.path,
    pathKey: normalizePathKey(suggestion.path),
    pathRuleCount: suggestion.pathRuleCount,
    provider: suggestion.provider,
    saveRootShape: suggestion.saveRootShape,
    source: suggestion.source,
  };

  return {
    ...base,
    providerSavePathProvenance: [
      next,
      ...current.filter((item) => normalizePathKey(item.path) !== normalizePathKey(next.path)),
    ],
  };
}

export function getCloudSaveReadinessSummary(input: {
  cloudKeyState: CloudKeyReadinessState;
  hasSavePaths: boolean;
  isConfigured: boolean;
  isSignedIn: boolean;
}): CloudSaveReadinessSummary {
  const items: CloudSaveReadinessItem[] = [
    {
      label: "Settings",
      ready: input.isConfigured,
      value: input.isConfigured ? "Configured" : "Missing env",
    },
    {
      label: "Session",
      ready: input.isSignedIn,
      value: input.isSignedIn ? "Signed in" : "Signed out",
    },
    {
      label: "Encryption",
      ready: input.cloudKeyState === "present",
      value: getCloudKeyStateLabel(input.cloudKeyState),
    },
    {
      label: "Save Paths",
      ready: input.hasSavePaths,
      value: input.hasSavePaths ? "Tracked" : "No paths",
    },
  ];
  const blockers = items.filter((item) => !item.ready).map((item) => item.label);
  const readyCount = items.length - blockers.length;

  return {
    blockers,
    isReady: blockers.length === 0,
    items,
    label: blockers.length === 0 ? "Ready" : `${blockers.length} setup`,
    readyCount,
    totalCount: items.length,
  };
}

export function getConflictResolutionGuard(
  check: CheckGameSaveConflictsResponse | null,
  choices: CloudSaveResolutionChoices,
): ConflictResolutionGuard {
  const divergentFiles = getDivergentConflictFiles(check);
  const totalFiles = divergentFiles.length;
  const localCount = divergentFiles.filter(({ key }) => choices[key] === "local").length;
  const cloudCount = divergentFiles.filter(({ key }) => choices[key] === "cloud").length;
  const unresolvedCount = totalFiles - localCount - cloudCount;
  const hasDivergentFiles = totalFiles > 0;
  const canUpload = !hasDivergentFiles || localCount === totalFiles;
  const canRestore = !hasDivergentFiles || cloudCount === totalFiles;

  return {
    canRestore,
    canUpload,
    cloudCount,
    divergentFiles,
    hasDivergentFiles,
    localCount,
    restoreBlockReason: canRestore
      ? null
      : getResolutionBlockReason("restore", totalFiles, unresolvedCount, localCount),
    totalFiles,
    unresolvedCount,
    uploadBlockReason: canUpload
      ? null
      : getResolutionBlockReason("upload", totalFiles, unresolvedCount, cloudCount),
  };
}

function getResolutionBlockReason(
  action: "upload" | "restore",
  totalFiles: number,
  unresolvedCount: number,
  oppositeCount: number,
): string {
  const required = action === "upload" ? "Local wins" : "Cloud wins";
  const verb = action === "upload" ? "uploading" : "restoring";

  if (unresolvedCount > 0) {
    return `Choose ${required} for all ${totalFiles} changed file${
      totalFiles === 1 ? "" : "s"
    } before ${verb}.`;
  }

  return `${required} must be selected for every changed file before ${verb}; ${oppositeCount} file${
    oppositeCount === 1 ? " is" : "s are"
  } set to the other side.`;
}

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function normalizeRelativePath(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.length > 0 ? normalized : null;
}

function getCloudActionRelativePath(file: CloudSaveConflictFile): string | null {
  const normalized = normalizeRelativePath(file.relativePath);
  if (normalized !== null) return normalized;

  const hasCloudObject =
    file.cloudSha256 !== null || file.cloudSizeBytes !== null || file.cloudCreatedAt !== null;
  return hasCloudObject ? "" : null;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function commonParentPath(paths: string[]): string | null {
  const usablePaths = paths.filter((path) => path.trim().length > 0);
  if (usablePaths.length === 0) return null;

  const parentSegments = usablePaths
    .map(parentPath)
    .map(splitPath)
    .filter((segments) => segments.length > 0);
  if (parentSegments.length === 0) return null;

  const [first, ...rest] = parentSegments;
  const common: string[] = [];
  for (const [index, segment] of first.entries()) {
    if (rest.every((candidate) => candidate[index]?.toLowerCase() === segment.toLowerCase())) {
      common.push(segment);
    } else {
      break;
    }
  }

  return common.length > 0 ? common.join(pathSeparatorFor(usablePaths[0])) : null;
}

function parentPath(path: string): string {
  return splitPath(path).slice(0, -1).join(pathSeparatorFor(path));
}

function splitPath(path: string): string[] {
  return path
    .trim()
    .replace(/[\\/]+/g, "/")
    .replace(/\/$/, "")
    .split("/")
    .filter(Boolean);
}

function pathSeparatorFor(path: string): "\\" | "/" {
  return path.includes("\\") || /^[A-Za-z]:/.test(path) ? "\\" : "/";
}

function normalizePathKey(path: string): string {
  return splitPath(path).join("/").toLowerCase();
}

function isProviderPathProvenance(value: unknown): value is CloudSaveProviderPathProvenance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.appliedAt === "string" &&
    typeof record.path === "string" &&
    typeof record.pathKey === "string" &&
    typeof record.pathRuleCount === "number" &&
    typeof record.provider === "string" &&
    typeof record.saveRootShape === "string" &&
    (record.source === "local_save_files" || record.source === "fixture_exemplar")
  );
}

function getCloudKeyStateLabel(state: CloudKeyReadinessState): string {
  if (state === "present") return "Key ready";
  if (state === "missing") return "Key missing";
  if (state === "checking") return "Checking";
  if (state === "error") return "Check failed";
  return "Unknown";
}

function readActionTimestamp(
  metadata: Record<string, unknown> | null | undefined,
  syncStatus: Record<string, unknown> | null,
  kind: CloudSaveActionKind,
): string | null {
  const primaryKey = ACTION_TIMESTAMP_KEYS[kind];
  return (
    readString(syncStatus, primaryKey) ??
    readString(metadata, primaryKey) ??
    readString(metadata, ...ACTION_TIMESTAMP_FALLBACK_KEYS[kind])
  );
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown> | null | undefined,
  ...keys: string[]
): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return null;
}
