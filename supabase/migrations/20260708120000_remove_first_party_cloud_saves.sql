-- Remove OG Launcher's first-party cloud save storage.
-- Players should use each platform's own cloud-save feature instead.

begin;

-- Block Storage API uploads and metadata writes for the complete preflight and
-- removal sequence. Supabase migration statements are otherwise autocommitted.
lock table storage.objects in share row exclusive mode;
lock table public.user_cloud_save_files in share row exclusive mode;
lock table public.user_cloud_save_sets in share row exclusive mode;

do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'game-saves'
  ) then
    raise exception
      'Refusing to remove the game-saves bucket while stored save files still exist. Back them up and clear the bucket first.';
  end if;

  if exists (select 1 from public.user_cloud_save_files)
    or exists (select 1 from public.user_cloud_save_sets)
  then
    raise exception
      'Refusing to remove first-party cloud-save metadata while save records still exist. Back them up and clear the metadata first.';
  end if;
end
$$;

drop policy if exists library_cloud_sync_storage_read_own_saves on storage.objects;
drop policy if exists library_cloud_sync_storage_insert_own_saves on storage.objects;
drop policy if exists library_cloud_sync_storage_update_own_saves on storage.objects;
drop policy if exists library_cloud_sync_storage_delete_own_saves on storage.objects;

-- Supabase blocks direct writes to storage.buckets. Keep the now-inaccessible,
-- private bucket as an empty system object; operators may remove it through the
-- Storage API after this migration if desired.

drop table if exists public.user_cloud_save_files;
drop table if exists public.user_cloud_save_sets;

commit;
