import { useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
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

    let disposed = false;
    let removeListener: (() => void) | undefined;
    const handledLinks = new Set<string>();
    const handleLink = (link: DeepLinkParams) => {
      if (disposed) return;
      const signature = `${link.action}\u0000${link.rawUrl}`;
      if (handledLinks.has(signature)) return;
      handledLinks.add(signature);
      console.log("[deep-link]", getDeepLinkLogSummary(link));
      onLink(link);
    };

    const setup = async () => {
      const unlisten = await listen<DeepLinkParams>("deep-link", (event) => {
        void invoke("take_pending_deep_link").catch(() => undefined);
        handleLink(event.payload);
      });
      if (disposed) {
        unlisten();
        return;
      }
      removeListener = unlisten;

      const pending = await invoke<DeepLinkParams | null>("take_pending_deep_link");
      if (pending) handleLink(pending);
    };

    void setup().catch((error: unknown) => {
      if (!disposed) console.warn("[deep-link] setup failed", error);
    });
    return () => {
      disposed = true;
      removeListener?.();
    };
  }, [onLink]);
}
