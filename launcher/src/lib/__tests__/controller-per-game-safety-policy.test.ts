import { describe, expect, it } from "vitest";

import {
  buildControllerPerGameSafetyPolicyProof,
  createVerifyControllerPerGameSafetyPolicyProof,
  type ControllerPerGameSafetyCaseInput,
} from "../controller-per-game-safety-policy";

function policyCase(
  overrides: Partial<ControllerPerGameSafetyCaseInput> = {},
): ControllerPerGameSafetyCaseInput {
  return {
    antiCheatSensitive: true,
    gameId: "protected-game",
    layoutId: "layout-protected-raw-input",
    layoutName: "Protected Raw Input",
    perGameProfileStaged: true,
    protectedTitle: true,
    rawInputFallbackReady: true,
    requestedCapabilities: ["keyboard", "mouse", "raw-input fallback"],
    route: "raw-input-keyboard",
    selectedTemplate: "keyboardMouse",
    title: "Protected Game",
    ...overrides,
  };
}

describe("buildControllerPerGameSafetyPolicyProof", () => {
  it("creates a deterministic per-game safety proof without native routing claims", () => {
    const proof = createVerifyControllerPerGameSafetyPolicyProof();

    expect(proof.statusLabel).toBe("Policy blocked");
    expect(proof.reviewCount).toBe(2);
    expect(proof.blockedCount).toBe(1);
    expect(proof.passCount).toBe(0);
    expect(proof.blockedClaims).toContain("No controller injection claim");
    expect(proof.blockedClaims).toContain("No kernel driver install");
    expect(proof.blockedClaims).toContain("No raw HID write");
    expect(proof.blockedClaims).toContain("No Steam Input enablement");
    expect(proof.blockedClaims).toContain("No haptics output");
    expect(proof.blockedClaims).toContain("No anti-cheat compatibility claim");
    expect(proof.blockedClaims).toContain("No automatic launch routing change");
    expect(proof.guardCopy).toContain("local review only");
    expect(proof.guardCopy).not.toMatch(
      /controller injection enabled|driver installed|HID ready|Steam Input active|haptics working|anti-cheat compatible/i,
    );
  });

  it("blocks protected titles that do not have raw-input fallback", () => {
    const proof = buildControllerPerGameSafetyPolicyProof([
      policyCase({
        rawInputFallbackReady: false,
        requestedCapabilities: ["gyro intent"],
        route: "blocked",
      }),
    ]);

    expect(proof.cases[0]).toMatchObject({
      policyLabel: "Blocked before launch",
      status: "blocked",
    });
    expect(proof.cases[0].blockers).toContain("Protected title is missing a raw-input fallback");
    expect(proof.nextAction).toBe("Protected title is missing a raw-input fallback");
  });

  it("keeps protected raw-input profiles in review mode instead of claiming compatibility", () => {
    const proof = buildControllerPerGameSafetyPolicyProof([policyCase()]);

    expect(proof.cases[0]).toMatchObject({
      policyLabel: "Raw-input fallback only",
      status: "review",
    });
    expect(proof.cases[0].warnings).toContain(
      "Protected-title policy stays review-only; no anti-cheat compatibility claim",
    );
    expect(proof.cases[0].evidence).toContain("raw-input fallback staged");
    expect(proof.summary).toContain("native routing remains review-only");
  });
});
