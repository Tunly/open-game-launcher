import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

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
  type SupabaseErrorLike,
  type UnknownRecord,
} from "./helpers";

export type DirectThread = {
  messages: ChatMessage[];
  room: ChatRoom;
};

type DirectRoomRpcClient = {
  rpc: (
    functionName: "ensure_direct_room",
    args: { friend_id_input: string },
  ) => {
    single: () => Promise<{
      data: UnknownRecord | null;
      error: SupabaseErrorLike | null;
    }>;
  };
};

type GroupRoomRpcClient = {
  rpc: (
    functionName: "create_group_room",
    args: { member_ids_input: string[]; title_input: string },
  ) => Promise<{
    data: string | null;
    error: SupabaseErrorLike | null;
  }>;
};

type GroupMemberRpcClient = {
  rpc: (
    functionName: "add_group_room_member",
    args: { member_id_input: string; room_id_input: string },
  ) => Promise<{
    data: null;
    error: SupabaseErrorLike | null;
  }>;
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

export interface InviteFeasibilityResult {
  compatibleSenderPlatform: PlatformType | null;
  feasibility: InviteFeasibility;
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

function toChronologicalMessages(rows: unknown[] | null): ChatMessage[] {
  return (rows ?? []).map((row) => toMessage(row as UnknownRecord)).reverse();
}

export type ChatMessageCursor = Pick<ChatMessage, "createdAt" | "id">;

function chatMessageCursorFilter(cursor: ChatMessageCursor) {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
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

async function ensureDirectRoom(friendId: string) {
  const client = getSupabaseClient();
  const rpcClient = client as unknown as DirectRoomRpcClient;
  const { data, error } = await rpcClient
    .rpc("ensure_direct_room", { friend_id_input: friendId })
    .single();
  handleError(error);

  if (!data) {
    throw new Error("The direct-message room was not returned.");
  }

  return toRoom(data);
}

export async function getDirectThread(friendId: string): Promise<DirectThread> {
  const client = getSupabaseClient();
  const room = await ensureDirectRoom(friendId);
  const { data, error } = await client
    .from("chat_messages")
    .select("*")
    .eq("room_id", room.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(80);
  handleError(error);

  return {
    messages: toChronologicalMessages(data),
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
  const handleInviteChange = (payload: RealtimePostgresChangesPayload<UnknownRecord>) => {
    const row = (
      payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old
    ) as UnknownRecord;
    const invite = toInvite(row);
    if (invite.senderId === userId || invite.receiverId === userId) {
      onInvite(invite);
    }
  };
  let channel: RealtimeChannel = client.channel(`og-invites-${userId}`);
  for (const event of ["INSERT", "UPDATE"] as const) {
    channel = channel
      .on(
        "postgres_changes",
        {
          event,
          filter: `receiver_id=eq.${userId}`,
          schema: "public",
          table: "game_invites",
        },
        handleInviteChange,
      )
      .on(
        "postgres_changes",
        {
          event,
          filter: `sender_id=eq.${userId}`,
          schema: "public",
          table: "game_invites",
        },
        handleInviteChange,
      );
  }
  channel = channel.subscribe();

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
  const rpcClient = client as unknown as GroupRoomRpcClient;
  const { data: roomId, error: rpcError } = await rpcClient.rpc("create_group_room", {
    member_ids_input: memberIds,
    title_input: name,
  });
  handleError(rpcError);

  if (!roomId) {
    throw new Error("The group-chat room ID was not returned.");
  }

  const { data, error } = await client.from("chat_rooms").select("*").eq("id", roomId).single();
  handleError(error);

  return toRoom(data as UnknownRecord);
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
  const rpcClient = client as unknown as GroupMemberRpcClient;
  const { error } = await rpcClient.rpc("add_group_room_member", {
    member_id_input: userId,
    room_id_input: roomId,
  });
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
  before?: ChatMessageCursor,
): Promise<ChatMessage[]> {
  const client = getSupabaseClient();
  let query = client
    .from("chat_messages")
    .select("*")
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (before) {
    query = query.or(chatMessageCursorFilter(before));
  }

  const { data, error } = await query.limit(limit);
  handleError(error);

  return toChronologicalMessages(data);
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
  expectedUserId: string,
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
  if (userData.user.id !== expectedUserId) {
    throw new Error("Your signed-in account changed. Please try again.");
  }

  const { data, error } = await client
    .from("game_invites")
    .insert({
      sender_id: expectedUserId,
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
  expectedUserId: string,
  inviteId: string,
  platform: PlatformType | null,
  ttlSeconds = 1800,
): Promise<GameInviteShareToken | null> {
  const client = getSupabaseClient();
  const { data: userData, error: authError } = await client.auth.getUser();
  handleError(authError);
  if (!userData.user) throw new Error("You must be signed in.");
  if (userData.user.id !== expectedUserId) {
    throw new Error("Your signed-in account changed. Please try again.");
  }

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
): Promise<InviteFeasibilityResult> {
  const client = getSupabaseClient();

  // Try to find the game in our catalog
  const { data: games } = await client
    .from("games")
    .select("id")
    .ilike("title", `%${gameTitle}%`)
    .limit(1);

  if (!games || games.length === 0) {
    // Can't determine feasibility without game data
    return { compatibleSenderPlatform: null, feasibility: "uncertain" };
  }

  const gameId = rowString(games[0] as UnknownRecord, "id");

  // Check cross-play support for this game
  const { data: crossPlay } = await client
    .from("game_cross_play")
    .select("platform, is_enabled")
    .eq("game_id", gameId)
    .eq("is_enabled", true);

  if (!crossPlay || crossPlay.length === 0) {
    return { compatibleSenderPlatform: null, feasibility: "uncertain" };
  }

  const enabledPlatforms = new Set(crossPlay.map((r) => rowString(r as UnknownRecord, "platform")));

  // Check if both sender and receiver have at least one matching enabled platform
  const senderMatch = senderPlatforms.find((platform) => enabledPlatforms.has(platform)) ?? null;
  const receiverMatch =
    receiverPlatforms.find((platform) => enabledPlatforms.has(platform)) ?? null;

  if (senderMatch && receiverMatch) {
    return { compatibleSenderPlatform: senderMatch, feasibility: "possible" };
  }
  if (!senderMatch && !receiverMatch) {
    return { compatibleSenderPlatform: null, feasibility: "impossible" };
  }
  return { compatibleSenderPlatform: null, feasibility: "uncertain" };
}
