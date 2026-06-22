create extension if not exists pgcrypto;

create table if not exists public.presence_poll_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique,
  trigger_source text not null default 'manual',
  dry_run boolean not null,
  forced boolean not null default false,
  platforms text[] not null default '{}',
  requested_user_count integer not null default 0,
  scanned_count integer not null default 0,
  polled_count integer not null default 0,
  presence_updated_count integer not null default 0,
  activity_inserted_count integer not null default 0,
  skipped_count integer not null default 0,
  skipped_summary jsonb not null default '{}'::jsonb,
  provider_result_summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint presence_poll_runs_trigger_source_check
    check (trigger_source in ('manual', 'scheduled', 'hosted_deploy_gate')),
  constraint presence_poll_runs_status_check
    check (status in ('started', 'dry_run', 'completed', 'failed')),
  constraint presence_poll_runs_platforms_check
    check (
      platforms <@ array[
        'steam',
        'epic',
        'gog',
        'ea',
        'xbox',
        'battlenet',
        'ubisoft',
        'og'
      ]::text[]
    ),
  constraint presence_poll_runs_counts_check
    check (
      requested_user_count >= 0
      and scanned_count >= 0
      and polled_count >= 0
      and presence_updated_count >= 0
      and activity_inserted_count >= 0
      and skipped_count >= 0
    ),
  constraint presence_poll_runs_summary_shape_check
    check (
      jsonb_typeof(skipped_summary) = 'object'
      and jsonb_typeof(provider_result_summary) = 'object'
    )
);

comment on table public.presence_poll_runs is
  'Sanitized service-role evidence for hosted presence poll runs. Stores aggregate counts and platform/status summaries only; raw account IDs, user IDs, tokens, and game titles are never stored.';

create index if not exists presence_poll_runs_created_at_idx
  on public.presence_poll_runs (created_at desc);

create index if not exists presence_poll_runs_trigger_source_created_at_idx
  on public.presence_poll_runs (trigger_source, created_at desc);

drop trigger if exists set_presence_poll_runs_updated_at
  on public.presence_poll_runs;
create trigger set_presence_poll_runs_updated_at
  before update on public.presence_poll_runs
  for each row execute function public.set_updated_at();

alter table public.presence_poll_runs enable row level security;

revoke all on public.presence_poll_runs from public, anon, authenticated;
grant select on public.presence_poll_runs to authenticated;
grant all on public.presence_poll_runs to service_role;

drop policy if exists presence_poll_runs_select_authenticated
  on public.presence_poll_runs;
create policy presence_poll_runs_select_authenticated
  on public.presence_poll_runs
  for select
  to authenticated
  using (true);

drop policy if exists presence_poll_runs_insert_authenticated
  on public.presence_poll_runs;
drop policy if exists presence_poll_runs_update_authenticated
  on public.presence_poll_runs;
drop policy if exists presence_poll_runs_delete_authenticated
  on public.presence_poll_runs;
