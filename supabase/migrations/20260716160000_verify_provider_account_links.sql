-- Keep provider-backed identity proof separate from client-managed account metadata.
-- Only trusted Edge Functions may create these records.

create table if not exists public.provider_account_verifications (
  id uuid primary key default gen_random_uuid(),
  platform_account_id uuid not null references public.platform_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  platform_user_id text not null,
  verification_method text not null,
  provider_nonce text not null,
  verified_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_account_id),
  unique (user_id, platform),
  unique (platform, platform_user_id),
  check (platform = 'steam'),
  check (platform_user_id ~ '^[0-9]{17}$'),
  check (verification_method = 'steam_openid'),
  check (char_length(provider_nonce) between 16 and 512)
);

comment on table public.provider_account_verifications is
  'Server-verified ownership proof for platform accounts. Client metadata is never sufficient for trusted provider relays.';

drop trigger if exists set_provider_account_verifications_updated_at
  on public.provider_account_verifications;
create trigger set_provider_account_verifications_updated_at
  before update on public.provider_account_verifications
  for each row execute function public.set_updated_at();

alter table public.provider_account_verifications enable row level security;
revoke all on table public.provider_account_verifications from anon, authenticated;
grant select on table public.provider_account_verifications to authenticated;

drop policy if exists provider_account_verifications_select_own
  on public.provider_account_verifications;
create policy provider_account_verifications_select_own
  on public.provider_account_verifications
  for select to authenticated
  using (user_id = auth.uid());

create table if not exists public.provider_identity_assertion_nonces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  platform_user_id text not null,
  response_nonce text not null,
  consumed_at timestamptz not null default now(),
  unique (platform, response_nonce),
  check (platform = 'steam'),
  check (platform_user_id ~ '^[0-9]{17}$'),
  check (char_length(response_nonce) between 16 and 512)
);

comment on table public.provider_identity_assertion_nonces is
  'Service-only replay ledger for provider identity assertions.';

alter table public.provider_identity_assertion_nonces enable row level security;
revoke all on table public.provider_identity_assertion_nonces from anon, authenticated;

create or replace function public.link_verified_steam_account(
  p_user_id uuid,
  p_steam_id text,
  p_response_nonce text,
  p_platform_username text default null,
  p_platform_avatar_url text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.platform_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_account public.platform_accounts;
begin
  if p_user_id is null then
    raise exception 'A user id is required.' using errcode = '22023';
  end if;
  if p_steam_id is null or p_steam_id !~ '^[0-9]{17}$' then
    raise exception 'A valid SteamID64 is required.' using errcode = '22023';
  end if;
  if p_response_nonce is null or char_length(p_response_nonce) not between 16 and 512 then
    raise exception 'A valid Steam OpenID response nonce is required.' using errcode = '22023';
  end if;

  insert into public.provider_identity_assertion_nonces (
    user_id,
    platform,
    platform_user_id,
    response_nonce
  ) values (
    p_user_id,
    'steam',
    p_steam_id,
    p_response_nonce
  );

  -- A legacy client-written row must not be able to squat on a Steam identity.
  -- Server-verified ownership for another user is never reassigned here.
  delete from public.platform_accounts as account
  where account.platform = 'steam'
    and account.platform_user_id = p_steam_id
    and account.user_id <> p_user_id
    and not exists (
      select 1
      from public.provider_account_verifications as verification
      where verification.platform_account_id = account.id
    );

  insert into public.platform_accounts (
    user_id,
    platform,
    platform_user_id,
    platform_username,
    platform_avatar_url,
    metadata,
    linked_at
  ) values (
    p_user_id,
    'steam',
    p_steam_id,
    nullif(btrim(p_platform_username), ''),
    nullif(btrim(p_platform_avatar_url), ''),
    coalesce(p_metadata, '{}'::jsonb),
    now()
  )
  on conflict (user_id, platform) do update set
    platform_user_id = excluded.platform_user_id,
    platform_username = excluded.platform_username,
    platform_avatar_url = excluded.platform_avatar_url,
    metadata = excluded.metadata,
    linked_at = now()
  returning * into linked_account;

  insert into public.provider_account_verifications (
    platform_account_id,
    user_id,
    platform,
    platform_user_id,
    verification_method,
    provider_nonce,
    verified_at,
    metadata
  ) values (
    linked_account.id,
    p_user_id,
    'steam',
    p_steam_id,
    'steam_openid',
    p_response_nonce,
    now(),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (user_id, platform) do update set
    platform_account_id = excluded.platform_account_id,
    platform_user_id = excluded.platform_user_id,
    verification_method = excluded.verification_method,
    provider_nonce = excluded.provider_nonce,
    verified_at = excluded.verified_at,
    metadata = excluded.metadata;

  return linked_account;
exception
  when unique_violation then
    raise exception 'Steam identity assertion was already used or the account is already verified.'
      using errcode = '23505';
end;
$$;

revoke all on function public.link_verified_steam_account(uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.link_verified_steam_account(uuid, text, text, text, text, jsonb)
  to service_role;

create or replace function public.block_unverified_steam_account_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.role() = 'authenticated'
    and (
      new.platform = 'steam'
      or (tg_op = 'UPDATE' and old.platform = 'steam')
    )
  then
    raise exception 'Steam accounts must be linked through provider verification.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists block_unverified_steam_account_write on public.platform_accounts;
create trigger block_unverified_steam_account_write
  before insert or update on public.platform_accounts
  for each row execute function public.block_unverified_steam_account_write();
