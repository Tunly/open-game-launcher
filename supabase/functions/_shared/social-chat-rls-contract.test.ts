Deno.test(
  "chat room membership inserts require room creator authority",
  async () => {
    const migrations = normalizeSql(await readMigrations());
    const policy = lastPolicyBlock(
      migrations,
      "chat_room_members_insert_self_or_friend",
      "chat_room_members",
    );

    assertIncludes(policy, "for insert to authenticated");
    assertIncludes(
      policy,
      "exists ( select 1 from public.chat_rooms room where room.id = room_id and room.created_by = (select auth.uid())",
    );
    assertIncludes(policy, "user_id = (select auth.uid())");
    assertIncludes(
      policy,
      "public.is_friend((select auth.uid()), user_id)",
    );
    assertIncludes(policy, "room.type = 'group'");
    assertIncludes(policy, "room.type = 'dm'");
    assertIncludes(
      policy,
      "room.dm_pair_key = public.build_dm_pair_key((select auth.uid()), user_id)",
    );
    assertIncludes(policy, "role = 'owner'");
    assertIncludes(policy, "role = 'member'");
    assertIncludes(
      migrations,
      "revoke update on table public.chat_rooms from authenticated",
    );
    assertIncludes(
      migrations,
      "grant update (name) on table public.chat_rooms to authenticated",
    );
  },
);

Deno.test(
  "legacy memberships without creator provenance fail closed",
  async () => {
    const migrations = normalizeSql(await readMigrations());

    assertIncludes(
      migrations,
      "lock table public.chat_room_members in share row exclusive mode",
    );
    assertIncludes(
      migrations,
      "lock table public.chat_rooms in share row exclusive mode",
    );
    assertIncludes(
      migrations,
      "lock table public.chat_messages in share row exclusive mode",
    );
    assertNotIncludes(migrations, "with legacy_member_candidates as");
    assertIncludes(
      migrations,
      "create table if not exists private.invalid_dm_room_pair_audit",
    );
    assertIncludes(
      migrations,
      "update public.chat_rooms room set dm_pair_key = null from private.invalid_dm_room_pair_audit audit",
    );
    assertIncludes(
      migrations,
      "create table if not exists private.quarantined_chat_room_members",
    );
    assertIncludes(
      migrations,
      "insert into private.quarantined_chat_room_members",
    );
    assertIncludes(
      migrations,
      "delete from public.chat_room_members member using public.chat_rooms room",
    );
    assertIncludes(
      migrations,
      "room.type = 'dm' and room.dm_pair_key is not null and ( member.user_id = room.created_by or ( member.role = 'member' and room.dm_pair_key = public.build_dm_pair_key(room.created_by, member.user_id)",
    );
    assertIncludes(
      migrations,
      "left join private.invalid_dm_room_pair_audit invalid_pair on invalid_pair.room_id = room.id where invalid_pair.room_id is not null or not ( ( room.type = 'group' and member.user_id = room.created_by ) or ( room.type = 'dm' and room.dm_pair_key is not null",
    );
    assertIncludes(
      migrations,
      "exists ( select 1 from private.invalid_dm_room_pair_audit invalid_pair where invalid_pair.room_id = room.id ) or not ( ( room.type = 'group' and member.user_id = room.created_by ) or ( room.type = 'dm' and room.dm_pair_key is not null",
    );
    assertNotIncludes(
      migrations,
      "room.type = 'group' and member.role = 'member' and private.is_friend(room.created_by, member.user_id)",
    );
  },
);

Deno.test("chat room inserts cannot reserve another pair's DM key", async () => {
  const migrations = normalizeSql(await readMigrations());
  const policy = lastPolicyBlock(
    migrations,
    "chat_rooms_insert_own",
    "chat_rooms",
  );

  assertIncludes(policy, "created_by = (select auth.uid())");
  assertIncludes(policy, "type = 'group' and dm_pair_key is null");
  assertIncludes(policy, "type = 'dm' and dm_pair_key is not null");
  assertIncludes(
    policy,
    "split_part(dm_pair_key, ':', 1) = (select auth.uid())::text",
  );
});

Deno.test(
  "chat room members can update only their read marker",
  async () => {
    const migrations = normalizeSql(await readMigrations());

    assertIncludes(
      migrations,
      "revoke update on table public.chat_room_members from authenticated",
    );
    assertIncludes(
      migrations,
      "grant update (last_read_at) on table public.chat_room_members to authenticated",
    );

    const policy = lastPolicyBlock(
      migrations,
      "chat_room_members_update_self",
      "chat_room_members",
    );
    assertIncludes(policy, "for update to authenticated");
    assertIncludes(policy, "using (user_id = auth.uid())");
    assertIncludes(policy, "with check (user_id = auth.uid())");
  },
);

Deno.test(
  "chat message updates cannot rewrite their room or sender envelope",
  async () => {
    const migrations = normalizeSql(await readMigrations());

    assertIncludes(
      migrations,
      "revoke update on table public.chat_messages from authenticated",
    );
    assertIncludes(
      migrations,
      "grant update (content, deleted_at) on table public.chat_messages to authenticated",
    );
  },
);

async function readMigrations() {
  const directory = new URL("../../migrations/", import.meta.url);
  const fileNames: string[] = [];

  for await (const entry of Deno.readDir(directory)) {
    if (entry.isFile && entry.name.endsWith(".sql")) {
      fileNames.push(entry.name);
    }
  }

  const migrations = await Promise.all(
    fileNames.sort().map((fileName) =>
      Deno.readTextFile(new URL(fileName, directory))
    ),
  );

  return migrations.join("\n");
}

function lastPolicyBlock(
  source: string,
  policyName: string,
  tableName: string,
) {
  const marker = `create policy ${policyName} on public.${tableName} `;
  const start = source.lastIndexOf(marker);
  if (start === -1) {
    throw new Error(
      `Expected migrations to create policy ${policyName} on ${tableName}`,
    );
  }

  const end = source.indexOf(";", start);
  if (end === -1) {
    throw new Error(`Expected policy ${policyName} to end with a semicolon`);
  }

  return source.slice(start, end);
}

function normalizeSql(source: string) {
  return source.toLowerCase().replace(/\s+/g, " ").trim();
}

function assertIncludes(source: string, expected: string) {
  if (!source.includes(expected)) {
    throw new Error(`Expected SQL to include ${JSON.stringify(expected)}`);
  }
}

function assertNotIncludes(source: string, unexpected: string) {
  if (source.includes(unexpected)) {
    throw new Error(`Expected SQL not to include ${JSON.stringify(unexpected)}`);
  }
}
