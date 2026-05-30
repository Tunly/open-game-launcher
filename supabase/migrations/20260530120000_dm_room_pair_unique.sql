alter table public.chat_rooms
  add column if not exists dm_pair_key text;

create unique index if not exists chat_rooms_dm_pair_key_idx
  on public.chat_rooms (dm_pair_key)
  where type = 'dm' and dm_pair_key is not null;

create or replace function public.build_dm_pair_key(user_a uuid, user_b uuid)
returns text
language sql
immutable
as $$
  select case
    when user_a::text < user_b::text then user_a::text || ':' || user_b::text
    else user_b::text || ':' || user_a::text
  end;
$$;

revoke all on function public.build_dm_pair_key(uuid, uuid) from public;
grant execute on function public.build_dm_pair_key(uuid, uuid) to authenticated;
