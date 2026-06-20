// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("../supabase/migrations/20260612130000_community_artwork.sql"),
  "utf8",
);

describe("community artwork migration contract", () => {
  it("stages hosted artwork storage, approved-feed listing, votes, reports, review, and ranking", () => {
    expect(migration).toContain("insert into storage.buckets");
    expect(migration).toContain("'game-artwork'");
    expect(migration).toContain("create table if not exists public.community_artwork_items");
    expect(migration).toContain("create table if not exists public.community_artwork_votes");
    expect(migration).toContain("create table if not exists public.community_artwork_reports");
    expect(migration).toContain("create table if not exists private.community_artwork_moderators");
    expect(migration).toContain("create table if not exists public.community_artwork_scan_results");
    expect(migration).toContain(
      "create table if not exists public.community_artwork_moderation_audit",
    );
    expect(migration).toContain("create or replace function public.list_community_artwork");
    expect(migration).toContain("create or replace function public.vote_community_artwork");
    expect(migration).toContain("create or replace function public.report_community_artwork");
    expect(migration).toContain(
      "create or replace function public.list_community_artwork_moderation_queue",
    );
    expect(migration).toContain("create or replace function public.scan_community_artwork");
    expect(migration).toContain("create or replace function public.review_community_artwork");
    expect(migration).toContain("order by item.vote_score desc, item.download_count desc");
  });

  it("keeps hosted artwork writes behind RLS, owner folders, and moderation guardrails", () => {
    expect(migration).toContain(
      "alter table public.community_artwork_items enable row level security",
    );
    expect(migration).toContain("community_artwork_items_insert_pending_own");
    expect(migration).toContain("moderation_status = 'pending'");
    expect(migration).toContain("(storage.foldername(name))[1] = auth.uid()::text");
    expect(migration).toContain("item.submitter_id <> auth.uid()");
    expect(migration).toContain("active_report_count >= 3");
    expect(migration).toContain("Community artwork report rate limit exceeded");
  });

  it("keeps admin moderation review behind service-role and writes audit evidence", () => {
    expect(migration).toContain(
      "grant all on private.community_artwork_moderators to service_role",
    );
    expect(migration).toContain(
      "alter table public.community_artwork_moderation_audit enable row level security",
    );
    expect(migration).toContain(
      "alter table public.community_artwork_scan_results enable row level security",
    );
    expect(migration).toContain(
      "revoke execute on function public.list_community_artwork_moderation_queue(text, integer)",
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain(
      "grant execute on function public.list_community_artwork_moderation_queue(text, integer)",
    );
    expect(migration).toContain(
      "grant execute on function public.review_community_artwork(uuid, text, text, uuid)",
    );
    expect(migration).toContain(
      "grant execute on function public.scan_community_artwork(uuid, text, text, text, text[], jsonb)",
    );
    expect(migration).toContain("to service_role");
    expect(migration).toContain("Community artwork reviewer is not active");
    expect(migration).toContain(
      "Community artwork scan verdict must be passed, needs_review, or blocked",
    );
    expect(migration).toContain("Community artwork scan metadata must be a JSON object");
    expect(migration).toContain("when normalized_verdict = 'blocked' then 'rejected'");
    expect(migration).toContain(
      "when normalized_verdict = 'needs_review' and existing.moderation_status = 'approved' then 'pending'",
    );
    expect(migration).toContain("insert into public.community_artwork_scan_results");
    expect(migration).toContain("insert into public.community_artwork_moderation_audit");
    expect(migration).toContain("scan_result_id");
    expect(migration).toContain("last_scan_verdict text");
    expect(migration).toContain("last_scanned_at timestamptz");
    expect(migration).toContain("left join lateral (\n    select scan.verdict, scan.created_at");
    expect(migration).toContain("order by scan.created_at desc, scan.id desc");
    expect(migration).toContain("Community artwork must pass content scan before approval");
    expect(migration).toContain("latest_scan.verdict <> 'passed'");
    expect(migration).toContain("approved_at = case when normalized_status = 'approved'");
    expect(migration).toContain("rejected_at = case when normalized_status = 'rejected'");
  });
});
