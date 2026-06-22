-- DSGVO/GDPR account deletion request queue.
-- Auth users are not deleted immediately; trusted backend jobs can process rows
-- after scheduled_at once the cancellation window has passed.

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  reason text,
  requested_at timestamptz not null default now(),
  scheduled_at timestamptz not null default (now() + interval '30 days'),
  cancelled_at timestamptz,
  completed_at timestamptz,
  request_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_deletion_requests_status_check
    check (status in ('pending', 'cancelled', 'completed')),
  constraint account_deletion_requests_reason_length_check
    check (reason is null or char_length(reason) <= 1000),
  constraint account_deletion_requests_scheduled_after_requested_check
    check (scheduled_at >= requested_at),
  constraint account_deletion_requests_cancelled_at_check
    check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint account_deletion_requests_completed_at_check
    check ((status = 'completed') = (completed_at is not null))
);

comment on table public.account_deletion_requests is
  'Pending/cancelled/completed account deletion requests. Edge Functions create and cancel requests; deletion is processed later by trusted backend jobs.';
comment on column public.account_deletion_requests.scheduled_at is
  'Earliest time at which a trusted backend may process account deletion.';

create index if not exists account_deletion_requests_user_requested_idx
  on public.account_deletion_requests(user_id, requested_at desc);

create unique index if not exists account_deletion_requests_one_pending_per_user_idx
  on public.account_deletion_requests(user_id)
  where status = 'pending';

drop trigger if exists set_account_deletion_requests_updated_at on public.account_deletion_requests;
create trigger set_account_deletion_requests_updated_at
  before update on public.account_deletion_requests
  for each row execute function public.set_updated_at();

alter table public.account_deletion_requests enable row level security;

grant select on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;

drop policy if exists account_deletion_requests_select_own on public.account_deletion_requests;
create policy account_deletion_requests_select_own
  on public.account_deletion_requests
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
