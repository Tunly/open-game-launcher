import { invokeCommand } from "./shared";

export function launchCrossPlayJoin(platform: string, gameSlug: string): Promise<string> {
  return invokeCommand<string>("launch_cross_play_join", { platform, gameSlug });
}

export function resolveGameExternalId(gameId: string, platform: string): Promise<string> {
  return invokeCommand<string>("resolve_game_external_id", { gameId, platform });
}
