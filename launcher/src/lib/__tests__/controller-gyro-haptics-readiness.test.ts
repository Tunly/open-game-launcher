import { describe, expect, it } from "vitest";

import {
  buildControllerGyroHapticsReadinessPlan,
  type ControllerGyroHapticsCandidate,
} from "../controller-gyro-haptics-readiness";

const nativeSuccessPattern =
  /\b(?:driver installed|HID detected|HID write ready|HID output working|SendInput proven|gyro output working|haptics output working|anti-cheat compatible)\b/i;

function candidate(
  overrides: Partial<ControllerGyroHapticsCandidate> = {},
): ControllerGyroHapticsCandidate {
  return {
    antiCheatSensitive: false,
    connected: true,
    controllerType: "playstation",
    gyroRequested: true,
    gyroSensorDetected: true,
    hapticsActuatorDetected: true,
    hapticsRequested: true,
    hidWriteReady: false,
    id: "dualsense",
    label: "DualSense Motion Preview",
    layoutReady: true,
    perGameProfileReady: true,
    rawInputFallbackReady: true,
    steamInputBridgeReady: false,
    ...overrides,
  };
}

describe("buildControllerGyroHapticsReadinessPlan", () => {
  it("keeps local motion and haptics evidence as warning until native paths exist", () => {
    const plan = buildControllerGyroHapticsReadinessPlan([candidate()]);

    expect(plan.recommended?.label).toBe("DualSense Motion Preview");
    expect(plan.recommended?.status).toBe("warning");
    expect(plan.warningCount).toBe(1);
    expect(plan.guards).toContain("Gyro intent staged");
    expect(plan.guards).toContain("Haptics intent staged");
    expect(plan.guards).toContain("No driver install");
    expect(plan.guards).toContain("No Steam Input enablement");
    expect(plan.guards).toContain("No HID capability read");
    expect(plan.guards).toContain("No HID write");
    expect(plan.guards).toContain("No Windows SendInput proof");
    expect(plan.guards).toContain("No gyro output");
    expect(plan.guards).toContain("No haptics output");
    expect(plan.guardCopy).toContain("No driver install");
    expect(plan.guardCopy).toContain("no HID capability read/write");
    expect(plan.guardCopy).toContain("no Windows SendInput proof");
    expect(plan.recommended?.warnings).toContain("Steam Input bridge is not connected");
    expect(plan.recommended?.warnings).toContain("HID write safety contract is not staged");
    expect(JSON.stringify(plan)).not.toMatch(nativeSuccessPattern);
  });

  it("blocks protected motion routing without raw-input fallback", () => {
    const plan = buildControllerGyroHapticsReadinessPlan([
      candidate({
        antiCheatSensitive: true,
        id: "protected-title",
        label: "Protected Motion Lane",
        rawInputFallbackReady: false,
      }),
    ]);

    expect(plan.recommended).toBeNull();
    expect(plan.blockedCount).toBe(1);
    expect(plan.lanes[0].blockers).toContain(
      "Protected games need a raw-input fallback before motion routing",
    );
  });

  it("marks a fully staged fixture ready for review", () => {
    const plan = buildControllerGyroHapticsReadinessPlan([
      candidate({
        hidWriteReady: true,
        steamInputBridgeReady: true,
      }),
    ]);

    expect(plan.readyCount).toBe(1);
    expect(plan.recommended?.status).toBe("ready");
    expect(plan.summary).toBe(
      "DualSense Motion Preview has local motion and haptics evidence ready for staged review.",
    );
    expect(plan.guards).toContain("No HID write");
    expect(JSON.stringify(plan)).not.toMatch(nativeSuccessPattern);
  });
});
