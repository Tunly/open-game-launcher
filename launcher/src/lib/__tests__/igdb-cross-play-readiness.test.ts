import { describe, expect, it } from "vitest";

import {
  buildIgdbCrossPlayImportSyncPlan,
  buildIgdbCrossPlayReadinessPlan,
  createVerifyIgdbCrossPlayReadinessPlan,
  mapIgdbPlatformToCrossPlayPlatform,
  normalizeIgdbExternalIdCandidates,
} from "../igdb-cross-play-readiness";

describe("igdb cross-play readiness", () => {
  it("maps IGDB-shaped platform names to existing cross-play platforms", () => {
    expect(mapIgdbPlatformToCrossPlayPlatform("PC (Microsoft Windows)")).toBe("windows");
    expect(mapIgdbPlatformToCrossPlayPlatform("Xbox Series X|S")).toBe("xbox");
    expect(mapIgdbPlatformToCrossPlayPlatform("PlayStation 5")).toBe("playstation");
    expect(mapIgdbPlatformToCrossPlayPlatform("Nintendo Switch")).toBe("switch");
    expect(mapIgdbPlatformToCrossPlayPlatform("Battle.net")).toBe("battlenet");
    expect(mapIgdbPlatformToCrossPlayPlatform("Arcade Cabinet")).toBeNull();
  });

  it("normalizes external id candidates without keeping blank or duplicate rows", () => {
    expect(
      normalizeIgdbExternalIdCandidates([
        { source: " Steam ", value: " 1091500 " },
        { source: "steam", value: "1091500" },
        { source: "igdb", value: "" },
        { source: "", value: "missing-source" },
        { source: "xbox", value: "9p3wxwcxzl50" },
      ]),
    ).toEqual([
      { source: "steam", value: "1091500" },
      { source: "xbox", value: "9p3wxwcxzl50" },
    ]);
  });

  it("keeps IGDB import verification local without API, Supabase, telemetry, or hosted claims", () => {
    const plan = createVerifyIgdbCrossPlayReadinessPlan();

    expect(plan.statusLabel).toBe("Local only");
    expect(plan.readyCount).toBe(5);
    expect(plan.stageableCount).toBe(2);
    expect(plan.issueCount).toBe(3);
    expect(plan.warningCount).toBe(1);
    expect(plan.blockedCount).toBe(1);
    expect(plan.guards).toContain("No IGDB API access");
    expect(plan.guards).toContain("No Supabase writes");
    expect(plan.guards).toContain("No provider telemetry");
    expect(plan.guards).toContain("No hosted sync");
    expect(plan.guards).toContain("No live cross-play verification");
    expect(plan.guards).toContain("Preview rows only");
    expect(plan.guardCopy).toContain("does not call IGDB");
    expect(plan.importPreview.writeMode).toBe("preview-only");
    expect(plan.syncPlan.mode).toBe("supabase-write-blocked");
    expect(plan.syncPlan.supabaseWriteBlocked).toBe(true);
    expect(plan.syncPlan.writeClaims).toEqual({ hostedSync: false, supabaseWrites: false });
    expect(plan.importPreview.gameCrossPlayRows).toHaveLength(2);
    expect(plan.importPreview.externalIdRows).toHaveLength(3);
    expect(plan.importPreview.issueRows).toEqual([
      expect.objectContaining({
        decision: "skip_incoming",
        incomingValue: "steam:999999",
        keptValue: "steam:1091500",
        labels: ["Steam PC Row", "Steam Conflicting Row"],
        reason: "conflicting_external_id",
        targetKey: "steam",
        targetTable: "games.external_ids",
      }),
      expect.objectContaining({
        decision: "dedupe_incoming",
        incomingValue: "steam:1091500",
        keptValue: "steam:1091500",
        labels: ["Steam PC Row", "Steam Duplicate ID Row"],
        reason: "duplicate_external_id",
        targetKey: "steam",
        targetTable: "games.external_ids",
      }),
      expect.objectContaining({
        decision: "stage_external_id_only",
        incomingValue: "igdb:steam-alt-001",
        keptValue: "steam:1091500",
        labels: ["Steam PC Row", "Steam Platform Duplicate Row"],
        reason: "duplicate_platform",
        targetKey: "steam",
        targetTable: "game_cross_play",
      }),
    ]);
    expect(plan.importPreview.gameExternalIdsPatch).toEqual({
      igdb: "steam-alt-001",
      steam: "1091500",
      xbox: "9p3wxwcxzl50",
    });
    expect(plan.importPreview.gameCrossPlayRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalIdSource: "steam",
          externalIdValue: "1091500",
          isVerified: false,
          mappedPlatform: "steam",
          targetTables: ["game_cross_play", "games.external_ids"],
        }),
      ]),
    );
    expect(plan.importPreview.skippedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Steam Conflicting Row",
          reason: "conflicting_external_id",
        }),
        expect.objectContaining({
          label: "Steam Duplicate ID Row",
          reason: "duplicate_external_id",
        }),
        expect.objectContaining({
          label: "Steam Platform Duplicate Row",
          reason: "duplicate_platform",
        }),
        expect.objectContaining({ label: "Switch Candidate", reason: "missing_external_id" }),
        expect.objectContaining({ label: "Unknown Platform", reason: "unmapped_platform" }),
      ]),
    );
  });

  it("builds clean no-write sync payloads from staged preview rows", () => {
    const readinessPlan = buildIgdbCrossPlayReadinessPlan([
      {
        externalId: "steam:1091500",
        id: "steam-primary",
        igdbPlatformName: "Steam",
        label: "Steam Primary",
      },
      {
        externalId: "xbox:9p3wxwcxzl50",
        id: "xbox-primary",
        igdbPlatformName: "Xbox Series X|S",
        label: "Xbox Primary",
      },
    ]);
    const syncPlan = buildIgdbCrossPlayImportSyncPlan("game-123", readinessPlan.importPreview);

    expect(syncPlan.mode).toBe("supabase-write-blocked");
    expect(syncPlan.supabaseWriteBlocked).toBe(true);
    expect(syncPlan.writeClaims).toEqual({ hostedSync: false, supabaseWrites: false });
    expect(syncPlan.mergedExternalIds).toEqual({
      steam: "1091500",
      xbox: "9p3wxwcxzl50",
    });
    expect(syncPlan.gameCrossPlayUpserts).toEqual([
      expect.objectContaining({
        game_id: "game-123",
        is_enabled: true,
        is_verified: false,
        platform: "steam",
        verified_at: null,
        verified_by_user_id: null,
      }),
      expect.objectContaining({
        game_id: "game-123",
        is_enabled: true,
        is_verified: false,
        platform: "xbox",
      }),
    ]);
    expect(syncPlan.gameCrossPlayUpserts[0]?.metadata).toEqual({
      candidate_id: "steam-primary",
      external_id_source: "steam",
      external_id_value: "1091500",
      label: "Steam Primary",
      planner: "igdb-cross-play-staged-sync",
      write_mode: "supabase-write-blocked",
    });
    expect(syncPlan.blockedRows).toEqual([]);
    expect(syncPlan.skippedRows).toEqual([]);
    expect(syncPlan.issueSummary).toEqual({
      blockerCount: 0,
      conflictCount: 0,
      duplicateCount: 0,
      externalIdMergeCount: 2,
      platformOnlyCount: 0,
      skippedCount: 0,
    });
  });

  it("merges with existing external ids and blocks existing platform upserts", () => {
    const readinessPlan = buildIgdbCrossPlayReadinessPlan([
      {
        externalId: "steam:1091500",
        id: "steam-primary",
        igdbPlatformName: "Steam",
        label: "Steam Primary",
      },
      {
        externalId: "xbox:9p3wxwcxzl50",
        id: "xbox-primary",
        igdbPlatformName: "Xbox Series X|S",
        label: "Xbox Primary",
      },
    ]);
    const syncPlan = buildIgdbCrossPlayImportSyncPlan(
      "game-123",
      readinessPlan.importPreview,
      { GOG: "  gog-existing ", steam: "1091500" },
      ["steam"],
    );

    expect(syncPlan.mergedExternalIds).toEqual({
      gog: "gog-existing",
      steam: "1091500",
      xbox: "9p3wxwcxzl50",
    });
    expect(syncPlan.gameCrossPlayUpserts).toEqual([
      expect.objectContaining({ game_id: "game-123", platform: "xbox" }),
    ]);
    expect(syncPlan.blockedRows).toEqual([
      {
        candidateId: "steam-primary",
        label: "Steam Primary",
        reason: "duplicate_existing_platform",
        targetKey: "steam",
        targetTable: "game_cross_play",
      },
    ]);
    expect(syncPlan.issueSummary.blockerCount).toBe(1);
  });

  it("blocks existing external id conflicts without overwriting merged values", () => {
    const readinessPlan = buildIgdbCrossPlayReadinessPlan([
      {
        externalId: "steam:1091500",
        id: "steam-primary",
        igdbPlatformName: "Steam",
        label: "Steam Primary",
      },
    ]);
    const syncPlan = buildIgdbCrossPlayImportSyncPlan("game-123", readinessPlan.importPreview, {
      steam: "999999",
    });

    expect(syncPlan.mergedExternalIds).toEqual({ steam: "999999" });
    expect(syncPlan.gameCrossPlayUpserts).toEqual([]);
    expect(syncPlan.blockedRows).toEqual([
      {
        candidateId: "steam-primary",
        label: "Steam Primary",
        reason: "conflicting_existing_external_id",
        targetKey: "steam",
        targetTable: "games.external_ids",
      },
    ]);
    expect(syncPlan.issueSummary.conflictCount).toBe(1);
  });

  it("summarizes preview conflicts, duplicates, and platform-only decisions for sync review", () => {
    const readinessPlan = createVerifyIgdbCrossPlayReadinessPlan();
    const syncPlan = buildIgdbCrossPlayImportSyncPlan("game-123", readinessPlan.importPreview);

    expect(syncPlan.blockedRows).toEqual([
      expect.objectContaining({
        candidateId: "verify-steam-conflict",
        reason: "conflicting_preview_external_id",
        targetTable: "games.external_ids",
      }),
    ]);
    expect(syncPlan.skippedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateId: "verify-steam-duplicate-id",
          reason: "duplicate_preview_external_id",
        }),
        expect.objectContaining({
          candidateId: "verify-steam-platform-duplicate",
          reason: "duplicate_preview_platform",
          targetTable: "game_cross_play",
        }),
        expect.objectContaining({
          candidateId: "verify-switch",
          reason: "missing_external_id",
        }),
        expect.objectContaining({
          candidateId: "verify-arcade",
          reason: "unmapped_platform",
        }),
      ]),
    );
    expect(syncPlan.issueSummary).toEqual({
      blockerCount: 1,
      conflictCount: 1,
      duplicateCount: 2,
      externalIdMergeCount: 3,
      platformOnlyCount: 1,
      skippedCount: 4,
    });
  });

  it("does not overwrite a staged external id patch when sources conflict", () => {
    const plan = buildIgdbCrossPlayReadinessPlan([
      {
        externalId: "steam:1091500",
        id: "steam-primary",
        igdbPlatformName: "Steam",
        label: "Steam Primary",
      },
      {
        externalId: "steam:999999",
        id: "steam-conflict",
        igdbPlatformName: "Steam",
        label: "Steam Conflict",
      },
    ]);

    expect(plan.importPreview.gameExternalIdsPatch).toEqual({ steam: "1091500" });
    expect(plan.importPreview.gameCrossPlayRows).toHaveLength(1);
    expect(plan.importPreview.externalIdRows).toHaveLength(1);
    expect(plan.importPreview.issueRows).toEqual([
      expect.objectContaining({
        candidateIds: ["steam-primary", "steam-conflict"],
        decision: "skip_incoming",
        incomingValue: "steam:999999",
        keptValue: "steam:1091500",
        labels: ["Steam Primary", "Steam Conflict"],
        reason: "conflicting_external_id",
        targetKey: "steam",
        targetTable: "games.external_ids",
      }),
    ]);
    expect(plan.importPreview.skippedRows).toEqual([
      expect.objectContaining({
        candidateId: "steam-conflict",
        reason: "conflicting_external_id",
      }),
    ]);
  });

  it("dedupes repeated external ids without staging duplicate rows", () => {
    const plan = buildIgdbCrossPlayReadinessPlan([
      {
        externalId: "steam:1091500",
        id: "steam-primary",
        igdbPlatformName: "Steam",
        label: "Steam Primary",
      },
      {
        externalId: "steam:1091500",
        id: "steam-duplicate",
        igdbPlatformName: "Steam",
        label: "Steam Duplicate",
      },
    ]);

    expect(plan.stageableCount).toBe(1);
    expect(plan.issueCount).toBe(1);
    expect(plan.importPreview.gameExternalIdsPatch).toEqual({ steam: "1091500" });
    expect(plan.importPreview.gameCrossPlayRows).toHaveLength(1);
    expect(plan.importPreview.externalIdRows).toHaveLength(1);
    expect(plan.importPreview.issueRows).toEqual([
      expect.objectContaining({
        candidateIds: ["steam-primary", "steam-duplicate"],
        decision: "dedupe_incoming",
        incomingValue: "steam:1091500",
        keptValue: "steam:1091500",
        reason: "duplicate_external_id",
        targetKey: "steam",
        targetTable: "games.external_ids",
      }),
    ]);
    expect(plan.importPreview.skippedRows).toEqual([
      expect.objectContaining({
        candidateId: "steam-duplicate",
        reason: "duplicate_external_id",
      }),
    ]);
  });

  it("dedupes repeated mapped platforms while keeping a new external id patch", () => {
    const plan = buildIgdbCrossPlayReadinessPlan([
      {
        externalId: "steam:1091500",
        id: "steam-primary",
        igdbPlatformName: "Steam",
        label: "Steam Primary",
      },
      {
        externalId: "igdb:123",
        id: "steam-igdb",
        igdbPlatformName: "Steam",
        label: "Steam IGDB",
      },
    ]);

    expect(plan.stageableCount).toBe(1);
    expect(plan.issueCount).toBe(1);
    expect(plan.importPreview.gameExternalIdsPatch).toEqual({ igdb: "123", steam: "1091500" });
    expect(plan.importPreview.gameCrossPlayRows).toHaveLength(1);
    expect(plan.importPreview.externalIdRows).toHaveLength(2);
    expect(plan.importPreview.externalIdRows[1]).toEqual(
      expect.objectContaining({
        candidateId: "steam-igdb",
        targetTables: ["games.external_ids"],
      }),
    );
    expect(plan.importPreview.issueRows).toEqual([
      expect.objectContaining({
        candidateIds: ["steam-primary", "steam-igdb"],
        decision: "stage_external_id_only",
        incomingValue: "igdb:123",
        keptValue: "steam:1091500",
        reason: "duplicate_platform",
        targetKey: "steam",
        targetTable: "game_cross_play",
      }),
    ]);
  });

  it("keeps the first source value when one external-id source has repeated conflicts", () => {
    const plan = buildIgdbCrossPlayReadinessPlan([
      {
        externalId: "steam:1091500",
        id: "steam-primary",
        igdbPlatformName: "Steam",
        label: "Steam Primary",
      },
      {
        externalId: "steam:999999",
        id: "steam-conflict-a",
        igdbPlatformName: "Steam",
        label: "Steam Conflict A",
      },
      {
        externalId: "steam:111111",
        id: "steam-conflict-b",
        igdbPlatformName: "Steam",
        label: "Steam Conflict B",
      },
    ]);

    expect(plan.importPreview.gameExternalIdsPatch).toEqual({ steam: "1091500" });
    expect(plan.importPreview.gameCrossPlayRows).toHaveLength(1);
    expect(plan.importPreview.externalIdRows).toHaveLength(1);
    expect(plan.importPreview.issueRows).toEqual([
      expect.objectContaining({
        incomingCandidateId: "steam-conflict-a",
        incomingValue: "steam:999999",
        keptCandidateId: "steam-primary",
        keptValue: "steam:1091500",
        reason: "conflicting_external_id",
      }),
      expect.objectContaining({
        incomingCandidateId: "steam-conflict-b",
        incomingValue: "steam:111111",
        keptCandidateId: "steam-primary",
        keptValue: "steam:1091500",
        reason: "conflicting_external_id",
      }),
    ]);
    expect(plan.importPreview.skippedRows).toEqual([
      expect.objectContaining({ candidateId: "steam-conflict-a" }),
      expect.objectContaining({ candidateId: "steam-conflict-b" }),
    ]);
  });

  it("marks all-ready plans with duplicate import keys as needs review", () => {
    const plan = buildIgdbCrossPlayReadinessPlan([
      {
        externalId: "steam:1091500",
        id: "steam-primary",
        igdbPlatformName: "Steam",
        label: "Steam Primary",
      },
      {
        externalId: "steam:1091500",
        id: "steam-duplicate",
        igdbPlatformName: "Steam",
        label: "Steam Duplicate",
      },
    ]);

    expect(plan.statusLabel).toBe("Needs review");
    expect(plan.summary).toContain("duplicate or conflicting target keys");
    expect(plan.nextAction).toContain("Resolve duplicate or conflicting import keys");
  });

  it("blocks unknown platforms and warns when external ids are missing", () => {
    const plan = buildIgdbCrossPlayReadinessPlan([
      {
        externalId: null,
        id: "missing-id",
        igdbPlatformName: "Steam",
        label: "Steam Missing ID",
      },
      {
        externalId: "arcade-1",
        id: "unknown",
        igdbPlatformName: "Arcade Cabinet",
        label: "Arcade Unknown",
      },
    ]);

    expect(plan.warningCount).toBe(1);
    expect(plan.blockedCount).toBe(1);
    expect(plan.candidates.find((candidate) => candidate.id === "missing-id")?.status).toBe(
      "warning",
    );
    expect(plan.candidates.find((candidate) => candidate.id === "unknown")?.status).toBe("blocked");
    expect(plan.importPreview.skippedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ candidateId: "missing-id", reason: "missing_external_id" }),
        expect.objectContaining({ candidateId: "unknown", reason: "unmapped_platform" }),
      ]),
    );
  });

  it("does not stage preview rows when a prefixed external id has no value", () => {
    const plan = buildIgdbCrossPlayReadinessPlan([
      {
        externalId: "steam:",
        id: "empty-prefixed-id",
        igdbPlatformName: "Steam",
        label: "Steam Empty ID",
      },
    ]);

    expect(plan.warningCount).toBe(1);
    expect(plan.importPreview.gameCrossPlayRows).toHaveLength(0);
    expect(plan.importPreview.gameExternalIdsPatch).toEqual({});
    expect(plan.importPreview.skippedRows).toEqual([
      expect.objectContaining({
        candidateId: "empty-prefixed-id",
        reason: "missing_external_id",
      }),
    ]);
  });
});
