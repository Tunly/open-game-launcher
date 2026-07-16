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

export type VerifiedSteamPlatformAccount = PlatformAccount & {
  platform: "steam";
  verificationMethod: "steam_openid";
  verifiedAt: string;
};

type VerificationQueryResult = {
  data: UnknownRecord | null;
  error: { code?: string; message: string } | null;
};

type VerificationQuery = {
  eq: (column: string, value: unknown) => VerificationQuery;
  limit: (count: number) => VerificationQuery;
  maybeSingle: () => Promise<VerificationQueryResult>;
  order: (column: string, options: { ascending: boolean }) => VerificationQuery;
  select: (columns: string) => VerificationQuery;
};

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

/**
 * Reads the server-only ownership proof. Client-writable platform account
 * metadata is deliberately ignored and can never establish hosted trust.
 */
export async function getMyVerifiedSteamPlatformAccount(): Promise<VerifiedSteamPlatformAccount | null> {
  const client = getSupabaseClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  handleError(authError);
  if (!userData.user) return null;

  const verificationClient = client as unknown as {
    from: (table: string) => VerificationQuery;
  };
  const { data, error } = await verificationClient
    .from("provider_account_verifications")
    .select("user_id, platform, platform_user_id, verification_method, verified_at")
    .eq("user_id", userData.user.id)
    .eq("platform", "steam")
    .eq("verification_method", "steam_openid")
    .order("verified_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (isMissingSchemaError(error)) return null;
  handleError(error);
  if (!data) return null;

  const platformUserId = rowString(data, "platform_user_id");
  const verifiedAt = rowString(data, "verified_at");
  if (
    rowString(data, "user_id") !== userData.user.id ||
    rowString(data, "platform") !== "steam" ||
    rowString(data, "verification_method") !== "steam_openid" ||
    !/^\d{17}$/.test(platformUserId) ||
    !Number.isFinite(Date.parse(verifiedAt))
  ) {
    return null;
  }

  const account = (await getMyPlatformAccounts()).find(
    (candidate) => candidate.platform === "steam" && candidate.platformUserId === platformUserId,
  );
  return account
    ? {
        ...account,
        platform: "steam",
        verificationMethod: "steam_openid",
        verifiedAt: new Date(verifiedAt).toISOString(),
      }
    : null;
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
