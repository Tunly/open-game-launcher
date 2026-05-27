create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'dm',
  name text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_rooms_type_check check (type in ('dm', 'group')),
  constraint chat_rooms_name_length_check check (name is null or char_length(name) <= 80)
);

create table if not exists public.chat_room_members (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (room_id, user_id),
  constraint chat_room_members_role_check check (role in ('owner', 'member'))
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_messages_content_length_check check (char_length(btrim(content)) between 1 and 2000)
);

create table if not exists public.game_invites (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  game_id text,
  game_title text not null,
  launch_uri text,
  status text not null default 'pending',
  message text,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_invites_not_self_check check (sender_id <> receiver_id),
  constraint game_invites_status_check check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  constraint game_invites_game_title_check check (char_length(btrim(game_title)) between 1 and 160),
  constraint game_invites_message_length_check check (message is null or char_length(message) <= 500)
);

create index if not exists chat_room_members_user_idx
  on public.chat_room_members (user_id, room_id);

create index if not exists chat_messages_room_created_idx
  on public.chat_messages (room_id, created_at desc);

create index if not exists game_invites_receiver_status_idx
  on public.game_invites (receiver_id, status, created_at desc);

create index if not exists game_invites_sender_status_idx
  on public.game_invites (sender_id, status, created_at desc);

create schema if not exists private;

create or replace function private.is_chat_room_member(room_id_input uuid, user_id_input uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_room_members m
    where m.room_id = room_id_input
      and m.user_id = user_id_input
  );
$$;

revoke all on function private.is_chat_room_member(uuid, uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_chat_room_member(uuid, uuid) to authenticated;

drop trigger if exists set_chat_rooms_updated_at on public.chat_rooms;
create trigger set_chat_rooms_updated_at
  before update on public.chat_rooms
  for each row execute function public.set_updated_at();

drop trigger if exists set_chat_messages_updated_at on public.chat_messages;
create trigger set_chat_messages_updated_at
  before update on public.chat_messages
  for each row execute function public.set_updated_at();

drop trigger if exists set_game_invites_updated_at on public.game_invites;
create trigger set_game_invites_updated_at
  before update on public.game_invites
  for each row execute function public.set_updated_at();

alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.game_invites enable row level security;

grant select, insert, update, delete on public.chat_rooms to authenticated;
grant select, insert, update, delete on public.chat_room_members to authenticated;
grant select, insert, update, delete on public.chat_messages to authenticated;
grant select, insert, update on public.game_invites to authenticated;

create policy chat_rooms_select_member
  on public.chat_rooms
  for select
  to authenticated
  using (private.is_chat_room_member(id, auth.uid()));

create policy chat_rooms_insert_own
  on public.chat_rooms
  for insert
  to authenticated
  with check (created_by = auth.uid());

create policy chat_rooms_update_creator
  on public.chat_rooms
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy chat_room_members_select_member
  on public.chat_room_members
  for select
  to authenticated
  using (private.is_chat_room_member(room_id, auth.uid()));

create policy chat_room_members_insert_self_or_friend
  on public.chat_room_members
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1
      from public.chat_rooms room
      where room.id = room_id
        and room.created_by = auth.uid()
        and public.is_friend(auth.uid(), user_id)
    )
  );

create policy chat_room_members_update_self
  on public.chat_room_members
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy chat_room_members_delete_self_or_creator
  on public.chat_room_members
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.chat_rooms room
      where room.id = room_id
        and room.created_by = auth.uid()
    )
  );

create policy chat_messages_select_room_member
  on public.chat_messages
  for select
  to authenticated
  using (private.is_chat_room_member(room_id, auth.uid()));

create policy chat_messages_insert_room_member
  on public.chat_messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and private.is_chat_room_member(room_id, auth.uid())
  );

create policy chat_messages_update_sender
  on public.chat_messages
  for update
  to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

create policy game_invites_select_participant
  on public.game_invites
  for select
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy game_invites_insert_friend
  on public.game_invites
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_friend(auth.uid(), receiver_id)
  );

create policy game_invites_update_participant
  on public.game_invites
  for update
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid())
  with check (sender_id = auth.uid() or receiver_id = auth.uid());

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chat_messages'
    ) then
      alter publication supabase_realtime add table public.chat_messages;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'game_invites'
    ) then
      alter publication supabase_realtime add table public.game_invites;
    end if;
  end if;
end $$;
