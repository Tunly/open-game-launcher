export type ModProvider =
  | "steam_workshop"
  | "modio"
  | "curseforge"
  | "direct_url"
  | "local_archive"
  | "local_folder";

export type ModInstallStatus =
  | "queued"
  | "starting"
  | "downloading"
  | "delegated"
  | "installing"
  | "completed"
  | "failed"
  | "cancelled";

export type ModSource = "manual" | "steam_workshop" | "local";

export interface ModProfile {
  id: string;
  userId: string;
  name: string;
  gameId: string;
  isActive: boolean;
  createdAt: string;
}

export interface ManagedMod {
  id: string;
  userId: string;
  gameId: string | null;
  gameTitle: string;
  name: string;
  source: ModSource;
  sourceUrl: string | null;
  author: string | null;
  description: string | null;
  category: string | null;
  enabled: boolean;
  loadOrder: number;
  profileId: string | null;
  currentVersionId: string | null;
  installedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModVersion {
  id: string;
  modId: string;
  version: string;
  changelog: string | null;
  fileSizeBytes: number;
  sha256: string | null;
  downloadUrl: string | null;
  isLatest: boolean;
  createdAt: string;
}

export interface ModFile {
  id: string;
  modVersionId: string;
  fileName: string;
  relativePath: string;
  sizeBytes: number;
  sha256: string | null;
  storagePath: string | null;
  createdAt: string;
}

export interface ModDependency {
  id: string;
  modId: string;
  dependsOnModId: string;
  requiredVersion: string | null;
  isOptional: boolean;
}

export interface ModReview {
  id: string;
  modId: string;
  userId: string;
  rating: number;
  review: string | null;
  createdAt: string;
}

export interface ModInstallRequest {
  gameId: string;
  provider: ModProvider;
  catalogItemId?: string;
  versionId?: string;
  sourceUrl?: string;
  localPath?: string;
  targetPolicyId?: string;
  profileId?: string;
  title?: string;
  sha256?: string;
}

export interface ModInstallResult {
  installId: string;
  gameId: string;
  status: ModInstallStatus;
  provider: ModProvider;
  targetPath: string | null;
  installedFiles: string[];
  delegatedUrl: string | null;
  message: string;
}

export interface ModInstallQueueItem {
  id: string;
  installId: string;
  gameId: string;
  title: string;
  provider: ModProvider;
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
}

export interface InstalledModInfo {
  id: string;
  installId: string;
  gameId: string;
  title: string;
  provider: ModProvider;
  enabled: boolean;
  targetPath: string;
  installedFiles: string[];
  profileId?: string | null;
  catalogItemId?: string | null;
  versionId?: string | null;
  sourceUrl?: string | null;
  installedAt: number;
}

export interface ModCatalogEntry {
  id: string;
  slug: string;
  localGameId?: string | null;
  gameId?: string | null;
  name: string;
  author?: string | null;
  summary?: string | null;
  description?: string | null;
  provider: ModProvider;
  sourceUrl?: string | null;
  externalId?: string | null;
  categories: string[];
  tags: string[];
  iconUrl?: string | null;
  bannerUrl?: string | null;
  status: "draft" | "published" | "delisted";
  latestVersion?: ModCatalogVersion | null;
}

export interface ModCatalogVersion {
  id: string;
  catalogModId: string;
  version: string;
  changelog?: string | null;
  fileSizeBytes: number;
  sha256?: string | null;
  downloadUrl?: string | null;
  storagePath?: string | null;
  installStrategy: "archive" | "copy" | "external";
  isLatest: boolean;
  status: "draft" | "published" | "delisted";
  createdAt: string;
}

export interface NexusModInfo {
  name: string;
  author: string;
  summary: string;
  iconUrl: string | null;
  downloadsCount: string | null;
  gameName: string;
}

export interface NexusSearchResult {
  name: string;
  author: string;
  summary: string;
  url: string;
  iconUrl: string | null;
  downloads: string | null;
  endorsements: string | null;
}
