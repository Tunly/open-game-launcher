-- Store wishlist and price alerts are scoped to store_products, not profile games.

create table if not exists public.store_wishlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.store_products(id) on delete cascade,
  added_at timestamptz not null default now(),
  constraint store_wishlist_user_product_unique unique (user_id, product_id)
);

comment on table public.store_wishlist is 'Per-user wishlist entries for built-in store products.';

create table if not exists public.store_price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.store_products(id) on delete cascade,
  target_price_cents integer not null check (target_price_cents > 0),
  is_active boolean not null default true,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_price_alerts_user_product_unique unique (user_id, product_id)
);

comment on table public.store_price_alerts is 'Price-drop targets for built-in store products.';

create index if not exists store_wishlist_user_added_idx
  on public.store_wishlist (user_id, added_at desc);

create index if not exists store_price_alerts_user_active_idx
  on public.store_price_alerts (user_id, is_active, updated_at desc);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_store_price_alerts_updated_at') then
    create trigger set_store_price_alerts_updated_at
      before update on public.store_price_alerts
      for each row execute function public.set_updated_at();
  end if;
end $$;

grant select, insert, update, delete on public.store_wishlist to authenticated;
grant select, insert, update, delete on public.store_price_alerts to authenticated;

alter table public.store_wishlist enable row level security;
alter table public.store_price_alerts enable row level security;

drop policy if exists store_wishlist_own on public.store_wishlist;
create policy store_wishlist_own on public.store_wishlist
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists store_price_alerts_own on public.store_price_alerts;
create policy store_price_alerts_own on public.store_price_alerts
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
