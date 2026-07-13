import {
  assertMatch,
  assertNotMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const relationshipMigration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260711193000_bind_social_relationship_helpers_to_auth.sql",
    import.meta.url,
  ),
);
const inviteMigration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260711194000_limit_game_invite_status_updates.sql",
    import.meta.url,
  ),
);

Deno.test("social relationship RPCs are authenticated and caller-bound", () => {
  assertMatch(relationshipMigration, /auth\.uid\(\) is null then false/i);
  assertMatch(
    relationshipMigration,
    /auth\.uid\(\) <> user_a and auth\.uid\(\) <> user_b then false/i,
  );
  assertMatch(relationshipMigration, /auth\.uid\(\) is null then true/i);
  assertMatch(
    relationshipMigration,
    /auth\.uid\(\) <> user_a and auth\.uid\(\) <> user_b then true/i,
  );
  assertMatch(
    relationshipMigration,
    /revoke execute on function public\.is_friend\(uuid, uuid\) from public, anon/i,
  );
  assertMatch(
    relationshipMigration,
    /revoke execute on function public\.is_blocked\(uuid, uuid\) from public, anon/i,
  );
  assertNotMatch(relationshipMigration, /grant execute[\s\S]*?to anon/i);
});

Deno.test("game invite participants can update only status", () => {
  assertMatch(
    inviteMigration,
    /revoke update on table public\.game_invites from authenticated/i,
  );
  assertMatch(
    inviteMigration,
    /grant update \(status\) on table public\.game_invites to authenticated/i,
  );
  assertNotMatch(
    inviteMigration,
    /grant update on table public\.game_invites/i,
  );
  assertMatch(
    inviteMigration,
    /actor_id = old\.receiver_id and new\.status in \('accepted', 'declined'\)/i,
  );
  assertMatch(
    inviteMigration,
    /actor_id = old\.sender_id and new\.status = 'cancelled'/i,
  );
  assertMatch(inviteMigration, /old\.status <> 'pending'/i);
  assertMatch(
    inviteMigration,
    /before update on public\.game_invites[\s\S]*?execute function private\.enforce_game_invite_status_transition/i,
  );
});
