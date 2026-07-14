-- Retire screenshot support only after proving that no hosted screenshot data
-- or unknown schema dependants would be discarded.

begin;

do $$
declare
  target_oids oid[] := array_remove(array[
    to_regclass('public.screenshot_moderation_audit')::oid,
    to_regclass('public.screenshot_reports')::oid,
    to_regclass('public.screenshot_likes')::oid,
    to_regclass('public.screenshots')::oid
  ], null::oid);
  guard_oids oid[] := array_remove(array[
    to_regclass('storage.objects')::oid,
    to_regclass('public.profile_showcases')::oid,
    to_regclass('public.activity_feed')::oid,
    to_regclass('public.store_products')::oid,
    to_regclass('public.mod_catalog_entries')::oid,
    to_regclass('public.overlay_settings')::oid
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
        'Cannot remove screenshot support while screenshot rows remain in %.',
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
      'Cannot remove screenshot support while unknown schema dependencies remain.'
      using errcode = '2BP01';
  end if;

  if exists (
    select 1
    from storage.objects
    where bucket_id = 'screenshots'
  ) then
    raise exception
      'Cannot remove screenshot support while screenshot storage objects remain.'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.profile_showcases
    where type = 'screenshots'
  ) then
    raise exception
      'Cannot remove screenshot support while screenshot profile showcases remain.'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.activity_feed
    where type = 'screenshot_taken'
       or screenshot_url is not null
  ) then
    raise exception
      'Cannot remove screenshot support while screenshot activity rows remain.'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.store_products
    where coalesce(cardinality(screenshots), 0) > 0
  ) or exists (
    select 1
    from public.mod_catalog_entries
    where coalesce(cardinality(screenshots), 0) > 0
  ) then
    raise exception
      'Cannot remove screenshot support while store or mod screenshot arrays remain.'
      using errcode = '55000';
  end if;
end
$$;

drop trigger if exists sync_screenshot_report_state_after_write
  on public.screenshot_reports;
drop trigger if exists enforce_screenshot_report_rate_limit_before_insert
  on public.screenshot_reports;
drop trigger if exists prevent_screenshot_moderation_tampering_before_update
  on public.screenshots;

drop policy if exists screenshot_reports_select_own on public.screenshot_reports;
drop policy if exists screenshot_reports_insert_approved_own on public.screenshot_reports;
drop policy if exists screenshot_reports_update_own on public.screenshot_reports;

drop policy if exists screenshot_likes_read_visible on public.screenshot_likes;
drop policy if exists screenshot_likes_insert_visible_own on public.screenshot_likes;
drop policy if exists screenshot_likes_delete_own on public.screenshot_likes;

drop policy if exists screenshots_read_public on public.screenshots;
drop policy if exists screenshots_own_manage on public.screenshots;

drop policy if exists screenshots_storage_read_visible on storage.objects;

drop policy if exists profile_system_storage_insert_own_folder on storage.objects;
create policy profile_system_storage_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'profile-banners', 'profile-showcases')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists profile_system_storage_update_own_folder on storage.objects;
create policy profile_system_storage_update_own_folder on storage.objects
  for update to authenticated
  using (
    bucket_id in ('avatars', 'profile-banners', 'profile-showcases')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('avatars', 'profile-banners', 'profile-showcases')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists profile_system_storage_delete_own_folder on storage.objects;
create policy profile_system_storage_delete_own_folder on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('avatars', 'profile-banners', 'profile-showcases')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop function if exists public.list_public_screenshot_feed_ranked(integer) restrict;
drop function if exists public.review_screenshot(uuid, text, text, uuid) restrict;
drop function if exists public.report_screenshot(uuid, text, text) restrict;
drop function if exists public.prevent_screenshot_moderation_tampering() restrict;
drop function if exists public.enforce_screenshot_report_rate_limit() restrict;
drop function if exists public.sync_screenshot_report_state_trigger() restrict;
drop function if exists public.sync_screenshot_report_state(uuid) restrict;

drop table if exists public.screenshot_moderation_audit restrict;
drop table if exists public.screenshot_reports restrict;
drop table if exists public.screenshot_likes restrict;
drop table if exists public.screenshots restrict;

-- The empty screenshots bucket is removed through the Storage API before this
-- migration. Direct writes to storage.buckets are intentionally blocked by
-- hosted Supabase, even for migration roles.

alter table public.overlay_settings
  alter column shortcuts set default '{"performance":"Ctrl+Shift+P","friends":"Ctrl+Shift+F"}'::jsonb;
update public.overlay_settings set shortcuts = shortcuts - 'screenshot';

alter table public.profile_showcases
  drop constraint if exists profile_showcases_type_check;
alter table public.profile_showcases
  add constraint profile_showcases_type_check
  check (type in (
    'about',
    'favorite_games',
    'rare_achievements',
    'latest_achievements',
    'completionist',
    'stats',
    'collections',
    'reviews',
    'wishlist',
    'activity',
    'friends',
    'hardware_setup',
    'custom_text',
    'trophy_case'
  ));

alter table public.activity_feed
  drop constraint if exists activity_feed_type_check;
alter table public.activity_feed
  add constraint activity_feed_type_check
  check (type in ('status', 'game_start', 'game_stop', 'achievement_unlocked'));
drop policy if exists activity_feed_insert_own on public.activity_feed;
create policy activity_feed_insert_own
  on public.activity_feed
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and type in ('status', 'game_start', 'game_stop')
  );
alter table public.activity_feed
  drop column if exists screenshot_url;

alter table public.store_products
  drop column if exists screenshots;
alter table public.mod_catalog_entries
  drop column if exists screenshots;

commit;
