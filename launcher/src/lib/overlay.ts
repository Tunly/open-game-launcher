import { listen } from "@tauri-apps/api/event";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";
import type { NativeOverlaySettings } from "./types/overlay";

export async function toggleInGameOverlay(): Promise<boolean> {
  return invoke("toggle_in_game_overlay");
}

export async function toggleFpsHud(): Promise<boolean> {
  return invoke("toggle_fps_hud");
}

export async function setInGameOverlayClickThrough(enabled: boolean): Promise<void> {
  return invoke("set_in_game_overlay_click_through", { enabled });
}

export async function getOverlaySettings(): Promise<NativeOverlaySettings> {
  return invoke("get_overlay_settings");
}

export async function saveOverlaySettings(
  settings: NativeOverlaySettings,
): Promise<NativeOverlaySettings> {
  return invoke("save_overlay_settings", { settings });
}

export function useOverlayHotkey() {
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let unlisten: (() => void) | null = null;

    listen("overlay-toggle-requested", async () => {
      try {
        await toggleInGameOverlay();
      } catch (err) {
        console.error("[overlay] toggle failed:", err);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);
}

export function useFpsHudHotkey() {
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      // Alt+F12 toggle FPS HUD
      if (e.altKey && e.key === "F12") {
        e.preventDefault();
        try {
          await toggleFpsHud();
        } catch (err) {
          console.error("[fps-hud] toggle failed:", err);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
