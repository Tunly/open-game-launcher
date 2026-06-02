export type ModSource = "manual" | "steam_workshop" | "nexus" | "local";

export interface ModProfile {
  id: string; userId: string; name: string; gameId: string; isActive: boolean; createdAt: string;
}

export interface ManagedMod {
  id: string; userId: string; gameId: string | null; gameTitle: string;
  name: string; source: ModSource; sourceUrl: string | null;
  author: string | null; description: string | null; category: string | null;
  enabled: boolean; loadOrder: number;
  profileId: string | null; currentVersionId: string | null;
  installedAt: string; createdAt: string; updatedAt: string;
}

export interface ModVersion {
  id: string; modId: string; version: string; changelog: string | null;
  fileSizeBytes: number; sha256: string | null; downloadUrl: string | null;
  isLatest: boolean; createdAt: string;
}

export interface ModFile {
  id: string; modVersionId: string; fileName: string; relativePath: string;
  sizeBytes: number; sha256: string | null; storagePath: string | null; createdAt: string;
}

export interface ModDependency {
  id: string; modId: string; dependsOnModId: string;
  requiredVersion: string | null; isOptional: boolean;
}

export interface ModReview {
  id: string; modId: string; userId: string;
  rating: number; review: string | null; createdAt: string;
}
