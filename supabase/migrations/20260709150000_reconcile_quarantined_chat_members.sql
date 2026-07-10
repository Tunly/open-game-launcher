-- Reconcile chat memberships quarantined by the RLS hardening migration.
-- Nothing here deletes rooms or messages: only memberships that can be proven
-- from a canonical pair or an accepted friendship are restored.

begin;

lock table public.chat_rooms in share row exclusive mode;
lock table public.chat_room_members in share row exclusive mode;
lock table public.friendships in share mode;
lock table private.quarantined_chat_room_members in share row exclusive mode;
lock table private.invalid_dm_room_pair_audit in share row exclusive mode;

-- A legacy DM with a missing/invalid pair can be reconstructed safely only
-- when its quarantine contains exactly the creator and one accepted friend.
with pair_candidates as (
  select
    room.id as room_id,
    room.created_by,
    (
      array_agg(member.user_id) filter (
        where member.user_id <> room.created_by
      )
    )[1] as other_user_id
  from public.chat_rooms room
  join private.quarantined_chat_room_members member
    on member.room_id = room.id
  where room.type = 'dm'
    and room.dm_pair_key is null
  group by room.id, room.created_by
  having count(*) = 2
    and count(*) filter (where member.user_id = room.created_by) = 1
    and count(*) filter (where member.user_id <> room.created_by) = 1
), eligible_pairs as (
  select candidate.*
  from pair_candidates candidate
  where exists (
    select 1
    from public.friendships friendship
    where friendship.status = 'accepted'
      and (
        (
          friendship.requester_id = candidate.created_by
          and friendship.addressee_id = candidate.other_user_id
        )
        or (
          friendship.addressee_id = candidate.created_by
          and friendship.requester_id = candidate.other_user_id
        )
      )
  )
)
update public.chat_rooms room
set dm_pair_key = public.build_dm_pair_key(
  eligible.created_by,
  eligible.other_user_id
)
from eligible_pairs eligible
where room.id = eligible.room_id
  and room.dm_pair_key is null;

-- Restore a group owner only when the hardening migration quarantined that
-- exact membership. A chat_rooms.created_by value alone is not proof that the
-- creator is still a member: group creators are allowed to leave their room.
insert into public.chat_room_members (
  room_id,
  user_id,
  role,
  joined_at,
  last_read_at
)
select
  quarantined.room_id,
  quarantined.user_id,
  'owner',
  quarantined.joined_at,
  quarantined.last_read_at
from private.quarantined_chat_room_members quarantined
join public.chat_rooms room on room.id = quarantined.room_id
where room.type = 'group'
  and quarantined.user_id = room.created_by
on conflict (room_id, user_id) do update
set
  role = 'owner',
  joined_at = least(chat_room_members.joined_at, excluded.joined_at),
  last_read_at = coalesce(chat_room_members.last_read_at, excluded.last_read_at);

-- Restore non-owner group members only when they are still accepted friends
-- with the room creator.
insert into public.chat_room_members (
  room_id,
  user_id,
  role,
  joined_at,
  last_read_at
)
select
  quarantined.room_id,
  quarantined.user_id,
  'member',
  quarantined.joined_at,
  quarantined.last_read_at
from private.quarantined_chat_room_members quarantined
join public.chat_rooms room on room.id = quarantined.room_id
where room.type = 'group'
  and quarantined.user_id <> room.created_by
  and exists (
    select 1
    from public.friendships friendship
    where friendship.status = 'accepted'
      and (
        (
          friendship.requester_id = room.created_by
          and friendship.addressee_id = quarantined.user_id
        )
        or (
          friendship.addressee_id = room.created_by
          and friendship.requester_id = quarantined.user_id
        )
      )
  )
on conflict (room_id, user_id) do update
set
  role = 'member',
  joined_at = least(chat_room_members.joined_at, excluded.joined_at),
  last_read_at = coalesce(chat_room_members.last_read_at, excluded.last_read_at);

-- Restore a canonical DM's other endpoint from quarantine. Both endpoints must
-- still be accepted friends, matching the current creation policy.
with parsed_dm_rooms as (
  select
    room.*,
    case
      when room.dm_pair_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then split_part(room.dm_pair_key, ':', 1)::uuid
      else null
    end as first_user_id,
    case
      when room.dm_pair_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then split_part(room.dm_pair_key, ':', 2)::uuid
      else null
    end as second_user_id
  from public.chat_rooms room
  where room.type = 'dm'
), valid_dm_rooms as (
  select room.*
  from parsed_dm_rooms room
  where room.first_user_id is not null
    and room.second_user_id is not null
    and room.dm_pair_key = public.build_dm_pair_key(
      room.first_user_id,
      room.second_user_id
    )
    and (
      room.first_user_id = room.created_by
      or room.second_user_id = room.created_by
    )
), eligible_dm_rooms as (
  select room.*
  from valid_dm_rooms room
  where exists (
    select 1
    from public.friendships friendship
    where friendship.status = 'accepted'
      and (
        (
          friendship.requester_id = room.first_user_id
          and friendship.addressee_id = room.second_user_id
        )
        or (
          friendship.addressee_id = room.first_user_id
          and friendship.requester_id = room.second_user_id
        )
      )
  )
)
insert into public.chat_room_members (
  room_id,
  user_id,
  role,
  joined_at,
  last_read_at
)
select
  quarantined.room_id,
  quarantined.user_id,
  case
    when quarantined.user_id = room.created_by then 'owner'
    else 'member'
  end,
  quarantined.joined_at,
  quarantined.last_read_at
from private.quarantined_chat_room_members quarantined
join eligible_dm_rooms room on room.id = quarantined.room_id
where quarantined.user_id in (room.first_user_id, room.second_user_id)
on conflict (room_id, user_id) do update
set
  role = excluded.role,
  joined_at = least(chat_room_members.joined_at, excluded.joined_at),
  last_read_at = coalesce(chat_room_members.last_read_at, excluded.last_read_at);

-- Retain every unresolved quarantine record for operator review. Remove a row
-- only after a matching live membership has been restored.
delete from private.quarantined_chat_room_members quarantined
where exists (
  select 1
  from public.chat_room_members member
  where member.room_id = quarantined.room_id
    and member.user_id = quarantined.user_id
);

delete from private.invalid_dm_room_pair_audit audit
where not exists (
    select 1
    from public.chat_rooms room
    where room.id = audit.room_id
  )
  or exists (
    select 1
    from public.chat_rooms room
    where room.id = audit.room_id
      and room.type = 'dm'
      and case
        when room.dm_pair_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          room.dm_pair_key = public.build_dm_pair_key(
            split_part(room.dm_pair_key, ':', 1)::uuid,
            split_part(room.dm_pair_key, ':', 2)::uuid
          )
          and (
            split_part(room.dm_pair_key, ':', 1) = room.created_by::text
            or split_part(room.dm_pair_key, ':', 2) = room.created_by::text
          )
        else false
      end
  );

commit;
