-- Preserve account deletion request audit rows after Auth Admin deletion.
-- The user can no longer read the row after deletion, but service-role audits
-- can still verify completed/failed processor outcomes.

alter table public.account_deletion_requests
  drop constraint if exists account_deletion_requests_user_id_fkey;

alter table public.account_deletion_requests
  alter column user_id drop not null;

alter table public.account_deletion_requests
  add constraint account_deletion_requests_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

comment on column public.account_deletion_requests.user_id is
  'Request owner while the Auth user exists. Set to null after trusted processor deletes the Auth user so the audit row survives.';
