import { useCallback, useEffect } from "react";
import { RouterProvider } from "react-router-dom";

import type { DeepLinkParams } from "../hooks/useDeepLink";
import { useDeepLink } from "../hooks/useDeepLink";
import { useFpsHudHotkey, useOverlayHotkey } from "../lib/overlay";
import { completeDesktopStartup } from "../lib/startup-window";
import { PlaySessionSyncHost } from "../hooks/library/usePlaySessionSync";
import { LauncherUpdateHost } from "../components/launcher/LauncherUpdateHost";
import { AppErrorBoundary } from "../components/ui/AppErrorBoundary";
import { handleInstallDeepLink } from "./deep-link-handlers";
import { AuthProvider } from "./providers/AuthProvider";
import { router } from "./router";
import { shouldMountLauncherUpdateHost } from "./window-view-policy";

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
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <StartupWindowCoordinator />
        {shouldMountLauncherUpdateHost("main") ? <LauncherUpdateHost /> : null}
        <MainWindowHandlers />
        <DeepLinkHandler />
        <PlaySessionSyncHost />
        <RouterProvider router={router} />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
