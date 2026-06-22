import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface DeepLinkParams {
  rawUrl: string;
  action: string; // "join", "open", "install"
  params: Record<string, string>;
}

export function getDeepLinkLogSummary(link: DeepLinkParams) {
  return {
    action: link.action,
    paramKeys: Object.keys(link.params).sort(),
    rawUrlPresent: Boolean(link.rawUrl),
  };
}

/**
 * Listens for universallauncher:// deep link events from the Rust backend.
 * Called once on app startup and whenever the OS forwards a new link.
 */
export function useDeepLink(onLink: (link: DeepLinkParams) => void) {
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const unlisten = listen<DeepLinkParams>("deep-link", (event) => {
      console.log("[deep-link]", getDeepLinkLogSummary(event.payload));
      onLink(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onLink]);
}
