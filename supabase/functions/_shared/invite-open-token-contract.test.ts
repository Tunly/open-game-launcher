import {
  assertMatch,
  assertNotMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const redeemMigration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260610161000_custom_link_unknown_recipient.sql",
    import.meta.url,
  ),
);
const triggerFixMigration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260717121000_fix_open_share_token_redeem.sql",
    import.meta.url,
  ),
);

Deno.test("open share-token redemption may atomically bind only the caller", () => {
  assertMatch(
    redeemMigration,
    /set status = 'accepted',[\s\S]*?receiver_id = current_user_id/i,
  );
  assertMatch(
    triggerFixMigration,
    /old\.receiver_id is null[\s\S]*?new\.receiver_id = actor_id[\s\S]*?old\.status = 'pending'[\s\S]*?new\.status = 'accepted'/i,
  );
  assertMatch(
    triggerFixMigration,
    /if binds_open_receiver then[\s\S]*?return new/i,
  );
  assertNotMatch(
    triggerFixMigration,
    /grant update \([^)]*receiver_id[^)]*\) on table public\.game_invites to authenticated/i,
  );
});

Deno.test("all other invite receiver mutations remain immutable", () => {
  assertMatch(
    triggerFixMigration,
    /new\.receiver_id is distinct from old\.receiver_id and not binds_open_receiver/i,
  );
  assertMatch(
    triggerFixMigration,
    /raise exception 'Game invite content is immutable after creation'/i,
  );
});
