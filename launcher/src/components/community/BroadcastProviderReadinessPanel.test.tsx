import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyBroadcastProviderReadiness } from "../../lib/broadcast-provider-readiness";
import { BroadcastProviderReadinessPanel } from "./BroadcastProviderReadinessPanel";

describe("BroadcastProviderReadinessPanel", () => {
  it("renders local provider gates without live streaming claims", () => {
    render(
      <BroadcastProviderReadinessPanel readiness={createVerifyBroadcastProviderReadiness()} />,
    );

    const panel = screen.getByRole("region", { name: /broadcasting provider readiness/i });

    expect(within(panel).getByText("Broadcast Provider Live Readiness")).toBeInTheDocument();
    expect(within(panel).getByText("Local Capture Evidence")).toBeInTheDocument();
    expect(within(panel).getByText("Overlay Safety Review")).toBeInTheDocument();
    expect(within(panel).getByText("Upload Headroom Estimate")).toBeInTheDocument();
    expect(within(panel).getByText("Desktop Vault Slot")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Policy")).toBeInTheDocument();
    expect(within(panel).getByText("Provider Scope + Terms Policy")).toBeInTheDocument();
    expect(within(panel).getByText("OAuth scope review only")).toBeInTheDocument();
    expect(within(panel).getByText("No authorization redirect launch")).toBeInTheDocument();
    expect(within(panel).getByText("No provider chat/VOD writes")).toBeInTheDocument();
    expect(
      within(panel).getByText("Provider terms approval required before rollout"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Twitch")).toBeInTheDocument();
    expect(within(panel).getByText("YouTube")).toBeInTheDocument();
    expect(within(panel).getByText("Custom RTMP")).toBeInTheDocument();
    expect(within(panel).getByText("Provider OAuth Gate")).toBeInTheDocument();
    expect(within(panel).getByText("RTMP Live Output Gate")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted Chat Moderation Gate")).toBeInTheDocument();
    expect(within(panel).getByText("VOD Provider Sync Gate")).toBeInTheDocument();
    expect(within(panel).getByText("Go-Live Review Gate")).toBeInTheDocument();
    expect(within(panel).getByText("Local fixtures only")).toBeInTheDocument();
    expect(within(panel).getByText("No Twitch/YouTube OAuth")).toBeInTheDocument();
    expect(within(panel).getByText("No RTMP/live output")).toBeInTheDocument();
    expect(within(panel).getByText("No stream-key live use")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted chat moderation")).toBeInTheDocument();
    expect(within(panel).getByText("No VOD provider sync")).toBeInTheDocument();
    expect(within(panel).getByText("No audience/live-status claim")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /\b(?:live\s*(?:now|ready|online|enabled|started)|go[-\s]?live\s*(?:ready|enabled|available)|ready\s+for\s+(?:local\s+)?broadcast(?:\s+staging)?|rtmp(?:\s+ingest)?\s*(?:ready|connected|enabled|started)|(?:twitch|youtube|provider)\s*(?:oauth|stream(?:ing)?|live|chat|vod)\s*(?:ready|verified|connected|enabled|synced|complete)|chat\s+moderation\s*(?:ready|verified|enabled)|vod(?:\s+provider)?\s*(?:sync|archive)\s*(?:ready|verified|synced|enabled)|broadcast\s*(?:started|online))\b/i,
    );
  });
});
