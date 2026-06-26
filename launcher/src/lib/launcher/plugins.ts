import { isTauri } from "@tauri-apps/api/core";
import type { PluginActivationPlanReviewRequest } from "../plugin-system-readiness";
import type {
  PluginActivationPlanReviewResult,
  PluginMarketplaceUpdateIndexTrustRequest,
  PluginMarketplaceUpdateIndexTrustResult,
  PluginManifestDiscoveryResult,
  PluginRuntimeSandboxProofRequest,
  PluginRuntimeSandboxProofResult,
  PluginUpdateSigningEnvelopeReviewRequest,
  PluginUpdateSigningEnvelopeReviewResult,
  SignedPluginPackageStageRequest,
  StagedPluginRegistryAuditResult,
  StagedSignedPluginPackageResult,
} from "./types";
import { invokeCommand } from "./shared";

export function scanLocalPluginManifests(rootPath: string): Promise<PluginManifestDiscoveryResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Local plugin manifest discovery is available in the desktop app."),
    );
  }

  return invokeCommand<PluginManifestDiscoveryResult>("scan_local_plugin_manifests", {
    rootPath,
  });
}

export function stageSignedPluginPackage(
  input: SignedPluginPackageStageRequest,
): Promise<StagedSignedPluginPackageResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Signed plugin package staging is available in the desktop app."),
    );
  }

  return invokeCommand<StagedSignedPluginPackageResult>("stage_signed_plugin_package", { input });
}

export function auditStagedPluginRegistry(): Promise<StagedPluginRegistryAuditResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Plugin disabled registry audit is available in the desktop app."),
    );
  }

  return invokeCommand<StagedPluginRegistryAuditResult>("audit_staged_plugin_registry");
}

export function provePluginRuntimeSandbox(
  input: PluginRuntimeSandboxProofRequest,
): Promise<PluginRuntimeSandboxProofResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Plugin runtime sandbox proof is available in the desktop app."),
    );
  }

  return invokeCommand<PluginRuntimeSandboxProofResult>("prove_plugin_runtime_sandbox", { input });
}

export function reviewPluginActivationPlan(
  input: PluginActivationPlanReviewRequest,
): Promise<PluginActivationPlanReviewResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Plugin activation plan review is available in the desktop app."),
    );
  }

  return invokeCommand<PluginActivationPlanReviewResult>("review_plugin_activation_plan", {
    input,
  });
}

export function reviewPluginMarketplaceUpdateIndexTrust(
  input: PluginMarketplaceUpdateIndexTrustRequest,
): Promise<PluginMarketplaceUpdateIndexTrustResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Plugin marketplace update-index trust review is available in the desktop app."),
    );
  }

  return invokeCommand<PluginMarketplaceUpdateIndexTrustResult>(
    "review_plugin_marketplace_update_index_trust",
    { input },
  );
}

export function reviewPluginUpdateSigningEnvelope(
  input: PluginUpdateSigningEnvelopeReviewRequest,
): Promise<PluginUpdateSigningEnvelopeReviewResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Plugin update-signing envelope review is available in the desktop app."),
    );
  }

  return invokeCommand<PluginUpdateSigningEnvelopeReviewResult>(
    "review_plugin_update_signing_envelope",
    { input },
  );
}
