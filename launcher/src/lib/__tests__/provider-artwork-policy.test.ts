import { describe, expect, it } from "vitest";

import {
  buildProviderArtworkCapsReview,
  buildProviderArtworkPolicyEvidence,
  createProviderArtworkCapsProof,
} from "../provider-artwork-policy";

describe("provider artwork policy", () => {
  it("approves Steam static artwork when the path app id matches the source id", () => {
    const evidence = buildProviderArtworkPolicyEvidence({
      provider: "steam",
      sourceId: "440",
      url: "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/440/header.jpg",
    });

    expect(evidence).toEqual(
      expect.objectContaining({
        host: "shared.cloudflare.steamstatic.com",
        provider: "steam",
        sourceId: "440",
        verdict: "approved",
      }),
    );
  });

  it("blocks Steam static artwork when the app id does not match the source id", () => {
    const evidence = buildProviderArtworkPolicyEvidence({
      provider: "steam",
      sourceId: "570",
      url: "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/440/header.jpg",
    });

    expect(evidence.verdict).toBe("blocked");
    expect(evidence.reason).toContain("does not match");
  });

  it("requires review for provider-hosted RAWG artwork without API source evidence", () => {
    const evidence = buildProviderArtworkPolicyEvidence({
      url: "https://media.rawg.io/media/games/logo.png",
    });

    expect(evidence).toEqual(
      expect.objectContaining({
        host: "media.rawg.io",
        provider: "rawg",
        sourceId: null,
        verdict: "review",
      }),
    );
  });

  it("approves RAWG media when it is tied to a RAWG game API result", () => {
    const evidence = buildProviderArtworkPolicyEvidence({
      provider: "rawg",
      sourceId: "3498",
      url: "https://media.rawg.io/media/games/3498/background.jpg",
    });

    expect(evidence.verdict).toBe("approved");
    expect(evidence.reason).toContain("RAWG game API result");
  });

  it("blocks unknown remote artwork hosts for provider import claims", () => {
    const evidence = buildProviderArtworkPolicyEvidence({
      url: "https://cdn.example.invalid/cover.jpg",
    });

    expect(evidence.verdict).toBe("blocked");
    expect(evidence.provider).toBe("unknown");
  });

  it("stages Steam, RAWG, and Epic provider caps without provider API claims", () => {
    const proof = createProviderArtworkCapsProof();

    expect(proof).toMatchObject({
      blockedCount: 0,
      passCount: 2,
      reviewCount: 1,
      statusLabel: "Caps review",
    });
    expect(proof.guards).toContain("No provider API calls");
    expect(proof.guards).toContain(
      "Epic CDN rows stay review-only until provider-approved source evidence exists",
    );
    expect(proof.entries.map((entry) => [entry.provider, entry.status])).toEqual([
      ["steam", "pass"],
      ["epic", "review"],
      ["rawg", "pass"],
    ]);
  });

  it("blocks Epic artwork caps when the path or byte cap is unsafe", () => {
    const review = buildProviderArtworkCapsReview({
      height: 1080,
      provider: "epic",
      sizeBytes: 8 * 1024 * 1024,
      sourceId: "mech-arcade-epic",
      url: "https://cdn1.epicgames.com/unreviewed/mech-arcade-epic/cover.jpg",
      width: 1920,
    });

    expect(review.status).toBe("blocked");
    expect(review.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Path", status: "blocked" }),
        expect.objectContaining({ label: "Bytes", status: "blocked" }),
      ]),
    );
  });
});
