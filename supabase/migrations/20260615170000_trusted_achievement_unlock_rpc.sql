-- Record trusted achievement unlock side effects in one transaction.
-- Definitions are still resolved by the Edge function; new unlocks, XP, and
-- activity rows must commit or roll back together.

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
      unlock_row.achievement_id,
      unlock_row.achievement_key,
      unlock_row.unlocked_at,
      greatest(coalesce(unlock_row.points, 0), 0)::integer as points,
      unlock_row.achievement_name,
      coalesce(unlock_row.metadata, '{}'::jsonb) as metadata
    from jsonb_to_recordset(p_unlocks) as unlock_row(
      achievement_id uuid,
      achievement_key text,
      unlocked_at timestamptz,
      points integer,
      achievement_name text,
      metadata jsonb
    )
    where unlock_row.achievement_id is not null
      and unlock_row.achievement_key is not null
      and unlock_row.unlocked_at is not null
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
      jsonb_strip_nulls(
        source.metadata || jsonb_build_object(
          'launcher_device_id', p_launcher_device_id
        )
      ),
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
          'achievement_name', inserted_source.achievement_name,
          'launcher_device_id', p_launcher_device_id
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
      jsonb_strip_nulls(
        inserted_source.metadata || jsonb_build_object(
          'launcher_device_id', p_launcher_device_id
        )
      ),
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
