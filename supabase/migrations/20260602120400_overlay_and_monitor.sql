-- S4: In-Game Overlay — quick actions, chat, social
create table if not exists public.overlay_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  is_enabled boolean not null default true,
  hotkey text not null default 'Shift+Tab',
  position text not null default 'top_right' check (position in ('top_left', 'top_right', 'bottom_left', 'bottom_right')),
  opacity smallint not null default 90 check (opacity between 10 and 100),
  shortcuts jsonb not null default '{"screenshot":"F12","performance":"Ctrl+Shift+P","friends":"Ctrl+Shift+F"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.overlay_settings is 'Per-user overlay preferences and hotkey config.';

alter table public.overlay_settings enable row level security;
grant select, insert, update, delete on public.overlay_settings to authenticated;
drop policy if exists overlay_settings_own on public.overlay_settings;
create policy overlay_settings_own on public.overlay_settings
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- S5: Performance-Monitor — realtime snapshots
create table if not exists public.performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  cpu_percent real not null,
  ram_mb real not null,
  gpu_percent real,
  gpu_temp_c real,
  fps real,
  frame_time_ms real,
  disk_read_mbps real,
  disk_write_mbps real,
  network_up_kbps real,
  network_down_kbps real,
  duration_seconds real,
  created_at timestamptz not null default now()
);
comment on table public.performance_snapshots is 'Realtime performance monitoring data for games.';

alter table public.performance_snapshots enable row level security;
grant select, insert on public.performance_snapshots to authenticated;
drop policy if exists perf_snapshots_own on public.performance_snapshots;
create policy perf_snapshots_own on public.performance_snapshots
  for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists perf_snapshots_insert_own on public.performance_snapshots;
create policy perf_snapshots_insert_own on public.performance_snapshots
  for insert to authenticated
  with check (auth.uid() = user_id);

-- S8: Categories & Tags (structured)
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text unique not null,
  icon text,
  parent_id uuid references public.categories(id) on delete set null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.categories is 'Game categories (FPS, RPG, Strategy, etc.).';

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);
comment on table public.tags is 'Game tags (co-op, singleplayer, competitive, etc.).';

create table if not exists public.game_categories (
  game_id uuid not null references public.games(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (game_id, category_id)
);
comment on table public.game_categories is 'Many-to-many: game <-> category.';

create table if not exists public.game_tags (
  game_id uuid not null references public.games(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (game_id, tag_id)
);
comment on table public.game_tags is 'Many-to-many: game <-> tag.';

grant select on public.categories, public.tags, public.game_categories, public.game_tags to authenticated, anon;
grant insert, update, delete on public.categories, public.tags to authenticated;
grant insert, delete on public.game_categories, public.game_tags to authenticated;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.game_categories enable row level security;
alter table public.game_tags enable row level security;
create policy categories_read_all on public.categories for select to anon, authenticated using (true);
create policy tags_read_all on public.tags for select to anon, authenticated using (true);
create policy game_categories_read_all on public.game_categories for select to anon, authenticated using (true);
create policy game_tags_read_all on public.game_tags for select to anon, authenticated using (true);

-- S8: News Feed
create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  body text not null,
  excerpt text,
  author_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid references public.games(id) on delete set null,
  tags text[] not null default '{}',
  cover_image_url text,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.news_items is 'News articles (game updates, events, announcements).';

alter table public.news_items enable row level security;
grant select on public.news_items to authenticated, anon;
grant insert, update, delete on public.news_items to authenticated;
create policy news_read_published on public.news_items for select to anon, authenticated using (is_published = true or auth.uid() = author_id);
create policy news_author_manage on public.news_items for all to authenticated using (auth.uid() = author_id) with check (auth.uid() = author_id);

-- S8: Screenshots
create table if not exists public.screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid references public.games(id) on delete set null,
  storage_path text not null,
  thumbnail_path text,
  caption text,
  width smallint,
  height smallint,
  size_bytes integer,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.screenshots is 'User-captured game screenshots.';

alter table public.screenshots enable row level security;
grant select, insert, update, delete on public.screenshots to authenticated;
grant select on public.screenshots to anon;
create policy screenshots_read_public on public.screenshots for select to anon, authenticated using (is_public = true or auth.uid() = user_id);
create policy screenshots_own_manage on public.screenshots for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- S8: Price Tracker
create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  platform text not null,
  target_price_cents integer not null check (target_price_cents > 0),
  is_active boolean not null default true,
  last_notified_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.price_alerts is 'Price-drop alerts per user per game per platform.';

alter table public.price_alerts enable row level security;
grant select, insert, update, delete on public.price_alerts to authenticated;
create policy price_alerts_own on public.price_alerts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  platform text not null,
  price_cents integer not null,
  discount_percent smallint not null default 0,
  recorded_at timestamptz not null default now()
);
comment on table public.price_history is 'Historical game prices per platform.';

alter table public.price_history enable row level security;
grant select on public.price_history to authenticated, anon;
