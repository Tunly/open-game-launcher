// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("../supabase/migrations/20260615143000_public_screenshot_feed_moderation.sql"),
  "utf8",
);

describe("public screenshot feed moderation migration contract", () => {
  it("stages moderation status, reports, audit, and ranked public feed RPC", () => {
    expect(migration).toContain("alter column is_public set default false");
    expect(migration).toContain("add column if not exists moderation_status");
    expect(migration).toContain("add column if not exists report_count");
    expect(migration).toContain("create table if not exists public.screenshot_reports");
    expect(migration).toContain("create table if not exists public.screenshot_moderation_audit");
    expect(migration).toContain("create or replace function public.report_screenshot");
    expect(migration).toContain("create or replace function public.review_screenshot");
    expect(migration).toContain(
      "create or replace function public.list_public_screenshot_feed_ranked",
    );
    expect(migration).toContain("order by count(like_row.user_id) desc, shot.created_at desc");
  });

  it("keeps public feed rows approved-only before likes, storage, and ranking can see them", () => {
    expect(migration).toContain("shot.is_public = true");
    expect(migration).toContain("shot.moderation_status = 'approved'");
    expect(migration).toContain("(is_public = true and moderation_status = 'approved')");
    expect(migration).toContain("drop policy if exists screenshots_read_public");
    expect(migration).toContain("drop policy if exists screenshot_likes_read_visible");
    expect(migration).toContain("drop policy if exists screenshot_likes_insert_visible_own");
    expect(migration).toContain("drop policy if exists screenshots_storage_read_visible");
    expect(migration).toContain("screenshots_public_feed_rank_idx");
  });

  it("keeps moderation actions behind service role and writes audit evidence", () => {
    expect(migration).toContain("Screenshot review requires service role");
    expect(migration).toContain("grant execute on function public.review_screenshot");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("Screenshot moderation fields require service role review");
    expect(migration).toContain("insert into public.screenshot_moderation_audit");
    expect(migration).toContain("when active_report_count >= 3");
    expect(migration).toContain("'reported-by-community'");
    expect(migration).toContain("Screenshot report rate limit exceeded");
  });
});
