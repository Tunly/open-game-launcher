import { getSupabaseClient } from "./client";
import type {
  CrossPlayIssue,
  CrossPlayPlatform,
  GameCrossPlay,
  GameCrossPlayReport,
} from "../types/crossplay";

const CROSSPLAY_SELECT = `
  id, game_id, platform, is_enabled, is_verified, verified_by_user_id,
  verified_at, notes, metadata, created_at, updated_at
`;

const REPORT_SELECT = `
  id, game_id, reporter_id, from_platform, to_platform, issue, description,
  status, created_at, updated_at
`;

interface CrossPlayRow {
  id: string;
  game_id: string;
  platform: string;
  is_enabled: boolean;
  is_verified: boolean;
  verified_by_user_id: string | null;
  verified_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface CrossPlayReportRow {
  id: string;
  game_id: string;
  reporter_id: string;
  from_platform: string;
  to_platform: string;
  issue: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToCrossPlay(row: CrossPlayRow): GameCrossPlay {
  return {
    id: row.id,
    gameId: row.game_id,
    platform: row.platform as CrossPlayPlatform,
    isEnabled: row.is_enabled,
    isVerified: row.is_verified,
    verifiedByUserId: row.verified_by_user_id,
    verifiedAt: row.verified_at,
    notes: row.notes,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToReport(row: CrossPlayReportRow): GameCrossPlayReport {
  return {
    id: row.id,
    gameId: row.game_id,
    reporterId: row.reporter_id,
    fromPlatform: row.from_platform as CrossPlayPlatform,
    toPlatform: row.to_platform as CrossPlayPlatform,
    issue: row.issue as CrossPlayIssue,
    description: row.description,
    status: row.status as GameCrossPlayReport["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listGameCrossPlay(gameId: string): Promise<GameCrossPlay[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from("game_cross_play")
    .select(CROSSPLAY_SELECT)
    .eq("game_id", gameId)
    .eq("is_enabled", true);
  if (error) {
    console.warn("listGameCrossPlay: query failed (table may not exist):", error.message);
    return [];
  }
  return ((data ?? []) as CrossPlayRow[]).map(rowToCrossPlay);
}

export async function getCrossPlayPlatforms(gameId: string): Promise<CrossPlayPlatform[]> {
  const list = await listGameCrossPlay(gameId);
  return list.map((c) => c.platform);
}

export async function reportCrossPlayIssue(
  gameId: string,
  fromPlatform: CrossPlayPlatform,
  toPlatform: CrossPlayPlatform,
  issue: CrossPlayIssue,
  description: string | null,
): Promise<GameCrossPlayReport | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const userId = (await client.auth.getUser()).data.user?.id;
  if (!userId) return null;
  const { data, error } = await client
    .from("game_cross_play_reports")
    .insert({
      game_id: gameId,
      reporter_id: userId,
      from_platform: fromPlatform,
      to_platform: toPlatform,
      issue,
      description,
    })
    .select(REPORT_SELECT)
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return rowToReport(data as CrossPlayReportRow);
}

interface GameExternalIdRow {
  slug: string | null;
  external_ids: Record<string, string> | null;
}

export async function getGameExternalId(
  gameId: string,
  platform: CrossPlayPlatform,
): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("games")
    .select("slug, external_ids")
    .eq("id", gameId)
    .single();
  if (error || !data) return null;
  const row = data as GameExternalIdRow;
  const ids = row.external_ids ?? {};
  return ids[platform] ?? row.slug ?? null;
}
