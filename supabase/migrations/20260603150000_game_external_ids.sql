-- Add external_ids to games for cross-play slug resolution
alter table public.games add column if not exists external_ids jsonb not null default '{}'::jsonb;

comment on column public.games.external_ids is 'Platform-specific external IDs used for smart-join URIs (steam appid, epic app name, gog product id, etc.)';

-- Helper view for quick cross-play slug lookup
create or replace view public.game_cross_play_slugs as
select
  id as game_id,
  slug,
  external_ids
from public.games;

grant select on public.game_cross_play_slugs to authenticated, anon;
