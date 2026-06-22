import { describe, expect, it } from "vitest";

import {
  buildControllerCapabilityEvidence,
  buildControllerRuntimeActivationSafetyContract,
  createVerifyControllerCapabilityEvidence,
} from "../controller-capability-evidence";
import type { ControllerDevice, ControllerRuntimeStatus } from "../types/controllers";

const runtimeStatus: ControllerRuntimeStatus = {
  activeGameId: "local-game",
  activeLayoutName: "Capability Evidence Test",
  activeTemplate: "gamepadGyro",
  configPath: "test",
  driverMessage: "Runtime flags only.",
  keyboardMouseEmulationReady: true,
  nativePassthroughReady: false,
  vigemBusDetected: true,
};

function device(overrides: Partial<ControllerDevice> = {}): ControllerDevice {
  return {
    controllerType: "playstation",
    id: "dualsense",
    isConnected: true,
    name: "DualSense Evidence Pad",
    powerLevel: "wired",
    source: "test bridge",
    ...overrides,
  };
}

describe("buildControllerCapabilityEvidence", () => {
  it("maps DualSense type hints to inferred gyro and haptics evidence with native guards", () => {
    const plan = buildControllerCapabilityEvidence([device()], runtimeStatus);

    expect(plan.rows[0]).toMatchObject({
      confidence: "medium",
      gyroEvidence: "inferred",
      hapticsEvidence: "inferred",
      virtualPadEvidence: "vigem-runtime-flag",
    });
    expect(plan.runtimeSafety.status).toBe("local-status-only");
    expect(plan.runtimeEvidence).toContain("ViGEm runtime flag present");
    expect(plan.guards).toContain("No HID capability read");
    expect(plan.guards).toContain("No raw HID write");
    expect(plan.guards).toContain("No SDL probe");
    expect(plan.guards).toContain("No Steam Input enablement");
    expect(plan.guards).toContain("No Windows SendInput proof");
    expect(plan.guards).toContain("No haptics output");
    expect(plan.guards).toContain("No anti-cheat compatibility claim");
    expect(plan.guardCopy).toContain("no HID read/write");
    expect(plan.guardCopy).toContain("no Windows SendInput proof");
  });

  it("quarantines native runtime success wording as status text instead of proof", () => {
    const plan = buildControllerCapabilityEvidence([device()], {
      ...runtimeStatus,
      driverMessage:
        "Keyboard/mouse runtime is active via Windows SendInput. ViGEmBus detected. Native passthrough is active and virtual gamepad adapters can be added.",
    });

    expect(plan.runtimeSafety.status).toBe("native-claim-quarantined");
    expect(plan.runtimeSafety.blockedClaims).toContain("No OS input write proof");
    expect(plan.runtimeSafety.blockedClaims).toContain("No virtual HID device emission");
    expect(plan.runtimeSafety.blockedClaims).toContain("No Windows SendInput proof");
    expect(plan.runtimeEvidence).toContain(
      "Driver/native-output wording quarantined as status text, not proof",
    );
    expect(JSON.stringify(plan.runtimeEvidence)).not.toMatch(
      /runtime is active via Windows SendInput|ViGEmBus detected|native passthrough is active|virtual gamepad adapters can be added|HID ready|anti-cheat compatible/i,
    );
  });

  it("builds a standalone no-write/no-driver runtime activation safety contract", () => {
    const contract = buildControllerRuntimeActivationSafetyContract({
      ...runtimeStatus,
      driverMessage: "Driver ready; HID detected; SendInput proven; anti-cheat compatible.",
    });

    expect(contract.status).toBe("native-claim-quarantined");
    expect(contract.blockedClaims).toEqual(
      expect.arrayContaining([
        "No OS input write proof",
        "No driver install",
        "No HID capability read",
        "No virtual HID device emission",
        "No raw HID write",
        "No Windows SendInput proof",
        "No anti-cheat compatibility claim",
      ]),
    );
    expect(contract.findings).toContain(
      "Runtime status cannot prove driver, HID, SendInput, haptics, or anti-cheat success",
    );
  });

  it("keeps Xbox gyro evidence empty while preserving inferred haptics evidence", () => {
    const plan = buildControllerCapabilityEvidence(
      [
        device({
          controllerType: "xbox",
          id: "xbox-pad",
          name: "Xbox Haptics Evidence Pad",
        }),
      ],
      runtimeStatus,
    );

    expect(plan.rows[0]).toMatchObject({
      confidence: "medium",
      gyroEvidence: "none",
      hapticsEvidence: "inferred",
    });
  });

  it("keeps generic disconnected controllers low confidence with no gyro or haptics evidence", () => {
    const plan = buildControllerCapabilityEvidence(
      [
        device({
          controllerType: "generic",
          id: "generic-pad",
          isConnected: false,
          name: "Generic USB Evidence Gap",
        }),
      ],
      null,
    );

    expect(plan.rows[0]).toMatchObject({
      confidence: "low",
      connected: false,
      gyroEvidence: "none",
      hapticsEvidence: "none",
      virtualPadEvidence: "none",
    });
    expect(plan.runtimeEvidence).toContain("No runtime status snapshot");
  });

  it("returns a deterministic verify fixture without native capability claims", () => {
    const plan = createVerifyControllerCapabilityEvidence();
    const labels = plan.rows.map((row) => row.label);

    expect(labels).toEqual([
      "DualSense Evidence Pad",
      "Xbox Haptics Evidence Pad",
      "Generic USB Evidence Gap",
    ]);
    expect(plan.summary).toContain("Native capability claims remain blocked");
    expect(plan.runtimeEvidence).toContain("ViGEm runtime flag present");
    expect(plan.runtimeEvidence).toContain(
      "Runtime activation safety contract: local config/status evidence only",
    );
    expect(plan.guardCopy).not.toMatch(
      /haptics working|HID detected|Steam Input active|SendInput proven|anti-cheat compatible/i,
    );
  });
});
