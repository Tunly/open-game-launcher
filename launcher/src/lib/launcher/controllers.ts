import { isTauri } from "@tauri-apps/api/core";
import type { ControllerDevice, ControllerLayout, ControllerRuntimeStatus } from "./types";
import { invokeCommand } from "./shared";

export function listControllers(): Promise<ControllerDevice[]> {
  if (!isTauri()) {
    return Promise.reject(new Error("Controller detection is available in the desktop app."));
  }

  return invokeCommand<ControllerDevice[]>("list_controllers");
}

export function applyControllerLayout(input: {
  gameId: string;
  layout: ControllerLayout;
}): Promise<ControllerRuntimeStatus> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Controller runtime activation is available in the desktop app."),
    );
  }

  return invokeCommand<ControllerRuntimeStatus>("apply_controller_layout", { input });
}

export function clearControllerLayout(): Promise<ControllerRuntimeStatus> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Controller runtime clearing is available in the desktop app."),
    );
  }

  return invokeCommand<ControllerRuntimeStatus>("clear_controller_layout");
}

export function getControllerRuntimeStatus(): Promise<ControllerRuntimeStatus> {
  if (!isTauri()) {
    return Promise.resolve({
      activeGameId: null,
      activeLayoutName: "Browser Preview Only",
      activeTemplate: null,
      configPath: "browser:controller-runtime-preview",
      driverMessage:
        "Browser preview: layout editing is local. Runtime activation requires the desktop app.",
      keyboardMouseEmulationReady: false,
      nativePassthroughReady: false,
      vigemBusDetected: false,
    });
  }

  return invokeCommand<ControllerRuntimeStatus>("get_controller_runtime_status");
}

export async function activateBestControllerLayoutForGame(gameId: string): Promise<void> {
  try {
    const { listControllerLayouts } = await import("../supabase/controllers");
    const layouts = await listControllerLayouts({
      gameId,
      controllerType: "all",
      includeGlobal: true,
    });
    const layout =
      layouts.find((candidate) => candidate.gameId === gameId && candidate.isDefault) ??
      layouts.find((candidate) => candidate.gameId === gameId) ??
      layouts.find((candidate) => candidate.gameId === null && candidate.isDefault) ??
      layouts.find((candidate) => candidate.gameId === null);

    if (layout) {
      await applyControllerLayout({ gameId, layout });
    } else {
      await clearControllerLayout();
    }
  } catch (error) {
    console.warn("Controller layout activation skipped", error);
  }
}
