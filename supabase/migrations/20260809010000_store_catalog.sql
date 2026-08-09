-- Store catalog: materialized game data enriched from IGDB and synced with ITAD.
-- Separate from legacy store_products, which is not used as a sales flow.

create extension if not exists pg_trgm;

create table if not exists public.store_catalog (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  source text not null check (source in ('itad')),
  title text not null,
  slug text not null,
  description text,
  short_description text,
  publisher text,
  release_date timestamptz,
  genres text[] not null default '{}',
  tags text[] not null default '{}',
  platforms text[] not null default '{}',
  price_cents integer not null default 0 check (price_cents >= 0),
  discount_percent smallint not null default 0 check (discount_percent between 0 and 100),
  cover_image_url text,
  rating numeric(2,1) check (rating between 0.0 and 5.0),
  ratings_count integer not null default 0,
  downloads_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.store_catalog is 'Materialized game catalog enriched from IGDB and synced with ITAD. Read-only for clients; writes via service_role only.';

-- indexes
create index if not exists idx_store_catalog_platforms on public.store_catalog using gin (platforms);
create index if not exists idx_store_catalog_title on public.store_catalog using gin (title gin_trgm_ops);
create index if not exists idx_store_catalog_last_synced_at on public.store_catalog (last_synced_at desc);

-- grants
grant select on public.store_catalog to authenticated, anon;

-- RLS: store_catalog — read-only for all clients, writes only via service_role
alter table public.store_catalog enable row level security;
drop policy if exists store_catalog_read_all on public.store_catalog;
create policy store_catalog_read_all on public.store_catalog
  for select to authenticated, anon
  using (true);
