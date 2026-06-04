-- Public mod catalog + private user install state.
-- Keeps legacy public.mods intact for compatibility, but moves new catalog reads
-- and user install state into separate tables with explicit RLS.

create table if not exists public.mod_catalog_entries (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games(id) on delete set null,
  local_game_id text,
  slug text not null unique,
  name text not null,
  author text,
  summary text,
  description text,
  provider text not null check (provider in (
    'steam_workshop',
    'nexus',
    'modio',
    'curseforge',
    'direct_url',
    'local_archive',
    'local_folder'
  )),
  source_url text,
  external_id text,
  categories text[] not null default '{}',
  tags text[] not null default '{}',
  icon_url text,
  banner_url text,
  screenshots text[] not null default '{}',
  status text not null default 'published' check (status in ('draft', 'published', 'delisted')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_id)
);

comment on table public.mod_catalog_entries is 'Public provider-backed mod catalog entries.';

create table if not exists public.mod_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  catalog_mod_id uuid not null references public.mod_catalog_entries(id) on delete cascade,
  version text not null,
  changelog text,
  file_size_bytes bigint not null default 0,
  sha256 text,
  download_url text,
  storage_path text,
  install_strategy text not null default 'archive' check (install_strategy in ('archive', 'copy', 'external')),
  is_latest boolean not null default false,
  status text not null default 'published' check (status in ('draft', 'published', 'delisted')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (catalog_mod_id, version)
);

comment on table public.mod_catalog_versions is 'Version metadata for public mod catalog entries.';

create table if not exists public.mod_catalog_files (
  id uuid primary key default gen_random_uuid(),
  catalog_version_id uuid not null references public.mod_catalog_versions(id) on delete cascade,
  file_name text not null,
  relative_path text not null,
  size_bytes bigint not null default 0,
  sha256 text,
  storage_path text,
  created_at timestamptz not null default now(),
  unique (catalog_version_id, relative_path)
);

comment on table public.mod_catalog_files is 'File manifests for public mod catalog versions.';

create table if not exists public.mod_catalog_dependencies (
  id uuid primary key default gen_random_uuid(),
  catalog_mod_id uuid not null references public.mod_catalog_entries(id) on delete cascade,
  depends_on_catalog_mod_id uuid not null references public.mod_catalog_entries(id) on delete cascade,
  required_version text,
  is_optional boolean not null default false,
  unique (catalog_mod_id, depends_on_catalog_mod_id)
);

comment on table public.mod_catalog_dependencies is 'Dependency graph for public mod catalog entries.';

create table if not exists public.user_mod_installs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_install_id text not null,
  catalog_mod_id uuid references public.mod_catalog_entries(id) on delete set null,
  catalog_version_id uuid references public.mod_catalog_versions(id) on delete set null,
  legacy_mod_id uuid references public.mods(id) on delete set null,
  game_id uuid references public.games(id) on delete set null,
  local_game_id text,
  game_title text not null,
  name_snapshot text not null,
  provider text not null check (provider in (
    'steam_workshop',
    'nexus',
    'modio',
    'curseforge',
    'direct_url',
    'local_archive',
    'local_folder'
  )),
  source_url text,
  install_state text not null default 'queued' check (install_state in (
    'queued',
    'downloading',
    'delegated',
    'installed',
    'disabled',
    'failed',
    'removed'
  )),
  install_path text,
  target_dir text,
  manifest jsonb not null default '{}',
  last_error text,
  installed_at timestamptz,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_install_id)
);

comment on table public.user_mod_installs is 'Private per-user mod install state synced from local devices.';

create table if not exists public.user_mod_profile_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  install_id uuid not null references public.user_mod_installs(id) on delete cascade,
  profile_id uuid references public.mod_profiles(id) on delete cascade,
  enabled boolean not null default true,
  load_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (install_id, profile_id)
);

comment on table public.user_mod_profile_entries is 'Private profile/load-order rows for user mod installs.';

create table if not exists public.user_mod_install_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  install_id uuid not null references public.user_mod_installs(id) on delete cascade,
  catalog_file_id uuid references public.mod_catalog_files(id) on delete set null,
  relative_path text not null,
  absolute_path text,
  size_bytes bigint not null default 0,
  sha256 text,
  status text not null default 'present' check (status in ('present', 'missing', 'modified', 'removed')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (install_id, relative_path)
);

comment on table public.user_mod_install_files is 'Private per-file install verification state.';

create index if not exists idx_mod_catalog_entries_provider_status
  on public.mod_catalog_entries(provider, status);
create index if not exists idx_mod_catalog_entries_game_status
  on public.mod_catalog_entries(game_id, local_game_id, status);
create index if not exists idx_mod_catalog_versions_latest
  on public.mod_catalog_versions(catalog_mod_id, is_latest, status);
create index if not exists idx_user_mod_installs_user_game
  on public.user_mod_installs(user_id, local_game_id, game_id, updated_at desc);
create index if not exists idx_user_mod_installs_catalog
  on public.user_mod_installs(catalog_mod_id, catalog_version_id);
create index if not exists idx_user_mod_profile_entries_user_profile
  on public.user_mod_profile_entries(user_id, profile_id, load_order);
create index if not exists idx_user_mod_install_files_user_install
  on public.user_mod_install_files(user_id, install_id);

drop trigger if exists set_mod_catalog_entries_updated_at on public.mod_catalog_entries;
create trigger set_mod_catalog_entries_updated_at
  before update on public.mod_catalog_entries
  for each row execute function public.set_updated_at();

drop trigger if exists set_user_mod_installs_updated_at on public.user_mod_installs;
create trigger set_user_mod_installs_updated_at
  before update on public.user_mod_installs
  for each row execute function public.set_updated_at();

drop trigger if exists set_user_mod_profile_entries_updated_at on public.user_mod_profile_entries;
create trigger set_user_mod_profile_entries_updated_at
  before update on public.user_mod_profile_entries
  for each row execute function public.set_updated_at();

drop trigger if exists set_user_mod_install_files_updated_at on public.user_mod_install_files;
create trigger set_user_mod_install_files_updated_at
  before update on public.user_mod_install_files
  for each row execute function public.set_updated_at();

grant select on public.mod_catalog_entries to anon, authenticated;
grant select on public.mod_catalog_versions to anon, authenticated;
grant select on public.mod_catalog_files to anon, authenticated;
grant select on public.mod_catalog_dependencies to anon, authenticated;
grant select, insert, update, delete on public.user_mod_installs to authenticated;
grant select, insert, update, delete on public.user_mod_profile_entries to authenticated;
grant select, insert, update, delete on public.user_mod_install_files to authenticated;

alter table public.mod_catalog_entries enable row level security;
alter table public.mod_catalog_versions enable row level security;
alter table public.mod_catalog_files enable row level security;
alter table public.mod_catalog_dependencies enable row level security;
alter table public.user_mod_installs enable row level security;
alter table public.user_mod_profile_entries enable row level security;
alter table public.user_mod_install_files enable row level security;

drop policy if exists mod_catalog_entries_read_published on public.mod_catalog_entries;
create policy mod_catalog_entries_read_published
  on public.mod_catalog_entries for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists mod_catalog_versions_read_published on public.mod_catalog_versions;
create policy mod_catalog_versions_read_published
  on public.mod_catalog_versions for select
  to anon, authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.mod_catalog_entries entry
      where entry.id = catalog_mod_id
        and entry.status = 'published'
    )
  );

drop policy if exists mod_catalog_files_read_published on public.mod_catalog_files;
create policy mod_catalog_files_read_published
  on public.mod_catalog_files for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.mod_catalog_versions version
      join public.mod_catalog_entries entry on entry.id = version.catalog_mod_id
      where version.id = catalog_version_id
        and version.status = 'published'
        and entry.status = 'published'
    )
  );

drop policy if exists mod_catalog_dependencies_read_published on public.mod_catalog_dependencies;
create policy mod_catalog_dependencies_read_published
  on public.mod_catalog_dependencies for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.mod_catalog_entries entry
      where entry.id = catalog_mod_id
        and entry.status = 'published'
    )
  );

drop policy if exists user_mod_installs_own_select on public.user_mod_installs;
create policy user_mod_installs_own_select
  on public.user_mod_installs for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_mod_installs_own_insert on public.user_mod_installs;
create policy user_mod_installs_own_insert
  on public.user_mod_installs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists user_mod_installs_own_update on public.user_mod_installs;
create policy user_mod_installs_own_update
  on public.user_mod_installs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists user_mod_installs_own_delete on public.user_mod_installs;
create policy user_mod_installs_own_delete
  on public.user_mod_installs for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_mod_profile_entries_own_select on public.user_mod_profile_entries;
create policy user_mod_profile_entries_own_select
  on public.user_mod_profile_entries for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_mod_profile_entries_own_insert on public.user_mod_profile_entries;
create policy user_mod_profile_entries_own_insert
  on public.user_mod_profile_entries for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_mod_installs install
      where install.id = install_id
        and install.user_id = (select auth.uid())
    )
    and (
      profile_id is null
      or exists (
        select 1 from public.mod_profiles profile
        where profile.id = profile_id
          and profile.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists user_mod_profile_entries_own_update on public.user_mod_profile_entries;
create policy user_mod_profile_entries_own_update
  on public.user_mod_profile_entries for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_mod_installs install
      where install.id = install_id
        and install.user_id = (select auth.uid())
    )
  );

drop policy if exists user_mod_profile_entries_own_delete on public.user_mod_profile_entries;
create policy user_mod_profile_entries_own_delete
  on public.user_mod_profile_entries for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_mod_install_files_own_select on public.user_mod_install_files;
create policy user_mod_install_files_own_select
  on public.user_mod_install_files for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_mod_install_files_own_insert on public.user_mod_install_files;
create policy user_mod_install_files_own_insert
  on public.user_mod_install_files for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_mod_installs install
      where install.id = install_id
        and install.user_id = (select auth.uid())
    )
  );

drop policy if exists user_mod_install_files_own_update on public.user_mod_install_files;
create policy user_mod_install_files_own_update
  on public.user_mod_install_files for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_mod_installs install
      where install.id = install_id
        and install.user_id = (select auth.uid())
    )
  );

drop policy if exists user_mod_install_files_own_delete on public.user_mod_install_files;
create policy user_mod_install_files_own_delete
  on public.user_mod_install_files for delete
  to authenticated
  using ((select auth.uid()) = user_id);
