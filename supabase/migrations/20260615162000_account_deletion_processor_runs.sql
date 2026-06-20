create extension if not exists pgcrypto;

create table if not exists public.account_deletion_processor_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique,
  trigger_source text not null default 'manual',
  dry_run boolean not null,
  limit_count integer not null default 0,
  due_request_count integer not null default 0,
  would_process_count integer not null default 0,
  claimed_count integer not null default 0,
  skipped_count integer not null default 0,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  storage_bucket_count integer not null default 0,
  skipped_summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_deletion_processor_runs_trigger_source_check
    check (trigger_source in ('manual', 'scheduled', 'hosted_deploy_gate')),
  constraint account_deletion_processor_runs_status_check
    check (status in ('dry_run', 'completed', 'failed')),
  constraint account_deletion_processor_runs_counts_check
    check (
      limit_count >= 0
      and due_request_count >= 0
      and would_process_count >= 0
      and claimed_count >= 0
      and skipped_count >= 0
      and completed_count >= 0
      and failed_count >= 0
      and storage_bucket_count >= 0
    ),
  constraint account_deletion_processor_runs_summary_shape_check
    check (jsonb_typeof(skipped_summary) = 'object')
);

comment on table public.account_deletion_processor_runs is
  'Sanitized service-role evidence for account deletion processor runs. Stores aggregate counts only; raw request IDs, user IDs, secrets, request metadata, and storage object paths are never stored.';

create index if not exists account_deletion_processor_runs_created_at_idx
  on public.account_deletion_processor_runs (created_at desc);

create index if not exists account_deletion_processor_runs_trigger_created_at_idx
  on public.account_deletion_processor_runs (trigger_source, created_at desc);

drop trigger if exists set_account_deletion_processor_runs_updated_at
  on public.account_deletion_processor_runs;
create trigger set_account_deletion_processor_runs_updated_at
  before update on public.account_deletion_processor_runs
  for each row execute function public.set_updated_at();

alter table public.account_deletion_processor_runs enable row level security;

revoke all on public.account_deletion_processor_runs from public, anon, authenticated;
grant select on public.account_deletion_processor_runs to authenticated;
grant all on public.account_deletion_processor_runs to service_role;

drop policy if exists account_deletion_processor_runs_select_authenticated
  on public.account_deletion_processor_runs;
create policy account_deletion_processor_runs_select_authenticated
  on public.account_deletion_processor_runs
  for select
  to authenticated
  using (true);

drop policy if exists account_deletion_processor_runs_insert_authenticated
  on public.account_deletion_processor_runs;
drop policy if exists account_deletion_processor_runs_update_authenticated
  on public.account_deletion_processor_runs;
drop policy if exists account_deletion_processor_runs_delete_authenticated
  on public.account_deletion_processor_runs;
