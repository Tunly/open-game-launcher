import { describe, expect, it } from "vitest";

import {
  buildAchievementCacheReadiness,
  createVerifyAchievementCacheReadiness,
} from "../achievement-cache-readiness";

const falseAchievementCacheClaim =
  /\b(?:(?:steam|xbox|gog|epic|ea|ubisoft|battle\.?net|provider)\s*(?:achievement|unlock|cache|sidecar)?\s*(?:sync|import|hydration|job)\s*(?:ready|verified|connected|enabled|synced|complete|executed|started|imported)|provider\s*api\s*(?:called|fetched|ready|verified)|hosted\s*(?:hydration|achievement|cache|sync|job)\s*(?:ready|verified|enabled|complete|executed|started)|supabase\s*(?:(?:achievement|unlock|cache|row|write|writes|hydration)\s*)+(?:written|inserted|updated|synced|ready|verified|complete)|oauth\s*(?:token\s*)?(?:exchanged|connected|verified|complete|exchange\s*(?:ready|verified|complete|executed))|token\s*(?:exchange\s*(?:ready|verified|complete|executed)|read\s*(?:ready|verified|complete|executed|started)|used|stored|vaulted)|live\s*unlock\s*(?:imported|synced|ready|complete|import\s*(?:ready|verified|complete|executed|started)|sync\s*(?:ready|verified|complete|executed|started))|remote\s*cache\s*(?:job|sync|hydration)\s*(?:ready|started|executed|complete|synced)|trusted\s*ingestion\s*(?:called|ready|verified|complete|executed|started)|achievement\s*sync\s*(?:ready|verified|enabled|synced|complete|executed|started|imported))\b/i;

describe("buildAchievementCacheReadiness", () => {
  it("creates local achievement cache readiness without provider or hosted claims", () => {
    const readiness = createVerifyAchievementCacheReadiness();

    expect(readiness.statusLabel).toBe("Local cache review");
    expect(readiness.reviewCount).toBe(4);
    expect(readiness.blockedCount).toBe(5);
    expect(readiness.guards).toContain("Local cache fixtures only");
    expect(readiness.guards).toContain("Sidecar review only");
    expect(readiness.guards).toContain(
      "No Steam/Xbox/GOG/Epic/EA/Ubisoft/Battle.net provider sync",
    );
    expect(readiness.guards).toContain("No hosted hydration");
    expect(readiness.guards).toContain("No Supabase writes");
    expect(readiness.guards).toContain("No OAuth/token exchange");
    expect(readiness.guards).toContain("No live unlock import");
    expect(readiness.guards).toContain("No remote cache job");
    expect(readiness.guards).toContain("No provider credential use");
    expect(readiness.guards).toContain("No official unlock proof");
    expect(readiness.guardCopy).toContain("Local achievement cache readiness only");
    expect(readiness.guardCopy).toContain("no provider API calls");
    expect(JSON.stringify(readiness)).not.toMatch(falseAchievementCacheClaim);
  });

  it("flags hosted provider achievement wording as false-claim copy", () => {
    const falseClaims = [
      "Steam achievement sync ready",
      "provider API called",
      "hosted hydration ready",
      "Supabase achievement row inserted",
      "OAuth token exchanged",
      "provider token read executed",
      "live unlock imported",
      "remote cache job started",
      "trusted ingestion called",
      "achievement sync executed",
    ];

    for (const claim of falseClaims) {
      expect(claim).toMatch(falseAchievementCacheClaim);
    }
  });

  it("keeps local cache, sidecar, parser, and status lanes in review", () => {
    const readiness = createVerifyAchievementCacheReadiness();

    expect(readiness.items.find((item) => item.id === "cache-folder-handoff")).toMatchObject({
      label: "Cache folder handoff",
      status: "review",
    });
    expect(readiness.items.find((item) => item.id === "sidecar-format-map")).toMatchObject({
      label: "Sidecar format map",
      status: "review",
    });
    expect(readiness.items.find((item) => item.id === "local-parser-coverage")).toMatchObject({
      label: "Local parser coverage",
      status: "review",
    });
    expect(readiness.items.find((item) => item.id === "provider-status-matrix")).toMatchObject({
      label: "Provider status matrix",
      status: "review",
    });
    expect(readiness.items.find((item) => item.id === "hosted-hydration")).toMatchObject({
      status: "blocked",
    });
    expect(readiness.items.find((item) => item.id === "live-unlock-import")).toMatchObject({
      status: "blocked",
    });
  });

  it("blocks every lane when local cache fixtures are absent", () => {
    const readiness = buildAchievementCacheReadiness({
      cacheFolderHandoffReady: false,
      liveUnlockImportStaged: false,
      localParserCoverageReady: false,
      oauthTokenExchangeStaged: false,
      providerStatusMatrixReady: false,
      remoteCacheJobStaged: false,
      remoteHydrationStaged: false,
      sidecarFormatMapReady: false,
      supabaseAchievementWriteStaged: false,
    });

    expect(readiness.reviewCount).toBe(0);
    expect(readiness.blockedCount).toBe(9);
    expect(readiness.items.every((item) => item.status === "blocked")).toBe(true);
    expect(JSON.stringify(readiness)).not.toMatch(falseAchievementCacheClaim);
  });
});
