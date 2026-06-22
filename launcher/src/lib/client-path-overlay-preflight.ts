import type { ClientModificationConfig, ClientPathOverlay } from "./types";

export type ClientPathOverlayPreflightStatus = "ready" | "warning" | "blocked" | "empty";
export type ClientPathOverlayPreflightCheckStatus = "pass" | "warning" | "blocked";

export interface ClientPathOverlayPreflightEntry {
  id: string;
  label: string;
  sourcePath: string;
  targetPath: string;
  mode: "readOnly" | "writable" | "disabled";
  status: ClientPathOverlayPreflightStatus;
  checks: Array<{
    label: string;
    status: ClientPathOverlayPreflightCheckStatus;
    detail: string;
  }>;
}

export interface ClientPathOverlayPreflight {
  status: ClientPathOverlayPreflightStatus;
  canApply: boolean;
  message: string;
  enabledCount: number;
  disabledCount: number;
  readyCount: number;
  warningCount: number;
  blockedCount: number;
  readOnlyCount: number;
  writableCount: number;
  entries: ClientPathOverlayPreflightEntry[];
}

function normalizePathKey(path: string): string {
  return path
    .trim()
    .replace(/[\\/]+$/, "")
    .toLowerCase();
}

function trimPath(path: string | null | undefined): string {
  return (path ?? "").trim();
}

function pathRootLike(path: string): boolean {
  const normalized = normalizePathKey(path);
  return normalized === "/" || /^[a-z]:$/.test(normalized);
}

function worstStatus(
  checks: ClientPathOverlayPreflightEntry["checks"],
): ClientPathOverlayPreflightStatus {
  if (checks.some((check) => check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "ready";
}

function buildEntry(
  overlay: ClientPathOverlay,
  duplicateTargetKeys: Set<string>,
): ClientPathOverlayPreflightEntry {
  const sourcePath = trimPath(overlay.sourcePath);
  const targetPath = trimPath(overlay.targetPath);
  const mode = !overlay.enabled ? "disabled" : overlay.readOnly ? "readOnly" : "writable";

  if (!overlay.enabled) {
    return {
      checks: [
        {
          detail: "Overlay is disabled and will not be applied.",
          label: "Enabled",
          status: "warning",
        },
      ],
      id: overlay.id,
      label: overlay.label.trim() || "Unnamed overlay",
      mode,
      sourcePath,
      status: "warning",
      targetPath,
    };
  }

  const targetKey = normalizePathKey(targetPath);
  const sourceKey = normalizePathKey(sourcePath);
  const checks: ClientPathOverlayPreflightEntry["checks"] = [];

  checks.push(
    sourcePath
      ? {
          detail: sourcePath,
          label: "Source path",
          status: pathRootLike(sourcePath) ? "blocked" : "pass",
        }
      : {
          detail: "Source path is required before an overlay can be applied.",
          label: "Source path",
          status: "blocked",
        },
  );
  checks.push(
    targetPath
      ? {
          detail: targetPath,
          label: "Target path",
          status: pathRootLike(targetPath) ? "blocked" : "pass",
        }
      : {
          detail: "Target path is required before an overlay can be applied.",
          label: "Target path",
          status: "blocked",
        },
  );

  if (sourcePath && targetPath && sourceKey === targetKey) {
    checks.push({
      detail: "Source and target resolve to the same path; applying would be a no-op.",
      label: "Path pair",
      status: "blocked",
    });
  }

  if (targetPath && duplicateTargetKeys.has(targetKey)) {
    checks.push({
      detail: "Another enabled overlay targets this same path.",
      label: "Target conflict",
      status: "blocked",
    });
  }

  checks.push(
    overlay.readOnly
      ? {
          detail: "Preflight will treat this overlay as a read-only mount/copy candidate.",
          label: "Write policy",
          status: "pass",
        }
      : {
          detail: "Writable overlays need manual provider/OS review before real application.",
          label: "Write policy",
          status: "warning",
        },
  );

  return {
    checks,
    id: overlay.id,
    label: overlay.label.trim() || "Unnamed overlay",
    mode,
    sourcePath,
    status: worstStatus(checks),
    targetPath,
  };
}

export function buildClientPathOverlayPreflight(
  config: Pick<ClientModificationConfig, "pathOverlays"> | null | undefined,
): ClientPathOverlayPreflight {
  const overlays = config?.pathOverlays ?? [];
  const targetCounts = new Map<string, number>();
  for (const overlay of overlays) {
    if (!overlay.enabled) continue;
    const targetKey = normalizePathKey(overlay.targetPath);
    if (!targetKey) continue;
    targetCounts.set(targetKey, (targetCounts.get(targetKey) ?? 0) + 1);
  }
  const duplicateTargetKeys = new Set(
    Array.from(targetCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([key]) => key),
  );

  const entries = overlays.map((overlay) => buildEntry(overlay, duplicateTargetKeys));
  const enabledEntries = entries.filter((entry) => entry.mode !== "disabled");
  const blockedCount = entries.filter((entry) => entry.status === "blocked").length;
  const warningCount = entries.filter((entry) => entry.status === "warning").length;
  const readyCount = entries.filter((entry) => entry.status === "ready").length;
  const status: ClientPathOverlayPreflightStatus =
    enabledEntries.length === 0
      ? "empty"
      : blockedCount > 0
        ? "blocked"
        : warningCount > 0
          ? "warning"
          : "ready";
  const canApply = status === "ready" || status === "warning";

  return {
    blockedCount,
    canApply,
    disabledCount: entries.filter((entry) => entry.mode === "disabled").length,
    enabledCount: enabledEntries.length,
    entries,
    message:
      status === "empty"
        ? "No enabled path overlays are staged for apply preflight."
        : status === "blocked"
          ? "Path overlay apply preflight found blockers that must be fixed first."
          : status === "warning"
            ? "Path overlay preflight can proceed only after manual review of warnings."
            : "Path overlay preflight is ready for a future provider-approved apply step.",
    readOnlyCount: entries.filter((entry) => entry.mode === "readOnly").length,
    readyCount,
    status,
    warningCount,
    writableCount: entries.filter((entry) => entry.mode === "writable").length,
  };
}
