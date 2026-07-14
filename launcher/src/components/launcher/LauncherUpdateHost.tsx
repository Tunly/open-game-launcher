import { useEffect } from "react";

import { checkForLauncherUpdate } from "../../stores/launcherUpdateStore";

export const LAUNCHER_UPDATE_STARTUP_DELAY_MS = 2_000;

export function LauncherUpdateHost({
  delayMs = LAUNCHER_UPDATE_STARTUP_DELAY_MS,
}: {
  delayMs?: number;
}) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void checkForLauncherUpdate();
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [delayMs]);

  return null;
}
