import { describe, expect, it } from "vitest";

import {
  buildSmartInstallLocalMirrorAuditPacket,
  createVerifySmartInstallLocalMirrorAuditPacket,
} from "../smart-install-local-mirror-audit";
import type { SmartInstallSourceCandidate } from "../smart-install-planner";

const baseCandidate: SmartInstallSourceCandidate = {
  diskSpaceReady: true,
  estimatedMbps: 50,
  id: "cdn",
  installedClient: true,
  isLanPeer: false,
  label: "CDN",
  ownership: "owned",
  priceCents: null,
  provider: "OG Store",
  requiresExternalLauncher: false,
  trust: "verified",
};

describe("smart install local mirror audit", () => {
  it("builds a no-write rank diff from local mirror samples", () => {
    const packet = createVerifySmartInstallLocalMirrorAuditPacket();

    expect(packet.title).toBe("Local Mirror Measurement + Rank Diff");
    expect(packet.mode).toBe("Local fixture audit");
    expect(packet.writes).toBe("none");
    expect(packet.liveCalls).toBe("none");
    expect(packet.samples).toHaveLength(3);
    expect(packet.fastestCandidateId).toBe("lan-peer-cache");
    expect(packet.recommendedBefore).toBe("lan-peer-cache");
    expect(packet.recommendedAfter).toBe("lan-peer-cache");
    expect(packet.staleCount).toBe(1);
    expect(packet.samples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateId: "og-store-cdn",
          observedMbps: 104.9,
          redactedSource: "https://downloads.og-launcher.local/<redacted-path>",
          status: "fresh",
        }),
        expect.objectContaining({
          candidateId: "lan-peer-cache",
          observedMbps: 228.8,
          redactedSource: "lan://<redacted-peer>/<redacted-path>",
          status: "fresh",
        }),
        expect.objectContaining({
          candidateId: "steam-client",
          observedMbps: 41.9,
          redactedSource: "https://steam.example.invalid/<redacted-path>",
          status: "stale",
        }),
      ]),
    );
    expect(packet.rankDiff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          afterRank: 1,
          afterScore: 502,
          beforeRank: 1,
          beforeScore: 432,
          candidateId: "lan-peer-cache",
          speedDeltaMbps: 48.8,
        }),
      ]),
    );
    expect(JSON.stringify(packet)).not.toMatch(
      /ticket=|user=|auth=|token=|secret|chunk\.bin|game\.pkg/i,
    );
  });

  it("handles invalid local samples without creating live-call claims", () => {
    const packet = buildSmartInstallLocalMirrorAuditPacket({
      generatedAt: "2026-06-17T10:00:00.000Z",
      ttlMinutes: 5,
      samples: [
        {
          bytesDownloaded: 0,
          cacheAgeMinutes: 8,
          candidate: baseCandidate,
          elapsedMs: 0,
          sourceUrl: "not a url with secret-token",
        },
      ],
    });

    expect(packet.samples).toEqual([
      expect.objectContaining({
        observedMbps: 0,
        redactedSource: "<redacted-source>",
        status: "stale",
      }),
    ]);
    expect(packet.rankDiff[0]).toEqual(
      expect.objectContaining({
        afterRank: 1,
        afterScore: 0,
        beforeRank: 1,
        beforeScore: 175,
        speedDeltaMbps: -50,
      }),
    );
    expect(packet.writes).toBe("none");
    expect(packet.liveCalls).toBe("none");
  });
});
