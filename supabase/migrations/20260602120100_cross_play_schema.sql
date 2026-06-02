-- Cross-Platform-Gameplay: tracks which platforms support cross-play per game
create table if not exists public.game_cross_play (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  platform text not null,
  is_enabled boolean not null default true,
  is_verified boolean not null default false,
  verified_by_user_id uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, platform),
  check (platform in (
    'windows', 'macos', 'linux', 'steam', 'epic', 'gog', 'origin', 'uplay', 'battlenet',
    'xbox', 'playstation', 'switch', 'ios', 'android', 'web'
  ))
);

comment on table public.game_cross_play is 'Tracks which platforms support cross-play for a given game.';

drop trigger if exists set_game_cross_play_updated_at on public.game_cross_play;
create trigger set_game_cross_play_updated_at
  before update on public.game_cross_play
  for each row execute function public.set_updated_at();

grant select on public.game_cross_play to authenticated, anon;
grant insert, update, delete on public.game_cross_play to authenticated;
alter table public.game_cross_play enable row level security;
drop policy if exists game_cross_play_read_all on public.game_cross_play;
create policy game_cross_play_read_all on public.game_cross_play
  for select to authenticated, anon
  using (true);
drop policy if exists game_cross_play_insert_auth on public.game_cross_play;
create policy game_cross_play_insert_auth on public.game_cross_play
  for insert to authenticated
  with check (auth.uid() = verified_by_user_id or verified_by_user_id is null);
drop policy if exists game_cross_play_update_own on public.game_cross_play;
create policy game_cross_play_update_own on public.game_cross_play
  for update to authenticated
  using (auth.uid() = verified_by_user_id)
  with check (auth.uid() = verified_by_user_id);

-- Community-Reports für Smart-Join-Probleme
create table if not exists public.game_cross_play_reports (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  from_platform text not null,
  to_platform text not null,
  issue text not null check (issue in ('cannot_invite', 'cannot_join', 'desync', 'crash', 'voice_chat', 'other')),
  description text,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'wontfix')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.game_cross_play_reports is 'Community reports of cross-play / smart-join issues.';

drop trigger if exists set_game_cross_play_reports_updated_at on public.game_cross_play_reports;
create trigger set_game_cross_play_reports_updated_at
  before update on public.game_cross_play_reports
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.game_cross_play_reports to authenticated;
alter table public.game_cross_play_reports enable row level security;
drop policy if exists game_cross_play_reports_own on public.game_cross_play_reports;
create policy game_cross_play_reports_own on public.game_cross_play_reports
  for all to authenticated
  using (auth.uid() = reporter_id)
  with check (auth.uid() = reporter_id);
drop policy if exists game_cross_play_reports_read_all on public.game_cross_play_reports;
create policy game_cross_play_reports_read_all on public.game_cross_play_reports
  for select to authenticated
  using (status = 'resolved' or auth.uid() = reporter_id);
