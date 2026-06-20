-- Public Screenshot Feed moderation and ranked-feed contract.
-- This stages the hosted data contract for approved public screenshots without
-- claiming that community-wide moderation operations are enabled.

alter table public.screenshots
  alter column is_public set default false,
  add column if not exists moderation_status text not null default 'approved',
  add column if not exists moderation_reason text,
  add column if not exists report_count integer not null default 0,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'screenshots_moderation_status_check'
      and conrelid = 'public.screenshots'::regclass
  ) then
    alter table public.screenshots
      add constraint screenshots_moderation_status_check
      check (moderation_status in ('approved', 'pending', 'rejected'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'screenshots_report_count_check'
      and conrelid = 'public.screenshots'::regclass
  ) then
    alter table public.screenshots
      add constraint screenshots_report_count_check
      check (report_count >= 0);
  end if;
end $$;

create index if not exists screenshots_public_feed_rank_idx
  on public.screenshots (moderation_status, is_public, report_count, created_at desc)
  where is_public = true and moderation_status = 'approved';

create table if not exists public.screenshot_reports (
  id uuid primary key default gen_random_uuid(),
  screenshot_id uuid not null references public.screenshots(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'other'
    check (reason in ('spam', 'harassment', 'explicit', 'spoiler', 'copyright', 'private_data', 'other')),
  details text,
  status text not null default 'active'
    check (status in ('active', 'resolved', 'dismissed')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint screenshot_reports_unique_reporter unique (screenshot_id, reporter_user_id),
  constraint screenshot_reports_details_length_check
    check (details is null or char_length(details) <= 2000)
);

comment on table public.screenshot_reports is
  'Authenticated abuse reports for public screenshot feed rows. Three active distinct reports return approved screenshots to pending moderation.';

create index if not exists screenshot_reports_screenshot_status_idx
  on public.screenshot_reports (screenshot_id, status);

create index if not exists screenshot_reports_reporter_idx
  on public.screenshot_reports (reporter_user_id, created_at desc);

create table if not exists public.screenshot_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  screenshot_id uuid not null references public.screenshots(id) on delete cascade,
  reviewer_id uuid references auth.users(id) on delete set null,
  previous_status text not null,
  new_status text not null,
  reason text,
  report_count_snapshot integer not null default 0 check (report_count_snapshot >= 0),
  created_at timestamptz not null default now()
);

comment on table public.screenshot_moderation_audit is
  'Service-role moderation audit ledger for public screenshot feed review decisions.';

alter table public.screenshot_reports enable row level security;
alter table public.screenshot_moderation_audit enable row level security;

grant select, insert, update on public.screenshot_reports to authenticated;
grant all on public.screenshot_reports to service_role;
grant all on public.screenshot_moderation_audit to service_role;

drop policy if exists screenshot_reports_select_own on public.screenshot_reports;
create policy screenshot_reports_select_own
  on public.screenshot_reports
  for select to authenticated
  using (auth.uid() = reporter_user_id);

drop policy if exists screenshot_reports_insert_approved_own on public.screenshot_reports;
create policy screenshot_reports_insert_approved_own
  on public.screenshot_reports
  for insert to authenticated
  with check (
    auth.uid() = reporter_user_id
    and status = 'active'
    and exists (
      select 1
      from public.screenshots shot
      where shot.id = screenshot_reports.screenshot_id
        and shot.is_public = true
        and shot.moderation_status = 'approved'
        and shot.user_id <> auth.uid()
    )
  );

drop policy if exists screenshot_reports_update_own on public.screenshot_reports;
create policy screenshot_reports_update_own
  on public.screenshot_reports
  for update to authenticated
  using (auth.uid() = reporter_user_id)
  with check (auth.uid() = reporter_user_id);

create or replace function public.sync_screenshot_report_state(p_screenshot_id uuid)
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
  from public.screenshot_reports report
  where report.screenshot_id = p_screenshot_id
    and report.status = 'active';

  update public.screenshots as shot
  set report_count = active_report_count,
      moderation_status = case
        when active_report_count >= 3 and shot.moderation_status = 'approved' then 'pending'
        else shot.moderation_status
      end,
      moderation_reason = case
        when active_report_count >= 3 and shot.moderation_status = 'approved' then 'reported-by-community'
        else shot.moderation_reason
      end,
      reviewed_at = case
        when active_report_count >= 3 and shot.moderation_status = 'approved' then null
        else shot.reviewed_at
      end
  where shot.id = p_screenshot_id
    and (
      shot.report_count is distinct from active_report_count
      or (active_report_count >= 3 and shot.moderation_status = 'approved')
    );
end;
$$;

revoke execute on function public.sync_screenshot_report_state(uuid)
  from public, anon, authenticated;
grant execute on function public.sync_screenshot_report_state(uuid)
  to service_role;

create or replace function public.sync_screenshot_report_state_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_screenshot_report_state(old.screenshot_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.screenshot_id is distinct from new.screenshot_id then
    perform public.sync_screenshot_report_state(old.screenshot_id);
  end if;

  perform public.sync_screenshot_report_state(new.screenshot_id);
  return new;
end;
$$;

revoke execute on function public.sync_screenshot_report_state_trigger()
  from public, anon, authenticated;
grant execute on function public.sync_screenshot_report_state_trigger()
  to service_role;

drop trigger if exists sync_screenshot_report_state_after_write
  on public.screenshot_reports;
create trigger sync_screenshot_report_state_after_write
  after insert or update or delete on public.screenshot_reports
  for each row execute function public.sync_screenshot_report_state_trigger();

create or replace function public.enforce_screenshot_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.screenshot_reports report
    where report.reporter_user_id = new.reporter_user_id
      and report.created_at >= now() - interval '1 hour'
      and report.status = 'active'
  ) >= 10 then
    raise exception 'Screenshot report rate limit exceeded';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_screenshot_report_rate_limit()
  from public, anon, authenticated;
grant execute on function public.enforce_screenshot_report_rate_limit()
  to service_role;

drop trigger if exists enforce_screenshot_report_rate_limit_before_insert
  on public.screenshot_reports;
create trigger enforce_screenshot_report_rate_limit_before_insert
  before insert on public.screenshot_reports
  for each row execute function public.enforce_screenshot_report_rate_limit();

create or replace function public.prevent_screenshot_moderation_tampering()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and (
    new.moderation_status is distinct from old.moderation_status
    or new.moderation_reason is distinct from old.moderation_reason
    or new.report_count is distinct from old.report_count
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
  ) then
    raise exception 'Screenshot moderation fields require service role review';
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_screenshot_moderation_tampering()
  from public, anon, authenticated;
grant execute on function public.prevent_screenshot_moderation_tampering()
  to service_role;

drop trigger if exists prevent_screenshot_moderation_tampering_before_update
  on public.screenshots;
create trigger prevent_screenshot_moderation_tampering_before_update
  before update of moderation_status, moderation_reason, report_count, reviewed_by, reviewed_at
  on public.screenshots
  for each row execute function public.prevent_screenshot_moderation_tampering();

create or replace function public.report_screenshot(
  p_screenshot_id uuid,
  p_reason text,
  p_details text default null
)
returns table (
  screenshot_id uuid,
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
    raise exception 'Sign in to report screenshots';
  end if;

  if not exists (
    select 1
    from public.screenshots shot
    where shot.id = p_screenshot_id
      and shot.is_public = true
      and shot.moderation_status = 'approved'
      and shot.user_id <> caller_id
  ) then
    raise exception 'Screenshot is not available for reporting';
  end if;

  normalized_reason := case
    when p_reason in ('spam', 'harassment', 'explicit', 'spoiler', 'copyright', 'private_data', 'other')
      then p_reason
    else 'other'
  end;
  normalized_details := nullif(left(trim(coalesce(p_details, '')), 2000), '');

  insert into public.screenshot_reports (
    screenshot_id,
    reporter_user_id,
    reason,
    details,
    status
  )
  values (
    p_screenshot_id,
    caller_id,
    normalized_reason,
    normalized_details,
    'active'
  )
  on conflict on constraint screenshot_reports_unique_reporter
  do update set
    reason = excluded.reason,
    details = excluded.details,
    status = 'active',
    updated_at = now(),
    resolved_at = null;

  perform public.sync_screenshot_report_state(p_screenshot_id);

  return query
  select
    shot.id as screenshot_id,
    shot.report_count,
    shot.moderation_status,
    report.status as report_status
  from public.screenshots shot
  join public.screenshot_reports report
    on report.screenshot_id = shot.id
   and report.reporter_user_id = caller_id
  where shot.id = p_screenshot_id;
end;
$$;

grant execute on function public.report_screenshot(uuid, text, text)
  to authenticated;

create or replace function public.review_screenshot(
  p_screenshot_id uuid,
  p_status text,
  p_reason text default null,
  p_reviewer_id uuid default null
)
returns table (
  screenshot_id uuid,
  moderation_status text,
  report_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_status text;
  previous_status text;
  current_reports integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Screenshot review requires service role';
  end if;

  normalized_status := case
    when p_status in ('approved', 'pending', 'rejected') then p_status
    else null
  end;

  if normalized_status is null then
    raise exception 'Screenshot review status must be approved, pending, or rejected';
  end if;

  select shot.moderation_status, shot.report_count
  into previous_status, current_reports
  from public.screenshots shot
  where shot.id = p_screenshot_id
  for update;

  if previous_status is null then
    raise exception 'Screenshot not found for review';
  end if;

  update public.screenshots as shot
  set moderation_status = normalized_status,
      moderation_reason = nullif(left(trim(coalesce(p_reason, '')), 500), ''),
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      report_count = case when normalized_status = 'approved' then 0 else shot.report_count end
  where shot.id = p_screenshot_id
  returning shot.report_count into current_reports;

  if normalized_status = 'approved' then
    update public.screenshot_reports as report
    set status = 'resolved',
        resolved_at = now(),
        updated_at = now()
    where report.screenshot_id = p_screenshot_id
      and report.status = 'active';
    current_reports := 0;
  end if;

  insert into public.screenshot_moderation_audit (
    screenshot_id,
    reviewer_id,
    previous_status,
    new_status,
    reason,
    report_count_snapshot
  )
  values (
    p_screenshot_id,
    p_reviewer_id,
    previous_status,
    normalized_status,
    nullif(left(trim(coalesce(p_reason, '')), 500), ''),
    current_reports
  );

  return query select p_screenshot_id, normalized_status, current_reports;
end;
$$;

revoke execute on function public.review_screenshot(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.review_screenshot(uuid, text, text, uuid)
  to service_role;

create or replace function public.list_public_screenshot_feed_ranked(
  p_limit integer default 12
)
returns table (
  id uuid,
  user_id uuid,
  game_id uuid,
  storage_path text,
  thumbnail_path text,
  caption text,
  width smallint,
  height smallint,
  size_bytes integer,
  is_public boolean,
  created_at timestamptz,
  like_count bigint,
  moderation_status text,
  report_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    shot.id,
    shot.user_id,
    shot.game_id,
    shot.storage_path,
    shot.thumbnail_path,
    shot.caption,
    shot.width,
    shot.height,
    shot.size_bytes,
    shot.is_public,
    shot.created_at,
    count(like_row.user_id)::bigint as like_count,
    shot.moderation_status,
    shot.report_count
  from public.screenshots shot
  left join public.screenshot_likes like_row
    on like_row.screenshot_id = shot.id
  where shot.is_public = true
    and shot.moderation_status = 'approved'
  group by
    shot.id,
    shot.user_id,
    shot.game_id,
    shot.storage_path,
    shot.thumbnail_path,
    shot.caption,
    shot.width,
    shot.height,
    shot.size_bytes,
    shot.is_public,
    shot.created_at,
    shot.moderation_status,
    shot.report_count
  order by count(like_row.user_id) desc, shot.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 48);
$$;

grant execute on function public.list_public_screenshot_feed_ranked(integer)
  to anon, authenticated;

drop policy if exists screenshots_read_public on public.screenshots;
create policy screenshots_read_public
  on public.screenshots
  for select to anon, authenticated
  using (
    (is_public = true and moderation_status = 'approved')
    or auth.uid() = user_id
  );

drop policy if exists screenshot_likes_read_visible on public.screenshot_likes;
create policy screenshot_likes_read_visible on public.screenshot_likes
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.screenshots shot
      where shot.id = screenshot_likes.screenshot_id
        and (
          (shot.is_public = true and shot.moderation_status = 'approved')
          or auth.uid() = shot.user_id
        )
    )
  );

drop policy if exists screenshot_likes_insert_visible_own on public.screenshot_likes;
create policy screenshot_likes_insert_visible_own on public.screenshot_likes
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.screenshots shot
      where shot.id = screenshot_likes.screenshot_id
        and shot.is_public = true
        and shot.moderation_status = 'approved'
    )
  );

drop policy if exists screenshots_storage_read_visible on storage.objects;
create policy screenshots_storage_read_visible on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'screenshots'
    and (
      (
        auth.uid() is not null
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      or exists (
        select 1
        from public.screenshots shot
        where (shot.storage_path = storage.objects.name or shot.thumbnail_path = storage.objects.name)
          and shot.is_public = true
          and shot.moderation_status = 'approved'
      )
    )
  );
