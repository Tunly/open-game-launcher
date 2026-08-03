import { useEffect, useRef, useState } from "react";

const turnstileScriptId = "cloudflare-turnstile-api";
const turnstileScriptUrl = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  remove: (widgetId: string) => void;
  render: (
    container: HTMLElement,
    options: {
      action: string;
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      sitekey: string;
      theme: "light";
    },
  ) => string;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(turnstileScriptId) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    const handleLoad = () => {
      if (window.turnstile) {
        resolve();
        return;
      }
      script.remove();
      reject(new Error("Turnstile could not be loaded."));
    };
    const handleError = () => {
      script.remove();
      reject(new Error("Turnstile could not be loaded."));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existing) {
      script.id = turnstileScriptId;
      script.async = true;
      script.defer = true;
      script.src = turnstileScriptUrl;
      document.head.append(script);
    }
  });
}

export function TurnstileWidget({
  onError,
  onToken,
  siteKey,
}: {
  onError: (message: string) => void;
  onToken: (token: string | null) => void;
  siteKey: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Bot check loading...");

  useEffect(() => {
    let active = true;
    let widgetId: string | null = null;

    void loadTurnstileScript()
      .then(() => {
        if (!active || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          action: "turnstile-spin-v2",
          callback: (token) => {
            if (!active) return;
            onToken(token);
            setStatus("Bot check complete.");
          },
          "error-callback": () => {
            if (!active) return;
            onToken(null);
            onError("Bot check failed. Reload it and try again.");
            setStatus("Bot check failed.");
          },
          "expired-callback": () => {
            if (!active) return;
            onToken(null);
            setStatus("Bot check expired. Complete it again.");
          },
          sitekey: siteKey,
          theme: "light",
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Turnstile could not be loaded.";
        onToken(null);
        onError(message);
        setStatus(message);
      });

    return () => {
      active = false;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onError, onToken, siteKey]);

  return (
    <div className="mt-4 border-2 border-black bg-[#fbf8ef] p-3">
      <div ref={containerRef} data-action="turnstile-spin-v2" />
      <p
        className="neo-copy mt-2 text-[10px] font-bold text-[#55504a] uppercase"
        aria-live="polite"
      >
        {status}
      </p>
    </div>
  );
}
