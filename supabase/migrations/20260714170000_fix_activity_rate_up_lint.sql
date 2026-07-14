-- Keep the interaction RPC unchanged while avoiding PL/pgSQL output-column
-- ambiguity in the INSERT conflict target reported by `supabase db lint`.

create or replace function public.set_activity_rate_up(
  p_activity_id uuid,
  p_active boolean
)
returns table (
  activity_id uuid,
  reaction_count bigint,
  reacted_by_current_user boolean
)
language plpgsql
security invoker
volatile
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.can_view_activity(p_activity_id) then
    raise exception 'Activity is not visible'
      using errcode = '42501';
  end if;

  if coalesce(p_active, false) then
    insert into public.activity_reactions (activity_id, user_id, reaction)
    values (p_activity_id, auth.uid(), 'rate_up')
    on conflict on constraint activity_reactions_pkey do nothing;
  else
    delete from public.activity_reactions as reaction
    where reaction.activity_id = p_activity_id
      and reaction.user_id = auth.uid();
  end if;

  return query
  select
    p_activity_id,
    (
      select count(*)
      from public.activity_reactions as reaction
      where reaction.activity_id = p_activity_id
    ),
    exists (
      select 1
      from public.activity_reactions as own_reaction
      where own_reaction.activity_id = p_activity_id
        and own_reaction.user_id = auth.uid()
    );
end;
$$;

revoke all on function public.set_activity_rate_up(uuid, boolean) from public, anon;
grant execute on function public.set_activity_rate_up(uuid, boolean) to authenticated;
