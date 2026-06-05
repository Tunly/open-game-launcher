create or replace view public.game_cross_play_slugs
with (security_invoker = true) as
select
  id as game_id,
  slug,
  external_ids
from public.games;

grant select on public.game_cross_play_slugs to authenticated, anon;

create or replace view public.friend_link_merge_groups
with (security_invoker = true) as
select
  merge_group_id,
  owner_id,
  array_agg(distinct platform) as platforms,
  count(*) as member_count
from public.friend_links
where merge_group_id is not null
group by merge_group_id, owner_id;

grant select on public.friend_link_merge_groups to authenticated;
