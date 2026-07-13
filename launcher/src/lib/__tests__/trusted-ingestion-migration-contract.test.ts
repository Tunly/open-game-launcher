// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readMigration(fileName: string) {
  return readFileSync(resolve(`../supabase/migrations/${fileName}`), "utf8");
}

function readSupabaseConfig() {
  return readFileSync(resolve("../supabase/config.toml"), "utf8");
}

function grantColumns(migration: string, operation: "insert" | "update") {
  const match = migration.match(
    new RegExp(`grant\\s+${operation}\\s*\\(([\\s\\S]*?)\\)\\s+on\\s+public\\.profiles`, "i"),
  );

  if (!match) {
    throw new Error(`Missing profiles ${operation} grant`);
  }

  return match[1].toLowerCase();
}

describe("trusted ingestion migration contract", () => {
  const base = readMigration("0001_user_social_game_schema.sql");
  const playtimeStats = readMigration("20260603105327_launcher_playtime_stats_writes.sql");
  const sessions = readMigration("20260605134744_extend_game_sessions_policies.sql");
  const activityFeed = readMigration("20260602130000_universal_friends.sql");
  const trustedAchievements = readMigration("20260610173000_trusted_achievement_ingestion.sql");
  const atomicPlaytime = readMigration("20260712000000_atomic_playtime_ingestion.sql");
  const config = readSupabaseConfig();

  it("keeps achievement, progress, and XP writes behind trusted ingestion", () => {
    expect(trustedAchievements).toMatch(
      /revoke insert, update on public\.profiles from anon, authenticated/i,
    );

    expect(grantColumns(trustedAchievements, "insert")).not.toMatch(/profile_(xp|level)/i);
    expect(grantColumns(trustedAchievements, "update")).not.toMatch(/profile_(xp|level)/i);

    for (const table of [
      "achievements",
      "user_achievements",
      "achievement_progress",
      "user_activity",
    ]) {
      expect(trustedAchievements).toMatch(
        new RegExp(
          `revoke\\s+insert,\\s*update,\\s*delete\\s+on\\s+public\\.${table}\\s+from\\s+anon,\\s*authenticated`,
          "i",
        ),
      );
    }
  });

  it("requires JWT-protected edge functions for trusted playtime and achievement ingestion", () => {
    expect(config).toMatch(/\[functions\.ingest-playtime\]\s+verify_jwt = true/i);
    expect(config).toMatch(/\[functions\.ingest-achievements\]\s+verify_jwt = true/i);
  });

  it("closes the staged direct playtime fallback behind the caller-bound RPC", () => {
    expect(playtimeStats).toMatch(
      /grant select, insert, update on table public\.user_game_stats to authenticated/i,
    );
    expect(playtimeStats).toMatch(/create policy launcher_playtime_stats_insert_own/i);
    expect(playtimeStats).toMatch(/create policy launcher_playtime_stats_update_own/i);
    expect(playtimeStats).toMatch(/with check \(auth\.uid\(\) = user_id\)/i);

    expect(atomicPlaytime).toMatch(
      /revoke insert, update on table public\.user_game_stats from authenticated/i,
    );
    expect(atomicPlaytime).toMatch(/p_authenticated_user_id is distinct from auth\.uid\(\)/i);
    expect(atomicPlaytime).toMatch(
      /grant execute on function public\.ingest_trusted_playtime\(uuid, jsonb, jsonb\)\s+to authenticated, service_role/i,
    );

    for (const column of [
      "playtime_minutes",
      "total_sessions",
      "first_played_at",
      "last_played_at",
      "installed_version",
      "ingestion_observed_at",
    ]) {
      const escaped = column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(atomicPlaytime).not.toMatch(
        new RegExp(`grant\\s+(?:insert|update)\\s*\\([^)]*${escaped}`, "i"),
      );
    }

    expect(base).toMatch(/create policy game_sessions_insert_own/i);
    expect(sessions).toMatch(/create policy game_sessions_update_own/i);
    expect(sessions).toMatch(/create policy game_sessions_delete_own/i);
    expect(sessions).toMatch(/using \(auth\.uid\(\) = user_id\)/i);
  });

  it("pins activity feed as a narrow authenticated exception while blocking achievement events", () => {
    expect(activityFeed).toMatch(
      /grant select, insert, delete on public\.activity_feed to authenticated/i,
    );
    expect(activityFeed).toMatch(/create policy activity_feed_delete_own/i);

    expect(trustedAchievements).toMatch(/drop policy if exists activity_feed_insert_own/i);
    expect(trustedAchievements).toMatch(/create policy activity_feed_insert_own/i);
    expect(trustedAchievements).toMatch(
      /type in \('game_start', 'game_stop', 'screenshot_taken'\)/i,
    );
    expect(trustedAchievements).not.toMatch(/type in \([^)]*achievement_unlocked/i);
  });
});
