import type {
  InstalledModInfo,
  ModInstallQueueItem,
  ModInstallRequest,
  ModInstallResult,
  ModProvider,
  NexusModInfo,
  NexusSearchResult,
} from "./types";
import { invokeCommand } from "./shared";

export function startModInstall(input: ModInstallRequest): Promise<ModInstallResult> {
  return invokeCommand<ModInstallResult>("start_mod_install", { input });
}

export function getModQueue(): Promise<ModInstallQueueItem[]> {
  return invokeCommand<ModInstallQueueItem[]>("get_mod_queue");
}

export function pauseModInstall(installId: string): Promise<void> {
  return invokeCommand<void>("pause_mod_install", { installId });
}

export function cancelModInstall(installId: string): Promise<void> {
  return invokeCommand<void>("cancel_mod_install", { installId });
}

export function scanGameMods(gameId: string): Promise<InstalledModInfo[]> {
  return invokeCommand<InstalledModInfo[]>("scan_game_mods", { gameId });
}

export function enableMod(installId: string): Promise<InstalledModInfo> {
  return invokeCommand<InstalledModInfo>("enable_mod", { installId });
}

export function disableMod(installId: string): Promise<InstalledModInfo> {
  return invokeCommand<InstalledModInfo>("disable_mod", { installId });
}

export function uninstallMod(installId: string): Promise<void> {
  return invokeCommand<void>("uninstall_mod", { installId });
}

export function setModProviderSecret(provider: ModProvider, secret: string): Promise<void> {
  return invokeCommand<void>("set_mod_provider_secret", { provider, secret });
}

export function scrapeNexusModInfo(url: string): Promise<NexusModInfo> {
  return invokeCommand<NexusModInfo>("scrape_nexus_mod_info", { url });
}

export function searchNexusMods(
  game: string,
  query: string,
  page?: number,
): Promise<NexusSearchResult[]> {
  return invokeCommand<NexusSearchResult[]>("search_nexus_mods", { game, query, page: page ?? 1 });
}
