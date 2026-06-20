import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyBroadcastAudienceStatusContract } from "../../lib/broadcast-audience-status-contract";
import { BroadcastAudienceStatusContractPanel } from "./BroadcastAudienceStatusContractPanel";

describe("BroadcastAudienceStatusContractPanel", () => {
  it("renders local audience status lanes and no live-provider claims", () => {
    render(
      <BroadcastAudienceStatusContractPanel
        contract={createVerifyBroadcastAudienceStatusContract()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /broadcasting audience status contract/i,
    });

    expect(within(panel).getByText("Audience Status Contract")).toBeInTheDocument();
    expect(within(panel).getByText("Local status contract")).toBeInTheDocument();
    expect(within(panel).getByText("Local preview state")).toBeInTheDocument();
    expect(within(panel).getByText("Provider live-state event")).toBeInTheDocument();
    expect(within(panel).getByText("Audience count snapshot")).toBeInTheDocument();
    expect(within(panel).getByText("Chat presence merge")).toBeInTheDocument();
    expect(within(panel).getByText("Public status write")).toBeInTheDocument();
    expect(within(panel).getByText("Supabase audience row")).toBeInTheDocument();
    expect(within(panel).getByText("Stale status fallback")).toBeInTheDocument();
    expect(within(panel).getByText("Rollback clear status")).toBeInTheDocument();
    expect(within(panel).getByText("No provider live-state read")).toBeInTheDocument();
    expect(within(panel).getByText("No audience count polling")).toBeInTheDocument();
    expect(within(panel).getByText("No public live badge update")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /live status ready|audience status updated|viewer count verified|provider live-state connected|public live badge updated|supabase audience row written/i,
    );
  });
});
