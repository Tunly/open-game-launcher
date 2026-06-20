import { describe, expect, it } from "vitest";

import type {
  CheckGameSaveConflictsResponse,
  CloudSaveConflictFile,
  CloudSaveConflictStatus,
  Game,
} from "../../../lib/types";
import {
  getCloudSaveActionTimestamps,
  getCloudSaveMixedResolutionPlan,
  getCloudSavePendingActionCounts,
  getCloudSaveProviderPathSuggestions,
  getCloudSaveReadinessSummary,
  getConflictBadge,
  getConflictCheckSummary,
  getConflictFileChoiceKey,
  getConflictResolutionGuard,
  getResolutionDecisionLabel,
  type CloudSaveResolutionChoices,
  withCloudSaveActionTimestamp,
  withCloudSaveProviderPathProvenance,
} from "./CloudSavesPanel.helpers";

describe("getConflictBadge", () => {
  it("shows the unchecked state before a scan runs", () => {
    expect(getConflictBadge(null)).toEqual({
      className: "bg-[#ded3c1] text-[#171411]",
      label: "Conflicts unchecked",
    });
  });

  it("uses the red manga badge when conflicts are present", () => {
    expect(getConflictBadge(makeResponse({ checkedFiles: 2, conflictCount: 2 })).label).toBe(
      "2 conflicts",
    );
  });

  it("distinguishes no metadata from a clean scan", () => {
    expect(getConflictBadge(makeResponse({ checkedFiles: 0, conflictCount: 0 })).label).toBe(
      "No metadata",
    );
    expect(getConflictBadge(makeResponse({ checkedFiles: 2, conflictCount: 0 })).label).toBe(
      "No conflicts",
    );
  });
});

describe("getConflictResolutionGuard", () => {
  it("does not block actions when no divergent files are known", () => {
    const guard = getConflictResolutionGuard(
      makeResponse({
        checkedFiles: 1,
        conflictCount: 0,
        files: [makeFile("slot-1.sav", "matching")],
      }),
      {},
    );

    expect(guard.hasDivergentFiles).toBe(false);
    expect(guard.canUpload).toBe(true);
    expect(guard.canRestore).toBe(true);
  });

  it("blocks upload and restore until every divergent file has a choice", () => {
    const response = makeResponse({
      checkedFiles: 2,
      conflictCount: 2,
      files: [makeFile("slot-1.sav", "different"), makeFile("slot-2.sav", "cloud_newer")],
    });
    const firstKey = getConflictFileChoiceKey(response.files[0], 0);
    const guard = getConflictResolutionGuard(response, { [firstKey]: "local" });

    expect(guard.hasDivergentFiles).toBe(true);
    expect(guard.localCount).toBe(1);
    expect(guard.unresolvedCount).toBe(1);
    expect(guard.canUpload).toBe(false);
    expect(guard.canRestore).toBe(false);
    expect(guard.uploadBlockReason).toContain("Local wins");
    expect(guard.restoreBlockReason).toContain("Cloud wins");
  });

  it("unlocks upload only when all divergent files confirm local wins", () => {
    const response = makeResponse({
      checkedFiles: 2,
      conflictCount: 2,
      files: [makeFile("slot-1.sav", "local_newer"), makeFile("slot-2.sav", "cloud_missing")],
    });
    const choices: CloudSaveResolutionChoices = Object.fromEntries(
      response.files.map((file, index) => [getConflictFileChoiceKey(file, index), "local"]),
    );
    const guard = getConflictResolutionGuard(response, choices);

    expect(guard.canUpload).toBe(true);
    expect(guard.canRestore).toBe(false);
    expect(guard.uploadBlockReason).toBeNull();
  });

  it("unlocks restore only when all divergent files confirm cloud wins", () => {
    const response = makeResponse({
      checkedFiles: 2,
      conflictCount: 2,
      files: [makeFile("slot-1.sav", "cloud_newer"), makeFile("slot-2.sav", "local_missing")],
    });
    const choices: CloudSaveResolutionChoices = Object.fromEntries(
      response.files.map((file, index) => [getConflictFileChoiceKey(file, index), "cloud"]),
    );
    const guard = getConflictResolutionGuard(response, choices);

    expect(guard.canUpload).toBe(false);
    expect(guard.canRestore).toBe(true);
    expect(guard.restoreBlockReason).toBeNull();
  });
});

describe("sync status detail helpers", () => {
  it("builds a mixed native resolution plan from per-file choices", () => {
    const response = makeResponse({
      checkedFiles: 4,
      conflictCount: 4,
      files: [
        makeFile("slot-local.sav", "different"),
        makeFile("slot-cloud.sav", "cloud_newer"),
        makeFile("remote-only.sav", "local_missing"),
        makeFile("local-only.sav", "cloud_missing"),
      ],
    });
    const choices: CloudSaveResolutionChoices = {
      [getConflictFileChoiceKey(response.files[0], 0)]: "local",
      [getConflictFileChoiceKey(response.files[1], 1)]: "cloud",
      [getConflictFileChoiceKey(response.files[2], 2)]: "local",
      [getConflictFileChoiceKey(response.files[3], 3)]: "cloud",
    };

    expect(getCloudSaveMixedResolutionPlan(response, choices)).toMatchObject({
      cloudDeleteRelativePaths: ["remote-only.sav"],
      cloudRestoreRelativePaths: ["slot-cloud.sav"],
      hasWork: true,
      isComplete: true,
      localDeletePaths: ["/saves/local-only.sav"],
      localUploadRelativePaths: ["slot-local.sav"],
      totalFiles: 4,
      unresolvedCount: 0,
      unsupportedFiles: [],
    });
  });

  it("keeps mixed plans locked until all divergent files have supported choices", () => {
    const response = makeResponse({
      checkedFiles: 2,
      conflictCount: 2,
      files: [
        makeFile("slot-1.sav", "different"),
        {
          ...makeFile("", "local_missing"),
          cloudCreatedAt: null,
          cloudSha256: null,
          cloudSizeBytes: null,
        },
      ],
    });
    const choices: CloudSaveResolutionChoices = {
      [getConflictFileChoiceKey(response.files[0], 0)]: "cloud",
      [getConflictFileChoiceKey(response.files[1], 1)]: "cloud",
    };
    const plan = getCloudSaveMixedResolutionPlan(response, choices);

    expect(plan.isComplete).toBe(false);
    expect(plan.unresolvedCount).toBe(0);
    expect(plan.unsupportedFiles).toHaveLength(1);
  });

  it("classifies pending actions from conflict statuses", () => {
    const response = makeResponse({
      checkedFiles: 5,
      conflictCount: 5,
      files: [
        makeFile("local-newer.sav", "local_newer"),
        makeFile("cloud-missing.sav", "cloud_missing"),
        makeFile("cloud-newer.sav", "cloud_newer"),
        makeFile("local-missing.sav", "local_missing"),
        makeFile("different.sav", "different"),
      ],
    });

    expect(getCloudSavePendingActionCounts(response)).toEqual({
      restore: 2,
      review: 1,
      total: 5,
      upload: 2,
    });
  });

  it("summarizes conflict checks with missing-side counts", () => {
    expect(getConflictCheckSummary(null)).toBe("Not checked");
    expect(getConflictCheckSummary(makeResponse({ checkedFiles: 0, conflictCount: 0 }))).toBe(
      "No cloud metadata found",
    );
    expect(
      getConflictCheckSummary({
        ...makeResponse({ checkedFiles: 4, conflictCount: 2 }),
        matchingCount: 2,
        missingLocalCount: 1,
        missingCloudCount: 1,
      }),
    ).toBe("4 files / 2 conflicts / 2 matches / 1 local missing / 1 cloud missing");
  });

  it("reports the selected local/cloud decision", () => {
    const response = makeResponse({
      checkedFiles: 2,
      conflictCount: 2,
      files: [makeFile("slot-1.sav", "local_newer"), makeFile("slot-2.sav", "cloud_missing")],
    });
    const choices: CloudSaveResolutionChoices = Object.fromEntries(
      response.files.map((file, index) => [getConflictFileChoiceKey(file, index), "local"]),
    );
    const guard = getConflictResolutionGuard(response, choices);

    expect(getResolutionDecisionLabel(response, guard)).toBe("Local wins selected (2/2)");
  });

  it("preserves metadata while writing and reading action timestamps", () => {
    const metadata = withCloudSaveActionTimestamp(
      {
        savePaths: ["/saves"],
        syncStatus: {
          lastDownloadAt: "2026-06-10T08:30:00.000Z",
        },
      },
      "upload",
      "2026-06-10T09:00:00.000Z",
    );

    expect(metadata.savePaths).toEqual(["/saves"]);
    expect(getCloudSaveActionTimestamps(metadata)).toEqual({
      lastDownloadAt: "2026-06-10T08:30:00.000Z",
      lastRestoreAt: null,
      lastUploadAt: "2026-06-10T09:00:00.000Z",
    });
  });

  it("uses legacy top-level timestamp metadata when nested status is absent", () => {
    expect(
      getCloudSaveActionTimestamps({
        lastCloudRestoreAt: "2026-06-10T07:00:00.000Z",
        lastUploadedAt: "2026-06-10T06:00:00.000Z",
      }),
    ).toMatchObject({
      lastRestoreAt: "2026-06-10T07:00:00.000Z",
      lastUploadAt: "2026-06-10T06:00:00.000Z",
    });
  });

  it("summarizes encryption and settings readiness", () => {
    expect(
      getCloudSaveReadinessSummary({
        cloudKeyState: "present",
        hasSavePaths: true,
        isConfigured: true,
        isSignedIn: true,
      }),
    ).toMatchObject({
      blockers: [],
      isReady: true,
      label: "Ready",
      readyCount: 4,
      totalCount: 4,
    });

    expect(
      getCloudSaveReadinessSummary({
        cloudKeyState: "missing",
        hasSavePaths: false,
        isConfigured: true,
        isSignedIn: true,
      }).blockers,
    ).toEqual(["Encryption", "Save Paths"]);
  });
});

describe("provider save path fixture helpers", () => {
  it("suggests the local parent save root when save files are known", () => {
    const [suggestion] = getCloudSaveProviderPathSuggestions(
      makeGame({
        externalId: "110011",
        launcher: "steam",
        saveFiles: [
          {
            id: "profile",
            path: "C:\\Users\\Player\\Saved Games\\Mech Arcade\\profile.sav",
            sizeBytes: 1024,
          },
          {
            id: "settings",
            path: "C:\\Users\\Player\\Saved Games\\Mech Arcade\\settings.json",
            sizeBytes: 512,
          },
        ],
      }),
      [],
    );

    expect(suggestion).toMatchObject({
      alreadyTracked: false,
      externalId: "110011",
      path: "C:\\Users\\Player\\Saved Games\\Mech Arcade",
      pathRuleCount: 2,
      provider: "steam",
      providerLabel: "Steam",
      saveRootShape: "steam_userdata_remote",
      source: "local_save_files",
    });
    expect(suggestion.guard).toContain("no provider API");
  });

  it("falls back to the fixture exemplar when local save files are absent", () => {
    const [suggestion] = getCloudSaveProviderPathSuggestions(
      makeGame({
        externalId: "mech-arcade-epic",
        launcher: "epic",
        saveFiles: [],
      }),
      [],
    );

    expect(suggestion).toMatchObject({
      externalId: "mech-arcade-epic",
      path: "C:\\Users\\Player\\AppData\\Local\\MechArcade",
      provider: "epic",
      saveRootShape: "epic_localappdata_saved",
      source: "fixture_exemplar",
    });
  });

  it("marks fixture suggestions already tracked with normalized path matching", () => {
    const [suggestion] = getCloudSaveProviderPathSuggestions(
      makeGame({
        launcher: "steam",
        saveFiles: [
          {
            id: "profile",
            path: "C:\\Users\\Player\\Saved Games\\Mech Arcade\\profile.sav",
            sizeBytes: 1024,
          },
        ],
      }),
      ["c:/users/player/saved games/mech arcade"],
    );

    expect(suggestion.alreadyTracked).toBe(true);
  });

  it("keeps existing cloud metadata while writing provider path provenance", () => {
    const [first] = getCloudSaveProviderPathSuggestions(
      makeGame({
        launcher: "gog",
        saveFiles: [
          {
            id: "profile",
            path: "C:\\Users\\Player\\Documents\\GOG Galaxy\\Mech Arcade\\profile.sav",
            sizeBytes: 1024,
          },
        ],
      }),
      [],
    );
    const [second] = getCloudSaveProviderPathSuggestions(
      makeGame({
        launcher: "gog",
        saveFiles: [
          {
            id: "settings",
            path: "c:/users/player/documents/gog galaxy/mech arcade/settings.json",
            sizeBytes: 512,
          },
        ],
      }),
      [],
    );

    const initial = {
      savePaths: ["C:\\old\\saves"],
      syncStatus: { lastUploadAt: "2026-06-10T09:00:00.000Z" },
    };
    const once = withCloudSaveProviderPathProvenance(initial, first, "2026-06-16T10:00:00.000Z");
    const twice = withCloudSaveProviderPathProvenance(once, second, "2026-06-16T10:05:00.000Z");

    expect(twice.savePaths).toEqual(["C:\\old\\saves"]);
    expect(twice.syncStatus).toEqual({ lastUploadAt: "2026-06-10T09:00:00.000Z" });
    expect(twice.providerSavePathProvenance).toEqual([
      expect.objectContaining({
        appliedAt: "2026-06-16T10:05:00.000Z",
        pathKey: "c:/users/player/documents/gog galaxy/mech arcade",
        pathRuleCount: 2,
        provider: "gog",
        saveRootShape: "gog_documents_game_folder",
      }),
    ]);
  });

  it("does not suggest Steam defaults for unknown or manual providers", () => {
    expect(
      getCloudSaveProviderPathSuggestions(
        makeGame({ id: "steam-akira", launcher: undefined }),
        [],
      ).at(0)?.provider,
    ).toBe("steam");
    expect(getCloudSaveProviderPathSuggestions(makeGame({ launcher: undefined }), [])).toEqual([]);
  });
});

function makeResponse(
  overrides: Pick<CheckGameSaveConflictsResponse, "checkedFiles" | "conflictCount"> & {
    files?: CloudSaveConflictFile[];
  },
): CheckGameSaveConflictsResponse {
  return {
    gameId: "game-1",
    success: overrides.conflictCount === 0,
    checkedFiles: overrides.checkedFiles,
    conflictCount: overrides.conflictCount,
    matchingCount: overrides.checkedFiles - overrides.conflictCount,
    missingLocalCount: 0,
    missingCloudCount: 0,
    files: overrides.files ?? [],
    message: "Cloud save check complete.",
  };
}

function makeFile(relativePath: string, status: CloudSaveConflictStatus): CloudSaveConflictFile {
  return {
    path: `/saves/${relativePath}`,
    relativePath,
    status,
    localSizeBytes: status === "local_missing" ? null : 512,
    cloudSizeBytes: status === "cloud_missing" ? null : 1024,
    localModifiedAt: null,
    cloudCreatedAt: null,
    localSha256: status === "local_missing" ? null : "local-sha",
    cloudSha256: status === "cloud_missing" ? null : "cloud-sha",
    message: `${status} save file`,
  };
}

function makeGame(overrides: Partial<Game>): Game {
  return {
    description: "Fixture helper game",
    id: "mech-arcade",
    platform: "windows",
    status: "installed",
    title: "Mech Arcade",
    version: "1.0.0",
    ...overrides,
  };
}
