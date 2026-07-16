import { invokeCommand } from "./shared";
import type { Game } from "./types";

export function getCrossPlayLaunchIdentity(
  game: Pick<Game, "externalId" | "id" | "title">,
): string {
  const externalId = game.externalId?.trim();
  if (externalId) return externalId;

  throw new Error(`${game.title} does not have an exact provider launch identity.`);
}

export function launchCrossPlayJoin(platform: string, gameIdentity: string): Promise<string> {
  return invokeCommand<string>("launch_cross_play_join", { platform, gameSlug: gameIdentity });
}

export function resolveGameExternalId(gameId: string, platform: string): Promise<string> {
  return invokeCommand<string>("resolve_game_external_id", { gameId, platform });
}
