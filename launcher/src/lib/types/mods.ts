export type ModProvider = "nexus" | "steam_workshop";

/**
 * Historical provider values can still exist in local manifests and Supabase.
 * They are intentionally excluded from every new browse/install surface.
 */
export type LegacyModProvider =
  "modio" | "curseforge" | "direct_url" | "local_archive" | "local_folder";

export type StoredModProvider = ModProvider | LegacyModProvider;

export type ModBrowseSort = "popular" | "latest";

export type ModInstallCapability = "native" | "nxm_handoff" | "steam_handoff" | "unavailable";

export type ModProviderAction = "connect" | "disconnect" | "open_provider" | "none";

export interface ModBrowseRequest {
  gameId: string;
  provider: ModProvider;
  query: string;
  sort: ModBrowseSort;
  cursor?: string;
  pageSize?: number;
}

export interface ModBrowseItem {
  id: string;
  provider: ModProvider;
  name: string;
  author: string | null;
  summary: string | null;
  url: string;
  iconUrl: string | null;
  bannerUrl: string | null;
  downloads: string | null;
  endorsements: string | null;
  version: string | null;
  fileSizeBytes: number | null;
  installCapability: ModInstallCapability;
  installed: boolean;
  updateAvailable: boolean;
}

export interface ModBrowsePage {
  items: ModBrowseItem[];
  nextCursor: string | null;
  total: number | null;
  message: string | null;
}

export interface ModProviderStatus {
  provider: ModProvider;
  available: boolean;
  connected: boolean;
  supportsBrowse: boolean;
  supportsNativeInstall: boolean;
  message: string;
  action: ModProviderAction;
  actionLabel: string | null;
}

export interface NxmHandlerStatus {
  registered: boolean;
  isDefault: boolean;
  state: "not_checked" | "registered" | "handler_conflict" | "unavailable" | "os_managed";
  message: string;
}

export interface NxmLinkStatus {
  accepted: boolean;
  code: "ready" | "expired" | "invalid_link" | "continuation_failed";
  message: string;
  gameDomain: string | null;
  modId: number | null;
  fileId: number | null;
}

export type ManagedModStatus =
  "installed" | "disabled" | "external" | "update_available" | "damaged";

export interface ManagedMod {
  installId: string;
  gameId: string;
  provider: ModProvider;
  providerItemId: string | null;
  title: string;
  version: string | null;
  enabled: boolean;
  status: ManagedModStatus;
  installedAt: number | null;
  canToggle: boolean;
  canRemove: boolean;
  manageUrl: string | null;
}

export type ModActionResult =
  | {
      status: "queued";
      message: string;
      installId: string | null;
      delegatedUrl: null;
    }
  | {
      status: "handoff";
      message: string;
      installId: null;
      delegatedUrl: string;
    }
  | {
      status: "unavailable";
      message: string;
      installId: null;
      delegatedUrl: null;
    };

export interface InstallModRequest {
  gameId: string;
  provider: ModProvider;
  itemId: string;
  title: string;
  capability: ModInstallCapability;
}

export interface OpenProviderModRequest {
  gameId: string;
  provider: ModProvider;
  itemId?: string;
  url?: string;
  query?: string;
  sort?: ModBrowseSort;
}

export type ModInstallStatus =
  | "queued"
  | "starting"
  | "downloading"
  | "delegated"
  | "installing"
  | "completed"
  | "failed"
  | "cancelled";

export interface ModInstallQueueItem {
  id: string;
  installId: string;
  gameId: string;
  title: string;
  provider: StoredModProvider;
  progress: number;
  speed: string;
  status: ModInstallStatus;
  phase: string;
  bytesDownloaded?: number | null;
  bytesTotal?: number | null;
  canPause: boolean;
  canCancel: boolean;
  external: boolean;
  targetPath?: string | null;
  delegatedUrl?: string | null;
  error?: string | null;
  lastUpdatedAt: number;
  eventRevision?: number;
}

export interface InstalledModInfo {
  id: string;
  installId: string;
  gameId: string;
  title: string;
  provider: StoredModProvider;
  enabled: boolean;
  targetPath: string;
  installedFiles: string[];
  profileId?: string | null;
  catalogItemId?: string | null;
  versionId?: string | null;
  providerFileId?: string | null;
  sourceUrl?: string | null;
  installedAt: number;
}
