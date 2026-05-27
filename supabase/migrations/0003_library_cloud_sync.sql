-- Library cloud sync and cloud-save metadata for Open Game Launcher.
-- This keeps the launcher local-first while giving authenticated users a
-- private multi-device sync target.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Library snapshots
-- ---------------------------------------------------------------------------

create table if not exists public.user_library_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  snapshot_version integer not null default 1,
  game_count integer not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_library_snapshots_user_device_unique unique (user_id, device_id),
  constraint user_library_snapshots_device_id_check check (char_length(btrim(device_id)) between 8 and 128),
  constraint user_library_snapshots_version_check check (snapshot_version > 0),
  constraint user_library_snapshots_game_count_check check (game_count >= 0),
  constraint user_library_snapshots_object_check check (jsonb_typeof(snapshot) = 'object')
);

comment on table public.user_library_snapshots is
  'Private local-first launcher snapshots used to restore Library state on another device.';

-- ---------------------------------------------------------------------------
-- Cloud-save metadata
-- ---------------------------------------------------------------------------

create table if not exists public.user_cloud_save_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_game_key text not null,
  launcher text not null default 'unknown',
  external_id text,
  title text not null,
  platform text not null default 'unknown',
  sync_mode text not null default 'manual',
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_cloud_save_sets_user_key_unique unique (user_id, local_game_key),
  constraint user_cloud_save_sets_id_user_unique unique (id, user_id),
  constraint user_cloud_save_sets_key_check check (char_length(btrim(local_game_key)) between 1 and 256),
  constraint user_cloud_save_sets_title_check check (char_length(btrim(title)) between 1 and 256),
  constraint user_cloud_save_sets_launcher_check check (
    launcher in ('steam', 'epic', 'ubisoft', 'ea', 'battlenet', 'gog', 'xbox', 'manual', 'unknown')
  ),
  constraint user_cloud_save_sets_platform_check check (platform in ('windows', 'linux', 'macos', 'unknown')),
  constraint user_cloud_save_sets_sync_mode_check check (sync_mode in ('manual', 'on_launch', 'on_exit', 'scheduled')),
  constraint user_cloud_save_sets_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

comment on table public.user_cloud_save_sets is
  'Per-user game save sync records. Actual save archives live in the private game-saves bucket.';

create table if not exists public.user_cloud_save_files (
  id uuid primary key default gen_random_uuid(),
  save_set_id uuid not null references public.user_cloud_save_sets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  local_path text not null,
  storage_object_path text,
  checksum_sha256 text,
  size_bytes bigint,
  modified_at timestamptz,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_cloud_save_files_set_path_unique unique (save_set_id, local_path),
  constraint user_cloud_save_files_path_check check (char_length(btrim(local_path)) between 1 and 2048),
  constraint user_cloud_save_files_size_check check (size_bytes is null or size_bytes >= 0),
  constraint user_cloud_save_files_checksum_check check (
    checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint user_cloud_save_files_owner_fk foreign key (save_set_id, user_id)
    references public.user_cloud_save_sets(id, user_id) on delete cascade
);

comment on table public.user_cloud_save_files is
  'Tracked local save paths and their private Supabase Storage object mapping.';

create index if not exists user_library_snapshots_user_updated_idx
  on public.user_library_snapshots (user_id, updated_at desc);
create index if not exists user_cloud_save_sets_user_updated_idx
  on public.user_cloud_save_sets (user_id, updated_at desc);
create index if not exists user_cloud_save_files_user_synced_idx
  on public.user_cloud_save_files (user_id, synced_at desc);

drop trigger if exists set_user_library_snapshots_updated_at on public.user_library_snapshots;
create trigger set_user_library_snapshots_updated_at
  before update on public.user_library_snapshots
  for each row execute function public.set_updated_at();

drop trigger if exists set_user_cloud_save_sets_updated_at on public.user_cloud_save_sets;
create trigger set_user_cloud_save_sets_updated_at
  before update on public.user_cloud_save_sets
  for each row execute function public.set_updated_at();

drop trigger if exists set_user_cloud_save_files_updated_at on public.user_cloud_save_files;
create trigger set_user_cloud_save_files_updated_at
  before update on public.user_cloud_save_files
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.user_library_snapshots to authenticated;
grant select, insert, update, delete on table public.user_cloud_save_sets to authenticated;
grant select, insert, update, delete on table public.user_cloud_save_files to authenticated;

alter table public.user_library_snapshots enable row level security;
alter table public.user_cloud_save_sets enable row level security;
alter table public.user_cloud_save_files enable row level security;

drop policy if exists library_cloud_sync_snapshots_own on public.user_library_snapshots;
create policy library_cloud_sync_snapshots_own on public.user_library_snapshots
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists library_cloud_sync_save_sets_own on public.user_cloud_save_sets;
create policy library_cloud_sync_save_sets_own on public.user_cloud_save_sets
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists library_cloud_sync_save_files_own on public.user_cloud_save_files;
create policy library_cloud_sync_save_files_own on public.user_cloud_save_files
  for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_cloud_save_sets s
      where s.id = user_cloud_save_files.save_set_id
        and s.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Private save archive bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('game-saves', 'game-saves', false)
on conflict (id) do update set public = false;

drop policy if exists library_cloud_sync_storage_read_own_saves on storage.objects;
create policy library_cloud_sync_storage_read_own_saves on storage.objects
  for select to authenticated
  using (
    bucket_id = 'game-saves'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists library_cloud_sync_storage_insert_own_saves on storage.objects;
create policy library_cloud_sync_storage_insert_own_saves on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'game-saves'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists library_cloud_sync_storage_update_own_saves on storage.objects;
create policy library_cloud_sync_storage_update_own_saves on storage.objects
  for update to authenticated
  using (
    bucket_id = 'game-saves'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'game-saves'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists library_cloud_sync_storage_delete_own_saves on storage.objects;
create policy library_cloud_sync_storage_delete_own_saves on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'game-saves'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
