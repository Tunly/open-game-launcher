// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("../supabase/migrations/20260711235900_ensure_direct_message_room_rpc.sql"),
  "utf8",
);
const normalized = migration.toLowerCase().replace(/\s+/g, " ").trim();

describe("direct-message room RPC migration contract", () => {
  it("binds the only participant input to the authenticated user", () => {
    expect(normalized).toContain(
      "create or replace function public.ensure_direct_room(friend_id_input uuid)",
    );
    expect(normalized).toContain("current_user_id uuid := auth.uid()");
    expect(normalized).toContain("if current_user_id is null then");
    expect(normalized).toContain("if friend_id_input is null then");
    expect(normalized).toContain("if friend_id_input = current_user_id then");
    expect(normalized).not.toMatch(/(?:created_by|member_ids|members|room_id|role|user_ids)_input/);
  });

  it("requires an accepted friendship and rejects blocks in either direction", () => {
    expect(normalized).toContain("from public.user_blocks as user_block");
    expect(normalized).toContain(
      "user_block.blocker_id = current_user_id and user_block.blocked_id = friend_id_input",
    );
    expect(normalized).toContain(
      "user_block.blocker_id = friend_id_input and user_block.blocked_id = current_user_id",
    );
    expect(normalized).toContain("from public.friendships as friendship");
    expect(normalized).toContain("friendship.status = 'accepted'");
    expect(normalized).toContain(
      "friendship.requester_id = current_user_id and friendship.addressee_id = friend_id_input",
    );
    expect(normalized).toContain(
      "friendship.requester_id = friend_id_input and friendship.addressee_id = current_user_id",
    );
  });

  it("locks and repairs an existing canonical room instead of returning an orphan", () => {
    const roomLookup = normalized.indexOf("select room.* into direct_room");
    const roomInsert = normalized.indexOf("insert into public.chat_rooms as room");
    const membershipInsert = normalized.indexOf(
      "insert into public.chat_room_members as existing_member",
    );

    expect(roomLookup).toBeGreaterThan(-1);
    expect(roomLookup).toBeLessThan(roomInsert);
    expect(roomInsert).toBeLessThan(membershipInsert);
    expect(normalized).toContain(
      "where room.type = 'dm' and room.dm_pair_key = canonical_pair_key",
    );
    expect(normalized).toContain("limit 1 for update");
    expect(normalized).toContain(
      "direct_room.id, current_user_id, case when direct_room.created_by = current_user_id then 'owner' else 'member' end",
    );
    expect(normalized).toContain(
      "direct_room.id, friend_id_input, case when direct_room.created_by = friend_id_input then 'owner' else 'member' end",
    );
    expect(normalized).toContain(
      "on conflict (room_id, user_id) do update set role = excluded.role where existing_member.role is distinct from excluded.role",
    );
  });

  it("serializes concurrent creation and converges on one idempotent room", () => {
    expect(normalized).toContain(
      "perform pg_catalog.pg_advisory_xact_lock( pg_catalog.hashtextextended(canonical_pair_key, 0) )",
    );
    expect(normalized).toContain(
      "on conflict (dm_pair_key) where type = 'dm' and dm_pair_key is not null do nothing",
    );
    expect(normalized.match(/limit 1 for update/g)).toHaveLength(2);
    expect(normalized).toContain("return next direct_room");
  });

  it("keeps the definer boundary narrow without changing hardened chat RLS", () => {
    expect(normalized).toMatch(
      /returns setof public\.chat_rooms language plpgsql security definer volatile set search_path = public, pg_temp/,
    );
    expect(normalized).toContain(
      "revoke all on function public.ensure_direct_room(uuid) from public, anon, authenticated",
    );
    expect(normalized).toContain(
      "grant execute on function public.ensure_direct_room(uuid) to authenticated",
    );
    expect(normalized).not.toContain("service_role");
    expect(normalized).not.toContain("disable row level security");
    expect(normalized).not.toMatch(/(?:drop|create) policy/);
    expect(normalized).not.toMatch(/alter table public\.chat_(?:rooms|room_members)/);
    expect(normalized.startsWith("begin;")).toBe(true);
    expect(normalized.endsWith("commit;")).toBe(true);
  });
});
