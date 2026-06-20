import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyAchievementHostedHydrationContract } from "../../lib/achievement-hosted-hydration-contract";
import { AchievementHostedHydrationContractPanel } from "./AchievementHostedHydrationContractPanel";

const falseHostedHydrationClaim =
  /\b(?:hosted\s*hydration\s*(?:ready|verified|enabled|complete|executed|started)|supabase\s*(?:achievement|unlock|row|write|writes)\s*(?:written|inserted|updated|synced|ready|verified|complete)|provider\s*(?:achievement|unlock|sync)\s*(?:ready|verified|synced|executed)|oauth\s*(?:token\s*)?(?:exchanged|connected|verified|complete)|remote\s*cache\s*job\s*(?:ready|started|executed|complete)|trusted\s*ingestion\s*(?:called|ready|verified|complete|executed)|live\s*unlock\s*(?:imported|synced|ready|complete)|official\s*unlock\s*proof\s*(?:ready|verified|complete))\b/i;

describe("AchievementHostedHydrationContractPanel", () => {
  it("renders no-write hosted hydration contract evidence without live claims", () => {
    render(
      <AchievementHostedHydrationContractPanel
        contract={createVerifyAchievementHostedHydrationContract()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /achievement hosted hydration contract/i,
    });

    expect(within(panel).getByText("Hydration Contract")).toBeInTheDocument();
    expect(within(panel).getByText("No-write contract")).toBeInTheDocument();
    expect(within(panel).getByText("Authenticated Read Scope")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Key Filter")).toBeInTheDocument();
    expect(within(panel).getByText("Catalog Game Resolution")).toBeInTheDocument();
    expect(within(panel).getByText("Definition/Unlock Merge")).toBeInTheDocument();
    expect(within(panel).getByText("Failure-To-Local")).toBeInTheDocument();
    expect(within(panel).getByText("No live hosted staging")).toBeInTheDocument();
    expect(within(panel).getByText("No Supabase writes")).toBeInTheDocument();
    expect(within(panel).getByText("No provider sync")).toBeInTheDocument();
    expect(within(panel).getByText("No OAuth/token exchange")).toBeInTheDocument();
    expect(within(panel).getByText("No remote cache job")).toBeInTheDocument();
    expect(within(panel).getByText("No trusted ingestion call")).toBeInTheDocument();
    expect(within(panel).getByText("No live unlock import")).toBeInTheDocument();
    expect(within(panel).getByText("No official unlock proof")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(falseHostedHydrationClaim);
  });
});
