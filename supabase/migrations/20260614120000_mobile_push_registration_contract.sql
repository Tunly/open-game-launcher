create extension if not exists pgcrypto;

create table if not exists public.mobile_push_registrations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  token_hash text not null,
  token_hint text not null default 'token hint redacted',
  permission_status text not null default 'granted',
  consent_granted boolean not null,
  last_registered_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_push_registrations_platform_check
    check (platform in ('ios', 'android')),
  constraint mobile_push_registrations_token_hash_check
    check (token_hash ~ '^sha256:[0-9a-f]{64}$'),
  constraint mobile_push_registrations_token_hint_check
    check (char_length(btrim(token_hint)) between 1 and 80),
  constraint mobile_push_registrations_token_hint_redacted_check
    check (
      token_hint = 'token hint redacted'
      or token_hint ~* '^(apns|fcm)-?\\.\\.\\.[a-z0-9_-]{4,12}$'
    ),
  constraint mobile_push_registrations_permission_status_check
    check (permission_status in ('granted', 'prompt', 'denied')),
  constraint mobile_push_registrations_consent_granted_check
    check (consent_granted = true)
);

comment on table public.mobile_push_registrations is
  'Owner-scoped mobile push registration metadata. Stores consent state and SHA-256 token hashes only; raw APNs/FCM device tokens are never stored. Client mutations go through service-role contract handlers.';

create unique index if not exists mobile_push_registrations_owner_platform_hash_idx
  on public.mobile_push_registrations (owner_id, platform, token_hash)
  where revoked_at is null;

create index if not exists mobile_push_registrations_owner_updated_idx
  on public.mobile_push_registrations (owner_id, updated_at desc);

drop trigger if exists set_mobile_push_registrations_updated_at
  on public.mobile_push_registrations;
create trigger set_mobile_push_registrations_updated_at
  before update on public.mobile_push_registrations
  for each row execute function public.set_updated_at();

alter table public.mobile_push_registrations enable row level security;

revoke all on public.mobile_push_registrations from public, anon, authenticated;
grant select on public.mobile_push_registrations to authenticated;
grant all on public.mobile_push_registrations to service_role;

drop policy if exists mobile_push_registrations_select_owner
  on public.mobile_push_registrations;
create policy mobile_push_registrations_select_owner
  on public.mobile_push_registrations
  for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists mobile_push_registrations_insert_owner
  on public.mobile_push_registrations;
drop policy if exists mobile_push_registrations_update_owner
  on public.mobile_push_registrations;
drop policy if exists mobile_push_registrations_delete_owner
  on public.mobile_push_registrations;
