import type { Game } from "../types";
import { getSupabaseClient, isSupabaseConfigured } from "./client";
import {
  handleError,
  isMissingSchemaError,
  rowNullableString,
  rowNumber,
  rowString,
  type UnknownRecord,
} from "./helpers";

type PlaytimeSyncInput = {
  game: Game;
  playtimeMinutes?: number | null;
  lastPlayedAt?: string | null;
  countSessionStart?: boolean;
};

function slugifyTitle(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function externalIdKey(game: Game) {
  if (!game.launcher || game.launcher === "unknown" || game.launcher === "manual") {
    return null;
  }
  if (game.externalId) {
    return { launcher: game.launcher, id: game.externalId };
  }

  const prefix = `${game.launcher}-owned-`;
  if (game.id.startsWith(prefix)) {
    return { launcher: game.launcher, id: game.id.slice(prefix.length) };
  }

  return null;
}

async function resolveCatalogGameId(game: Game): Promise<string | null> {
  const client = getSupabaseClient();
  const external = externalIdKey(game);

  if (external) {
    const { data, error } = await client
      .from("games")
      .select("id, external_ids")
      .contains("external_ids", { [external.launcher]: external.id })
      .limit(1)
      .maybeSingle();

    if (isMissingSchemaError(error)) {
      return null;
    }
    handleError(error);

    const id = data ? rowString(data as UnknownRecord, "id") : "";
    if (id) {
      return id;
    }
  }

  const slug = game.slug || slugifyTitle(game.title);
  if (slug) {
    const { data, error } = await client
      .from("games")
      .select("id, slug")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();

    if (isMissingSchemaError(error)) {
      return null;
    }
    handleError(error);

    const id = data ? rowString(data as UnknownRecord, "id") : "";
    if (id) {
      return id;
    }
  }

  const { data, error } = await client
    .from("games")
    .select("id, title")
    .eq("title", game.title)
    .limit(1)
    .maybeSingle();

  if (isMissingSchemaError(error)) {
    return null;
  }
  handleError(error);

  return data ? rowNullableString(data as UnknownRecord, "id") : null;
}

export async function syncGamePlaytimeStats(input: PlaytimeSyncInput) {
  if (!isSupabaseConfigured) {
    return;
  }

  const client = getSupabaseClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return;
  }

  const catalogGameId = await resolveCatalogGameId(input.game);
  if (!catalogGameId) {
    return;
  }

  const { data: existingData, error: existingError } = await client
    .from("user_game_stats")
    .select("playtime_minutes, total_sessions, first_played_at")
    .eq("user_id", userData.user.id)
    .eq("game_id", catalogGameId)
    .maybeSingle();

  if (isMissingSchemaError(existingError)) {
    return;
  }
  handleError(existingError);

  const existing = (existingData ?? {}) as UnknownRecord;
  const nextPlaytime = Math.max(
    rowNumber(existing, "playtime_minutes"),
    input.playtimeMinutes ?? input.game.playtimeMinutes ?? 0,
  );
  const lastPlayedAt = input.lastPlayedAt ?? input.game.lastPlayedAt ?? input.game.lastPlayed ?? null;
  const firstPlayedAt = rowNullableString(existing, "first_played_at") ?? lastPlayedAt;
  const row = {
    user_id: userData.user.id,
    game_id: catalogGameId,
    playtime_minutes: nextPlaytime,
    last_played_at: lastPlayedAt,
    first_played_at: firstPlayedAt,
    installed_version: input.game.version,
    ...(input.countSessionStart
      ? { total_sessions: rowNumber(existing, "total_sessions") + 1 }
      : {}),
  };

  const { error } = await client
    .from("user_game_stats")
    .upsert(row, { onConflict: "user_id,game_id" });

  if (isMissingSchemaError(error)) {
    return;
  }
  handleError(error);
}
