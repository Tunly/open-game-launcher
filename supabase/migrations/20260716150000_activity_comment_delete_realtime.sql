-- Preserve the parent activity id for realtime comment-delete notifications.
-- Supabase Postgres Changes exposes only primary-key columns from DELETE old rows
-- when RLS is enabled, so a minimal trigger-backed INSERT event is used instead.

create table if not exists public.activity_comment_deletions (
  event_id uuid primary key default gen_random_uuid(),
  comment_id uuid not null,
  activity_id uuid not null,
  deleted_at timestamptz not null default now()
);

create index if not exists activity_comment_deletions_activity_deleted_idx
  on public.activity_comment_deletions (activity_id, deleted_at desc);
create index if not exists activity_comment_deletions_deleted_idx
  on public.activity_comment_deletions (deleted_at);

alter table public.activity_comment_deletions enable row level security;

revoke all on table public.activity_comment_deletions from public, anon, authenticated;
grant select on table public.activity_comment_deletions to authenticated;

drop policy if exists activity_comment_deletions_select_visible
  on public.activity_comment_deletions;
create policy activity_comment_deletions_select_visible
  on public.activity_comment_deletions
  for select to authenticated
  using (
    deleted_at >= now() - interval '7 days'
    and public.can_view_activity(activity_id)
  );

create or replace function public.capture_activity_comment_deletion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Keep the event log short without requiring pg_cron to be installed. The RLS
  -- policy above enforces the same retention window even between cleanup runs.
  delete from public.activity_comment_deletions
  where deleted_at < now() - interval '7 days';

  insert into public.activity_comment_deletions (comment_id, activity_id)
  values (old.id, old.activity_id);
  return old;
end;
$$;

revoke all on function public.capture_activity_comment_deletion() from public, anon, authenticated;

drop trigger if exists capture_activity_comment_deletion
  on public.activity_comments;
create trigger capture_activity_comment_deletion
  after delete on public.activity_comments
  for each row
  execute function public.capture_activity_comment_deletion();

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activity_comment_deletions'
  ) then
    alter publication supabase_realtime add table public.activity_comment_deletions;
  end if;
end
$$;
