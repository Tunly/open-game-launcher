create table if not exists public.rawg_asset_cache (
  normalized_title text primary key,
  cover_url text,
  logo_url text,
  icon_url text,
  status text not null default 'hit',
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rawg_asset_cache_status_check check (status in ('hit', 'miss'))
);

alter table public.rawg_asset_cache enable row level security;

create policy "rawg asset cache is readable"
  on public.rawg_asset_cache
  for select
  to anon, authenticated
  using (true);

grant select on table public.rawg_asset_cache to anon, authenticated;
grant insert, update, delete, select on table public.rawg_asset_cache to service_role;

create index if not exists rawg_asset_cache_fetched_at_idx
  on public.rawg_asset_cache (fetched_at);
