-- Social profile links now carry their own visibility lane. Public reads must
-- pass both the parent profile guard and the per-link visibility guard.

alter table public.user_social_links
  add column if not exists visibility text not null default 'public';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_social_links_visibility_check'
  ) then
    alter table public.user_social_links
      add constraint user_social_links_visibility_check
      check (visibility in ('public', 'friends_only', 'private'));
  end if;
end $$;

drop policy if exists profile_system_social_links_select_visible on public.user_social_links;
drop policy if exists profile_system_social_links_crud_own on public.user_social_links;
drop policy if exists social_link_visibility_select_visible on public.user_social_links;
drop policy if exists social_link_visibility_insert_own on public.user_social_links;
drop policy if exists social_link_visibility_update_own on public.user_social_links;
drop policy if exists social_link_visibility_delete_own on public.user_social_links;

create policy social_link_visibility_select_visible on public.user_social_links
  for select to anon, authenticated
  using (
    public.can_view_profile(auth.uid(), user_id)
    and public.can_view_visibility(auth.uid(), user_id, visibility)
  );

create policy social_link_visibility_insert_own on public.user_social_links
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy social_link_visibility_update_own on public.user_social_links
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy social_link_visibility_delete_own on public.user_social_links
  for delete to authenticated
  using (auth.uid() = user_id);
