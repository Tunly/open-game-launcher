import { describe, expect, it } from "vitest";

import {
  buildBroadcastRtmpDryRunPacket,
  createVerifyBroadcastRtmpDryRunPacket,
} from "../broadcast-rtmp-dry-run";

describe("buildBroadcastRtmpDryRunPacket", () => {
  it("redacts RTMP endpoint and stream-key fields without network or live claims", () => {
    const packet = createVerifyBroadcastRtmpDryRunPacket();

    expect(packet.provider).toBe("Twitch staging");
    expect(packet.redactedIngestUrl).toBe("rtmps://live.twitch.tv/[path-redacted]");
    expect(packet.keyHint).toBe("live...cdef");
    expect(packet.guardCopy).toContain("does not open a socket");
    expect(packet.guards).toContain("No socket opened");
    expect(packet.guards).toContain("No RTMP publish attempt");
    expect(packet.guards).toContain("No stream-key reveal");
    expect(packet.guards).toContain("No live output");
    expect(JSON.stringify(packet)).not.toContain("live_123456789_abcdef");
    expect(JSON.stringify(packet)).not.toMatch(
      /\b(?:rtmp(?:\s+ingest)?\s*(?:ready|connected|enabled|started)|stream\s*(?:started|online)|go[-\s]?live)\b/i,
    );
  });

  it("blocks non-rtmp endpoints before packet review", () => {
    const packet = buildBroadcastRtmpDryRunPacket({
      bitrateKbps: 4500,
      ingestUrl: "https://example.com/live/stream-key",
      keyConfigured: true,
      provider: "custom",
      resolution: "1280x720@60",
      streamKeyHint: "stream-key",
    });

    expect(packet.redactedIngestUrl).toBe("invalid endpoint");
    expect(packet.checks.find((check) => check.id === "endpoint-parse")).toMatchObject({
      status: "blocked",
    });
  });

  it("keeps missing stream keys out of the dry-run packet", () => {
    const packet = buildBroadcastRtmpDryRunPacket({
      bitrateKbps: 3500,
      ingestUrl: "rtmp://a.rtmp.youtube.com/live2/secret-key",
      keyConfigured: false,
      provider: "youtube",
      resolution: "1280x720@30",
    });

    expect(packet.provider).toBe("YouTube staging");
    expect(packet.keyHint).toBe("not configured");
    expect(packet.redactedIngestUrl).toBe("rtmp://a.rtmp.youtube.com/[path-redacted]");
    expect(packet.checks.find((check) => check.id === "stream-key-redaction")).toMatchObject({
      status: "blocked",
    });
  });
});
