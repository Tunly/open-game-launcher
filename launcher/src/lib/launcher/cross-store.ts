import { isTauri } from "@tauri-apps/api/core";
import type {
  CrossStoreSaveApplyRequest,
  CrossStoreSaveApplyResult,
  CrossStoreSaveLocalE2EProofResult,
  CrossStoreSaveRollbackRequest,
  CrossStoreSaveRollbackResult,
  CrossStoreSaveSupabaseKeychainStagingProofConsent,
  CrossStoreSaveSupabaseKeychainStagingProofResult,
} from "./types";
import { buildCloudArgs } from "./cloud-saves";
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

export async function proveCrossStoreSaveSupabaseKeychainStaging(
  gameId: string,
  options: {
    accessToken: string | null;
    consent?: CrossStoreSaveSupabaseKeychainStagingProofConsent;
    userId: string;
  },
): Promise<CrossStoreSaveSupabaseKeychainStagingProofResult> {
  if (!isTauri()) {
    throw new Error(
      "Cross-store save Supabase/keychain staging proof is available in the desktop app.",
    );
  }

  const args = await buildCloudArgs(gameId, options.accessToken, options.userId);
  const input = args.input && typeof args.input === "object" ? args.input : {};
  return invokeCommand<CrossStoreSaveSupabaseKeychainStagingProofResult>(
    "prove_cross_store_save_supabase_keychain_staging",
    {
      input: {
        ...input,
        consent: options.consent ?? {
          accepted: true,
          gameId,
          operation: "cross_store_save_supabase_keychain_staging_proof",
          userId: options.userId,
        },
      },
    },
  );
}
