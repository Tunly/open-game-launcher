-- Game Store Backend: products, cart, orders, builds, licenses, developer portal

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  description text,
  short_description text,
  developer_id uuid not null references auth.users(id) on delete restrict,
  publisher text,
  release_date timestamptz,
  genres text[] not null default '{}',
  tags text[] not null default '{}',
  platforms text[] not null default '{}',
  price_cents integer not null default 0 check (price_cents >= 0),
  discount_percent smallint not null default 0 check (discount_percent between 0 and 100),
  cover_image_url text,
  screenshots text[] not null default '{}',
  trailer_url text,
  min_system_requirements jsonb not null default '{}'::jsonb,
  rec_system_requirements jsonb not null default '{}'::jsonb,
  rating numeric(2,1) check (rating between 0.0 and 5.0),
  ratings_count integer not null default 0,
  downloads_count integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'delisted', 'suspended')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.store_products is 'Game products listed in the built-in game store.';

create table if not exists public.store_cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.store_products(id) on delete cascade,
  quantity smallint not null default 1 check (quantity > 0),
  added_at timestamptz not null default now(),
  unique (user_id, product_id)
);

comment on table public.store_cart_items is 'Shopping cart: one row per user per product.';

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text unique,
  stripe_payment_intent text,
  subtotal_cents integer not null,
  tax_cents integer not null default 0,
  total_cents integer not null,
  currency text not null default 'eur',
  status text not null default 'pending' check (status in ('pending', 'paid', 'fulfilled', 'refunded', 'failed', 'expired')),
  payment_method text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.store_orders is 'Completed or pending purchase orders from the built-in store.';

create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  product_id uuid not null references public.store_products(id) on delete restrict,
  title_snapshot text not null,
  price_cents_snapshot integer not null,
  quantity smallint not null,
  unique (order_id, product_id)
);

comment on table public.store_order_items is 'Line items in a store order — price snapshot for history.';

create table if not exists public.store_builds (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.store_products(id) on delete cascade,
  version text not null,
  platform text not null check (platform in ('windows', 'macos', 'linux')),
  arch text not null default 'x86_64' check (arch in ('x86_64', 'aarch64')),
  file_name text not null,
  size_bytes bigint not null default 0,
  sha256 text,
  storage_path text not null,
  changelog text,
  is_latest boolean not null default true,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.store_builds is 'Game build artifacts stored in Supabase Storage.';

create table if not exists public.store_licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.store_products(id) on delete restrict,
  order_id uuid references public.store_orders(id) on delete set null,
  license_key text unique not null,
  platform text not null,
  device_id text,
  activations_left smallint not null default 3,
  expires_at timestamptz,
  is_revoked boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.store_licenses is 'Issued license keys per user per product. One license per platform.';

create table if not exists public.developer_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  studio_name text not null,
  website text,
  description text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.developer_applications is 'Developer portal applications for publishing games.';

-- triggers
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_store_products_updated_at') then
    create trigger set_store_products_updated_at
      before update on public.store_products
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- grants
grant select on public.store_products to authenticated, anon;
grant insert, update, delete on public.store_products to authenticated;
grant select, insert, update, delete on public.store_cart_items to authenticated;
grant select, insert, update, delete on public.store_orders to authenticated;
grant select on public.store_order_items to authenticated;
grant select on public.store_builds to authenticated, anon;
grant insert, update on public.store_builds to authenticated;
grant select on public.store_licenses to authenticated;
grant insert, update on public.store_licenses to authenticated;
grant select, insert, update on public.developer_applications to authenticated;

-- RLS: store_products — everyone can read published, developer manages own
alter table public.store_products enable row level security;
drop policy if exists store_products_read_published on public.store_products;
create policy store_products_read_published on public.store_products
  for select to authenticated, anon
  using (status = 'published' or auth.uid() = developer_id);
drop policy if exists store_products_developer_manage on public.store_products;
create policy store_products_developer_manage on public.store_products
  for all to authenticated
  using (auth.uid() = developer_id)
  with check (auth.uid() = developer_id);

-- RLS: cart_items — own only
alter table public.store_cart_items enable row level security;
drop policy if exists store_cart_items_own on public.store_cart_items;
create policy store_cart_items_own on public.store_cart_items
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RLS: orders — own only
alter table public.store_orders enable row level security;
drop policy if exists store_orders_own on public.store_orders;
create policy store_orders_own on public.store_orders
  for select to authenticated
  using (auth.uid() = user_id);

-- RLS: licenses — own only
alter table public.store_licenses enable row level security;
drop policy if exists store_licenses_own on public.store_licenses;
create policy store_licenses_own on public.store_licenses
  for select to authenticated
  using (auth.uid() = user_id);

-- RLS: developer_applications — own only
alter table public.developer_applications enable row level security;
drop policy if exists developer_applications_own on public.developer_applications;
create policy developer_applications_own on public.developer_applications
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
