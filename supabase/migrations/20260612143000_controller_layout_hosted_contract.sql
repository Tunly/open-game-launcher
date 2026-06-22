-- Hosted controller community layout contract: approved feed, votes, reports,
-- download counts, and service-role moderation without cloud activation.

alter table public.controller_layouts
  add column if not exists moderation_status text not null default 'pending'
    check (moderation_status in ('approved', 'pending', 'rejected')),
  add column if not exists vote_score integer not null default 0,
  add column if not exists download_count integer not null default 0,
  add column if not exists report_count integer not null default 0,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz;

update public.controller_layouts
set moderation_status = 'approved',
    approved_at = coalesce(approved_at, created_at)
where is_community = true
  and moderation_status = 'pending';

create index if not exists controller_layouts_community_rank_idx
  on public.controller_layouts(game_id, controller_type, vote_score desc, download_count desc, updated_at desc)
  where is_community = true and moderation_status = 'approved';

drop policy if exists controller_layouts_read_own_or_community on public.controller_layouts;
create policy controller_layouts_read_own_or_approved_community
on public.controller_layouts
for select
to anon, authenticated
using ((is_community = true and moderation_status = 'approved') or auth.uid() = user_id);

create or replace function public.enforce_controller_layout_community_review()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and new.is_community = true then
    if tg_op = 'INSERT' or new.bindings is distinct from old.bindings or new.name is distinct from old.name then
      new.moderation_status = 'pending';
      new.approved_at = null;
      new.rejected_at = null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists controller_layouts_enforce_community_review on public.controller_layouts;
create trigger controller_layouts_enforce_community_review
before insert or update on public.controller_layouts
for each row execute function public.enforce_controller_layout_community_review();

create table if not exists public.controller_layout_votes (
  layout_id uuid not null references public.controller_layouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote integer not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (layout_id, user_id)
);

create table if not exists public.controller_layout_reports (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references public.controller_layouts(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (layout_id, reporter_id)
);

create table if not exists public.controller_layout_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references public.controller_layouts(id) on delete cascade,
  reviewer_id uuid,
  previous_status text,
  new_status text not null check (new_status in ('approved', 'pending', 'rejected')),
  note text,
  report_count integer not null default 0,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.controller_layout_votes to authenticated;
grant select, insert, update on public.controller_layout_reports to authenticated;
grant select on public.controller_layout_moderation_audit to authenticated;
grant all on public.controller_layout_moderation_audit to service_role;

alter table public.controller_layout_votes enable row level security;
alter table public.controller_layout_reports enable row level security;
alter table public.controller_layout_moderation_audit enable row level security;

drop policy if exists controller_layout_votes_read_own on public.controller_layout_votes;
create policy controller_layout_votes_read_own
on public.controller_layout_votes
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists controller_layout_votes_insert_own on public.controller_layout_votes;
create policy controller_layout_votes_insert_own
on public.controller_layout_votes
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists controller_layout_votes_update_own on public.controller_layout_votes;
create policy controller_layout_votes_update_own
on public.controller_layout_votes
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists controller_layout_votes_delete_own on public.controller_layout_votes;
create policy controller_layout_votes_delete_own
on public.controller_layout_votes
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists controller_layout_reports_read_own on public.controller_layout_reports;
create policy controller_layout_reports_read_own
on public.controller_layout_reports
for select
to authenticated
using (auth.uid() = reporter_id);

drop policy if exists controller_layout_reports_insert_own on public.controller_layout_reports;
create policy controller_layout_reports_insert_own
on public.controller_layout_reports
for insert
to authenticated
with check (auth.uid() = reporter_id);

drop policy if exists controller_layout_reports_update_own on public.controller_layout_reports;
create policy controller_layout_reports_update_own
on public.controller_layout_reports
for update
to authenticated
using (auth.uid() = reporter_id)
with check (auth.uid() = reporter_id);

drop policy if exists controller_layout_moderation_audit_service_role on public.controller_layout_moderation_audit;
create policy controller_layout_moderation_audit_service_role
on public.controller_layout_moderation_audit
for all
to service_role
using (true)
with check (true);

create or replace function public.touch_controller_layout_votes_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists controller_layout_votes_touch_updated_at on public.controller_layout_votes;
create trigger controller_layout_votes_touch_updated_at
before update on public.controller_layout_votes
for each row execute function public.touch_controller_layout_votes_updated_at();

create or replace function public.refresh_controller_layout_vote_score(p_layout_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_score integer;
begin
  select coalesce(sum(vote), 0)::integer
  into next_score
  from public.controller_layout_votes as vote
  where vote.layout_id = p_layout_id;

  update public.controller_layouts
  set vote_score = next_score
  where id = p_layout_id;

  return next_score;
end;
$$;

revoke execute on function public.refresh_controller_layout_vote_score(uuid) from public, anon, authenticated;
grant execute on function public.refresh_controller_layout_vote_score(uuid) to service_role;

create or replace function public.list_community_controller_layouts(
  p_game_id text default null,
  p_controller_type text default null,
  p_limit integer default 24
)
returns table (
  id uuid,
  user_id uuid,
  game_id text,
  name text,
  controller_type text,
  template text,
  bindings jsonb,
  gyro_enabled boolean,
  haptics_enabled boolean,
  author_name text,
  vote_score integer,
  download_count integer,
  report_count integer,
  moderation_status text,
  user_vote integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select
    layout.id,
    layout.user_id,
    layout.game_id,
    layout.name,
    layout.controller_type,
    layout.template,
    layout.bindings,
    layout.gyro_enabled,
    layout.haptics_enabled,
    layout.author_name,
    layout.vote_score,
    layout.download_count,
    layout.report_count,
    layout.moderation_status,
    coalesce(vote.vote, 0) as user_vote,
    layout.created_at,
    layout.updated_at
  from public.controller_layouts layout
  left join public.controller_layout_votes vote
    on vote.layout_id = layout.id and vote.user_id = auth.uid()
  where layout.is_community = true
    and layout.moderation_status = 'approved'
    and (p_game_id is null or layout.game_id = p_game_id or layout.game_id is null)
    and (p_controller_type is null or layout.controller_type = p_controller_type)
  order by layout.vote_score desc, layout.download_count desc, layout.updated_at desc
  limit least(greatest(coalesce(p_limit, 24), 1), 50);
$$;

grant execute on function public.list_community_controller_layouts(text, text, integer) to anon, authenticated;

create or replace function public.vote_controller_layout(
  p_layout_id uuid,
  p_vote integer
)
returns table (
  layout_id uuid,
  user_vote integer,
  vote_score integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  layout_owner uuid;
  next_score integer;
begin
  if current_user_id is null then
    raise exception 'Sign in required to vote on controller layouts';
  end if;

  if p_vote not in (-1, 0, 1) then
    raise exception 'Controller layout vote must be -1, 0, or 1';
  end if;

  select layout.user_id
  into layout_owner
  from public.controller_layouts as layout
  where layout.id = p_layout_id
    and layout.is_community = true
    and layout.moderation_status = 'approved';

  if layout_owner is null then
    raise exception 'Approved community controller layout not found';
  end if;

  if layout_owner = current_user_id then
    raise exception 'Controller layout authors cannot vote on their own layout';
  end if;

  if p_vote = 0 then
    delete from public.controller_layout_votes as vote
    where vote.layout_id = p_layout_id and vote.user_id = current_user_id;
  else
    insert into public.controller_layout_votes(layout_id, user_id, vote)
    values (p_layout_id, current_user_id, p_vote)
    on conflict on constraint controller_layout_votes_pkey
    do update set vote = excluded.vote, updated_at = now();
  end if;

  next_score := public.refresh_controller_layout_vote_score(p_layout_id);

  return query select p_layout_id, p_vote, next_score;
end;
$$;

grant execute on function public.vote_controller_layout(uuid, integer) to authenticated;

create or replace function public.record_controller_layout_download(p_layout_id uuid)
returns table (
  layout_id uuid,
  download_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  update public.controller_layouts as layout
  set download_count = layout.download_count + 1
  where layout.id = p_layout_id
    and layout.is_community = true
    and layout.moderation_status = 'approved'
  returning layout.download_count into next_count;

  if next_count is null then
    raise exception 'Approved community controller layout not found';
  end if;

  return query select p_layout_id, next_count;
end;
$$;

grant execute on function public.record_controller_layout_download(uuid) to anon, authenticated;

create or replace function public.report_controller_layout(
  p_layout_id uuid,
  p_reason text
)
returns table (
  layout_id uuid,
  report_count integer,
  moderation_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  layout_owner uuid;
  active_reports integer;
  next_status text;
begin
  if current_user_id is null then
    raise exception 'Sign in required to report controller layouts';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Controller layout report reason is required';
  end if;

  select layout.user_id
  into layout_owner
  from public.controller_layouts as layout
  where layout.id = p_layout_id
    and layout.is_community = true
    and layout.moderation_status = 'approved';

  if layout_owner is null then
    raise exception 'Approved community controller layout not found';
  end if;

  if layout_owner = current_user_id then
    raise exception 'Controller layout authors cannot report their own layout';
  end if;

  insert into public.controller_layout_reports(layout_id, reporter_id, reason, active, resolved_at)
  values (p_layout_id, current_user_id, left(trim(p_reason), 280), true, null)
  on conflict on constraint controller_layout_reports_layout_id_reporter_id_key
  do update set reason = excluded.reason, active = true, resolved_at = null, created_at = now();

  select count(*)::integer
  into active_reports
  from public.controller_layout_reports as report
  where report.layout_id = p_layout_id and report.active = true;

  next_status := case when active_reports >= 3 then 'pending' else 'approved' end;

  update public.controller_layouts as layout
  set report_count = active_reports,
      moderation_status = next_status,
      approved_at = case when next_status = 'approved' then coalesce(layout.approved_at, now()) else layout.approved_at end
  where layout.id = p_layout_id;

  return query select p_layout_id, active_reports, next_status;
end;
$$;

grant execute on function public.report_controller_layout(uuid, text) to authenticated;

create or replace function public.list_controller_layout_moderation_queue(
  p_status text default 'pending',
  p_limit integer default 50
)
returns table (
  id uuid,
  user_id uuid,
  game_id text,
  name text,
  controller_type text,
  template text,
  author_name text,
  vote_score integer,
  download_count integer,
  report_count integer,
  moderation_status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Controller layout moderation queue requires service role';
  end if;

  return query
  select
    layout.id,
    layout.user_id,
    layout.game_id,
    layout.name,
    layout.controller_type,
    layout.template,
    layout.author_name,
    layout.vote_score,
    layout.download_count,
    layout.report_count,
    layout.moderation_status,
    layout.created_at,
    layout.updated_at
  from public.controller_layouts layout
  where layout.is_community = true
    and layout.moderation_status = coalesce(nullif(p_status, ''), 'pending')
  order by layout.report_count desc, layout.updated_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

revoke execute on function public.list_controller_layout_moderation_queue(text, integer)
from public, anon, authenticated;
grant execute on function public.list_controller_layout_moderation_queue(text, integer) to service_role;

create or replace function public.review_controller_layout(
  p_layout_id uuid,
  p_status text,
  p_note text default null,
  p_reviewer_id uuid default null
)
returns table (
  layout_id uuid,
  moderation_status text,
  report_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_status text := lower(trim(coalesce(p_status, '')));
  previous_status text;
  current_reports integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Controller layout review requires service role';
  end if;

  if normalized_status not in ('approved', 'pending', 'rejected') then
    raise exception 'Controller layout review status must be approved, pending, or rejected';
  end if;

  select layout.moderation_status, layout.report_count
  into previous_status, current_reports
  from public.controller_layouts as layout
  where layout.id = p_layout_id and layout.is_community = true;

  if previous_status is null then
    raise exception 'Community controller layout not found';
  end if;

  update public.controller_layouts as layout
  set moderation_status = normalized_status,
      approved_at = case when normalized_status = 'approved' then now() else layout.approved_at end,
      rejected_at = case when normalized_status = 'rejected' then now() else layout.rejected_at end,
      report_count = case when normalized_status = 'approved' then 0 else layout.report_count end
  where layout.id = p_layout_id;

  if normalized_status = 'approved' then
    update public.controller_layout_reports as report
    set active = false, resolved_at = now()
    where report.layout_id = p_layout_id and report.active = true;
    current_reports := 0;
  end if;

  insert into public.controller_layout_moderation_audit(
    layout_id,
    reviewer_id,
    previous_status,
    new_status,
    note,
    report_count
  )
  values (
    p_layout_id,
    p_reviewer_id,
    previous_status,
    normalized_status,
    nullif(trim(coalesce(p_note, '')), ''),
    current_reports
  );

  return query select p_layout_id, normalized_status, current_reports;
end;
$$;

revoke execute on function public.review_controller_layout(uuid, text, text, uuid)
from public, anon, authenticated;
grant execute on function public.review_controller_layout(uuid, text, text, uuid) to service_role;
