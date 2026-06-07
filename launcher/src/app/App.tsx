import { lazy, Suspense, useCallback, useState } from "react";
import { RouterProvider } from "react-router-dom";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AuthProvider } from "./providers/AuthProvider";
import { router } from "./router";
import { useDeepLink } from "../hooks/useDeepLink";
import { useOverlayHotkey, useFpsHudHotkey, useAchievementPopup } from "../lib/overlay";
import type { AchievementPopupPayload } from "../lib/types/overlay";
import { Trophy, X } from "lucide-react";
import { AppErrorBoundary } from "../components/ui/AppErrorBoundary";

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

function DeepLinkHandler() {
  useDeepLink((link) => {
    const { action, params } = link;
    const game = params.game || params.title || "";
    const platform = params.platform || "";
    const invite = params.invite || "";
    switch (action) {
      case "join":
        router.navigate(`/library?join=${game}&platform=${platform}&invite=${invite}`);
        break;
      case "open":
        if (game) router.navigate(`/store?slug=${game}`);
        break;
      case "install":
        if (game) router.navigate(`/store?slug=${game}&install=1`);
        break;
      default:
        console.warn("[deep-link] Unknown action:", action);
    }
  });
  return null;
}

function AchievementPopupLayer() {
  const [popups, setPopups] = useState<AchievementPopupPayload[]>([]);

  useAchievementPopup(
    useCallback((payload: AchievementPopupPayload) => {
      setPopups((prev) => [...prev, payload]);
      setTimeout(() => {
        setPopups((prev) => prev.filter((p) => p !== payload));
      }, 5000);
    }, []),
  );

  if (popups.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
      {popups.map((p, i) => (
        <div
          key={`${p.achievement_name}-${i}`}
          className="neo-dots flex w-72 items-center gap-3 border-[3px] border-[#171411] bg-[#fbf8ef] px-3 py-2 shadow-[4px_4px_0_#1f1c0f]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-[#171411] bg-[#b7102a] shadow-[2px_2px_0_#1f1c0f]">
            <Trophy size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="neo-copy text-[9px] font-black text-[#b7102a] uppercase">
              Achievement unlocked
            </div>
            <div className="truncate text-[12px] font-bold text-[#171411]">
              {p.achievement_name}
            </div>
            <div className="neo-copy truncate text-[10px] font-bold text-[#655f58]">
              {p.game_title}
            </div>
          </div>
          <button
            onClick={() => setPopups((prev) => prev.filter((_, idx) => idx !== i))}
            className="ml-auto shrink-0 text-[#655f58] hover:text-[#171411]"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
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
                <div className="neo-copy border-[3px] border-[#171411] bg-[#171411]/80 px-4 py-3 text-sm font-black text-[#fff9ed] uppercase shadow-[4px_4px_0_#000]">
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
        <MainWindowHandlers />
        <DeepLinkHandler />
        <AchievementPopupLayer />
        <RouterProvider router={router} />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
