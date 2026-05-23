-- User, social, and game schema for Open Game Launcher.
-- Supabase Auth remains the source of truth for authentication in auth.users.
-- Application tables link to auth.users through uuid foreign keys.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Shared trigger helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public;

-- ---------------------------------------------------------------------------
-- Core profile/account tables
-- ---------------------------------------------------------------------------

create table public.profiles (
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
  is_banned boolean not null default false,
  is_deleted boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length_check check (char_length(username::text) between 3 and 32),
  constraint profiles_username_format_check check (username::text ~ '^[A-Za-z0-9_.-]+$'),
  constraint profiles_display_name_length_check check (display_name is null or char_length(display_name) <= 64),
  constraint profiles_bio_length_check check (bio is null or char_length(bio) <= 1000),
  constraint profiles_profile_visibility_check check (profile_visibility in ('public', 'friends_only', 'private')),
  constraint profiles_online_status_visibility_check check (online_status_visibility in ('public', 'friends_only', 'private')),
  constraint profiles_game_activity_visibility_check check (game_activity_visibility in ('public', 'friends_only', 'private')),
  constraint profiles_achievement_visibility_check check (achievement_visibility in ('public', 'friends_only', 'private'))
);

comment on table public.profiles is 'Public-facing user profile linked one-to-one to auth.users.';
comment on column public.profiles.id is 'Same UUID as auth.users.id; no separate auth table is used.';

create table public.profile_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  real_name text,
  birthdate date,
  phone text,
  marketing_emails_enabled boolean not null default false,
  security_emails_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profile_private is 'Private profile data. Never expose to other users.';

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark',
  launcher_language text not null default 'en',
  start_with_system boolean not null default false,
  minimize_to_tray boolean not null default true,
  auto_update_launcher boolean not null default true,
  auto_update_games boolean not null default true,
  download_bandwidth_limit_kbps integer,
  install_directory text,
  notifications_enabled boolean not null default true,
  friend_request_notifications boolean not null default true,
  achievement_notifications boolean not null default true,
  game_update_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_theme_check check (theme in ('dark', 'light', 'system')),
  constraint user_settings_download_bandwidth_check check (
    download_bandwidth_limit_kbps is null or download_bandwidth_limit_kbps >= 0
  )
);

comment on table public.user_settings is 'Per-user account and launcher preferences.';

-- ---------------------------------------------------------------------------
-- Game catalog tables
-- ---------------------------------------------------------------------------

create table public.games (
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
  constraint games_title_not_empty_check check (char_length(btrim(title)) > 0),
  constraint games_status_check check (status in ('draft', 'active', 'delisted', 'archived'))
);

comment on table public.games is 'Base game catalog. Normal clients can read active games only.';

create table public.achievements (
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
  constraint achievements_id_game_id_unique unique (id, game_id),
  constraint achievements_key_not_empty_check check (char_length(btrim(key)) > 0),
  constraint achievements_name_not_empty_check check (char_length(btrim(name)) > 0),
  constraint achievements_rarity_check check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  constraint achievements_points_check check (points >= 0)
);

comment on table public.achievements is 'Achievement definitions for games. Writes should go through trusted backend/admin tooling.';

-- ---------------------------------------------------------------------------
-- Presence, social, and block tables
-- ---------------------------------------------------------------------------

create table public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'offline',
  custom_status text,
  current_game_id uuid references public.games(id) on delete set null,
  current_game_title text,
  last_heartbeat_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint user_presence_status_check check (status in ('offline', 'online', 'away', 'busy', 'invisible'))
);

comment on table public.user_presence is 'Current launcher/online presence. Invisible users are hidden from other users by RLS.';

create table public.friendships (
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

comment on table public.friendships is 'One row per user pair, independent of requester/addressee ordering.';

create unique index friendships_unique_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  constraint user_blocks_not_self_check check (blocker_id <> blocked_id),
  constraint user_blocks_unique_pair unique (blocker_id, blocked_id)
);

comment on table public.user_blocks is 'Private block list. Only the blocker can see and manage rows.';

-- ---------------------------------------------------------------------------
-- Library, stats, sessions, achievements, wishlist, and reviews
-- ---------------------------------------------------------------------------

create table public.user_library (
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

comment on table public.user_library is 'User game entitlements/library. Client writes are intentionally not allowed by RLS.';

create table public.user_game_stats (
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

comment on table public.user_game_stats is 'Per-user playtime and launcher state for games.';

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  launcher_device_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_minutes integer,
  platform text,
  created_at timestamptz not null default now(),
  constraint game_sessions_ended_after_started_check check (ended_at is null or ended_at >= started_at),
  constraint game_sessions_duration_check check (duration_minutes is null or duration_minutes >= 0),
  constraint game_sessions_platform_check check (platform is null or platform in ('windows', 'linux', 'macos', 'web', 'unknown'))
);

comment on table public.game_sessions is 'Individual play sessions. Normal clients may insert and close their own open sessions.';

create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  progress numeric not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_achievements_user_achievement_unique unique (user_id, achievement_id),
  constraint user_achievements_progress_check check (progress >= 0 and progress <= 100),
  constraint user_achievements_achievement_game_fk foreign key (achievement_id, game_id)
    references public.achievements(id, game_id) on delete cascade
);

comment on table public.user_achievements is 'Unlocked user achievements. Writes should be performed by a trusted backend/API.';

create table public.achievement_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  progress numeric not null default 0,
  current_value integer not null default 0,
  target_value integer,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint achievement_progress_user_achievement_unique unique (user_id, achievement_id),
  constraint achievement_progress_progress_check check (progress >= 0 and progress <= 100),
  constraint achievement_progress_current_value_check check (current_value >= 0),
  constraint achievement_progress_target_value_check check (target_value is null or target_value > 0),
  constraint achievement_progress_achievement_game_fk foreign key (achievement_id, game_id)
    references public.achievements(id, game_id) on delete cascade
);

comment on table public.achievement_progress is 'Partial progress for achievements not yet unlocked. Writes should be trusted backend/API only.';

create table public.user_wishlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  added_at timestamptz not null default now(),
  constraint user_wishlist_user_game_unique unique (user_id, game_id)
);

comment on table public.user_wishlist is 'Private user wishlist for now.';

create table public.user_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  rating integer not null,
  recommended boolean,
  title text,
  body text,
  playtime_minutes_at_review integer not null default 0,
  visibility text not null default 'public',
  is_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_reviews_user_game_unique unique (user_id, game_id),
  constraint user_reviews_rating_check check (rating between 1 and 5),
  constraint user_reviews_body_length_check check (body is null or char_length(body) <= 5000),
  constraint user_reviews_title_length_check check (title is null or char_length(title) <= 120),
  constraint user_reviews_playtime_check check (playtime_minutes_at_review >= 0),
  constraint user_reviews_visibility_check check (visibility in ('public', 'friends_only', 'private'))
);

comment on table public.user_reviews is 'User reviews. A trigger requires an active/hidden library entry before review creation.';

-- ---------------------------------------------------------------------------
-- Devices, notifications, activity, and collections
-- ---------------------------------------------------------------------------

create table public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text,
  platform text not null,
  os_version text,
  launcher_version text,
  machine_fingerprint_hash text,
  last_ip inet,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_devices_platform_check check (platform in ('windows', 'linux', 'macos', 'unknown'))
);

comment on table public.user_devices is 'Registered launcher installations/devices for a user.';

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_notifications_type_not_empty_check check (char_length(btrim(type)) > 0),
  constraint user_notifications_title_not_empty_check check (char_length(btrim(title)) > 0)
);

comment on table public.user_notifications is 'Per-user notifications. Normal clients can read and mark their own rows as read.';

create table public.user_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  game_id uuid references public.games(id) on delete set null,
  achievement_id uuid references public.achievements(id) on delete set null,
  visibility text not null default 'friends_only',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_activity_type_not_empty_check check (char_length(btrim(type)) > 0),
  constraint user_activity_visibility_check check (visibility in ('public', 'friends_only', 'private'))
);

comment on table public.user_activity is 'Profile/friend activity feed. Writes should usually be backend/API generated.';

create table public.user_game_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_game_collections_user_name_unique unique (user_id, name),
  constraint user_game_collections_id_user_unique unique (id, user_id),
  constraint user_game_collections_name_length_check check (char_length(name) between 1 and 64)
);

comment on table public.user_game_collections is 'User-defined library collections/categories.';

create table public.user_game_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.user_game_collections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  added_at timestamptz not null default now(),
  constraint user_game_collection_items_collection_game_unique unique (collection_id, game_id),
  constraint user_game_collection_items_owner_fk foreign key (collection_id, user_id)
    references public.user_game_collections(id, user_id) on delete cascade
);

comment on table public.user_game_collection_items is 'Games assigned to user-owned collections. Composite FK enforces collection ownership.';

-- ---------------------------------------------------------------------------
-- Helper functions used by RLS policies
-- ---------------------------------------------------------------------------

create or replace function public.is_friend(user_a uuid, user_b uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if user_a is null or user_b is null or user_a = user_b then
    return false;
  end if;

  -- Prevent authenticated clients from probing friendships between unrelated users.
  if auth.uid() is null or (auth.uid() <> user_a and auth.uid() <> user_b) then
    return false;
  end if;

  return exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = user_a and f.addressee_id = user_b)
        or (f.requester_id = user_b and f.addressee_id = user_a)
      )
  );
end;
$$;

create or replace function public.is_blocked(user_a uuid, user_b uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if user_a is null or user_b is null or user_a = user_b then
    return false;
  end if;

  -- Prevent authenticated clients from probing blocks between unrelated users.
  if auth.uid() is null or (auth.uid() <> user_a and auth.uid() <> user_b) then
    return false;
  end if;

  return exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = user_a and b.blocked_id = user_b)
       or (b.blocker_id = user_b and b.blocked_id = user_a)
  );
end;
$$;

create or replace function public.can_view_profile(viewer_id uuid, profile_user_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  target_profile public.profiles%rowtype;
begin
  -- The viewer_id argument must be the caller's Supabase Auth user.
  if viewer_id is distinct from auth.uid() then
    return false;
  end if;

  if profile_user_id is null then
    return false;
  end if;

  if viewer_id = profile_user_id then
    return true;
  end if;

  select *
  into target_profile
  from public.profiles
  where id = profile_user_id;

  if not found or target_profile.is_deleted or target_profile.is_banned then
    return false;
  end if;

  if public.is_blocked(viewer_id, profile_user_id) then
    return false;
  end if;

  if target_profile.profile_visibility = 'public' then
    return true;
  end if;

  if target_profile.profile_visibility = 'friends_only' then
    return public.is_friend(viewer_id, profile_user_id);
  end if;

  return false;
end;
$$;

create or replace function public.can_view_online_status(viewer_id uuid, profile_user_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  visibility text;
  deleted boolean;
  banned boolean;
begin
  if viewer_id is distinct from auth.uid() then
    return false;
  end if;

  if profile_user_id is null then
    return false;
  end if;

  if viewer_id = profile_user_id then
    return true;
  end if;

  select p.online_status_visibility, p.is_deleted, p.is_banned
  into visibility, deleted, banned
  from public.profiles p
  where p.id = profile_user_id;

  if not found or deleted or banned or public.is_blocked(viewer_id, profile_user_id) then
    return false;
  end if;

  return visibility = 'public'
    or (visibility = 'friends_only' and public.is_friend(viewer_id, profile_user_id));
end;
$$;

create or replace function public.can_view_game_activity(viewer_id uuid, profile_user_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  visibility text;
  deleted boolean;
  banned boolean;
begin
  if viewer_id is distinct from auth.uid() then
    return false;
  end if;

  if profile_user_id is null then
    return false;
  end if;

  if viewer_id = profile_user_id then
    return true;
  end if;

  select p.game_activity_visibility, p.is_deleted, p.is_banned
  into visibility, deleted, banned
  from public.profiles p
  where p.id = profile_user_id;

  if not found or deleted or banned or public.is_blocked(viewer_id, profile_user_id) then
    return false;
  end if;

  return visibility = 'public'
    or (visibility = 'friends_only' and public.is_friend(viewer_id, profile_user_id));
end;
$$;

create or replace function public.can_view_achievements(viewer_id uuid, profile_user_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  visibility text;
  deleted boolean;
  banned boolean;
begin
  if viewer_id is distinct from auth.uid() then
    return false;
  end if;

  if profile_user_id is null then
    return false;
  end if;

  if viewer_id = profile_user_id then
    return true;
  end if;

  select p.achievement_visibility, p.is_deleted, p.is_banned
  into visibility, deleted, banned
  from public.profiles p
  where p.id = profile_user_id;

  if not found or deleted or banned or public.is_blocked(viewer_id, profile_user_id) then
    return false;
  end if;

  return visibility = 'public'
    or (visibility = 'friends_only' and public.is_friend(viewer_id, profile_user_id));
end;
$$;

revoke execute on function public.is_friend(uuid, uuid) from public;
revoke execute on function public.is_blocked(uuid, uuid) from public;
revoke execute on function public.can_view_profile(uuid, uuid) from public;
revoke execute on function public.can_view_online_status(uuid, uuid) from public;
revoke execute on function public.can_view_game_activity(uuid, uuid) from public;
revoke execute on function public.can_view_achievements(uuid, uuid) from public;

grant execute on function public.is_friend(uuid, uuid) to authenticated;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;
grant execute on function public.can_view_profile(uuid, uuid) to anon, authenticated;
grant execute on function public.can_view_online_status(uuid, uuid) to anon, authenticated;
grant execute on function public.can_view_game_activity(uuid, uuid) to anon, authenticated;
grant execute on function public.can_view_achievements(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Data integrity triggers
-- ---------------------------------------------------------------------------

create or replace function public.validate_friendship()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.requester_id <> old.requester_id or new.addressee_id <> old.addressee_id then
      raise exception 'Friendship participants cannot be changed after creation';
    end if;

    if new.status <> old.status
       and new.status in ('accepted', 'declined', 'cancelled', 'blocked')
       and new.responded_at is null then
      new.responded_at := now();
    end if;
  end if;

  if new.status in ('pending', 'accepted') and exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = new.requester_id and b.blocked_id = new.addressee_id)
       or (b.blocker_id = new.addressee_id and b.blocked_id = new.requester_id)
  ) then
    raise exception 'Cannot create or accept a friendship while either user blocks the other';
  end if;

  return new;
end;
$$;

revoke execute on function public.validate_friendship() from public;

create or replace function public.ensure_review_library_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.user_library ul
    where ul.user_id = new.user_id
      and ul.game_id = new.game_id
      and ul.status in ('active', 'hidden')
  ) then
    raise exception 'Cannot review a game that is not active in the user library';
  end if;

  return new;
end;
$$;

revoke execute on function public.ensure_review_library_entry() from public;

create or replace function public.prevent_profile_flag_self_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() = old.id and (
    new.is_banned is distinct from old.is_banned
    or new.is_deleted is distinct from old.is_deleted
  ) then
    raise exception 'Profile moderation flags can only be changed by a trusted backend role';
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_profile_flag_self_update() from public;

create or replace function public.restrict_notification_self_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() = old.user_id and (
    new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.type is distinct from old.type
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.data is distinct from old.data
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Users can only update read_at on their own notifications';
  end if;

  return new;
end;
$$;

revoke execute on function public.restrict_notification_self_update() from public;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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
        nullif(new.raw_user_meta_data ->> 'avatar_url', '')
      )
      on conflict (id) do nothing;

      exit;
    exception when unique_violation then
      attempts := attempts + 1;
      suffix := '_' || left(replace(gen_random_uuid()::text, '-', ''), 6);
      candidate_username := left(base_username, 32 - char_length(suffix)) || suffix;

      if attempts > 20 then
        raise exception 'Could not generate a unique username for user %', new.id;
      end if;
    end;
  end loop;

  insert into public.profile_private (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_presence (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;

-- updated_at triggers
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_profile_private_updated_at
  before update on public.profile_private
  for each row execute function public.set_updated_at();

create trigger set_user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

create trigger set_games_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

create trigger set_achievements_updated_at
  before update on public.achievements
  for each row execute function public.set_updated_at();

create trigger set_user_presence_updated_at
  before update on public.user_presence
  for each row execute function public.set_updated_at();

create trigger set_friendships_updated_at
  before update on public.friendships
  for each row execute function public.set_updated_at();

create trigger set_user_library_updated_at
  before update on public.user_library
  for each row execute function public.set_updated_at();

create trigger set_user_game_stats_updated_at
  before update on public.user_game_stats
  for each row execute function public.set_updated_at();

create trigger set_achievement_progress_updated_at
  before update on public.achievement_progress
  for each row execute function public.set_updated_at();

create trigger set_user_reviews_updated_at
  before update on public.user_reviews
  for each row execute function public.set_updated_at();

create trigger set_user_devices_updated_at
  before update on public.user_devices
  for each row execute function public.set_updated_at();

create trigger set_user_game_collections_updated_at
  before update on public.user_game_collections
  for each row execute function public.set_updated_at();

-- Integrity triggers
create trigger prevent_profile_flag_self_update_before_write
  before update on public.profiles
  for each row execute function public.prevent_profile_flag_self_update();

create trigger validate_friendship_before_write
  before insert or update on public.friendships
  for each row execute function public.validate_friendship();

create trigger ensure_review_library_entry_before_write
  before insert or update of user_id, game_id on public.user_reviews
  for each row execute function public.ensure_review_library_entry();

create trigger restrict_notification_self_update_before_write
  before update on public.user_notifications
  for each row execute function public.restrict_notification_self_update();

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index profiles_display_name_idx on public.profiles (display_name) where display_name is not null;
create index profiles_visibility_idx on public.profiles (profile_visibility) where is_deleted = false and is_banned = false;

create index friendships_requester_id_idx on public.friendships (requester_id);
create index friendships_addressee_id_idx on public.friendships (addressee_id);
create index friendships_status_idx on public.friendships (status);

create index user_blocks_blocker_id_idx on public.user_blocks (blocker_id);
create index user_blocks_blocked_id_idx on public.user_blocks (blocked_id);

create index games_status_idx on public.games (status);
create index achievements_game_id_idx on public.achievements (game_id);

create index user_library_user_id_idx on public.user_library (user_id);
create index user_library_game_id_idx on public.user_library (game_id);

create index user_game_stats_game_id_idx on public.user_game_stats (game_id);

create index game_sessions_user_game_idx on public.game_sessions (user_id, game_id);
create index game_sessions_open_idx on public.game_sessions (user_id, started_at) where ended_at is null;

create index user_achievements_user_id_idx on public.user_achievements (user_id);
create index user_achievements_game_id_idx on public.user_achievements (game_id);

create index achievement_progress_user_id_idx on public.achievement_progress (user_id);
create index achievement_progress_game_id_idx on public.achievement_progress (game_id);

create index user_wishlist_user_id_idx on public.user_wishlist (user_id);
create index user_wishlist_game_id_idx on public.user_wishlist (game_id);

create index user_reviews_game_id_idx on public.user_reviews (game_id);
create index user_reviews_user_id_idx on public.user_reviews (user_id);

create unique index user_devices_user_fingerprint_unique_idx
  on public.user_devices (user_id, machine_fingerprint_hash)
  where machine_fingerprint_hash is not null;
create index user_devices_user_id_idx on public.user_devices (user_id);

create index user_notifications_user_read_idx on public.user_notifications (user_id, read_at);

create index user_activity_user_created_idx on public.user_activity (user_id, created_at desc);
create index user_activity_game_id_idx on public.user_activity (game_id);

create index user_game_collections_user_id_idx on public.user_game_collections (user_id);
create index user_game_collection_items_user_id_idx on public.user_game_collection_items (user_id);
create index user_game_collection_items_game_id_idx on public.user_game_collection_items (game_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.user_settings enable row level security;
alter table public.games enable row level security;
alter table public.achievements enable row level security;
alter table public.user_presence enable row level security;
alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;
alter table public.user_library enable row level security;
alter table public.user_game_stats enable row level security;
alter table public.game_sessions enable row level security;
alter table public.user_achievements enable row level security;
alter table public.achievement_progress enable row level security;
alter table public.user_wishlist enable row level security;
alter table public.user_reviews enable row level security;
alter table public.user_devices enable row level security;
alter table public.user_notifications enable row level security;
alter table public.user_activity enable row level security;
alter table public.user_game_collections enable row level security;
alter table public.user_game_collection_items enable row level security;

-- profiles
create policy profiles_select_visible
  on public.profiles
  for select
  to anon, authenticated
  using (public.can_view_profile(auth.uid(), id));

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- profile_private
create policy profile_private_select_own
  on public.profile_private
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy profile_private_insert_own
  on public.profile_private
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy profile_private_update_own
  on public.profile_private
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- user_settings
create policy user_settings_select_own
  on public.user_settings
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy user_settings_insert_own
  on public.user_settings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy user_settings_update_own
  on public.user_settings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- games and achievements: public read, trusted writes only.
create policy games_select_active
  on public.games
  for select
  to anon, authenticated
  using (status = 'active');

create policy achievements_select_active
  on public.achievements
  for select
  to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1
      from public.games g
      where g.id = achievements.game_id
        and g.status = 'active'
    )
  );

-- user_presence
create policy user_presence_select_visible
  on public.user_presence
  for select
  to anon, authenticated
  using (
    auth.uid() = user_id
    or (
      status <> 'invisible'
      and public.can_view_online_status(auth.uid(), user_id)
    )
  );

create policy user_presence_insert_own
  on public.user_presence
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy user_presence_update_own
  on public.user_presence
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- friendships
create policy friendships_select_involved
  on public.friendships
  for select
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy friendships_insert_as_requester
  on public.friendships
  for insert
  to authenticated
  with check (
    auth.uid() = requester_id
    and requester_id <> addressee_id
    and status = 'pending'
    and not public.is_blocked(requester_id, addressee_id)
  );

create policy friendships_update_received_pending
  on public.friendships
  for update
  to authenticated
  using (auth.uid() = addressee_id and status = 'pending')
  with check (auth.uid() = addressee_id and status in ('accepted', 'declined'));

create policy friendships_update_sent_pending
  on public.friendships
  for update
  to authenticated
  using (auth.uid() = requester_id and status = 'pending')
  with check (auth.uid() = requester_id and status = 'cancelled');

create policy friendships_update_accepted_involved
  on public.friendships
  for update
  to authenticated
  using ((auth.uid() = requester_id or auth.uid() = addressee_id) and status = 'accepted')
  with check ((auth.uid() = requester_id or auth.uid() = addressee_id) and status in ('cancelled', 'blocked'));

create policy friendships_delete_involved
  on public.friendships
  for delete
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- user_blocks
create policy user_blocks_select_own
  on public.user_blocks
  for select
  to authenticated
  using (auth.uid() = blocker_id);

create policy user_blocks_insert_own
  on public.user_blocks
  for insert
  to authenticated
  with check (auth.uid() = blocker_id and blocker_id <> blocked_id);

create policy user_blocks_update_own
  on public.user_blocks
  for update
  to authenticated
  using (auth.uid() = blocker_id)
  with check (auth.uid() = blocker_id and blocker_id <> blocked_id);

create policy user_blocks_delete_own
  on public.user_blocks
  for delete
  to authenticated
  using (auth.uid() = blocker_id);

-- user_library: private read; writes are service_role/backend only.
create policy user_library_select_own
  on public.user_library
  for select
  to authenticated
  using (auth.uid() = user_id);

-- user_game_stats
create policy user_game_stats_select_visible
  on public.user_game_stats
  for select
  to anon, authenticated
  using (public.can_view_game_activity(auth.uid(), user_id));

create policy user_game_stats_update_own
  on public.user_game_stats
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- game_sessions
create policy game_sessions_select_own
  on public.game_sessions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy game_sessions_insert_own
  on public.game_sessions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy game_sessions_update_own_open
  on public.game_sessions
  for update
  to authenticated
  using (auth.uid() = user_id and ended_at is null)
  with check (auth.uid() = user_id);

-- user_achievements and achievement_progress
create policy user_achievements_select_visible
  on public.user_achievements
  for select
  to anon, authenticated
  using (public.can_view_achievements(auth.uid(), user_id));

create policy achievement_progress_select_own
  on public.achievement_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

-- user_wishlist
create policy user_wishlist_select_own
  on public.user_wishlist
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy user_wishlist_insert_own
  on public.user_wishlist
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy user_wishlist_delete_own
  on public.user_wishlist
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- user_reviews
create policy user_reviews_select_public
  on public.user_reviews
  for select
  to anon, authenticated
  using (visibility = 'public');

create policy user_reviews_select_own
  on public.user_reviews
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy user_reviews_select_friends
  on public.user_reviews
  for select
  to authenticated
  using (
    visibility = 'friends_only'
    and public.is_friend(auth.uid(), user_id)
    and not public.is_blocked(auth.uid(), user_id)
  );

create policy user_reviews_insert_own
  on public.user_reviews
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy user_reviews_update_own
  on public.user_reviews
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy user_reviews_delete_own
  on public.user_reviews
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- user_devices
create policy user_devices_select_own
  on public.user_devices
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy user_devices_insert_own
  on public.user_devices
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy user_devices_update_own
  on public.user_devices
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy user_devices_delete_own
  on public.user_devices
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- user_notifications: backend creates rows, users read/update their own read state.
create policy user_notifications_select_own
  on public.user_notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy user_notifications_update_own
  on public.user_notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- user_activity
create policy user_activity_select_own
  on public.user_activity
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy user_activity_select_public
  on public.user_activity
  for select
  to anon, authenticated
  using (visibility = 'public');

create policy user_activity_select_friends
  on public.user_activity
  for select
  to authenticated
  using (
    visibility = 'friends_only'
    and public.is_friend(auth.uid(), user_id)
    and not public.is_blocked(auth.uid(), user_id)
  );

-- user_game_collections
create policy user_game_collections_select_own
  on public.user_game_collections
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy user_game_collections_insert_own
  on public.user_game_collections
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy user_game_collections_update_own
  on public.user_game_collections
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy user_game_collections_delete_own
  on public.user_game_collections
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- user_game_collection_items
create policy user_game_collection_items_select_own
  on public.user_game_collection_items
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy user_game_collection_items_insert_own
  on public.user_game_collection_items
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy user_game_collection_items_delete_own
  on public.user_game_collection_items
  for delete
  to authenticated
  using (auth.uid() = user_id);
