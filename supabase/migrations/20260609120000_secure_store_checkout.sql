-- Store checkout must be fulfilled by trusted Edge Functions, not by
-- authenticated clients writing their own orders or licenses.

revoke insert, update, delete on public.store_orders from authenticated;
revoke insert, update, delete on public.store_order_items from authenticated;
revoke insert, update, delete on public.store_licenses from authenticated;

grant select on public.store_orders to authenticated;
grant select on public.store_order_items to authenticated;
grant select on public.store_licenses to authenticated;

grant all on public.store_orders to service_role;
grant all on public.store_order_items to service_role;
grant all on public.store_licenses to service_role;

drop policy if exists store_orders_insert_own on public.store_orders;
drop policy if exists store_orders_update_own on public.store_orders;
drop policy if exists store_orders_delete_own on public.store_orders;

drop policy if exists store_licenses_insert_own on public.store_licenses;
drop policy if exists store_licenses_update_own on public.store_licenses;
drop policy if exists store_licenses_delete_own on public.store_licenses;

create unique index if not exists store_licenses_active_user_product_platform_unique
  on public.store_licenses (user_id, product_id, platform)
  where is_revoked = false;
