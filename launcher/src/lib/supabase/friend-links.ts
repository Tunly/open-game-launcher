import { getSupabaseClient } from "./client";
import type {
  FriendLink,
  FriendMergeSuggestion,
  PlatformFriend,
  PlatformType,
} from "../types/friends";
import {
  handleError,
  isMissingSchemaError,
  rowBoolean,
  rowNullableString,
  rowNumber,
  rowString,
  type UnknownRecord,
} from "./helpers";

function toFriendLink(row: UnknownRecord): FriendLink {
  return {
    id: rowString(row, "id"),
    ownerId: rowString(row, "owner_id"),
    platform: rowString(row, "platform") as PlatformType,
    platformFriendId: rowString(row, "platform_friend_id"),
    platformFriendName: rowNullableString(row, "platform_friend_name"),
    platformFriendAvatar: rowNullableString(row, "platform_friend_avatar"),
    matchedUserId: rowNullableString(row, "matched_user_id"),
    matchMethod: rowNullableString(row, "match_method") as FriendLink["matchMethod"],
    dismissed: rowBoolean(row, "dismissed"),
    mergeGroupId: rowNullableString(row, "merge_group_id"),
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
  };
}

function toMergeSuggestion(row: UnknownRecord): FriendMergeSuggestion {
  return {
    id: rowString(row, "id"),
    userId: rowString(row, "user_id"),
    friendLinkA: rowString(row, "friend_link_a"),
    friendLinkB: rowNullableString(row, "friend_link_b"),
    suggestedUserId: rowNullableString(row, "suggested_user_id"),
    confidence: rowNumber(row, "confidence"),
    reason: rowNullableString(row, "reason"),
    status: rowString(row, "status", "pending") as FriendMergeSuggestion["status"],
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
  };
}

async function getCurrentUserId() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  handleError(error);
  if (!data.user) throw new Error("You must be signed in.");
  return data.user.id;
}

/**
 * Import platform friends into friend_links table.
 * Auto-matches against platform_accounts (Stage 1 dedup) via DB trigger.
 */
export async function importPlatformFriends(friends: PlatformFriend[]): Promise<number> {
  if (friends.length === 0) return 0;

  const client = getSupabaseClient();
  const ownerId = await getCurrentUserId();

  const rows = friends.map((f) => ({
    owner_id: ownerId,
    platform: f.platform,
    platform_friend_id: f.platformId,
    platform_friend_name: f.displayName,
    platform_friend_avatar: f.avatarUrl,
  }));

  // Batch in chunks of 100
  let imported = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await client
      .from("friend_links")
      .upsert(batch, { onConflict: "owner_id,platform,platform_friend_id" });
    if (isMissingSchemaError(error)) return 0;
    handleError(error);
    imported += batch.length;
  }

  // After import, run Stage 1 auto-match: match against platform_accounts
  await runAutoMatch(ownerId);

  return imported;
}

/**
 * Stage 1: Auto-match friend_links against platform_accounts table.
 * If a platform friend's platform_friend_id matches a platform_accounts.platform_user_id,
 * that means someone on OG Launcher has linked that platform account.
 */
async function runAutoMatch(ownerId: string) {
  const client = getSupabaseClient();

  // Get all unmatched friend links for this user
  const { data: unmatched, error: unmatchErr } = await client
    .from("friend_links")
    .select("id, platform, platform_friend_id")
    .eq("owner_id", ownerId)
    .is("matched_user_id", null)
    .eq("dismissed", false);
  if (unmatchErr || !unmatched) return;

  if (unmatched.length === 0) return;

  // Get all platform_accounts that could match
  const platformIds = unmatched.map((row) => {
    const r = row as UnknownRecord;
    return rowString(r, "platform_friend_id");
  });

  const { data: accounts, error: accErr } = await client
    .from("platform_accounts")
    .select("user_id, platform, platform_user_id")
    .in("platform_user_id", platformIds);
  if (accErr || !accounts) return;

  // Build lookup: platform+platform_user_id → user_id
  const lookup = new Map<string, string>();
  for (const acc of accounts) {
    const r = acc as UnknownRecord;
    const key = `${rowString(r, "platform")}:${rowString(r, "platform_user_id")}`;
    lookup.set(key, rowString(r, "user_id"));
  }

  // Update matched links
  for (const row of unmatched) {
    const r = row as UnknownRecord;
    const key = `${rowString(r, "platform")}:${rowString(r, "platform_friend_id")}`;
    const matchedUserId = lookup.get(key);
    if (matchedUserId) {
      await client
        .from("friend_links")
        .update({
          matched_user_id: matchedUserId,
          match_method: "linked_account",
        })
        .eq("id", rowString(r, "id"));
    }
  }
}

/**
 * Stage 2: Generate heuristic merge suggestions based on username similarity.
 * Compares unmatched friend_links across platforms for the same user.
 */
export async function generateHeuristicSuggestions(): Promise<number> {
  const client = getSupabaseClient();
  const ownerId = await getCurrentUserId();

  // Get all unmatched friend links
  const { data: unmatched, error } = await client
    .from("friend_links")
    .select("*")
    .eq("owner_id", ownerId)
    .is("matched_user_id", null)
    .eq("dismissed", false);
  if (error || !unmatched) return 0;

  const links = unmatched.map((r) => toFriendLink(r as UnknownRecord));
  if (links.length < 2) return 0;

  // Group by platform
  const byPlatform = new Map<string, FriendLink[]>();
  for (const link of links) {
    const list = byPlatform.get(link.platform) ?? [];
    list.push(link);
    byPlatform.set(link.platform, list);
  }

  // Cross-platform comparison: find similar names across different platforms
  const platforms = [...byPlatform.keys()];
  const suggestions: Array<{
    friend_link_a: string;
    friend_link_b: string;
    confidence: number;
    reason: string;
  }> = [];

  for (let i = 0; i < platforms.length; i++) {
    for (let j = i + 1; j < platforms.length; j++) {
      const listA = byPlatform.get(platforms[i]) ?? [];
      const listB = byPlatform.get(platforms[j]) ?? [];

      for (const a of listA) {
        for (const b of listB) {
          const nameA = (a.platformFriendName ?? "").toLowerCase().trim();
          const nameB = (b.platformFriendName ?? "").toLowerCase().trim();
          if (!nameA || !nameB) continue;

          const similarity = computeNameSimilarity(nameA, nameB);
          if (similarity >= 0.8) {
            suggestions.push({
              friend_link_a: a.id,
              friend_link_b: b.id,
              confidence: similarity,
              reason: `Username similarity: "${a.platformFriendName}" ≈ "${b.platformFriendName}" (${platforms[i]}/${platforms[j]})`,
            });
          }
        }
      }
    }
  }

  if (suggestions.length === 0) return 0;

  // Insert suggestions (limit to 50 per run to avoid flooding)
  const toInsert = suggestions.slice(0, 50).map((s) => ({
    user_id: ownerId,
    friend_link_a: s.friend_link_a,
    friend_link_b: s.friend_link_b,
    confidence: s.confidence,
    reason: s.reason,
    status: "pending",
  }));

  const { error: insertErr } = await client
    .from("friend_merge_suggestions")
    .upsert(toInsert, { onConflict: "id" });
  handleError(insertErr);

  return toInsert.length;
}

/**
 * Simple normalized string similarity (Dice coefficient on bigrams).
 */
function computeNameSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.substring(i, i + 2));

  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.substring(i, i + 2));

  let intersection = 0;
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

export async function getMyFriendLinks(): Promise<FriendLink[]> {
  const client = getSupabaseClient();
  const ownerId = await getCurrentUserId();

  const { data, error } = await client
    .from("friend_links")
    .select("*")
    .eq("owner_id", ownerId)
    .order("platform")
    .order("platform_friend_name");

  if (isMissingSchemaError(error)) return [];
  handleError(error);

  return (data ?? []).map((r) => toFriendLink(r as UnknownRecord));
}

export async function getUnmatchedFriendLinks(): Promise<FriendLink[]> {
  const client = getSupabaseClient();
  const ownerId = await getCurrentUserId();

  const { data, error } = await client
    .from("friend_links")
    .select("*")
    .eq("owner_id", ownerId)
    .is("matched_user_id", null)
    .eq("dismissed", false)
    .order("platform")
    .order("platform_friend_name");

  if (isMissingSchemaError(error)) return [];
  handleError(error);

  return (data ?? []).map((r) => toFriendLink(r as UnknownRecord));
}

export async function matchFriendLink(linkId: string, ogUserId: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client
    .from("friend_links")
    .update({ matched_user_id: ogUserId, match_method: "manual" })
    .eq("id", linkId);
  handleError(error);
}

export async function dismissFriendLink(linkId: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from("friend_links").update({ dismissed: true }).eq("id", linkId);
  handleError(error);
}

export async function getMergeSuggestions(): Promise<FriendMergeSuggestion[]> {
  const client = getSupabaseClient();
  const ownerId = await getCurrentUserId();

  const { data, error } = await client
    .from("friend_merge_suggestions")
    .select("*")
    .eq("user_id", ownerId)
    .eq("status", "pending")
    .order("confidence", { ascending: false });

  if (isMissingSchemaError(error)) return [];
  handleError(error);

  return (data ?? []).map((r) => toMergeSuggestion(r as UnknownRecord));
}

export async function acceptMergeSuggestion(suggestionId: string): Promise<void> {
  const client = getSupabaseClient();
  const ownerId = await getCurrentUserId();

  // Load the suggestion so we can apply the merge.
  const { data: suggestion, error: loadErr } = await client
    .from("friend_merge_suggestions")
    .select("*")
    .eq("id", suggestionId)
    .eq("user_id", ownerId)
    .maybeSingle();
  handleError(loadErr);
  if (!suggestion) {
    throw new Error("Merge suggestion not found.");
  }

  const record = suggestion as UnknownRecord;
  const linkA = rowString(record, "friend_link_a");
  const linkB = rowNullableString(record, "friend_link_b");
  const suggestedUserId = rowNullableString(record, "suggested_user_id");

  if (suggestedUserId) {
    // Manual merge with a known OG user: link both A and B to that user.
    const targetIds = [linkA, linkB].filter(Boolean) as string[];
    if (targetIds.length > 0) {
      const { error: linkErr } = await client
        .from("friend_links")
        .update({
          matched_user_id: suggestedUserId,
          match_method: "manual",
        })
        .in("id", targetIds)
        .eq("owner_id", ownerId)
        .is("matched_user_id", null);
      handleError(linkErr);
    }
  } else if (linkB) {
    // Heuristic merge (no OG user yet): assign a shared merge_group_id so
    // the auto-match trigger propagates the match to both members.
    const mergeGroupId = crypto.randomUUID();
    const { error: groupErr } = await client
      .from("friend_links")
      .update({ merge_group_id: mergeGroupId })
      .in("id", [linkA, linkB])
      .eq("owner_id", ownerId);
    handleError(groupErr);
  }

  const { error } = await client
    .from("friend_merge_suggestions")
    .update({ status: "accepted" })
    .eq("id", suggestionId);
  handleError(error);
}

export async function rejectMergeSuggestion(suggestionId: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client
    .from("friend_merge_suggestions")
    .update({ status: "rejected" })
    .eq("id", suggestionId);
  handleError(error);
}
