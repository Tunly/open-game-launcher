import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";

import {
  REMOTE_COMPANION_AUTO_POLL_INTERVAL_MS,
  runRemoteCompanionAlwaysOnPollOnce,
} from "../../lib/remote-companion-auto-poll";

export function RemoteCompanionAutoPollHost() {
  useEffect(() => {
    if (!isTauri()) return;

    let active = true;
    const runPoll = () => {
      if (!active) return;
      void runRemoteCompanionAlwaysOnPollOnce().catch(() => undefined);
    };

    runPoll();
    const intervalId = window.setInterval(runPoll, REMOTE_COMPANION_AUTO_POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
