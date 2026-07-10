import { useCallback } from "react";

import { postActivity } from "../lib/supabase/activity";
import type { ActivityType } from "../lib/types/friends";

type Visibility = "public" | "friends_only" | "private";

interface ActivityPayload {
  gameId?: string | null;
  gameTitle?: string | null;
  metadata?: Record<string, unknown>;
  visibility?: Visibility;
}

async function safePost(type: ActivityType, data: ActivityPayload) {
  try {
    await postActivity(type, data);
  } catch (err) {
    console.warn(`[ActivityLogger] Failed to post ${type}:`, err);
  }
}

/**
 * Hook that returns a stable set of helpers for posting activity-feed entries
 * from anywhere in the UI. All calls are fire-and-forget and never throw.
 */
export function useActivityLogger() {
  const logGameStart = useCallback(
    (gameId: string | null, gameTitle: string | null, metadata?: Record<string, unknown>) =>
      safePost("game_start", { gameId, gameTitle, metadata, visibility: "friends_only" }),
    [],
  );

  const logGameStop = useCallback(
    (gameId: string | null, gameTitle: string | null, metadata?: Record<string, unknown>) =>
      safePost("game_stop", { gameId, gameTitle, metadata, visibility: "friends_only" }),
    [],
  );

  return { logGameStart, logGameStop };
}
