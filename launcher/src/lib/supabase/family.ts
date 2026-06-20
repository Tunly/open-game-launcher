import { getSupabaseClient } from "./client";
import type { FamilyGroup, FamilyMember, FamilyRole, FamilySharedGame } from "../types/family";

const GROUP_SELECT = `id, owner_id, name, invite_code, max_members, created_at, updated_at`;
const MEMBER_SELECT = `id, family_id, user_id, role, joined_at`;
const SHARED_GAME_SELECT = `id, family_id, game_id, shared_by_user_id, is_available, current_user_id, shared_at`;
export const FAMILY_LOCAL_RELAY_STORAGE_KEY = "og-launcher:family-local-relay:v1";

const LOCAL_PREVIEW_USER_ID = "local-preview-player";
const LOCAL_PREVIEW_MAX_MEMBERS = 6;

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

interface LocalFamilyRelayState {
  activeFamilyId: string | null;
  groups: FamilyGroup[];
  members: FamilyMember[];
  sharedGames: FamilySharedGame[];
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

function getOptionalSupabaseClient() {
  try {
    return getSupabaseClient();
  } catch {
    return null;
  }
}

function emptyLocalRelayState(): LocalFamilyRelayState {
  return {
    activeFamilyId: null,
    groups: [],
    members: [],
    sharedGames: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getLocalRelayStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function parseFamilyGroup(value: unknown): FamilyGroup | null {
  if (!isRecord(value)) return null;
  if (
    !isString(value.id) ||
    !isString(value.ownerId) ||
    !isString(value.name) ||
    !isString(value.inviteCode) ||
    !isString(value.createdAt) ||
    !isString(value.updatedAt) ||
    typeof value.maxMembers !== "number"
  ) {
    return null;
  }

  return {
    id: value.id,
    ownerId: value.ownerId,
    name: value.name,
    inviteCode: value.inviteCode.toUpperCase(),
    maxMembers: value.maxMembers,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function parseFamilyMember(value: unknown): FamilyMember | null {
  if (!isRecord(value)) return null;
  if (
    !isString(value.id) ||
    !isString(value.familyId) ||
    !isString(value.userId) ||
    !isString(value.joinedAt)
  ) {
    return null;
  }
  if (value.role !== "owner" && value.role !== "member") return null;

  return {
    id: value.id,
    familyId: value.familyId,
    userId: value.userId,
    role: value.role,
    joinedAt: value.joinedAt,
  };
}

function parseFamilySharedGame(value: unknown): FamilySharedGame | null {
  if (!isRecord(value)) return null;
  if (
    !isString(value.id) ||
    !isString(value.familyId) ||
    !isString(value.gameId) ||
    !isString(value.sharedByUserId) ||
    typeof value.isAvailable !== "boolean" ||
    !isString(value.sharedAt)
  ) {
    return null;
  }
  if (value.currentUserId !== null && typeof value.currentUserId !== "string") return null;

  return {
    id: value.id,
    familyId: value.familyId,
    gameId: value.gameId,
    sharedByUserId: value.sharedByUserId,
    isAvailable: value.isAvailable,
    currentUserId: value.currentUserId,
    sharedAt: value.sharedAt,
  };
}

function readLocalFamilyRelayState(): LocalFamilyRelayState {
  const storage = getLocalRelayStorage();
  if (!storage) return emptyLocalRelayState();
  const raw = storage.getItem(FAMILY_LOCAL_RELAY_STORAGE_KEY);
  if (!raw) return emptyLocalRelayState();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return emptyLocalRelayState();

    const groups = Array.isArray(parsed.groups)
      ? parsed.groups.map(parseFamilyGroup).filter((group): group is FamilyGroup => Boolean(group))
      : [];
    const groupIds = new Set(groups.map((group) => group.id));
    const members = Array.isArray(parsed.members)
      ? parsed.members.map(parseFamilyMember).filter((member): member is FamilyMember => {
          return member !== null && groupIds.has(member.familyId);
        })
      : [];
    const sharedGames = Array.isArray(parsed.sharedGames)
      ? parsed.sharedGames.map(parseFamilySharedGame).filter((game): game is FamilySharedGame => {
          return game !== null && groupIds.has(game.familyId);
        })
      : [];
    const activeFamilyId =
      typeof parsed.activeFamilyId === "string" && groupIds.has(parsed.activeFamilyId)
        ? parsed.activeFamilyId
        : null;

    return {
      activeFamilyId,
      groups,
      members,
      sharedGames,
    };
  } catch {
    return emptyLocalRelayState();
  }
}

function writeLocalFamilyRelayState(state: LocalFamilyRelayState) {
  const storage = getLocalRelayStorage();
  if (!storage) {
    throw new Error("Browser local storage is unavailable for the family relay.");
  }
  storage.setItem(FAMILY_LOCAL_RELAY_STORAGE_KEY, JSON.stringify(state));
}

function createLocalId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeInviteCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function createLocalInviteCode(existingInviteCodes: Set<string>): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const seed = createLocalId("relay").replace(/[^a-z0-9]/gi, "");
    const inviteCode = normalizeInviteCode(seed.slice(-8).padEnd(8, "X"));
    if (!existingInviteCodes.has(inviteCode)) return inviteCode;
  }

  return normalizeInviteCode(`OG${Date.now().toString(36)}`.padEnd(8, "X"));
}

function createLocalFamilyGroup(name: string): FamilyGroup {
  const state = readLocalFamilyRelayState();
  const now = new Date().toISOString();
  const group: FamilyGroup = {
    id: createLocalId("local-family"),
    ownerId: LOCAL_PREVIEW_USER_ID,
    name: name.trim() || "My Family",
    inviteCode: createLocalInviteCode(
      new Set(state.groups.map((candidate) => candidate.inviteCode)),
    ),
    maxMembers: LOCAL_PREVIEW_MAX_MEMBERS,
    createdAt: now,
    updatedAt: now,
  };
  const owner: FamilyMember = {
    id: createLocalId("local-family-member"),
    familyId: group.id,
    userId: LOCAL_PREVIEW_USER_ID,
    role: "owner",
    joinedAt: now,
  };

  writeLocalFamilyRelayState({
    ...state,
    activeFamilyId: group.id,
    groups: [...state.groups, group],
    members: [...state.members, owner],
  });

  return group;
}

function getLocalFamilyGroup(): FamilyGroup | null {
  const state = readLocalFamilyRelayState();
  if (!state.activeFamilyId) return null;
  return state.groups.find((group) => group.id === state.activeFamilyId) ?? null;
}

function joinLocalFamilyGroup(inviteCode: string): FamilyGroup {
  const normalizedInviteCode = normalizeInviteCode(inviteCode);
  if (!normalizedInviteCode) {
    throw new Error("Enter a family invite code.");
  }

  const state = readLocalFamilyRelayState();
  const group = state.groups.find((candidate) => candidate.inviteCode === normalizedInviteCode);
  if (!group) {
    throw new Error("No local family relay matches that invite code.");
  }

  const groupMembers = state.members.filter((member) => member.familyId === group.id);
  const hasLocalMember = groupMembers.some((member) => member.userId === LOCAL_PREVIEW_USER_ID);
  if (!hasLocalMember && groupMembers.length >= group.maxMembers) {
    throw new Error("Family is full");
  }

  const now = new Date().toISOString();
  const nextGroup = {
    ...group,
    updatedAt: now,
  };
  const nextMembers = hasLocalMember
    ? state.members
    : [
        ...state.members,
        {
          id: createLocalId("local-family-member"),
          familyId: group.id,
          userId: LOCAL_PREVIEW_USER_ID,
          role: "member" as const,
          joinedAt: now,
        },
      ];

  writeLocalFamilyRelayState({
    ...state,
    activeFamilyId: group.id,
    groups: state.groups.map((candidate) => (candidate.id === group.id ? nextGroup : candidate)),
    members: nextMembers,
  });

  return nextGroup;
}

function listLocalFamilyMembers(familyId: string): FamilyMember[] {
  return readLocalFamilyRelayState().members.filter((member) => member.familyId === familyId);
}

function listLocalFamilySharedGames(familyId: string): FamilySharedGame[] {
  return readLocalFamilyRelayState().sharedGames.filter((game) => game.familyId === familyId);
}

function shareLocalGameWithFamily(familyId: string, gameId: string): FamilySharedGame | null {
  const state = readLocalFamilyRelayState();
  if (!state.groups.some((group) => group.id === familyId)) return null;

  const now = new Date().toISOString();
  const existingGame = state.sharedGames.find(
    (game) => game.familyId === familyId && game.gameId === gameId,
  );
  const sharedGame: FamilySharedGame = existingGame ?? {
    id: createLocalId("local-family-game"),
    familyId,
    gameId,
    sharedByUserId: LOCAL_PREVIEW_USER_ID,
    isAvailable: true,
    currentUserId: null,
    sharedAt: now,
  };

  writeLocalFamilyRelayState({
    ...state,
    sharedGames: existingGame ? state.sharedGames : [...state.sharedGames, sharedGame],
  });

  return sharedGame;
}

function unshareLocalGameFromFamily(familyId: string, gameId: string): boolean {
  const state = readLocalFamilyRelayState();
  const nextSharedGames = state.sharedGames.filter(
    (game) => game.familyId !== familyId || game.gameId !== gameId,
  );
  writeLocalFamilyRelayState({
    ...state,
    sharedGames: nextSharedGames,
  });
  return nextSharedGames.length !== state.sharedGames.length;
}

export async function getMyFamilyGroup(): Promise<FamilyGroup | null> {
  const client = getOptionalSupabaseClient();
  if (!client) return getLocalFamilyGroup();
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
  const client = getOptionalSupabaseClient();
  if (!client) return createLocalFamilyGroup(name);
  const userId = (await client.auth.getUser()).data.user?.id;
  if (!userId) return null;
  // 1. Create group
  const { data: group, error: groupErr } = await client
    .from("family_groups")
    .insert({ owner_id: userId, name, invite_code: "" })
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
  const client = getOptionalSupabaseClient();
  if (!client) return joinLocalFamilyGroup(inviteCode);
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
  const client = getOptionalSupabaseClient();
  if (!client) return listLocalFamilyMembers(familyId);
  const { data, error } = await client
    .from("family_members")
    .select(MEMBER_SELECT)
    .eq("family_id", familyId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as FamilyMemberRow[]).map(rowToMember);
}

export async function listFamilySharedGames(familyId: string): Promise<FamilySharedGame[]> {
  const client = getOptionalSupabaseClient();
  if (!client) return listLocalFamilySharedGames(familyId);
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
  const client = getOptionalSupabaseClient();
  if (!client) return shareLocalGameWithFamily(familyId, gameId);
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
  const client = getOptionalSupabaseClient();
  if (!client) return unshareLocalGameFromFamily(familyId, gameId);
  const { error } = await client
    .from("family_shared_games")
    .delete()
    .eq("family_id", familyId)
    .eq("game_id", gameId);
  if (error) throw new Error(error.message);
  return true;
}
