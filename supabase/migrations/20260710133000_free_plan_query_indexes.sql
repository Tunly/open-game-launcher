-- Keep the launcher's hottest bounded reads on index scans as tables grow.
create index if not exists performance_snapshots_user_created_idx
  on public.performance_snapshots (user_id, created_at desc);

create index if not exists performance_snapshots_user_game_created_idx
  on public.performance_snapshots (user_id, game_id, created_at desc);

create index if not exists store_order_items_order_idx
  on public.store_order_items (order_id);

create index if not exists store_products_published_created_idx
  on public.store_products (created_at desc)
  where status = 'published';
