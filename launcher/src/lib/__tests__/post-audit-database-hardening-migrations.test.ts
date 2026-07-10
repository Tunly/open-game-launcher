// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readMigration(name: string) {
  return readFileSync(resolve(`../supabase/migrations/${name}`), "utf8");
}

describe("post-audit database hardening migrations", () => {
  it("restores only provable chat memberships without deleting rooms or messages", () => {
    const migration = readMigration("20260709150000_reconcile_quarantined_chat_members.sql");

    expect(migration).toMatch(/having count\(\*\) = 2/i);
    expect(migration).toMatch(/friendship\.status = 'accepted'/i);
    expect(migration).toMatch(/build_dm_pair_key/i);
    expect(migration).toMatch(/insert into public\.chat_room_members/i);
    expect(migration).toMatch(
      /from private\.quarantined_chat_room_members quarantined[\s\S]*quarantined\.user_id = room\.created_by/i,
    );
    expect(migration).not.toMatch(/from public\.chat_rooms room\s+where room\.type = 'group'/i);
    expect(migration).toMatch(
      /delete from private\.quarantined_chat_room_members[\s\S]*exists \([\s\S]*public\.chat_room_members/i,
    );
    expect(migration).not.toMatch(/delete from public\.chat_rooms/i);
    expect(migration).not.toMatch(/delete from public\.chat_messages/i);
  });

  it("audits ambiguous group-owner memberships without mutating membership", () => {
    const migration = readMigration("20260710120000_revoke_unproven_group_creator_memberships.sql");

    expect(migration).toMatch(/private\.unproven_group_creator_membership_audit/i);
    expect(migration).toMatch(/member\.joined_at = room\.created_at/i);
    expect(migration).toMatch(/lock table private\.quarantined_chat_room_members in share mode/i);
    expect(migration).toMatch(/not exists \([\s\S]*private\.quarantined_chat_room_members/i);
    expect(migration).not.toMatch(/delete from public\.chat_room_members/i);
    expect(migration).not.toMatch(/delete from public\.chat_rooms/i);
    expect(migration).not.toMatch(/delete from public\.chat_messages/i);
  });

  it("requires private operator review for ambiguous group-owner evidence", () => {
    const migration = readMigration("20260710123000_mark_group_creator_memberships_for_review.sql");

    expect(migration).toMatch(
      /review_status in \('pending', 'confirmed_restore', 'confirmed_revoke'\)/i,
    );
    expect(migration).toMatch(/pending private review/i);
    expect(migration).toMatch(
      /revoke all on table private\.unproven_group_creator_membership_audit/i,
    );
    expect(migration).not.toMatch(/insert into public\.chat_room_members/i);
    expect(migration).not.toMatch(/delete from public\.chat_room_members/i);
  });

  it("verifies the removed cloud-save state under an object-table lock", () => {
    const migration = readMigration("20260709151000_verify_removed_cloud_save_state.sql");

    expect(migration).toMatch(/lock table storage\.objects in share row exclusive mode/i);
    expect(migration).toMatch(/bucket_id = 'game-saves'/i);
    expect(migration).toMatch(/to_regclass\('public\.user_cloud_save_files'\)/i);
    expect(migration).toMatch(/to_regclass\('public\.user_cloud_save_sets'\)/i);
    expect(migration).not.toMatch(/delete from storage\.objects/i);
  });

  it("makes the social-link RPC the only authenticated write path", () => {
    const migration = readMigration("20260709160000_harden_social_link_writes.sql");

    expect(migration).toMatch(/char_length\(url\) between 1 and 2048/i);
    expect(migration).toMatch(/url ~\* '\^https\?:\/\//i);
    expect(migration).toMatch(
      /alter function public\.replace_my_social_links\(jsonb\) security definer/i,
    );
    expect(migration).toMatch(
      /revoke insert, update, delete on table public\.user_social_links from authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.replace_my_social_links\(jsonb\) to authenticated/i,
    );
  });

  it("bounds social-link replacements without undoing URL or privilege hardening", () => {
    const migration = readMigration("20260710121000_limit_social_link_replacements.sql");

    expect(migration).toMatch(/jsonb_array_length\(normalized_links\) > 16/i);
    expect(migration).toMatch(/char_length\(btrim\(link ->> 'url'\)\) not between 1 and 2048/i);
    expect(migration).toMatch(/btrim\(link ->> 'url'\) !~\* '\^https\?:\/\//i);
    expect(migration).toMatch(
      /create or replace function public\.replace_my_social_links[\s\S]*security definer/i,
    );
    expect(migration).toMatch(
      /revoke insert, update, delete on table public\.user_social_links[\s\S]*authenticated/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.replace_my_social_links\(jsonb\)[\s\S]*authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.replace_my_social_links\(jsonb\)[\s\S]*authenticated/i,
    );
  });
});
