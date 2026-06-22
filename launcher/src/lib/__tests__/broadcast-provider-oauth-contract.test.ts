import { describe, expect, it } from "vitest";

import {
  buildBroadcastProviderOAuthContract,
  createVerifyBroadcastProviderOAuthContract,
} from "../broadcast-provider-oauth-contract";

const falseProviderOAuthClaim =
  /\b(?:(?:twitch|youtube|provider)\s*(?:oauth|authorization|auth|token|chat|vod|live)\s*(?:ready|verified|connected|enabled|complete|authorized|stored|synced)|oauth\s*(?:authorization|redirect|token|exchange)\s*(?:ready|opened|sent|complete|verified|connected|enabled|exchanged)|token\s*(?:exchange|request|storage|refresh|revocation)\s*(?:ready|sent|complete|verified|connected|enabled|stored)|provider\s*(?:chat|vod)\s*(?:read|sync|archive)\s*(?:ready|verified|synced|enabled|complete)|hosted\s*(?:oauth|callback|endpoint|function)\s*(?:ready|verified|enabled|deployed|complete|called)|(?:rtmp(?:\/live|\s+live|\s+ingest)?|live\s+output)\s*(?:ready|connected|enabled|started|published)|audience(?:\/live)?\s*status\s*(?:ready|updated|online|synced))\b/i;

describe("buildBroadcastProviderOAuthContract", () => {
  it("creates local OAuth contract review without provider OAuth claims", () => {
    const contract = createVerifyBroadcastProviderOAuthContract();

    expect(contract.statusLabel).toBe("Local OAuth contract");
    expect(contract.reviewCount).toBe(7);
    expect(contract.blockedCount).toBe(5);
    expect(contract.guards).toContain("Local OAuth contract only");
    expect(contract.guards).toContain("No Twitch/YouTube OAuth");
    expect(contract.guards).toContain("No OAuth authorization redirect");
    expect(contract.guards).toContain("No OAuth token exchange");
    expect(contract.guards).toContain("No provider access token stored");
    expect(contract.guards).toContain("No provider chat read");
    expect(contract.guards).toContain("No VOD provider sync");
    expect(contract.guards).toContain("No RTMP/live output");
    expect(contract.guards).toContain("No hosted callback endpoint");
    expect(contract.guards).toContain("No audience/live-status claim");
    expect(contract.guardCopy).toContain("does not open Twitch/YouTube authorization");
    expect(contract.guardCopy).toContain("exchange OAuth tokens");
    expect(contract.guardCopy).toContain("store provider access tokens");
    expect(JSON.stringify(contract)).not.toMatch(falseProviderOAuthClaim);
  });

  it("flags provider OAuth wording as false-claim copy", () => {
    const falseClaims = [
      "Twitch OAuth ready",
      "OAuth authorization opened",
      "OAuth token exchanged",
      "provider token stored",
      "hosted callback deployed",
      "provider chat read ready",
      "provider VOD sync complete",
      "RTMP live output started",
      "audience status updated",
    ];

    for (const claim of falseClaims) {
      expect(claim).toMatch(falseProviderOAuthClaim);
    }
  });

  it("keeps PKCE, state, redirect, scope, callback, token, and redaction fixtures in review", () => {
    const contract = createVerifyBroadcastProviderOAuthContract();

    expect(contract.items.find((item) => item.id === "pkce-challenge")).toMatchObject({
      label: "PKCE challenge fixture",
      status: "review",
    });
    expect(contract.items.find((item) => item.id === "state-nonce-fixture")).toMatchObject({
      label: "State nonce fixture",
      status: "review",
    });
    expect(contract.items.find((item) => item.id === "redirect-allowlist")).toMatchObject({
      label: "Redirect URI allowlist",
      status: "review",
    });
    expect(contract.items.find((item) => item.id === "scope-review")).toMatchObject({
      label: "Provider scope review",
      status: "review",
    });
    expect(contract.items.find((item) => item.id === "callback-error-taxonomy")).toMatchObject({
      label: "Callback error taxonomy",
      status: "review",
    });
    expect(contract.items.find((item) => item.id === "token-storage-boundary")).toMatchObject({
      label: "Token storage boundary",
      status: "review",
    });
    expect(contract.items.find((item) => item.id === "redacted-secret-handling")).toMatchObject({
      label: "Redacted secret handling",
      status: "review",
    });
    expect(contract.items.find((item) => item.id === "token-exchange")).toMatchObject({
      status: "blocked",
    });
  });

  it("blocks every OAuth lane when local contract fixtures are absent", () => {
    const contract = buildBroadcastProviderOAuthContract({
      callbackErrorTaxonomyDrafted: false,
      hostedCallbackEndpointStaged: false,
      oauthAuthorizeLaunchStaged: false,
      pkceChallengeDrafted: false,
      providerAppRegistrationStaged: false,
      providerChatVodHandoffStaged: false,
      redirectAllowlistDrafted: false,
      redactedSecretHandlingDrafted: false,
      scopeReviewDrafted: false,
      stateNonceFixtureDrafted: false,
      tokenExchangeStaged: false,
      tokenStorageBoundaryDrafted: false,
    });

    expect(contract.reviewCount).toBe(0);
    expect(contract.blockedCount).toBe(12);
    expect(contract.items.every((item) => item.status === "blocked")).toBe(true);
    expect(JSON.stringify(contract)).not.toMatch(falseProviderOAuthClaim);
  });
});
