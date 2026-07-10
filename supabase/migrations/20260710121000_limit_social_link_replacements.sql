-- Bound atomic social-link replacements at the database boundary. This
-- forward migration preserves the URL hardening and SECURITY DEFINER posture
-- introduced after the original RPC migration.

begin;

create or replace function public.replace_my_social_links(links_input jsonb default '[]'::jsonb)
returns setof public.user_social_links
language plpgsql
security definer
volatile
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_links jsonb := coalesce(links_input, '[]'::jsonb);
begin
  if current_user_id is null then
    raise exception 'Authentication required to replace social links'
      using errcode = '42501';
  end if;

  if jsonb_typeof(normalized_links) <> 'array' then
    raise exception 'Social links payload must be a JSON array'
      using errcode = '22023';
  end if;

  if jsonb_array_length(normalized_links) > 16 then
    raise exception 'Social links payload may contain at most 16 entries'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(normalized_links) as entry(link)
    where jsonb_typeof(link) <> 'object'
      or jsonb_typeof(link -> 'platform') is distinct from 'string'
      or char_length(btrim(link ->> 'platform')) not between 1 and 32
      or jsonb_typeof(link -> 'url') is distinct from 'string'
      or char_length(btrim(link ->> 'url')) not between 1 and 2048
      or btrim(link ->> 'url') !~* '^https?://[^[:space:]]+$'
      or (
        link ? 'label'
        and jsonb_typeof(link -> 'label') not in ('string', 'null')
      )
      or char_length(coalesce(link ->> 'label', '')) > 64
      or (
        link ? 'sort_order'
        and (
          jsonb_typeof(link -> 'sort_order') <> 'number'
          or (link ->> 'sort_order') !~ '^[0-9]+$'
        )
      )
      or (
        link ? 'visibility'
        and coalesce(link ->> 'visibility', '') not in ('public', 'friends_only', 'private')
      )
  ) then
    raise exception 'Social links payload contains an invalid entry'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  delete from public.user_social_links
  where user_id = current_user_id;

  insert into public.user_social_links (
    user_id,
    platform,
    label,
    url,
    sort_order,
    visibility
  )
  select
    current_user_id,
    btrim(link ->> 'platform'),
    nullif(btrim(link ->> 'label'), ''),
    btrim(link ->> 'url'),
    coalesce((link ->> 'sort_order')::integer, ordinality::integer - 1),
    coalesce(link ->> 'visibility', 'public')
  from jsonb_array_elements(normalized_links) with ordinality as entries(link, ordinality);

  return query
  select social_link.*
  from public.user_social_links as social_link
  where social_link.user_id = current_user_id
  order by social_link.sort_order, social_link.id;
end;
$$;

revoke insert, update, delete on table public.user_social_links
  from public, anon, authenticated;
revoke all on function public.replace_my_social_links(jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_my_social_links(jsonb)
  to authenticated;

commit;
