-- Local-first launcher entity sync.
-- SQLite remains the primary local source; this table is the authenticated
-- per-device sync target for local entity rows.

create extension if not exists pgcrypto;

create table if not exists public.launcher_local_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  kind text not null,
  entity_id text not null,
  entity jsonb not null,
  local_updated_at bigint not null,
  deleted_at timestamptz,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint launcher_local_entities_user_device_entity_unique unique (user_id, device_id, kind, entity_id),
  constraint launcher_local_entities_device_id_check check (char_length(btrim(device_id)) between 8 and 128),
  constraint launcher_local_entities_kind_check check (kind in ('games', 'downloads')),
  constraint launcher_local_entities_entity_id_check check (char_length(btrim(entity_id)) between 1 and 512),
  constraint launcher_local_entities_entity_object_check check (jsonb_typeof(entity) = 'object'),
  constraint launcher_local_entities_updated_check check (local_updated_at >= 0)
);

comment on table public.launcher_local_entities is
  'Authenticated sync mirror for local-first launcher SQLite entities.';

create index if not exists launcher_local_entities_user_kind_updated_idx
  on public.launcher_local_entities (user_id, kind, local_updated_at desc);

create index if not exists launcher_local_entities_user_device_idx
  on public.launcher_local_entities (user_id, device_id);

drop trigger if exists set_launcher_local_entities_updated_at on public.launcher_local_entities;
create trigger set_launcher_local_entities_updated_at
  before update on public.launcher_local_entities
  for each row execute function public.set_updated_at();

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.launcher_local_entities to authenticated;

alter table public.launcher_local_entities enable row level security;

drop policy if exists launcher_local_entities_own_select on public.launcher_local_entities;
create policy launcher_local_entities_own_select on public.launcher_local_entities
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists launcher_local_entities_own_insert on public.launcher_local_entities;
create policy launcher_local_entities_own_insert on public.launcher_local_entities
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists launcher_local_entities_own_update on public.launcher_local_entities;
create policy launcher_local_entities_own_update on public.launcher_local_entities
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists launcher_local_entities_own_delete on public.launcher_local_entities;
create policy launcher_local_entities_own_delete on public.launcher_local_entities
  for delete to authenticated
  using ((select auth.uid()) = user_id);
