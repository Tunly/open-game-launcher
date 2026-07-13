begin;

create or replace function public.create_group_room(
  title_input text,
  member_ids_input uuid[]
)
returns uuid
language plpgsql
security definer
volatile
set search_path = pg_catalog, public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  max_participants constant integer := 50;
  normalized_title text;
  invited_member_ids uuid[];
  invited_member_id uuid;
  canonical_pair_key text;
  created_room_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required to create a group room'
      using errcode = '42501';
  end if;

  if title_input is null then
    raise exception 'A group-room title is required'
      using errcode = '22023';
  end if;

  normalized_title := btrim(title_input);

  if char_length(normalized_title) not between 1 and 80 then
    raise exception 'A group-room title must contain between 1 and 80 characters'
      using errcode = '22023';
  end if;

  if member_ids_input is null then
    raise exception 'At least one invited group member is required'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(member_ids_input) as input_member(member_id)
    where input_member.member_id is null
  ) then
    raise exception 'Group member IDs cannot contain null values'
      using errcode = '22023';
  end if;

  select coalesce(
    array_agg(normalized_member.member_id order by normalized_member.member_id),
    '{}'::uuid[]
  )
  into invited_member_ids
  from (
    select distinct input_member.member_id
    from unnest(member_ids_input) as input_member(member_id)
    where input_member.member_id <> current_user_id
  ) as normalized_member;

  if cardinality(invited_member_ids) = 0 then
    raise exception 'At least one invited group member is required'
      using errcode = '22023';
  end if;

  if cardinality(invited_member_ids) + 1 > max_participants then
    raise exception 'A group room cannot contain more than % participants', max_participants
      using errcode = '22023';
  end if;

  -- Every caller/member pair uses the same lock key as direct-room creation.
  -- Acquiring all pair locks in canonical order prevents overlapping group
  -- requests from deadlocking while relationship state is validated.
  for canonical_pair_key in
    select public.build_dm_pair_key(current_user_id, member.member_id)
    from unnest(invited_member_ids) as member(member_id)
    order by public.build_dm_pair_key(current_user_id, member.member_id)
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(canonical_pair_key, 0)
    );
  end loop;

  -- Missing block rows cannot be row-locked. A short SHARE table lock keeps a
  -- concurrent block insert/delete from crossing the validation boundary.
  lock table public.user_blocks in share mode;

  for invited_member_id in
    select member.member_id
    from unnest(invited_member_ids) as member(member_id)
    order by public.build_dm_pair_key(current_user_id, member.member_id)
  loop
    perform 1
    from public.user_blocks as user_block
    where (
        user_block.blocker_id = current_user_id
        and user_block.blocked_id = invited_member_id
      )
      or (
        user_block.blocker_id = invited_member_id
        and user_block.blocked_id = current_user_id
      )
    order by user_block.blocker_id, user_block.blocked_id
    for key share;

    if found then
      raise exception 'Group rooms cannot include users who block one another'
        using errcode = '42501';
    end if;

    perform 1
    from public.friendships as friendship
    where friendship.status = 'accepted'
      and (
        (
          friendship.requester_id = current_user_id
          and friendship.addressee_id = invited_member_id
        )
        or (
          friendship.requester_id = invited_member_id
          and friendship.addressee_id = current_user_id
        )
      )
    for update;

    if not found then
      raise exception 'Every invited group member must be an accepted friend'
        using errcode = '42501';
    end if;
  end loop;

  insert into public.chat_rooms (
    type,
    name,
    created_by
  )
  values (
    'group',
    normalized_title,
    current_user_id
  )
  returning id into created_room_id;

  insert into public.chat_room_members (
    room_id,
    user_id,
    role
  )
  values (
    created_room_id,
    current_user_id,
    'owner'
  );

  insert into public.chat_room_members (
    room_id,
    user_id,
    role
  )
  select
    created_room_id,
    member.member_id,
    'member'
  from unnest(invited_member_ids) as member(member_id);

  return created_room_id;
end;
$$;

revoke all on function public.create_group_room(text, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.create_group_room(text, uuid[])
  to authenticated, service_role;

create or replace function public.add_group_room_member(
  room_id_input uuid,
  member_id_input uuid
)
returns void
language plpgsql
security definer
volatile
set search_path = pg_catalog, public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  max_participants constant integer := 50;
  group_room public.chat_rooms%rowtype;
  canonical_pair_key text;
  participant_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required to add a group-room member'
      using errcode = '42501';
  end if;

  if room_id_input is null or member_id_input is null then
    raise exception 'A group room and member are required'
      using errcode = '22023';
  end if;

  if member_id_input = current_user_id then
    raise exception 'You cannot add yourself as a group-room member'
      using errcode = '22023';
  end if;

  -- This row is the per-room serialization point for all authenticated adds.
  select room.*
  into group_room
  from public.chat_rooms as room
  where room.id = room_id_input
  for update;

  if not found then
    raise exception 'The group room does not exist'
      using errcode = '22023';
  end if;

  if group_room.type <> 'group' then
    raise exception 'Members can be added only to group rooms'
      using errcode = '22023';
  end if;

  if group_room.created_by <> current_user_id then
    raise exception 'Only the group-room creator can add members'
      using errcode = '42501';
  end if;

  perform 1
  from public.chat_room_members as creator_membership
  where creator_membership.room_id = group_room.id
    and creator_membership.user_id = current_user_id
    and creator_membership.role = 'owner'
  for update;

  if not found then
    raise exception 'The group-room creator must have an active owner membership'
      using errcode = '42501';
  end if;

  perform 1
  from public.chat_room_members as existing_member
  where existing_member.room_id = group_room.id
    and existing_member.user_id = member_id_input
  for key share;

  if found then
    raise exception 'The user is already a group-room member'
      using errcode = '23505';
  end if;

  canonical_pair_key := public.build_dm_pair_key(
    current_user_id,
    member_id_input
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(canonical_pair_key, 0)
  );

  -- A missing block row cannot be locked, so hold block writes until this
  -- validation and the membership insert commit together.
  lock table public.user_blocks in share mode;

  perform 1
  from public.user_blocks as user_block
  where (
      user_block.blocker_id = current_user_id
      and user_block.blocked_id = member_id_input
    )
    or (
      user_block.blocker_id = member_id_input
      and user_block.blocked_id = current_user_id
    )
  order by user_block.blocker_id, user_block.blocked_id
  for key share;

  if found then
    raise exception 'Group rooms cannot include users who block one another'
      using errcode = '42501';
  end if;

  perform 1
  from public.friendships as friendship
  where friendship.status = 'accepted'
    and (
      (
        friendship.requester_id = current_user_id
        and friendship.addressee_id = member_id_input
      )
      or (
        friendship.requester_id = member_id_input
        and friendship.addressee_id = current_user_id
      )
    )
  for update;

  if not found then
    raise exception 'A group-room member must be an accepted friend'
      using errcode = '42501';
  end if;

  select count(*)::integer
  into participant_count
  from public.chat_room_members as member
  where member.room_id = group_room.id;

  if participant_count >= max_participants then
    raise exception 'A group room cannot contain more than % participants', max_participants
      using errcode = '22023';
  end if;

  insert into public.chat_room_members (
    room_id,
    user_id,
    role
  )
  values (
    group_room.id,
    member_id_input,
    'member'
  );
end;
$$;

revoke all on function public.add_group_room_member(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.add_group_room_member(uuid, uuid)
  to authenticated, service_role;

-- Both room kinds now have transactional definer entrypoints, so direct table
-- inserts must not remain an alternate, partially-committed client path.
revoke insert on table public.chat_rooms from authenticated;

-- Group creation, direct-room repair, and group member additions now all use
-- definer RPCs. Keep direct maintenance available only to the service role.
revoke insert on table public.chat_room_members
  from public, anon, authenticated;
grant insert on table public.chat_room_members to service_role;

drop policy if exists chat_room_members_insert_self_or_friend
  on public.chat_room_members;

drop policy if exists chat_room_members_delete_self_or_creator
  on public.chat_room_members;

-- Non-creators may leave a group, while an active creator-member may remove
-- other members. Direct-room pairs and the creator membership are immutable
-- through authenticated table deletes; service maintenance still bypasses RLS.
create policy chat_room_members_delete_self_or_creator
  on public.chat_room_members
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.chat_rooms as room
      where room.id = room_id
        and room.type = 'group'
        and user_id <> room.created_by
        and (
          user_id = (select auth.uid())
          or (
            room.created_by = (select auth.uid())
            and private.is_chat_room_member(
              room.id,
              (select auth.uid())
            )
          )
        )
    )
  );

create or replace function private.is_chat_room_member(
  room_id_input uuid,
  user_id_input uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  room_type text;
  room_creator_id uuid;
  direct_pair_key text;
  first_participant_id uuid;
  second_participant_id uuid;
begin
  if room_id_input is null or user_id_input is null then
    return false;
  end if;

  -- The helper is executable by authenticated users because RLS policies call
  -- it. Do not let callers probe another user's room membership directly.
  if coalesce(auth.role(), '') <> 'service_role'
     and user_id_input is distinct from auth.uid() then
    return false;
  end if;

  select
    room.type,
    room.created_by,
    room.dm_pair_key
  into
    room_type,
    room_creator_id,
    direct_pair_key
  from public.chat_rooms as room
  where room.id = room_id_input;

  if not found then
    return false;
  end if;

  if room_type = 'group' then
    return exists (
      select 1
      from public.chat_room_members as member
      where member.room_id = room_id_input
        and member.user_id = user_id_input
    );
  end if;

  if room_type <> 'dm'
     or direct_pair_key is null
     or direct_pair_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;

  begin
    first_participant_id := split_part(direct_pair_key, ':', 1)::uuid;
    second_participant_id := split_part(direct_pair_key, ':', 2)::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  if first_participant_id = second_participant_id
     or direct_pair_key is distinct from public.build_dm_pair_key(
       first_participant_id,
       second_participant_id
     )
     or room_creator_id not in (first_participant_id, second_participant_id)
     or user_id_input not in (first_participant_id, second_participant_id) then
    return false;
  end if;

  if not exists (
    select 1
    from public.chat_room_members as member
    where member.room_id = room_id_input
      and member.user_id = user_id_input
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.user_blocks as user_block
    where (
        user_block.blocker_id = first_participant_id
        and user_block.blocked_id = second_participant_id
      )
      or (
        user_block.blocker_id = second_participant_id
        and user_block.blocked_id = first_participant_id
      )
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function private.is_chat_room_member(uuid, uuid)
  from public, anon, authenticated, service_role;
grant usage on schema private to authenticated, service_role;
grant execute on function private.is_chat_room_member(uuid, uuid)
  to authenticated, service_role;

-- Column grants already limit authenticated message updates to content and the
-- soft-delete marker. Re-evaluate membership too, so a blocked DM participant
-- cannot keep communicating by editing a previously sent message.
drop policy if exists chat_messages_update_sender on public.chat_messages;
create policy chat_messages_update_sender
  on public.chat_messages
  for update
  to authenticated
  using (
    sender_id = (select auth.uid())
    and private.is_chat_room_member(
      room_id,
      (select auth.uid())
    )
  )
  with check (
    sender_id = (select auth.uid())
    and private.is_chat_room_member(
      room_id,
      (select auth.uid())
    )
  );

-- This temporary policy supported the former split room/member insert. It is
-- permissive with chat_rooms_select_member, so retaining it would let a DM
-- creator bypass the block-aware helper.
drop policy if exists chat_rooms_select_creator on public.chat_rooms;

commit;
