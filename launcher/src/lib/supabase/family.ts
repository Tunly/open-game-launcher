import { getSupabaseClient } from "./client";
import type { FamilyGroup, FamilyMember, FamilyRole, FamilySharedGame } from "../types/family";

const GROUP_SELECT = `id, owner_id, name, invite_code, max_members, created_at, updated_at`;
const MEMBER_SELECT = `id, family_id, user_id, role, joined_at`;
const SHARED_GAME_SELECT = `id, family_id, game_id, shared_by_user_id, is_available, current_user_id, shared_at`;

interface FamilyGroupRow {
  id: string;
  owner_id: string;
  name: string;
  invite_code: string;
  max_members: number;
  created_at: string;
  updated_at: string;
}

interface FamilyMemberRow {
  id: string;
  family_id: string;
  user_id: string;
  role: string;
  joined_at: string;
}

interface FamilyMemberLookupRow {
  family_id: string;
}

interface FamilySharedGameRow {
  id: string;
  family_id: string;
  game_id: string;
  shared_by_user_id: string;
  is_available: boolean;
  current_user_id: string | null;
  shared_at: string;
}

function rowToGroup(row: FamilyGroupRow): FamilyGroup {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    inviteCode: row.invite_code,
    maxMembers: row.max_members,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMember(row: FamilyMemberRow): FamilyMember {
  return {
    id: row.id,
    familyId: row.family_id,
    userId: row.user_id,
    role: row.role as FamilyRole,
    joinedAt: row.joined_at,
  };
}

function rowToSharedGame(row: FamilySharedGameRow): FamilySharedGame {
  return {
    id: row.id,
    familyId: row.family_id,
    gameId: row.game_id,
    sharedByUserId: row.shared_by_user_id,
    isAvailable: row.is_available,
    currentUserId: row.current_user_id,
    sharedAt: row.shared_at,
  };
}

export async function getMyFamilyGroup(): Promise<FamilyGroup | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const userId = (await client.auth.getUser()).data.user?.id;
  if (!userId) return null;
  // Find a group where I am owner or member
  const { data: memberData, error: memberErr } = await client
    .from("family_members")
    .select("family_id")
    .eq("user_id", userId)
    .limit(1);
  if (memberErr) throw new Error(memberErr.message);
  const familyId = ((memberData ?? []) as FamilyMemberLookupRow[])[0]?.family_id;
  if (!familyId) return null;
  const { data, error } = await client
    .from("family_groups")
    .select(GROUP_SELECT)
    .eq("id", familyId)
    .single();
  if (error) return null;
  return rowToGroup(data as FamilyGroupRow);
}

export async function createFamilyGroup(name: string): Promise<FamilyGroup | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const userId = (await client.auth.getUser()).data.user?.id;
  if (!userId) return null;
  // 1. Create group
  const { data: group, error: groupErr } = await client
    .from("family_groups")
    .insert({ owner_id: userId, name })
    .select(GROUP_SELECT)
    .single();
  if (groupErr) throw new Error(groupErr.message);
  // 2. Add self as owner member
  await client
    .from("family_members")
    .insert({ family_id: group.id, user_id: userId, role: "owner" });
  return rowToGroup(group as FamilyGroupRow);
}

export async function joinFamilyGroup(inviteCode: string): Promise<FamilyGroup | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const userId = (await client.auth.getUser()).data.user?.id;
  if (!userId) return null;
  const { data: group, error: groupErr } = await client
    .from("family_groups")
    .select(GROUP_SELECT)
    .eq("invite_code", inviteCode.toUpperCase())
    .single();
  if (groupErr) throw new Error(groupErr.message);
  // Check member count
  const { count, error: countErr } = await client
    .from("family_members")
    .select("id", { count: "exact", head: true })
    .eq("family_id", group.id);
  if (countErr) throw new Error(countErr.message);
  if ((count ?? 0) >= group.max_members) {
    throw new Error("Family is full");
  }
  const { error: memberErr } = await client
    .from("family_members")
    .insert({ family_id: group.id, user_id: userId, role: "member" });
  if (memberErr) throw new Error(memberErr.message);
  return rowToGroup(group as FamilyGroupRow);
}

export async function listFamilyMembers(familyId: string): Promise<FamilyMember[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from("family_members")
    .select(MEMBER_SELECT)
    .eq("family_id", familyId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as FamilyMemberRow[]).map(rowToMember);
}

export async function listFamilySharedGames(familyId: string): Promise<FamilySharedGame[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from("family_shared_games")
    .select(SHARED_GAME_SELECT)
    .eq("family_id", familyId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as FamilySharedGameRow[]).map(rowToSharedGame);
}

export async function shareGameWithFamily(
  familyId: string,
  gameId: string,
): Promise<FamilySharedGame | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const userId = (await client.auth.getUser()).data.user?.id;
  if (!userId) return null;
  const { data, error } = await client
    .from("family_shared_games")
    .insert({ family_id: familyId, game_id: gameId, shared_by_user_id: userId })
    .select(SHARED_GAME_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return rowToSharedGame(data as FamilySharedGameRow);
}

export async function unshareGameFromFamily(familyId: string, gameId: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { error } = await client
    .from("family_shared_games")
    .delete()
    .eq("family_id", familyId)
    .eq("game_id", gameId);
  if (error) throw new Error(error.message);
  return true;
}
