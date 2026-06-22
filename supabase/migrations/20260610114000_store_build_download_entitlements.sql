-- Private build bucket for entitled store downloads.

insert into storage.buckets (id, name, public)
values ('store-builds', 'store-builds', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists store_builds_storage_developer_read on storage.objects;
create policy store_builds_storage_developer_read
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'store-builds'
    and exists (
      select 1
      from public.store_builds build
      join public.store_products product on product.id = build.product_id
      where build.storage_path = storage.objects.name
        and product.developer_id = auth.uid()
    )
  );

drop policy if exists store_builds_storage_developer_insert on storage.objects;
create policy store_builds_storage_developer_insert
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'store-builds'
    and exists (
      select 1
      from public.store_products product
      where product.developer_id = auth.uid()
        and product.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists store_builds_storage_developer_update on storage.objects;
create policy store_builds_storage_developer_update
  on storage.objects
  for update to authenticated
  using (
    bucket_id = 'store-builds'
    and exists (
      select 1
      from public.store_builds build
      join public.store_products product on product.id = build.product_id
      where build.storage_path = storage.objects.name
        and product.developer_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'store-builds'
    and exists (
      select 1
      from public.store_products product
      where product.developer_id = auth.uid()
        and product.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists store_builds_storage_developer_delete on storage.objects;
create policy store_builds_storage_developer_delete
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'store-builds'
    and exists (
      select 1
      from public.store_builds build
      join public.store_products product on product.id = build.product_id
      where build.storage_path = storage.objects.name
        and product.developer_id = auth.uid()
    )
  );
