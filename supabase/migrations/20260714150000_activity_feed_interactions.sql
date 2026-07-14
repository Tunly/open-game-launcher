-- Steam-like activity engagement: one Rate Up per viewer and flat comments.
-- Child visibility always follows the parent activity row's current RLS result.

create table if not exists public.activity_reactions (
  activity_id uuid not null references public.activity_feed(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default 'rate_up',
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id),
  constraint activity_reactions_kind_check check (reaction = 'rate_up')
);

create table if not exists public.activity_comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activity_feed(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint activity_comments_body_check
    check (char_length(btrim(body)) between 1 and 1000)
);

create index if not exists activity_comments_activity_created_idx
  on public.activity_comments (activity_id, created_at, id);
create index if not exists activity_comments_author_created_idx
  on public.activity_comments (author_id, created_at desc);

grant select, insert, delete on public.activity_reactions to authenticated;
grant select, insert, delete on public.activity_comments to authenticated;

alter table public.activity_reactions enable row level security;
alter table public.activity_comments enable row level security;

create or replace function public.can_view_activity(target_activity_id uuid)
returns boolean
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.activity_feed as activity
      where activity.id = target_activity_id
    );
$$;

revoke all on function public.can_view_activity(uuid) from public, anon;
grant execute on function public.can_view_activity(uuid) to authenticated;

drop policy if exists activity_reactions_select_visible on public.activity_reactions;
create policy activity_reactions_select_visible on public.activity_reactions
  for select to authenticated
  using (public.can_view_activity(activity_id));

drop policy if exists activity_reactions_insert_own_visible on public.activity_reactions;
create policy activity_reactions_insert_own_visible on public.activity_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and reaction = 'rate_up'
    and public.can_view_activity(activity_id)
  );

drop policy if exists activity_reactions_delete_own on public.activity_reactions;
create policy activity_reactions_delete_own on public.activity_reactions
  for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists activity_comments_select_visible on public.activity_comments;
create policy activity_comments_select_visible on public.activity_comments
  for select to authenticated
  using (public.can_view_activity(activity_id));

drop policy if exists activity_comments_insert_own_visible on public.activity_comments;
create policy activity_comments_insert_own_visible on public.activity_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.can_view_activity(activity_id)
  );

drop policy if exists activity_comments_delete_author_or_activity_owner
  on public.activity_comments;
create policy activity_comments_delete_author_or_activity_owner
  on public.activity_comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1
      from public.activity_feed as activity
      where activity.id = activity_comments.activity_id
        and activity.user_id = auth.uid()
    )
  );

create or replace function public.get_activity_interaction_summaries(
  p_activity_ids uuid[]
)
returns table (
  activity_id uuid,
  reaction_count bigint,
  comment_count bigint,
  reacted_by_current_user boolean
)
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select
    requested.activity_id,
    (
      select count(*)
      from public.activity_reactions as reaction
      where reaction.activity_id = requested.activity_id
    ) as reaction_count,
    (
      select count(*)
      from public.activity_comments as comment
      where comment.activity_id = requested.activity_id
    ) as comment_count,
    exists (
      select 1
      from public.activity_reactions as own_reaction
      where own_reaction.activity_id = requested.activity_id
        and own_reaction.user_id = auth.uid()
    ) as reacted_by_current_user
  from (
    select distinct unnest(coalesce(p_activity_ids, '{}'::uuid[])) as activity_id
  ) as requested
  where public.can_view_activity(requested.activity_id);
$$;

revoke all on function public.get_activity_interaction_summaries(uuid[]) from public, anon;
grant execute on function public.get_activity_interaction_summaries(uuid[]) to authenticated;

create or replace function public.set_activity_rate_up(
  p_activity_id uuid,
  p_active boolean
)
returns table (
  activity_id uuid,
  reaction_count bigint,
  reacted_by_current_user boolean
)
language plpgsql
security invoker
volatile
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.can_view_activity(p_activity_id) then
    raise exception 'Activity is not visible'
      using errcode = '42501';
  end if;

  if coalesce(p_active, false) then
    insert into public.activity_reactions (activity_id, user_id, reaction)
    values (p_activity_id, auth.uid(), 'rate_up')
    on conflict (activity_id, user_id) do nothing;
  else
    delete from public.activity_reactions
    where activity_reactions.activity_id = p_activity_id
      and activity_reactions.user_id = auth.uid();
  end if;

  return query
  select
    p_activity_id,
    (
      select count(*)
      from public.activity_reactions as reaction
      where reaction.activity_id = p_activity_id
    ),
    exists (
      select 1
      from public.activity_reactions as own_reaction
      where own_reaction.activity_id = p_activity_id
        and own_reaction.user_id = auth.uid()
    );
end;
$$;

revoke all on function public.set_activity_rate_up(uuid, boolean) from public, anon;
grant execute on function public.set_activity_rate_up(uuid, boolean) to authenticated;

alter table public.activity_reactions replica identity full;
alter table public.activity_comments replica identity full;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activity_reactions'
  ) then
    alter publication supabase_realtime add table public.activity_reactions;
  end if;

  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activity_comments'
  ) then
    alter publication supabase_realtime add table public.activity_comments;
  end if;
end
$$;
