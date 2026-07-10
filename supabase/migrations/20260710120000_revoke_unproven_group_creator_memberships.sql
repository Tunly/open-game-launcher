-- The initial reconciliation migration restored missing group-owner rows from
-- chat_rooms alone. That is not sufficient provenance because a group creator
-- may deliberately leave their room. Preserve suspicious rows for private
-- operator review, but do not automatically revoke access: equal timestamps
-- are not sufficient proof that a membership was synthesized.

begin;

lock table public.chat_rooms in share row exclusive mode;
lock table public.chat_room_members in share row exclusive mode;
lock table private.quarantined_chat_room_members in share mode;

create table if not exists private.unproven_group_creator_membership_audit (
  room_id uuid not null,
  user_id uuid not null,
  role text not null,
  joined_at timestamptz not null,
  last_read_at timestamptz,
  revoked_at timestamptz not null default now(),
  reason text not null,
  primary key (room_id, user_id)
);

revoke all on table private.unproven_group_creator_membership_audit from public;
revoke all on table private.unproven_group_creator_membership_audit
  from anon, authenticated;

insert into private.unproven_group_creator_membership_audit (
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
  'creator membership was synthesized without a quarantine record'
from public.chat_room_members member
join public.chat_rooms room on room.id = member.room_id
where room.type = 'group'
  and member.user_id = room.created_by
  and member.role = 'owner'
  and member.joined_at = room.created_at
  and not exists (
    select 1
    from private.quarantined_chat_room_members quarantined
    where quarantined.room_id = member.room_id
      and quarantined.user_id = member.user_id
  )
on conflict (room_id, user_id) do nothing;

commit;
