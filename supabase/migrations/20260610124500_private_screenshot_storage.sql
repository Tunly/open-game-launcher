-- Harden screenshot privacy: metadata visibility is enforced by RLS and object
-- access now uses signed URLs instead of a globally public bucket.

insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false)
on conflict (id) do update set public = false;

drop policy if exists profile_system_storage_public_read on storage.objects;
create policy profile_system_storage_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('avatars', 'profile-banners', 'profile-showcases'));

drop policy if exists screenshots_storage_read_visible on storage.objects;
create policy screenshots_storage_read_visible on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'screenshots'
    and (
      (
        auth.uid() is not null
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      or exists (
        select 1
        from public.screenshots s
        where (s.storage_path = storage.objects.name or s.thumbnail_path = storage.objects.name)
          and (s.is_public = true or auth.uid() = s.user_id)
      )
    )
  );
