import { describe, expect, it } from "vitest";

import { buildLanTransferPlan, type LanTransferPeerCandidate } from "../lan-transfer-planner";

const basePeer: LanTransferPeerCandidate = {
  availableGameCount: 8,
  diskSpaceReady: true,
  estimatedMbps: 420,
  id: "den-pc",
  label: "Den PC",
  lastSeenMinutes: 2,
  libraryShareEnabled: true,
  paired: true,
  platform: "windows",
  sameNetwork: true,
  trust: "paired",
};

describe("buildLanTransferPlan", () => {
  it("prefers a paired, fast, fresh LAN peer", () => {
    const plan = buildLanTransferPlan([
      {
        ...basePeer,
        estimatedMbps: 180,
        id: "slow-paired",
        label: "Slow Paired Rig",
      },
      {
        ...basePeer,
        availableGameCount: 14,
        estimatedMbps: 520,
        id: "fast-paired",
        label: "Fast Paired Rig",
      },
    ]);

    expect(plan.recommended?.id).toBe("fast-paired");
    expect(plan.readyCount).toBe(2);
    expect(plan.checklist).toContain("Fast Paired Rig is the current LAN transfer pick");
  });

  it("keeps unpaired local peers usable but warning-gated", () => {
    const plan = buildLanTransferPlan([
      {
        ...basePeer,
        id: "guest-rig",
        label: "Guest Rig",
        paired: false,
        trust: "local",
      },
    ]);

    expect(plan.recommended?.id).toBe("guest-rig");
    expect(plan.warningCount).toBe(1);
    expect(plan.recommended?.warnings).toContain("Pair this device before copying game data");
    expect(plan.summary).toBe(
      "Guest Rig is the best local peer, but pairing evidence is still incomplete.",
    );
  });

  it("blocks peers without network, sharing, disk, games, or throughput", () => {
    const plan = buildLanTransferPlan([
      {
        ...basePeer,
        availableGameCount: 0,
        diskSpaceReady: false,
        estimatedMbps: 0,
        id: "blocked-peer",
        label: "Blocked Peer",
        libraryShareEnabled: false,
        sameNetwork: false,
      },
    ]);

    expect(plan.recommended).toBeNull();
    expect(plan.blockedCount).toBe(1);
    expect(plan.peers[0].blockers).toContain("Peer is not on the local network");
    expect(plan.peers[0].blockers).toContain("No transferable games advertised");
  });

  it("returns an actionable empty state", () => {
    const plan = buildLanTransferPlan([]);

    expect(plan.recommended).toBeNull();
    expect(plan.summary).toBe("LAN Transfer is waiting for a second OG-Launcher device.");
    expect(plan.checklist).toContain("No LAN peers staged");
  });
});
