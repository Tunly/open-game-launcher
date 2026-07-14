import type {
  InstallModRequest,
  ManagedMod,
  ModActionResult,
  ModBrowsePage,
  ModBrowseRequest,
  ModInstallQueueItem,
  NxmHandlerStatus,
  NxmLinkStatus,
  ModProvider,
  ModProviderStatus,
  OpenProviderModRequest,
} from "./types";
import { invokeCommand } from "./shared";

export function getModQueue(): Promise<ModInstallQueueItem[]> {
  return invokeCommand<ModInstallQueueItem[]>("get_mod_queue");
}

export function pauseModInstall(installId: string): Promise<void> {
  return invokeCommand<void>("pause_mod_install", { installId });
}

export function cancelModInstall(installId: string): Promise<void> {
  return invokeCommand<void>("cancel_mod_install", { installId });
}

export function getModProviderStatus(
  provider: ModProvider,
  gameId?: string,
): Promise<ModProviderStatus> {
  return invokeCommand<ModProviderStatus>("get_mod_provider_status", { provider, gameId });
}

export function connectNexus(): Promise<ModProviderStatus> {
  return invokeCommand<ModProviderStatus>("connect_nexus");
}

export function disconnectNexus(): Promise<ModProviderStatus> {
  return invokeCommand<ModProviderStatus>("disconnect_nexus");
}

export function browseMods(input: ModBrowseRequest): Promise<ModBrowsePage> {
  return invokeCommand<ModBrowsePage>("browse_mods", { input });
}

export function installMod(input: InstallModRequest): Promise<ModActionResult> {
  return invokeCommand<ModActionResult>("install_mod", { input });
}

export function listManagedMods(gameId: string): Promise<ManagedMod[]> {
  return invokeCommand<ManagedMod[]>("list_managed_mods", { gameId });
}

export function setModEnabled(installId: string, enabled: boolean): Promise<ManagedMod> {
  return invokeCommand<ManagedMod>("set_mod_enabled", { installId, enabled });
}

export function removeMod(installId: string): Promise<void> {
  return invokeCommand<void>("remove_mod", { installId });
}

export function openProviderMod(input: OpenProviderModRequest): Promise<ModActionResult> {
  return invokeCommand<ModActionResult>("open_provider_mod", { input });
}

export function getNxmHandlerStatus(): Promise<NxmHandlerStatus> {
  return invokeCommand<NxmHandlerStatus>("get_nxm_handler_status");
}

export function openNxmHandlerSettings(): Promise<void> {
  return invokeCommand<void>("open_nxm_handler_settings");
}

export function takePendingNxmStatus(): Promise<NxmLinkStatus | null> {
  return invokeCommand<NxmLinkStatus | null>("take_pending_nxm_status");
}
