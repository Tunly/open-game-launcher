import type { WindowView } from "./window-view-policy";

function resolveLocationView(): WindowView {
  const queryView = new URLSearchParams(window.location.search).get("view");
  const path = window.location.pathname.replace(/\/+$/, "");
  const hashView = window.location.hash.replace(/^#\/?/, "");

  if (queryView === "overlay" || path === "/overlay" || hashView === "overlay") {
    return "overlay";
  }
  if (
    queryView === "fps-hud" ||
    queryView === "fps_hud" ||
    path === "/fps-hud" ||
    hashView === "fps-hud" ||
    hashView === "fps_hud"
  ) {
    return "fps-hud";
  }

  return "main";
}

export async function resolveWindowView(): Promise<WindowView> {
  try {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const label = getCurrentWebviewWindow().label;
    if (label === "in_game_overlay") return "overlay";
    if (label === "fps_hud") return "fps-hud";
  } catch {
    // Browser preview has no Tauri window label.
  }

  return resolveLocationView();
}

export function syncWindowRuntimeClass(view: WindowView) {
  const isFloatingView = view === "overlay" || view === "fps-hud";
  document.documentElement.classList.toggle("floating-overlay-runtime", isFloatingView);
  document.body.classList.toggle("floating-overlay-runtime", isFloatingView);
}
