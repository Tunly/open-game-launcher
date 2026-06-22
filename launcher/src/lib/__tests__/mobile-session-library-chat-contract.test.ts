import { describe, expect, it } from "vitest";

import {
  buildMobileSessionLibraryChatContract,
  createVerifyMobileSessionLibraryChatContract,
  MOBILE_SESSION_LIBRARY_CHAT_BLOCKED_CLAIMS,
} from "../mobile-session-library-chat-contract";

const falseMobileContractClaim =
  /\b(?:native\s*(?:ios|android)\s*app\s*(?:ready|shipped|released|installed)|mobile\s*(?:auth|session)\s*(?:issued|stored|verified|complete)|secure\s*storage\s*(?:written|stored|verified|complete)|(?:access|refresh)\s*token\s*(?:stored|used|issued|read|written|raw)|library\s*(?:mutation|write|sync)\s*(?:complete|verified|written|succeeded)|chat\s*(?:message\s*)?(?:sent|inserted|delivered)|supabase\s*(?:write|insert|update)\s*(?:complete|succeeded|verified)|apns\s*(?:request\s*)?sent|fcm\s*(?:request\s*)?sent|push\s*(?:notification\s*)?(?:sent|delivered)|app\s*store\s*(?:live|released|approved)|hosted\s*production\s*e2e\s*(?:passed|complete|verified))\b/i;

describe("createVerifyMobileSessionLibraryChatContract", () => {
  it("creates a no-write contract without false native mobile or hosted claims", () => {
    const contract = createVerifyMobileSessionLibraryChatContract();

    expect(contract.statusLabel).toBe("No-write review");
    expect(contract.passCount).toBe(2);
    expect(contract.reviewCount).toBe(3);
    expect(contract.blockedClaims).toEqual(MOBILE_SESSION_LIBRARY_CHAT_BLOCKED_CLAIMS);
    expect(contract.guardCopy).toContain("Local no-write contract only");
    expect(contract.guardCopy).toContain("without native app storage");
    expect(contract.lanes.map((lane) => lane.id)).toEqual([
      "session-envelope",
      "library-projection",
      "chat-read-scope",
      "chat-send-queue",
      "token-redaction",
    ]);
    expect(JSON.stringify(contract)).not.toMatch(falseMobileContractClaim);
  });

  it("pins scoped library and token redaction evidence", () => {
    const contract = buildMobileSessionLibraryChatContract({
      chatReadScopeReady: true,
      chatSendQueueReady: true,
      libraryProjectionReady: true,
      sessionEnvelopeReady: true,
      tokenRedactionReady: true,
    });
    const libraryLane = contract.lanes.find((lane) => lane.id === "library-projection");
    const tokenLane = contract.lanes.find((lane) => lane.id === "token-redaction");

    expect(libraryLane).toEqual(
      expect.objectContaining({
        evidence: "fields:id,title,source,installStatus,artworkHint",
        skipped: "No install path, save path, or mutation payload",
        status: "pass",
      }),
    );
    expect(tokenLane).toEqual(
      expect.objectContaining({
        evidence: "tokenHint:mobile-session-[redacted]",
        skipped: "No access token or refresh token exposure",
        status: "pass",
      }),
    );
  });
});
