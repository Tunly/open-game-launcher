-- Hosted community artwork submissions, voting, and moderation queue state.

create schema if not exists private;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'game-artwork',
  'game-artwork',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists community_artwork_storage_public_read on storage.objects;
create policy community_artwork_storage_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'game-artwork');

drop policy if exists community_artwork_storage_insert_own_folder on storage.objects;
create policy community_artwork_storage_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'game-artwork'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists community_artwork_storage_update_own_folder on storage.objects;
create policy community_artwork_storage_update_own_folder on storage.objects
  for update to authenticated
  using (
    bucket_id = 'game-artwork'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'game-artwork'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists community_artwork_storage_delete_own_folder on storage.objects;
create policy community_artwork_storage_delete_own_folder on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'game-artwork'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create table if not exists public.community_artwork_items (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  kind text not null check (kind in ('cover', 'icon', 'logo')),
  title text not null,
  artist_name text not null,
  description text not null default '',
  source_url text not null,
  storage_path text,
  tags text[] not null default '{}',
  submitter_id uuid not null references auth.users(id) on delete cascade,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected')),
  moderation_reason text,
  vote_score integer not null default 0,
  download_count integer not null default 0,
  report_count integer not null default 0,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_artwork_items_game_id_length_check
    check (char_length(game_id) between 1 and 160),
  constraint community_artwork_items_title_length_check
    check (char_length(title) between 1 and 120),
  constraint community_artwork_items_artist_name_length_check
    check (char_length(artist_name) between 1 and 80),
  constraint community_artwork_items_description_length_check
    check (char_length(description) <= 500),
  constraint community_artwork_items_source_url_check
    check (source_url ~* '^(https://|/artwork/|game-artwork/)'),
  constraint community_artwork_items_storage_path_check
    check (storage_path is null or storage_path ~ '^[0-9a-f-]+/games/'),
  constraint community_artwork_items_vote_score_check
    check (vote_score between -2147483647 and 2147483647),
  constraint community_artwork_items_download_count_check
    check (download_count >= 0),
  constraint community_artwork_items_report_count_check
    check (report_count >= 0)
);

comment on table public.community_artwork_items is
  'Hosted game artwork submissions. Approved rows are visible in launcher community artwork decks; pending/rejected rows form the moderation queue.';

create index if not exists community_artwork_items_approved_game_score_idx
  on public.community_artwork_items (game_id, vote_score desc, download_count desc, created_at desc)
  where moderation_status = 'approved';

create index if not exists community_artwork_items_submitter_status_idx
  on public.community_artwork_items (submitter_id, moderation_status, updated_at desc);

create index if not exists community_artwork_items_moderation_queue_idx
  on public.community_artwork_items (moderation_status, report_count desc, updated_at desc);

create table if not exists public.community_artwork_votes (
  artwork_id uuid not null references public.community_artwork_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote integer not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (artwork_id, user_id)
);

comment on table public.community_artwork_votes is
  'Per-user hosted community artwork votes. Aggregate score is synced onto community_artwork_items.';

create index if not exists community_artwork_votes_user_idx
  on public.community_artwork_votes (user_id, updated_at desc);

create table if not exists public.community_artwork_reports (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.community_artwork_items(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (
    reason in ('spam', 'copyright', 'harassment', 'explicit', 'wrong_game', 'low_quality', 'other')
  ),
  details text,
  status text not null default 'active' check (status in ('active', 'dismissed', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_artwork_reports_unique_reporter unique (artwork_id, reporter_user_id),
  constraint community_artwork_reports_details_length_check
    check (details is null or char_length(details) <= 2000)
);

comment on table public.community_artwork_reports is
  'Authenticated abuse reports for hosted community artwork. Three active reports return approved art to the pending moderation queue.';

create index if not exists community_artwork_reports_artwork_status_idx
  on public.community_artwork_reports (artwork_id, status);

create index if not exists community_artwork_reports_reporter_idx
  on public.community_artwork_reports (reporter_user_id, created_at desc);

create table if not exists private.community_artwork_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'moderator' check (role in ('moderator', 'admin')),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint community_artwork_moderators_revoked_at_check
    check (active = true or revoked_at is not null)
);

comment on table private.community_artwork_moderators is
  'Service-role managed allowlist for hosted community artwork reviewers. This table is never exposed to anon/authenticated clients.';

create table if not exists public.community_artwork_scan_results (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.community_artwork_items(id) on delete cascade,
  scanner text not null default 'policy_v1',
  verdict text not null check (verdict in ('passed', 'needs_review', 'blocked')),
  summary text not null default '',
  signals text[] not null default '{}',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint community_artwork_scan_results_scanner_length_check
    check (char_length(scanner) between 1 and 80),
  constraint community_artwork_scan_results_summary_length_check
    check (char_length(summary) <= 1000),
  constraint community_artwork_scan_results_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.community_artwork_scan_results is
  'Service-role content-scan evidence for hosted community artwork. Stores deterministic policy scanner verdicts before moderator review.';

create index if not exists community_artwork_scan_results_artwork_idx
  on public.community_artwork_scan_results (artwork_id, created_at desc);

create index if not exists community_artwork_scan_results_verdict_idx
  on public.community_artwork_scan_results (verdict, created_at desc);

create table if not exists public.community_artwork_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.community_artwork_items(id) on delete cascade,
  scan_result_id uuid references public.community_artwork_scan_results(id) on delete set null,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewer_role text not null default 'service_role' check (reviewer_role in ('service_role', 'moderator', 'admin')),
  action text not null check (
    action in (
      'approved',
      'rejected',
      'returned_to_pending',
      'scan_passed',
      'scan_needs_review',
      'scan_blocked'
    )
  ),
  previous_status text not null check (previous_status in ('pending', 'approved', 'rejected')),
  new_status text not null check (new_status in ('pending', 'approved', 'rejected')),
  reason text not null default '',
  report_count_snapshot integer not null default 0 check (report_count_snapshot >= 0),
  scan_verdict_snapshot text check (
    scan_verdict_snapshot is null
    or scan_verdict_snapshot in ('passed', 'needs_review', 'blocked')
  ),
  created_at timestamptz not null default now(),
  constraint community_artwork_moderation_audit_reason_length_check
    check (char_length(reason) <= 1000)
);

comment on table public.community_artwork_moderation_audit is
  'Service-role audit log for hosted community artwork review decisions. Client users do not receive direct table access.';

create index if not exists community_artwork_moderation_audit_artwork_idx
  on public.community_artwork_moderation_audit (artwork_id, created_at desc);

create index if not exists community_artwork_moderation_audit_reviewer_idx
  on public.community_artwork_moderation_audit (reviewer_user_id, created_at desc)
  where reviewer_user_id is not null;

create or replace function public.sync_community_artwork_vote_score(p_artwork_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.community_artwork_items item
  set
    vote_score = coalesce((
      select sum(vote.vote)::integer
      from public.community_artwork_votes vote
      where vote.artwork_id = p_artwork_id
    ), 0),
    updated_at = now()
  where item.id = p_artwork_id;
end;
$$;

revoke execute on function public.sync_community_artwork_vote_score(uuid)
  from public, anon, authenticated;

create or replace function public.sync_community_artwork_vote_score_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_community_artwork_vote_score(old.artwork_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.artwork_id is distinct from new.artwork_id then
    perform public.sync_community_artwork_vote_score(old.artwork_id);
  end if;

  perform public.sync_community_artwork_vote_score(new.artwork_id);
  return new;
end;
$$;

revoke execute on function public.sync_community_artwork_vote_score_trigger()
  from public, anon, authenticated;

create or replace function public.sync_community_artwork_report_state(p_artwork_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_report_count integer;
begin
  select count(distinct report.reporter_user_id)::integer
  into active_report_count
  from public.community_artwork_reports report
  where report.artwork_id = p_artwork_id
    and report.status = 'active';

  update public.community_artwork_items item
  set
    report_count = active_report_count,
    moderation_status = case
      when active_report_count >= 3 and item.moderation_status = 'approved' then 'pending'
      else item.moderation_status
    end,
    moderation_reason = case
      when active_report_count >= 3 and item.moderation_status = 'approved' then 'reported-by-community'
      else item.moderation_reason
    end,
    approved_at = case
      when active_report_count >= 3 and item.moderation_status = 'approved' then null
      else item.approved_at
    end,
    updated_at = now()
  where item.id = p_artwork_id
    and (
      item.report_count is distinct from active_report_count
      or (active_report_count >= 3 and item.moderation_status = 'approved')
    );
end;
$$;

revoke execute on function public.sync_community_artwork_report_state(uuid)
  from public, anon, authenticated;

create or replace function public.sync_community_artwork_report_state_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_community_artwork_report_state(old.artwork_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.artwork_id is distinct from new.artwork_id then
    perform public.sync_community_artwork_report_state(old.artwork_id);
  end if;

  perform public.sync_community_artwork_report_state(new.artwork_id);
  return new;
end;
$$;

revoke execute on function public.sync_community_artwork_report_state_trigger()
  from public, anon, authenticated;

create or replace function public.enforce_community_artwork_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.community_artwork_reports report
    where report.reporter_user_id = new.reporter_user_id
      and report.created_at >= now() - interval '1 hour'
      and report.status = 'active'
  ) >= 10 then
    raise exception 'Community artwork report rate limit exceeded';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_community_artwork_report_rate_limit()
  from public, anon, authenticated;

drop trigger if exists set_community_artwork_items_updated_at on public.community_artwork_items;
create trigger set_community_artwork_items_updated_at
  before update on public.community_artwork_items
  for each row execute function public.set_updated_at();

drop trigger if exists set_community_artwork_votes_updated_at on public.community_artwork_votes;
create trigger set_community_artwork_votes_updated_at
  before update on public.community_artwork_votes
  for each row execute function public.set_updated_at();

drop trigger if exists set_community_artwork_reports_updated_at on public.community_artwork_reports;
create trigger set_community_artwork_reports_updated_at
  before update on public.community_artwork_reports
  for each row execute function public.set_updated_at();

drop trigger if exists sync_community_artwork_vote_score_after_write
  on public.community_artwork_votes;
create trigger sync_community_artwork_vote_score_after_write
  after insert or update or delete on public.community_artwork_votes
  for each row execute function public.sync_community_artwork_vote_score_trigger();

drop trigger if exists sync_community_artwork_report_state_after_write
  on public.community_artwork_reports;
create trigger sync_community_artwork_report_state_after_write
  after insert or update or delete on public.community_artwork_reports
  for each row execute function public.sync_community_artwork_report_state_trigger();

drop trigger if exists enforce_community_artwork_report_rate_limit_before_insert
  on public.community_artwork_reports;
create trigger enforce_community_artwork_report_rate_limit_before_insert
  before insert on public.community_artwork_reports
  for each row execute function public.enforce_community_artwork_report_rate_limit();

grant select on public.community_artwork_items to anon, authenticated;
grant insert on public.community_artwork_items to authenticated;
grant select, insert, update, delete on public.community_artwork_votes to authenticated;
grant select, insert on public.community_artwork_reports to authenticated;
grant all on public.community_artwork_items to service_role;
grant all on public.community_artwork_votes to service_role;
grant all on public.community_artwork_reports to service_role;
grant all on public.community_artwork_scan_results to service_role;
grant all on public.community_artwork_moderation_audit to service_role;
grant all on private.community_artwork_moderators to service_role;

alter table public.community_artwork_items enable row level security;
alter table public.community_artwork_votes enable row level security;
alter table public.community_artwork_reports enable row level security;
alter table public.community_artwork_scan_results enable row level security;
alter table public.community_artwork_moderation_audit enable row level security;

drop policy if exists community_artwork_items_select_visible on public.community_artwork_items;
create policy community_artwork_items_select_visible
  on public.community_artwork_items
  for select to anon, authenticated
  using (
    moderation_status = 'approved'
    or auth.uid() = submitter_id
  );

drop policy if exists community_artwork_items_insert_pending_own on public.community_artwork_items;
create policy community_artwork_items_insert_pending_own
  on public.community_artwork_items
  for insert to authenticated
  with check (
    auth.uid() = submitter_id
    and moderation_status = 'pending'
    and moderation_reason is null
    and vote_score = 0
    and download_count = 0
    and report_count = 0
    and approved_at is null
    and rejected_at is null
  );

drop policy if exists community_artwork_votes_select_own on public.community_artwork_votes;
create policy community_artwork_votes_select_own
  on public.community_artwork_votes
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists community_artwork_votes_insert_approved_own on public.community_artwork_votes;
create policy community_artwork_votes_insert_approved_own
  on public.community_artwork_votes
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.community_artwork_items item
      where item.id = community_artwork_votes.artwork_id
        and item.moderation_status = 'approved'
        and item.submitter_id <> auth.uid()
    )
  );

drop policy if exists community_artwork_votes_update_approved_own on public.community_artwork_votes;
create policy community_artwork_votes_update_approved_own
  on public.community_artwork_votes
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.community_artwork_items item
      where item.id = community_artwork_votes.artwork_id
        and item.moderation_status = 'approved'
        and item.submitter_id <> auth.uid()
    )
  );

drop policy if exists community_artwork_votes_delete_own on public.community_artwork_votes;
create policy community_artwork_votes_delete_own
  on public.community_artwork_votes
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists community_artwork_reports_select_own on public.community_artwork_reports;
create policy community_artwork_reports_select_own
  on public.community_artwork_reports
  for select to authenticated
  using (auth.uid() = reporter_user_id);

drop policy if exists community_artwork_reports_insert_approved_own on public.community_artwork_reports;
create policy community_artwork_reports_insert_approved_own
  on public.community_artwork_reports
  for insert to authenticated
  with check (
    auth.uid() = reporter_user_id
    and status = 'active'
    and exists (
      select 1
      from public.community_artwork_items item
      where item.id = community_artwork_reports.artwork_id
        and item.moderation_status = 'approved'
        and item.submitter_id <> auth.uid()
    )
  );

create or replace function public.list_community_artwork(
  p_game_id text,
  p_limit integer default 24
)
returns table (
  id uuid,
  game_id text,
  kind text,
  title text,
  artist_name text,
  description text,
  source_url text,
  storage_path text,
  tags text[],
  vote_score integer,
  download_count integer,
  report_count integer,
  moderation_status text,
  created_at timestamptz,
  updated_at timestamptz,
  user_vote integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    item.id,
    item.game_id,
    item.kind,
    item.title,
    item.artist_name,
    item.description,
    item.source_url,
    item.storage_path,
    item.tags,
    item.vote_score,
    item.download_count,
    item.report_count,
    item.moderation_status,
    item.created_at,
    item.updated_at,
    coalesce((
      select vote.vote
      from public.community_artwork_votes vote
      where vote.artwork_id = item.id
        and vote.user_id = auth.uid()
    ), 0)::integer as user_vote
  from public.community_artwork_items item
  where item.game_id = p_game_id
    and item.moderation_status = 'approved'
  order by item.vote_score desc, item.download_count desc, item.created_at desc
  limit least(greatest(coalesce(p_limit, 24), 1), 50);
$$;

grant execute on function public.list_community_artwork(text, integer)
  to anon, authenticated;

create or replace function public.vote_community_artwork(
  p_artwork_id uuid,
  p_vote integer
)
returns table (
  artwork_id uuid,
  vote_score integer,
  user_vote integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Sign in to vote on community artwork';
  end if;

  if p_vote not in (-1, 0, 1) then
    raise exception 'Community artwork vote must be -1, 0, or 1';
  end if;

  if not exists (
    select 1
    from public.community_artwork_items item
    where item.id = p_artwork_id
      and item.moderation_status = 'approved'
      and item.submitter_id <> caller_id
  ) then
    raise exception 'Community artwork is not available for voting';
  end if;

  if p_vote = 0 then
    delete from public.community_artwork_votes vote
    where vote.artwork_id = p_artwork_id
      and vote.user_id = caller_id;
  else
    insert into public.community_artwork_votes (artwork_id, user_id, vote)
    values (p_artwork_id, caller_id, p_vote)
    on conflict on constraint community_artwork_votes_pkey
    do update set vote = excluded.vote, updated_at = now();
  end if;

  perform public.sync_community_artwork_vote_score(p_artwork_id);

  return query
  select
    item.id as artwork_id,
    item.vote_score,
    coalesce(vote.vote, 0)::integer as user_vote
  from public.community_artwork_items item
  left join public.community_artwork_votes vote
    on vote.artwork_id = item.id
   and vote.user_id = caller_id
  where item.id = p_artwork_id;
end;
$$;

grant execute on function public.vote_community_artwork(uuid, integer)
  to authenticated;

create or replace function public.report_community_artwork(
  p_artwork_id uuid,
  p_reason text,
  p_details text default null
)
returns table (
  artwork_id uuid,
  report_count integer,
  moderation_status text,
  report_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  normalized_reason text;
  normalized_details text;
begin
  if caller_id is null then
    raise exception 'Sign in to report community artwork';
  end if;

  if not exists (
    select 1
    from public.community_artwork_items item
    where item.id = p_artwork_id
      and item.moderation_status = 'approved'
      and item.submitter_id <> caller_id
  ) then
    raise exception 'Community artwork is not available for reporting';
  end if;

  normalized_reason := case
    when p_reason in ('spam', 'copyright', 'harassment', 'explicit', 'wrong_game', 'low_quality', 'other')
      then p_reason
    else 'other'
  end;
  normalized_details := nullif(left(trim(coalesce(p_details, '')), 2000), '');

  insert into public.community_artwork_reports (
    artwork_id,
    reporter_user_id,
    reason,
    details,
    status
  )
  values (
    p_artwork_id,
    caller_id,
    normalized_reason,
    normalized_details,
    'active'
  )
  on conflict on constraint community_artwork_reports_unique_reporter
  do update set
    reason = excluded.reason,
    details = excluded.details,
    status = 'active',
    updated_at = now();

  perform public.sync_community_artwork_report_state(p_artwork_id);

  return query
  select
    item.id as artwork_id,
    item.report_count,
    item.moderation_status,
    report.status as report_status
  from public.community_artwork_items item
  join public.community_artwork_reports report
    on report.artwork_id = item.id
   and report.reporter_user_id = caller_id
  where item.id = p_artwork_id;
end;
$$;

grant execute on function public.report_community_artwork(uuid, text, text)
  to authenticated;

create or replace function public.list_community_artwork_moderation_queue(
  p_status text default 'pending',
  p_limit integer default 50
)
returns table (
  id uuid,
  game_id text,
  kind text,
  title text,
  artist_name text,
  description text,
  source_url text,
  storage_path text,
  tags text[],
  vote_score integer,
  download_count integer,
  report_count integer,
  moderation_status text,
  moderation_reason text,
  submitter_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  last_report_reason text,
  last_reported_at timestamptz,
  last_audit_action text,
  last_audit_at timestamptz,
  last_scan_verdict text,
  last_scanned_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    item.id,
    item.game_id,
    item.kind,
    item.title,
    item.artist_name,
    item.description,
    item.source_url,
    item.storage_path,
    item.tags,
    item.vote_score,
    item.download_count,
    item.report_count,
    item.moderation_status,
    item.moderation_reason,
    item.submitter_id,
    item.created_at,
    item.updated_at,
    latest_report.reason as last_report_reason,
    latest_report.created_at as last_reported_at,
    latest_audit.action as last_audit_action,
    latest_audit.created_at as last_audit_at,
    latest_scan.verdict as last_scan_verdict,
    latest_scan.created_at as last_scanned_at
  from public.community_artwork_items item
  left join lateral (
    select report.reason, report.created_at
    from public.community_artwork_reports report
    where report.artwork_id = item.id
      and report.status = 'active'
    order by report.created_at desc
    limit 1
  ) latest_report on true
  left join lateral (
    select audit.action, audit.created_at
    from public.community_artwork_moderation_audit audit
    where audit.artwork_id = item.id
    order by audit.created_at desc
    limit 1
  ) latest_audit on true
  left join lateral (
    select scan.verdict, scan.created_at
    from public.community_artwork_scan_results scan
    where scan.artwork_id = item.id
    order by scan.created_at desc, scan.id desc
    limit 1
  ) latest_scan on true
  where item.moderation_status = case
    when p_status in ('approved', 'pending', 'rejected') then p_status
    else 'pending'
  end
  order by item.report_count desc, item.updated_at desc, item.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke execute on function public.list_community_artwork_moderation_queue(text, integer)
  from public, anon, authenticated;
grant execute on function public.list_community_artwork_moderation_queue(text, integer)
  to service_role;

create or replace function public.scan_community_artwork(
  p_artwork_id uuid,
  p_scanner text default 'policy_v1',
  p_verdict text default 'needs_review',
  p_summary text default '',
  p_signals text[] default '{}',
  p_metadata jsonb default '{}'
)
returns table (
  artwork_id uuid,
  scan_id uuid,
  scan_verdict text,
  scan_summary text,
  scan_signals text[],
  scan_metadata jsonb,
  audit_id uuid,
  moderation_status text,
  moderation_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.community_artwork_items%rowtype;
  normalized_scanner text;
  normalized_verdict text;
  clean_summary text;
  clean_signals text[];
  clean_metadata jsonb;
  created_scan_id uuid;
  created_audit_id uuid;
  audit_action text;
  next_status text;
  next_reason text;
begin
  select *
  into existing
  from public.community_artwork_items item
  where item.id = p_artwork_id
  for update;

  if existing.id is null then
    raise exception 'Community artwork submission not found';
  end if;

  normalized_scanner := left(nullif(trim(coalesce(p_scanner, 'policy_v1')), ''), 80);
  normalized_verdict := lower(trim(coalesce(p_verdict, 'needs_review')));
  clean_summary := left(trim(coalesce(p_summary, '')), 1000);
  clean_signals := coalesce(p_signals, '{}');
  clean_metadata := coalesce(p_metadata, '{}');

  if normalized_scanner is null then
    normalized_scanner := 'policy_v1';
  end if;

  if normalized_verdict not in ('passed', 'needs_review', 'blocked') then
    raise exception 'Community artwork scan verdict must be passed, needs_review, or blocked';
  end if;

  if jsonb_typeof(clean_metadata) is distinct from 'object' then
    raise exception 'Community artwork scan metadata must be a JSON object';
  end if;

  next_status := case
    when normalized_verdict = 'blocked' then 'rejected'
    when normalized_verdict = 'needs_review' and existing.moderation_status = 'approved' then 'pending'
    else existing.moderation_status
  end;
  next_reason := case
    when normalized_verdict = 'passed' then existing.moderation_reason
    else concat('scan-', normalized_verdict, ': ', nullif(clean_summary, ''))
  end;
  audit_action := case
    when normalized_verdict = 'passed' then 'scan_passed'
    when normalized_verdict = 'blocked' then 'scan_blocked'
    else 'scan_needs_review'
  end;

  insert into public.community_artwork_scan_results (
    artwork_id,
    scanner,
    verdict,
    summary,
    signals,
    metadata
  )
  values (
    p_artwork_id,
    normalized_scanner,
    normalized_verdict,
    clean_summary,
    clean_signals,
    clean_metadata
  )
  returning id into created_scan_id;

  update public.community_artwork_items item
  set
    moderation_status = next_status,
    moderation_reason = next_reason,
    approved_at = case when next_status = 'approved' then item.approved_at else null end,
    rejected_at = case
      when next_status = 'rejected' and item.rejected_at is null then now()
      when next_status = 'rejected' then item.rejected_at
      else null
    end,
    updated_at = now()
  where item.id = p_artwork_id;

  insert into public.community_artwork_moderation_audit (
    artwork_id,
    scan_result_id,
    reviewer_role,
    action,
    previous_status,
    new_status,
    reason,
    report_count_snapshot,
    scan_verdict_snapshot
  )
  values (
    p_artwork_id,
    created_scan_id,
    'service_role',
    audit_action,
    existing.moderation_status,
    next_status,
    clean_summary,
    existing.report_count,
    normalized_verdict
  )
  returning id into created_audit_id;

  return query
  select
    item.id as artwork_id,
    scan.id as scan_id,
    scan.verdict as scan_verdict,
    scan.summary as scan_summary,
    scan.signals as scan_signals,
    scan.metadata as scan_metadata,
    created_audit_id as audit_id,
    item.moderation_status,
    item.moderation_reason
  from public.community_artwork_items item
  join public.community_artwork_scan_results scan
    on scan.id = created_scan_id
  where item.id = p_artwork_id;
end;
$$;

revoke execute on function public.scan_community_artwork(uuid, text, text, text, text[], jsonb)
  from public, anon, authenticated;
grant execute on function public.scan_community_artwork(uuid, text, text, text, text[], jsonb)
  to service_role;

create or replace function public.review_community_artwork(
  p_artwork_id uuid,
  p_decision text,
  p_reason text default '',
  p_reviewer_user_id uuid default null
)
returns table (
  artwork_id uuid,
  moderation_status text,
  moderation_reason text,
  approved_at timestamptz,
  rejected_at timestamptz,
  report_count integer,
  audit_id uuid,
  audit_action text,
  audit_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.community_artwork_items%rowtype;
  normalized_decision text;
  normalized_status text;
  normalized_audit_action text;
  clean_reason text;
  created_audit_id uuid;
  reviewer_role text := 'service_role';
  latest_scan public.community_artwork_scan_results%rowtype;
begin
  select *
  into existing
  from public.community_artwork_items item
  where item.id = p_artwork_id
  for update;

  if existing.id is null then
    raise exception 'Community artwork submission not found';
  end if;

  if p_reviewer_user_id is not null then
    select moderator.role
    into reviewer_role
    from private.community_artwork_moderators moderator
    where moderator.user_id = p_reviewer_user_id
      and moderator.active = true;

    if reviewer_role is null then
      raise exception 'Community artwork reviewer is not active';
    end if;
  end if;

  normalized_decision := lower(trim(coalesce(p_decision, '')));
  normalized_status := case
    when normalized_decision in ('approve', 'approved') then 'approved'
    when normalized_decision in ('reject', 'rejected') then 'rejected'
    when normalized_decision in ('pending', 'return_to_pending', 'returned_to_pending') then 'pending'
    else null
  end;

  if normalized_status is null then
    raise exception 'Community artwork review decision must be approve, reject, or pending';
  end if;

  normalized_audit_action := case
    when normalized_status = 'approved' then 'approved'
    when normalized_status = 'rejected' then 'rejected'
    else 'returned_to_pending'
  end;
  clean_reason := nullif(left(trim(coalesce(p_reason, '')), 1000), '');

  select *
  into latest_scan
  from public.community_artwork_scan_results scan
  where scan.artwork_id = p_artwork_id
  order by scan.created_at desc, scan.id desc
  limit 1;

  if normalized_status = 'approved' and (
    latest_scan.id is null
    or latest_scan.verdict <> 'passed'
  ) then
    raise exception 'Community artwork must pass content scan before approval';
  end if;

  update public.community_artwork_items item
  set
    moderation_status = normalized_status,
    moderation_reason = clean_reason,
    approved_at = case when normalized_status = 'approved' then now() else null end,
    rejected_at = case when normalized_status = 'rejected' then now() else null end,
    updated_at = now()
  where item.id = p_artwork_id;

  if normalized_status in ('approved', 'rejected') then
    update public.community_artwork_reports report
    set status = 'dismissed', updated_at = now()
    where report.artwork_id = p_artwork_id
      and report.status = 'active';

    perform public.sync_community_artwork_report_state(p_artwork_id);
  end if;

  insert into public.community_artwork_moderation_audit (
    artwork_id,
    scan_result_id,
    reviewer_user_id,
    reviewer_role,
    action,
    previous_status,
    new_status,
    reason,
    report_count_snapshot,
    scan_verdict_snapshot
  )
  values (
    p_artwork_id,
    latest_scan.id,
    p_reviewer_user_id,
    reviewer_role,
    normalized_audit_action,
    existing.moderation_status,
    normalized_status,
    coalesce(clean_reason, ''),
    existing.report_count,
    latest_scan.verdict
  )
  returning id into created_audit_id;

  return query
  select
    item.id as artwork_id,
    item.moderation_status,
    item.moderation_reason,
    item.approved_at,
    item.rejected_at,
    item.report_count,
    audit.id as audit_id,
    audit.action as audit_action,
    audit.reason as audit_reason
  from public.community_artwork_items item
  join public.community_artwork_moderation_audit audit
    on audit.id = created_audit_id
  where item.id = p_artwork_id;
end;
$$;

revoke execute on function public.review_community_artwork(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.review_community_artwork(uuid, text, text, uuid)
  to service_role;
