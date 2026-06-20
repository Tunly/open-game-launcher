import { describe, expect, it } from "vitest";

import { createVerifyAchievementHostedHydrationContract } from "../achievement-hosted-hydration-contract";

const falseHostedHydrationClaim =
  /\b(?:hosted\s*hydration\s*(?:ready|verified|enabled|complete|executed|started)|supabase\s*(?:achievement|unlock|row|write|writes)\s*(?:written|inserted|updated|synced|ready|verified|complete)|provider\s*(?:achievement|unlock|sync)\s*(?:ready|verified|synced|executed)|oauth\s*(?:token\s*)?(?:exchanged|connected|verified|complete)|remote\s*cache\s*job\s*(?:ready|started|executed|complete)|trusted\s*ingestion\s*(?:called|ready|verified|complete|executed)|live\s*unlock\s*(?:imported|synced|ready|complete)|official\s*unlock\s*proof\s*(?:ready|verified|complete))\b/i;

describe("createVerifyAchievementHostedHydrationContract", () => {
  it("stages a no-write hosted hydration contract without live hosted claims", () => {
    const contract = createVerifyAchievementHostedHydrationContract();

    expect(contract.statusLabel).toBe("No-write contract");
    expect(contract.passCount).toBe(3);
    expect(contract.reviewCount).toBe(2);
    expect(contract.blockedClaims).toContain("No live hosted staging");
    expect(contract.blockedClaims).toContain("No Supabase writes");
    expect(contract.blockedClaims).toContain("No provider sync");
    expect(contract.blockedClaims).toContain("No OAuth/token exchange");
    expect(contract.blockedClaims).toContain("No remote cache job");
    expect(contract.blockedClaims).toContain("No trusted ingestion call");
    expect(contract.blockedClaims).toContain("No live unlock import");
    expect(contract.blockedClaims).toContain("No official unlock proof");
    expect(contract.guardCopy).toContain("local and no-write");
    expect(JSON.stringify(contract)).not.toMatch(falseHostedHydrationClaim);
  });

  it("pins provider filtering, catalog resolution, merge policy, and fallback lanes", () => {
    const contract = createVerifyAchievementHostedHydrationContract();

    expect(contract.lanes.find((lane) => lane.id === "provider-key-filter")).toMatchObject({
      label: "Provider Key Filter",
      status: "pass",
    });
    expect(contract.lanes.find((lane) => lane.id === "catalog-game-resolution")).toMatchObject({
      label: "Catalog Game Resolution",
      status: "review",
    });
    expect(contract.lanes.find((lane) => lane.id === "definition-unlock-merge")).toMatchObject({
      label: "Definition/Unlock Merge",
      status: "pass",
    });
    expect(contract.lanes.find((lane) => lane.id === "failure-to-local")).toMatchObject({
      label: "Failure-To-Local",
      status: "pass",
    });
  });
});
