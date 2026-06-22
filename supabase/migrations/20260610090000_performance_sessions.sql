-- S5: Performance-Monitor session aggregates
create table if not exists public.performance_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,
  sample_count integer not null check (sample_count > 0),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds real not null check (duration_seconds >= 0),
  avg_cpu_percent real not null,
  max_cpu_percent real not null,
  avg_ram_mb real not null,
  max_ram_mb real not null,
  avg_fps real,
  max_fps real,
  avg_gpu_percent real,
  max_gpu_percent real,
  created_at timestamptz not null default now(),
  check (ended_at >= started_at)
);
comment on table public.performance_sessions is 'Per-user aggregate performance sessions flushed when the overlay ends.';

create index if not exists performance_sessions_user_ended_idx
  on public.performance_sessions (user_id, ended_at desc);
create index if not exists performance_sessions_user_game_ended_idx
  on public.performance_sessions (user_id, game_id, ended_at desc);

alter table public.performance_sessions enable row level security;
grant select, insert on public.performance_sessions to authenticated;
drop policy if exists perf_sessions_own on public.performance_sessions;
create policy perf_sessions_own on public.performance_sessions
  for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists perf_sessions_insert_own on public.performance_sessions;
create policy perf_sessions_insert_own on public.performance_sessions
  for insert to authenticated
  with check (auth.uid() = user_id);
