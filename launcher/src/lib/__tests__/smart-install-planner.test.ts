import { describe, expect, it } from "vitest";

import { buildSmartInstallPlan, type SmartInstallSourceCandidate } from "../smart-install-planner";

const baseCandidate: SmartInstallSourceCandidate = {
  diskSpaceReady: true,
  estimatedMbps: 80,
  id: "og-cdn",
  installedClient: true,
  isLanPeer: false,
  label: "OG Store CDN",
  ownership: "owned",
  priceCents: null,
  provider: "OG Store",
  requiresExternalLauncher: false,
  trust: "verified",
};

describe("buildSmartInstallPlan", () => {
  it("prefers a free LAN peer over slower owned CDN sources", () => {
    const plan = buildSmartInstallPlan([
      baseCandidate,
      {
        ...baseCandidate,
        estimatedMbps: 220,
        id: "lan-peer",
        isLanPeer: true,
        label: "LAN Peer Cache",
        ownership: "free",
        provider: "LAN",
        trust: "local",
      },
    ]);

    expect(plan.recommended?.id).toBe("lan-peer");
    expect(plan.readyCount).toBe(1);
    expect(plan.warningCount).toBe(1);
    expect(plan.checklist).toContain("LAN Peer Cache is the current auto-pick");
  });

  it("blocks external launcher candidates when the client is not installed", () => {
    const plan = buildSmartInstallPlan([
      {
        ...baseCandidate,
        id: "steam",
        installedClient: false,
        label: "Steam Client",
        provider: "Steam",
        requiresExternalLauncher: true,
      },
    ]);

    expect(plan.recommended).toBeNull();
    expect(plan.blockedCount).toBe(1);
    expect(plan.candidates[0].blockers).toContain("Install Steam client first");
    expect(plan.summary).toBe("Smart Install found candidates, but every source is blocked.");
  });

  it("uses price and speed as deterministic tie-breakers", () => {
    const plan = buildSmartInstallPlan([
      {
        ...baseCandidate,
        id: "paid-fast",
        label: "Paid Fast Mirror",
        ownership: "paid",
        priceCents: 1999,
      },
      {
        ...baseCandidate,
        estimatedMbps: 85,
        id: "owned-fast",
        label: "Owned Fast Mirror",
      },
      {
        ...baseCandidate,
        estimatedMbps: 85,
        id: "owned-fast-b",
        label: "Owned Fast Mirror B",
      },
    ]);

    expect(plan.recommended?.id).toBe("owned-fast");
    expect(plan.candidates.map((candidate) => candidate.id)).toEqual([
      "owned-fast",
      "owned-fast-b",
      "paid-fast",
    ]);
    expect(plan.candidates.find((candidate) => candidate.id === "paid-fast")?.warnings).toContain(
      "Costs $19.99 before install",
    );
  });

  it("returns an actionable empty-state plan", () => {
    const plan = buildSmartInstallPlan([]);

    expect(plan.recommended).toBeNull();
    expect(plan.readyCount).toBe(0);
    expect(plan.blockedCount).toBe(0);
    expect(plan.summary).toBe(
      "Smart Install is waiting for local provider, store, or LAN candidates.",
    );
    expect(plan.checklist).toContain("No install sources staged");
  });
});
