drop policy if exists community_artwork_storage_update_own_folder on storage.objects;
create policy community_artwork_storage_update_unsubmitted_own_folder
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'game-artwork'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1
      from public.community_artwork_items item
      where item.submitter_id = auth.uid()
        and item.storage_path = name
    )
  )
  with check (
    bucket_id = 'game-artwork'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1
      from public.community_artwork_items item
      where item.submitter_id = auth.uid()
        and item.storage_path = name
    )
  );

drop policy if exists community_artwork_storage_delete_own_folder on storage.objects;
create policy community_artwork_storage_delete_unsubmitted_own_folder
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'game-artwork'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1
      from public.community_artwork_items item
      where item.submitter_id = auth.uid()
        and item.storage_path = name
    )
  );
