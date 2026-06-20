-- Profile system for Open Game Launcher.
-- Auth remains in auth.users. All app-owned profile data lives in public.
-- Client-side writes are only allowed for cosmetic/private/profile-owned data.
-- Entitlements, achievements, badges, XP, and playtime must be written by a
-- trusted backend/service_role API before production.

create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public;

-- ---------------------------------------------------------------------------
-- Tables and additive schema changes
-- ---------------------------------------------------------------------------

create table if not exists public.profile_themes (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  description text,
  background_type text not null default 'solid',
  background_value text,
  accent_color text,
  text_color text,
  card_style text not null default 'solid',
  is_premium boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profile_themes_background_type_check check (background_type in ('solid', 'image', 'animated')),
  constraint profile_themes_card_style_check check (card_style in ('default', 'solid', 'neon', 'pixel', 'minimal'))
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null,
  display_name text,
  avatar_url text,
  banner_url text,
  bio text,
  country_code text,
  language text default 'en',
  timezone text,
  profile_visibility text not null default 'public',
  online_status_visibility text not null default 'public',
  game_activity_visibility text not null default 'friends_only',
  achievement_visibility text not null default 'public',
  library_visibility text not null default 'friends_only',
  wishlist_visibility text not null default 'public',
  comments_visibility text not null default 'friends_only',
  profile_theme_id uuid,
  featured_badge_id uuid,
  featured_game_id uuid,
  featured_achievement_id uuid,
  profile_level integer not null default 1,
  profile_xp integer not null default 0,
  is_banned boolean not null default false,
  is_deleted boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length_check check (char_length(username::text) between 3 and 32),
  constraint profiles_username_format_check check (username::text ~ '^[A-Za-z0-9_.-]+$'),
  constraint profiles_display_name_length_check check (display_name is null or char_length(display_name) <= 64),
  constraint profiles_bio_length_check check (bio is null or char_length(bio) <= 1000),
  constraint profiles_level_check check (profile_level >= 1),
  constraint profiles_xp_check check (profile_xp >= 0),
  constraint profiles_profile_visibility_check check (profile_visibility in ('public', 'friends_only', 'private')),
  constraint profiles_online_status_visibility_check check (online_status_visibility in ('public', 'friends_only', 'private')),
  constraint profiles_game_activity_visibility_check check (game_activity_visibility in ('public', 'friends_only', 'private')),
  constraint profiles_achievement_visibility_check check (achievement_visibility in ('public', 'friends_only', 'private')),
  constraint profiles_library_visibility_check check (library_visibility in ('public', 'friends_only', 'private')),
  constraint profiles_wishlist_visibility_check check (wishlist_visibility in ('public', 'friends_only', 'private')),
  constraint profiles_comments_visibility_check check (comments_visibility in ('public', 'friends_only', 'private'))
);

alter table public.profiles
  add column if not exists library_visibility text not null default 'friends_only',
  add column if not exists wishlist_visibility text not null default 'public',
  add column if not exists comments_visibility text not null default 'friends_only',
  add column if not exists profile_theme_id uuid,
  add column if not exists featured_badge_id uuid,
  add column if not exists featured_game_id uuid,
  add column if not exists featured_achievement_id uuid,
  add column if not exists profile_level integer not null default 1,
  add column if not exists profile_xp integer not null default 0;

create table if not exists public.profile_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  real_name text,
  birthdate date,
  phone text,
  marketing_emails_enabled boolean not null default false,
  security_emails_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profile_cosmetics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cosmetic_type text not null,
  cosmetic_key text not null,
  unlocked_source text not null default 'system',
  unlocked_at timestamptz not null default now(),
  constraint user_profile_cosmetics_unique unique (user_id, cosmetic_type, cosmetic_key),
  constraint user_profile_cosmetics_type_check check (cosmetic_type in ('theme', 'avatar_frame', 'banner', 'background', 'badge', 'profile_effect')),
  constraint user_profile_cosmetics_source_check check (unlocked_source in ('system', 'achievement', 'event', 'purchase', 'admin', 'founder'))
);

create table if not exists public.profile_showcases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text,
  sort_order integer not null default 0,
  visibility text not null default 'public',
  config jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_showcases_type_check check (type in ('about', 'favorite_games', 'rare_achievements', 'latest_achievements', 'completionist', 'screenshots', 'stats', 'collections', 'reviews', 'wishlist', 'activity', 'friends', 'hardware_setup', 'custom_text', 'trophy_case')),
  constraint profile_showcases_title_length_check check (title is null or char_length(title) <= 80),
  constraint profile_showcases_sort_order_check check (sort_order >= 0),
  constraint profile_showcases_visibility_check check (visibility in ('public', 'friends_only', 'private'))
);

create table if not exists public.profile_comments (
  id uuid primary key default gen_random_uuid(),
  profile_user_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  parent_comment_id uuid references public.profile_comments(id) on delete cascade,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_comments_body_length_check check (char_length(btrim(body)) between 1 and 1000)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_not_self_check check (requester_id <> addressee_id),
  constraint friendships_status_check check (status in ('pending', 'accepted', 'declined', 'cancelled', 'blocked'))
);

create unique index if not exists friendships_unique_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  constraint user_blocks_not_self_check check (blocker_id <> blocked_id),
  constraint user_blocks_unique_pair unique (blocker_id, blocked_id)
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  slug citext unique not null,
  title text not null,
  description text,
  short_description text,
  developer_name text,
  publisher_name text,
  cover_url text,
  banner_url text,
  icon_url text,
  release_date date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_status_check check (status in ('draft', 'active', 'delisted', 'archived'))
);

create table if not exists public.user_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  source text not null default 'owned',
  status text not null default 'active',
  added_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_library_user_game_unique unique (user_id, game_id),
  constraint user_library_source_check check (source in ('owned', 'free_claim', 'gift', 'subscription', 'beta_access', 'admin_grant')),
  constraint user_library_status_check check (status in ('active', 'revoked', 'refunded', 'hidden'))
);

create table if not exists public.user_game_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  playtime_minutes integer not null default 0,
  total_sessions integer not null default 0,
  last_played_at timestamptz,
  first_played_at timestamptz,
  last_installed_at timestamptz,
  installed_version text,
  is_favorite boolean not null default false,
  user_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_game_stats_user_game_unique unique (user_id, game_id),
  constraint user_game_stats_playtime_check check (playtime_minutes >= 0),
  constraint user_game_stats_sessions_check check (total_sessions >= 0)
);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  icon_url text,
  rarity text not null default 'common',
  points integer not null default 0,
  is_hidden boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint achievements_game_key_unique unique (game_id, key),
  constraint achievements_points_check check (points >= 0),
  constraint achievements_rarity_check check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary'))
);

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  progress numeric not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_achievements_user_achievement_unique unique (user_id, achievement_id),
  constraint user_achievements_progress_check check (progress >= 0 and progress <= 100)
);

create table if not exists public.user_wishlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  added_at timestamptz not null default now(),
  constraint user_wishlist_user_game_unique unique (user_id, game_id)
);

create table if not exists public.user_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  game_id uuid references public.games(id) on delete set null,
  achievement_id uuid references public.achievements(id) on delete set null,
  visibility text not null default 'friends_only',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_activity_visibility_check check (visibility in ('public', 'friends_only', 'private'))
);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  icon_url text,
  rarity text not null default 'common',
  source text not null default 'system',
  earned_at timestamptz not null default now(),
  constraint user_badges_user_key_unique unique (user_id, key),
  constraint user_badges_rarity_check check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  constraint user_badges_source_check check (source in ('system', 'achievement', 'event', 'founder', 'purchase', 'admin'))
);

create table if not exists public.user_social_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  label text,
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_hardware (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cpu text,
  gpu text,
  ram text,
  monitor text,
  keyboard text,
  mouse text,
  headset text,
  controller text,
  setup_image_url text,
  visibility text not null default 'friends_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_hardware_visibility_check check (visibility in ('public', 'friends_only', 'private'))
);

create table if not exists public.user_game_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  cover_url text,
  visibility text not null default 'public',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_game_collections_user_name_unique unique (user_id, name),
  constraint user_game_collections_visibility_check check (visibility in ('public', 'friends_only', 'private'))
);

alter table public.user_game_collections
  add column if not exists cover_url text,
  add column if not exists visibility text not null default 'public';

create table if not exists public.user_game_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.user_game_collections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  added_at timestamptz not null default now(),
  constraint user_game_collection_items_collection_game_unique unique (collection_id, game_id)
);

-- Add constraints idempotently for installations that already had 0001 tables.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_level_check') then
    alter table public.profiles add constraint profiles_level_check check (profile_level >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_xp_check') then
    alter table public.profiles add constraint profiles_xp_check check (profile_xp >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_library_visibility_check') then
    alter table public.profiles add constraint profiles_library_visibility_check check (library_visibility in ('public', 'friends_only', 'private'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_wishlist_visibility_check') then
    alter table public.profiles add constraint profiles_wishlist_visibility_check check (wishlist_visibility in ('public', 'friends_only', 'private'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_comments_visibility_check') then
    alter table public.profiles add constraint profiles_comments_visibility_check check (comments_visibility in ('public', 'friends_only', 'private'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_game_collections_visibility_check') then
    alter table public.user_game_collections add constraint user_game_collections_visibility_check check (visibility in ('public', 'friends_only', 'private'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS helper functions
-- ---------------------------------------------------------------------------

create or replace function public.is_friend(user_a uuid, user_b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(user_a = user_b, false)
    or exists (
      select 1
      from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = user_a and f.addressee_id = user_b)
          or (f.requester_id = user_b and f.addressee_id = user_a))
    );
$$;

create or replace function public.is_blocked(user_a uuid, user_b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = user_a and b.blocked_id = user_b)
       or (b.blocker_id = user_b and b.blocked_id = user_a)
  );
$$;

create or replace function public.can_view_visibility(viewer_id uuid, owner_id uuid, visibility text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when owner_id is null then false
    when viewer_id = owner_id then true
    when public.is_blocked(viewer_id, owner_id) then false
    when visibility = 'public' then true
    when visibility = 'friends_only' then public.is_friend(viewer_id, owner_id)
    else false
  end;
$$;

create or replace function public.can_view_profile(viewer_id uuid, profile_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = profile_user_id
      and p.is_banned = false
      and p.is_deleted = false
      and public.can_view_visibility(viewer_id, p.id, p.profile_visibility)
  );
$$;

create or replace function public.is_username_available(username_input text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select username_input is not null
    and char_length(username_input) between 3 and 32
    and username_input ~ '^[A-Za-z0-9_.-]+$'
    and not exists (
      select 1
      from public.profiles p
      where p.username = username_input::citext
    );
$$;

revoke execute on function public.is_friend(uuid, uuid) from public;
revoke execute on function public.is_blocked(uuid, uuid) from public;
revoke execute on function public.can_view_visibility(uuid, uuid, text) from public;
revoke execute on function public.can_view_profile(uuid, uuid) from public;
revoke execute on function public.is_username_available(text) from public;
grant execute on function public.is_friend(uuid, uuid) to anon, authenticated;
grant execute on function public.is_blocked(uuid, uuid) to anon, authenticated;
grant execute on function public.can_view_visibility(uuid, uuid, text) to anon, authenticated;
grant execute on function public.can_view_profile(uuid, uuid) to anon, authenticated;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- New-user bootstrap trigger
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  candidate_username text;
  suffix text;
  attempts integer := 0;
begin
  base_username := lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), ''));
  base_username := regexp_replace(base_username, '[^a-z0-9_.-]', '_', 'g');
  base_username := btrim(base_username, '._-');

  if char_length(base_username) < 3 then
    base_username := 'user_' || left(replace(new.id::text, '-', ''), 8);
  end if;

  base_username := left(base_username, 32);
  candidate_username := base_username;

  loop
    begin
      insert into public.profiles (id, username, display_name, avatar_url)
      values (
        new.id,
        candidate_username,
        nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', ''), 64), ''),
        nullif(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'), '')
      )
      on conflict (id) do nothing;
      exit;
    exception when unique_violation then
      attempts := attempts + 1;
      suffix := '_' || left(replace(gen_random_uuid()::text, '-', ''), 6);
      candidate_username := left(base_username, 32 - char_length(suffix)) || suffix;
      if attempts > 20 then
        raise exception 'Could not generate unique username for user %', new.id;
      end if;
    end;
  end loop;

  insert into public.profile_private (user_id) values (new.id)
  on conflict (user_id) do nothing;

  if to_regclass('public.user_settings') is not null then
    execute 'insert into public.user_settings (user_id) values ($1) on conflict (user_id) do nothing' using new.id;
  end if;

  insert into public.user_hardware (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.profile_showcases (user_id, type, title, sort_order, visibility, config)
  values
    (new.id, 'about', 'About', 0, 'public', '{}'::jsonb),
    (new.id, 'favorite_games', 'Favorite Games', 1, 'public', '{}'::jsonb),
    (new.id, 'rare_achievements', 'Rare Achievements', 2, 'public', '{}'::jsonb),
    (new.id, 'stats', 'Stats', 3, 'public', '{}'::jsonb),
    (new.id, 'activity', 'Activity', 4, 'friends_only', '{}'::jsonb),
    (new.id, 'hardware_setup', 'Hardware Rig', 5, 'friends_only', '{}'::jsonb)
  on conflict do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at triggers
do $$
declare
  target_table text;
  trigger_name text;
begin
  foreach target_table in array array[
    'profiles', 'profile_private', 'friendships', 'games', 'user_library',
    'user_game_stats', 'achievements', 'profile_showcases', 'profile_comments',
    'user_social_links', 'user_hardware', 'user_game_collections'
  ]
  loop
    trigger_name := 'set_' || target_table || '_updated_at';
    if to_regclass('public.' || target_table) is not null
      and not exists (
        select 1 from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where t.tgname = trigger_name and n.nspname = 'public' and c.relname = target_table
      )
    then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        trigger_name,
        target_table
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists profiles_username_idx on public.profiles (username);
create index if not exists profile_showcases_user_sort_idx on public.profile_showcases (user_id, sort_order);
create index if not exists profile_comments_profile_created_idx on public.profile_comments (profile_user_id, created_at desc);
create index if not exists user_badges_user_idx on public.user_badges (user_id);
create index if not exists user_activity_user_created_idx on public.user_activity (user_id, created_at desc);
create index if not exists user_social_links_user_sort_idx on public.user_social_links (user_id, sort_order);

-- ---------------------------------------------------------------------------
-- Row Level Security and policies
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.profile_themes enable row level security;
alter table public.user_profile_cosmetics enable row level security;
alter table public.profile_showcases enable row level security;
alter table public.profile_comments enable row level security;
alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;
alter table public.games enable row level security;
alter table public.user_library enable row level security;
alter table public.user_game_stats enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.user_wishlist enable row level security;
alter table public.user_activity enable row level security;
alter table public.user_badges enable row level security;
alter table public.user_social_links enable row level security;
alter table public.user_hardware enable row level security;
alter table public.user_game_collections enable row level security;
alter table public.user_game_collection_items enable row level security;

drop policy if exists profile_system_profiles_select on public.profiles;
create policy profile_system_profiles_select on public.profiles
  for select to anon, authenticated
  using (public.can_view_profile(auth.uid(), id));

drop policy if exists profile_system_profiles_update_own on public.profiles;
create policy profile_system_profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists profile_system_profile_private_own on public.profile_private;
create policy profile_system_profile_private_own on public.profile_private
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists profile_system_themes_select_active on public.profile_themes;
create policy profile_system_themes_select_active on public.profile_themes
  for select to anon, authenticated
  using (is_active = true);

drop policy if exists profile_system_cosmetics_select_own on public.user_profile_cosmetics;
create policy profile_system_cosmetics_select_own on public.user_profile_cosmetics
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists profile_system_showcases_select_visible on public.profile_showcases;
create policy profile_system_showcases_select_visible on public.profile_showcases
  for select to anon, authenticated
  using (is_enabled and public.can_view_visibility(auth.uid(), user_id, visibility));

drop policy if exists profile_system_showcases_crud_own on public.profile_showcases;
create policy profile_system_showcases_crud_own on public.profile_showcases
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists profile_system_comments_select_visible on public.profile_comments;
create policy profile_system_comments_select_visible on public.profile_comments
  for select to anon, authenticated
  using (
    auth.uid() = profile_user_id
    or auth.uid() = author_id
    or (
      is_deleted = false
      and exists (
        select 1 from public.profiles p
        where p.id = profile_comments.profile_user_id
          and public.can_view_visibility(auth.uid(), p.id, p.comments_visibility)
      )
    )
  );

drop policy if exists profile_system_comments_insert_allowed on public.profile_comments;
create policy profile_system_comments_insert_allowed on public.profile_comments
  for insert to authenticated
  with check (
    auth.uid() = author_id
    and not public.is_blocked(author_id, profile_user_id)
    and exists (
      select 1 from public.profiles p
      where p.id = profile_user_id
        and public.can_view_visibility(auth.uid(), p.id, p.comments_visibility)
    )
  );

drop policy if exists profile_system_comments_update_author on public.profile_comments;
create policy profile_system_comments_update_author on public.profile_comments
  for update to authenticated
  using (auth.uid() = author_id or auth.uid() = profile_user_id)
  with check (auth.uid() = author_id or auth.uid() = profile_user_id);

drop policy if exists profile_system_comments_delete_author_or_owner on public.profile_comments;
create policy profile_system_comments_delete_author_or_owner on public.profile_comments
  for delete to authenticated
  using (auth.uid() = author_id or auth.uid() = profile_user_id);

drop policy if exists profile_system_friendships_select_involved on public.friendships;
create policy profile_system_friendships_select_involved on public.friendships
  for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists profile_system_friendships_insert_request on public.friendships;
create policy profile_system_friendships_insert_request on public.friendships
  for insert to authenticated
  with check (
    auth.uid() = requester_id
    and requester_id <> addressee_id
    and status = 'pending'
    and not public.is_blocked(requester_id, addressee_id)
  );

drop policy if exists profile_system_friendships_update_involved on public.friendships;
create policy profile_system_friendships_update_involved on public.friendships
  for update to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists profile_system_blocks_own on public.user_blocks;
create policy profile_system_blocks_own on public.user_blocks
  for all to authenticated
  using (auth.uid() = blocker_id)
  with check (auth.uid() = blocker_id and blocker_id <> blocked_id);

drop policy if exists profile_system_games_select_active on public.games;
create policy profile_system_games_select_active on public.games
  for select to anon, authenticated
  using (status = 'active');

drop policy if exists user_game_stats_update_own on public.user_game_stats;
drop policy if exists profile_system_library_select_visible on public.user_library;
create policy profile_system_library_select_visible on public.user_library
  for select to anon, authenticated
  using (
    status in ('active', 'hidden')
    and exists (
      select 1 from public.profiles p
      where p.id = user_library.user_id
        and public.can_view_visibility(auth.uid(), p.id, p.library_visibility)
    )
  );

drop policy if exists profile_system_game_stats_select_visible on public.user_game_stats;
create policy profile_system_game_stats_select_visible on public.user_game_stats
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = user_game_stats.user_id
        and public.can_view_visibility(auth.uid(), p.id, p.game_activity_visibility)
    )
  );

drop policy if exists profile_system_achievements_select_visible on public.achievements;
create policy profile_system_achievements_select_visible on public.achievements
  for select to anon, authenticated
  using (is_active = true);

drop policy if exists profile_system_user_achievements_select_visible on public.user_achievements;
create policy profile_system_user_achievements_select_visible on public.user_achievements
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = user_achievements.user_id
        and public.can_view_visibility(auth.uid(), p.id, p.achievement_visibility)
    )
  );

drop policy if exists profile_system_wishlist_select_visible on public.user_wishlist;
create policy profile_system_wishlist_select_visible on public.user_wishlist
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = user_wishlist.user_id
        and public.can_view_visibility(auth.uid(), p.id, p.wishlist_visibility)
    )
  );

drop policy if exists profile_system_wishlist_crud_own on public.user_wishlist;
create policy profile_system_wishlist_crud_own on public.user_wishlist
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists profile_system_activity_select_visible on public.user_activity;
create policy profile_system_activity_select_visible on public.user_activity
  for select to anon, authenticated
  using (public.can_view_visibility(auth.uid(), user_id, visibility));

drop policy if exists profile_system_badges_select_visible on public.user_badges;
create policy profile_system_badges_select_visible on public.user_badges
  for select to anon, authenticated
  using (public.can_view_profile(auth.uid(), user_id));

drop policy if exists profile_system_social_links_select_visible on public.user_social_links;
create policy profile_system_social_links_select_visible on public.user_social_links
  for select to anon, authenticated
  using (public.can_view_profile(auth.uid(), user_id));

drop policy if exists profile_system_social_links_crud_own on public.user_social_links;
create policy profile_system_social_links_crud_own on public.user_social_links
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists profile_system_hardware_select_visible on public.user_hardware;
create policy profile_system_hardware_select_visible on public.user_hardware
  for select to anon, authenticated
  using (public.can_view_visibility(auth.uid(), user_id, visibility));

drop policy if exists profile_system_hardware_crud_own on public.user_hardware;
create policy profile_system_hardware_crud_own on public.user_hardware
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists profile_system_collections_select_visible on public.user_game_collections;
create policy profile_system_collections_select_visible on public.user_game_collections
  for select to anon, authenticated
  using (public.can_view_visibility(auth.uid(), user_id, visibility));

drop policy if exists profile_system_collections_crud_own on public.user_game_collections;
create policy profile_system_collections_crud_own on public.user_game_collections
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists profile_system_collection_items_select_visible on public.user_game_collection_items;
create policy profile_system_collection_items_select_visible on public.user_game_collection_items
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.user_game_collections c
      where c.id = user_game_collection_items.collection_id
        and public.can_view_visibility(auth.uid(), c.user_id, c.visibility)
    )
  );

drop policy if exists profile_system_collection_items_crud_own on public.user_game_collection_items;
create policy profile_system_collection_items_crud_own on public.user_game_collection_items
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage buckets and object policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('profile-banners', 'profile-banners', true),
  ('profile-showcases', 'profile-showcases', true),
  ('screenshots', 'screenshots', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists profile_system_storage_public_read on storage.objects;
create policy profile_system_storage_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('avatars', 'profile-banners', 'profile-showcases', 'screenshots'));

drop policy if exists profile_system_storage_insert_own_folder on storage.objects;
create policy profile_system_storage_insert_own_folder on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'profile-banners', 'profile-showcases', 'screenshots')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists profile_system_storage_update_own_folder on storage.objects;
create policy profile_system_storage_update_own_folder on storage.objects
  for update to authenticated
  using (
    bucket_id in ('avatars', 'profile-banners', 'profile-showcases', 'screenshots')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('avatars', 'profile-banners', 'profile-showcases', 'screenshots')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists profile_system_storage_delete_own_folder on storage.objects;
create policy profile_system_storage_delete_own_folder on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('avatars', 'profile-banners', 'profile-showcases', 'screenshots')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
