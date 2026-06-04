import { getSupabaseClient } from "./client";
import type { PlatformAccount, PlatformType } from "../types/friends";
import {
  handleError,
  isMissingSchemaError,
  rowConfig,
  rowNullableString,
  rowString,
  type UnknownRecord,
} from "./helpers";

function toPlatformAccount(row: UnknownRecord): PlatformAccount {
  return {
    id: rowString(row, "id"),
    userId: rowString(row, "user_id"),
    platform: rowString(row, "platform") as PlatformType,
    platformUserId: rowString(row, "platform_user_id"),
    platformUsername: rowNullableString(row, "platform_username"),
    platformAvatarUrl: rowNullableString(row, "platform_avatar_url"),
    metadata: rowConfig(row, "metadata"),
    linkedAt: rowString(row, "linked_at"),
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
  };
}

export async function linkPlatformAccount(
  platform: PlatformType,
  platformUserId: string,
  platformUsername: string | null,
  avatarUrl: string | null,
  metadata: Record<string, unknown> = {},
): Promise<PlatformAccount> {
  const client = getSupabaseClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  handleError(authError);
  if (!userData.user) throw new Error("You must be signed in.");

  const { data, error } = await client
    .from("platform_accounts")
    .upsert(
      {
        user_id: userData.user.id,
        platform,
        platform_user_id: platformUserId,
        platform_username: platformUsername,
        platform_avatar_url: avatarUrl,
        metadata: metadata as unknown as Record<string, never>,
      },
      { onConflict: "user_id,platform" },
    )
    .select("*")
    .single();
  handleError(error);

  return toPlatformAccount(data as UnknownRecord);
}

export async function unlinkPlatformAccount(platform: PlatformType): Promise<void> {
  const client = getSupabaseClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  handleError(authError);
  if (!userData.user) throw new Error("You must be signed in.");

  const { error } = await client
    .from("platform_accounts")
    .delete()
    .eq("user_id", userData.user.id)
    .eq("platform", platform);
  handleError(error);
}

export async function getMyPlatformAccounts(): Promise<PlatformAccount[]> {
  const client = getSupabaseClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  handleError(authError);
  if (!userData.user) throw new Error("You must be signed in.");

  const { data, error } = await client
    .from("platform_accounts")
    .select("*")
    .eq("user_id", userData.user.id)
    .order("platform");

  if (isMissingSchemaError(error)) return [];
  handleError(error);

  return (data ?? []).map((row) => toPlatformAccount(row as UnknownRecord));
}

export async function getPlatformAccountsForUser(userId: string): Promise<PlatformAccount[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("platform_accounts")
    .select("*")
    .eq("user_id", userId)
    .order("platform");

  if (isMissingSchemaError(error)) return [];
  handleError(error);

  return (data ?? []).map((row) => toPlatformAccount(row as UnknownRecord));
}
