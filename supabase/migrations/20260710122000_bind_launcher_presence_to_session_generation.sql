-- Keep delayed launcher cleanup requests from clearing a newer auth session.
alter table public.user_presence
  add column if not exists session_generation uuid default null;

comment on column public.user_presence.session_generation is
  'Nullable launcher auth-effect generation. Launcher cleanup writes must match this value; trusted generic/provider polling writes preserve it.';

create or replace function public.preserve_user_presence_session_generation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.session_generation is null and old.session_generation is not null then
    new.session_generation := old.session_generation;
  end if;

  return new;
end;
$$;

revoke execute on function public.preserve_user_presence_session_generation()
  from public, anon, authenticated;

drop trigger if exists preserve_user_presence_session_generation
  on public.user_presence;
create trigger preserve_user_presence_session_generation
  before update on public.user_presence
  for each row execute function public.preserve_user_presence_session_generation();

comment on function public.preserve_user_presence_session_generation() is
  'Prevents generic launcher and trusted provider-poller upserts that omit the nullable session generation from clearing an active launcher generation.';
