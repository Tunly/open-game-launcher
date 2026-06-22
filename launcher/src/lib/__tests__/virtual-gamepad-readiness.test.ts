import { describe, expect, it } from "vitest";

import { buildVirtualGamepadReadinessPlan } from "../virtual-gamepad-readiness";

const falseClaimPattern =
  /driver installed|ViGEm installed|DS4Windows installed|virtual HID emitted|raw HID written|Steam Input active|gyro output working|haptics output working|SendInput proven|anti-cheat compatible|protected title validated|launch routing changed/i;

describe("buildVirtualGamepadReadinessPlan", () => {
  it("recommends a fully staged local virtual-pad lane", () => {
    const plan = buildVirtualGamepadReadinessPlan([
      {
        adminApproved: true,
        antiCheatSensitive: false,
        connected: true,
        driverMode: "vigem",
        gyroDriverReady: true,
        gyroRequested: true,
        hapticsDriverReady: true,
        hapticsRequested: true,
        id: "arcade-pad",
        label: "Arcade Pad",
        layoutReady: true,
        rawInputFallbackReady: true,
        signedDriverReady: true,
        target: "Local Co-Op",
        virtualDriverReady: true,
      },
    ]);

    expect(plan.recommended?.label).toBe("Arcade Pad");
    expect(plan.recommended?.status).toBe("ready");
    expect(plan.readyCount).toBe(1);
    expect(plan.summary).toBe("Arcade Pad can be staged through local runtime-flag review.");
    expect(plan.checklist).toContain("Arcade Pad is the current virtual gamepad pick");
    expect(plan.checklist).toContain("1 runtime bridge flag record present");
    expect(plan.checklist).toContain("1 signed-driver review record present");
    expect(plan.guardCopy).toContain("local runtime-flag");
    expect(plan.guardCopy).toContain("does not install drivers");
    expect(plan.guards).toContain("No kernel driver install");
    expect(plan.guards).toContain("No ViGEm/DS4Windows install");
    expect(plan.guards).toContain("No virtual HID device emission");
    expect(plan.guards).toContain("No raw HID write");
    expect(plan.guards).toContain("No Steam Input enablement");
    expect(plan.guards).toContain("No gyro output");
    expect(plan.guards).toContain("No haptics output");
    expect(plan.guards).toContain("No Windows SendInput dispatch");
    expect(plan.guards).toContain("No Windows SendInput proof");
    expect(plan.guards).toContain("No anti-cheat compatibility claim");
    expect(plan.guardCopy).toContain("dispatch or prove Windows SendInput");
    expect(plan.guards).toContain("No protected-title validation");
    expect(plan.guards).toContain("No automatic launch routing change");
    expect(JSON.stringify(plan)).not.toMatch(falseClaimPattern);
  });

  it("keeps protected games in warning state when raw-input fallback is required", () => {
    const plan = buildVirtualGamepadReadinessPlan([
      {
        adminApproved: false,
        antiCheatSensitive: true,
        connected: true,
        driverMode: "vigem",
        gyroDriverReady: false,
        gyroRequested: true,
        hapticsDriverReady: true,
        hapticsRequested: false,
        id: "dualsense",
        label: "DualSense Lane",
        layoutReady: true,
        rawInputFallbackReady: true,
        signedDriverReady: true,
        target: "Protected Shooter",
        virtualDriverReady: true,
      },
    ]);

    expect(plan.recommended?.label).toBe("DualSense Lane");
    expect(plan.recommended?.status).toBe("warning");
    expect(plan.warningCount).toBe(1);
    expect(plan.recommended?.warnings).toContain(
      "Use raw-input fallback for protected games; do not force injection",
    );
    expect(plan.recommended?.warnings).toContain("Admin or driver consent needs a desktop review");
  });

  it("blocks lanes without driver and layout evidence", () => {
    const plan = buildVirtualGamepadReadinessPlan([
      {
        adminApproved: false,
        antiCheatSensitive: true,
        connected: false,
        driverMode: "keyboard",
        gyroDriverReady: false,
        gyroRequested: false,
        hapticsDriverReady: false,
        hapticsRequested: false,
        id: "browser-preview",
        label: "Browser Preview",
        layoutReady: false,
        rawInputFallbackReady: false,
        signedDriverReady: false,
        target: "Unknown Game",
        virtualDriverReady: false,
      },
    ]);

    expect(plan.recommended).toBeNull();
    expect(plan.blockedCount).toBe(1);
    expect(plan.summary).toBe(
      "Virtual Gamepad Readiness found lanes, but every driver route is blocked.",
    );
    expect(plan.lanes[0].blockers).toContain("Controller is not connected");
    expect(plan.lanes[0].blockers).toContain("Virtual gamepad bridge is not detected");
    expect(plan.lanes[0].blockers).toContain("Signed-driver review record is missing");
    expect(JSON.stringify(plan)).not.toMatch(falseClaimPattern);
  });
});
