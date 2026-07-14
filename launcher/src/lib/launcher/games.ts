import { isTauri } from "@tauri-apps/api/core";
import type {
  Game,
  LaunchGameResponse,
  RepairGameFilesResponse,
  SyncGameAchievementsResponse,
  SyncGameSavesResponse,
  UninstallGameResponse,
  VerifyGameFilesResponse,
} from "./types";
import type {
  GameActionCapability,
  GameActionResult,
  PrepareGameActionConfirmationInput,
  PrepareGameActionConfirmationResult,
  RunGameActionInput,
} from "../game-actions";
import { writeActivePerformanceGameContext } from "../performance-context";
import { invokeCommand } from "./shared";

const DESKTOP_GAME_ACTIONS_REQUIRED =
  "Game actions are available only in the OG-Launcher desktop app.";

export function listInstalledGames(): Promise<Game[]> {
  if (!isTauri()) {
    return Promise.resolve([]);
  }

  return invokeCommand<Game[]>("list_installed_games");
}

export function refreshInstalledGames(): Promise<Game[]> {
  if (!isTauri()) {
    return Promise.resolve([]);
  }

  return invokeCommand<Game[]>("refresh_installed_games");
}

export function updateAchievementProviderStatus(input: {
  gameId: string;
  status: NonNullable<Game["achievementProviderStatuses"]>[number];
}): Promise<Game> {
  return invokeCommand<Game>("update_achievement_provider_status", { input });
}

export function openAchievementCacheFolder(provider?: string): Promise<string> {
  if (!isTauri()) {
    return Promise.reject(new Error("Achievement cache folders are available in the desktop app."));
  }

  return invokeCommand<string>("open_achievement_cache_folder", { provider });
}

export function addManualGame(input: { title: string; installPath: string }): Promise<Game> {
  return invokeCommand<Game>("add_manual_game", { input });
}

export function moveGame(input: { gameId: string; newPath: string }): Promise<void> {
  return invokeCommand<void>("move_game", { input });
}

export function verifyGameFiles(gameId: string): Promise<VerifyGameFilesResponse> {
  if (!isTauri()) {
    return Promise.reject(new Error(DESKTOP_GAME_ACTIONS_REQUIRED));
  }

  return invokeCommand<VerifyGameFilesResponse>("verify_game_files", { gameId });
}

export function getGameActionCapabilities(gameId: string): Promise<GameActionCapability[]> {
  if (!isTauri()) {
    return Promise.reject(new Error(DESKTOP_GAME_ACTIONS_REQUIRED));
  }

  return invokeCommand<GameActionCapability[]>("get_game_action_capabilities", { gameId });
}

export function runGameAction(input: RunGameActionInput): Promise<GameActionResult> {
  if (!isTauri()) {
    return Promise.reject(new Error(DESKTOP_GAME_ACTIONS_REQUIRED));
  }

  return invokeCommand<GameActionResult>("run_game_action", { input });
}

export function prepareGameActionConfirmation(
  input: PrepareGameActionConfirmationInput,
): Promise<PrepareGameActionConfirmationResult> {
  if (!isTauri()) {
    return Promise.reject(new Error(DESKTOP_GAME_ACTIONS_REQUIRED));
  }

  return invokeCommand<PrepareGameActionConfirmationResult>("prepare_game_action_confirmation", {
    input,
  });
}

export function repairGameFiles(gameId: string): Promise<RepairGameFilesResponse> {
  if (!isTauri()) {
    return Promise.reject(new Error("File repair is available in the desktop app."));
  }

  return invokeCommand<RepairGameFilesResponse>("repair_game_files", { gameId });
}

export async function launchGame(gameId: string): Promise<LaunchGameResponse> {
  const response = await invokeCommand<LaunchGameResponse>("launch_game", { gameId });
  writeActivePerformanceGameContext({ gameId });
  return response;
}

export function syncGameAchievements(
  game: Game,
  steamId?: string,
): Promise<SyncGameAchievementsResponse> {
  if (game.launcher === "xbox") {
    const titleId = game.externalId?.trim() || game.id || game.title;
    // Xbox uses its own sync command
    return invokeCommand<SyncGameAchievementsResponse>("sync_xbox_achievements", {
      fallbackGame: game,
      gameId: game.id,
      titleId,
    });
  }
  if (["gog", "epic", "ea", "ubisoft", "battlenet"].includes(game.launcher ?? "")) {
    return invokeCommand<SyncGameAchievementsResponse>("sync_local_game_achievements", {
      fallbackGame: game,
      gameId: game.id,
      provider: game.launcher,
    });
  }
  return invokeCommand<SyncGameAchievementsResponse>("sync_game_achievements", {
    fallbackGame: game,
    gameId: game.id,
    steamId,
  });
}

export function uninstallGame(gameId: string): Promise<UninstallGameResponse> {
  return invokeCommand<UninstallGameResponse>("uninstall_game", { gameId });
}

export function syncGameSaves(gameId: string): Promise<SyncGameSavesResponse> {
  return invokeCommand<SyncGameSavesResponse>("sync_game_saves", { gameId });
}
