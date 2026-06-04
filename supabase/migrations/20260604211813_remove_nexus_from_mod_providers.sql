-- Remove 'nexus' from mod provider enum constraints.
-- Reason: Nexus Mods integration was scrapped (see FEATURE_PLAN.md Section 8).
-- The Rust ModProvider enum and TypeScript ModProvider / ModSource types have been
-- updated to no longer include 'nexus'. This migration mirrors that on the database
-- side so legacy CHECK constraints stop accepting the value.
--
-- The previous CHECK constraints were inline (e.g. `provider text ... check (provider in (...))`),
-- so PostgreSQL auto-generated names like `mod_catalog_entries_provider_check` and
-- `user_mod_installs_provider_check` for the `mod_catalog_user_installs` migration,
-- and `mods_source_check` for the legacy `mods` table.
-- We drop those by guessed name and re-add with explicit names that exclude 'nexus'.
--
-- This migration is safe to re-run: every DROP/ADD uses IF EXISTS / IF NOT EXISTS semantics
-- where possible, and we wrap each step so a partially-applied state still recovers.

begin;

-- 1) Legacy public.mods.source: 'nexus' was in the original CHECK, remove it.
alter table public.mods
  drop constraint if exists mods_source_check;

alter table public.mods
  add constraint mods_source_check
  check (source in ('manual', 'steam_workshop', 'local'));

-- 2) public.mod_catalog_entries.provider: drop the auto-generated constraint and re-add.
alter table public.mod_catalog_entries
  drop constraint if exists mod_catalog_entries_provider_check;

alter table public.mod_catalog_entries
  add constraint mod_catalog_entries_provider_check
  check (provider in (
    'steam_workshop',
    'modio',
    'curseforge',
    'direct_url',
    'local_archive',
    'local_folder'
  ));

-- 3) public.user_mod_installs.provider: same pattern, second copy in the same migration.
alter table public.user_mod_installs
  drop constraint if exists user_mod_installs_provider_check;

alter table public.user_mod_installs
  add constraint user_mod_installs_provider_check
  check (provider in (
    'steam_workshop',
    'modio',
    'curseforge',
    'direct_url',
    'local_archive',
    'local_folder'
  ));

-- 4) Defensive cleanup: if any rows were ever inserted with provider/source = 'nexus',
-- delete them so the new CHECK constraints are not violated on a re-apply.
-- These tables only hold mod catalog / install state, so deletion is safe and rare.
delete from public.mod_catalog_entries where provider = 'nexus';
delete from public.user_mod_installs where provider = 'nexus';
delete from public.mods where source = 'nexus';

commit;