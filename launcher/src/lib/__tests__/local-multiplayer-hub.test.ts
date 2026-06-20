import { describe, expect, it } from "vitest";

import { buildLocalMultiplayerHub } from "../local-multiplayer-hub";
import type { ControllerDevice, ControllerRuntimeStatus } from "../types/controllers";

const runtimeReady: ControllerRuntimeStatus = {
  activeGameId: null,
  activeLayoutName: "Arcade Default",
  activeTemplate: "gamepad",
  configPath: "local",
  driverMessage: "Ready",
  keyboardMouseEmulationReady: true,
  nativePassthroughReady: false,
  vigemBusDetected: true,
};

const devices: ControllerDevice[] = [
  {
    controllerType: "xbox",
    id: "pad-one",
    isConnected: true,
    name: "Pad One",
    source: "test",
  },
  {
    controllerType: "playstation",
    id: "pad-two",
    isConnected: false,
    name: "Pad Two",
    source: "test",
  },
];

describe("buildLocalMultiplayerHub", () => {
  it("stages connected pads, keyboard fallback, and standby pads into local seats", () => {
    const hub = buildLocalMultiplayerHub(devices, runtimeReady);

    expect(hub.bridgeMode).toBe("Native routing");
    expect(hub.readySlots).toBe(2);
    expect(hub.standbySlots).toBe(1);
    expect(hub.slots.map((slot) => [slot.label, slot.state])).toEqual([
      ["Pad One", "ready"],
      ["Keyboard/Mouse Host", "keyboard"],
      ["Pad Two", "standby"],
      ["Open Seat", "empty"],
    ]);
    expect(hub.checklist).toContain("ViGEm lane is available for virtual-pad routing");
  });

  it("keeps local co-op blocked until a second seat can be staged", () => {
    const hub = buildLocalMultiplayerHub([devices[0]], {
      ...runtimeReady,
      keyboardMouseEmulationReady: false,
      vigemBusDetected: false,
    });

    expect(hub.bridgeMode).toBe("Planning mode");
    expect(hub.readySlots).toBe(1);
    expect(hub.recommendation).toBe("Plug in one more pad to unlock a 2-player couch-coop lane.");
    expect(hub.checklist).toContain("Keyboard/mouse fallback is not active");
  });
});
