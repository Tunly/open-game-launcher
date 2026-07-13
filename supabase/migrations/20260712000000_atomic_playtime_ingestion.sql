-- Make trusted playtime ingestion atomic and retry-safe. The Edge function
-- authenticates the launcher JWT, then supplies that verified user id through
-- the service-role-only RPC. Session ownership and payload identity are
-- decided in the same transaction as all aggregate/session writes.

alter table public.user_game_stats
  add column if not exists ingestion_observed_at timestamptz;

comment on column public.user_game_stats.ingestion_observed_at is
  'Client observation time of the last trusted aggregate accepted by ingest_trusted_playtime; older retries cannot overwrite newer state.';

create schema if not exists private;

create table if not exists private.playtime_aggregate_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  game_id uuid not null references public.games(id) on delete cascade,
  payload jsonb not null,
  applied boolean not null default false,
  accepted_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

comment on table private.playtime_aggregate_operations is
  'Idempotency ledger for atomic playtime aggregate snapshots, corrections, and session-count deltas.';

revoke all on table private.playtime_aggregate_operations
  from public, anon, authenticated, service_role;

-- Aggregate fields now move only through the serialized RPC. Keep the
-- unrelated owner-editable preferences available without permitting a direct
-- write to bypass freshness ordering or atomic session-count increments.
revoke insert, update on table public.user_game_stats from authenticated;
grant insert (
  id,
  user_id,
  game_id,
  last_installed_at,
  is_favorite,
  user_notes,
  created_at,
  updated_at
) on table public.user_game_stats to authenticated;
grant update (
  last_installed_at,
  is_favorite,
  user_notes,
  created_at,
  updated_at
) on table public.user_game_stats to authenticated;

create or replace function public.ingest_trusted_playtime(
  p_authenticated_user_id uuid,
  p_aggregate jsonb,
  p_sessions jsonb
)
returns table (
  accepted boolean,
  aggregate_pushed boolean,
  sessions_pushed integer,
  owner_conflict_session_ids uuid[],
  payload_conflict_session_ids uuid[]
)
language plpgsql
security definer
volatile
set search_path = public, pg_temp
as $$
declare
  request_role text := coalesce(auth.role(), '');
  normalized_sessions jsonb := coalesce(p_sessions, '[]'::jsonb);
  session_id_to_lock uuid;
  requested_session_count integer := 0;
  aggregate_write_count integer := 0;
  aggregate_operation_id uuid;
  aggregate_operation_payload jsonb;
  aggregate_operation_is_new boolean := false;
  aggregate_operation_applied boolean := false;
  duplicate_payload_conflicts uuid[] := array[]::uuid[];
  stored_payload_conflicts uuid[] := array[]::uuid[];
begin
  if request_role not in ('authenticated', 'service_role') then
    raise exception 'ingest_trusted_playtime requires an authenticated role'
      using errcode = '42501';
  end if;

  if request_role = 'authenticated'
     and p_authenticated_user_id is distinct from auth.uid() then
    raise exception 'Authenticated aggregate ingestion must be caller-bound'
      using errcode = '42501';
  end if;

  if p_authenticated_user_id is null
    or not exists (
      select 1
      from auth.users as authenticated_user
      where authenticated_user.id = p_authenticated_user_id
    )
  then
    raise exception 'p_authenticated_user_id must identify an authenticated user'
      using errcode = '22023';
  end if;

  if p_aggregate is not null and jsonb_typeof(p_aggregate) <> 'object' then
    raise exception 'p_aggregate must be a JSON object or null'
      using errcode = '22023';
  end if;

  if jsonb_typeof(normalized_sessions) <> 'array'
    or jsonb_array_length(normalized_sessions) > 100
  then
    raise exception 'p_sessions must be a JSON array of at most 100 rows'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(normalized_sessions) as session_value(value)
    where jsonb_typeof(session_value.value) <> 'object'
  ) then
    raise exception 'p_sessions must contain only JSON objects'
      using errcode = '22023';
  end if;

  if p_aggregate is null and jsonb_array_length(normalized_sessions) = 0 then
    raise exception 'at least one aggregate or session row is required'
      using errcode = '22023';
  end if;

  if request_role = 'authenticated'
     and (
       p_aggregate is null
       or jsonb_array_length(normalized_sessions) <> 0
     ) then
    raise exception 'Authenticated callers may ingest only their own aggregate'
      using errcode = '42501';
  end if;

  if p_aggregate is not null and (
    nullif(p_aggregate ->> 'game_id', '') is null
    or nullif(p_aggregate ->> 'playtime_minutes', '') is null
    or nullif(p_aggregate ->> 'observed_at', '') is null
    or nullif(p_aggregate ->> 'operation_id', '') is null
    or coalesce(p_aggregate ->> 'operation', '') not in ('snapshot', 'correction')
    or p_aggregate ? 'total_sessions'
    or (p_aggregate ->> 'playtime_minutes')::integer not between 0 and 10000000
    or (p_aggregate ->> 'observed_at')::timestamptz > now() + interval '5 minutes'
    or coalesce((p_aggregate ->> 'session_count_delta')::integer, 0)
      not between 0 and 100
    or (
      p_aggregate ->> 'operation' = 'correction'
      and coalesce((p_aggregate ->> 'session_count_delta')::integer, 0) <> 0
    )
    or (
      p_aggregate ? 'installed_version'
      and p_aggregate -> 'installed_version' <> 'null'::jsonb
      and char_length(p_aggregate ->> 'installed_version') > 128
    )
  ) then
    raise exception 'p_aggregate contains invalid playtime values'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(normalized_sessions) as requested(
      id uuid,
      game_id uuid,
      launcher_device_id uuid,
      started_at timestamptz,
      ended_at timestamptz,
      duration_minutes integer,
      platform text
    )
    where requested.id is null
      or requested.game_id is null
      or requested.started_at is null
      or requested.ended_at < requested.started_at
      or requested.duration_minutes not between 0 and 10000000
      or requested.platform not in ('windows', 'linux', 'macos', 'web', 'unknown')
  ) then
    raise exception 'p_sessions contains an invalid session row'
      using errcode = '22023';
  end if;

  select count(distinct requested.id)::integer
  into requested_session_count
  from jsonb_to_recordset(normalized_sessions) as requested(id uuid);

  -- A single request may repeat an id only when every immutable field is the
  -- same. Detect contradictory duplicates before any database mutation.
  select coalesce(
    array_agg(conflicting.id order by conflicting.id),
    array[]::uuid[]
  )
  into duplicate_payload_conflicts
  from (
    select variants.id
    from (
      select distinct
        requested.id,
        requested.game_id,
        requested.launcher_device_id,
        requested.started_at,
        requested.ended_at,
        requested.duration_minutes,
        requested.platform
      from jsonb_to_recordset(normalized_sessions) as requested(
        id uuid,
        game_id uuid,
        launcher_device_id uuid,
        started_at timestamptz,
        ended_at timestamptz,
        duration_minutes integer,
        platform text
      )
    ) as variants
    group by variants.id
    having count(*) > 1
  ) as conflicting;

  if cardinality(duplicate_payload_conflicts) > 0 then
    accepted := false;
    aggregate_pushed := false;
    sessions_pushed := 0;
    owner_conflict_session_ids := array[]::uuid[];
    payload_conflict_session_ids := duplicate_payload_conflicts;
    return next;
    return;
  end if;

  if p_aggregate is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'ingest_trusted_playtime:aggregate:' ||
          p_authenticated_user_id::text || ':' ||
          (p_aggregate ->> 'game_id'),
        0
      )
    );
  end if;

  -- Serialize requested ids in a deterministic order, including ids that do
  -- not exist yet. The unique constraint remains the final arbiter if another
  -- writer does not participate in this advisory-lock protocol.
  for session_id_to_lock in
    select distinct requested.id
    from jsonb_to_recordset(normalized_sessions) as requested(id uuid)
    order by requested.id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'ingest_trusted_playtime:' || session_id_to_lock::text,
        0
      )
    );
  end loop;

  -- This nested block is a savepoint. If a non-participating concurrent
  -- writer wins an id race, the post-insert comparison raises P4090; the
  -- exception handler returns conflict details after rolling back every write
  -- made inside the block.
  begin
    insert into public.game_sessions (
      id,
      user_id,
      game_id,
      launcher_device_id,
      started_at,
      ended_at,
      duration_minutes,
      platform
    )
    select distinct on (requested.id)
      requested.id,
      p_authenticated_user_id,
      requested.game_id,
      requested.launcher_device_id,
      requested.started_at,
      requested.ended_at,
      requested.duration_minutes,
      requested.platform
    from jsonb_to_recordset(normalized_sessions) as requested(
      id uuid,
      game_id uuid,
      launcher_device_id uuid,
      started_at timestamptz,
      ended_at timestamptz,
      duration_minutes integer,
      platform text
    )
    order by requested.id
    on conflict (id) do nothing;

    -- Hold every existing requested row through the end of the transaction so
    -- direct table updates cannot invalidate the identity comparison.
    perform stored.id
    from public.game_sessions as stored
    where stored.id in (
      select distinct requested.id
      from jsonb_to_recordset(normalized_sessions) as requested(id uuid)
    )
    order by stored.id
    for update;

    select coalesce(
      array_agg(distinct stored.id order by stored.id),
      array[]::uuid[]
    )
    into owner_conflict_session_ids
    from public.game_sessions as stored
    inner join jsonb_to_recordset(normalized_sessions) as requested(
      id uuid,
      game_id uuid,
      launcher_device_id uuid,
      started_at timestamptz,
      ended_at timestamptz,
      duration_minutes integer,
      platform text
    ) on requested.id = stored.id
    where stored.user_id <> p_authenticated_user_id;

    select coalesce(
      array_agg(distinct stored.id order by stored.id),
      array[]::uuid[]
    )
    into stored_payload_conflicts
    from public.game_sessions as stored
    inner join jsonb_to_recordset(normalized_sessions) as requested(
      id uuid,
      game_id uuid,
      launcher_device_id uuid,
      started_at timestamptz,
      ended_at timestamptz,
      duration_minutes integer,
      platform text
    ) on requested.id = stored.id
    where stored.user_id = p_authenticated_user_id
      and row(
        stored.game_id,
        stored.launcher_device_id,
        stored.started_at,
        stored.ended_at,
        stored.duration_minutes,
        stored.platform
      ) is distinct from row(
        requested.game_id,
        requested.launcher_device_id,
        requested.started_at,
        requested.ended_at,
        requested.duration_minutes,
        requested.platform
      );

    payload_conflict_session_ids := stored_payload_conflicts;

    if cardinality(owner_conflict_session_ids) > 0
      or cardinality(payload_conflict_session_ids) > 0
    then
      raise exception 'playtime session id conflict'
        using errcode = 'P4090';
    end if;

    if p_aggregate is not null then
      aggregate_operation_id := (p_aggregate ->> 'operation_id')::uuid;

      insert into private.playtime_aggregate_operations (
        user_id,
        operation_id,
        game_id,
        payload
      )
      values (
        p_authenticated_user_id,
        aggregate_operation_id,
        (p_aggregate ->> 'game_id')::uuid,
        p_aggregate
      )
      on conflict (user_id, operation_id) do nothing;

      get diagnostics aggregate_write_count = row_count;
      aggregate_operation_is_new := aggregate_write_count > 0;

      if aggregate_operation_is_new then
      insert into public.user_game_stats as stats (
        user_id,
        game_id,
        playtime_minutes,
        total_sessions,
        first_played_at,
        last_played_at,
        installed_version,
        ingestion_observed_at,
        updated_at
      )
      values (
        p_authenticated_user_id,
        (p_aggregate ->> 'game_id')::uuid,
        (p_aggregate ->> 'playtime_minutes')::integer,
        coalesce((p_aggregate ->> 'session_count_delta')::integer, 0),
        (p_aggregate ->> 'first_played_at')::timestamptz,
        (p_aggregate ->> 'last_played_at')::timestamptz,
        p_aggregate ->> 'installed_version',
        (p_aggregate ->> 'observed_at')::timestamptz,
        now()
      )
      on conflict on constraint user_game_stats_user_game_unique do update
      set
        playtime_minutes = case
          when p_aggregate ->> 'operation' = 'correction'
            then excluded.playtime_minutes
          when stats.ingestion_observed_at is null
            or excluded.ingestion_observed_at >= stats.ingestion_observed_at
            then greatest(stats.playtime_minutes, excluded.playtime_minutes)
          else stats.playtime_minutes
        end,
        total_sessions = stats.total_sessions
          + coalesce((p_aggregate ->> 'session_count_delta')::integer, 0),
        first_played_at = case
          when (
            p_aggregate ->> 'operation' = 'correction'
            or stats.ingestion_observed_at is null
            or excluded.ingestion_observed_at >= stats.ingestion_observed_at
          ) and p_aggregate ? 'first_played_at'
            then case
              when stats.first_played_at is null then excluded.first_played_at
              when excluded.first_played_at is null then stats.first_played_at
              else least(stats.first_played_at, excluded.first_played_at)
            end
          else stats.first_played_at
        end,
        last_played_at = case
          when (
            p_aggregate ->> 'operation' = 'correction'
            or stats.ingestion_observed_at is null
            or excluded.ingestion_observed_at >= stats.ingestion_observed_at
          ) and p_aggregate ? 'last_played_at'
            then case
              when stats.last_played_at is null then excluded.last_played_at
              when excluded.last_played_at is null then stats.last_played_at
              else greatest(stats.last_played_at, excluded.last_played_at)
            end
          else stats.last_played_at
        end,
        installed_version = case
          when (
            p_aggregate ->> 'operation' = 'correction'
            or stats.ingestion_observed_at is null
            or excluded.ingestion_observed_at >= stats.ingestion_observed_at
          ) and p_aggregate ? 'installed_version'
            then excluded.installed_version
          else stats.installed_version
        end,
        ingestion_observed_at = case
          when stats.ingestion_observed_at is null
            or excluded.ingestion_observed_at >= stats.ingestion_observed_at
            then excluded.ingestion_observed_at
          else stats.ingestion_observed_at
        end,
        updated_at = now()
      where p_aggregate ->> 'operation' = 'correction'
        or coalesce((p_aggregate ->> 'session_count_delta')::integer, 0) > 0
        or stats.ingestion_observed_at is null
        or excluded.ingestion_observed_at >= stats.ingestion_observed_at;

      get diagnostics aggregate_write_count = row_count;
        aggregate_operation_applied := aggregate_write_count > 0;

        update private.playtime_aggregate_operations as operation
        set applied = aggregate_operation_applied
        where operation.user_id = p_authenticated_user_id
          and operation.operation_id = aggregate_operation_id;
      else
        select
          operation.payload,
          operation.applied
        into
          aggregate_operation_payload,
          aggregate_operation_applied
        from private.playtime_aggregate_operations as operation
        where operation.user_id = p_authenticated_user_id
          and operation.operation_id = aggregate_operation_id;

        if aggregate_operation_payload is distinct from p_aggregate then
          raise exception 'playtime aggregate operation id was reused with a different payload'
            using errcode = '22023';
        end if;
      end if;
    end if;

    accepted := true;
    aggregate_pushed := aggregate_operation_applied;
    sessions_pushed := requested_session_count;
    owner_conflict_session_ids := array[]::uuid[];
    payload_conflict_session_ids := array[]::uuid[];
    return next;
  exception
    when sqlstate 'P4090' then
      accepted := false;
      aggregate_pushed := false;
      sessions_pushed := 0;
      owner_conflict_session_ids := coalesce(
        owner_conflict_session_ids,
        array[]::uuid[]
      );
      payload_conflict_session_ids := coalesce(
        payload_conflict_session_ids,
        array[]::uuid[]
      );
      return next;
  end;
end;
$$;

revoke execute on function public.ingest_trusted_playtime(uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.ingest_trusted_playtime(uuid, jsonb, jsonb)
  to authenticated, service_role;

comment on function public.ingest_trusted_playtime(uuid, jsonb, jsonb) is
  'Atomically ingests playtime. Authenticated callers are restricted to caller-bound aggregates; service_role may also ingest sessions after handler authentication. Aggregate operation IDs make retries idempotent, snapshot playtime is monotonic, corrections are explicit, and session counts use atomic deltas.';
