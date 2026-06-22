import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyHostedCommunityArtworkModerationConsole } from "../../../lib/hosted-community-artwork-moderation-console";
import { HostedCommunityArtworkModeratorConsolePanel } from "./HostedCommunityArtworkModeratorConsolePanel";

describe("HostedCommunityArtworkModeratorConsolePanel", () => {
  it("renders queue, service-role guard, and audit ledger", () => {
    render(
      <HostedCommunityArtworkModeratorConsolePanel
        initialConsole={createVerifyHostedCommunityArtworkModerationConsole()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /hosted community artwork moderator console/i,
    });
    expect(within(panel).getByText("Moderator Console")).toBeInTheDocument();
    expect(within(panel).getByText("Local Review Preview")).toBeInTheDocument();
    expect(within(panel).getByText(/service-role keys/i)).toBeInTheDocument();
    expect(within(panel).getByText("Reported Logo")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /hosted community artwork audit ledger/i }),
    ).toBeInTheDocument();
    expect(within(panel).queryByText(/content scanning enabled/i)).not.toBeInTheDocument();
    expect(
      within(panel).queryByText(/live supabase review writes enabled/i),
    ).not.toBeInTheDocument();
  });

  it("previews approve actions by updating status and audit evidence", () => {
    render(
      <HostedCommunityArtworkModeratorConsolePanel
        initialConsole={createVerifyHostedCommunityArtworkModerationConsole()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/hosted artwork review note/i), {
      target: { value: "Looks correct." },
    });
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));

    const ledger = screen.getByRole("region", { name: /hosted community artwork audit ledger/i });
    expect(within(ledger).getByText("approved")).toBeInTheDocument();
    expect(within(ledger).getByText("Looks correct.")).toBeInTheDocument();
    expect(screen.getByText(/approved \/ 0 reports/i)).toBeInTheDocument();
  });
});
