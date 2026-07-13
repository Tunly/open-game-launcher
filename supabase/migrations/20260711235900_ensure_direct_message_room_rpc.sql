begin;

create or replace function public.ensure_direct_room(friend_id_input uuid)
returns setof public.chat_rooms
language plpgsql
security definer
volatile
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  canonical_pair_key text;
  direct_room public.chat_rooms%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required to create a direct-message room'
      using errcode = '42501';
  end if;

  if friend_id_input is null then
    raise exception 'A friend is required to create a direct-message room'
      using errcode = '22023';
  end if;

  if friend_id_input = current_user_id then
    raise exception 'Cannot create a direct-message room with yourself'
      using errcode = '22023';
  end if;

  canonical_pair_key := public.build_dm_pair_key(
    current_user_id,
    friend_id_input
  );

  -- A row lock cannot serialize the initially-missing room, so lock the
  -- immutable pair key before checking relationship state or room existence.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(canonical_pair_key, 0)
  );

  perform 1
  from public.user_blocks as user_block
  where (
      user_block.blocker_id = current_user_id
      and user_block.blocked_id = friend_id_input
    )
    or (
      user_block.blocker_id = friend_id_input
      and user_block.blocked_id = current_user_id
    )
  for key share;

  if found then
    raise exception 'Direct messages are unavailable while either user blocks the other'
      using errcode = '42501';
  end if;

  perform 1
  from public.friendships as friendship
  where friendship.status = 'accepted'
    and (
      (
        friendship.requester_id = current_user_id
        and friendship.addressee_id = friend_id_input
      )
      or (
        friendship.requester_id = friend_id_input
        and friendship.addressee_id = current_user_id
      )
    )
  for update;

  if not found then
    raise exception 'Direct messages require an accepted friendship'
      using errcode = '42501';
  end if;

  select room.*
  into direct_room
  from public.chat_rooms as room
  where room.type = 'dm'
    and room.dm_pair_key = canonical_pair_key
  order by room.created_at, room.id
  limit 1
  for update;

  if not found then
    insert into public.chat_rooms as room (
      type,
      name,
      created_by,
      dm_pair_key
    )
    values (
      'dm',
      null,
      current_user_id,
      canonical_pair_key
    )
    on conflict (dm_pair_key)
      where type = 'dm' and dm_pair_key is not null
      do nothing
    returning room.* into direct_room;

    -- A legacy client may have raced this RPC without taking the advisory
    -- lock. The partial unique index chooses its room; lock and repair it.
    if not found then
      select room.*
      into direct_room
      from public.chat_rooms as room
      where room.type = 'dm'
        and room.dm_pair_key = canonical_pair_key
      order by room.created_at, room.id
      limit 1
      for update;

      if not found then
        raise exception 'Could not create the direct-message room'
          using errcode = '40001';
      end if;
    end if;
  end if;

  if direct_room.created_by not in (current_user_id, friend_id_input) then
    raise exception 'The canonical direct-message room has an invalid creator'
      using errcode = '23514';
  end if;

  insert into public.chat_room_members as existing_member (
    room_id,
    user_id,
    role
  )
  values
    (
      direct_room.id,
      current_user_id,
      case
        when direct_room.created_by = current_user_id then 'owner'
        else 'member'
      end
    ),
    (
      direct_room.id,
      friend_id_input,
      case
        when direct_room.created_by = friend_id_input then 'owner'
        else 'member'
      end
    )
  on conflict (room_id, user_id) do update
  set role = excluded.role
  where existing_member.role is distinct from excluded.role;

  return next direct_room;
  return;
end;
$$;

revoke all on function public.ensure_direct_room(uuid)
  from public, anon, authenticated;
grant execute on function public.ensure_direct_room(uuid)
  to authenticated;

commit;
