-- Trusted account deletion processor support.
-- Failed rows stay visible to the user/admin instead of being retried forever.

alter table public.account_deletion_requests
  add column if not exists failed_at timestamptz,
  add column if not exists error_message text;

alter table public.account_deletion_requests
  drop constraint if exists account_deletion_requests_status_check,
  add constraint account_deletion_requests_status_check
    check (status in ('pending', 'cancelled', 'completed', 'failed'));

alter table public.account_deletion_requests
  drop constraint if exists account_deletion_requests_failed_at_check,
  add constraint account_deletion_requests_failed_at_check
    check ((status = 'failed') = (failed_at is not null));

alter table public.account_deletion_requests
  drop constraint if exists account_deletion_requests_error_message_length_check,
  add constraint account_deletion_requests_error_message_length_check
    check (error_message is null or char_length(error_message) <= 2000);

comment on column public.account_deletion_requests.failed_at is
  'Set by the trusted processor when a scheduled deletion cannot be completed.';
comment on column public.account_deletion_requests.error_message is
  'Short processor error message for operator/user support.';
