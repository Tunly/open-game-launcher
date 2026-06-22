import { describe, expect, it } from "vitest";

import type {
  BackupFilePlan,
  RestoreExecutionResult,
  RestorePlanPreview,
} from "../../lib/types/backup";
import {
  collectRestoreAttentionRows,
  collectRestoreResultDetails,
  collectBackupSourceRows,
  formatBackupBytes,
  getBackupActionLabel,
  getRestoreActionLabel,
  getRestoreReviewState,
  getSourceKindLabel,
} from "./BackupRestoreSettings.helpers";

function makeBackupFile(overrides: Partial<BackupFilePlan>): BackupFilePlan {
  return {
    action: "new",
    backupRelativePath: "manifest-a/source/save.dat",
    gameId: "game-a",
    gameTitle: "Game A",
    modifiedAt: "2026-06-10T10:00:00.000Z",
    relativePath: "save.dat",
    sha256: "abc",
    sizeBytes: 1024,
    sourceId: "save-game-a",
    sourceKind: "save",
    sourcePath: "/games/a/save.dat",
    sourceRoot: "/games/a",
    ...overrides,
  };
}

function makeRestorePreview(overrides: Partial<RestorePlanPreview> = {}): RestorePlanPreview {
  return {
    createdAt: "2026-06-10T10:00:00.000Z",
    files: [
      {
        action: "create",
        backupRelativePath: "manifest-a/source/save.dat",
        gameId: "game-a",
        gameTitle: "Game A",
        message: "Ready",
        restorePath: "/games/a/save.dat",
        sha256: "abc",
        sizeBytes: 1024,
        sourceId: "save-game-a",
        sourceKind: "save",
      },
    ],
    manifestId: "manifest-a",
    manifestPath: "/backup/latest-manifest.json",
    summary: {
      blockedFiles: 0,
      bytesToRestore: 1024,
      createFiles: 1,
      missingBackupFiles: 0,
      overwriteFiles: 0,
      skippedFiles: 0,
      totalFiles: 1,
      unchangedFiles: 0,
    },
    targetPath: "/backup",
    ...overrides,
  };
}

describe("formatBackupBytes", () => {
  it("formats byte values compactly", () => {
    expect(formatBackupBytes(0)).toBe("0 B");
    expect(formatBackupBytes(512)).toBe("512 B");
    expect(formatBackupBytes(1536)).toBe("1.5 KB");
    expect(formatBackupBytes(10 * 1024 * 1024)).toBe("10 MB");
  });

  it("handles invalid values as empty storage", () => {
    expect(formatBackupBytes(Number.NaN)).toBe("0 B");
    expect(formatBackupBytes(-4)).toBe("0 B");
  });
});

describe("collectBackupSourceRows", () => {
  it("groups files by source root and tracks action counts", () => {
    const rows = collectBackupSourceRows([
      makeBackupFile({ action: "new", sizeBytes: 100 }),
      makeBackupFile({ action: "changed", relativePath: "profile.dat", sizeBytes: 200 }),
      makeBackupFile({
        action: "unchanged",
        gameId: "game-b",
        gameTitle: "Game B",
        sourceId: "save-game-b",
        sourceRoot: "/games/b",
        sizeBytes: 300,
      }),
      makeBackupFile({
        action: "removed",
        relativePath: "old.dat",
        sizeBytes: 999,
      }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      fileCount: 2,
      label: "Game A",
      path: "/games/a",
      sizeBytes: 300,
    });
    expect(rows[0].actions).toMatchObject({
      changed: 1,
      new: 1,
      removed: 1,
      unchanged: 0,
    });
  });
});

describe("backup labels", () => {
  it("maps native action and source tokens to launcher text", () => {
    expect(getBackupActionLabel("changed")).toBe("Changed");
    expect(getRestoreActionLabel("missing_backup")).toBe("Missing");
    expect(getSourceKindLabel("library_data")).toBe("Library Data");
    expect(getSourceKindLabel("save")).toBe("Save Root");
  });
});

describe("restore review gate", () => {
  it("requires a target and restore preview before restore", () => {
    expect(getRestoreReviewState(null, "")).toMatchObject({
      canRestore: false,
      title: "Target required",
      tone: "blocked",
    });
    expect(getRestoreReviewState(null, "/backup")).toMatchObject({
      canRestore: false,
      title: "Review required",
      tone: "warning",
    });
  });

  it("blocks restore when preview contains blocked or missing payload files", () => {
    expect(
      getRestoreReviewState(
        makeRestorePreview({
          summary: {
            ...makeRestorePreview().summary,
            blockedFiles: 1,
          },
        }),
        "/backup",
      ),
    ).toMatchObject({
      canRestore: false,
      title: "Blocked files",
      tone: "blocked",
    });

    expect(
      getRestoreReviewState(
        makeRestorePreview({
          summary: {
            ...makeRestorePreview().summary,
            missingBackupFiles: 2,
          },
        }),
        "/backup",
      ),
    ).toMatchObject({
      canRestore: false,
      title: "Missing backup payload",
      tone: "blocked",
    });
  });

  it("allows restore after a clean review", () => {
    expect(getRestoreReviewState(makeRestorePreview(), "/backup")).toMatchObject({
      canRestore: true,
      title: "Ready to restore",
      tone: "ready",
    });
  });

  it("blocks stale and no-op restore plans", () => {
    expect(getRestoreReviewState(makeRestorePreview(), "/other-backup")).toMatchObject({
      canRestore: false,
      title: "Review stale",
      tone: "blocked",
    });

    expect(
      getRestoreReviewState(
        makeRestorePreview({
          summary: {
            ...makeRestorePreview().summary,
            createFiles: 0,
            totalFiles: 1,
            unchangedFiles: 1,
          },
        }),
        "/backup",
      ),
    ).toMatchObject({
      canRestore: false,
      title: "Nothing to restore",
      tone: "warning",
    });
  });

  it("allows overwrite plans with an explicit warning state", () => {
    expect(
      getRestoreReviewState(
        makeRestorePreview({
          summary: {
            ...makeRestorePreview().summary,
            createFiles: 0,
            overwriteFiles: 1,
          },
        }),
        "/backup",
      ),
    ).toMatchObject({
      canRestore: true,
      title: "Overwrite review",
      tone: "warning",
    });
  });

  it("surfaces blocked and missing restore rows first", () => {
    const rows = collectRestoreAttentionRows([
      ...makeRestorePreview().files,
      {
        ...makeRestorePreview().files[0],
        action: "missing_backup",
        restorePath: "/games/a/missing.dat",
      },
      {
        ...makeRestorePreview().files[0],
        action: "blocked",
        restorePath: "/etc/passwd",
      },
    ]);

    expect(rows.map((row) => row.action)).toEqual(["blocked", "missing_backup"]);
  });
});

describe("restore result details", () => {
  it("groups restored, safety-copy, skipped and failed paths", () => {
    const result: RestoreExecutionResult = {
      backedUpFiles: ["/games/a/save.dat.safety-copy"],
      failedFiles: ["/games/a/fail.dat"],
      manifestId: "manifest-a",
      message: "Restore completed with warnings.",
      restoredFiles: ["/games/a/save.dat"],
      skippedFiles: ["/games/a/unchanged.dat"],
      success: true,
      summary: makeRestorePreview().summary,
    };

    expect(collectRestoreResultDetails(result)).toMatchObject([
      { count: 1, id: "restored", tone: "success" },
      { count: 1, id: "safety-copies", tone: "warning" },
      { count: 1, id: "skipped", tone: "warning" },
      { count: 1, id: "failed", tone: "danger" },
    ]);
  });
});
