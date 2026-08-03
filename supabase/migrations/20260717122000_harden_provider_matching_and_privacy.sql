-- Provider identities are trusted only after a server-side verification record
-- exists. Client-managed platform_accounts remain useful as local integration
-- metadata, but must never act as proof of identity.

-- The old trigger trusted every platform_accounts row, including client-written
-- Epic/GOG/EA/Xbox/Battle.net/Ubisoft identifiers.
drop trigger if exists auto_match_on_platform_link on public.platform_accounts;
drop function if exists public.auto_match_friend_links();

comment on column public.platform_accounts.platform_user_id is
  'Client-observed provider identifier. It is trusted for cross-user matching only when an aligned provider_account_verifications row exists.';

-- Provider account rows contain stable external identifiers and integration
-- metadata. Cross-user discovery now happens in trusted triggers, so clients
-- only need to read their own rows.
drop policy if exists platform_accounts_select_own on public.platform_accounts;
create policy platform_accounts_select_own on public.platform_accounts
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke select on table public.platform_accounts from anon;

-- A verification must describe the exact platform account referenced by its
-- foreign key. This also makes future provider-verification implementations
-- fail closed if they accidentally write a mismatched assertion.
create or replace function private.enforce_provider_verification_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.platform_accounts as account
    where account.id = new.platform_account_id
      and account.user_id = new.user_id
      and account.platform = new.platform
      and account.platform_user_id = new.platform_user_id
  ) then
    raise exception 'Provider verification does not match its platform account.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_provider_verification_consistency()
  from public, anon, authenticated;

drop trigger if exists enforce_provider_verification_consistency
  on public.provider_account_verifications;
create trigger enforce_provider_verification_consistency
  before insert or update on public.provider_account_verifications
  for each row execute function private.enforce_provider_verification_consistency();

-- Resolve one friend-link row to a verified OG user. A direct provider-id
-- proof wins. Merge-group propagation is allowed only when every verified
-- anchor in that owner's group resolves to one and the same user.
create or replace function private.verified_friend_link_match_user(
  p_owner_id uuid,
  p_platform text,
  p_platform_friend_id text,
  p_merge_group_id uuid
)
returns uuid
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  matched_user_id uuid;
begin
  select verification.user_id
  into matched_user_id
  from public.provider_account_verifications as verification
  where verification.platform = p_platform
    and verification.platform_user_id = p_platform_friend_id;

  if found then
    return matched_user_id;
  end if;

  if p_merge_group_id is null then
    return null;
  end if;

  select min(verification.user_id::text)::uuid
  into matched_user_id
  from public.friend_links as anchor
  join public.provider_account_verifications as verification
    on verification.platform = anchor.platform
   and verification.platform_user_id = anchor.platform_friend_id
  where anchor.owner_id = p_owner_id
    and anchor.merge_group_id = p_merge_group_id
  having count(distinct verification.user_id) = 1;

  return matched_user_id;
end;
$$;

revoke execute on function private.verified_friend_link_match_user(uuid, text, text, uuid)
  from public, anon, authenticated;

-- Reconcile only automatic linked-account matches. Manual matches and
-- heuristic merge decisions remain user-owned. This deliberately demotes old
-- unverified automatic matches while retaining verified direct/group matches.
create or replace function private.reconcile_verified_friend_link_matches()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.friend_links as link
  set matched_user_id = null,
      match_method = null,
      updated_at = now()
  where link.match_method = 'linked_account'
    and private.verified_friend_link_match_user(
      link.owner_id,
      link.platform,
      link.platform_friend_id,
      link.merge_group_id
    ) is distinct from link.matched_user_id;

  update public.friend_links as link
  set matched_user_id = private.verified_friend_link_match_user(
        link.owner_id,
        link.platform,
        link.platform_friend_id,
        link.merge_group_id
      ),
      match_method = 'linked_account',
      updated_at = now()
  where link.matched_user_id is null
    and private.verified_friend_link_match_user(
      link.owner_id,
      link.platform,
      link.platform_friend_id,
      link.merge_group_id
    ) is not null;
end;
$$;

revoke execute on function private.reconcile_verified_friend_link_matches()
  from public, anon, authenticated;

create or replace function private.reconcile_friend_links_after_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.reconcile_verified_friend_link_matches();
  return null;
end;
$$;

revoke execute on function private.reconcile_friend_links_after_verification()
  from public, anon, authenticated;

drop trigger if exists reconcile_friend_links_after_verification
  on public.provider_account_verifications;
create trigger reconcile_friend_links_after_verification
  after insert or update or delete on public.provider_account_verifications
  for each statement execute function private.reconcile_friend_links_after_verification();

-- Later friend imports must be matched server-side as well. This closes the
-- Stage-1 RLS gap without reopening platform_accounts to cross-user reads.
create or replace function private.reconcile_friend_links_after_import()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.reconcile_verified_friend_link_matches();
  return null;
end;
$$;

revoke execute on function private.reconcile_friend_links_after_import()
  from public, anon, authenticated;

drop trigger if exists reconcile_friend_links_after_import on public.friend_links;
create trigger reconcile_friend_links_after_import
  after insert or update of platform, platform_friend_id, merge_group_id or delete
  on public.friend_links
  for each statement execute function private.reconcile_friend_links_after_import();

-- linked_account is a server-produced trust label. Owners may still make an
-- explicit manual match, but cannot manufacture verified-match provenance.
create or replace function private.block_client_linked_account_provenance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.role() = 'authenticated'
    and current_user = 'authenticated'
    and new.match_method = 'linked_account'
    and (
      tg_op = 'INSERT'
      or old.match_method is distinct from 'linked_account'
      or old.matched_user_id is distinct from new.matched_user_id
    )
  then
    raise exception 'Linked-account matches require a verified provider identity.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.block_client_linked_account_provenance()
  from public, anon, authenticated;

drop trigger if exists block_client_linked_account_provenance
  on public.friend_links;
create trigger block_client_linked_account_provenance
  before insert or update of matched_user_id, match_method on public.friend_links
  for each row execute function private.block_client_linked_account_provenance();

-- Repair old automatic matches once using the verified identity ledger. The
-- provider account rows themselves are intentionally retained.
select private.reconcile_verified_friend_link_matches();

-- Poll cadence/results are operational secrets, not profile metadata. Move
-- existing verified cache records to a service-only relation and scrub every
-- client-readable metadata document.
create table if not exists public.platform_presence_poll_cache (
  platform_account_id uuid primary key
    references public.provider_account_verifications(platform_account_id)
    on delete cascade,
  cache jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_presence_poll_cache_object_check
    check (jsonb_typeof(cache) = 'object')
);

comment on table public.platform_presence_poll_cache is
  'Service-only provider polling cache. Never expose through platform_accounts.metadata or client RLS policies.';

drop trigger if exists set_platform_presence_poll_cache_updated_at
  on public.platform_presence_poll_cache;
create trigger set_platform_presence_poll_cache_updated_at
  before update on public.platform_presence_poll_cache
  for each row execute function public.set_updated_at();

alter table public.platform_presence_poll_cache enable row level security;
revoke all on table public.platform_presence_poll_cache
  from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_presence_poll_cache
  to service_role;

insert into public.platform_presence_poll_cache (platform_account_id, cache)
select account.id, account.metadata -> 'presencePollCache'
from public.platform_accounts as account
join public.provider_account_verifications as verification
  on verification.platform_account_id = account.id
where jsonb_typeof(account.metadata -> 'presencePollCache') = 'object'
on conflict (platform_account_id) do update
set cache = excluded.cache,
    updated_at = now();

create or replace function private.strip_presence_cache_from_account_metadata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.metadata := coalesce(new.metadata, '{}'::jsonb) - 'presencePollCache';
  return new;
end;
$$;

revoke execute on function private.strip_presence_cache_from_account_metadata()
  from public, anon, authenticated;

drop trigger if exists strip_presence_cache_from_account_metadata
  on public.platform_accounts;
create trigger strip_presence_cache_from_account_metadata
  before insert or update of metadata on public.platform_accounts
  for each row execute function private.strip_presence_cache_from_account_metadata();

update public.platform_accounts
set metadata = metadata - 'presencePollCache'
where metadata ? 'presencePollCache';

-- Private relationship helpers are implementation details. Public wrappers
-- retain RLS compatibility, execute with the function owner so revoked private
-- EXECUTE does not break policies, and bind every viewer argument to auth.uid().
revoke execute on function private.is_friend(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.is_blocked(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.can_view_visibility(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function private.can_view_profile(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.can_view_online_status(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.can_view_game_activity(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function private.can_view_achievements(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.is_friend(user_a uuid, user_b uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when auth.uid() <> user_a and auth.uid() <> user_b then false
    else private.is_friend(user_a, user_b)
  end;
$$;

create or replace function public.is_blocked(user_a uuid, user_b uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when auth.uid() is null then true
    when auth.uid() <> user_a and auth.uid() <> user_b then true
    else private.is_blocked(user_a, user_b)
  end;
$$;

create or replace function public.can_view_visibility(
  viewer_id uuid,
  owner_id uuid,
  visibility text
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when viewer_id is distinct from auth.uid() then false
    else private.can_view_visibility(auth.uid(), owner_id, visibility)
  end;
$$;

create or replace function public.can_view_profile(
  viewer_id uuid,
  profile_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when viewer_id is distinct from auth.uid() then false
    else private.can_view_profile(auth.uid(), profile_user_id)
  end;
$$;

create or replace function public.can_view_online_status(
  viewer_id uuid,
  profile_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when viewer_id is distinct from auth.uid() then false
    else private.can_view_online_status(auth.uid(), profile_user_id)
  end;
$$;

create or replace function public.can_view_game_activity(
  viewer_id uuid,
  profile_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when viewer_id is distinct from auth.uid() then false
    else private.can_view_game_activity(auth.uid(), profile_user_id)
  end;
$$;

create or replace function public.can_view_achievements(
  viewer_id uuid,
  profile_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when viewer_id is distinct from auth.uid() then false
    else private.can_view_achievements(auth.uid(), profile_user_id)
  end;
$$;

revoke execute on function public.is_friend(uuid, uuid) from public, anon;
revoke execute on function public.is_blocked(uuid, uuid) from public, anon;
grant execute on function public.is_friend(uuid, uuid) to authenticated;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;

revoke execute on function public.can_view_visibility(uuid, uuid, text) from public;
revoke execute on function public.can_view_profile(uuid, uuid) from public;
revoke execute on function public.can_view_online_status(uuid, uuid) from public;
revoke execute on function public.can_view_game_activity(uuid, uuid) from public;
revoke execute on function public.can_view_achievements(uuid, uuid) from public;
grant execute on function public.can_view_visibility(uuid, uuid, text)
  to anon, authenticated;
grant execute on function public.can_view_profile(uuid, uuid)
  to anon, authenticated;
grant execute on function public.can_view_online_status(uuid, uuid)
  to anon, authenticated;
grant execute on function public.can_view_game_activity(uuid, uuid)
  to anon, authenticated;
grant execute on function public.can_view_achievements(uuid, uuid)
  to anon, authenticated;
