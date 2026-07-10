// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("../supabase/migrations/20260709130000_atomic_social_links_activity_status.sql"),
  "utf8",
);

describe("atomic social links and activity migration contract", () => {
  it("replaces only the authenticated user's social links inside one RPC transaction", () => {
    expect(migration).toMatch(/create or replace function public\.replace_my_social_links/i);
    expect(migration).toMatch(/security invoker/i);
    expect(migration).toMatch(/current_user_id uuid := auth\.uid\(\)/i);
    expect(migration).toMatch(
      /pg_advisory_xact_lock\(hashtextextended\(current_user_id::text, 0\)\)/i,
    );
    expect(migration).toMatch(/jsonb_array_length\(normalized_links\) > 16/i);
    expect(migration).toMatch(
      /delete from public\.user_social_links[\s\S]*user_id = current_user_id/i,
    );
    expect(migration).toMatch(
      /insert into public\.user_social_links[\s\S]*current_user_id[\s\S]*jsonb_array_elements/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.replace_my_social_links\(jsonb\) from public/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.replace_my_social_links\(jsonb\) to authenticated/i,
    );
  });

  it("allows non-empty status posts while preserving trusted achievement ingestion", () => {
    expect(migration).toMatch(
      /activity_feed_type_check[\s\S]*'status'[\s\S]*'achievement_unlocked'/i,
    );
    expect(migration).toMatch(
      /activity_feed_status_text_check[\s\S]*metadata ->> 'text'[\s\S]*between 1 and 1000/i,
    );
    expect(migration).toMatch(
      /create policy activity_feed_insert_own[\s\S]*type in \('status', 'game_start', 'game_stop', 'screenshot_taken'\)/i,
    );
    expect(migration).not.toMatch(
      /activity_feed_insert_own[\s\S]*type in \([^)]*achievement_unlocked/i,
    );
  });

  it("exposes only the caller's own friendship lookup", () => {
    expect(migration).toMatch(/function public\.is_current_user_friend\(profile_user_id uuid\)/i);
    expect(migration).toMatch(
      /friendship\.requester_id = auth\.uid\(\)[\s\S]*friendship\.addressee_id = profile_user_id/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.is_current_user_friend\(uuid\) from public/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.is_current_user_friend\(uuid\) to authenticated/i,
    );
  });
});
