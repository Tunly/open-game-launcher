create or replace function public.is_friend(user_a uuid, user_b uuid)
returns boolean
language sql
security invoker
stable
set search_path = public, private, extensions, pg_temp
as $$
  select case
    when auth.uid() is null then false
    when auth.uid() <> user_a and auth.uid() <> user_b then false
    else private.is_friend(user_a, user_b)
  end;
$$;

create or replace function public.is_blocked(user_a uuid, user_b uuid)
returns boolean
language sql
security invoker
stable
set search_path = public, private, extensions, pg_temp
as $$
  select case
    when auth.uid() is null then true
    when auth.uid() <> user_a and auth.uid() <> user_b then true
    else private.is_blocked(user_a, user_b)
  end;
$$;

revoke execute on function public.is_friend(uuid, uuid) from public, anon;
revoke execute on function public.is_blocked(uuid, uuid) from public, anon;
grant execute on function public.is_friend(uuid, uuid) to authenticated;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;
