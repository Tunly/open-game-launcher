import { describe, expect, it } from "vitest";

import {
  buildBroadcastAudienceStatusContract,
  createVerifyBroadcastAudienceStatusContract,
} from "../broadcast-audience-status-contract";

describe("buildBroadcastAudienceStatusContract", () => {
  it("keeps audience/live status as local contract evidence without provider claims", () => {
    const contract = createVerifyBroadcastAudienceStatusContract();

    expect(contract.statusLabel).toBe("Local status contract");
    expect(contract.reviewCount).toBe(3);
    expect(contract.blockedCount).toBe(5);
    expect(contract.guards).toContain("Local contract fixtures only");
    expect(contract.guards).toContain("No provider live-state read");
    expect(contract.guards).toContain("No audience count polling");
    expect(contract.guards).toContain("No Supabase audience row mutation");
    expect(contract.guards).toContain("No public live badge update");
    expect(contract.guardCopy).toContain("does not read provider live state");
    expect(contract.items.map((item) => item.id)).toEqual([
      "local-preview-state",
      "provider-live-state-event",
      "audience-count-snapshot",
      "chat-presence-merge",
      "public-status-write",
      "supabase-audience-row",
      "stale-status-fallback",
      "rollback-clear-status",
    ]);
    expect(contract.items.find((item) => item.id === "provider-live-state-event")?.status).toBe(
      "blocked",
    );
    expect(contract.summary).not.toMatch(
      /live status ready|audience status updated|viewer count verified|provider live-state connected|public live badge updated|supabase audience row written/i,
    );
  });

  it("can represent a fully staged contract without claiming provider execution", () => {
    const contract = buildBroadcastAudienceStatusContract({
      audienceCountReadStaged: true,
      chatPresenceMergeStaged: true,
      localPreviewStateDrafted: true,
      providerLiveStateCallbackStaged: true,
      publicStatusWriteStaged: true,
      rollbackClearStatusReviewed: true,
      staleStatusFallbackReviewed: true,
      supabaseAudienceRowStaged: true,
    });

    expect(contract.blockedCount).toBe(0);
    expect(contract.reviewCount).toBe(8);
    expect(contract.statusLabel).toBe("Needs provider staging");
    expect(contract.items.find((item) => item.id === "public-status-write")?.status).toBe("review");
    expect(contract.guardCopy).toContain("does not publish public status");
  });
});
