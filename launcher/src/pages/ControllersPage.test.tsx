import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ControllersPage } from "./ControllersPage";
import type { ControllerDevice, ControllerRuntimeStatus } from "../lib/types/controllers";

const launcherMocks = vi.hoisted(() => ({
  applyControllerLayout: vi.fn(),
  clearControllerLayout: vi.fn(),
  getControllerRuntimeStatus: vi.fn(),
  listControllers: vi.fn(),
}));

vi.mock("../lib/launcher", () => ({
  applyControllerLayout: (input: unknown) => launcherMocks.applyControllerLayout(input),
  clearControllerLayout: () => launcherMocks.clearControllerLayout(),
  getControllerRuntimeStatus: () => launcherMocks.getControllerRuntimeStatus(),
  listControllers: () => launcherMocks.listControllers(),
}));

vi.mock("../lib/supabase/client", () => ({
  isSupabaseConfigured: false,
}));

vi.mock("../lib/supabase/controllers", () => ({
  deleteControllerLayout: vi.fn(),
  listControllerLayouts: vi.fn(),
  saveControllerLayout: vi.fn(),
}));

const devices: ControllerDevice[] = [
  {
    controllerType: "xbox",
    id: "pad-one",
    isConnected: true,
    name: "Arcade Stick One",
    powerLevel: "91%",
    source: "test bridge",
  },
  {
    controllerType: "playstation",
    id: "pad-two",
    isConnected: false,
    name: "Docked DualSense",
    powerLevel: "standby",
    source: "test bridge",
  },
];

const runtimeStatus: ControllerRuntimeStatus = {
  activeGameId: null,
  activeLayoutName: "Arcade Night Default",
  activeTemplate: "gamepadGyro",
  configPath: "test",
  driverMessage: "Runtime ready for local routing.",
  keyboardMouseEmulationReady: true,
  nativePassthroughReady: false,
  vigemBusDetected: true,
};

describe("ControllersPage local multiplayer hub", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/controllers");
    launcherMocks.listControllers.mockReset();
    launcherMocks.getControllerRuntimeStatus.mockReset();
    launcherMocks.applyControllerLayout.mockReset();
    launcherMocks.clearControllerLayout.mockReset();
    launcherMocks.listControllers.mockResolvedValue(devices);
    launcherMocks.getControllerRuntimeStatus.mockResolvedValue(runtimeStatus);
    launcherMocks.applyControllerLayout.mockResolvedValue({
      ...runtimeStatus,
      activeGameId: "global-controller-preview",
      activeLayoutName: "Runtime Applied From Editor",
      activeTemplate: "keyboardMouse",
      configPath: "/tmp/og-controller-runtime/active-controller-layout.json",
      keyboardMouseEmulationReady: true,
      vigemBusDetected: false,
    });
    launcherMocks.clearControllerLayout.mockResolvedValue({
      ...runtimeStatus,
      activeGameId: null,
      activeLayoutName: null,
      activeTemplate: null,
      configPath: null,
    });
  });

  it("renders couch co-op seats from detected controllers and runtime fallback lanes", async () => {
    render(<ControllersPage />);

    const hub = await screen.findByRole("region", { name: /local multiplayer hub/i });

    await waitFor(() => {
      expect(within(hub).getByText("2 / 4")).toBeInTheDocument();
    });

    expect(within(hub).getByText("Local Multiplayer Hub")).toBeInTheDocument();
    expect(within(hub).getByText("Native routing")).toBeInTheDocument();
    expect(within(hub).getAllByText("Co-op Ready")).toHaveLength(2);
    expect(
      within(hub).getByText((_, element) => {
        return element?.textContent === "Minimum 2 ready seats // 0 blockers";
      }),
    ).toBeInTheDocument();
    expect(within(hub).getByText("Arcade Stick One")).toBeInTheDocument();
    expect(within(hub).getByText("Keyboard/Mouse Host")).toBeInTheDocument();
    expect(within(hub).getByText("Docked DualSense")).toBeInTheDocument();
    expect(within(hub).getByText("Open Seat")).toBeInTheDocument();
    expect(
      within(hub).getByText("ViGEm lane is available for virtual-pad routing"),
    ).toBeInTheDocument();
  });

  it("falls back to mock controller devices when desktop IPC returns a null device list", async () => {
    launcherMocks.listControllers.mockResolvedValueOnce(null);

    render(<ControllersPage />);

    const hub = await screen.findByRole("region", { name: /local multiplayer hub/i });

    expect(screen.getByText(/invalid device list/i)).toBeInTheDocument();
    expect(within(hub).getByText("Local Xbox Pad")).toBeInTheDocument();
    expect(within(hub).getByText("DualSense Docked")).toBeInTheDocument();
  });

  it("renders local virtual gamepad readiness without claiming driver install or anti-cheat support", async () => {
    render(<ControllersPage />);

    const panel = await screen.findByRole("region", {
      name: /virtual gamepad readiness/i,
    });

    await waitFor(() => {
      expect(within(panel).getByText("Virtual Gamepad Readiness")).toBeInTheDocument();
      expect(within(panel).getByText("ViGEm bridge detected")).toBeInTheDocument();
    });

    expect(within(panel).getByText("Keyboard/mouse fallback ready")).toBeInTheDocument();
    expect(within(panel).getByText("Native passthrough blocked")).toBeInTheDocument();
    expect(within(panel).getByText("Local readiness only")).toBeInTheDocument();
    expect(within(panel).getByText("No kernel driver install")).toBeInTheDocument();
    expect(within(panel).getByText("No ViGEm/DS4Windows install")).toBeInTheDocument();
    expect(within(panel).getByText("No virtual HID device emission")).toBeInTheDocument();
    expect(within(panel).getByText("No raw HID write")).toBeInTheDocument();
    expect(within(panel).getByText("No Steam Input enablement")).toBeInTheDocument();
    expect(within(panel).getByText("No gyro output")).toBeInTheDocument();
    expect(within(panel).getByText("No haptics output")).toBeInTheDocument();
    expect(within(panel).getByText("No Windows SendInput proof")).toBeInTheDocument();
    expect(within(panel).getByText("No anti-cheat compatibility claim")).toBeInTheDocument();
    expect(within(panel).getByText("No protected-title validation")).toBeInTheDocument();
    expect(within(panel).getByText("No automatic launch routing change")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /driver installed|virtual HID emitted|raw HID written|Steam Input active|gyro output working|haptics output working|SendInput proven|anti-cheat compatible|protected title validated|launch routing changed/i,
    );
  });

  it("renders local controller capability evidence without native capability claims", async () => {
    render(<ControllersPage />);

    const panel = await screen.findByRole("region", {
      name: /controller capability evidence/i,
    });

    await waitFor(() => {
      expect(within(panel).getByText("Capability Evidence")).toBeInTheDocument();
      expect(within(panel).getByText("Arcade Stick One")).toBeInTheDocument();
    });

    expect(within(panel).getByText("Inferred only")).toBeInTheDocument();
    expect(within(panel).getByText("ViGEm runtime flag present")).toBeInTheDocument();
    expect(within(panel).getByText("Arcade Stick One")).toBeInTheDocument();
    expect(within(panel).getByText("Docked DualSense")).toBeInTheDocument();
    expect(within(panel).getAllByText("gyro none")).toHaveLength(1);
    expect(within(panel).getAllByText("haptics inferred").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("virtual vigem-runtime-flag").length).toBeGreaterThan(0);
    expect(within(panel).getByText("No HID capability read")).toBeInTheDocument();
    expect(within(panel).getByText("No SDL probe")).toBeInTheDocument();
    expect(within(panel).getByText("No Steam Input enablement")).toBeInTheDocument();
    expect(within(panel).getByText("No haptics output")).toBeInTheDocument();
    expect(within(panel).getByText("No anti-cheat compatibility claim")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /haptics working|HID detected|Steam Input active|anti-cheat compatible/i,
    );
  });

  it("renders controller capability evidence fixture rows on the verify route", async () => {
    window.history.pushState({}, "", "/controllers?verify=controller-capability-evidence");
    render(<ControllersPage />);

    const panel = await screen.findByRole("region", {
      name: /controller capability evidence/i,
    });

    await waitFor(() => {
      expect(within(panel).getByText("DualSense Evidence Pad")).toBeInTheDocument();
    });

    expect(within(panel).getByText("3/3")).toBeInTheDocument();
    expect(within(panel).getByText("Xbox Haptics Evidence Pad")).toBeInTheDocument();
    expect(within(panel).getByText("Generic USB Evidence Gap")).toBeInTheDocument();
    expect(within(panel).getByText("ViGEm runtime flag present")).toBeInTheDocument();
    expect(within(panel).getByText("Native passthrough flag missing")).toBeInTheDocument();
    expect(within(panel).getByText("Keyboard fallback flag present")).toBeInTheDocument();
    expect(within(panel).getAllByText("gyro inferred").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("gyro none").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("haptics inferred").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("haptics none").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("virtual vigem-runtime-flag")).toHaveLength(3);
    expect(within(panel).getByText("No SDL probe")).toBeInTheDocument();
    expect(within(panel).getByText("No Steam Input enablement")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /haptics working|HID detected|Steam Input active|anti-cheat compatible/i,
    );
  });

  it("renders per-game raw-input safety policy proof on the verify route", async () => {
    window.history.pushState({}, "", "/controllers?verify=controller-per-game-safety-raw-input");
    render(<ControllersPage />);

    const panel = await screen.findByRole("region", {
      name: /controller per-game safety raw-input policy/i,
    });

    await waitFor(() => {
      expect(within(panel).getByText("Raw-Input Policy")).toBeInTheDocument();
    });

    expect(within(panel).getByText("Policy blocked")).toBeInTheDocument();
    expect(within(panel).getByText("Akira's Revenge")).toBeInTheDocument();
    expect(
      within(panel).getByText("Akira Raw-Input Safety Draft // Raw-input fallback only"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Neo-Tokyo Drift")).toBeInTheDocument();
    expect(within(panel).getByText("Mech Warrior - Beta Access")).toBeInTheDocument();
    expect(within(panel).getByText("0 pass / 2 review / 1 blocked")).toBeInTheDocument();
    expect(
      within(panel).getByText("Protected title is missing a raw-input fallback"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("No controller injection claim")).toBeInTheDocument();
    expect(within(panel).getByText("No kernel driver install")).toBeInTheDocument();
    expect(within(panel).getByText("No raw HID write")).toBeInTheDocument();
    expect(within(panel).getByText("No Steam Input enablement")).toBeInTheDocument();
    expect(within(panel).getByText("No haptics output")).toBeInTheDocument();
    expect(within(panel).getByText("No anti-cheat compatibility claim")).toBeInTheDocument();
    expect(within(panel).getByText("No automatic launch routing change")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /controller injection enabled|driver installed|HID ready|Steam Input active|haptics working|anti-cheat compatible/i,
    );
  });

  it("renders virtual gamepad readiness fixture lanes on the verify route", async () => {
    window.history.pushState({}, "", "/controllers?verify=virtual-gamepad-readiness");
    render(<ControllersPage />);

    const panel = await screen.findByRole("region", {
      name: /virtual gamepad readiness/i,
    });

    await waitFor(() => {
      expect(within(panel).getByText("ViGEm Bridge Lane")).toBeInTheDocument();
    });

    expect(within(panel).getByText("1/3")).toBeInTheDocument();
    expect(
      within(panel).getByText("ViGEm Bridge Lane can be staged through local runtime-flag review."),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Protected Game Review")).toBeInTheDocument();
    expect(within(panel).getByText("Driver Install Slot")).toBeInTheDocument();
    expect(within(panel).getByText("vigem route // ready")).toBeInTheDocument();
    expect(within(panel).getByText("vigem route // warning")).toBeInTheDocument();
    expect(within(panel).getByText("keyboard route // blocked")).toBeInTheDocument();
    expect(within(panel).getByText("2 usable virtual lanes staged")).toBeInTheDocument();
    expect(within(panel).getByText("2 runtime bridge flag records present")).toBeInTheDocument();
    expect(within(panel).getByText("2 signed-driver review records present")).toBeInTheDocument();
    expect(within(panel).getByText("2 protected-game review lanes flagged")).toBeInTheDocument();
    expect(
      within(panel).getByText("ViGEm Bridge Lane is the current virtual gamepad pick"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("No virtual HID device emission")).toBeInTheDocument();
    expect(within(panel).getByText("No protected-title validation")).toBeInTheDocument();
  });

  it("renders local controller gyro and haptics readiness without native driver claims", async () => {
    render(<ControllersPage />);

    const panel = await screen.findByRole("region", {
      name: /controller gyro and haptics readiness/i,
    });

    await waitFor(() => {
      expect(within(panel).getByText("Gyro/Haptics Readiness")).toBeInTheDocument();
    });

    expect(within(panel).getByText("Gyro intent staged")).toBeInTheDocument();
    expect(within(panel).getByText("Haptics intent staged")).toBeInTheDocument();
    expect(within(panel).getByText("No driver install")).toBeInTheDocument();
    expect(within(panel).getByText("No Steam Input enablement")).toBeInTheDocument();
    expect(within(panel).getByText("No HID capability read")).toBeInTheDocument();
    expect(within(panel).getByText("No anti-cheat compatibility claim")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(/gyro ready|haptics working|steam input active/i);
  });

  it("renders controller gyro and haptics fixture lanes on the verify route", async () => {
    window.history.pushState({}, "", "/controllers?verify=controller-gyro-haptics-readiness");
    render(<ControllersPage />);

    const panel = await screen.findByRole("region", {
      name: /controller gyro and haptics readiness/i,
    });

    await waitFor(() => {
      expect(within(panel).getByText("DualSense Motion Preview")).toBeInTheDocument();
    });

    expect(within(panel).getByText("0/3")).toBeInTheDocument();
    expect(
      within(panel).getByText(
        "DualSense Motion Preview can be reviewed locally, but native motion/haptics validation is still pending.",
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Xbox Haptics Preview")).toBeInTheDocument();
    expect(within(panel).getByText("Protected Motion Lane")).toBeInTheDocument();
    expect(within(panel).getAllByText("motion route // warning")).toHaveLength(2);
    expect(within(panel).getByText("motion route // blocked")).toBeInTheDocument();
    expect(
      within(panel).getByText("Protected games need a raw-input fallback before motion routing"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("2 gyro evidence lanes staged")).toBeInTheDocument();
    expect(within(panel).getByText("3 haptics evidence lanes staged")).toBeInTheDocument();
    expect(within(panel).getByText("2 raw-input fallback lanes available")).toBeInTheDocument();
    expect(
      within(panel).getByText("DualSense Motion Preview is the current local motion/haptics pick"),
    ).toBeInTheDocument();
  });

  it("hides hosted controller community layouts readiness by default", async () => {
    render(<ControllersPage />);

    await screen.findByRole("region", { name: /local multiplayer hub/i });

    expect(
      screen.queryByRole("region", { name: /hosted controller community layouts readiness/i }),
    ).not.toBeInTheDocument();
  });

  it("renders hosted controller community layouts readiness on the verify route", async () => {
    window.history.pushState({}, "", "/controllers?verify=hosted-controller-layouts");
    render(<ControllersPage />);

    const panel = await screen.findByRole("region", {
      name: /hosted controller community layouts readiness/i,
    });

    await waitFor(() => {
      expect(within(panel).getByText("Hosted Layouts Readiness")).toBeInTheDocument();
    });

    expect(within(panel).getByText("Local Gallery")).toBeInTheDocument();
    expect(within(panel).getByText("Local Import")).toBeInTheDocument();
    expect(within(panel).getByText("Editor Approved-Feed Staging")).toBeInTheDocument();
    expect(within(panel).getByText("Votes + Ranking")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted Downloads")).toBeInTheDocument();
    expect(within(panel).getByText("Staged review ready")).toBeInTheDocument();
    expect(within(panel).getByText("8/8")).toBeInTheDocument();
    expect(within(panel).getByText("Approved hosted layouts only")).toBeInTheDocument();
    expect(within(panel).getByText("One-user vote RPC")).toBeInTheDocument();
    expect(within(panel).getByText("Editor approved-feed staging")).toBeInTheDocument();
    expect(within(panel).getByText("Report-backed moderation queue")).toBeInTheDocument();
    expect(within(panel).getByText("Profile consent/rollback evidence only")).toBeInTheDocument();
    expect(within(panel).getByText("No production/community rollout claim")).toBeInTheDocument();
    expect(within(panel).getByText("Consent/Rollback Evidence")).toBeInTheDocument();
    expect(within(panel).getByText("Profile Consent Review")).toBeInTheDocument();
    expect(within(panel).getByText("Opt-in only")).toBeInTheDocument();
    expect(
      within(panel).getByText(
        "Explicit profile consent required before the hosted-layout profile path leaves review.",
      ),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(
        "Disable the staged hosted-layout profile path and keep local fallback.",
      ),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(
        "Production/community rollout stays blocked until staged review signs off.",
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Rollout Blockers")).toBeInTheDocument();
    expect(
      within(panel).getByText(
        "8/8 review gates are staged; production release lanes stay blocked.",
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByText("3 blocked")).toBeInTheDocument();
    expect(within(panel).getByText("Production/Community Rollout")).toBeInTheDocument();
    expect(within(panel).getByText("Marketplace Publish")).toBeInTheDocument();
    expect(within(panel).getByText("Live Profile Cloud Sync")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /layout published|vote saved|cloud sync active|hosted preset downloaded|moderation queue live|cloud activation active|production rollout live|community rollout live|marketplace published|automatic profile sync active|production ready|marketplace live|profile sync enabled|live profile cloud sync active|live profile cloud sync enabled|community publish|shared with the community/i,
    );
  });

  it("updates the runtime strip when the layout editor applies a runtime layout", async () => {
    render(<ControllersPage />);

    const runtimePanel = await screen.findByRole("region", {
      name: /controller runtime activation/i,
    });

    await waitFor(() => {
      expect(within(runtimePanel).getByText("Apply Runtime")).toBeInTheDocument();
      expect(screen.getByDisplayValue("xbox Local Default")).toBeInTheDocument();
    });

    fireEvent.click(within(runtimePanel).getByRole("button", { name: /apply runtime/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Runtime Applied From Editor").length).toBeGreaterThanOrEqual(2);
      expect(launcherMocks.applyControllerLayout).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: "global-controller-preview",
          layout: expect.objectContaining({
            template: "gamepadGyro",
          }),
        }),
      );
    });

    expect(within(runtimePanel).getByText(/local runtime activation only/i)).toBeInTheDocument();
    expect(within(runtimePanel).getAllByText(/no driver install/i).length).toBeGreaterThan(0);
  });
});
