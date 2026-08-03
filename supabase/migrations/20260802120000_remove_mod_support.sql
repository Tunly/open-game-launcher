-- Retire mod support only after proving that no hosted mod data or unknown
-- schema dependants would be discarded.

begin;

do $$
declare
  target_oids oid[] := array_remove(array[
    to_regclass('public.user_mod_install_files')::oid,
    to_regclass('public.user_mod_profile_entries')::oid,
    to_regclass('public.user_mod_installs')::oid,
    to_regclass('public.mod_catalog_dependencies')::oid,
    to_regclass('public.mod_catalog_files')::oid,
    to_regclass('public.mod_catalog_versions')::oid,
    to_regclass('public.mod_catalog_entries')::oid,
    to_regclass('public.mod_provider_game_mappings')::oid,
    to_regclass('public.mod_dependencies')::oid,
    to_regclass('public.mod_files')::oid,
    to_regclass('public.mod_versions')::oid,
    to_regclass('public.mod_reviews')::oid,
    to_regclass('public.mods')::oid,
    to_regclass('public.mod_profiles')::oid
  ], null::oid);
  guard_oids oid[] := array_remove(array[
    to_regclass('storage.objects')::oid,
    to_regclass('public.games')::oid,
    to_regclass('public.activity_feed')::oid,
    to_regclass('public.store_products')::oid
  ], null::oid);
  target_oid oid;
  guard_oid oid;
  has_user_data boolean;
begin
  foreach target_oid in array target_oids loop
    execute format(
      'lock table %s in access exclusive mode',
      target_oid::regclass
    );
  end loop;

  foreach guard_oid in array guard_oids loop
    execute format(
      'lock table %s in access exclusive mode',
      guard_oid::regclass
    );
  end loop;

  foreach target_oid in array target_oids loop
    execute format(
      'select exists (select 1 from %s)',
      target_oid::regclass
    ) into has_user_data;

    if has_user_data then
      raise exception
        'Cannot remove mod support while mod rows remain in %.',
        target_oid::regclass
        using errcode = '55000';
    end if;
  end loop;

  if exists (
    select 1
    from pg_constraint dependency
    where dependency.confrelid = any(target_oids)
      and not (dependency.conrelid = any(target_oids))
  ) or exists (
    select 1
    from pg_depend dependency
    join pg_rewrite rewrite
      on dependency.classid = 'pg_rewrite'::regclass
     and rewrite.oid = dependency.objid
    where dependency.refclassid = 'pg_class'::regclass
      and dependency.refobjid = any(target_oids)
      and not (rewrite.ev_class = any(target_oids))
  ) then
    raise exception
      'Cannot remove mod support while unknown schema dependencies remain.'
      using errcode = '2BP01';
  end if;

  if exists (
    select 1
    from storage.objects
    where bucket_id in ('mods', 'mod-files', 'mod-catalog')
  ) then
    raise exception
      'Cannot remove mod support while mod storage objects remain.'
      using errcode = '55000';
  end if;
end
$$;

drop trigger if exists set_mod_catalog_entries_updated_at on public.mod_catalog_entries;
drop trigger if exists set_user_mod_installs_updated_at on public.user_mod_installs;
drop trigger if exists set_user_mod_profile_entries_updated_at on public.user_mod_profile_entries;
drop trigger if exists set_user_mod_install_files_updated_at on public.user_mod_install_files;
drop trigger if exists set_mod_provider_game_mappings_updated_at on public.mod_provider_game_mappings;

drop policy if exists user_mod_install_files_own_select on public.user_mod_install_files;
drop policy if exists user_mod_install_files_own_insert on public.user_mod_install_files;
drop policy if exists user_mod_install_files_own_update on public.user_mod_install_files;
drop policy if exists user_mod_install_files_own_delete on public.user_mod_install_files;

drop policy if exists user_mod_profile_entries_own_select on public.user_mod_profile_entries;
drop policy if exists user_mod_profile_entries_own_insert on public.user_mod_profile_entries;
drop policy if exists user_mod_profile_entries_own_update on public.user_mod_profile_entries;
drop policy if exists user_mod_profile_entries_own_delete on public.user_mod_profile_entries;

drop policy if exists user_mod_installs_own_select on public.user_mod_installs;
drop policy if exists user_mod_installs_own_insert on public.user_mod_installs;
drop policy if exists user_mod_installs_own_update on public.user_mod_installs;
drop policy if exists user_mod_installs_own_delete on public.user_mod_installs;

drop policy if exists mod_catalog_entries_read_published on public.mod_catalog_entries;
drop policy if exists mod_catalog_versions_read_published on public.mod_catalog_versions;
drop policy if exists mod_catalog_files_read_published on public.mod_catalog_files;
drop policy if exists mod_catalog_dependencies_read_published on public.mod_catalog_dependencies;

drop policy if exists mod_provider_game_mappings_read_active on public.mod_provider_game_mappings;
drop policy if exists mod_provider_game_mappings_insert_own on public.mod_provider_game_mappings;
drop policy if exists mod_provider_game_mappings_update_own_unverified on public.mod_provider_game_mappings;
drop policy if exists mod_provider_game_mappings_delete_own_unverified on public.mod_provider_game_mappings;

drop policy if exists mods_own on public.mods;
drop policy if exists mods_read_public on public.mods;
drop policy if exists mod_versions_own on public.mod_versions;
drop policy if exists mod_files_own on public.mod_files;
drop policy if exists mod_deps_own on public.mod_dependencies;
drop policy if exists mod_reviews_own on public.mod_reviews;
drop policy if exists mod_reviews_read_public on public.mod_reviews;
drop policy if exists mod_profiles_own on public.mod_profiles;

drop table if exists public.user_mod_install_files restrict;
drop table if exists public.user_mod_profile_entries restrict;
drop table if exists public.user_mod_installs restrict;
drop table if exists public.mod_catalog_dependencies restrict;
drop table if exists public.mod_catalog_files restrict;
drop table if exists public.mod_catalog_versions restrict;
drop table if exists public.mod_catalog_entries restrict;
drop table if exists public.mod_provider_game_mappings restrict;
drop table if exists public.mod_dependencies restrict;
drop table if exists public.mod_files restrict;
drop table if exists public.mod_versions restrict;
drop table if exists public.mod_reviews restrict;
drop table if exists public.mods restrict;
drop table if exists public.mod_profiles restrict;

commit;
