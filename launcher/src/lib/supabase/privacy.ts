import { getSupabaseClient, requireCurrentSessionUserId } from "./client";
import type { Database, Json } from "./database.types";

export type AccountDeletionRequest =
  Database["public"]["Tables"]["account_deletion_requests"]["Row"];

export interface UserDataExport {
  data: Record<string, Json>;
  generatedAt: string;
  user: {
    appMetadata: Record<string, Json>;
    createdAt?: string;
    email?: string;
    id: string;
    lastSignInAt?: string;
    userMetadata: Record<string, Json>;
  };
}

interface AccountDeletionResponse {
  request: AccountDeletionRequest | null;
}

export async function getLatestAccountDeletionRequest() {
  const client = getSupabaseClient();
  const userId = await requireCurrentSessionUserId();
  const { data, error } = await client
    .from("account_deletion_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function exportUserData() {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<UserDataExport>("export-user-data", {
    body: {},
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Export returned no data.");
  }

  return data;
}

export async function requestAccountDeletion(reason?: string) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<AccountDeletionResponse>(
    "request-account-deletion",
    {
      body: { reason: reason?.trim() || null },
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.request) {
    throw new Error("Deletion request returned no row.");
  }

  return data.request;
}

export async function cancelAccountDeletion() {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<AccountDeletionResponse>(
    "cancel-account-deletion",
    {
      body: {},
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return data?.request ?? null;
}
