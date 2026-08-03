import { useState } from "react";
import { z } from "zod";

import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import {
  auditStagedPluginRegistry,
  provePluginRuntimeSandbox,
  reviewPluginActivationPlan,
  reviewPluginMarketplaceUpdateIndexTrust,
  reviewPluginUpdateSigningEnvelope,
  scanLocalPluginManifests,
  stageSignedPluginPackage,
} from "../../lib/launcher";
import {
  buildPluginSystemReadiness,
  createVerifyPluginMarketplaceUpdateIndexTrustReadiness,
  createVerifyPluginRuntimeSandboxReadiness,
  createVerifyPluginUpdateSigningReadiness,
  createVerifyPluginSystemReadiness,
  parsePluginManifestImportPayload,
  type PluginActivationPlanReviewEvidence,
  type PluginDisabledRegistryAuditEvidence,
  type PluginManifestEvidence,
  type PluginMarketplaceTrustEvidence,
  type PluginRuntimeSandboxProofEvidence,
  type PluginSignedPackageStageEvidence,
  type PluginUpdateSigningReviewEvidence,
} from "../../lib/plugin-system-readiness";
import { STORAGE_KEYS } from "../../lib/storage-keys";
import { PluginSystemReadinessPanel } from "./PluginSystemReadinessPanel";

interface PluginDiagnosticsPanelProps {
  isDesktopRuntime: boolean;
  verifyMode: string | null;
}

interface LocalPluginDiscoveryState {
  discoveryPath: string | null;
  importedAt: string | null;
  manifests: PluginManifestEvidence[];
  scannedFileCount: number;
  skippedEntries: string[];
  sourceLabel: string;
}

interface LocalPluginSignedPackageStagingState {
  packages: PluginSignedPackageStageEvidence[];
  updatedAt: string | null;
}

const emptyPluginDiscoveryState: LocalPluginDiscoveryState = {
  discoveryPath: null,
  importedAt: null,
  manifests: [],
  scannedFileCount: 0,
  skippedEntries: [],
  sourceLabel: "Local review",
};

const emptyPluginSignedPackageStagingState: LocalPluginSignedPackageStagingState = {
  packages: [],
  updatedAt: null,
};

const pluginManifestEvidenceSchema: z.ZodType<PluginManifestEvidence> = z.object({
  entrypoint: z.string().max(260).nullable().optional(),
  id: z.string().max(96).nullable().optional(),
  name: z.string().max(96).nullable().optional(),
  permissions: z.array(z.string().max(96)).max(32).nullable().optional(),
  signatureIssuer: z.string().max(160).nullable().optional(),
  signed: z.boolean().nullable().optional(),
  themeHooks: z.array(z.string().max(96)).max(32).nullable().optional(),
  updateChannel: z.string().max(96).nullable().optional(),
  version: z.string().max(64).nullable().optional(),
});

const pluginDiscoveryStateSchema: z.ZodType<LocalPluginDiscoveryState> = z.object({
  discoveryPath: z.string().max(512).nullable(),
  importedAt: z.string().max(64).nullable(),
  manifests: z.array(pluginManifestEvidenceSchema).max(32),
  scannedFileCount: z.number().int().nonnegative().max(240),
  skippedEntries: z.array(z.string().max(512)).max(32),
  sourceLabel: z.string().max(64),
});

const pluginSignedPackageStageEvidenceSchema: z.ZodType<PluginSignedPackageStageEvidence> =
  z.object({
    detail: z.string().max(280),
    entrypoint: z.string().max(260),
    fileCount: z.number().int().nonnegative().max(1000),
    keyId: z.string().max(128),
    pluginId: z.string().max(96),
    registryPath: z.string().max(512),
    signatureIssuer: z.string().max(160),
    status: z.literal("disabled"),
    version: z.string().max(64),
  });

const pluginSignedPackageStagingStateSchema: z.ZodType<LocalPluginSignedPackageStagingState> =
  z.object({
    packages: z.array(pluginSignedPackageStageEvidenceSchema).max(8),
    updatedAt: z.string().max(64).nullable(),
  });

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function readBrowserFileText(file: File) {
  if (typeof file.text === "function") return file.text();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("Plugin manifest file read failed.")),
    );
    reader.addEventListener("load", () =>
      resolve(typeof reader.result === "string" ? reader.result : ""),
    );
    reader.readAsText(file);
  });
}

function formatPluginDiscoveryLoadedAt(value: string) {
  const millis = Number(value);
  const date = Number.isFinite(millis) ? new Date(millis) : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function PluginDiagnosticsPanel({
  isDesktopRuntime,
  verifyMode,
}: PluginDiagnosticsPanelProps) {
  const isPluginSystemReadinessVerify = verifyMode === "plugin-system-readiness";
  const isPluginDisabledRegistryAuditVerify =
    verifyMode === "plugin-disabled-registry-audit" ||
    verifyMode === "plugin-system-native-disabled-registry-audit";
  const isPluginRuntimeSandboxVerify = verifyMode === "plugin-runtime-sandbox-process-boundary";
  const isPluginUpdateSigningVerify = verifyMode === "plugin-update-signing-review";
  const isPluginMarketplaceUpdateIndexTrustVerify =
    verifyMode === "plugin-marketplace-update-index-trust";
  const isPluginSystemVerify =
    isPluginSystemReadinessVerify ||
    isPluginDisabledRegistryAuditVerify ||
    isPluginRuntimeSandboxVerify ||
    isPluginUpdateSigningVerify ||
    isPluginMarketplaceUpdateIndexTrustVerify;
  const [pluginDiscoveryState, setPluginDiscoveryState] =
    useLocalStorageState<LocalPluginDiscoveryState>(
      STORAGE_KEYS.PLUGIN_MANIFEST_DISCOVERY,
      emptyPluginDiscoveryState,
      pluginDiscoveryStateSchema,
    );
  const [pluginSignedPackageStagingState, setPluginSignedPackageStagingState] =
    useLocalStorageState<LocalPluginSignedPackageStagingState>(
      STORAGE_KEYS.PLUGIN_SIGNED_PACKAGE_STAGING,
      emptyPluginSignedPackageStagingState,
      pluginSignedPackageStagingStateSchema,
    );
  const [pluginDiscoveryBusy, setPluginDiscoveryBusy] = useState(false);
  const [pluginDiscoveryMessage, setPluginDiscoveryMessage] = useState<string | null>(null);
  const [pluginPackagePath, setPluginPackagePath] = useState("");
  const [pluginPackageConsentOperation, setPluginPackageConsentOperation] = useState(
    "stage_plugin_package:<plugin-id>@<version>",
  );
  const [pluginPackageStagingBusy, setPluginPackageStagingBusy] = useState(false);
  const [pluginRegistryAuditBusy, setPluginRegistryAuditBusy] = useState(false);
  const [pluginDisabledRegistryAudit, setPluginDisabledRegistryAudit] =
    useState<PluginDisabledRegistryAuditEvidence | null>(
      isPluginDisabledRegistryAuditVerify || isPluginRuntimeSandboxVerify
        ? createVerifyPluginSystemReadiness().disabledRegistryAudit
        : null,
    );
  const [pluginRuntimeSandboxProof, setPluginRuntimeSandboxProof] =
    useState<PluginRuntimeSandboxProofEvidence | null>(
      isPluginRuntimeSandboxVerify
        ? createVerifyPluginRuntimeSandboxReadiness().runtimeSandboxProof
        : null,
    );
  const [pluginRuntimeSandboxProofBusy, setPluginRuntimeSandboxProofBusy] = useState(false);
  const [pluginActivationPlanReview, setPluginActivationPlanReview] =
    useState<PluginActivationPlanReviewEvidence | null>(null);
  const [pluginActivationReviewPluginId, setPluginActivationReviewPluginId] =
    useState("library-tags-exporter");
  const [pluginActivationReviewVersion, setPluginActivationReviewVersion] = useState("0.3.1");
  const [pluginActivationReviewConsentOperation, setPluginActivationReviewConsentOperation] =
    useState("review_plugin_activation_plan:library-tags-exporter@0.3.1");
  const [pluginActivationReviewBusy, setPluginActivationReviewBusy] = useState(false);
  const [pluginUpdateEnvelopePath, setPluginUpdateEnvelopePath] = useState("");
  const [pluginUpdateSigningReview, setPluginUpdateSigningReview] =
    useState<PluginUpdateSigningReviewEvidence | null>(
      isPluginUpdateSigningVerify
        ? createVerifyPluginUpdateSigningReadiness().updateSigningReview
        : null,
    );
  const [pluginUpdateReviewBusy, setPluginUpdateReviewBusy] = useState(false);
  const [pluginMarketplaceIndexPath, setPluginMarketplaceIndexPath] = useState("");
  const [pluginMarketplaceTrust, setPluginMarketplaceTrust] =
    useState<PluginMarketplaceTrustEvidence | null>(
      isPluginMarketplaceUpdateIndexTrustVerify
        ? createVerifyPluginMarketplaceUpdateIndexTrustReadiness().marketplaceTrust
        : null,
    );
  const [pluginMarketplaceReviewBusy, setPluginMarketplaceReviewBusy] = useState(false);
  const [pluginReviewMessage, setPluginReviewMessage] = useState<string | null>(null);
  const [pluginPackageStagingMessage, setPluginPackageStagingMessage] = useState<string | null>(
    null,
  );

  async function handleChoosePluginFolder() {
    if (!isDesktopRuntime) {
      setPluginDiscoveryMessage(
        "Browser preview can import manifest JSON; desktop app scans plugin folders.",
      );
      return;
    }
    setPluginDiscoveryBusy(true);
    setPluginDiscoveryMessage(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: "Choose OG plugin folder",
      });
      if (typeof selectedPath !== "string") {
        setPluginDiscoveryMessage("Plugin folder scan cancelled.");
        return;
      }
      const result = await scanLocalPluginManifests(selectedPath);
      setPluginDiscoveryState({
        discoveryPath: result.discoveryPath,
        importedAt: formatPluginDiscoveryLoadedAt(result.loadedAt),
        manifests: result.manifests,
        scannedFileCount: result.scannedFileCount,
        skippedEntries: result.skippedEntries.slice(0, 32),
        sourceLabel: result.sourceLabel,
      });
      setPluginDiscoveryMessage(
        `Read-only scan staged ${result.manifests.length} manifest${result.manifests.length === 1 ? "" : "s"} for review.`,
      );
    } catch (error) {
      setPluginDiscoveryMessage(getErrorMessage(error));
    } finally {
      setPluginDiscoveryBusy(false);
    }
  }

  async function handleImportPluginManifestFile(file: File) {
    setPluginDiscoveryBusy(true);
    setPluginDiscoveryMessage(null);
    try {
      const manifests = parsePluginManifestImportPayload(await readBrowserFileText(file));
      setPluginDiscoveryState({
        discoveryPath: file.name,
        importedAt: new Date().toISOString(),
        manifests,
        scannedFileCount: 1,
        skippedEntries: [],
        sourceLabel: "Browser JSON import",
      });
      setPluginDiscoveryMessage(
        `Imported ${manifests.length} manifest${manifests.length === 1 ? "" : "s"} for local review.`,
      );
    } catch (error) {
      setPluginDiscoveryMessage(getErrorMessage(error));
    } finally {
      setPluginDiscoveryBusy(false);
    }
  }

  function handleResetPluginDiscovery() {
    setPluginDiscoveryState(emptyPluginDiscoveryState);
    setPluginDiscoveryMessage("Local plugin discovery review reset.");
  }

  async function handleChooseSignedPluginPackageFolder() {
    if (!isDesktopRuntime) {
      setPluginPackageStagingMessage(
        "Browser preview cannot stage signed plugin packages; open the desktop app to choose a package folder.",
      );
      return;
    }
    setPluginPackageStagingBusy(true);
    setPluginPackageStagingMessage(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: "Choose signed OG plugin package",
      });
      if (typeof selectedPath !== "string") {
        setPluginPackageStagingMessage("Signed package folder selection cancelled.");
        return;
      }
      setPluginPackagePath(selectedPath);
      setPluginPackageStagingMessage(
        "Signed package folder selected; review the manifest id/version and enter the exact consent operation before staging.",
      );
    } catch (error) {
      setPluginPackageStagingMessage(getErrorMessage(error));
    } finally {
      setPluginPackageStagingBusy(false);
    }
  }

  async function handleStageSignedPluginPackage() {
    const packagePath = pluginPackagePath.trim();
    const consentOperation = pluginPackageConsentOperation.trim();
    if (!isDesktopRuntime) {
      setPluginPackageStagingMessage(
        "Signed package staging is desktop-only; browser preview keeps the package path and consent review inert.",
      );
      return;
    }
    if (!packagePath) {
      setPluginPackageStagingMessage("Enter or choose a signed plugin package folder first.");
      return;
    }
    if (!consentOperation.startsWith("stage_plugin_package:")) {
      setPluginPackageStagingMessage(
        "Consent operation must match stage_plugin_package:<plugin-id>@<version> from the signed manifest.",
      );
      return;
    }
    setPluginPackageStagingBusy(true);
    setPluginDisabledRegistryAudit(null);
    setPluginRuntimeSandboxProof(null);
    setPluginPackageStagingMessage(null);
    try {
      const result = await stageSignedPluginPackage({
        consent: { accepted: true, operation: consentOperation },
        packagePath,
      });
      const stagedPackage: PluginSignedPackageStageEvidence = {
        detail: result.message,
        entrypoint: result.entrypoint,
        fileCount: result.fileCount,
        keyId: result.keyId,
        pluginId: result.pluginId,
        registryPath: result.registryPath,
        signatureIssuer: result.signatureIssuer,
        status: "disabled",
        version: result.version,
      };
      setPluginActivationPlanReview(null);
      setPluginUpdateSigningReview(null);
      setPluginMarketplaceTrust(null);
      setPluginSignedPackageStagingState((current) => ({
        packages: [
          stagedPackage,
          ...current.packages.filter(
            (item) =>
              item.pluginId !== stagedPackage.pluginId || item.version !== stagedPackage.version,
          ),
        ].slice(0, 8),
        updatedAt: new Date().toISOString(),
      }));
      setPluginPackageStagingMessage(
        `${result.pluginId} ${result.version} staged disabled; no plugin code was executed.`,
      );
    } catch (error) {
      setPluginPackageStagingMessage(getErrorMessage(error));
    } finally {
      setPluginPackageStagingBusy(false);
    }
  }

  async function handleAuditStagedPluginRegistry() {
    if (!isDesktopRuntime) {
      setPluginPackageStagingMessage(
        "Native disabled registry audit is desktop-only; browser package rows stay display cache.",
      );
      return;
    }
    setPluginRegistryAuditBusy(true);
    setPluginPackageStagingMessage(null);
    try {
      const audit = await auditStagedPluginRegistry();
      setPluginDisabledRegistryAudit(audit);
      setPluginPackageStagingMessage(
        `Disabled registry audit complete: ${audit.passedCount} passed, ${audit.failedCount} blocked.`,
      );
    } catch (error) {
      setPluginPackageStagingMessage(getErrorMessage(error));
    } finally {
      setPluginRegistryAuditBusy(false);
    }
  }

  async function handleProvePluginRuntimeSandbox() {
    if (!isDesktopRuntime) {
      setPluginPackageStagingMessage(
        "Native runtime sandbox process proof is desktop-only; browser rows stay display cache and no plugin code is loaded.",
      );
      return;
    }
    setPluginRuntimeSandboxProofBusy(true);
    setPluginPackageStagingMessage(null);
    try {
      const proof = await provePluginRuntimeSandbox({
        consent: { accepted: true, operation: "prove_plugin_runtime_sandbox_process_proof" },
      });
      setPluginRuntimeSandboxProof(proof);
      setPluginPackageStagingMessage(
        `Runtime sandbox process proof complete: ${proof.deniedEntrypointCount} denied, ${proof.allowedExecutionCount} allowed, codeExecuted ${String(proof.codeExecuted)}, ${proof.escapeAttempts.length} escape fixtures blocked.`,
      );
    } catch (error) {
      setPluginPackageStagingMessage(getErrorMessage(error));
    } finally {
      setPluginRuntimeSandboxProofBusy(false);
    }
  }

  async function handleReviewPluginActivationPlan() {
    const pluginId = pluginActivationReviewPluginId.trim();
    const version = pluginActivationReviewVersion.trim();
    const consentOperation = pluginActivationReviewConsentOperation.trim();
    if (!isDesktopRuntime) {
      setPluginReviewMessage(
        "Activation plan review is desktop-only; browser preview keeps plugin enablement blocked.",
      );
      return;
    }
    if (!pluginId || !version) {
      setPluginReviewMessage("Enter plugin id and version before activation review.");
      return;
    }
    if (consentOperation !== `review_plugin_activation_plan:${pluginId}@${version}`) {
      setPluginReviewMessage(
        "Consent operation must exactly match review_plugin_activation_plan:<plugin-id>@<version>.",
      );
      return;
    }
    setPluginActivationReviewBusy(true);
    setPluginReviewMessage(null);
    try {
      const review = await reviewPluginActivationPlan({
        consent: {
          accepted: true,
          operation: consentOperation as `review_plugin_activation_plan:${string}@${string}`,
        },
        pluginId,
        version,
      });
      setPluginActivationPlanReview(review);
      setPluginReviewMessage(
        `${review.pluginId} ${review.version} activation reviewed as ${review.status}; codeExecuted ${String(review.codeExecuted)}, install ${review.installApplied ? "applied" : "blocked"}.`,
      );
    } catch (error) {
      setPluginReviewMessage(getErrorMessage(error));
    } finally {
      setPluginActivationReviewBusy(false);
    }
  }

  async function handleChoosePluginUpdateEnvelope() {
    if (!isDesktopRuntime) {
      setPluginReviewMessage(
        "Update envelope review is desktop-only; browser preview keeps update install blocked.",
      );
      return;
    }
    setPluginUpdateReviewBusy(true);
    setPluginReviewMessage(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selectedPath = await open({
        directory: false,
        multiple: false,
        title: "Choose signed OG plugin update envelope",
      });
      if (typeof selectedPath !== "string") {
        setPluginReviewMessage("Update envelope selection cancelled.");
        return;
      }
      setPluginUpdateEnvelopePath(selectedPath);
      setPluginReviewMessage(
        "Update envelope selected; review will verify signature, manifest hash, rollback metadata, and blocked auto-install.",
      );
    } catch (error) {
      setPluginReviewMessage(getErrorMessage(error));
    } finally {
      setPluginUpdateReviewBusy(false);
    }
  }

  async function handleReviewPluginUpdateEnvelope() {
    const envelopePath = pluginUpdateEnvelopePath.trim();
    if (!isDesktopRuntime) {
      setPluginReviewMessage(
        "Update envelope review is desktop-only; browser preview keeps update install blocked.",
      );
      return;
    }
    if (!envelopePath) {
      setPluginReviewMessage("Enter or choose a signed update envelope first.");
      return;
    }
    setPluginUpdateReviewBusy(true);
    setPluginReviewMessage(null);
    try {
      const review = await reviewPluginUpdateSigningEnvelope({
        consent: { accepted: true, operation: "review_plugin_update_signing_envelope" },
        envelopePath,
      });
      setPluginUpdateSigningReview(review);
      setPluginReviewMessage(
        `Update signing review complete: ${review.signatureVerifiedCount} signed, auto-install ${review.autoInstallBlocked ? "blocked" : "open"}, rollback ${review.rollbackPlanReady ? "ready" : "blocked"}.`,
      );
    } catch (error) {
      setPluginReviewMessage(getErrorMessage(error));
    } finally {
      setPluginUpdateReviewBusy(false);
    }
  }

  async function handleChoosePluginMarketplaceIndex() {
    if (!isDesktopRuntime) {
      setPluginReviewMessage(
        "Marketplace index review is desktop-only; browser preview keeps downloads and installs blocked.",
      );
      return;
    }
    setPluginMarketplaceReviewBusy(true);
    setPluginReviewMessage(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selectedPath = await open({
        directory: false,
        multiple: false,
        title: "Choose signed OG plugin marketplace update index",
      });
      if (typeof selectedPath !== "string") {
        setPluginReviewMessage("Marketplace index selection cancelled.");
        return;
      }
      setPluginMarketplaceIndexPath(selectedPath);
      setPluginReviewMessage(
        "Marketplace index selected; review will match signed rows against disabled registry evidence without download or install.",
      );
    } catch (error) {
      setPluginReviewMessage(getErrorMessage(error));
    } finally {
      setPluginMarketplaceReviewBusy(false);
    }
  }

  async function handleReviewPluginMarketplaceIndex() {
    const indexPath = pluginMarketplaceIndexPath.trim();
    if (!isDesktopRuntime) {
      setPluginReviewMessage(
        "Marketplace index review is desktop-only; browser preview keeps downloads and installs blocked.",
      );
      return;
    }
    if (!indexPath) {
      setPluginReviewMessage("Enter or choose a signed marketplace update index first.");
      return;
    }
    setPluginMarketplaceReviewBusy(true);
    setPluginReviewMessage(null);
    try {
      const trust = await reviewPluginMarketplaceUpdateIndexTrust({
        consent: { accepted: true, operation: "review_plugin_marketplace_update_index_trust" },
        indexPath,
      });
      setPluginMarketplaceTrust(trust);
      setPluginReviewMessage(
        `Marketplace trust review complete: ${trust.matchedDisabledPackageCount}/${trust.catalogEntryCount} matched, downloads ${trust.downloadAllowed ? "open" : "blocked"}, installs ${trust.installAllowed ? "open" : "blocked"}.`,
      );
    } catch (error) {
      setPluginReviewMessage(getErrorMessage(error));
    } finally {
      setPluginMarketplaceReviewBusy(false);
    }
  }

  function handleResetSignedPluginPackageStaging() {
    setPluginSignedPackageStagingState(emptyPluginSignedPackageStagingState);
    setPluginDisabledRegistryAudit(null);
    setPluginRuntimeSandboxProof(null);
    setPluginActivationPlanReview(null);
    setPluginUpdateSigningReview(null);
    setPluginMarketplaceTrust(null);
    setPluginReviewMessage(null);
    setPluginPackageStagingMessage("Signed package staging ledger cleared.");
  }

  const discoveredPluginManifests = pluginDiscoveryState.manifests;
  const pluginSystemReadiness = isPluginRuntimeSandboxVerify
    ? createVerifyPluginRuntimeSandboxReadiness()
    : isPluginUpdateSigningVerify
      ? createVerifyPluginUpdateSigningReadiness()
      : isPluginMarketplaceUpdateIndexTrustVerify
        ? createVerifyPluginMarketplaceUpdateIndexTrustReadiness()
        : isPluginSystemVerify
          ? createVerifyPluginSystemReadiness()
          : buildPluginSystemReadiness({
              hostedMarketplaceConfigured: false,
              localDiscoveryConfigured:
                Boolean(pluginDiscoveryState.discoveryPath) || discoveredPluginManifests.length > 0,
              manifests: discoveredPluginManifests,
              manifestCount: discoveredPluginManifests.length,
              permissionReviewConfigured: true,
              runtimeSandboxProof: pluginRuntimeSandboxProof,
              sandboxPrototypeAvailable: false,
              signedManifestCount: discoveredPluginManifests.filter(
                (manifest) => manifest.signed && manifest.signatureIssuer,
              ).length,
              disabledRegistryAudit: pluginDisabledRegistryAudit,
              activationPlanReview: pluginActivationPlanReview,
              marketplaceTrust: pluginMarketplaceTrust,
              stagedSignedPackages: pluginSignedPackageStagingState.packages,
              updateChannelConfigured: Boolean(pluginUpdateSigningReview),
              updateSigningReview: pluginUpdateSigningReview,
            });

  return (
    <PluginSystemReadinessPanel
      discovery={{
        busy: pluginDiscoveryBusy,
        discoveryPath: pluginDiscoveryState.discoveryPath,
        importedAt: pluginDiscoveryState.importedAt,
        isDesktopRuntime,
        message: pluginDiscoveryMessage,
        scannedFileCount: pluginDiscoveryState.scannedFileCount,
        skippedEntries: pluginDiscoveryState.skippedEntries,
        sourceLabel: pluginDiscoveryState.sourceLabel,
        onChooseFolder: handleChoosePluginFolder,
        onImportFile: handleImportPluginManifestFile,
        onReset: handleResetPluginDiscovery,
      }}
      packageStaging={{
        auditBusy: pluginRegistryAuditBusy,
        auditFailedCount: pluginSystemReadiness.disabledRegistryAudit?.failedCount ?? 0,
        auditPassedCount: pluginSystemReadiness.disabledRegistryAudit?.passedCount ?? 0,
        auditUpdatedAt: pluginSystemReadiness.disabledRegistryAudit?.auditedAt ?? null,
        busy: pluginPackageStagingBusy,
        consentOperation: pluginPackageConsentOperation,
        isDesktopRuntime,
        message: pluginPackageStagingMessage,
        packagePath: pluginPackagePath,
        runtimeProofAllowedCount:
          pluginSystemReadiness.runtimeSandboxProof?.allowedExecutionCount ?? 0,
        runtimeProofBusy: pluginRuntimeSandboxProofBusy,
        runtimeProofDeniedCount:
          pluginSystemReadiness.runtimeSandboxProof?.deniedEntrypointCount ?? 0,
        runtimeProofUpdatedAt: pluginSystemReadiness.runtimeSandboxProof?.provedAt ?? null,
        stagedCount: pluginSystemReadiness.signedPackageLedger.length,
        updatedAt: pluginSignedPackageStagingState.updatedAt,
        onChooseFolder: handleChooseSignedPluginPackageFolder,
        onConsentOperationChange: setPluginPackageConsentOperation,
        onAuditRegistry: handleAuditStagedPluginRegistry,
        onPackagePathChange: setPluginPackagePath,
        onProveRuntimeSandbox: handleProvePluginRuntimeSandbox,
        onReset: handleResetSignedPluginPackageStaging,
        onStagePackage: handleStageSignedPluginPackage,
      }}
      readiness={pluginSystemReadiness}
      reviews={{
        activationBusy: pluginActivationReviewBusy,
        activationConsentOperation: pluginActivationReviewConsentOperation,
        activationPluginId: pluginActivationReviewPluginId,
        activationVersion: pluginActivationReviewVersion,
        isDesktopRuntime,
        marketplaceBusy: pluginMarketplaceReviewBusy,
        marketplaceIndexPath: pluginMarketplaceIndexPath,
        message: pluginReviewMessage,
        updateBusy: pluginUpdateReviewBusy,
        updateEnvelopePath: pluginUpdateEnvelopePath,
        onActivationConsentOperationChange: setPluginActivationReviewConsentOperation,
        onActivationPluginIdChange: setPluginActivationReviewPluginId,
        onActivationVersionChange: setPluginActivationReviewVersion,
        onChooseMarketplaceIndex: handleChoosePluginMarketplaceIndex,
        onChooseUpdateEnvelope: handleChoosePluginUpdateEnvelope,
        onMarketplaceIndexPathChange: setPluginMarketplaceIndexPath,
        onReviewActivationPlan: handleReviewPluginActivationPlan,
        onReviewMarketplaceIndex: handleReviewPluginMarketplaceIndex,
        onReviewUpdateEnvelope: handleReviewPluginUpdateEnvelope,
        onUpdateEnvelopePathChange: setPluginUpdateEnvelopePath,
      }}
    />
  );
}
