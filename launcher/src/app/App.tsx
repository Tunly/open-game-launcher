import { lazy, Suspense, useCallback, useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { DeepLinkParams } from "../hooks/useDeepLink";
import { AuthProvider } from "./providers/AuthProvider";
import { router } from "./router";
import { handleInstallDeepLink } from "./deep-link-handlers";
import { useDeepLink } from "../hooks/useDeepLink";
import { useOverlayHotkey, useFpsHudHotkey } from "../lib/overlay";
import { AppErrorBoundary } from "../components/ui/AppErrorBoundary";
import { AchievementPopupLayer } from "../components/achievements/AchievementPopupLayer";
import { completeDesktopStartup } from "../lib/startup-window";

// Lazy-loaded for overlay/FPS windows only
const OverlayPage = lazy(() =>
  import("../pages/OverlayPage").then((m) => ({ default: m.OverlayPage })),
);
const FpsHudPageLazy = lazy(() =>
  import("../pages/FpsHudPage").then((m) => ({ default: m.FpsHudPage })),
);

type WindowView = "main" | "overlay" | "fps-hud";

function getWindowView(): WindowView {
  const queryView = new URLSearchParams(window.location.search).get("view");
  const path = window.location.pathname.replace(/\/+$/, "");
  const hashView = window.location.hash.replace(/^#\/?/, "");

  try {
    const label = getCurrentWebviewWindow().label;
    if (label === "in_game_overlay") return "overlay";
    if (label === "fps_hud") return "fps-hud";
  } catch {
    // Browser preview has no Tauri window label.
  }

  if (queryView === "overlay" || path === "/overlay") return "overlay";
  if (queryView === "fps-hud" || queryView === "fps_hud" || path === "/fps-hud") return "fps-hud";
  if (hashView === "overlay") return "overlay";
  if (hashView === "fps-hud" || hashView === "fps_hud") return "fps-hud";

  return "main";
}

function syncFloatingRuntimeClass(view: WindowView) {
  const isFloatingView = view === "overlay" || view === "fps-hud";
  document.documentElement.classList.toggle("floating-overlay-runtime", isFloatingView);
  document.body.classList.toggle("floating-overlay-runtime", isFloatingView);
}

// â”€â”€ Main-window-only handlers â”€â”€
function MainWindowHandlers() {
  useOverlayHotkey();
  useFpsHudHotkey();
  return null;
}

function StartupWindowCoordinator() {
  useEffect(() => {
    void completeDesktopStartup().catch((error: unknown) => {
      console.error("Desktop startup handoff failed", error);
    });
  }, []);

  return null;
}

function DeepLinkHandler() {
  const handleLink = useCallback((link: DeepLinkParams) => {
    const { action, params } = link;
    const game = params.game || params.title || "";
    const platform = params.platform || "";
    const invite = params.invite || "";
    switch (action) {
      case "join": {
        const searchParams = new URLSearchParams();
        searchParams.set("join", game);
        searchParams.set("platform", platform);
        searchParams.set("invite", invite);
        router.navigate(`/library?${searchParams.toString()}`);
        break;
      }
      case "open":
        if (game) router.navigate(`/store?slug=${game}`);
        break;
      case "install":
        void handleInstallDeepLink(params, params.game || "");
        break;
      default:
        console.warn("[deep-link] Unknown action:", action);
    }
  }, []);

  useDeepLink(handleLink);
  return null;
}

export default function App() {
  const view = getWindowView();
  syncFloatingRuntimeClass(view);

  // Overlay window â€” render directly, no router needed
  if (view === "overlay") {
    return (
      <AppErrorBoundary>
        <AuthProvider>
          <Suspense
            fallback={
              <div className="grid h-screen w-screen place-items-center bg-black/70">
                <div className="neo-copy border-[3px] border-[#171411] bg-[#171411]/80 px-4 py-3 text-sm font-black uppercase text-[#fff9ed] shadow-[4px_4px_0_#000]">
                  Loading overlay...
                </div>
              </div>
            }
          >
            <OverlayPage />
          </Suspense>
        </AuthProvider>
      </AppErrorBoundary>
    );
  }

  // FPS-HUD window â€” tiny floating counter
  if (view === "fps-hud") {
    return (
      <AppErrorBoundary>
        <Suspense fallback={null}>
          <FpsHudPageLazy />
        </Suspense>
      </AppErrorBoundary>
    );
  }

  // Main window â€” full app with router
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <StartupWindowCoordinator />
        <MainWindowHandlers />
        <DeepLinkHandler />
        <AchievementPopupLayer />
        <RouterProvider router={router} />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
