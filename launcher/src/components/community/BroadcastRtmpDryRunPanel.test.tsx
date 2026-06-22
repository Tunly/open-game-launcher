import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createVerifyBroadcastRtmpDryRunPacket } from "../../lib/broadcast-rtmp-dry-run";
import { BroadcastRtmpDryRunPanel } from "./BroadcastRtmpDryRunPanel";

describe("BroadcastRtmpDryRunPanel", () => {
  it("renders a redacted RTMP dry-run packet without live execution claims", () => {
    render(<BroadcastRtmpDryRunPanel packet={createVerifyBroadcastRtmpDryRunPacket()} />);

    const panel = screen.getByRole("region", { name: /broadcasting rtmp dry-run packet/i });

    expect(within(panel).getByText("RTMP Dry-Run Packet")).toBeInTheDocument();
    expect(within(panel).getByText("Twitch staging")).toBeInTheDocument();
    expect(within(panel).getByText("rtmps://live.twitch.tv/[path-redacted]")).toBeInTheDocument();
    expect(within(panel).getByText("live...cdef")).toBeInTheDocument();
    expect(within(panel).getByText("Endpoint Parse")).toBeInTheDocument();
    expect(within(panel).getByText("Stream-Key Redaction")).toBeInTheDocument();
    expect(within(panel).getByText("Network Skip")).toBeInTheDocument();
    expect(within(panel).getByText("No socket opened")).toBeInTheDocument();
    expect(within(panel).getByText("No RTMP publish attempt")).toBeInTheDocument();
    expect(within(panel).getByText("No stream-key reveal")).toBeInTheDocument();
    expect(within(panel).getByText("No live output")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent("live_123456789_abcdef");
    expect(panel).not.toHaveTextContent(
      /\b(?:live\s*(?:now|ready|online|enabled|started)|go[-\s]?live\s*(?:ready|enabled|available)|rtmp(?:\s+ingest)?\s*(?:ready|connected|enabled|started)|stream\s*(?:started|online)|provider\s*(?:oauth|stream(?:ing)?|live)\s*(?:ready|verified|connected|enabled|complete))\b/i,
    );
  });
});
