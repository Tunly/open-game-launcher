const migrationUrl = new URL(
  "../../migrations/20260711235900_ensure_direct_message_room_rpc.sql",
  import.meta.url,
);

Deno.test(
  "direct-message RPC repairs both endpoint memberships for an existing room",
  async () => {
    const migration = normalizeSql(await Deno.readTextFile(migrationUrl));
    const roomLookup = migration.indexOf("select room.* into direct_room");
    const roomInsert = migration.indexOf(
      "insert into public.chat_rooms as room",
    );
    const membershipInsert = migration.indexOf(
      "insert into public.chat_room_members as existing_member",
    );

    assert(roomLookup >= 0, "Expected a canonical room lookup");
    assert(roomLookup < roomInsert, "Expected lookup before room creation");
    assert(
      roomInsert < membershipInsert,
      "Expected both paths to converge before membership repair",
    );
    assertIncludes(
      migration,
      "direct_room.id, current_user_id, case when direct_room.created_by = current_user_id then 'owner' else 'member' end",
    );
    assertIncludes(
      migration,
      "direct_room.id, friend_id_input, case when direct_room.created_by = friend_id_input then 'owner' else 'member' end",
    );
    assertIncludes(
      migration,
      "on conflict (room_id, user_id) do update set role = excluded.role where existing_member.role is distinct from excluded.role",
    );
  },
);

Deno.test(
  "direct-message RPC serializes concurrent idempotent creation",
  async () => {
    const migration = normalizeSql(await Deno.readTextFile(migrationUrl));

    assertIncludes(
      migration,
      "perform pg_catalog.pg_advisory_xact_lock( pg_catalog.hashtextextended(canonical_pair_key, 0) )",
    );
    assertIncludes(
      migration,
      "where room.type = 'dm' and room.dm_pair_key = canonical_pair_key",
    );
    assertIncludes(migration, "limit 1 for update");
    assertIncludes(
      migration,
      "on conflict (dm_pair_key) where type = 'dm' and dm_pair_key is not null do nothing",
    );
    assertIncludes(migration, "return next direct_room");
  },
);

Deno.test(
  "direct-message RPC validates auth and relationship state",
  async () => {
    const migration = normalizeSql(await Deno.readTextFile(migrationUrl));

    assertIncludes(migration, "current_user_id uuid := auth.uid()");
    assertIncludes(migration, "if current_user_id is null then");
    assertIncludes(migration, "if friend_id_input = current_user_id then");
    assertIncludes(migration, "from public.user_blocks as user_block");
    assertIncludes(migration, "from public.friendships as friendship");
    assertIncludes(migration, "friendship.status = 'accepted'");
    assertIncludes(migration, "for key share");
  },
);

Deno.test(
  "direct-message RPC exposes only the authenticated definer entrypoint",
  async () => {
    const migration = normalizeSql(await Deno.readTextFile(migrationUrl));

    assertIncludes(
      migration,
      "create or replace function public.ensure_direct_room(friend_id_input uuid) returns setof public.chat_rooms language plpgsql security definer volatile set search_path = public, pg_temp",
    );
    assertIncludes(
      migration,
      "revoke all on function public.ensure_direct_room(uuid) from public, anon, authenticated",
    );
    assertIncludes(
      migration,
      "grant execute on function public.ensure_direct_room(uuid) to authenticated",
    );
    assertNotIncludes(migration, "service_role");
    assertNotIncludes(migration, "disable row level security");
    assertNotIncludes(migration, "create policy");
    assertNotIncludes(migration, "drop policy");
  },
);

function normalizeSql(source: string) {
  return source.toLowerCase().replace(/\s+/g, " ").trim();
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIncludes(source: string, expected: string) {
  if (!source.includes(expected)) {
    throw new Error(`Expected SQL to include ${JSON.stringify(expected)}`);
  }
}

function assertNotIncludes(source: string, unexpected: string) {
  if (source.includes(unexpected)) {
    throw new Error(
      `Expected SQL not to include ${JSON.stringify(unexpected)}`,
    );
  }
}
