// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(fileName: string) {
  return readFileSync(resolve(`../supabase/migrations/${fileName}`), "utf8");
}

describe("share token migration contract", () => {
  const base = readMigration("20260610153000_custom_link_share_tokens.sql");
  const envelope = readMigration("20260610160000_custom_link_share_token_envelope.sql");
  const unknownRecipient = readMigration("20260610161000_custom_link_unknown_recipient.sql");
  const hostedReplayProof = readMigration("20260613113000_custom_link_hosted_replay_proof.sql");

  it("keeps plaintext share tokens out of client-readable tables", () => {
    expect(base).toContain("token_hash text not null unique");
    expect(base).toContain("token_hint text not null");
    expect(base).not.toMatch(/token\s+text\s+not null/i);
    expect(base).toMatch(/alter table public\.share_tokens enable row level security/i);
    expect(base).toMatch(/revoke all on public\.share_tokens from public, anon, authenticated/i);
    expect(base).toMatch(/grant all on public\.share_tokens to service_role/i);
    expect(base).toMatch(
      /create policy share_tokens_select_owner[\s\S]*created_by = auth\.uid\(\)/i,
    );
  });

  it("requires signed envelopes for hosted resolve and redeem flows", () => {
    expect(envelope).toMatch(/create schema if not exists private/i);
    expect(envelope).toMatch(/create table if not exists private\.share_token_signing_keys/i);
    expect(envelope).toMatch(
      /revoke all on private\.share_token_signing_keys from public, anon, authenticated/i,
    );
    expect(envelope).toMatch(/create or replace function private\.share_token_envelope_is_valid/i);
    expect(envelope).toContain(
      "generated_token := 'ogl_' || generated_signing_input || '.' || generated_signature",
    );
    expect(envelope).toMatch(
      /where private\.share_token_envelope_is_valid\(token_input\)[\s\S]*st\.token_hash = encode\(digest\(btrim\(coalesce\(token_input, ''\)\), 'sha256'\), 'hex'\)/i,
    );
    expect(envelope).toMatch(/if not private\.share_token_envelope_is_valid\(token_input\) then/i);
  });

  it("allows open-recipient links while preserving one-use authenticated claim rules", () => {
    expect(unknownRecipient).toMatch(/alter column receiver_id drop not null/i);
    expect(unknownRecipient).toMatch(/receiver_id is null or sender_id <> receiver_id/i);
    expect(unknownRecipient).toMatch(/create policy game_invites_insert_friend_or_open_link/i);
    expect(unknownRecipient).toMatch(/receiver_id is null[\s\S]*or public\.is_friend/i);
    expect(unknownRecipient).toMatch(
      /if not private\.share_token_envelope_is_valid\(token_input\) then/i,
    );
    expect(unknownRecipient).toMatch(
      /public\.is_blocked\(invite_row\.sender_id, current_user_id\)/i,
    );
    expect(unknownRecipient).toMatch(/set status = 'accepted',\s+receiver_id = current_user_id/i);
    expect(unknownRecipient).toMatch(/sender_id <> current_user_id/i);
    expect(unknownRecipient).toMatch(
      /(?:invite\.)?receiver_id is null or (?:invite\.)?receiver_id = current_user_id/i,
    );
    expect(unknownRecipient).toMatch(/set uses_count = uses_count \+ 1/i);
  });

  it("keeps replay denial enforceable by resolve and redeem guards", () => {
    expect(envelope).toMatch(/st\.uses_count < st\.max_uses/i);
    expect(envelope).toMatch(/gi\.status = 'pending'/i);
    expect(unknownRecipient).toMatch(/for update/i);
    expect(unknownRecipient).toMatch(/token_row\.uses_count >= token_row\.max_uses/i);
    expect(unknownRecipient).toMatch(
      /invite\.receiver_id is null or invite\.receiver_id = current_user_id/i,
    );
    expect(unknownRecipient).toMatch(/invite\.status = 'pending'/i);
  });

  it("adds a sanitized authenticated hosted replay proof RPC", () => {
    expect(hostedReplayProof).toMatch(
      /create or replace function public\.prove_share_token_replay_denial\(token_input text\)/i,
    );
    expect(hostedReplayProof).toMatch(/security definer/i);
    expect(hostedReplayProof).toMatch(/if current_user_id is null then/i);
    expect(hostedReplayProof).toMatch(
      /if not private\.share_token_envelope_is_valid\(token_input\) then/i,
    );
    expect(hostedReplayProof).toMatch(
      /st\.token_hash = encode\(digest\(btrim\(coalesce\(token_input, ''\)\), 'sha256'\), 'hex'\)/i,
    );
    expect(hostedReplayProof).toMatch(/token_row\.created_by is distinct from current_user_id/i);
    expect(hostedReplayProof).toMatch(/invite_row\.receiver_id is distinct from current_user_id/i);
    expect(hostedReplayProof).toMatch(/token_row\.uses_count >= token_row\.max_uses/i);
    expect(hostedReplayProof).toMatch(/replay_denied boolean/i);
    expect(hostedReplayProof).not.toMatch(/token_hash\s*,/i);
    expect(hostedReplayProof).not.toMatch(/sender_id\s*,|receiver_id\s*,/i);
  });

  it("exposes only the intended RPC surface", () => {
    expect(envelope).toMatch(
      /revoke execute on function public\.create_game_invite_share_token\(uuid, text, integer\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(envelope).toMatch(
      /grant execute on function public\.create_game_invite_share_token\(uuid, text, integer\)[\s\S]*to authenticated/i,
    );
    expect(envelope).toMatch(
      /grant execute on function public\.resolve_share_token\(text\)[\s\S]*to anon, authenticated/i,
    );
    expect(unknownRecipient).toMatch(
      /grant execute on function public\.redeem_share_token\(text\)[\s\S]*to authenticated/i,
    );
    expect(hostedReplayProof).toMatch(
      /revoke execute on function public\.prove_share_token_replay_denial\(text\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(hostedReplayProof).toMatch(
      /grant execute on function public\.prove_share_token_replay_denial\(text\)[\s\S]*to authenticated/i,
    );
    expect(hostedReplayProof).not.toMatch(
      /grant execute on function public\.prove_share_token_replay_denial\(text\)[\s\S]*to anon/i,
    );
  });
});
