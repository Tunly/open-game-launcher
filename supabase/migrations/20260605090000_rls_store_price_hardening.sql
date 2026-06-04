-- 20260605090000_rls_store_price_hardening.sql
-- Phase 1 — Security & RLS Hardening.
-- Closes the gaps called out in ROADMAP.md → Phase 1:
--   * price_history enabled RLS but no SELECT policy (any authenticated gets
--     nothing; anon also blocked even though `grant select` ran)
--   * store_orders, store_order_items, store_builds, store_licenses had
--     grants but no per-row write policies
--   * store_products_developer_manage only checked auth.uid() = developer_id,
--     so anyone could self-publish a product by inserting their own id

-- 1) price_history: read-only for everyone, writes blocked entirely
--    (price drops are written by the notify-price-drop edge function using the
--    service role, which bypasses RLS)
drop policy if exists price_history_read_public on public.price_history;
create policy price_history_read_public on public.price_history
  for select to authenticated, anon
  using (true);

-- 2) store_orders: own-only full CRUD
drop policy if exists store_orders_insert_own on public.store_orders;
create policy store_orders_insert_own on public.store_orders
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists store_orders_update_own on public.store_orders;
create policy store_orders_update_own on public.store_orders
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists store_orders_delete_own on public.store_orders;
create policy store_orders_delete_own on public.store_orders
  for delete to authenticated
  using (auth.uid() = user_id);

-- 3) store_order_items: own-only full CRUD (joined to store_orders.user_id)
alter table public.store_order_items enable row level security;

drop policy if exists store_order_items_own on public.store_order_items;
create policy store_order_items_own on public.store_order_items
  for all to authenticated
  using (
    exists (
      select 1
      from public.store_orders o
      where o.id = store_order_items.order_id
        and o.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.store_orders o
      where o.id = store_order_items.order_id
        and o.user_id = auth.uid()
    )
  );

-- 4) store_builds: developer manages own, public read for builds of
--    published products
alter table public.store_builds enable row level security;

drop policy if exists store_builds_read_published on public.store_builds;
create policy store_builds_read_published on public.store_builds
  for select to authenticated, anon
  using (
    exists (
      select 1
      from public.store_products p
      where p.id = store_builds.product_id
        and (p.status = 'published' or p.developer_id = auth.uid())
    )
  );

drop policy if exists store_builds_developer_manage on public.store_builds;
create policy store_builds_developer_manage on public.store_builds
  for all to authenticated
  using (
    exists (
      select 1
      from public.store_products p
      where p.id = store_builds.product_id
        and p.developer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.store_products p
      where p.id = store_builds.product_id
        and p.developer_id = auth.uid()
    )
  );

-- 5) store_licenses: own-only full CRUD
drop policy if exists store_licenses_insert_own on public.store_licenses;
create policy store_licenses_insert_own on public.store_licenses
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists store_licenses_update_own on public.store_licenses;
create policy store_licenses_update_own on public.store_licenses
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists store_licenses_delete_own on public.store_licenses;
create policy store_licenses_delete_own on public.store_licenses
  for delete to authenticated
  using (auth.uid() = user_id);

-- 6) store_products_developer_manage: now requires an *approved*
--    developer_applications row. Without this, any user could self-publish
--    by inserting store_products with their own user_id as developer_id and
--    status = 'published'.
drop policy if exists store_products_developer_manage on public.store_products;
create policy store_products_developer_manage on public.store_products
  for all to authenticated
  using (
    auth.uid() = developer_id
    and exists (
      select 1
      from public.developer_applications da
      where da.user_id = auth.uid()
        and da.status = 'approved'
    )
  )
  with check (
    auth.uid() = developer_id
    and exists (
      select 1
      from public.developer_applications da
      where da.user_id = auth.uid()
        and da.status = 'approved'
    )
  );
