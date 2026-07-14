import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "../supabase/migrations/20260714150000_activity_feed_interactions.sql"),
  "utf8",
);

const lintFixMigration = readFileSync(
  resolve(process.cwd(), "../supabase/migrations/20260714170000_fix_activity_rate_up_lint.sql"),
  "utf8",
);

describe("activity feed interactions migration", () => {
  it("creates cascade-owned reactions and validated comments", () => {
    expect(migration).toMatch(/create table if not exists public\.activity_reactions/i);
    expect(migration).toMatch(/primary key \(activity_id, user_id\)/i);
    expect(migration).toMatch(/reaction = 'rate_up'/i);
    expect(migration).toMatch(/create table if not exists public\.activity_comments/i);
    expect(migration).toMatch(/activity_feed\(id\) on delete cascade/i);
    expect(migration).toMatch(/char_length\(btrim\(body\)\) between 1 and 1000/i);
  });

  it("binds all reads and writes to visible parent activity", () => {
    expect(migration).toMatch(/function public\.can_view_activity/i);
    expect(migration).toMatch(/activity_reactions_select_visible[\s\S]*can_view_activity/i);
    expect(migration).toMatch(
      /activity_reactions_insert_own_visible[\s\S]*user_id = auth\.uid\(\)[\s\S]*can_view_activity/i,
    );
    expect(migration).toMatch(/activity_comments_select_visible[\s\S]*can_view_activity/i);
    expect(migration).toMatch(
      /activity_comments_insert_own_visible[\s\S]*author_id = auth\.uid\(\)[\s\S]*can_view_activity/i,
    );
  });

  it("provides idempotent Rate Up and publishes realtime changes", () => {
    expect(migration).toMatch(/function public\.set_activity_rate_up/i);
    expect(migration).toMatch(/on conflict \(activity_id, user_id\) do nothing/i);
    expect(migration).toMatch(/replica identity full/i);
    expect(migration).toMatch(
      /alter publication supabase_realtime add table public\.activity_reactions/i,
    );
    expect(migration).toMatch(
      /alter publication supabase_realtime add table public\.activity_comments/i,
    );
  });

  it("removes the PL/pgSQL conflict-target ambiguity in a forward migration", () => {
    expect(lintFixMigration).toMatch(/create or replace function public\.set_activity_rate_up/i);
    expect(lintFixMigration).toMatch(
      /on conflict on constraint activity_reactions_pkey do nothing/i,
    );
    expect(lintFixMigration).not.toMatch(/on conflict \(activity_id, user_id\)/i);
  });
});
