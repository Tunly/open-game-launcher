-- Keep hosted Nexus/Steam state deliberately redacted. Historical providers
-- remain untouched and continue to be preserved for data-loss avoidance.

begin;

-- Older linked environments may have recorded the provider-rework migration
-- before these columns were added to its final local form. Repair that forward
-- without rewriting migration history.
alter table public.user_mod_installs
  add column if not exists provider_item_id text,
  add column if not exists provider_version_id text;

create index if not exists idx_user_mod_installs_provider_item
  on public.user_mod_installs(user_id, provider, provider_item_id)
  where provider_item_id is not null;

-- Preserve stable provider identifiers before retiring internal catalog links
-- from any active-provider rows created by the previous product flow.
update public.user_mod_installs as install
set provider_item_id = coalesce(install.provider_item_id, entry.external_id)
from public.mod_catalog_entries as entry
where install.catalog_mod_id = entry.id
  and install.provider in ('nexus', 'steam_workshop');

update public.user_mod_installs as install
set provider_version_id = coalesce(install.provider_version_id, version.version)
from public.mod_catalog_versions as version
where install.catalog_version_id = version.id
  and install.provider in ('nexus', 'steam_workshop');

-- Ownership manifests and per-file verification records are local-only in the
-- simplified manager. Remove only rows belonging to the two active providers.
delete from public.user_mod_install_files as file
using public.user_mod_installs as install
where file.install_id = install.id
  and install.provider in ('nexus', 'steam_workshop');

update public.user_mod_installs
set catalog_mod_id = null,
    catalog_version_id = null,
    legacy_mod_id = null,
    game_title = 'Managed game',
    name_snapshot = 'Managed mod',
    source_url = null,
    install_path = null,
    target_dir = null,
    last_error = null,
    manifest = jsonb_build_object(
      'provider', provider,
      'providerItemId', provider_item_id
    )
where provider in ('nexus', 'steam_workshop');

comment on column public.user_mod_installs.provider_item_id is
  'Provider item identifier; active-provider hosted state must not contain local paths or download credentials.';

commit;
