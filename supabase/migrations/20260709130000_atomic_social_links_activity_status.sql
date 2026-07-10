-- Replace social links inside one database transaction and allow real text-only
-- activity posts without overloading a game lifecycle event.

create or replace function public.replace_my_social_links(links_input jsonb default '[]'::jsonb)
returns setof public.user_social_links
language plpgsql
security invoker
volatile
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_links jsonb := coalesce(links_input, '[]'::jsonb);
begin
  if current_user_id is null then
    raise exception 'Authentication required to replace social links'
      using errcode = '42501';
  end if;

  if jsonb_typeof(normalized_links) <> 'array' then
    raise exception 'Social links payload must be a JSON array'
      using errcode = '22023';
  end if;

  if jsonb_array_length(normalized_links) > 16 then
    raise exception 'Social links payload may contain at most 16 entries'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(normalized_links) as entry(link)
    where jsonb_typeof(link) <> 'object'
      or jsonb_typeof(link -> 'platform') is distinct from 'string'
      or char_length(btrim(link ->> 'platform')) not between 1 and 32
      or jsonb_typeof(link -> 'url') is distinct from 'string'
      or char_length(btrim(link ->> 'url')) = 0
      or (
        link ? 'label'
        and jsonb_typeof(link -> 'label') not in ('string', 'null')
      )
      or char_length(coalesce(link ->> 'label', '')) > 64
      or (
        link ? 'sort_order'
        and (
          jsonb_typeof(link -> 'sort_order') <> 'number'
          or (link ->> 'sort_order') !~ '^[0-9]+$'
        )
      )
      or (
        link ? 'visibility'
        and coalesce(link ->> 'visibility', '') not in ('public', 'friends_only', 'private')
      )
  ) then
    raise exception 'Social links payload contains an invalid entry'
      using errcode = '22023';
  end if;

  -- Serialize replacements for the same account, including the initially-empty
  -- case where there is no existing social-link row to lock.
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  delete from public.user_social_links
  where user_id = current_user_id;

  insert into public.user_social_links (
    user_id,
    platform,
    label,
    url,
    sort_order,
    visibility
  )
  select
    current_user_id,
    btrim(link ->> 'platform'),
    nullif(btrim(link ->> 'label'), ''),
    btrim(link ->> 'url'),
    coalesce((link ->> 'sort_order')::integer, ordinality::integer - 1),
    coalesce(link ->> 'visibility', 'public')
  from jsonb_array_elements(normalized_links) with ordinality as entries(link, ordinality);

  return query
  select social_link.*
  from public.user_social_links as social_link
  where social_link.user_id = current_user_id
  order by social_link.sort_order, social_link.id;
end;
$$;

revoke all on function public.replace_my_social_links(jsonb) from public;
revoke all on function public.replace_my_social_links(jsonb) from anon;
grant execute on function public.replace_my_social_links(jsonb) to authenticated;

create or replace function public.is_current_user_friend(profile_user_id uuid)
returns boolean
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and profile_user_id is not null
    and profile_user_id <> auth.uid()
    and exists (
      select 1
      from public.friendships as friendship
      where friendship.status = 'accepted'
        and (
          (friendship.requester_id = auth.uid() and friendship.addressee_id = profile_user_id)
          or (friendship.addressee_id = auth.uid() and friendship.requester_id = profile_user_id)
        )
    );
$$;

revoke all on function public.is_current_user_friend(uuid) from public;
revoke all on function public.is_current_user_friend(uuid) from anon;
grant execute on function public.is_current_user_friend(uuid) to authenticated;

alter table public.activity_feed
  drop constraint if exists activity_feed_type_check;

alter table public.activity_feed
  add constraint activity_feed_type_check
  check (type in ('status', 'game_start', 'game_stop', 'achievement_unlocked', 'screenshot_taken'));

alter table public.activity_feed
  drop constraint if exists activity_feed_status_text_check;

alter table public.activity_feed
  add constraint activity_feed_status_text_check
  check (
    type <> 'status'
    or char_length(btrim(coalesce(metadata ->> 'text', ''))) between 1 and 1000
  );

drop policy if exists activity_feed_insert_own on public.activity_feed;
create policy activity_feed_insert_own
  on public.activity_feed
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and type in ('status', 'game_start', 'game_stop', 'screenshot_taken')
  );
