// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("../supabase/migrations/20260716160000_verify_provider_account_links.sql"),
  "utf8",
);

describe("verified Steam account migration contract", () => {
  it("keeps ownership proof and replay nonces server-controlled", () => {
    expect(migration).toMatch(/create table if not exists public\.provider_account_verifications/i);
    expect(migration).toMatch(
      /create table if not exists public\.provider_identity_assertion_nonces/i,
    );
    expect(migration).toMatch(
      /revoke all on table public\.provider_account_verifications from anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant select on table public\.provider_account_verifications to authenticated/i,
    );
    expect(migration).toMatch(
      /revoke all on table public\.provider_identity_assertion_nonces from anon, authenticated/i,
    );
    expect(migration).toMatch(/unique \(platform, response_nonce\)/i);
  });

  it("links account, proof, and nonce atomically through a service-role-only RPC", () => {
    expect(migration).toMatch(
      /create or replace function public\.link_verified_steam_account\([\s\S]*?security definer/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.link_verified_steam_account\([\s\S]*?from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.link_verified_steam_account\([\s\S]*?to service_role/i,
    );
    expect(migration).toMatch(/insert into public\.provider_identity_assertion_nonces/i);
    expect(migration).toMatch(/insert into public\.provider_account_verifications/i);
  });

  it("blocks direct authenticated Steam identity writes", () => {
    expect(migration).toMatch(
      /create or replace function public\.block_unverified_steam_account_write/i,
    );
    expect(migration).toMatch(/auth\.role\(\) = 'authenticated'/i);
    expect(migration).toMatch(
      /create trigger block_unverified_steam_account_write[\s\S]*?before insert or update on public\.platform_accounts/i,
    );
  });

  it("pins the verification method to steam_openid", () => {
    expect(migration).toMatch(/verification_method = 'steam_openid'/i);
    expect(migration).not.toMatch(/steam_openid_2/);
  });
});
