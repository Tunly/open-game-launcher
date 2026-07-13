const migrationUrl = new URL(
  "../../migrations/20260712001000_atomic_group_rooms_and_blocked_dm_access.sql",
  import.meta.url,
);
const chatBaseMigrationUrl = new URL(
  "../../migrations/20260527101230_social_chat_invites.sql",
  import.meta.url,
);

Deno.test("group-room RPC validates and canonicalizes all participants", async () => {
  const migration = normalizeSql(await Deno.readTextFile(migrationUrl));

  assertIncludes(migration, "current_user_id uuid := auth.uid()");
  assertIncludes(migration, "if current_user_id is null then");
  assertIncludes(migration, "normalized_title := btrim(title_input)");
  assertIncludes(
    migration,
    "if char_length(normalized_title) not between 1 and 80 then",
  );
  assertIncludes(migration, "where input_member.member_id is null");
  assertIncludes(migration, "select distinct input_member.member_id");
  assertIncludes(
    migration,
    "where input_member.member_id <> current_user_id",
  );
  assertIncludes(migration, "max_participants constant integer := 50");
  assertIncludes(
    migration,
    "if cardinality(invited_member_ids) + 1 > max_participants then",
  );
});

Deno.test("group-room RPC locks and verifies every relationship before writing", async () => {
  const migration = normalizeSql(await Deno.readTextFile(migrationUrl));
  const advisoryLock = migration.indexOf("pg_advisory_xact_lock");
  const blockCheck = migration.indexOf("from public.user_blocks as user_block");
  const friendshipCheck = migration.indexOf(
    "from public.friendships as friendship",
  );
  const roomInsert = migration.indexOf("insert into public.chat_rooms");
  const membershipInsert = migration.indexOf(
    "insert into public.chat_room_members",
  );

  assert(advisoryLock >= 0, "Expected advisory relationship locks");
  assert(advisoryLock < blockCheck, "Expected locks before block validation");
  assert(
    blockCheck < friendshipCheck,
    "Expected block validation before friendship validation",
  );
  assert(
    friendshipCheck < roomInsert,
    "Expected relationship validation before room creation",
  );
  assert(
    roomInsert < membershipInsert,
    "Expected room creation before membership creation",
  );
  assertIncludes(
    migration,
    "order by public.build_dm_pair_key(current_user_id, member.member_id)",
  );
  assertIncludes(
    migration,
    "lock table public.user_blocks in share mode",
  );
  assertIncludes(migration, "friendship.status = 'accepted'");
  assertIncludes(migration, "for key share");
  assertIncludes(migration, "for update");
  assertIncludes(
    migration,
    "values ( created_room_id, current_user_id, 'owner' )",
  );
  assertIncludes(
    migration,
    "from unnest(invited_member_ids) as member(member_id)",
  );
  assertIncludes(migration, "return created_room_id");
});

Deno.test("group-room RPC is the authenticated atomic room-creation boundary", async () => {
  const migration = normalizeSql(await Deno.readTextFile(migrationUrl));

  assertIncludes(
    migration,
    "create or replace function public.create_group_room( title_input text, member_ids_input uuid[] ) returns uuid language plpgsql security definer volatile set search_path = pg_catalog, public, pg_temp",
  );
  assertIncludes(
    migration,
    "revoke all on function public.create_group_room(text, uuid[]) from public, anon, authenticated, service_role",
  );
  assertIncludes(
    migration,
    "grant execute on function public.create_group_room(text, uuid[]) to authenticated, service_role",
  );
  assertIncludes(
    migration,
    "revoke insert on table public.chat_rooms from authenticated",
  );
  assertNotIncludes(migration, "disable row level security");
  assert(migration.startsWith("begin;"), "Expected an explicit transaction");
  assert(
    migration.endsWith("commit;"),
    "Expected an explicit transaction commit",
  );
});

Deno.test("group-member RPC serializes authorized group-only additions", async () => {
  const migration = normalizeSql(await Deno.readTextFile(migrationUrl));
  const addition = functionBlock(
    migration,
    "create or replace function public.add_group_room_member(",
  );
  const roomLock = addition.indexOf("from public.chat_rooms as room");
  const relationshipLock = addition.indexOf("pg_advisory_xact_lock");
  const blockCheck = addition.indexOf("from public.user_blocks as user_block");
  const friendshipCheck = addition.indexOf(
    "from public.friendships as friendship",
  );
  const participantCount = addition.indexOf("select count(*)::integer");
  const memberInsert = addition.indexOf("insert into public.chat_room_members");

  assertIncludes(addition, "current_user_id uuid := auth.uid()");
  assertIncludes(addition, "if current_user_id is null then");
  assertIncludes(addition, "where room.id = room_id_input for update");
  assertIncludes(addition, "if group_room.type <> 'group' then");
  assertIncludes(addition, "if group_room.created_by <> current_user_id then");
  assertIncludes(addition, "creator_membership.role = 'owner'");
  assertIncludes(addition, "for key share");
  assert(roomLock >= 0, "Expected the room row to be locked");
  assert(
    roomLock < relationshipLock,
    "Expected room serialization before relationship locks",
  );
  assert(
    relationshipLock < blockCheck,
    "Expected pair locking before block validation",
  );
  assert(
    blockCheck < friendshipCheck,
    "Expected block validation before friendship validation",
  );
  assert(
    friendshipCheck < participantCount,
    "Expected relationship validation before cap checks",
  );
  assert(
    participantCount < memberInsert,
    "Expected the cap check before insertion",
  );
});

Deno.test("group-member RPC rejects blocks, strangers, direct rooms, and the participant cap", async () => {
  const migration = normalizeSql(await Deno.readTextFile(migrationUrl));
  const addition = functionBlock(
    migration,
    "create or replace function public.add_group_room_member(",
  );

  assertIncludes(addition, "max_participants constant integer := 50");
  assertIncludes(addition, "if participant_count >= max_participants then");
  assertIncludes(addition, "friendship.status = 'accepted'");
  assertIncludes(addition, "lock table public.user_blocks in share mode");
  assertIncludes(
    addition,
    "user_block.blocker_id = current_user_id and user_block.blocked_id = member_id_input",
  );
  assertIncludes(
    addition,
    "user_block.blocker_id = member_id_input and user_block.blocked_id = current_user_id",
  );
  assertIncludes(addition, "members can be added only to group rooms");
});

Deno.test("group membership writes expose only RPC addition and intentional group removal", async () => {
  const migration = normalizeSql(await Deno.readTextFile(migrationUrl));

  assertIncludes(
    migration,
    "create or replace function public.add_group_room_member( room_id_input uuid, member_id_input uuid ) returns void language plpgsql security definer volatile set search_path = pg_catalog, public, pg_temp",
  );
  assertIncludes(
    migration,
    "revoke all on function public.add_group_room_member(uuid, uuid) from public, anon, authenticated, service_role",
  );
  assertIncludes(
    migration,
    "grant execute on function public.add_group_room_member(uuid, uuid) to authenticated, service_role",
  );
  assertIncludes(
    migration,
    "revoke insert on table public.chat_room_members from public, anon, authenticated",
  );
  assertIncludes(
    migration,
    "grant insert on table public.chat_room_members to service_role",
  );
  assertIncludes(
    migration,
    "drop policy if exists chat_room_members_insert_self_or_friend on public.chat_room_members",
  );

  const removal = policyBlock(
    migration,
    "create policy chat_room_members_delete_self_or_creator",
  );
  assertIncludes(removal, "room.type = 'group'");
  assertIncludes(removal, "user_id <> room.created_by");
  assertIncludes(removal, "user_id = (select auth.uid())");
  assertIncludes(removal, "room.created_by = (select auth.uid())");
  assertIncludes(
    removal,
    "private.is_chat_room_member( room.id, (select auth.uid()) )",
  );
  assertNotIncludes(removal, "room.type = 'dm'");
});

Deno.test("direct-room membership fails closed for malformed pairs and either block direction", async () => {
  const [migrationSource, baseSource] = await Promise.all([
    Deno.readTextFile(migrationUrl),
    Deno.readTextFile(chatBaseMigrationUrl),
  ]);
  const migration = normalizeSql(migrationSource);
  const base = normalizeSql(baseSource);

  assertIncludes(
    migration,
    "create or replace function private.is_chat_room_member( room_id_input uuid, user_id_input uuid ) returns boolean language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp",
  );
  assertIncludes(
    migration,
    "if coalesce(auth.role(), '') <> 'service_role' and user_id_input is distinct from auth.uid() then return false",
  );
  assertIncludes(migration, "if room_type = 'group' then return exists");
  assertIncludes(migration, "or direct_pair_key is null");
  assertIncludes(migration, "or direct_pair_key !~");
  assertIncludes(
    migration,
    "direct_pair_key is distinct from public.build_dm_pair_key( first_participant_id, second_participant_id )",
  );
  assertIncludes(
    migration,
    "room_creator_id not in (first_participant_id, second_participant_id)",
  );
  assertIncludes(
    migration,
    "user_id_input not in (first_participant_id, second_participant_id)",
  );
  assertIncludes(
    migration,
    "user_block.blocker_id = first_participant_id and user_block.blocked_id = second_participant_id",
  );
  assertIncludes(
    migration,
    "user_block.blocker_id = second_participant_id and user_block.blocked_id = first_participant_id",
  );
  assertIncludes(
    migration,
    "drop policy if exists chat_rooms_select_creator on public.chat_rooms",
  );

  const messageUpdate = policyBlock(
    migration,
    "create policy chat_messages_update_sender",
  );
  assertIncludes(messageUpdate, "for update to authenticated");
  assertIncludes(messageUpdate, "sender_id = (select auth.uid())");
  assertIncludes(
    messageUpdate,
    "private.is_chat_room_member( room_id, (select auth.uid()) )",
  );

  for (
    const policy of [
      "chat_rooms_select_member",
      "chat_room_members_select_member",
      "chat_messages_select_room_member",
      "chat_messages_insert_room_member",
    ]
  ) {
    assertIncludes(base, `create policy ${policy}`);
  }
  assertIncludes(base, "private.is_chat_room_member(id, auth.uid())");
  assertIncludes(base, "private.is_chat_room_member(room_id, auth.uid())");
});

function normalizeSql(source: string) {
  return source.toLowerCase().replace(/\s+/g, " ").trim();
}

function functionBlock(source: string, marker: string) {
  const start = source.indexOf(marker);
  assert(start >= 0, `Expected function marker ${JSON.stringify(marker)}`);
  const end = source.indexOf("$$;", start);
  assert(end >= 0, `Expected function ${JSON.stringify(marker)} to end`);
  return source.slice(start, end + 3);
}

function policyBlock(source: string, marker: string) {
  const start = source.indexOf(marker);
  assert(start >= 0, `Expected policy marker ${JSON.stringify(marker)}`);
  const end = source.indexOf(";", start);
  assert(end >= 0, `Expected policy ${JSON.stringify(marker)} to end`);
  return source.slice(start, end + 1);
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
