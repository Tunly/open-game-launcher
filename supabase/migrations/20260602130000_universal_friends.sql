-- Universal Friends System: platform accounts, friend links, dedup, activity feed
-- Enables cross-platform friend import, 3-stage deduplication, and activity tracking.

-- ---------------------------------------------------------------------------
-- Platform Accounts — links OG user to their platform identities
-- ---------------------------------------------------------------------------

create table if not exists public.platform_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  platform_user_id text not null,
  platform_username text,
  platform_avatar_url text,
  metadata jsonb not null default '{}'::jsonb,
  linked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform),
  unique (platform, platform_user_id),
  check (platform in ('steam', 'epic', 'gog', 'ea', 'xbox', 'battlenet', 'ubisoft', 'og'))
);

comment on table public.platform_accounts is 'Links an OG Launcher user to their gaming platform identities for friend import and cross-platform features.';

drop trigger if exists set_platform_accounts_updated_at on public.platform_accounts;
create trigger set_platform_accounts_updated_at
  before update on public.platform_accounts
  for each row execute function public.set_updated_at();

grant select on public.platform_accounts to authenticated, anon;
grant insert, update, delete on public.platform_accounts to authenticated;
alter table public.platform_accounts enable row level security;

drop policy if exists platform_accounts_select_own on public.platform_accounts;
create policy platform_accounts_select_own on public.platform_accounts
  for select to authenticated
  using (user_id = auth.uid() or true);

drop policy if exists platform_accounts_insert_own on public.platform_accounts;
create policy platform_accounts_insert_own on public.platform_accounts
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists platform_accounts_update_own on public.platform_accounts;
create policy platform_accounts_update_own on public.platform_accounts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists platform_accounts_delete_own on public.platform_accounts;
create policy platform_accounts_delete_own on public.platform_accounts
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Friend Links — imported platform friends (dedup bridge)
-- ---------------------------------------------------------------------------

create table if not exists public.friend_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  platform_friend_id text not null,
  platform_friend_name text,
  platform_friend_avatar text,
  matched_user_id uuid references auth.users(id) on delete set null,
  match_method text,
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, platform, platform_friend_id),
  check (platform in ('steam', 'epic', 'gog', 'ea', 'xbox', 'battlenet', 'ubisoft', 'og')),
  check (match_method is null or match_method in ('linked_account', 'heuristic', 'manual'))
);

comment on table public.friend_links is 'Imported platform friends. Bridges external friend lists to OG users via deduplication.';

drop trigger if exists set_friend_links_updated_at on public.friend_links;
create trigger set_friend_links_updated_at
  before update on public.friend_links
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.friend_links to authenticated;
alter table public.friend_links enable row level security;

drop policy if exists friend_links_own on public.friend_links;
create policy friend_links_own on public.friend_links
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Index for fast dedup lookups
create index if not exists friend_links_platform_id_idx
  on public.friend_links (platform, platform_friend_id);

create index if not exists friend_links_matched_user_idx
  on public.friend_links (matched_user_id) where matched_user_id is not null;

-- ---------------------------------------------------------------------------
-- Friend Merge Suggestions — heuristic/manual dedup candidates
-- ---------------------------------------------------------------------------

create table if not exists public.friend_merge_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_link_a uuid not null references public.friend_links(id) on delete cascade,
  friend_link_b uuid references public.friend_links(id) on delete cascade,
  suggested_user_id uuid references auth.users(id) on delete cascade,
  confidence real not null default 0.0,
  reason text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('pending', 'accepted', 'rejected')),
  check (confidence >= 0.0 and confidence <= 1.0)
);

comment on table public.friend_merge_suggestions is 'Deduplication suggestions: heuristic matches between imported platform friends or OG users.';

drop trigger if exists set_friend_merge_suggestions_updated_at on public.friend_merge_suggestions;
create trigger set_friend_merge_suggestions_updated_at
  before update on public.friend_merge_suggestions
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.friend_merge_suggestions to authenticated;
alter table public.friend_merge_suggestions enable row level security;

drop policy if exists friend_merge_suggestions_own on public.friend_merge_suggestions;
create policy friend_merge_suggestions_own on public.friend_merge_suggestions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Activity Feed — game starts, achievements, screenshots
-- ---------------------------------------------------------------------------

create table if not exists public.activity_feed (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  game_id uuid references public.games(id) on delete set null,
  game_title text,
  achievement_name text,
  screenshot_url text,
  metadata jsonb not null default '{}'::jsonb,
  visibility text not null default 'friends_only',
  created_at timestamptz not null default now(),
  check (type in ('game_start', 'game_stop', 'achievement_unlocked', 'screenshot_taken')),
  check (visibility in ('public', 'friends_only', 'private'))
);

comment on table public.activity_feed is 'Friend activity feed: game starts, achievements, screenshots with visibility controls.';

create index if not exists activity_feed_user_created_idx
  on public.activity_feed (user_id, created_at desc);

create index if not exists activity_feed_created_idx
  on public.activity_feed (created_at desc);

grant select, insert, delete on public.activity_feed to authenticated;
alter table public.activity_feed enable row level security;

-- Users can see their own activity
drop policy if exists activity_feed_select_own on public.activity_feed;
create policy activity_feed_select_own on public.activity_feed
  for select to authenticated
  using (
    user_id = auth.uid()
    or visibility = 'public'
    or (visibility = 'friends_only' and public.is_friend(auth.uid(), user_id))
  );

drop policy if exists activity_feed_insert_own on public.activity_feed;
create policy activity_feed_insert_own on public.activity_feed
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists activity_feed_delete_own on public.activity_feed;
create policy activity_feed_delete_own on public.activity_feed
  for delete to authenticated
  using (user_id = auth.uid());

-- Publish activity_feed to realtime for live updates
do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activity_feed'
  ) then
    alter publication supabase_realtime add table public.activity_feed;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Auto-match function: when a platform_account is linked, auto-match friend_links
-- ---------------------------------------------------------------------------

create or replace function public.auto_match_friend_links()
returns trigger
language plpgsql
security definer
as $$
begin
  -- When a user links a platform account, find all friend_links where
  -- someone imported this platform+platform_user_id and auto-match them.
  update public.friend_links
  set matched_user_id = new.user_id,
      match_method = 'linked_account',
      updated_at = now()
  where platform = new.platform
    and platform_friend_id = new.platform_user_id
    and matched_user_id is null;

  return new;
end;
$$;

drop trigger if exists auto_match_on_platform_link on public.platform_accounts;
create trigger auto_match_on_platform_link
  after insert or update on public.platform_accounts
  for each row execute function public.auto_match_friend_links();
