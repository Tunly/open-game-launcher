-- Mod-Management Backend: mods, versions, files, dependencies, profiles, reviews

create table if not exists public.mod_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Default',
  game_id text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name, game_id)
);
comment on table public.mod_profiles is 'Per-user mod load-order profiles per game.';

create table if not exists public.mods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid references public.games(id) on delete set null,
  game_title text not null,
  name text not null,
  source text not null default 'manual' check (source in ('manual', 'steam_workshop', 'nexus', 'local')),
  source_url text,
  author text,
  description text,
  category text,
  enabled boolean not null default true,
  load_order integer not null default 0,
  profile_id uuid references public.mod_profiles(id) on delete set null,
  current_version_id uuid,
  installed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.mods is 'User-managed game modifications.';

create table if not exists public.mod_versions (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid not null references public.mods(id) on delete cascade,
  version text not null,
  changelog text,
  file_size_bytes bigint not null default 0,
  sha256 text,
  download_url text,
  is_latest boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.mod_versions is 'Version history per mod.';

create table if not exists public.mod_files (
  id uuid primary key default gen_random_uuid(),
  mod_version_id uuid not null references public.mod_versions(id) on delete cascade,
  file_name text not null,
  relative_path text not null,
  size_bytes bigint not null default 0,
  sha256 text,
  storage_path text,
  created_at timestamptz not null default now()
);
comment on table public.mod_files is 'Individual files within a mod version.';

create table if not exists public.mod_dependencies (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid not null references public.mods(id) on delete cascade,
  depends_on_mod_id uuid not null references public.mods(id) on delete cascade,
  required_version text,
  is_optional boolean not null default false,
  unique (mod_id, depends_on_mod_id)
);
comment on table public.mod_dependencies is 'Mod dependency graph (A requires B).';

create table if not exists public.mod_reviews (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid not null references public.mods(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  review text,
  created_at timestamptz not null default now(),
  unique (mod_id, user_id)
);
comment on table public.mod_reviews is 'User reviews and ratings for mods.';

-- Grants
grant select, insert, update, delete on public.mods to authenticated;
grant select, insert, update, delete on public.mod_versions to authenticated;
grant select, insert, delete on public.mod_files to authenticated;
grant select, insert, delete on public.mod_dependencies to authenticated;
grant select, insert, update, delete on public.mod_reviews to authenticated;
grant select, insert, update, delete on public.mod_profiles to authenticated;
grant select on public.mods to anon;

-- RLS
alter table public.mods enable row level security;
create policy mods_own on public.mods for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy mods_read_public on public.mods for select to anon using (true);

alter table public.mod_versions enable row level security;
create policy mod_versions_own on public.mod_versions for all to authenticated
  using (exists (select 1 from public.mods m where m.id = mod_id and m.user_id = auth.uid()));

alter table public.mod_files enable row level security;
create policy mod_files_own on public.mod_files for all to authenticated
  using (exists (select 1 from public.mods m join public.mod_versions v on v.mod_id = m.id where v.id = mod_version_id and m.user_id = auth.uid()));

alter table public.mod_dependencies enable row level security;
create policy mod_deps_own on public.mod_dependencies for all to authenticated
  using (exists (select 1 from public.mods m where m.id = mod_id and m.user_id = auth.uid()));

alter table public.mod_reviews enable row level security;
create policy mod_reviews_own on public.mod_reviews for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy mod_reviews_read_public on public.mod_reviews for select to anon, authenticated using (true);

alter table public.mod_profiles enable row level security;
create policy mod_profiles_own on public.mod_profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
