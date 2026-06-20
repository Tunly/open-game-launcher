create extension if not exists pgcrypto;

create table if not exists public.remote_companion_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_label text not null,
  device_kind text not null default 'web',
  device_secret_hash text not null,
  device_secret_hint text not null,
  pairing_code_hash text not null unique,
  pairing_code_hint text not null,
  pairing_expires_at timestamptz not null,
  paired_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint remote_companion_devices_label_check
    check (char_length(btrim(device_label)) between 1 and 80),
  constraint remote_companion_devices_kind_check
    check (device_kind in ('desktop', 'mobile', 'web')),
  constraint remote_companion_devices_secret_hash_check
    check (char_length(device_secret_hash) = 64),
  constraint remote_companion_devices_hash_check
    check (char_length(pairing_code_hash) = 64),
  constraint remote_companion_devices_expiry_check
    check (pairing_expires_at > created_at),
  constraint remote_companion_devices_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.remote_companion_devices is
  'Owner-scoped companion devices. Plain pairing codes and device secrets are returned once by RPC and only SHA-256 hashes are stored.';

create index if not exists remote_companion_devices_owner_seen_idx
  on public.remote_companion_devices (user_id, last_seen_at desc)
  where revoked_at is null;

create index if not exists remote_companion_devices_active_hash_idx
  on public.remote_companion_devices (pairing_code_hash)
  where paired_at is null and revoked_at is null;

drop trigger if exists set_remote_companion_devices_updated_at
  on public.remote_companion_devices;
create trigger set_remote_companion_devices_updated_at
  before update on public.remote_companion_devices
  for each row execute function public.set_updated_at();

alter table public.remote_companion_devices enable row level security;

revoke all on public.remote_companion_devices from public, anon, authenticated;
grant select on public.remote_companion_devices to authenticated;
grant all on public.remote_companion_devices to service_role;

drop policy if exists remote_companion_devices_select_owner
  on public.remote_companion_devices;
create policy remote_companion_devices_select_owner
  on public.remote_companion_devices
  for select
  to authenticated
  using (user_id = auth.uid());

create table if not exists public.remote_install_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  companion_device_id uuid references public.remote_companion_devices(id) on delete set null,
  product_id uuid references public.store_products(id) on delete set null,
  build_id uuid references public.store_builds(id) on delete set null,
  game_id text not null,
  title text not null,
  platform text,
  source text not null default 'mobile-companion',
  status text not null default 'pending',
  package_ref jsonb not null default '{}'::jsonb,
  error_message text,
  expires_at timestamptz not null default now() + interval '30 minutes',
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint remote_install_jobs_game_id_check
    check (char_length(btrim(game_id)) between 1 and 160),
  constraint remote_install_jobs_title_check
    check (char_length(btrim(title)) between 1 and 180),
  constraint remote_install_jobs_platform_check
    check (platform is null or char_length(btrim(platform)) <= 32),
  constraint remote_install_jobs_source_check
    check (source in ('mobile-companion', 'web-dashboard', 'desktop-deep-link')),
  constraint remote_install_jobs_status_check
    check (status in ('pending', 'accepted', 'started', 'completed', 'failed', 'cancelled', 'expired')),
  constraint remote_install_jobs_package_ref_object_check
    check (jsonb_typeof(package_ref) = 'object'),
  constraint remote_install_jobs_package_ref_no_raw_location_check
    check (
      position('http://' in lower(package_ref::text)) = 0
      and position('https://' in lower(package_ref::text)) = 0
      and position('download_url' in lower(package_ref::text)) = 0
      and position('downloadurl' in lower(package_ref::text)) = 0
      and position('install_manifest_url' in lower(package_ref::text)) = 0
      and position('installmanifesturl' in lower(package_ref::text)) = 0
      and position('signed_url' in lower(package_ref::text)) = 0
      and position('signedurl' in lower(package_ref::text)) = 0
      and position('token=' in lower(package_ref::text)) = 0
      and position('sig=' in lower(package_ref::text)) = 0
    ),
  constraint remote_install_jobs_expiry_check
    check (expires_at > created_at)
);

comment on table public.remote_install_jobs is
  'Owner-scoped remote install jobs. Jobs store product/build references and sanitized metadata, not package locations.';

create index if not exists remote_install_jobs_owner_status_idx
  on public.remote_install_jobs (user_id, status, created_at desc);

create index if not exists remote_install_jobs_pending_claim_idx
  on public.remote_install_jobs (user_id, created_at)
  where status = 'pending';

drop trigger if exists set_remote_install_jobs_updated_at
  on public.remote_install_jobs;
create trigger set_remote_install_jobs_updated_at
  before update on public.remote_install_jobs
  for each row execute function public.set_updated_at();

create or replace function public.enforce_remote_install_job_terminal_immutability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status in ('completed', 'failed', 'cancelled', 'expired') then
    raise exception 'Remote install job is terminal and cannot be changed.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_remote_install_jobs_terminal_immutability
  on public.remote_install_jobs;
create trigger enforce_remote_install_jobs_terminal_immutability
  before update on public.remote_install_jobs
  for each row
  when (old.status in ('completed', 'failed', 'cancelled', 'expired'))
  execute function public.enforce_remote_install_job_terminal_immutability();

alter table public.remote_install_jobs enable row level security;

revoke all on public.remote_install_jobs from public, anon, authenticated;
grant select on public.remote_install_jobs to authenticated;
grant all on public.remote_install_jobs to service_role;

drop policy if exists remote_install_jobs_select_owner
  on public.remote_install_jobs;
create policy remote_install_jobs_select_owner
  on public.remote_install_jobs
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.create_remote_companion_pairing(
  device_label_input text default 'OG Launcher Desktop',
  device_kind_input text default 'desktop',
  ttl_seconds_input integer default 900
)
returns table (
  device_id uuid,
  device_secret text,
  device_secret_hint text,
  pairing_code text,
  pairing_code_hint text,
  expires_at timestamptz
)
language plpgsql
security definer
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  effective_label text;
  effective_kind text;
  effective_ttl_seconds integer;
  effective_expires_at timestamptz;
  generated_code text;
  generated_hash text;
  generated_device_secret text;
  generated_device_secret_hash text;
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  effective_label := coalesce(
    nullif(left(btrim(coalesce(device_label_input, '')), 80), ''),
    'OG Launcher Desktop'
  );
  effective_kind := lower(btrim(coalesce(device_kind_input, 'desktop')));
  if effective_kind not in ('desktop', 'mobile', 'web') then
    effective_kind := 'desktop';
  end if;

  effective_ttl_seconds := greatest(300, least(coalesce(ttl_seconds_input, 900), 3600));
  effective_expires_at := now() + make_interval(secs => effective_ttl_seconds);

  for attempt in 1..5 loop
    generated_code := 'ogc_' || translate(rtrim(encode(gen_random_bytes(18), 'base64'), '='), '+/', '-_');
    generated_hash := encode(digest(generated_code, 'sha256'), 'hex');
    generated_device_secret := 'ogd_' || translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_');
    generated_device_secret_hash := encode(digest(generated_device_secret, 'sha256'), 'hex');

    begin
      insert into public.remote_companion_devices (
        user_id,
        device_label,
        device_kind,
        device_secret_hash,
        device_secret_hint,
        pairing_code_hash,
        pairing_code_hint,
        pairing_expires_at,
        metadata
      )
      values (
        current_user_id,
        effective_label,
        effective_kind,
        generated_device_secret_hash,
        left(generated_device_secret, 8) || '...' || right(generated_device_secret, 4),
        generated_hash,
        left(generated_code, 8) || '...' || right(generated_code, 4),
        effective_expires_at,
        jsonb_build_object('contractVersion', 1)
      )
      returning id, remote_companion_devices.device_secret_hint, remote_companion_devices.pairing_code_hint, pairing_expires_at
      into device_id, device_secret_hint, pairing_code_hint, expires_at;

      pairing_code := generated_code;
      device_secret := generated_device_secret;
      return next;
      return;
    exception
      when unique_violation then
        -- Extremely unlikely pairing collision; retry with fresh random bytes.
    end;
  end loop;

  raise exception 'Could not create remote companion pairing.';
end;
$$;

create or replace function public.redeem_remote_companion_pairing(
  pairing_code_input text,
  device_label_input text default 'Mobile Companion',
  device_kind_input text default 'mobile'
)
returns table (
  device_id uuid,
  device_label text,
  device_kind text,
  paired_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  device_row public.remote_companion_devices%rowtype;
  redeemed_at timestamptz := now();
  effective_label text;
  effective_kind text;
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  select *
  into device_row
  from public.remote_companion_devices device
  where device.pairing_code_hash = encode(digest(btrim(coalesce(pairing_code_input, '')), 'sha256'), 'hex')
  for update;

  if not found
    or device_row.user_id <> current_user_id
    or device_row.revoked_at is not null
    or device_row.pairing_expires_at <= redeemed_at
    or device_row.paired_at is not null
  then
    raise exception 'Remote companion pairing is not redeemable.';
  end if;

  effective_label := coalesce(
    nullif(left(btrim(coalesce(device_label_input, '')), 80), ''),
    'Mobile Companion'
  );
  effective_kind := lower(btrim(coalesce(device_kind_input, 'mobile')));
  if effective_kind not in ('desktop', 'mobile', 'web') then
    effective_kind := 'mobile';
  end if;

  return query
  update public.remote_companion_devices device
  set device_label = effective_label,
      device_kind = effective_kind,
      paired_at = redeemed_at,
      last_seen_at = redeemed_at
  where device.id = device_row.id
  returning device.id, device.device_label, device.device_kind, device.paired_at, device.pairing_expires_at;
end;
$$;

create or replace function public.record_remote_companion_ping(
  device_id_input uuid,
  device_secret_input text
)
returns table (
  device_id uuid,
  last_seen_at timestamptz,
  status text
)
language plpgsql
security definer
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  pinged_at timestamptz := now();
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  return query
  update public.remote_companion_devices device
  set last_seen_at = pinged_at
  where device.id = device_id_input
    and device.user_id = current_user_id
    and device.paired_at is not null
    and device.revoked_at is null
    and device.device_secret_hash = encode(digest(btrim(coalesce(device_secret_input, '')), 'sha256'), 'hex')
  returning device.id, device.last_seen_at, 'active'::text;

  if not found then
    raise exception 'Remote companion device is not active.';
  end if;
end;
$$;

create or replace function public.enqueue_remote_install_job(
  companion_device_id_input uuid,
  product_id_input uuid,
  build_id_input uuid,
  game_id_input text,
  title_input text,
  platform_input text default null,
  source_input text default 'mobile-companion',
  package_ref_input jsonb default '{}'::jsonb
)
returns table (
  job_id uuid,
  status text,
  expires_at timestamptz
)
language plpgsql
security definer
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  effective_game_id text := left(btrim(coalesce(game_id_input, '')), 160);
  effective_title text := left(btrim(coalesce(title_input, '')), 180);
  effective_platform text := nullif(left(btrim(coalesce(platform_input, '')), 32), '');
  effective_source text := lower(btrim(coalesce(source_input, 'mobile-companion')));
  safe_package_ref jsonb := coalesce(package_ref_input, '{}'::jsonb);
  package_ref_text text;
  queued_expires_at timestamptz := now() + interval '30 minutes';
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if effective_game_id = '' or effective_title = '' then
    raise exception 'Remote install job requires a game id and title.';
  end if;

  if effective_source not in ('mobile-companion', 'web-dashboard', 'desktop-deep-link') then
    effective_source := 'mobile-companion';
  end if;

  if jsonb_typeof(safe_package_ref) <> 'object' then
    raise exception 'Remote install package reference must be an object.';
  end if;

  package_ref_text := lower(safe_package_ref::text);
  if package_ref_text ~ '(https?://|download_url|downloadurl|install_manifest_url|installmanifesturl|signed_url|signedurl|token=|sig=)' then
    raise exception 'Remote install package reference must not contain package locations.';
  end if;

  if build_id_input is not null and product_id_input is null then
    raise exception 'Store remote install jobs require a store product id.';
  end if;

  if (product_id_input is not null or build_id_input is not null) then
    if safe_package_ref ->> 'delivery' is distinct from 'store-build-ticket'
      or safe_package_ref -> 'downloadTicketRequired' is distinct from 'true'::jsonb
    then
      raise exception 'Store remote install jobs require a store-build-ticket package reference.';
    end if;
  end if;

  if not exists (
    select 1
    from public.remote_companion_devices device
    where device.id = companion_device_id_input
      and device.user_id = current_user_id
      and device.paired_at is not null
      and device.revoked_at is null
      and device.last_seen_at > now() - interval '10 minutes'
  ) then
    raise exception 'Remote companion device is not active.';
  end if;

  if product_id_input is not null and not exists (
    select 1
    from public.store_licenses license
    where license.user_id = current_user_id
      and license.product_id = product_id_input
      and license.is_revoked = false
      and (license.expires_at is null or license.expires_at > now())
  ) then
    raise exception 'No active license for this remote install job.';
  end if;

  if build_id_input is not null and not exists (
    select 1
    from public.store_builds build
    where build.id = build_id_input
      and (product_id_input is null or build.product_id = product_id_input)
  ) then
    raise exception 'Remote install build reference is not available.';
  end if;

  insert into public.remote_install_jobs (
    user_id,
    companion_device_id,
    product_id,
    build_id,
    game_id,
    title,
    platform,
    source,
    package_ref,
    expires_at
  )
  values (
    current_user_id,
    companion_device_id_input,
    product_id_input,
    build_id_input,
    effective_game_id,
    effective_title,
    effective_platform,
    effective_source,
    safe_package_ref || jsonb_build_object('downloadTicketRequired', true),
    queued_expires_at
  )
  returning id, remote_install_jobs.status, remote_install_jobs.expires_at
  into job_id, status, expires_at;

  return next;
end;
$$;

create or replace function public.claim_remote_install_jobs(
  device_id_input uuid,
  device_secret_input text,
  limit_input integer default 5
)
returns table (
  job_id uuid,
  product_id uuid,
  build_id uuid,
  game_id text,
  title text,
  platform text,
  source text,
  package_ref jsonb,
  status text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  effective_limit integer := greatest(1, least(coalesce(limit_input, 5), 25));
  claim_time timestamptz := now();
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  return query
  with selected as (
    select job.id
    from public.remote_install_jobs job
    join public.remote_companion_devices device on device.id = job.companion_device_id
    where job.user_id = current_user_id
      and device.id = device_id_input
      and device.user_id = current_user_id
      and device.revoked_at is null
      and device.device_secret_hash = encode(digest(btrim(coalesce(device_secret_input, '')), 'sha256'), 'hex')
      and job.status = 'pending'
      and job.expires_at > claim_time
    order by job.created_at
    for update skip locked
    limit effective_limit
  ),
  updated as (
    update public.remote_install_jobs job
    set status = 'accepted',
        accepted_at = coalesce(job.accepted_at, claim_time)
    from selected
    where job.id = selected.id
    returning job.id,
      job.product_id,
      job.build_id,
      job.game_id,
      job.title,
      job.platform,
      job.source,
      job.package_ref,
      job.status,
      job.created_at,
      job.expires_at
  )
  select updated.id,
    updated.product_id,
    updated.build_id,
    updated.game_id,
    updated.title,
    updated.platform,
    updated.source,
    updated.package_ref,
    updated.status,
    updated.created_at,
    updated.expires_at
  from updated;
end;
$$;

create or replace function public.update_remote_install_job_status(
  device_id_input uuid,
  device_secret_input text,
  job_id_input uuid,
  status_input text,
  message_input text default null,
  local_queue_id_input text default null
)
returns table (
  job_id uuid,
  status text,
  updated_at timestamptz
)
language plpgsql
security definer
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  effective_status text := lower(btrim(coalesce(status_input, '')));
  safe_message text := nullif(left(btrim(coalesce(message_input, '')), 240), '');
  safe_local_queue_id text := nullif(left(btrim(coalesce(local_queue_id_input, '')), 80), '');
  now_at timestamptz := now();
  job_row public.remote_install_jobs%rowtype;
  terminal_statuses text[] := array['completed', 'failed', 'cancelled', 'expired'];
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if effective_status not in ('started', 'completed', 'failed', 'cancelled') then
    raise exception 'Remote install job status is not supported.';
  end if;

  if lower(coalesce(safe_message, '')) ~ '(https?://|token=|sig=|signed_url|signedurl|download_url|downloadurl|install_manifest_url|installmanifesturl)' then
    raise exception 'Remote install job status must not contain package locations.';
  end if;

  if lower(coalesce(safe_local_queue_id, '')) ~ '(https?://|token=|sig=)' then
    raise exception 'Remote install local queue id must not contain secrets.';
  end if;

  select job.*
  into job_row
  from public.remote_install_jobs job
  join public.remote_companion_devices device on device.id = job.companion_device_id
  where job.id = job_id_input
    and job.user_id = current_user_id
    and device.id = device_id_input
    and device.user_id = current_user_id
    and device.revoked_at is null
    and device.device_secret_hash = encode(digest(btrim(coalesce(device_secret_input, '')), 'sha256'), 'hex')
  for update of job;

  if not found then
    raise exception 'Remote install job is not claimable by this device.';
  end if;

  if job_row.status = any (terminal_statuses) then
    raise exception 'Remote install job is terminal and cannot be changed.';
  end if;

  if not (
    (job_row.status = 'accepted' and effective_status in ('started', 'failed', 'cancelled'))
    or (job_row.status = 'started' and effective_status in ('completed', 'failed', 'cancelled'))
  ) then
    raise exception 'Remote install job status transition is not allowed.';
  end if;

  return query
  update public.remote_install_jobs job
  set status = effective_status,
      error_message = case when effective_status = 'failed' then safe_message else null end,
      package_ref = case
        when safe_local_queue_id is null then job.package_ref
        else job.package_ref || jsonb_build_object('localQueueId', safe_local_queue_id)
      end,
      started_at = case
        when effective_status = 'started' then coalesce(job.started_at, now_at)
        else job.started_at
      end,
      completed_at = case
        when effective_status = 'completed' then now_at
        else job.completed_at
      end,
      failed_at = case
        when effective_status = 'failed' then now_at
        else job.failed_at
      end,
      cancelled_at = case
        when effective_status = 'cancelled' then now_at
        else job.cancelled_at
      end
  where job.id = job_row.id
  returning job.id, job.status, job.updated_at;

  if not found then
    raise exception 'Remote install job status update failed.';
  end if;
end;
$$;

revoke execute on function public.create_remote_companion_pairing(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.create_remote_companion_pairing(text, text, integer)
  to authenticated;

revoke execute on function public.redeem_remote_companion_pairing(text, text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_remote_companion_pairing(text, text, text)
  to authenticated;

revoke execute on function public.record_remote_companion_ping(uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_remote_companion_ping(uuid, text)
  to authenticated;

revoke execute on function public.enqueue_remote_install_job(uuid, uuid, uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.enqueue_remote_install_job(uuid, uuid, uuid, text, text, text, text, jsonb)
  to authenticated;

revoke execute on function public.claim_remote_install_jobs(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_remote_install_jobs(uuid, text, integer)
  to authenticated;

revoke execute on function public.update_remote_install_job_status(uuid, text, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.update_remote_install_job_status(uuid, text, uuid, text, text, text)
  to authenticated;

revoke execute on function public.enforce_remote_install_job_terminal_immutability()
  from public, anon, authenticated;
