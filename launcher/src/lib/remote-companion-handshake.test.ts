import { describe, expect, it } from "vitest";

import {
  createRemoteCompanionHandshake,
  formatRemoteCompanionDuration,
  recordRemoteCompanionPing,
  summarizeRemoteCompanionHandshake,
} from "./remote-companion-handshake";

describe("remote companion handshake", () => {
  it("creates a sanitized local pairing record without storing endpoint URLs or secrets", () => {
    const record = createRemoteCompanionHandshake({
      deviceLabel: "Desk<script> Relay",
      now: 1_780_000_000_000,
      pairingCode: "og-pair-123456",
    });

    expect(record).toMatchObject({
      createdAt: 1_780_000_000_000,
      deviceLabel: "Desk script Relay",
      expiresAt: 1_780_000_900_000,
      lastPingAt: null,
      pairingCode: "OG-PAIR-123456",
      version: 1,
    });
    expect(JSON.stringify(record)).not.toMatch(/https?:\/\//i);
    expect(JSON.stringify(record)).not.toMatch(/token|secret/i);
  });

  it("generates a compact OG pairing code when none is supplied", () => {
    const record = createRemoteCompanionHandshake({ now: 1_780_000_000_000 });

    expect(record.pairingCode).toMatch(/^OG-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  });

  it("summarizes missing, pairing, linked and expired states", () => {
    const now = 1_780_000_000_000;
    const record = createRemoteCompanionHandshake({
      now,
      pairingCode: "OG-ABC-123",
      ttlMs: 10 * 60 * 1000,
    });

    expect(summarizeRemoteCompanionHandshake(null, now)).toMatchObject({
      isLinked: false,
      status: "missing",
    });
    expect(summarizeRemoteCompanionHandshake(record, now + 60_000)).toMatchObject({
      expiresInMs: 9 * 60 * 1000,
      isLinked: false,
      status: "pairing",
    });

    const pinged = recordRemoteCompanionPing(record, now + 90_000);
    expect(summarizeRemoteCompanionHandshake(pinged, now + 120_000)).toMatchObject({
      isLinked: true,
      lastPingAgeMs: 30_000,
      status: "linked",
    });
    expect(summarizeRemoteCompanionHandshake(pinged, now + 11 * 60 * 1000)).toMatchObject({
      isLinked: false,
      status: "expired",
    });
  });

  it("rejects far-future ping timestamps", () => {
    const record = createRemoteCompanionHandshake({
      now: 1_780_000_000_000,
      pairingCode: "OG-ABC-123",
    });

    const summary = summarizeRemoteCompanionHandshake(
      { ...record, lastPingAt: 2_999_999_999_999 },
      1_780_000_010_000,
    );

    expect(summary.status).toBe("pairing");
    expect(summary.lastPingAgeMs).toBeNull();
  });

  it("formats durations for compact readouts", () => {
    expect(formatRemoteCompanionDuration(0)).toBe("0m");
    expect(formatRemoteCompanionDuration(1)).toBe("1m");
    expect(formatRemoteCompanionDuration(61_000)).toBe("2m");
  });
});
