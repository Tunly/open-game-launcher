-- Shared game-id mappings for native mod providers.
-- These rows map local launcher game ids to provider-specific game ids used by
-- mod.io and CurseForge search APIs. User-contributed rows are visible as
-- shared hints, while verified rows can later be promoted by a trusted backend.

create table if not exists public.mod_provider_game_mappings (
  id uuid primary key default gen_random_uuid(),
  local_game_id text not null,
  game_id uuid references public.games(id) on delete set null,
  game_title text,
  provider text not null check (provider in ('modio', 'curseforge')),
  provider_game_id text not null,
  source text not null default 'manual' check (source in ('manual', 'local_hint', 'provider_api', 'admin', 'catalog')),
  confidence text not null default 'manual' check (confidence in ('manual', 'low', 'medium', 'high', 'verified')),
  status text not null default 'active' check (status in ('active', 'archived', 'rejected')),
  created_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mod_provider_game_mappings_local_game_id_check check (char_length(btrim(local_game_id)) between 1 and 160),
  constraint mod_provider_game_mappings_game_title_check check (game_title is null or char_length(game_title) <= 240),
  constraint mod_provider_game_mappings_provider_game_id_check check (
    (provider = 'curseforge' and provider_game_id ~ '^[0-9]+$')
    or (provider = 'modio' and provider_game_id ~ '^([0-9]+|[a-z0-9][a-z0-9-]{0,158}[a-z0-9])$')
    or (provider = 'modio' and provider_game_id ~ '^[a-z0-9]$')
  ),
  unique (provider, local_game_id, provider_game_id)
);

comment on table public.mod_provider_game_mappings is 'Shared lookup table for native mod provider game ids.';

create index if not exists idx_mod_provider_game_mappings_lookup
  on public.mod_provider_game_mappings(provider, local_game_id, status, confidence, verified_at desc);

create index if not exists idx_mod_provider_game_mappings_game
  on public.mod_provider_game_mappings(game_id, provider, status);

drop trigger if exists set_mod_provider_game_mappings_updated_at on public.mod_provider_game_mappings;
create trigger set_mod_provider_game_mappings_updated_at
  before update on public.mod_provider_game_mappings
  for each row execute function public.set_updated_at();

grant select on public.mod_provider_game_mappings to anon, authenticated;
grant insert, update, delete on public.mod_provider_game_mappings to authenticated;

alter table public.mod_provider_game_mappings enable row level security;

drop policy if exists mod_provider_game_mappings_read_active on public.mod_provider_game_mappings;
create policy mod_provider_game_mappings_read_active
  on public.mod_provider_game_mappings for select
  to anon, authenticated
  using (status = 'active');

drop policy if exists mod_provider_game_mappings_insert_own on public.mod_provider_game_mappings;
create policy mod_provider_game_mappings_insert_own
  on public.mod_provider_game_mappings for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and status = 'active'
    and source in ('manual', 'local_hint', 'provider_api')
    and confidence in ('manual', 'low', 'medium', 'high')
    and verified_at is null
  );

drop policy if exists mod_provider_game_mappings_update_own_unverified on public.mod_provider_game_mappings;
create policy mod_provider_game_mappings_update_own_unverified
  on public.mod_provider_game_mappings for update
  to authenticated
  using (created_by = (select auth.uid()) and verified_at is null)
  with check (
    created_by = (select auth.uid())
    and source in ('manual', 'local_hint', 'provider_api')
    and confidence in ('manual', 'low', 'medium', 'high')
    and verified_at is null
  );

drop policy if exists mod_provider_game_mappings_delete_own_unverified on public.mod_provider_game_mappings;
create policy mod_provider_game_mappings_delete_own_unverified
  on public.mod_provider_game_mappings for delete
  to authenticated
  using (created_by = (select auth.uid()) and verified_at is null);
