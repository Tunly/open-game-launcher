revoke update on table public.game_invites from authenticated;
grant update (status) on table public.game_invites to authenticated;

create or replace function private.enforce_game_invite_status_transition()
returns trigger
language plpgsql
security invoker
set search_path = public, private, extensions, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
begin
  if new.sender_id is distinct from old.sender_id
    or new.receiver_id is distinct from old.receiver_id
    or new.game_id is distinct from old.game_id
    or new.game_title is distinct from old.game_title
    or new.launch_uri is distinct from old.launch_uri
    or new.message is distinct from old.message
    or new.expires_at is distinct from old.expires_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Game invite content is immutable after creation'
      using errcode = '42501';
  end if;

  if new.status = old.status then
    return new;
  end if;

  if auth.role() = 'service_role'
    or current_user in ('postgres', 'service_role', 'supabase_admin')
  then
    return new;
  end if;

  if old.status <> 'pending' then
    raise exception 'Completed game invites cannot change status'
      using errcode = '23514';
  end if;

  if actor_id = old.receiver_id and new.status in ('accepted', 'declined') then
    return new;
  end if;

  if actor_id = old.sender_id and new.status = 'cancelled' then
    return new;
  end if;

  raise exception 'Game invite status transition is not allowed for this user'
    using errcode = '42501';
end;
$$;

revoke execute on function private.enforce_game_invite_status_transition()
  from public, anon, authenticated;

drop trigger if exists enforce_game_invite_status_transition
  on public.game_invites;
create trigger enforce_game_invite_status_transition
  before update on public.game_invites
  for each row execute function private.enforce_game_invite_status_transition();
