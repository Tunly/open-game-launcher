// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function readMigration(fileName: string) {
  return readFileSync(resolve(`../supabase/migrations/${fileName}`), "utf8");
}

function extractPolicy(migration: string, policyName: string) {
  const match = migration.match(
    new RegExp(`create\\s+policy\\s+${policyName}[\\s\\S]*?using\\s*\\(([\\s\\S]*?)\\);`, "i"),
  );
  if (!match) throw new Error(`Missing policy ${policyName}`);
  return match[1];
}

describe("friend merge groups migration contract", () => {
  const universalFriends = readMigration("20260602130000_universal_friends.sql");
  const mergeGroups = readMigration("20260603120000_friend_merge_groups_and_rls.sql");
  const securityInvokerViews = readMigration("20260605100158_fix_security_definer_views.sql");
  const securityAdvisors = readMigration("20260605102120_fix_function_security_advisors.sql");

  it("adds merge groups to friend links and propagates linked-account matches across the group", () => {
    expect(mergeGroups).toMatch(
      /alter table public\.friend_links[\s\S]*add column if not exists merge_group_id uuid/i,
    );
    expect(mergeGroups).toMatch(/create index if not exists friend_links_merge_group_idx/i);
    expect(mergeGroups).toMatch(/create or replace function public\.auto_match_friend_links\(\)/i);
    expect(mergeGroups).toMatch(
      /where platform = new\.platform\s+and platform_friend_id = new\.platform_user_id/i,
    );
    expect(mergeGroups).toMatch(/fl\.merge_group_id is not null/i);
    expect(mergeGroups).toMatch(/direct\.owner_id = fl\.owner_id/i);
    expect(mergeGroups).toMatch(/direct\.merge_group_id = fl\.merge_group_id/i);
    expect(mergeGroups).toMatch(
      /direct\.platform = new\.platform[\s\S]*direct\.platform_friend_id = new\.platform_user_id/i,
    );
    expect(mergeGroups).toMatch(/drop trigger if exists auto_match_on_platform_link/i);
    expect(mergeGroups).toMatch(/after insert or update on public\.platform_accounts/i);
  });

  it("keeps database friend platform checks aligned with app-supported platforms", () => {
    expect(universalFriends).toMatch(
      /platform_accounts[\s\S]*check \(platform in \('steam', 'epic', 'gog', 'ea', 'xbox', 'battlenet', 'ubisoft', 'og'\)\)/i,
    );
    expect(universalFriends).toMatch(
      /friend_links[\s\S]*check \(platform in \('steam', 'epic', 'gog', 'ea', 'xbox', 'battlenet', 'ubisoft', 'og'\)\)/i,
    );
  });

  it("keeps platform account reads owner-or-friend scoped without the old public bypass", () => {
    const policy = extractPolicy(mergeGroups, "platform_accounts_select_own").toLowerCase();

    expect(policy).toContain("user_id = auth.uid()");
    expect(policy).toContain("public.is_friend(auth.uid(), user_id)");
    expect(policy).not.toContain("or true");
  });

  it("keeps merge-group read helpers invoker-safe and auto-match execution revoked", () => {
    expect(securityInvokerViews).toMatch(
      /create or replace view public\.friend_link_merge_groups\s+with \(security_invoker = true\)/i,
    );
    expect(securityInvokerViews).toMatch(/array_agg\(distinct platform\) as platforms/i);
    expect(securityInvokerViews).toMatch(/count\(\*\) as member_count/i);

    expect(securityAdvisors).toMatch(
      /alter function public\.auto_match_friend_links\(\) set search_path = public, extensions, pg_temp/i,
    );
    expect(securityAdvisors).toMatch(
      /revoke execute on function public\.auto_match_friend_links\(\) from public, anon, authenticated/i,
    );
  });
});
