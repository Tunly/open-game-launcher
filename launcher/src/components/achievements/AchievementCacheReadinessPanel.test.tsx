import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyAchievementCacheReadiness } from "../../lib/achievement-cache-readiness";
import { AchievementCacheReadinessPanel } from "./AchievementCacheReadinessPanel";

describe("AchievementCacheReadinessPanel", () => {
  it("renders local cache evidence without provider sync claims", () => {
    render(<AchievementCacheReadinessPanel readiness={createVerifyAchievementCacheReadiness()} />);

    const panel = screen.getByRole("region", { name: /achievement cache readiness/i });

    expect(within(panel).getByText("Cache Readiness")).toBeInTheDocument();
    expect(within(panel).getByText("Local cache review")).toBeInTheDocument();
    expect(within(panel).getByText("Cache folder handoff")).toBeInTheDocument();
    expect(within(panel).getByText("Sidecar format map")).toBeInTheDocument();
    expect(within(panel).getByText("Local parser coverage")).toBeInTheDocument();
    expect(within(panel).getByText("Provider status matrix")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted hydration")).toBeInTheDocument();
    expect(within(panel).getByText("Supabase achievement write")).toBeInTheDocument();
    expect(within(panel).getByText("OAuth/token exchange")).toBeInTheDocument();
    expect(within(panel).getByText("Local cache fixtures only")).toBeInTheDocument();
    expect(within(panel).getByText("Sidecar review only")).toBeInTheDocument();
    expect(
      within(panel).getByText("No Steam/Xbox/GOG/Epic/EA/Ubisoft/Battle.net provider sync"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("No hosted hydration")).toBeInTheDocument();
    expect(within(panel).getByText("No Supabase writes")).toBeInTheDocument();
    expect(within(panel).getByText("No OAuth/token exchange")).toBeInTheDocument();
    expect(within(panel).getByText("No live unlock import")).toBeInTheDocument();
    expect(within(panel).getByText("No remote cache job")).toBeInTheDocument();
    expect(within(panel).getByText("No provider credential use")).toBeInTheDocument();
    expect(within(panel).getByText("No official unlock proof")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /\b(?:(?:steam|xbox|gog|epic|ea|ubisoft|battle\.?net|provider)\s*(?:achievement|unlock|cache|sidecar)?\s*(?:sync|import|hydration|job)\s*(?:ready|verified|connected|enabled|synced|complete|executed|started|imported)|provider\s*api\s*(?:called|fetched|ready|verified)|hosted\s*(?:hydration|achievement|cache|sync|job)\s*(?:ready|verified|enabled|complete|executed|started)|supabase\s*(?:(?:achievement|unlock|cache|row|write|writes|hydration)\s*)+(?:written|inserted|updated|synced|ready|verified|complete)|oauth\s*(?:token\s*)?(?:exchanged|connected|verified|complete|exchange\s*(?:ready|verified|complete|executed))|token\s*(?:exchange\s*(?:ready|verified|complete|executed)|read\s*(?:ready|verified|complete|executed|started)|used|stored|vaulted)|live\s*unlock\s*(?:imported|synced|ready|complete|import\s*(?:ready|verified|complete|executed|started)|sync\s*(?:ready|verified|complete|executed|started))|remote\s*cache\s*(?:job|sync|hydration)\s*(?:ready|started|executed|complete|synced)|trusted\s*ingestion\s*(?:called|ready|verified|complete|executed|started)|achievement\s*sync\s*(?:ready|verified|enabled|synced|complete|executed|started|imported))\b/i,
    );
  });
});
