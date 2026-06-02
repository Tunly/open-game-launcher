import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export interface DeepLinkParams {
  rawUrl: string;
  action: string;        // "join", "open", "install"
  params: Record<string, string>;
}

/**
 * Listens for universallauncher:// deep link events from the Rust backend.
 * Called once on app startup and whenever the OS forwards a new link.
 */
export function useDeepLink(onLink: (link: DeepLinkParams) => void) {
  useEffect(() => {
    const unlisten = listen<DeepLinkParams>("deep-link", (event) => {
      console.log("[deep-link]", event.payload);
      onLink(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onLink]);
}
