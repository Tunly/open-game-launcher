import { invoke } from "@tauri-apps/api/core";

import type {
  LaunchGameResponse,
  Game,
  StartDownloadResponse,
  SystemInfo,
  VerifyGameFilesResult,
} from "./types";

type CommandArgs = Record<string, unknown>;

export class LauncherCommandError extends Error {
  constructor(
    public readonly command: string,
    cause: unknown,
  ) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`${command} failed: ${message}`);
    this.name = "LauncherCommandError";
  }
}

async function invokeCommand<T>(
  command: string,
  args?: CommandArgs,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new LauncherCommandError(command, error);
  }
}

export function getSystemInfo(): Promise<SystemInfo> {
  return invokeCommand<SystemInfo>("get_system_info");
}

export function getDefaultInstallDir(): Promise<string> {
  return invokeCommand<string>("get_default_install_dir");
}

export function listInstalledGames(): Promise<Game[]> {
  return invokeCommand<Game[]>("list_installed_games");
}

export function launchGame(gameId: string): Promise<LaunchGameResponse> {
  return invokeCommand<LaunchGameResponse>("launch_game", { gameId });
}

export function verifyGameFiles(
  gameId: string,
): Promise<VerifyGameFilesResult> {
  return invokeCommand<VerifyGameFilesResult>("verify_game_files", { gameId });
}

export function startDownload(gameId: string): Promise<StartDownloadResponse> {
  return invokeCommand<StartDownloadResponse>("start_download", { gameId });
}
