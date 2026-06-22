import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyBroadcastLiveSessionRehearsal } from "../../lib/broadcast-live-session-rehearsal";
import { BroadcastLiveSessionRehearsalPanel } from "./BroadcastLiveSessionRehearsalPanel";

describe("BroadcastLiveSessionRehearsalPanel", () => {
  it("renders the local live-session rehearsal without go-live claims", () => {
    render(
      <BroadcastLiveSessionRehearsalPanel
        rehearsal={createVerifyBroadcastLiveSessionRehearsal()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /broadcasting live session rehearsal/i,
    });

    expect(within(panel).getByText("Live Session Rehearsal")).toBeInTheDocument();
    expect(within(panel).getByText("Local preflight")).toBeInTheDocument();
    expect(within(panel).getByText("Desktop vault handoff")).toBeInTheDocument();
    expect(within(panel).getByText("Provider OAuth launch")).toBeInTheDocument();
    expect(within(panel).getByText("RTMP ingest negotiation")).toBeInTheDocument();
    expect(within(panel).getByText("Provider chat attach")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted moderation handoff")).toBeInTheDocument();
    expect(within(panel).getByText("VOD archive handoff")).toBeInTheDocument();
    expect(within(panel).getByText("Provider callback replay")).toBeInTheDocument();
    expect(within(panel).getByText("Audience status update")).toBeInTheDocument();
    expect(within(panel).getByText("Rollback drill")).toBeInTheDocument();
    expect(within(panel).getByText("No provider OAuth launch")).toBeInTheDocument();
    expect(within(panel).getByText("No RTMP socket")).toBeInTheDocument();
    expect(within(panel).getByText("No stream-key live use")).toBeInTheDocument();
    expect(within(panel).getByText("No provider chat read")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted moderation execution")).toBeInTheDocument();
    expect(within(panel).getByText("No VOD provider sync")).toBeInTheDocument();
    expect(within(panel).getByText("No provider callback replay")).toBeInTheDocument();
    expect(within(panel).getByText("No live audience status")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /\b(?:go[-\s]?live\s*(?:ready|enabled|available|complete)|live\s*(?:now|ready|online|enabled|started)|provider\s*(?:oauth|chat|callback)\s*(?:ready|verified|connected|enabled|complete|replayed)|rtmp(?:\s+ingest|\s+socket)?\s*(?:ready|connected|started|published)|hosted\s*moderation\s*(?:ready|verified|enabled|executed)|vod(?:\s+provider)?\s*(?:sync|archive)\s*(?:ready|verified|synced|complete)|audience(?:\/live)?\s*status\s*(?:ready|updated|online|synced))\b/i,
    );
  });
});
