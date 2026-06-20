import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createVerifyPublicScreenshotFeedReadiness } from "../../lib/public-screenshot-feed-readiness";
import { PublicScreenshotFeedPanel } from "./PublicScreenshotFeedPanel";

describe("PublicScreenshotFeedPanel", () => {
  it("renders hosted public screenshot staging while blocking private captures", () => {
    render(
      <PublicScreenshotFeedPanel
        message="Public Supabase screenshot rows staged with signed media review."
        readiness={createVerifyPublicScreenshotFeedReadiness()}
      />,
    );

    const panel = screen.getByRole("region", { name: /public screenshot feed preview/i });

    expect(within(panel).getByText("Public Screenshot Feed")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted feed staging")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted rows")).toBeInTheDocument();
    expect(within(panel).getByText("Finish-line spark trail")).toBeInTheDocument();
    expect(within(panel).getByText("Phantom menu clear")).toBeInTheDocument();
    expect(within(panel).getByText("Unreviewed boss reveal")).toBeInTheDocument();
    expect(within(panel).getByText("Raid hangar draft")).toBeInTheDocument();
    expect(within(panel).getAllByText("Hosted Feed Preview")).toHaveLength(2);
    expect(within(panel).getAllByText("Signed Media Review")).toHaveLength(2);
    expect(within(panel).getAllByText("Hosted Row")).toHaveLength(3);
    expect(within(panel).getAllByText("Embed Blocked")).toHaveLength(2);
    expect(within(panel).getByText("Private Gate Block")).toBeInTheDocument();
    expect(within(panel).getByText("Moderation Pending Block")).toBeInTheDocument();
    expect(within(panel).getByText("Moderation + Ranking Contract")).toBeInTheDocument();
    expect(within(panel).getByText("Approved Public Only")).toBeInTheDocument();
    expect(within(panel).getByText("Moderation Before Ranking")).toBeInTheDocument();
    expect(within(panel).getByText("Deterministic Ranking")).toBeInTheDocument();
    expect(within(panel).getByText("No-Write Rollout Guard")).toBeInTheDocument();
    expect(within(panel).getAllByText("Pending Review").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/likes cannot bypass review/i).length).toBeGreaterThan(0);
    expect(within(panel).getByText("Public metadata RLS")).toBeInTheDocument();
    expect(within(panel).getByText("Signed URL path staged")).toBeInTheDocument();
    expect(within(panel).getByText("Like count sync staged")).toBeInTheDocument();
    expect(within(panel).getByText("No private capture embed")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted moderation")).toBeInTheDocument();
    expect(within(panel).getByText("No production ranking claim")).toBeInTheDocument();
    expect(within(panel).getByText("Moderation review contract")).toBeInTheDocument();
    expect(within(panel).getByText("Deterministic ranking contract")).toBeInTheDocument();
    expect(
      within(panel).getByText(
        "Source: Hosted public rows // Public Supabase screenshot rows staged with signed media review.",
      ),
    ).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /\b(?:supabase\s*(?:connected|synced|verified|ready)|signed\s+url\s*(?:created|generated|served)|public\s+storage\s*(?:served|enabled|ready)|hosted\s*(?:feed|moderation|ranking)\s*(?:ready|synced|enabled|verified|complete)|production\s+ranking\s*(?:ready|synced|enabled)|real\s+(?:profile|community)\s+feed)\b/i,
    );
  });

  it("emits hosted public like toggles while keeping private cards locked", () => {
    const onToggleLike = vi.fn();
    render(
      <PublicScreenshotFeedPanel
        canLike
        onToggleLike={onToggleLike}
        readiness={createVerifyPublicScreenshotFeedReadiness()}
      />,
    );

    const panel = screen.getByRole("region", { name: /public screenshot feed preview/i });
    const unlikeButton = within(panel).getByRole("button", {
      name: /unlike finish-line spark trail/i,
    });
    const privateButton = within(panel).getByRole("button", {
      name: /like raid hangar draft/i,
    });

    expect(unlikeButton).toBeEnabled();
    expect(unlikeButton).toHaveAttribute("aria-pressed", "true");
    expect(privateButton).toBeDisabled();
    expect(privateButton).toHaveTextContent("Locked");

    fireEvent.click(unlikeButton);

    expect(onToggleLike).toHaveBeenCalledWith(
      expect.objectContaining({
        caption: "Finish-line spark trail",
        id: "shot-feed-tokyo-finish",
        source: "hosted-supabase",
      }),
    );
  });
});
