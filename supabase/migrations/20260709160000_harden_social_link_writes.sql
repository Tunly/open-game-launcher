-- Route social-link writes through the atomic replacement RPC and enforce a
-- bounded web URL at the database boundary.

begin;

lock table public.user_social_links in share row exclusive mode;

do $$
begin
  if exists (
    select 1
    from public.user_social_links
    where char_length(url) > 2048
      or url !~* '^https?://[^[:space:]]+$'
  ) then
    raise exception
      'Cannot harden social links while invalid legacy URLs remain.';
  end if;
end
$$;

alter table public.user_social_links
  drop constraint if exists user_social_links_url_check;

alter table public.user_social_links
  add constraint user_social_links_url_check
  check (
    char_length(url) between 1 and 2048
    and url ~* '^https?://[^[:space:]]+$'
  );

alter function public.replace_my_social_links(jsonb) security definer;
alter function public.replace_my_social_links(jsonb)
  set search_path = public, pg_temp;

revoke insert, update, delete on table public.user_social_links from public;
revoke insert, update, delete on table public.user_social_links from anon;
revoke insert, update, delete on table public.user_social_links from authenticated;

revoke all on function public.replace_my_social_links(jsonb) from public;
revoke all on function public.replace_my_social_links(jsonb) from anon;
grant execute on function public.replace_my_social_links(jsonb) to authenticated;

commit;
