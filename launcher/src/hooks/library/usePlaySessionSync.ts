import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { getUnsyncedPlaySessions, markPlaySessionsSynced } from "../../lib/launcher";
import { syncGameSessions } from "../../lib/supabase/playtime";
import type { PlaySession } from "../../lib/types";

/**
 * Drains locally-stored play sessions to the Supabase `game_sessions` table.
 *
 * Two trigger sources:
 * 1. App startup / window mount: pulls all unsynced rows and pushes them.
 * 2. The Rust poller's `play_session_recorded` event: pushes the new row
 *    immediately, then marks it synced in the local SQLite table.
 *
 * The hook is fire-and-forget; failures are logged and retried on the next
 * mount or event. Sessions that can't be pushed (e.g. user signed out, the
 * game isn't in the catalog yet) stay in the local DB as `synced_at IS NULL`
 * and are retried on next launch.
 */
export function usePlaySessionSync(): void {
  const running = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const drain = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const sessions = await getUnsyncedPlaySessions();
        if (!isMounted || sessions.length === 0) return;
        const outcome = await syncGameSessions(sessions);
        const syncedIds = outcome.pushedIds;
        if (syncedIds.length > 0) {
          await markPlaySessionsSynced(syncedIds);
        }
        if (outcome.pushed > 0 || outcome.failed > 0) {
          console.info(
            `[usePlaySessionSync] pushed=${outcome.pushed} skipped=${outcome.skipped} failed=${outcome.failed}`,
          );
        }
      } catch (error) {
        console.warn("[usePlaySessionSync] drain failed:", error);
      } finally {
        running.current = false;
      }
    };

    void drain();
    const interval = window.setInterval(() => {
      void drain();
    }, 60_000);

    const unlistenPromise = isTauri()
      ? listen<PlaySession>("play_session_recorded", async (event) => {
          if (!isMounted) return;
          const session = event.payload;
          try {
            const outcome = await syncGameSessions([session]);
            if (outcome.pushed > 0) {
              await markPlaySessionsSynced([session.id]);
            }
          } catch (error) {
            console.warn("[usePlaySessionSync] event push failed:", error);
          }
        })
      : null;

    return () => {
      isMounted = false;
      window.clearInterval(interval);
      void unlistenPromise?.then((unlisten) => unlisten());
    };
  }, []);
}

export function PlaySessionSyncHost(): null {
  usePlaySessionSync();
  return null;
}
