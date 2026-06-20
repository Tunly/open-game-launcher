-- Local development seed data.
-- This file intentionally does not create fake auth.users rows.
-- Create test users through Supabase Auth, then the auth trigger will create
-- profiles, private profile rows, settings, and presence rows automatically.

insert into public.games (
  slug,
  title,
  short_description,
  description,
  developer_name,
  publisher_name,
  cover_url,
  banner_url,
  icon_url,
  release_date,
  status
)
values
  (
    'neon-runners',
    'Neon Runners',
    'A fast arcade racer through procedural night-city tracks.',
    'Compete in high-speed anti-grav races, upgrade your runner, and climb seasonal leaderboards across neon city districts.',
    'Open Forge Studio',
    'Open Game Publishing',
    null,
    null,
    null,
    '2026-03-15',
    'active'
  ),
  (
    'starfall-tactics',
    'Starfall Tactics',
    'Turn-based squad tactics on collapsing orbital colonies.',
    'Build a small crew, recover lost technology, and survive tactical encounters across hostile starfall zones.',
    'Greybox Assembly',
    'Open Game Publishing',
    null,
    null,
    null,
    '2025-11-04',
    'active'
  ),
  (
    'embervale',
    'Embervale',
    'A cooperative action RPG about rebuilding a cursed valley.',
    'Explore dungeons, restore settlements, and unlock class synergies in a shared fantasy world.',
    'Northgate Interactive',
    'Northgate Interactive',
    null,
    null,
    null,
    '2026-08-22',
    'active'
  )
on conflict (slug) do update
set
  title = excluded.title,
  short_description = excluded.short_description,
  description = excluded.description,
  developer_name = excluded.developer_name,
  publisher_name = excluded.publisher_name,
  release_date = excluded.release_date,
  status = excluded.status,
  updated_at = now();

insert into public.achievements (
  game_id,
  key,
  name,
  description,
  rarity,
  points,
  is_hidden,
  is_active
)
select g.id, a.key, a.name, a.description, a.rarity, a.points, a.is_hidden, true
from public.games g
cross join (
  values
    ('first-boost', 'First Boost', 'Finish your first race.', 'common', 10, false),
    ('clean-lap', 'Clean Lap', 'Complete a lap without hitting a wall.', 'uncommon', 20, false),
    ('night-legend', 'Night Legend', 'Win a race on the hardest difficulty.', 'rare', 50, false)
) as a(key, name, description, rarity, points, is_hidden)
where g.slug = 'neon-runners'
on conflict (game_id, key) do update
set
  name = excluded.name,
  description = excluded.description,
  rarity = excluded.rarity,
  points = excluded.points,
  is_hidden = excluded.is_hidden,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.profile_themes (
  key,
  name,
  description,
  background_type,
  background_value,
  accent_color,
  text_color,
  card_style,
  is_premium,
  is_active
)
values
  (
    'foundry_dark',
    'Foundry Print',
    'Heavy ink paper theme with red launcher panels.',
    'solid',
    '#f5eedf',
    '#c20b2f',
    '#171411',
    'solid',
    false,
    true
  ),
  (
    'neon_den',
    'Teal Signal',
    'Arcade profile panel with teal signal accents.',
    'solid',
    '#efe6d4',
    '#087d6d',
    '#171411',
    'solid',
    false,
    true
  ),
  (
    'pixel_garage',
    'Pixel Garage',
    'Blocky retro profile theme for collection-focused players.',
    'solid',
    '#f6edd8',
    '#b7102a',
    '#171411',
    'pixel',
    false,
    true
  )
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  background_type = excluded.background_type,
  background_value = excluded.background_value,
  accent_color = excluded.accent_color,
  text_color = excluded.text_color,
  card_style = excluded.card_style,
  is_premium = excluded.is_premium,
  is_active = excluded.is_active;

insert into public.achievements (
  game_id,
  key,
  name,
  description,
  rarity,
  points,
  is_hidden,
  is_active
)
select g.id, a.key, a.name, a.description, a.rarity, a.points, a.is_hidden, true
from public.games g
cross join (
  values
    ('first-deployment', 'First Deployment', 'Complete your first tactical mission.', 'common', 10, false),
    ('no-one-left-behind', 'No One Left Behind', 'Finish a mission without losing a squad member.', 'rare', 40, false),
    ('black-box', 'Black Box', 'Recover a hidden colony data core.', 'epic', 75, true)
) as a(key, name, description, rarity, points, is_hidden)
where g.slug = 'starfall-tactics'
on conflict (game_id, key) do update
set
  name = excluded.name,
  description = excluded.description,
  rarity = excluded.rarity,
  points = excluded.points,
  is_hidden = excluded.is_hidden,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.achievements (
  game_id,
  key,
  name,
  description,
  rarity,
  points,
  is_hidden,
  is_active
)
select g.id, a.key, a.name, a.description, a.rarity, a.points, a.is_hidden, true
from public.games g
cross join (
  values
    ('first-flame', 'First Flame', 'Light the first valley brazier.', 'common', 10, false),
    ('guild-founder', 'Guild Founder', 'Create or join your first adventuring guild.', 'uncommon', 25, false),
    ('ashes-to-dawn', 'Ashes to Dawn', 'Defeat the final curse event.', 'legendary', 100, false)
) as a(key, name, description, rarity, points, is_hidden)
where g.slug = 'embervale'
on conflict (game_id, key) do update
set
  name = excluded.name,
  description = excluded.description,
  rarity = excluded.rarity,
  points = excluded.points,
  is_hidden = excluded.is_hidden,
  is_active = excluded.is_active,
  updated_at = now();
