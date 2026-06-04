import { useCallback, useEffect, useRef } from "react";

import { uploadGameSavesToCloud } from "../lib/launcher";
import { getCloudSaveSetByGameKey, markCloudSaveSetSynced } from "../lib/supabase/cloud-saves";
import { getErrorMessage } from "../lib/formatters";
import type { Game } from "../lib/types";
import { useCurrentUser } from "./useCurrentUser";

const AUTO_SYNC_LOCK_MS = 60_000;

interface AutoSyncOptions {
  game: Game | null;
  onMessage?: (text: string | null) => void;
}

interface UseCloudAutoSyncResult {
  maybeSyncOnLaunch: () => Promise<void>;
}

function buildLocalKey(game: Game): string {
  return `${game.launcher ?? "unknown"}:${game.id}`;
}

export function useCloudAutoSync({ game, onMessage }: AutoSyncOptions): UseCloudAutoSyncResult {
  const user = useCurrentUser();
  const lastTriggeredAt = useRef<Map<string, number>>(new Map());

  const maybeSyncOnLaunch = useCallback(async () => {
    if (!game) return;
    if (!user) return;
    const session = user.session ?? null;
    const accessToken = session?.access_token ?? null;
    const userId = session?.user?.id ?? null;
    if (!userId || !accessToken) return;

    const localKey = buildLocalKey(game);
    const last = lastTriggeredAt.current.get(localKey) ?? 0;
    if (Date.now() - last < AUTO_SYNC_LOCK_MS) {
      return;
    }
    lastTriggeredAt.current.set(localKey, Date.now());

    try {
      const set = await getCloudSaveSetByGameKey(localKey);
      if (!set || set.syncMode !== "on_launch") {
        return;
      }
      onMessage?.("Auto-syncing save to cloud…");
      const response = await uploadGameSavesToCloud(game.id, {
        accessToken,
        userId,
      });
      if (response.success) {
        await markCloudSaveSetSynced(set.id);
        onMessage?.(`Auto-sync complete: ${response.message}`);
      } else {
        onMessage?.(
          response.failedFiles.length > 0
            ? `Auto-sync partial: ${response.failedFiles.length} files failed.`
            : `Auto-sync failed: ${response.message}`,
        );
      }
    } catch (err) {
      onMessage?.(`Cloud auto-sync skipped: ${getErrorMessage(err)}`);
    }
  }, [game, onMessage, user]);

  useEffect(() => {
    const key = game ? buildLocalKey(game) : null;
    const map = lastTriggeredAt.current;
    return () => {
      if (key) {
        map.delete(key);
      }
    };
  }, [game]);

  return { maybeSyncOnLaunch };
}
