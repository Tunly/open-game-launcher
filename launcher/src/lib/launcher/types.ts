// Re-export ALL types from lib/types hierarchy — this makes types.ts a superset
export * from "../types";
export * from "../types/backup";
export * from "../types/controllers";
export * from "../types/friends";
export * from "../types/mods";
export * from "../types/store";

import type {
  PluginActivationPlanReviewEvidence,
  PluginDisabledRegistryAuditEvidence,
  PluginManifestEvidence,
  PluginMarketplaceTrustEvidence,
  PluginRuntimeSandboxProofEvidence,
  PluginUpdateSigningReviewEvidence,
} from "../plugin-system-readiness";

// Types that were defined in launcher.ts itself (NOT in lib/types)
import type { Game } from "../types";

export type { Game };

export interface RemoteCompanionDeviceSecretInput {
  deviceId: string;
  deviceSecret: string;
  deviceSecretHint?: string | null;
}

export interface RemoteCompanionDeviceSecretStatus {
  deviceId: string | null;
  deviceSecretHint: string | null;
  hasSecret: boolean;
  updatedAtEpochMs: number | null;
}

export interface PluginManifestDiscoveryResult {
  discoveryPath: string;
  loadedAt: string;
  manifests: PluginManifestEvidence[];
  maxDepth: number;
  scannedFileCount: number;
  skippedEntries: string[];
  sourceLabel: string;
}

export interface SignedPluginPackageStageConsent {
  accepted: boolean;
  operation: string;
}

export interface SignedPluginPackageStageRequest {
  consent: SignedPluginPackageStageConsent;
  packagePath: string;
}

export interface StagedSignedPluginPackageResult {
  entrypoint: string;
  fileCount: number;
  keyId: string;
  message: string;
  pluginId: string;
  registryPath: string;
  signatureIssuer: string;
  status: "disabled";
  version: string;
}

export type StagedPluginRegistryAuditResult = PluginDisabledRegistryAuditEvidence;

export interface PluginRuntimeSandboxProofRequest {
  consent: {
    accepted: boolean;
    operation: string;
  };
}

export type PluginRuntimeSandboxProofResult = PluginRuntimeSandboxProofEvidence;

export type PluginActivationPlanReviewResult = PluginActivationPlanReviewEvidence;

export interface PluginMarketplaceUpdateIndexTrustRequest {
  consent: {
    accepted: boolean;
    operation: string;
  };
  indexPath: string;
}

export type PluginMarketplaceUpdateIndexTrustResult = PluginMarketplaceTrustEvidence;

export interface PluginUpdateSigningEnvelopeReviewRequest {
  consent: {
    accepted: boolean;
    operation: string;
  };
  envelopePath: string;
}

export type PluginUpdateSigningEnvelopeReviewResult = PluginUpdateSigningReviewEvidence;

export interface RemoteCompanionPollJobResult {
  gameId: string;
  jobId: string;
  localQueueId: string | null;
  message: string;
  status: "failed" | "started" | string;
}

export interface RemoteCompanionPollOnceResult {
  claimed: number;
  configured: boolean;
  failed: number;
  jobs: RemoteCompanionPollJobResult[];
  started: number;
}

export interface GogToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
}

export interface EaToken {
  accessToken: string;
  capturedAt: number;
}

export interface XboxFetchResult {
  games: OwnedGame[];
  gamertag?: string | null;
}

export interface OwnedGame {
  id: string;
  externalId?: string | null;
  title: string;
  description: string;
  coverUrl: string | null;
  logoUrl: string | null;
  iconUrl?: string;
  playtimeMinutes: number;
  lastPlayedAt?: string | null;
  cloudGamingUrl?: string | null;
}
