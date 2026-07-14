-- Activate the simplified Nexus Mods + Steam Workshop product surface without
-- deleting historical rows from providers that are no longer exposed by the UI.

alter table public.mod_catalog_entries
  drop constraint if exists mod_catalog_entries_provider_check;

alter table public.mod_catalog_entries
  add constraint mod_catalog_entries_provider_check
  check (provider in ('nexus', 'steam_workshop'))
  not valid;

alter table public.user_mod_installs
  drop constraint if exists user_mod_installs_provider_check;

alter table public.user_mod_installs
  add constraint user_mod_installs_provider_check
  check (provider in ('nexus', 'steam_workshop'))
  not valid;

alter table public.user_mod_installs
  add column if not exists provider_item_id text,
  add column if not exists provider_version_id text;

create index if not exists idx_user_mod_installs_provider_item
  on public.user_mod_installs(user_id, provider, provider_item_id)
  where provider_item_id is not null;

comment on constraint mod_catalog_entries_provider_check on public.mod_catalog_entries is
  'New and updated rows accept only Nexus and Steam; NOT VALID preserves historical legacy rows.';

comment on constraint user_mod_installs_provider_check on public.user_mod_installs is
  'New and updated rows accept only Nexus and Steam; NOT VALID preserves historical legacy rows.';
