create schema if not exists extensions;
create schema if not exists private;

grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema private to anon, authenticated, service_role;

alter extension citext set schema extensions;

alter function public.generate_family_invite_code() set search_path = public, extensions, pg_temp;
alter function public.set_family_invite_code() set search_path = public, extensions, pg_temp;
alter function public.build_dm_pair_key(uuid, uuid) set search_path = public, extensions, pg_temp;
alter function public.auto_match_friend_links() set search_path = public, extensions, pg_temp;

create or replace function private.is_friend(user_a uuid, user_b uuid)
returns boolean
language sql
security definer
stable
set search_path = public, private, extensions, pg_temp
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

create or replace function private.is_blocked(user_a uuid, user_b uuid)
returns boolean
language sql
security definer
stable
set search_path = public, private, extensions, pg_temp
as $$
  select exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = user_a and b.blocked_id = user_b)
       or (b.blocker_id = user_b and b.blocked_id = user_a)
  );
$$;

create or replace function private.can_view_visibility(viewer_id uuid, owner_id uuid, visibility text)
returns boolean
language sql
security definer
stable
set search_path = public, private, extensions, pg_temp
as $$
  select case
    when owner_id is null then false
    when viewer_id = owner_id then true
    when private.is_blocked(viewer_id, owner_id) then false
    when visibility = 'public' then true
    when visibility = 'friends_only' then private.is_friend(viewer_id, owner_id)
    else false
  end;
$$;

create or replace function private.can_view_profile(viewer_id uuid, profile_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, private, extensions, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = profile_user_id
      and p.is_banned = false
      and p.is_deleted = false
      and private.can_view_visibility(viewer_id, p.id, p.profile_visibility)
  );
$$;

create or replace function private.can_view_online_status(viewer_id uuid, profile_user_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public, private, extensions, pg_temp
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

  if not found or deleted or banned or private.is_blocked(viewer_id, profile_user_id) then
    return false;
  end if;

  return visibility = 'public'
    or (visibility = 'friends_only' and private.is_friend(viewer_id, profile_user_id));
end;
$$;

create or replace function private.can_view_game_activity(viewer_id uuid, profile_user_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public, private, extensions, pg_temp
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

  if not found or deleted or banned or private.is_blocked(viewer_id, profile_user_id) then
    return false;
  end if;

  return visibility = 'public'
    or (visibility = 'friends_only' and private.is_friend(viewer_id, profile_user_id));
end;
$$;

create or replace function private.can_view_achievements(viewer_id uuid, profile_user_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public, private, extensions, pg_temp
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

  if not found or deleted or banned or private.is_blocked(viewer_id, profile_user_id) then
    return false;
  end if;

  return visibility = 'public'
    or (visibility = 'friends_only' and private.is_friend(viewer_id, profile_user_id));
end;
$$;

create or replace function public.is_friend(user_a uuid, user_b uuid)
returns boolean
language sql
security invoker
stable
set search_path = public, private, extensions, pg_temp
as $$ select private.is_friend(user_a, user_b); $$;

create or replace function public.is_blocked(user_a uuid, user_b uuid)
returns boolean
language sql
security invoker
stable
set search_path = public, private, extensions, pg_temp
as $$ select private.is_blocked(user_a, user_b); $$;

create or replace function public.can_view_visibility(viewer_id uuid, owner_id uuid, visibility text)
returns boolean
language sql
security invoker
stable
set search_path = public, private, extensions, pg_temp
as $$ select private.can_view_visibility(viewer_id, owner_id, visibility); $$;

create or replace function public.can_view_profile(viewer_id uuid, profile_user_id uuid)
returns boolean
language sql
security invoker
stable
set search_path = public, private, extensions, pg_temp
as $$ select private.can_view_profile(viewer_id, profile_user_id); $$;

create or replace function public.can_view_online_status(viewer_id uuid, profile_user_id uuid)
returns boolean
language sql
security invoker
stable
set search_path = public, private, extensions, pg_temp
as $$ select private.can_view_online_status(viewer_id, profile_user_id); $$;

create or replace function public.can_view_game_activity(viewer_id uuid, profile_user_id uuid)
returns boolean
language sql
security invoker
stable
set search_path = public, private, extensions, pg_temp
as $$ select private.can_view_game_activity(viewer_id, profile_user_id); $$;

create or replace function public.can_view_achievements(viewer_id uuid, profile_user_id uuid)
returns boolean
language sql
security invoker
stable
set search_path = public, private, extensions, pg_temp
as $$ select private.can_view_achievements(viewer_id, profile_user_id); $$;

create or replace function public.is_username_available(username_input text)
returns boolean
language sql
security invoker
stable
set search_path = public, private, extensions, pg_temp
as $$
  select username_input is not null
    and char_length(username_input) between 3 and 32
    and username_input ~ '^[A-Za-z0-9_.-]+$'
    and not exists (
      select 1
      from public.profiles p
      where p.username = username_input::extensions.citext
    );
$$;

grant execute on function private.is_friend(uuid, uuid) to anon, authenticated;
grant execute on function private.is_blocked(uuid, uuid) to anon, authenticated;
grant execute on function private.can_view_visibility(uuid, uuid, text) to anon, authenticated;
grant execute on function private.can_view_profile(uuid, uuid) to anon, authenticated;
grant execute on function private.can_view_online_status(uuid, uuid) to anon, authenticated;
grant execute on function private.can_view_game_activity(uuid, uuid) to anon, authenticated;
grant execute on function private.can_view_achievements(uuid, uuid) to anon, authenticated;

revoke execute on function public.auto_match_friend_links() from public, anon, authenticated;
revoke execute on function public.ensure_review_library_entry() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.validate_friendship() from public, anon, authenticated;

revoke execute on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;
