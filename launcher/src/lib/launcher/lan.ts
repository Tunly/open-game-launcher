import { isTauri } from "@tauri-apps/api/core";
import type {
  LanTransferCleanupCandidatesRequest,
  LanTransferCleanupCandidatesResult,
  LanTransferCopyJob,
  LanTransferCopyPreview,
  LanTransferCopyRequest,
  LanTransferCopyResult,
  LanTransferPeerDiscoveryPreflightRequest,
  LanTransferPeerDiscoveryPreflightResult,
  LanTransferResumeCancelLedger,
  LanTransferResumeCancelLedgerRequest,
  LanTransferResumeCopyResult,
} from "./types";
import { invokeCommand } from "./shared";

export function previewLanTransferCopy(
  input: LanTransferCopyRequest,
): Promise<LanTransferCopyPreview> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("LAN transfer native copy preview is available in the desktop app."),
    );
  }

  return invokeCommand<LanTransferCopyPreview>("preview_lan_transfer_copy", { input });
}

export function previewLanTransferResumeCancelLedger(
  input: LanTransferResumeCancelLedgerRequest,
): Promise<LanTransferResumeCancelLedger> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("LAN transfer resume/cancel ledger is available in the desktop app."),
    );
  }

  return invokeCommand<LanTransferResumeCancelLedger>("preview_lan_transfer_resume_cancel_ledger", {
    input,
  });
}

export function previewLanTransferPeerDiscoveryPreflight(
  input: LanTransferPeerDiscoveryPreflightRequest,
): Promise<LanTransferPeerDiscoveryPreflightResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("LAN peer discovery preflight is available in the desktop app."),
    );
  }

  return invokeCommand<LanTransferPeerDiscoveryPreflightResult>(
    "preview_lan_transfer_peer_discovery_preflight",
    { input },
  );
}

export function getLanTransferCopyJobs(): Promise<LanTransferCopyJob[]> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("LAN transfer copy job status is available in the desktop app."),
    );
  }

  return invokeCommand<LanTransferCopyJob[]>("get_lan_transfer_copy_jobs");
}

export function startLanTransferCopyJob(
  input: LanTransferCopyRequest,
): Promise<LanTransferCopyJob> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("LAN transfer cancellable copy jobs are available in the desktop app."),
    );
  }

  return invokeCommand<LanTransferCopyJob>("start_lan_transfer_copy_job", { input });
}

export function cancelLanTransferCopyJob(jobId: string): Promise<LanTransferCopyJob> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("LAN transfer copy job cancellation is available in the desktop app."),
    );
  }

  return invokeCommand<LanTransferCopyJob>("cancel_lan_transfer_copy_job", { jobId });
}

export function runLanTransferCopy(input: LanTransferCopyRequest): Promise<LanTransferCopyResult> {
  if (!isTauri()) {
    return Promise.reject(new Error("LAN transfer native copy is available in the desktop app."));
  }

  return invokeCommand<LanTransferCopyResult>("run_lan_transfer_copy", { input });
}

export function runLanTransferResumeCopy(
  input: LanTransferCopyRequest,
): Promise<LanTransferResumeCopyResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("LAN transfer native resume copy is available in the desktop app."),
    );
  }

  return invokeCommand<LanTransferResumeCopyResult>("run_lan_transfer_resume_copy", { input });
}

export function runLanTransferCleanupCandidates(
  input: LanTransferCleanupCandidatesRequest,
): Promise<LanTransferCleanupCandidatesResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("LAN transfer cleanup candidates deletion is available in the desktop app."),
    );
  }

  return invokeCommand<LanTransferCleanupCandidatesResult>("run_lan_transfer_cleanup_candidates", {
    input,
  });
}
