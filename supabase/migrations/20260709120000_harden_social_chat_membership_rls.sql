begin;

create schema if not exists private;

lock table public.chat_rooms in share row exclusive mode;
lock table public.chat_room_members in share row exclusive mode;
lock table public.chat_messages in share row exclusive mode;

create table if not exists private.quarantined_chat_room_members (
  room_id uuid not null,
  user_id uuid not null,
  role text not null,
  joined_at timestamptz not null,
  last_read_at timestamptz,
  quarantined_at timestamptz not null default now(),
  reason text not null,
  primary key (room_id, user_id)
);

revoke all on table private.quarantined_chat_room_members from public;
revoke all on table private.quarantined_chat_room_members from anon, authenticated;

create table if not exists private.legacy_group_membership_audit (
  room_id uuid not null,
  user_id uuid not null,
  role text not null,
  joined_at timestamptz not null,
  captured_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

revoke all on table private.legacy_group_membership_audit from public;
revoke all on table private.legacy_group_membership_audit from anon, authenticated;

insert into private.legacy_group_membership_audit (
  room_id,
  user_id,
  role,
  joined_at
)
select
  member.room_id,
  member.user_id,
  member.role,
  member.joined_at
from public.chat_room_members member
join public.chat_rooms room on room.id = member.room_id
where room.type = 'group'
  and member.user_id <> room.created_by
on conflict (room_id, user_id) do nothing;

create table if not exists private.invalid_dm_room_pair_audit (
  room_id uuid primary key,
  created_by uuid not null,
  dm_pair_key text not null,
  captured_at timestamptz not null default now()
);

revoke all on table private.invalid_dm_room_pair_audit from public;
revoke all on table private.invalid_dm_room_pair_audit from anon, authenticated;

insert into private.invalid_dm_room_pair_audit (
  room_id,
  created_by,
  dm_pair_key
)
select
  room.id,
  room.created_by,
  room.dm_pair_key
from public.chat_rooms room
where room.type = 'dm'
  and room.dm_pair_key is not null
  and case
    when room.dm_pair_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      (
        split_part(room.dm_pair_key, ':', 1) <> room.created_by::text
        and split_part(room.dm_pair_key, ':', 2) <> room.created_by::text
      )
      or room.dm_pair_key <> public.build_dm_pair_key(
        split_part(room.dm_pair_key, ':', 1)::uuid,
        split_part(room.dm_pair_key, ':', 2)::uuid
      )
    else true
  end
on conflict (room_id) do nothing;

update public.chat_rooms room
set dm_pair_key = null
from private.invalid_dm_room_pair_audit audit
where audit.room_id = room.id
  and audit.dm_pair_key = room.dm_pair_key;

update public.chat_rooms
set dm_pair_key = null
where type = 'group'
  and dm_pair_key is not null;

insert into private.quarantined_chat_room_members (
  room_id,
  user_id,
  role,
  joined_at,
  last_read_at,
  reason
)
select
  member.room_id,
  member.user_id,
  member.role,
  member.joined_at,
  member.last_read_at,
  case
    when invalid_pair.room_id is not null then 'room has an invalid direct-message pair'
    when room.type = 'group' then 'legacy group membership has no creator authorization record'
    else 'membership does not match the immutable direct-message pair'
  end
from public.chat_room_members member
join public.chat_rooms room on room.id = member.room_id
left join private.invalid_dm_room_pair_audit invalid_pair on invalid_pair.room_id = room.id
where invalid_pair.room_id is not null
  or not (
    (
      room.type = 'group'
      and member.user_id = room.created_by
    )
    or (
      room.type = 'dm'
      and room.dm_pair_key is not null
      and (
        member.user_id = room.created_by
        or (
          member.role = 'member'
          and room.dm_pair_key = public.build_dm_pair_key(room.created_by, member.user_id)
        )
      )
    )
  )
on conflict (room_id, user_id) do nothing;

delete from public.chat_room_members member
using public.chat_rooms room
where room.id = member.room_id
  and (
    exists (
      select 1
      from private.invalid_dm_room_pair_audit invalid_pair
      where invalid_pair.room_id = room.id
    )
    or not (
      (
        room.type = 'group'
        and member.user_id = room.created_by
      )
      or (
        room.type = 'dm'
        and room.dm_pair_key is not null
        and (
          member.user_id = room.created_by
          or (
            member.role = 'member'
            and room.dm_pair_key = public.build_dm_pair_key(room.created_by, member.user_id)
          )
        )
      )
    )
  );

update public.chat_room_members member
set role = case
  when member.user_id = room.created_by then 'owner'
  else 'member'
end
from public.chat_rooms room
where room.id = member.room_id
  and member.role is distinct from case
    when member.user_id = room.created_by then 'owner'
    else 'member'
  end;

drop policy if exists chat_rooms_insert_own
  on public.chat_rooms;

create policy chat_rooms_insert_own
  on public.chat_rooms
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (
        type = 'group'
        and dm_pair_key is null
      )
      or (
        type = 'dm'
        and dm_pair_key is not null
        and dm_pair_key = public.build_dm_pair_key(
          split_part(dm_pair_key, ':', 1)::uuid,
          split_part(dm_pair_key, ':', 2)::uuid
        )
        and (
          split_part(dm_pair_key, ':', 1) = (select auth.uid())::text
          or split_part(dm_pair_key, ':', 2) = (select auth.uid())::text
        )
      )
    )
  );

drop policy if exists chat_room_members_insert_self_or_friend
  on public.chat_room_members;

create policy chat_room_members_insert_self_or_friend
  on public.chat_room_members
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.chat_rooms room
      where room.id = room_id
        and room.created_by = (select auth.uid())
        and (
          (
            room.type = 'group'
            and (
              (
                user_id = (select auth.uid())
                and role = 'owner'
              )
              or (
                user_id <> (select auth.uid())
                and role = 'member'
                and public.is_friend((select auth.uid()), user_id)
              )
            )
          )
          or (
            room.type = 'dm'
            and room.dm_pair_key is not null
            and (
              (
                user_id = (select auth.uid())
                and role = 'owner'
                and (
                  split_part(room.dm_pair_key, ':', 1) = (select auth.uid())::text
                  or split_part(room.dm_pair_key, ':', 2) = (select auth.uid())::text
                )
              )
              or (
                user_id <> (select auth.uid())
                and role = 'member'
                and public.is_friend((select auth.uid()), user_id)
                and room.dm_pair_key = public.build_dm_pair_key((select auth.uid()), user_id)
              )
            )
          )
        )
    )
  );

revoke update on table public.chat_rooms from authenticated;
grant update (name) on table public.chat_rooms to authenticated;

revoke update on table public.chat_room_members from authenticated;
grant update (last_read_at) on table public.chat_room_members to authenticated;

revoke update on table public.chat_messages from authenticated;
grant update (content, deleted_at) on table public.chat_messages to authenticated;

commit;
