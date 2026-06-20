// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("../supabase/migrations/20260612143000_controller_layout_hosted_contract.sql"),
  "utf8",
);

describe("hosted controller layout migration contract", () => {
  it("stages approved community layout feed, votes, reports, downloads, and moderation audit", () => {
    expect(migration).toContain("add column if not exists moderation_status");
    expect(migration).toContain("add column if not exists vote_score");
    expect(migration).toContain("add column if not exists download_count");
    expect(migration).toContain("create table if not exists public.controller_layout_votes");
    expect(migration).toContain("create table if not exists public.controller_layout_reports");
    expect(migration).toContain(
      "create table if not exists public.controller_layout_moderation_audit",
    );
    expect(migration).toContain(
      "create or replace function public.list_community_controller_layouts",
    );
    expect(migration).toContain("create or replace function public.vote_controller_layout");
    expect(migration).toContain("create or replace function public.report_controller_layout");
    expect(migration).toContain(
      "create or replace function public.record_controller_layout_download",
    );
    expect(migration).toContain(
      "create or replace function public.list_controller_layout_moderation_queue",
    );
    expect(migration).toContain("create or replace function public.review_controller_layout");
    expect(migration).toContain(
      "order by layout.vote_score desc, layout.download_count desc, layout.updated_at desc",
    );
  });

  it("keeps hosted layout RLS and review contracts scoped", () => {
    expect(migration).toContain("controller_layouts_read_own_or_approved_community");
    expect(migration).toContain("default 'pending'");
    expect(migration).toContain("enforce_controller_layout_community_review");
    expect(migration).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(migration).toContain(
      "using ((is_community = true and moderation_status = 'approved') or auth.uid() = user_id)",
    );
    expect(migration).toContain("primary key (layout_id, user_id)");
    expect(migration).toContain("from public.controller_layout_votes as vote");
    expect(migration).toContain(
      "where vote.layout_id = p_layout_id and vote.user_id = current_user_id",
    );
    expect(migration).toContain("on conflict on constraint controller_layout_votes_pkey");
    expect(migration).toContain(
      "on conflict on constraint controller_layout_reports_layout_id_reporter_id_key",
    );
    expect(migration).toContain("update public.controller_layouts as layout");
    expect(migration).toContain("set download_count = layout.download_count + 1");
    expect(migration).toContain("Controller layout authors cannot vote on their own layout");
    expect(migration).toContain("Controller layout authors cannot report their own layout");
    expect(migration).toContain("when active_reports >= 3 then 'pending'");
    expect(migration).toContain("Controller layout moderation queue requires service role");
    expect(migration).toContain("Controller layout review requires service role");
    expect(migration).toContain(
      "revoke execute on function public.review_controller_layout(uuid, text, text, uuid)",
    );
    expect(migration).toContain("to service_role");
  });
});
