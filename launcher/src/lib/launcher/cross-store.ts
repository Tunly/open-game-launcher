import { isTauri } from "@tauri-apps/api/core";
import type {
  CrossStoreSaveApplyRequest,
  CrossStoreSaveApplyResult,
  CrossStoreSaveLocalE2EProofResult,
  CrossStoreSaveRollbackRequest,
  CrossStoreSaveRollbackResult,
} from "./types";
import { invokeCommand } from "./shared";

export function applyCrossStoreSaveCopy(
  input: CrossStoreSaveApplyRequest,
): Promise<CrossStoreSaveApplyResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Cross-store save native copy is available in the desktop app."),
    );
  }

  return invokeCommand<CrossStoreSaveApplyResult>("apply_cross_store_save_copy", { input });
}

export function rollbackCrossStoreSaveCopy(
  input: CrossStoreSaveRollbackRequest,
): Promise<CrossStoreSaveRollbackResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Cross-store save native rollback is available in the desktop app."),
    );
  }

  return invokeCommand<CrossStoreSaveRollbackResult>("rollback_cross_store_save_copy", {
    input,
  });
}

export function proveCrossStoreSaveLocalE2E(): Promise<CrossStoreSaveLocalE2EProofResult> {
  if (!isTauri()) {
    return Promise.reject(
      new Error("Cross-store save local E2E proof is available in the desktop app."),
    );
  }

  return invokeCommand<CrossStoreSaveLocalE2EProofResult>("prove_cross_store_save_local_e2e");
}
