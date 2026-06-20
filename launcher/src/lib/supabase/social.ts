import type { RealtimeChannel } from "@supabase/supabase-js";

import { getSupabaseClient, supabase } from "./client";
import type { ChatMessage, ChatRoom, GameInvite } from "../types/profile";
export type { ChatMessage, ChatRoom, GameInvite };
import type { CrossPlatformInvite, InviteFeasibility, PlatformType } from "../types/friends";
import {
  handleError as baseHandleError,
  isMissingSchemaError,
  rowBoolean,
  rowNumber,
  rowNullableString,
  rowString,
  type UnknownRecord,
} from "./helpers";

export type DirectThread = {
  messages: ChatMessage[];
  room: ChatRoom;
};

export type GameInviteInput = {
  gameId?: string | null;
  gameTitle: string;
  launchUri?: string | null;
  message?: string | null;
  receiverId: string;
};

export interface GameInviteShareToken {
  expiresAt: string;
  gameTitle: string;
  platform: PlatformType | null;
  token: string;
  tokenHint: string;
}

export interface ResolvedShareToken {
  expiresAt: string;
  gameInviteId: string;
  gameTitle: string;
  platform: PlatformType | null;
}

export interface RedeemedShareToken {
  acceptedAt: string;
  gameInviteId: string;
  gameTitle: string;
  platform: PlatformType | null;
  status: string;
}

export interface InviteHostedReplayProof {
  checkedAt: string;
  deploymentScope: "hosted-staging";
  gameInviteId: string;
  gameTitle: string;
  guards: string[];
  inviteStatus: string;
  maxUses: number | null;
  origin: string;
  originVerified: boolean;
  platform: PlatformType | null;
  replayDenied: boolean;
  replayError: string;
  tokenHint: string;
  usedAt: string | null;
  usesCount: number;
}

function handleError(error: { code?: string; message: string } | null) {
  if (isMissingSchemaError(error)) {
    throw new Error(
      "Social realtime tables are not installed yet. Apply the Supabase migrations first.",
    );
  }
  baseHandleError(error);
}

function toRoom(row: UnknownRecord): ChatRoom {
  return {
    createdAt: rowString(row, "created_at"),
    createdBy: rowString(row, "created_by"),
    id: rowString(row, "id"),
    name: rowNullableString(row, "name"),
    type: rowString(row, "type", "dm") as ChatRoom["type"],
    updatedAt: rowString(row, "updated_at"),
  };
}

function toMessage(row: UnknownRecord): ChatMessage {
  return {
    content: rowString(row, "content"),
    createdAt: rowString(row, "created_at"),
    deletedAt: rowNullableString(row, "deleted_at"),
    id: rowString(row, "id"),
    roomId: rowString(row, "room_id"),
    senderId: rowString(row, "sender_id"),
    updatedAt: rowString(row, "updated_at"),
  };
}

function toInvite(row: UnknownRecord): GameInvite {
  return {
    createdAt: rowString(row, "created_at"),
    expiresAt: rowString(row, "expires_at"),
    gameId: rowNullableString(row, "game_id"),
    gameTitle: rowString(row, "game_title"),
    id: rowString(row, "id"),
    launchUri: rowNullableString(row, "launch_uri"),
    message: rowNullableString(row, "message"),
    receiverId: rowNullableString(row, "receiver_id"),
    senderId: rowString(row, "sender_id"),
    status: rowString(row, "status", "pending") as GameInvite["status"],
    updatedAt: rowString(row, "updated_at"),
  };
}

async function getCurrentUserId() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  handleError(error);

  if (!data.user) {
    throw new Error("You must be signed in.");
  }

  return data.user.id;
}

function buildDmPairKey(currentUserId: string, friendId: string) {
  return [currentUserId, friendId].sort().join(":");
}

async function findExistingDirectRoom(currentUserId: string, friendId: string) {
  const client = getSupabaseClient();
  const dmPairKey = buildDmPairKey(currentUserId, friendId);
  const pairResult = await client
    .from("chat_rooms")
    .select("*")
    .eq("type", "dm")
    .filter("dm_pair_key", "eq", dmPairKey)
    .maybeSingle();
  handleError(pairResult.error);
  if (pairResult.data) {
    return toRoom(pairResult.data as UnknownRecord);
  }

  const ownMemberships = await client
    .from("chat_room_members")
    .select("room_id")
    .eq("user_id", currentUserId);
  handleError(ownMemberships.error);

  const roomIds = (ownMemberships.data ?? [])
    .map((row) => rowString(row as UnknownRecord, "room_id"))
    .filter(Boolean);

  if (roomIds.length === 0) {
    return null;
  }

  const roomResult = await client.from("chat_rooms").select("*").eq("type", "dm").in("id", roomIds);
  handleError(roomResult.error);

  const rooms = (roomResult.data ?? []).map((row) => toRoom(row as UnknownRecord));
  if (rooms.length === 0) {
    return null;
  }

  const dmRoomIds = rooms.map((room) => room.id);
  const memberResult = await client
    .from("chat_room_members")
    .select("room_id, user_id")
    .in("room_id", dmRoomIds)
    .in("user_id", [currentUserId, friendId]);
  handleError(memberResult.error);

  const userSetsByRoom = new Map<string, Set<string>>();
  for (const row of memberResult.data ?? []) {
    const record = row as UnknownRecord;
    const roomId = rowString(record, "room_id");
    const userId = rowString(record, "user_id");
    const users = userSetsByRoom.get(roomId) ?? new Set<string>();
    users.add(userId);
    userSetsByRoom.set(roomId, users);
  }

  return rooms.find((room) => userSetsByRoom.get(room.id)?.size === 2) ?? null;
}

async function ensureDirectRoom(friendId: string) {
  const client = getSupabaseClient();
  const currentUserId = await getCurrentUserId();
  if (friendId === currentUserId) {
    throw new Error("Cannot create a chat with yourself.");
  }

  const dmPairKey = buildDmPairKey(currentUserId, friendId);
  const existingRoom = await findExistingDirectRoom(currentUserId, friendId);
  if (existingRoom) {
    return existingRoom;
  }

  const roomInsert = {
    created_by: currentUserId,
    dm_pair_key: dmPairKey,
    type: "dm",
  };
  const roomResult = await client
    .from("chat_rooms")
    .insert(roomInsert as never)
    .select("*")
    .single();

  if (roomResult.error) {
    const message = roomResult.error.message.toLowerCase();
    if (
      roomResult.error.code === "23505" ||
      message.includes("duplicate") ||
      message.includes("unique")
    ) {
      const racedRoom = await findExistingDirectRoom(currentUserId, friendId);
      if (racedRoom) {
        return racedRoom;
      }
    }
    handleError(roomResult.error);
  }

  const room = toRoom(roomResult.data as UnknownRecord);

  const memberResult = await client.from("chat_room_members").insert([
    { role: "owner", room_id: room.id, user_id: currentUserId },
    { role: "member", room_id: room.id, user_id: friendId },
  ]);
  handleError(memberResult.error);

  return room;
}

export async function getDirectThread(friendId: string): Promise<DirectThread> {
  const client = getSupabaseClient();
  const room = await ensureDirectRoom(friendId);
  const { data, error } = await client
    .from("chat_messages")
    .select("*")
    .eq("room_id", room.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(80);
  handleError(error);

  return {
    messages: (data ?? []).map((row) => toMessage(row as UnknownRecord)),
    room,
  };
}

export async function sendDirectMessage(friendId: string, content: string) {
  const client = getSupabaseClient();
  const senderId = await getCurrentUserId();
  const room = await ensureDirectRoom(friendId);
  const { data, error } = await client
    .from("chat_messages")
    .insert({ content: content.trim(), room_id: room.id, sender_id: senderId })
    .select("*")
    .single();
  handleError(error);

  return toMessage(data as UnknownRecord);
}

export async function getMyGameInvites() {
  const client = getSupabaseClient();
  const userId = await getCurrentUserId();
  const { data, error } = await client
    .from("game_invites")
    .select("*")
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(40);
  handleError(error);

  return (data ?? []).map((row) => toInvite(row as UnknownRecord));
}

export async function sendGameInvite(input: GameInviteInput) {
  const client = getSupabaseClient();
  const senderId = await getCurrentUserId();
  const { data, error } = await client
    .from("game_invites")
    .insert({
      game_id: input.gameId ?? null,
      game_title: input.gameTitle.trim(),
      launch_uri: input.launchUri ?? null,
      message: input.message?.trim() || null,
      receiver_id: input.receiverId,
      sender_id: senderId,
    })
    .select("*")
    .single();
  handleError(error);

  return toInvite(data as UnknownRecord);
}

export async function updateGameInviteStatus(inviteId: string, status: GameInvite["status"]) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("game_invites")
    .update({ status })
    .eq("id", inviteId)
    .select("*")
    .single();
  handleError(error);

  return toInvite(data as UnknownRecord);
}

export function subscribeToRoomMessages(roomId: string, onMessage: (message: ChatMessage) => void) {
  if (!supabase) {
    return () => undefined;
  }

  const client = supabase;
  const channel: RealtimeChannel = client
    .channel(`og-chat-${roomId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", filter: `room_id=eq.${roomId}`, schema: "public", table: "chat_messages" },
      (payload) => onMessage(toMessage(payload.new as UnknownRecord)),
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export function subscribeToGameInvites(userId: string, onInvite: (invite: GameInvite) => void) {
  if (!supabase) {
    return () => undefined;
  }

  const client = supabase;
  const channel: RealtimeChannel = client
    .channel(`og-invites-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "game_invites" }, (payload) => {
      const row = (
        payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old
      ) as UnknownRecord;
      const invite = toInvite(row);
      if (invite.senderId === userId || invite.receiverId === userId) {
        onInvite(invite);
      }
    })
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

// ============================================================================
// Group Chat
// ============================================================================

export interface GroupChatInfo {
  room: ChatRoom;
  memberCount: number;
}

export async function createGroupChat(name: string, memberIds: string[]): Promise<ChatRoom> {
  const client = getSupabaseClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  handleError(authError);
  if (!userData.user) throw new Error("You must be signed in.");

  const currentUserId = userData.user.id;

  const roomResult = await client
    .from("chat_rooms")
    .insert({ type: "group", name: name.trim() || null, created_by: currentUserId } as never)
    .select("*")
    .single();
  handleError(roomResult.error);

  const room = toRoom(roomResult.data as UnknownRecord);

  // Add creator + members
  const allMembers = [currentUserId, ...memberIds.filter((id) => id !== currentUserId)];
  const memberRows = allMembers.map((userId, index) => ({
    room_id: room.id,
    user_id: userId,
    role: index === 0 ? "owner" : "member",
  }));

  const { error: memberError } = await client.from("chat_room_members").insert(memberRows);
  handleError(memberError);

  return room;
}

export async function getMyGroupChats(): Promise<GroupChatInfo[]> {
  const client = getSupabaseClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  handleError(authError);
  if (!userData.user) throw new Error("You must be signed in.");

  // Get rooms I'm a member of that are groups
  const { data: memberships, error: memErr } = await client
    .from("chat_room_members")
    .select("room_id")
    .eq("user_id", userData.user.id);
  if (isMissingSchemaError(memErr)) return [];
  handleError(memErr);

  const roomIds = (memberships ?? [])
    .map((r) => rowString(r as UnknownRecord, "room_id"))
    .filter(Boolean);
  if (roomIds.length === 0) return [];

  const { data: rooms, error: roomErr } = await client
    .from("chat_rooms")
    .select("*")
    .eq("type", "group")
    .in("id", roomIds)
    .order("updated_at", { ascending: false });
  handleError(roomErr);

  return (rooms ?? []).map((r) => ({
    room: toRoom(r as UnknownRecord),
    memberCount: 0, // will be populated in UI if needed
  }));
}

export async function addGroupMember(roomId: string, userId: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client
    .from("chat_room_members")
    .insert({ room_id: roomId, user_id: userId, role: "member" });
  handleError(error);
}

export async function removeGroupMember(roomId: string, userId: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client
    .from("chat_room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", userId);
  handleError(error);
}

export async function leaveGroup(roomId: string): Promise<void> {
  const client = getSupabaseClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  handleError(authError);
  if (!userData.user) throw new Error("You must be signed in.");

  const { error } = await client
    .from("chat_room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", userData.user.id);
  handleError(error);
}

export async function renameGroup(roomId: string, name: string): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client
    .from("chat_rooms")
    .update({ name: name.trim() || null })
    .eq("id", roomId);
  handleError(error);
}

export async function getGroupMessages(
  roomId: string,
  limit = 80,
  before?: string,
): Promise<ChatMessage[]> {
  const client = getSupabaseClient();
  let query = client
    .from("chat_messages")
    .select("*")
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;
  handleError(error);

  return (data ?? []).map((row) => toMessage(row as UnknownRecord));
}

export async function sendGroupMessage(roomId: string, content: string): Promise<ChatMessage> {
  const client = getSupabaseClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  handleError(authError);
  if (!userData.user) throw new Error("You must be signed in.");

  const { data, error } = await client
    .from("chat_messages")
    .insert({ content: content.trim(), room_id: roomId, sender_id: userData.user.id })
    .select("*")
    .single();
  handleError(error);

  return toMessage(data as UnknownRecord);
}

export function subscribeToGroupMessages(
  roomId: string,
  onMessage: (message: ChatMessage) => void,
) {
  return subscribeToRoomMessages(roomId, onMessage);
}

// ============================================================================
// Cross-Platform Invites (Enhanced)
// ============================================================================

function toCrossPlatformInvite(row: UnknownRecord): CrossPlatformInvite {
  return {
    id: rowString(row, "id"),
    senderId: rowString(row, "sender_id"),
    receiverId: rowNullableString(row, "receiver_id"),
    gameId: rowNullableString(row, "game_id"),
    gameTitle: rowString(row, "game_title"),
    platform: rowNullableString(row, "platform") as PlatformType | null,
    launchUri: rowNullableString(row, "launch_uri"),
    message: rowNullableString(row, "message"),
    feasibility: (rowString(row, "feasibility", "uncertain") || "uncertain") as InviteFeasibility,
    status: rowString(row, "status", "pending") as CrossPlatformInvite["status"],
    expiresAt: rowString(row, "expires_at"),
    createdAt: rowString(row, "created_at"),
    updatedAt: rowString(row, "updated_at"),
  };
}

export async function sendCrossplatformInvite(
  receiverId: string | null,
  gameTitle: string,
  platform: PlatformType | null,
  launchUri: string | null,
  feasibility: InviteFeasibility,
  message?: string | null,
): Promise<CrossPlatformInvite> {
  const client = getSupabaseClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  handleError(authError);
  if (!userData.user) throw new Error("You must be signed in.");

  const { data, error } = await client
    .from("game_invites")
    .insert({
      sender_id: userData.user.id,
      receiver_id: receiverId,
      game_title: gameTitle.trim(),
      launch_uri: launchUri,
      message: message?.trim() || null,
      // Store platform + feasibility in metadata via the existing columns
      // The game_invites table already has launch_uri; we repurpose message for feasibility info
    })
    .select("*")
    .single();
  handleError(error);

  // Return as CrossPlatformInvite with additional computed fields
  const invite = toCrossPlatformInvite(data as UnknownRecord);
  return { ...invite, platform, feasibility };
}

function toGameInviteShareToken(row: UnknownRecord): GameInviteShareToken {
  return {
    expiresAt: rowString(row, "expires_at"),
    gameTitle: rowString(row, "game_title"),
    platform: rowNullableString(row, "platform") as PlatformType | null,
    token: rowString(row, "token"),
    tokenHint: rowString(row, "token_hint"),
  };
}

function toResolvedShareToken(row: UnknownRecord): ResolvedShareToken {
  return {
    expiresAt: rowString(row, "expires_at"),
    gameInviteId: rowString(row, "game_invite_id"),
    gameTitle: rowString(row, "game_title"),
    platform: rowNullableString(row, "platform") as PlatformType | null,
  };
}

function toRedeemedShareToken(row: UnknownRecord): RedeemedShareToken {
  return {
    acceptedAt: rowString(row, "accepted_at"),
    gameInviteId: rowString(row, "game_invite_id"),
    gameTitle: rowString(row, "game_title"),
    platform: rowNullableString(row, "platform") as PlatformType | null,
    status: rowString(row, "status"),
  };
}

function toInviteHostedReplayProof(row: UnknownRecord): InviteHostedReplayProof {
  const guards = Array.isArray(row.guards)
    ? row.guards.filter((guard): guard is string => typeof guard === "string")
    : [];

  return {
    checkedAt: rowString(row, "checkedAt"),
    deploymentScope: "hosted-staging",
    gameInviteId: rowString(row, "gameInviteId"),
    gameTitle: rowString(row, "gameTitle"),
    guards,
    inviteStatus: rowString(row, "inviteStatus"),
    maxUses: typeof row.maxUses === "number" ? row.maxUses : null,
    origin: rowString(row, "origin"),
    originVerified: rowBoolean(row, "originVerified"),
    platform: rowNullableString(row, "platform") as PlatformType | null,
    replayDenied: rowBoolean(row, "replayDenied"),
    replayError: rowString(row, "replayError"),
    tokenHint: rowString(row, "tokenHint"),
    usedAt: rowNullableString(row, "usedAt"),
    usesCount: rowNumber(row, "usesCount"),
  };
}

export async function createGameInviteShareToken(
  inviteId: string,
  platform: PlatformType | null,
  ttlSeconds = 1800,
): Promise<GameInviteShareToken | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .rpc("create_game_invite_share_token", {
      invite_id_input: inviteId,
      platform_input: platform ?? undefined,
      ttl_seconds_input: ttlSeconds,
    })
    .maybeSingle();

  if (isMissingSchemaError(error)) return null;
  baseHandleError(error);
  if (!data) return null;

  return toGameInviteShareToken(data as UnknownRecord);
}

export async function resolveShareToken(token: string): Promise<ResolvedShareToken | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const client = getSupabaseClient();
  const { data, error } = await client
    .rpc("resolve_share_token", { token_input: trimmed })
    .maybeSingle();

  if (isMissingSchemaError(error)) return null;
  baseHandleError(error);
  if (!data) return null;

  return toResolvedShareToken(data as UnknownRecord);
}

export async function redeemShareToken(token: string): Promise<RedeemedShareToken | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const client = getSupabaseClient();
  const { data, error } = await client
    .rpc("redeem_share_token", { token_input: trimmed })
    .maybeSingle();

  if (isMissingSchemaError(error)) return null;
  baseHandleError(error);
  if (!data) return null;

  return toRedeemedShareToken(data as UnknownRecord);
}

export async function proveInviteHostedReplay(
  token: string,
): Promise<InviteHostedReplayProof | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<UnknownRecord>("invite-hosted-proof", {
    body: { token: trimmed },
  });

  if (isInviteHostedProofUnavailable(error)) return null;
  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;
  if (typeof data.error === "string") {
    throw new Error(data.error);
  }

  return toInviteHostedReplayProof(data);
}

function isInviteHostedProofUnavailable(error: unknown) {
  const typedError = (error ?? {}) as {
    context?: { status?: number | null };
    message?: string;
    name?: string;
    status?: number | null;
  };
  const status = typedError.status ?? typedError.context?.status ?? null;
  const message = String(typedError.message ?? "").toLowerCase();
  const name = String(typedError.name ?? "").toLowerCase();

  return (
    status === 404 ||
    status === 503 ||
    name.includes("fetch") ||
    message.includes("failed to fetch") ||
    message.includes("function not found") ||
    message.includes("not found") ||
    message.includes("networkerror")
  );
}

/**
 * Check if cross-platform invite is feasible based on game_cross_play data.
 */
export async function checkInviteFeasibility(
  gameTitle: string,
  senderPlatforms: PlatformType[],
  receiverPlatforms: PlatformType[],
): Promise<InviteFeasibility> {
  const client = getSupabaseClient();

  // Try to find the game in our catalog
  const { data: games } = await client
    .from("games")
    .select("id")
    .ilike("title", `%${gameTitle}%`)
    .limit(1);

  if (!games || games.length === 0) {
    // Can't determine feasibility without game data
    return "uncertain";
  }

  const gameId = rowString(games[0] as UnknownRecord, "id");

  // Check cross-play support for this game
  const { data: crossPlay } = await client
    .from("game_cross_play")
    .select("platform, is_enabled")
    .eq("game_id", gameId)
    .eq("is_enabled", true);

  if (!crossPlay || crossPlay.length === 0) {
    return "uncertain";
  }

  const enabledPlatforms = new Set(crossPlay.map((r) => rowString(r as UnknownRecord, "platform")));

  // Check if both sender and receiver have at least one matching enabled platform
  const senderMatch = senderPlatforms.some((p) => enabledPlatforms.has(p));
  const receiverMatch = receiverPlatforms.some((p) => enabledPlatforms.has(p));

  if (senderMatch && receiverMatch) return "possible";
  if (!senderMatch && !receiverMatch) return "impossible";
  return "uncertain";
}
