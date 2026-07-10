import type { GameLifecycleEvent } from "../types";
import type { PlatformType } from "../types/friends";
import { postActivity } from "./activity";
import {
  normalizePresencePlatform,
  setLauncherPresence,
  setLauncherPresenceForSession,
  type PresenceSessionIdentity,
} from "./presence";

type LauncherPresenceStatus = "away" | "online";

const launcherAliases: Record<string, PlatformType> = {
  battle_net: "battlenet",
  battle_net_launcher: "battlenet",
  origin: "ea",
  uplay: "ubisoft",
  xbox_game_pass: "xbox",
};

export async function syncGameLifecycleSocial(
  event: GameLifecycleEvent,
  status: LauncherPresenceStatus,
  expectedSession?: PresenceSessionIdentity,
) {
  const platform = normalizeLifecyclePlatform(event.launcher);
  const platformSource = "launcher_lifecycle";
  const activityType = event.event === "game_started" ? "game_start" : "game_stop";
  const activityPromise = postActivity(activityType, {
    gameId: event.gameId,
    gameTitle: event.title,
    metadata: {
      launcher: event.launcher,
      platform: platform ?? event.launcher,
      platformGameId: event.gameId,
      platformSource,
    },
    visibility: "friends_only",
  });
  const presenceInput =
    event.event === "game_started"
      ? {
          currentGameId: null,
          currentGameTitle: event.title,
          platform,
          platformGameId: event.gameId,
          platformLastPolledAt: event.occurredAt,
          platformSource,
          status,
        }
      : {
          currentGameId: null,
          currentGameTitle: null,
          platform: null,
          platformGameId: null,
          platformLastPolledAt: event.occurredAt,
          platformSource: null,
          status,
        };
  const presencePromise = expectedSession
    ? setLauncherPresenceForSession(expectedSession, presenceInput)
    : setLauncherPresence(presenceInput);

  const results = await Promise.allSettled([activityPromise, presencePromise]);
  const errors = results.flatMap((result) =>
    result.status === "rejected" ? [toErrorMessage(result.reason)] : [],
  );
  if (errors.length > 0) {
    throw new Error(`Game lifecycle social sync failed: ${errors.join("; ")}`);
  }

  return results[0].status === "fulfilled" ? results[0].value : null;
}

export function normalizeLifecyclePlatform(launcher: string): PlatformType | null {
  const normalized = launcher
    .trim()
    .toLowerCase()
    .replace(/[ .-]+/g, "_");
  return launcherAliases[normalized] ?? normalizePresencePlatform(normalized);
}

function toErrorMessage(value: unknown) {
  return value instanceof Error ? value.message : String(value);
}
