-- Remove OG Launcher's first-party cloud save storage.
-- Players should use each platform's own cloud-save feature instead.

drop policy if exists library_cloud_sync_storage_read_own_saves on storage.objects;
drop policy if exists library_cloud_sync_storage_insert_own_saves on storage.objects;
drop policy if exists library_cloud_sync_storage_update_own_saves on storage.objects;
drop policy if exists library_cloud_sync_storage_delete_own_saves on storage.objects;

delete from storage.objects where bucket_id = 'game-saves';
delete from storage.buckets where id = 'game-saves';

drop table if exists public.user_cloud_save_files cascade;
drop table if exists public.user_cloud_save_sets cascade;
