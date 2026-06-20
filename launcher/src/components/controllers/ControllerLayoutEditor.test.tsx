import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ControllerLayoutEditor } from "./ControllerLayoutEditor";
import type { ControllerRuntimeStatus } from "../../lib/types/controllers";

const launcherMocks = vi.hoisted(() => ({
  applyControllerLayout: vi.fn(),
  clearControllerLayout: vi.fn(),
}));
const supabaseClientMocks = vi.hoisted(() => ({
  isSupabaseConfigured: false,
}));
const controllerMocks = vi.hoisted(() => ({
  deleteControllerLayout: vi.fn(),
  listControllerLayouts: vi.fn(),
  listHostedControllerLayouts: vi.fn(),
  recordHostedControllerLayoutDownload: vi.fn(),
  reportHostedControllerLayout: vi.fn(),
  saveControllerLayout: vi.fn(),
  setHostedControllerLayoutVote: vi.fn(),
}));

vi.mock("../../lib/launcher", () => ({
  applyControllerLayout: (input: unknown) => launcherMocks.applyControllerLayout(input),
  clearControllerLayout: () => launcherMocks.clearControllerLayout(),
}));

vi.mock("../../lib/supabase/client", () => ({
  get isSupabaseConfigured() {
    return supabaseClientMocks.isSupabaseConfigured;
  },
}));

vi.mock("../../lib/supabase/controllers", () => ({
  deleteControllerLayout: (...args: unknown[]) => controllerMocks.deleteControllerLayout(...args),
  listControllerLayouts: (...args: unknown[]) => controllerMocks.listControllerLayouts(...args),
  listHostedControllerLayouts: (...args: unknown[]) =>
    controllerMocks.listHostedControllerLayouts(...args),
  recordHostedControllerLayoutDownload: (...args: unknown[]) =>
    controllerMocks.recordHostedControllerLayoutDownload(...args),
  reportHostedControllerLayout: (...args: unknown[]) =>
    controllerMocks.reportHostedControllerLayout(...args),
  saveControllerLayout: (...args: unknown[]) => controllerMocks.saveControllerLayout(...args),
  setHostedControllerLayoutVote: (...args: unknown[]) =>
    controllerMocks.setHostedControllerLayoutVote(...args),
}));

const LOCAL_CONTROLLER_LAYOUTS_KEY = "og-launcher:controller-layouts:v1";
const LOCAL_CONTROLLER_LAYOUT_VOTES_KEY = "og-launcher:controller-layout-votes:v1";
let root: Root | null = null;

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
  window.localStorage.clear();
  supabaseClientMocks.isSupabaseConfigured = false;
  launcherMocks.applyControllerLayout.mockReset();
  launcherMocks.clearControllerLayout.mockReset();
  controllerMocks.deleteControllerLayout.mockReset();
  controllerMocks.listControllerLayouts.mockReset();
  controllerMocks.listHostedControllerLayouts.mockReset();
  controllerMocks.recordHostedControllerLayoutDownload.mockReset();
  controllerMocks.reportHostedControllerLayout.mockReset();
  controllerMocks.saveControllerLayout.mockReset();
  controllerMocks.setHostedControllerLayoutVote.mockReset();
});

function renderWithRoot(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
  return container;
}

async function waitForAssertion(assertion: () => void) {
  const timeoutAt = Date.now() + 1000;
  let lastError: unknown;

  while (Date.now() < timeoutAt) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function clickAndSettle(element: HTMLElement) {
  await act(async () => {
    element.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("ControllerLayoutEditor community gallery", () => {
  it("imports a community layout into the local editable layout cache", async () => {
    const container = renderWithRoot(
      <ControllerLayoutEditor
        devices={[
          {
            controllerType: "xbox",
            id: "test-pad",
            isConnected: true,
            name: "Test Pad",
            source: "test",
          },
        ]}
      />,
    );

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Community Layout Gallery");
      expect(container).toHaveTextContent("Arcade Twin-Stick");
    });

    const importButton = Array.from(container.querySelectorAll("button")).find((button) =>
      /import/i.test(button.textContent ?? ""),
    );
    if (!importButton) throw new Error("Import button not found");

    await clickAndSettle(importButton);

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Arcade Twin-Stick imported to local editable layouts.");
      expect(container.querySelector<HTMLInputElement>("input")?.value).toBe(
        "Arcade Twin-Stick Import",
      );
    });

    const stored = JSON.parse(window.localStorage.getItem(LOCAL_CONTROLLER_LAYOUTS_KEY) ?? "[]") as
      | Array<{ name?: string; isCommunity?: boolean }>
      | [];
    expect(stored.some((layout) => layout.name === "Arcade Twin-Stick Import")).toBe(true);
    expect(stored.find((layout) => layout.name === "Arcade Twin-Stick Import")?.isCommunity).toBe(
      false,
    );
  });

  it("persists local community layout votes without claiming hosted ranking", async () => {
    const container = renderWithRoot(
      <ControllerLayoutEditor
        devices={[
          {
            controllerType: "xbox",
            id: "test-pad",
            isConnected: true,
            name: "Test Pad",
            source: "test",
          },
        ]}
      />,
    );

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Local vote ledger fallback");
      expect(container).toHaveTextContent("Hosted vote persistence, ranking, and moderation");
      expect(container).toHaveTextContent("1248 Vote");
    });

    const voteButton = Array.from(container.querySelectorAll("button")).find((button) =>
      /add local vote for arcade twin-stick/i.test(button.getAttribute("aria-label") ?? ""),
    );
    if (!voteButton) throw new Error("Vote button not found");

    await clickAndSettle(voteButton);

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("1249 Local Vote");
      expect(container).toHaveTextContent("Hosted ranking remains disabled");
    });

    expect(
      JSON.parse(window.localStorage.getItem(LOCAL_CONTROLLER_LAYOUT_VOTES_KEY) ?? "[]"),
    ).toEqual(["arcade-twin-stick"]);
  });

  it("stages approved hosted community layouts and routes hosted gallery actions", async () => {
    supabaseClientMocks.isSupabaseConfigured = true;
    controllerMocks.listControllerLayouts.mockResolvedValue([]);
    controllerMocks.listHostedControllerLayouts.mockResolvedValue({
      ok: true,
      value: [
        {
          authorName: "Pad Club",
          bindings: [{ input: "A / Cross", output: "Space" }],
          controllerType: "xbox",
          createdAt: "2026-06-12T12:00:00.000Z",
          downloadCount: 22,
          gameId: null,
          gyroEnabled: true,
          hapticsEnabled: true,
          id: "hosted-layout-1",
          isCommunity: true,
          isDefault: false,
          moderationStatus: "approved",
          name: "Arcade Twin-Stick",
          reportCount: 0,
          template: "keyboardMouse",
          updatedAt: "2026-06-12T12:01:00.000Z",
          userId: "author-1",
          userVote: 0,
          voteScore: 14,
        },
      ],
    });
    controllerMocks.setHostedControllerLayoutVote.mockResolvedValue({
      ok: true,
      value: { layoutId: "hosted-layout-1", userVote: 1, voteScore: 15 },
    });
    controllerMocks.recordHostedControllerLayoutDownload.mockResolvedValue({
      ok: true,
      value: { downloadCount: 23, layoutId: "hosted-layout-1" },
    });
    controllerMocks.reportHostedControllerLayout.mockResolvedValue({
      ok: true,
      value: { layoutId: "hosted-layout-1", moderationStatus: "pending", reportCount: 3 },
    });

    const container = renderWithRoot(
      <ControllerLayoutEditor
        devices={[
          {
            controllerType: "xbox",
            id: "test-pad",
            isConnected: true,
            name: "Test Pad",
            source: "test",
          },
        ]}
      />,
    );

    await waitForAssertion(() => {
      expect(controllerMocks.listHostedControllerLayouts).toHaveBeenCalledWith({
        controllerType: "xbox",
        gameId: null,
        limit: 12,
      });
      expect(container).toHaveTextContent("Approved hosted rows use Supabase votes");
      expect(container).toHaveTextContent("Hosted Review xbox");
      expect(container).toHaveTextContent("Arcade Twin-Stick");
      expect(container).toHaveTextContent("14 Vote");
      expect(container).toHaveTextContent("22");
    });

    const voteButton = Array.from(container.querySelectorAll("button")).find((button) =>
      /add hosted vote for arcade twin-stick/i.test(button.getAttribute("aria-label") ?? ""),
    );
    if (!voteButton) throw new Error("Hosted vote button not found");

    await clickAndSettle(voteButton);

    await waitForAssertion(() => {
      expect(controllerMocks.setHostedControllerLayoutVote).toHaveBeenCalledWith(
        "hosted-layout-1",
        1,
      );
      expect(container).toHaveTextContent("15 Hosted Vote");
      expect(container).toHaveTextContent("Staged hosted vote recorded for Arcade Twin-Stick");
    });

    const importButton = Array.from(container.querySelectorAll("button")).find((button) =>
      /^import$/i.test(button.textContent?.trim() ?? ""),
    );
    if (!importButton) throw new Error("Hosted import button not found");

    await clickAndSettle(importButton);

    await waitForAssertion(() => {
      expect(controllerMocks.recordHostedControllerLayoutDownload).toHaveBeenCalledWith(
        "hosted-layout-1",
      );
      expect(container.querySelector<HTMLInputElement>("input")?.value).toBe(
        "Arcade Twin-Stick Hosted Import",
      );
      expect(container).toHaveTextContent("23");
      expect(container).toHaveTextContent("loaded from the approved hosted feed as a local draft");
    });

    const reportButton = Array.from(container.querySelectorAll("button")).find((button) =>
      /report hosted layout arcade twin-stick/i.test(button.getAttribute("aria-label") ?? ""),
    );
    if (!reportButton) throw new Error("Hosted report button not found");

    await clickAndSettle(reportButton);

    await waitForAssertion(() => {
      expect(controllerMocks.reportHostedControllerLayout).toHaveBeenCalledWith(
        "hosted-layout-1",
        "Controller layout gallery report",
      );
      expect(container).toHaveTextContent("Report 3");
      expect(container).toHaveTextContent("moved back to pending moderation");
    });
  });

  it("applies the current local draft to the desktop runtime bridge", async () => {
    const runtimeStatus: ControllerRuntimeStatus = {
      activeGameId: "global-controller-preview",
      activeLayoutName: "Arcade Runtime",
      activeTemplate: "gamepadGyro",
      configPath: "/tmp/controller-runtime/active-controller-layout.json",
      driverMessage: "Runtime config staged.",
      keyboardMouseEmulationReady: true,
      nativePassthroughReady: false,
      vigemBusDetected: false,
    };
    const onRuntimeStatusChange = vi.fn();
    launcherMocks.applyControllerLayout.mockResolvedValue(runtimeStatus);

    const container = renderWithRoot(
      <ControllerLayoutEditor
        devices={[
          {
            controllerType: "xbox",
            id: "test-pad",
            isConnected: true,
            name: "Test Pad",
            source: "test",
          },
        ]}
        onRuntimeStatusChange={onRuntimeStatusChange}
      />,
    );

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("xbox Local Default");
      expect(container).toHaveTextContent("Apply Runtime");
    });

    const applyButton = Array.from(container.querySelectorAll("button")).find((button) =>
      /apply runtime/i.test(button.textContent ?? ""),
    );
    if (!applyButton) throw new Error("Apply Runtime button not found");

    await clickAndSettle(applyButton);

    await waitForAssertion(() => {
      expect(launcherMocks.applyControllerLayout).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: "global-controller-preview",
          layout: expect.objectContaining({
            name: "xbox Local Default",
            template: "gamepadGyro",
          }),
        }),
      );
      expect(onRuntimeStatusChange).toHaveBeenCalledWith(runtimeStatus);
      expect(container).toHaveTextContent("Runtime staged for Arcade Runtime");
      expect(container).toHaveTextContent("no driver install");
    });
  });
});
