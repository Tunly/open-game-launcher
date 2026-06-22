import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyHostedCommunityArtworkReadiness } from "../../../lib/hosted-community-artwork-readiness";
import { HostedCommunityArtworkReadinessPanel } from "./HostedCommunityArtworkReadinessPanel";

describe("HostedCommunityArtworkReadinessPanel", () => {
  it("renders hosted artwork v1 gates without claiming full creator rollout", () => {
    render(
      <HostedCommunityArtworkReadinessPanel
        readiness={createVerifyHostedCommunityArtworkReadiness()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /hosted community artwork readiness/i,
    });

    expect(within(panel).getByText("Hosted Artwork Readiness")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted v1 staged")).toBeInTheDocument();
    expect(within(panel).getByText("12/13")).toBeInTheDocument();
    expect(within(panel).getByText("92%")).toBeInTheDocument();
    expect(within(panel).getByText("Schema/RLS")).toBeInTheDocument();
    expect(within(panel).getByText("Vote Persistence")).toBeInTheDocument();
    expect(within(panel).getByText("Moderation Queue")).toBeInTheDocument();
    expect(within(panel).getByText("Upload UI")).toBeInTheDocument();
    expect(
      within(panel).getByText(/public upload form, file guardrails, and pending-submission cards/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Moderator Console")).toBeInTheDocument();
    expect(within(panel).getByText(/service-role review RPC contract/i)).toBeInTheDocument();
    expect(within(panel).getByText("Live Review Endpoint")).toBeInTheDocument();
    expect(
      within(panel).getByText(/community-artwork-moderation Edge Function/i),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Content Scanning")).toBeInTheDocument();
    expect(within(panel).getByText(/service-role policy scan/i)).toBeInTheDocument();
    expect(within(panel).getByText("Provider Artwork")).toBeInTheDocument();
    expect(
      within(panel).getByText(
        /Epic CDN candidates now have local host\/source-id\/path\/pixel\/byte caps/i,
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Provider Caps Proof")).toBeInTheDocument();
    expect(within(panel).getByText("2 pass / 1 review / 0 blocked")).toBeInTheDocument();
    expect(within(panel).getByText("Epic Caps")).toBeInTheDocument();
    expect(within(panel).getAllByText("Review only").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/cdn1\.epicgames\.com/i).length).toBeGreaterThan(0);
    expect(within(panel).getByText(/No provider API calls/i)).toBeInTheDocument();
    expect(
      within(panel).getByText(
        /Epic CDN rows stay review-only until provider-approved source evidence exists/i,
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Community Rollout")).toBeInTheDocument();
    expect(within(panel).getByText("No ML image moderation claim")).toBeInTheDocument();
    expect(
      within(panel).getByText("No unvetted provider artwork scrape claim"),
    ).toBeInTheDocument();
    expect(within(panel).queryByText(/artwork published/i)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/creator rollout ready/i)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/ML image moderation ready/i)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/copyright fingerprinting ready/i)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/provider API approved/i)).not.toBeInTheDocument();
  });
});
