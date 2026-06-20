-- Add a processor-owned claim state so cancellation cannot race destructive work.

alter table public.account_deletion_requests
  drop constraint if exists account_deletion_requests_status_check,
  add constraint account_deletion_requests_status_check
    check (status in ('pending', 'processing', 'cancelled', 'completed', 'failed'));

drop index if exists account_deletion_requests_one_pending_per_user_idx;

create unique index if not exists account_deletion_requests_one_active_per_user_idx
  on public.account_deletion_requests(user_id)
  where status in ('pending', 'processing');

comment on table public.account_deletion_requests is
  'Pending/processing/cancelled/completed/failed account deletion requests. Edge Functions create and cancel pending requests; the trusted processor claims due rows as processing before destructive deletion.';
