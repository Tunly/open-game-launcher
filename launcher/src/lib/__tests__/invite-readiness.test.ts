import { describe, expect, it } from "vitest";

import {
  getInviteHostedReadiness,
  getInviteHostedReplayProofReadiness,
  getInviteHostedStagingRehearsal,
} from "../invite-readiness";

describe("invite hosted readiness", () => {
  it("blocks hosted staging when the fallback origin is not configured", () => {
    const readiness = getInviteHostedReadiness({
      hasConfiguredHostedOrigin: false,
      hostedVerified: false,
      isSignedIn: false,
      isSupabaseConfigured: true,
      lookupState: "resolved",
      token: "ogl_share.token.signature",
    });

    expect(readiness).toMatchObject({
      progress: 60,
      statusLabel: "Blocked",
      tone: "blocked",
    });
    expect(readiness.blocker).toEqual(
      expect.objectContaining({
        id: "hosted-web",
        label: "Hosted Web",
        status: "blocked",
      }),
    );
    expect(readiness.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "web-fallback", status: "ready" }),
        expect.objectContaining({ id: "deep-link", status: "ready" }),
        expect.objectContaining({ id: "share-rpc", status: "ready" }),
        expect.objectContaining({ id: "receiver-auth", status: "warning" }),
      ]),
    );
  });

  it("blocks all token-dependent gates when the route token is blank", () => {
    const readiness = getInviteHostedReadiness({
      hasConfiguredHostedOrigin: true,
      hostedVerified: true,
      isSignedIn: true,
      isSupabaseConfigured: true,
      lookupState: "resolved",
      token: "   ",
    });

    expect(readiness.statusLabel).toBe("Blocked");
    expect(readiness.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "web-fallback", status: "blocked" }),
        expect.objectContaining({ id: "deep-link", status: "blocked" }),
      ]),
    );
  });

  it("reports ready only after RPC, auth, origin and hosted verification pass", () => {
    const readiness = getInviteHostedReadiness({
      hasConfiguredHostedOrigin: true,
      hostedVerified: true,
      isSignedIn: true,
      isSupabaseConfigured: true,
      lookupState: "resolved",
      token: "ogl_share.token.signature",
    });

    expect(readiness).toMatchObject({
      blocker: null,
      progress: 100,
      statusLabel: "Ready",
      tone: "ready",
    });
    expect(readiness.rows.every((row) => row.status === "ready")).toBe(true);
  });

  it("keeps configured but unverified hosted origin as a warning", () => {
    const readiness = getInviteHostedReadiness({
      hasConfiguredHostedOrigin: true,
      hostedVerified: false,
      isSignedIn: true,
      isSupabaseConfigured: true,
      lookupState: "resolved",
      token: "ogl_share.token.signature",
    });

    expect(readiness).toMatchObject({
      blocker: null,
      progress: 80,
      statusLabel: "Needs hosted web",
      tone: "warning",
    });
    expect(readiness.rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "hosted-web", status: "warning" })]),
    );
  });

  it("tracks hosted token staging without claiming a hosted success", () => {
    const rehearsal = getInviteHostedStagingRehearsal({
      isSignedIn: false,
      isSupabaseConfigured: true,
      lookupState: "resolved",
      redeemState: "idle",
      token: "ogl_header.payload.signature",
    });

    expect(rehearsal).toMatchObject({
      progress: 40,
      statusLabel: "Rehearsal pending",
      tone: "warning",
    });
    expect(rehearsal.guards).toContain("No raw token stored");
    expect(rehearsal.guards).toContain("No hosted web success claim");
    expect(rehearsal.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "create-token", status: "ready" }),
        expect.objectContaining({ id: "resolve-token", status: "ready" }),
        expect.objectContaining({ id: "redeem-token", status: "warning" }),
        expect.objectContaining({ id: "replay-guard", status: "warning" }),
      ]),
    );
  });

  it("marks the local redeem rehearsal accepted while keeping hosted proof external", () => {
    const rehearsal = getInviteHostedStagingRehearsal({
      isSignedIn: true,
      isSupabaseConfigured: true,
      lookupState: "resolved",
      redeemState: "accepted",
      token: "ogl_header.payload.signature",
    });

    expect(rehearsal).toMatchObject({
      progress: 100,
      statusLabel: "Accepted locally",
      tone: "ready",
    });
    expect(rehearsal.summary).toContain("hosted deployment proof is still external");
    expect(rehearsal.steps.every((step) => step.status === "ready")).toBe(true);
  });

  it("blocks hosted replay proof until an HTTPS origin is configured", () => {
    const proofReadiness = getInviteHostedReplayProofReadiness({
      configuredHostedOrigin: "",
      isSignedIn: true,
      isSupabaseConfigured: true,
      proof: null,
      proofState: "idle",
      redeemState: "accepted",
      token: "ogl_header.payload.signature",
    });

    expect(proofReadiness).toMatchObject({
      progress: 0,
      statusLabel: "Blocked",
      tone: "blocked",
    });
    expect(proofReadiness.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "hosted-origin", status: "blocked" }),
        expect.objectContaining({ id: "replay-denial", status: "warning" }),
      ]),
    );
    expect(proofReadiness.guards).toContain("No production deployment claim");
  });

  it("keeps hosted replay proof pending without a proof packet", () => {
    const proofReadiness = getInviteHostedReplayProofReadiness({
      configuredHostedOrigin: "https://invite.og-launcher.test",
      isSignedIn: true,
      isSupabaseConfigured: true,
      proof: null,
      proofState: "unavailable",
      redeemState: "accepted",
      token: "ogl_header.payload.signature",
    });

    expect(proofReadiness).toMatchObject({
      progress: 0,
      statusLabel: "Proof pending",
      tone: "warning",
    });
    expect(proofReadiness.summary).toContain("Hosted replay/origin proof waits");
  });

  it("marks hosted replay proof captured only with origin and second redeem denial", () => {
    const proofReadiness = getInviteHostedReplayProofReadiness({
      configuredHostedOrigin: "https://invite.og-launcher.test",
      isSignedIn: true,
      isSupabaseConfigured: true,
      proof: {
        checkedAt: "2026-06-13T09:30:00.000Z",
        deploymentScope: "hosted-staging",
        gameInviteId: "invite-123",
        gameTitle: "Neon Circuit",
        guards: ["No raw token echoed", "No token hash returned"],
        inviteStatus: "accepted",
        maxUses: 1,
        origin: "https://invite.og-launcher.test",
        originVerified: true,
        platform: "steam",
        replayDenied: true,
        replayError: "Invite token is not redeemable.",
        tokenHint: "ogl_header...nature",
        usedAt: "2026-06-13T09:29:20.000Z",
        usesCount: 1,
      },
      proofState: "verified",
      redeemState: "accepted",
      token: "ogl_header.payload.signature",
    });

    expect(proofReadiness).toMatchObject({
      progress: 100,
      statusLabel: "Proof captured",
      tone: "ready",
    });
    expect(proofReadiness.summary).toContain("rejected second redeem");
    expect(proofReadiness.rows.every((row) => row.status === "ready")).toBe(true);
    expect(proofReadiness.tokenHint).toBe("ogl_header...nature");
  });
});
