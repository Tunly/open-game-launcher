-- Harden achievement ingestion around an explicit trusted-relay boundary.
-- Launcher/user JWTs are identity proof only. They must never be sufficient to
-- mutate the global achievement catalog or award profile XP.

alter table public.achievements
  add column if not exists rarity_percent numeric,
  add column if not exists source_provider text,
  add column if not exists source_synced_at timestamptz;

alter table public.achievements
  drop constraint if exists achievements_rarity_percent_check;

alter table public.achievements
  add constraint achievements_rarity_percent_check
  check (
    rarity_percent is null
    or (rarity_percent >= 0 and rarity_percent <= 100)
  );

comment on column public.achievements.rarity_percent is
  'Lossless provider unlock percentage. rarity remains the derived display bucket.';

create table if not exists public.achievement_ingestion_cursors (
  game_id uuid not null references public.games(id) on delete cascade,
  provider text not null,
  last_synced_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (game_id, provider),
  constraint achievement_ingestion_cursors_provider_not_empty
    check (char_length(btrim(provider)) between 1 and 48)
);

comment on table public.achievement_ingestion_cursors is
  'Private service-role cursors that serialize provider catalog snapshots and reject stale writes.';

alter table public.achievement_ingestion_cursors enable row level security;

revoke all on public.achievement_ingestion_cursors
  from public, anon, authenticated;
grant select, insert, update, delete on public.achievement_ingestion_cursors
  to service_role;

-- auto_expose_new_tables=false means the Data API has no implicit table
-- privileges. Keep reads explicit and let RLS decide which rows are visible.
revoke all on public.games, public.achievements, public.user_achievements
  from anon, authenticated;
grant select on public.games, public.achievements
  to anon, authenticated;
grant select on public.user_achievements
  to anon, authenticated;
grant select, insert, update, delete
  on public.games, public.achievements, public.user_achievements
  to service_role;

create or replace function public.has_own_achievement_unlock(
  p_achievement_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.user_achievements own_unlock
      where own_unlock.user_id = auth.uid()
        and own_unlock.achievement_id = p_achievement_id
    );
$$;

revoke execute on function public.has_own_achievement_unlock(uuid)
  from public;
grant execute on function public.has_own_achievement_unlock(uuid)
  to anon, authenticated, service_role;

-- Multiple historic policies are OR-combined by PostgreSQL. Remove every old
-- variant before installing the single effective rule.
drop policy if exists achievements_select_active on public.achievements;
drop policy if exists profile_system_achievements_select_visible
  on public.achievements;
drop policy if exists achievements_select_visible on public.achievements;

create policy achievements_select_visible
  on public.achievements
  for select to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1
      from public.games g
      where g.id = achievements.game_id
        and g.status = 'active'
    )
    and (
      is_hidden = false
      or public.has_own_achievement_unlock(achievements.id)
    )
  );

drop policy if exists user_achievements_select_visible
  on public.user_achievements;
drop policy if exists profile_system_user_achievements_select_visible
  on public.user_achievements;
drop policy if exists user_achievements_select_protected
  on public.user_achievements;

create policy user_achievements_select_protected
  on public.user_achievements
  for select to anon, authenticated
  using (
    auth.uid() = user_id
    or (
      public.can_view_achievements(auth.uid(), user_id)
      and exists (
        select 1
        from public.achievements definition
        inner join public.games game_catalog
          on game_catalog.id = definition.game_id
        where definition.id = user_achievements.achievement_id
          and definition.is_active = true
          and definition.is_hidden = false
          and game_catalog.status = 'active'
      )
    )
  );

-- Remove identifiers written by the previous RPC from every publicly readable
-- JSON surface. Provider/source ids remain; launcher device ids are private
-- local identifiers and have no place in social/profile data.
update public.user_achievements
set metadata = metadata - 'launcher_device_id'
where metadata ? 'launcher_device_id';

update public.user_activity
set data = data - 'launcher_device_id'
where data ? 'launcher_device_id';

update public.activity_feed
set metadata = metadata - 'launcher_device_id'
where metadata ? 'launcher_device_id';

create or replace function public.upsert_trusted_achievement_definitions(
  p_game_id uuid,
  p_provider text,
  p_synced_at timestamptz,
  p_achievements jsonb
)
returns table (
  ingestion_accepted boolean,
  achievement_id uuid,
  achievement_key text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cursor_accepted boolean := false;
  normalized_provider text := lower(btrim(coalesce(p_provider, '')));
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'upsert_trusted_achievement_definitions requires service_role'
      using errcode = '42501';
  end if;

  if char_length(normalized_provider) not between 1 and 48
    or normalized_provider !~ '^[a-z0-9_-]+$'
  then
    raise exception 'p_provider is invalid'
      using errcode = '22023';
  end if;

  if p_synced_at is null or p_synced_at > now() + interval '5 minutes' then
    raise exception 'p_synced_at is required and cannot be in the future'
      using errcode = '22023';
  end if;

  if p_achievements is null
    or jsonb_typeof(p_achievements) <> 'array'
    or jsonb_array_length(p_achievements) = 0
    or jsonb_array_length(p_achievements) > 500
  then
    raise exception 'p_achievements must contain between 1 and 500 rows'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_achievements) as row_data(
      key text,
      name text,
      description text,
      icon_url text,
      points integer,
      rarity text,
      rarity_percent numeric
    )
    where row_data.key is null
      or row_data.key !~ ('^' || normalized_provider || ':')
      or char_length(row_data.key) > 240
      or nullif(btrim(row_data.name), '') is null
      or char_length(row_data.name) > 200
      or coalesce(row_data.points, -1) not between 0 and 1000
      or row_data.rarity not in ('common', 'uncommon', 'rare', 'epic', 'legendary')
      or (
        row_data.rarity_percent is not null
        and row_data.rarity_percent not between 0 and 100
      )
  ) then
    raise exception 'p_achievements contains an invalid definition'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_achievements) as row_data(key text)
    group by row_data.key
    having count(*) > 1
  ) then
    raise exception 'p_achievements contains duplicate keys'
      using errcode = '22023';
  end if;

  with claimed_cursor as (
    insert into public.achievement_ingestion_cursors (
      game_id,
      provider,
      last_synced_at,
      updated_at
    )
    values (p_game_id, normalized_provider, p_synced_at, now())
    on conflict (game_id, provider) do update
    set
      last_synced_at = excluded.last_synced_at,
      updated_at = now()
    where achievement_ingestion_cursors.last_synced_at <= excluded.last_synced_at
    returning true as accepted
  )
  select coalesce(bool_or(claimed_cursor.accepted), false)
  into cursor_accepted
  from claimed_cursor;

  if not cursor_accepted then
    return query
    select false, null::uuid, null::text;
    return;
  end if;

  insert into public.achievements (
    description,
    game_id,
    icon_url,
    is_active,
    key,
    name,
    points,
    rarity,
    rarity_percent,
    source_provider,
    source_synced_at,
    updated_at
  )
  select
    row_data.description,
    p_game_id,
    row_data.icon_url,
    true,
    row_data.key,
    row_data.name,
    row_data.points,
    row_data.rarity,
    row_data.rarity_percent,
    normalized_provider,
    p_synced_at,
    now()
  from jsonb_to_recordset(p_achievements) as row_data(
    key text,
    name text,
    description text,
    icon_url text,
    points integer,
    rarity text,
    rarity_percent numeric
  )
  on conflict on constraint achievements_game_key_unique do update
  set
    description = excluded.description,
    icon_url = excluded.icon_url,
    is_active = true,
    name = excluded.name,
    points = excluded.points,
    rarity = excluded.rarity,
    rarity_percent = excluded.rarity_percent,
    source_provider = excluded.source_provider,
    source_synced_at = excluded.source_synced_at,
    updated_at = now()
  where achievements.source_synced_at is null
    or achievements.source_synced_at <= excluded.source_synced_at;

  return query
  select
    true,
    definition.id,
    definition.key
  from public.achievements definition
  inner join jsonb_to_recordset(p_achievements) as requested(key text)
    on requested.key = definition.key
  where definition.game_id = p_game_id;
end;
$$;

revoke execute on function public.upsert_trusted_achievement_definitions(
  uuid,
  text,
  timestamptz,
  jsonb
) from public, anon, authenticated;

grant execute on function public.upsert_trusted_achievement_definitions(
  uuid,
  text,
  timestamptz,
  jsonb
) to service_role;

-- Replace the unlock RPC so XP always comes from the trusted catalog row,
-- never from caller JSON, and no launcher device id reaches public metadata.
create or replace function public.record_trusted_achievement_unlocks(
  p_user_id uuid,
  p_game_id uuid,
  p_game_title text,
  p_launcher_device_id text,
  p_unlocks jsonb
)
returns table (
  recorded_achievement_id uuid,
  recorded_achievement_key text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'record_trusted_achievement_unlocks requires service_role'
      using errcode = '42501';
  end if;

  if p_unlocks is null or jsonb_typeof(p_unlocks) <> 'array' then
    raise exception 'p_unlocks must be a JSON array'
      using errcode = '22023';
  end if;

  return query
  with raw_source as (
    select
      definition.id as achievement_id,
      definition.key as achievement_key,
      unlock_row.unlocked_at,
      definition.points,
      definition.name as achievement_name,
      coalesce(unlock_row.metadata, '{}'::jsonb) - 'launcher_device_id' as metadata
    from jsonb_to_recordset(p_unlocks) as unlock_row(
      achievement_id uuid,
      achievement_key text,
      unlocked_at timestamptz,
      points integer,
      achievement_name text,
      metadata jsonb
    )
    inner join public.achievements definition
      on definition.id = unlock_row.achievement_id
      and definition.game_id = p_game_id
      and definition.key = unlock_row.achievement_key
      and definition.is_active = true
    where unlock_row.unlocked_at is not null
      and unlock_row.unlocked_at <= now() + interval '5 minutes'
  ),
  source as (
    select distinct on (raw_source.achievement_id)
      raw_source.achievement_id,
      raw_source.achievement_key,
      raw_source.unlocked_at,
      raw_source.points,
      raw_source.achievement_name,
      raw_source.metadata
    from raw_source
    order by raw_source.achievement_id, raw_source.unlocked_at
  ),
  inserted as (
    insert into public.user_achievements (
      achievement_id,
      game_id,
      metadata,
      progress,
      unlocked_at,
      user_id
    )
    select
      source.achievement_id,
      p_game_id,
      source.metadata,
      100,
      source.unlocked_at,
      p_user_id
    from source
    on conflict on constraint user_achievements_user_achievement_unique do nothing
    returning user_achievements.achievement_id
  ),
  inserted_source as (
    select
      source.achievement_id,
      source.achievement_key,
      source.unlocked_at,
      source.points,
      source.achievement_name,
      source.metadata
    from source
    inner join inserted
      on inserted.achievement_id = source.achievement_id
  ),
  xp_delta as (
    select coalesce(sum(inserted_source.points), 0)::integer as value
    from inserted_source
  ),
  profile_update as (
    update public.profiles
    set
      profile_xp = greatest(0, profiles.profile_xp + xp_delta.value),
      profile_level = greatest(
        1,
        floor(greatest(0, profiles.profile_xp + xp_delta.value) / 1000)::integer + 1
      ),
      updated_at = now()
    from xp_delta
    where profiles.id = p_user_id
      and xp_delta.value > 0
    returning profiles.id
  ),
  user_activity_insert as (
    insert into public.user_activity (
      achievement_id,
      data,
      game_id,
      type,
      user_id,
      visibility
    )
    select
      inserted_source.achievement_id,
      jsonb_strip_nulls(
        inserted_source.metadata || jsonb_build_object(
          'achievement_name', inserted_source.achievement_name
        )
      ),
      p_game_id,
      'achievement_unlocked',
      p_user_id,
      'friends_only'
    from inserted_source
    returning user_activity.id
  ),
  activity_feed_insert as (
    insert into public.activity_feed (
      achievement_name,
      game_id,
      game_title,
      metadata,
      type,
      user_id,
      visibility
    )
    select
      inserted_source.achievement_name,
      p_game_id,
      p_game_title,
      inserted_source.metadata,
      'achievement_unlocked',
      p_user_id,
      'friends_only'
    from inserted_source
    returning activity_feed.id
  )
  select
    inserted_source.achievement_id as recorded_achievement_id,
    inserted_source.achievement_key as recorded_achievement_key
  from inserted_source;
end;
$$;

revoke execute on function public.record_trusted_achievement_unlocks(
  uuid,
  uuid,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.record_trusted_achievement_unlocks(
  uuid,
  uuid,
  text,
  text,
  jsonb
) to service_role;
