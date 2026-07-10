// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readMigration(fileName: string) {
  return readFileSync(resolve(`../supabase/migrations/${fileName}`), "utf8");
}

describe("social chat RLS migration contract", () => {
  const base = readMigration("20260527101230_social_chat_invites.sql");
  const creatorSelect = readMigration("20260708215540_fix_chat_room_creator_select.sql");
  const hardening = readMigration("20260709120000_harden_social_chat_membership_rls.sql");

  it("keeps chat room inserts owner-scoped", () => {
    expect(base).toMatch(/create policy chat_rooms_insert_own/i);
    expect(base).toMatch(/for insert[\s\S]*with check \(created_by = auth\.uid\(\)\)/i);
  });

  it("allows room creators to read their newly inserted chat room", () => {
    expect(creatorSelect).toMatch(/create policy chat_rooms_select_creator/i);
    expect(creatorSelect).toMatch(/on public\.chat_rooms/i);
    expect(creatorSelect).toMatch(/for select/i);
    expect(creatorSelect).toMatch(/to authenticated/i);
    expect(creatorSelect).toMatch(/using \(created_by = \(select auth\.uid\(\)\)\)/i);
  });

  it("does not bypass RLS or loosen membership writes", () => {
    expect(creatorSelect).not.toMatch(/disable row level security/i);
    expect(creatorSelect).not.toMatch(/service_role/i);
    expect(creatorSelect).not.toMatch(/or true/i);
    expect(base).toMatch(/create policy chat_room_members_insert_self_or_friend/i);
    expect(base).toMatch(/public\.is_friend\(auth\.uid\(\), user_id\)/i);
  });

  it("binds direct-message membership to the immutable DM pair", () => {
    expect(hardening).toMatch(/room\.type = 'dm'/i);
    expect(hardening).toMatch(
      /room\.dm_pair_key = public\.build_dm_pair_key\(\(select auth\.uid\(\)\), user_id\)/i,
    );
    expect(hardening).toMatch(/role = 'owner'/i);
    expect(hardening).toMatch(/role = 'member'/i);
    expect(hardening).toMatch(/revoke update on table public\.chat_rooms from authenticated/i);
    expect(hardening).toMatch(
      /grant update \(name\) on table public\.chat_rooms to authenticated/i,
    );
  });

  it("quarantines legacy memberships that lack creator provenance", () => {
    expect(hardening).toMatch(/lock table public\.chat_room_members in share row exclusive mode/i);
    expect(hardening).toMatch(/lock table public\.chat_rooms in share row exclusive mode/i);
    expect(hardening).toMatch(/lock table public\.chat_messages in share row exclusive mode/i);
    expect(hardening).not.toMatch(/with legacy_member_candidates as/i);
    expect(hardening).toMatch(/private\.legacy_group_membership_audit/i);
    expect(hardening).toMatch(/private\.invalid_dm_room_pair_audit/i);
    expect(hardening).toMatch(/private\.quarantined_chat_room_members/i);
    expect(hardening).toMatch(/insert into private\.quarantined_chat_room_members/i);
    expect(hardening).toMatch(
      /delete from public\.chat_room_members member\s+using public\.chat_rooms room/i,
    );
    expect(hardening).toMatch(
      /left join private\.invalid_dm_room_pair_audit invalid_pair on invalid_pair\.room_id = room\.id/i,
    );
    expect(hardening).toMatch(
      /exists \(\s*select 1\s+from private\.invalid_dm_room_pair_audit invalid_pair\s+where invalid_pair\.room_id = room\.id/i,
    );
    expect(hardening).toMatch(
      /room\.type = 'group'\s+and member\.user_id = room\.created_by[\s\S]*room\.type = 'dm'\s+and room\.dm_pair_key is not null\s+and \(\s*member\.user_id = room\.created_by/i,
    );
    expect(hardening).not.toMatch(
      /room\.type = 'group'\s+and member\.role = 'member'\s+and private\.is_friend/i,
    );
  });

  it("prevents users from reserving another pair's direct-message key", () => {
    expect(hardening).toMatch(/drop policy if exists chat_rooms_insert_own/i);
    expect(hardening).toMatch(/type = 'group'\s+and dm_pair_key is null/i);
    expect(hardening).toMatch(/type = 'dm'\s+and dm_pair_key is not null/i);
    expect(hardening).toMatch(
      /split_part\(dm_pair_key, ':', 1\) = \(select auth\.uid\(\)\)::text/i,
    );
  });
});
