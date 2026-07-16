import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "../supabase/migrations/20260716150000_activity_comment_delete_realtime.sql",
  ),
  "utf8",
);

describe("activity comment delete realtime migration", () => {
  it("captures the deleted comment and its parent in a minimal event row", () => {
    expect(migration).toMatch(/create table if not exists public\.activity_comment_deletions/i);
    expect(migration).toMatch(/comment_id uuid not null/i);
    expect(migration).toMatch(/activity_id uuid not null/i);
    expect(migration).toMatch(/function public\.capture_activity_comment_deletion\(\)/i);
    expect(migration).toMatch(
      /insert into public\.activity_comment_deletions \(comment_id, activity_id\)[\s\S]*values \(old\.id, old\.activity_id\)/i,
    );
    expect(migration).toMatch(
      /after delete on public\.activity_comments[\s\S]*execute function public\.capture_activity_comment_deletion\(\)/i,
    );
  });

  it("keeps event writes trigger-only and reads scoped to visible activities", () => {
    expect(migration).toMatch(
      /alter table public\.activity_comment_deletions enable row level security/i,
    );
    expect(migration).toMatch(
      /revoke all on table public\.activity_comment_deletions from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant select on table public\.activity_comment_deletions to authenticated/i,
    );
    expect(migration).toMatch(
      /activity_comment_deletions_select_visible[\s\S]*deleted_at >= now\(\) - interval '7 days'[\s\S]*public\.can_view_activity\(activity_id\)/i,
    );
    expect(migration).toMatch(
      /function public\.capture_activity_comment_deletion\(\)[\s\S]*security definer[\s\S]*set search_path = public, pg_temp/i,
    );
    expect(migration).toMatch(
      /delete from public\.activity_comment_deletions[\s\S]*deleted_at < now\(\) - interval '7 days'/i,
    );
  });

  it("publishes deletion events through Supabase Realtime", () => {
    expect(migration).toMatch(
      /alter publication supabase_realtime add table public\.activity_comment_deletions/i,
    );
  });
});
