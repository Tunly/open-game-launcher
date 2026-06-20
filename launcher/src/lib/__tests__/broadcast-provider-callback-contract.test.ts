import { describe, expect, it } from "vitest";

import {
  buildBroadcastProviderCallbackContract,
  createVerifyBroadcastProviderCallbackContract,
} from "../broadcast-provider-callback-contract";

const falseProviderCallbackClaim =
  /\b(?:(?:twitch|youtube|provider)\s*(?:oauth|callback|webhook|event)\s*(?:ready|verified|connected|enabled|complete|received|processed)|oauth\s*(?:token\s*)?(?:exchanged|connected|verified|complete)|(?:rtmp(?:\/live|\s+live|\s+ingest)?|live\s+output)\s*(?:ready|connected|enabled|started|published)|hosted\s*(?:callback|webhook|endpoint|function)\s*(?:executed|execution|ready|verified|enabled|deployed|complete|called)|supabase\s*(?:callback|webhook|broadcast(?:ing)?|row|audit)\s*(?:write|writes|written|inserted|updated|synced|ready|verified|complete)|provider\s*webhooks?\s*(?:received|verified|processed|complete)|callback\s+row\s*(?:inserted|written|processed|verified)|callback\s*(?:received|verified|processed|complete)|webhook\s*(?:received|verified|processed|complete)|replay\s*(?:processed|replayed|drained|complete)|vod(?:\s+provider)?\s*(?:sync|archive)\s*(?:ready|verified|synced|enabled|complete|processed)|audience(?:\/live)?\s*status\s*(?:ready|updated|online|synced)|live\s*status\s*(?:ready|updated|online|synced))\b/i;

describe("buildBroadcastProviderCallbackContract", () => {
  it("creates local callback contract review without hosted callback claims", () => {
    const contract = createVerifyBroadcastProviderCallbackContract();

    expect(contract.statusLabel).toBe("Local contract review");
    expect(contract.reviewCount).toBe(5);
    expect(contract.blockedCount).toBe(6);
    expect(contract.guards).toContain("Local contract fixtures only");
    expect(contract.guards).toContain("No Twitch/YouTube OAuth");
    expect(contract.guards).toContain("No OAuth token exchange");
    expect(contract.guards).toContain("No RTMP/live output");
    expect(contract.guards).toContain("No hosted endpoint deployment");
    expect(contract.guards).toContain("No callback runner");
    expect(contract.guards).toContain("No provider delivery proof");
    expect(contract.guards).toContain("No signature proof");
    expect(contract.guards).toContain("No Supabase callback row mutation");
    expect(contract.guards).toContain("Replay fixture only");
    expect(contract.guards).toContain("No replay runner");
    expect(contract.guards).toContain("No VOD sync job");
    expect(contract.guards).toContain("No audience/live-status claim");
    expect(contract.guardCopy).toContain("does not run Twitch/YouTube OAuth");
    expect(contract.guardCopy).toContain("accept provider webhook deliveries");
    expect(contract.guardCopy).toContain("process replay deliveries");
    expect(JSON.stringify(contract)).not.toMatch(falseProviderCallbackClaim);
  });

  it("flags hosted callback wording as false-claim copy", () => {
    const falseClaims = [
      "provider webhook received",
      "provider webhook verified",
      "hosted callback ready",
      "hosted endpoint deployed",
      "callback row inserted",
      "Supabase callback written",
      "replay processed",
      "VOD sync ready",
      "audience status updated",
      "live output started",
    ];

    for (const claim of falseClaims) {
      expect(claim).toMatch(falseProviderCallbackClaim);
    }
  });

  it("keeps local event, signature, idempotency, replay, and audit fixtures in review", () => {
    const contract = createVerifyBroadcastProviderCallbackContract();

    expect(contract.items.find((item) => item.id === "event-schema-fixture")).toMatchObject({
      label: "Event schema fixture",
      status: "review",
    });
    expect(contract.items.find((item) => item.id === "signature-header-checklist")).toMatchObject({
      label: "Signature header checklist",
      status: "review",
    });
    expect(contract.items.find((item) => item.id === "idempotency-key-plan")).toMatchObject({
      label: "Idempotency key plan",
      status: "review",
    });
    expect(contract.items.find((item) => item.id === "replay-duplicate-fixture")).toMatchObject({
      label: "Replay duplicate fixture",
      status: "review",
    });
    expect(contract.items.find((item) => item.id === "redacted-audit-row-shape")).toMatchObject({
      label: "Redacted audit row shape",
      status: "review",
    });
    expect(contract.items.find((item) => item.id === "hosted-endpoint")).toMatchObject({
      status: "blocked",
    });
    expect(contract.items.find((item) => item.id === "provider-delivery")).toMatchObject({
      status: "blocked",
    });
    expect(contract.items.find((item) => item.id === "supabase-callback-write")).toMatchObject({
      status: "blocked",
    });
  });

  it("blocks every callback lane when local contract fixtures are absent", () => {
    const contract = buildBroadcastProviderCallbackContract({
      audienceStatusCallbackStaged: false,
      eventSchemaFixtureDrafted: false,
      hostedEndpointStaged: false,
      idempotencyKeyPlanDrafted: false,
      providerDeliveryStaged: false,
      redactedAuditRowShapeDrafted: false,
      replayDuplicateFixtureDrafted: false,
      replayRunnerStaged: false,
      signatureHeaderChecklistDrafted: false,
      supabaseCallbackWriteStaged: false,
      vodSyncCallbackStaged: false,
    });

    expect(contract.reviewCount).toBe(0);
    expect(contract.blockedCount).toBe(11);
    expect(contract.items.every((item) => item.status === "blocked")).toBe(true);
    expect(JSON.stringify(contract)).not.toMatch(falseProviderCallbackClaim);
  });
});
