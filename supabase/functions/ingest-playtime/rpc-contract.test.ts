// deno-lint-ignore-file no-import-prefix
import {
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260712000000_atomic_playtime_ingestion.sql",
    import.meta.url,
  ),
);

Deno.test("playtime RPC binds authenticated aggregate fallback to the caller", () => {
  assertStringIncludes(
    migration,
    "create or replace function public.ingest_trusted_playtime(",
  );
  assertStringIncludes(migration, "security definer");
  assertStringIncludes(
    migration,
    "request_role text := coalesce(auth.role(), '')",
  );
  assertMatch(
    migration,
    /request_role = 'authenticated'[\s\S]*?p_authenticated_user_id is distinct from auth\.uid\(\)/i,
  );
  assertMatch(
    migration,
    /request_role = 'authenticated'[\s\S]*?p_aggregate is null[\s\S]*?jsonb_array_length\(normalized_sessions\) <> 0/i,
  );
  assertMatch(
    migration,
    /from auth\.users as authenticated_user[\s\S]*?authenticated_user\.id = p_authenticated_user_id/i,
  );
  assertMatch(
    migration,
    /revoke execute[\s\S]*?from public, anon, authenticated, service_role;[\s\S]*?grant execute[\s\S]*?to authenticated, service_role;/i,
  );
});

Deno.test("playtime RPC makes aggregate and session retries idempotent", () => {
  assertStringIncludes(migration, "pg_advisory_xact_lock(");
  assertStringIncludes(migration, "on conflict (id) do nothing");
  assertStringIncludes(
    migration,
    "create table if not exists private.playtime_aggregate_operations",
  );
  assertStringIncludes(
    migration,
    "primary key (user_id, operation_id)",
  );
  assertMatch(
    migration,
    /on conflict \(user_id, operation_id\) do nothing[\s\S]*?aggregate_operation_payload is distinct from p_aggregate/i,
  );
  assertMatch(
    migration,
    /stored\.user_id <> p_authenticated_user_id[\s\S]*?stored\.user_id = p_authenticated_user_id/i,
  );
  assertMatch(
    migration,
    /accepted := true;[\s\S]*?aggregate_pushed := aggregate_operation_applied;[\s\S]*?sessions_pushed := requested_session_count/i,
  );
});

Deno.test("playtime RPC rolls back conflicts and leaves other failures atomic", () => {
  assertMatch(
    migration,
    /begin[\s\S]*?insert into public\.game_sessions[\s\S]*?insert into private\.playtime_aggregate_operations[\s\S]*?insert into public\.user_game_stats[\s\S]*?exception\s+when sqlstate 'P4090'/i,
  );
  assertStringIncludes(
    migration,
    "on conflict on constraint user_game_stats_user_game_unique do update",
  );
  assertEquals(
    (migration.match(/exception\s+when/gi) ?? []).length,
    1,
  );
});

Deno.test("playtime aggregates merge snapshots, apply corrections, and increment atomically", () => {
  assertMatch(
    migration,
    /playtime_minutes = case[\s\S]*?operation' = 'correction'[\s\S]*?greatest\(stats\.playtime_minutes, excluded\.playtime_minutes\)/i,
  );
  assertMatch(
    migration,
    /total_sessions = stats\.total_sessions[\s\S]*?session_count_delta/i,
  );
  assertMatch(
    migration,
    /where p_aggregate ->> 'operation' = 'correction'[\s\S]*?session_count_delta[\s\S]*?excluded\.ingestion_observed_at >= stats\.ingestion_observed_at/i,
  );
  assertStringIncludes(
    migration,
    "p_aggregate ? 'total_sessions'",
  );
  assertMatch(
    migration,
    /revoke insert, update on table public\.user_game_stats from authenticated/i,
  );

  const insertGrant = migration.match(
    /grant insert \(([\s\S]*?)\) on table public\.user_game_stats to authenticated;/i,
  )?.[1] ?? "";
  const updateGrant = migration.match(
    /grant update \(([\s\S]*?)\) on table public\.user_game_stats to authenticated;/i,
  )?.[1] ?? "";
  for (
    const protectedColumn of [
      "playtime_minutes",
      "total_sessions",
      "first_played_at",
      "last_played_at",
      "installed_version",
      "ingestion_observed_at",
    ]
  ) {
    assertEquals(insertGrant.includes(protectedColumn), false);
    assertEquals(updateGrant.includes(protectedColumn), false);
  }
});
