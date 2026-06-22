create extension if not exists pgcrypto;

create table if not exists public.store_price_drop_notification_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique,
  trigger_source text not null default 'manual',
  dry_run boolean not null,
  limit_count integer not null default 0,
  requested_alert_count integer not null default 0,
  requested_product_count integer not null default 0,
  requested_user_count integer not null default 0,
  scanned_count integer not null default 0,
  candidate_count integer not null default 0,
  notifications_recorded_count integer not null default 0,
  alerts_marked_count integer not null default 0,
  skipped_summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_price_drop_notification_runs_trigger_source_check
    check (trigger_source in ('manual', 'scheduled', 'hosted_deploy_gate')),
  constraint store_price_drop_notification_runs_status_check
    check (status in ('dry_run', 'completed', 'failed')),
  constraint store_price_drop_notification_runs_counts_check
    check (
      limit_count >= 0
      and requested_alert_count >= 0
      and requested_product_count >= 0
      and requested_user_count >= 0
      and scanned_count >= 0
      and candidate_count >= 0
      and notifications_recorded_count >= 0
      and alerts_marked_count >= 0
    ),
  constraint store_price_drop_notification_runs_summary_shape_check
    check (jsonb_typeof(skipped_summary) = 'object')
);

comment on table public.store_price_drop_notification_runs is
  'Sanitized service-role evidence for notify-price-drop cron runs. Stores aggregate counts and skip summaries only; raw alert IDs, product IDs, user IDs, product titles, and notification payloads are never stored.';

create index if not exists store_price_drop_notification_runs_created_at_idx
  on public.store_price_drop_notification_runs (created_at desc);

create index if not exists store_price_drop_notification_runs_trigger_created_at_idx
  on public.store_price_drop_notification_runs (trigger_source, created_at desc);

drop trigger if exists set_store_price_drop_notification_runs_updated_at
  on public.store_price_drop_notification_runs;
create trigger set_store_price_drop_notification_runs_updated_at
  before update on public.store_price_drop_notification_runs
  for each row execute function public.set_updated_at();

alter table public.store_price_drop_notification_runs enable row level security;

revoke all on public.store_price_drop_notification_runs from public, anon, authenticated;
grant select on public.store_price_drop_notification_runs to authenticated;
grant all on public.store_price_drop_notification_runs to service_role;

drop policy if exists store_price_drop_notification_runs_select_authenticated
  on public.store_price_drop_notification_runs;
create policy store_price_drop_notification_runs_select_authenticated
  on public.store_price_drop_notification_runs
  for select
  to authenticated
  using (true);

drop policy if exists store_price_drop_notification_runs_insert_authenticated
  on public.store_price_drop_notification_runs;
drop policy if exists store_price_drop_notification_runs_update_authenticated
  on public.store_price_drop_notification_runs;
drop policy if exists store_price_drop_notification_runs_delete_authenticated
  on public.store_price_drop_notification_runs;
