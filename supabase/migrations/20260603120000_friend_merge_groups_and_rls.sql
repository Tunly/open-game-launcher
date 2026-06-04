-- Friend merge groups + RLS tightening for platform_accounts
-- Fixes: acceptMergeSuggestion did not actually link the two friend_links.
--         platform_accounts RLS was `or true` (publicly readable).

-- ---------------------------------------------------------------------------
-- 1) friend_links: add merge_group_id so two imported platform friends can
--    be flagged as the same imported person. When one of them is later
--    auto-matched to an OG user (via platform_accounts), the merge group
--    members should also be matched.
-- ---------------------------------------------------------------------------

alter table public.friend_links
  add column if not exists merge_group_id uuid;

create index if not exists friend_links_merge_group_idx
  on public.friend_links (merge_group_id) where merge_group_id is not null;

comment on column public.friend_links.merge_group_id is
  'Groups friend_links that are heuristic/manual merges of the same imported person. When one member is auto-matched to an OG user, all group members are matched too.';

-- ---------------------------------------------------------------------------
-- 2) Extend the auto_match trigger: when a platform_account is linked,
--    also match every friend_link in the same merge_group.
-- ---------------------------------------------------------------------------

create or replace function public.auto_match_friend_links()
returns trigger
language plpgsql
security definer
as $$
declare
  matched_user uuid := new.user_id;
begin
  -- Direct match: any friend_link with the same platform+platform_user_id
  update public.friend_links
  set matched_user_id = matched_user,
      match_method = 'linked_account',
      updated_at = now()
  where platform = new.platform
    and platform_friend_id = new.platform_user_id
    and matched_user_id is null;

  -- Merge-group propagation: also match friend_links that share a
  -- merge_group_id with the friend_link we just matched above.
  update public.friend_links fl
  set matched_user_id = matched_user,
      match_method = 'linked_account',
      updated_at = now()
  where fl.matched_user_id is null
    and fl.merge_group_id is not null
    and fl.merge_group_id in (
      select merge_group_id
      from public.friend_links
      where platform = new.platform
        and platform_friend_id = new.platform_user_id
        and merge_group_id is not null
    );

  return new;
end;
$$;

drop trigger if exists auto_match_on_platform_link on public.platform_accounts;
create trigger auto_match_on_platform_link
  after insert or update on public.platform_accounts
  for each row execute function public.auto_match_friend_links();

-- ---------------------------------------------------------------------------
-- 3) Tighten platform_accounts RLS.
--    Old policy had `or true` which made the table publicly readable.
--    New policy: owner OR friends (per is_friend helper) can read.
-- ---------------------------------------------------------------------------

drop policy if exists platform_accounts_select_own on public.platform_accounts;
create policy platform_accounts_select_own on public.platform_accounts
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_friend(auth.uid(), user_id)
  );

-- ---------------------------------------------------------------------------
-- 4) Helper view: friend_links grouped by merge_group_id (read-only).
--    Useful for the dedup UI to show which platform identities are
--    conceptually the same imported person.
-- ---------------------------------------------------------------------------

create or replace view public.friend_link_merge_groups as
select
  merge_group_id,
  owner_id,
  array_agg(distinct platform) as platforms,
  count(*) as member_count
from public.friend_links
where merge_group_id is not null
group by merge_group_id, owner_id;

grant select on public.friend_link_merge_groups to authenticated;
