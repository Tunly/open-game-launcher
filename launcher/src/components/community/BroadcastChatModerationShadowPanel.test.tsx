import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyBroadcastChatModerationShadowQueue } from "../../lib/broadcast-chat-moderation-shadow";
import { BroadcastChatModerationShadowPanel } from "./BroadcastChatModerationShadowPanel";

describe("BroadcastChatModerationShadowPanel", () => {
  it("renders local moderation queue evidence without provider enforcement claims", () => {
    render(
      <BroadcastChatModerationShadowPanel
        queue={createVerifyBroadcastChatModerationShadowQueue()}
      />,
    );

    const panel = screen.getByRole("region", {
      name: /broadcasting chat moderation shadow queue/i,
    });

    expect(within(panel).getByText("Moderation Shadow Queue")).toBeInTheDocument();
    expect(within(panel).getAllByText("Local shadow review")).toHaveLength(2);
    expect(within(panel).getByText("Shadow block preview")).toBeInTheDocument();
    expect(within(panel).getAllByText("Queue local review")).toHaveLength(2);
    expect(within(panel).getByText("Allow locally")).toBeInTheDocument();
    expect(within(panel).getByText("No provider chat read")).toBeInTheDocument();
    expect(within(panel).getByText("No Twitch/YouTube OAuth")).toBeInTheDocument();
    expect(within(panel).getByText("No hosted enforcement")).toBeInTheDocument();
    expect(within(panel).getByText("No moderation action sent")).toBeInTheDocument();
    expect(within(panel).getByText("No Supabase moderation logs")).toBeInTheDocument();
    expect(within(panel).getByText("No live chat replay")).toBeInTheDocument();
    expect(panel).toHaveTextContent("start RTMP/live output");
    expect(panel).toHaveTextContent("sync VOD");
    expect(panel).toHaveTextContent("update audience/live status");
    expect(panel).toHaveTextContent("[link-redacted]");
    expect(panel).toHaveTextContent("[secret-redacted]");
    expect(panel).not.toHaveTextContent("https://spam.example");
    expect(panel).not.toHaveTextContent("stream key");
    expect(panel).not.toHaveTextContent("live_123456789_abcdef");
    expect(panel).not.toHaveTextContent(
      /\b(?:(?:twitch|youtube|provider)\s*(?:chat|oauth|moderation)\s*(?:connected|ready|verified|enabled|synced|complete)|hosted\s*moderation\s*(?:ready|verified|enabled|complete)|(?:timeout|ban|delete)\s*(?:sent|executed|applied)|supabase\s*moderation\s*logs?\s*(?:written|synced|ready)|live\s*chat\s*replay\s*(?:ready|connected|synced)|rtmp(?:\/live|\s+live)?\s*output\s*(?:ready|started|enabled)|audience\s*status\s*(?:ready|updated|online))\b/i,
    );
  });
});
