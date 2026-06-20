-- Public Profile Privacy Guard:
-- Public profile lane reads must pass both the parent profile visibility guard
-- and the lane-specific visibility guard. Service role keeps its RLS bypass.

-- Remove additive legacy/profile-lane SELECT policies that can bypass the
-- parent profile visibility guard.
drop policy if exists profile_system_showcases_select_visible on public.profile_showcases;
drop policy if exists profile_system_comments_select_visible on public.profile_comments;
drop policy if exists profile_system_library_select_visible on public.user_library;
drop policy if exists profile_system_game_stats_select_visible on public.user_game_stats;
drop policy if exists profile_system_user_achievements_select_visible on public.user_achievements;
drop policy if exists profile_system_wishlist_select_visible on public.user_wishlist;
drop policy if exists profile_system_activity_select_visible on public.user_activity;
drop policy if exists profile_system_hardware_select_visible on public.user_hardware;

drop policy if exists user_library_select_own on public.user_library;
drop policy if exists user_game_stats_select_visible on public.user_game_stats;
drop policy if exists user_achievements_select_visible on public.user_achievements;
drop policy if exists user_wishlist_select_own on public.user_wishlist;
drop policy if exists user_activity_select_own on public.user_activity;
drop policy if exists user_activity_select_public on public.user_activity;
drop policy if exists user_activity_select_friends on public.user_activity;

-- These FOR ALL owner policies also apply to SELECT. Replace them with
-- command-scoped write policies using the same owner checks.
drop policy if exists profile_system_showcases_crud_own on public.profile_showcases;
drop policy if exists profile_system_wishlist_crud_own on public.user_wishlist;
drop policy if exists profile_system_hardware_crud_own on public.user_hardware;

drop policy if exists profile_privacy_guard_showcases_select_visible on public.profile_showcases;
create policy profile_privacy_guard_showcases_select_visible on public.profile_showcases
  for select to anon, authenticated
  using (
    is_enabled
    and public.can_view_profile(auth.uid(), user_id)
    and public.can_view_visibility(auth.uid(), user_id, visibility)
  );

drop policy if exists profile_privacy_guard_showcases_select_own on public.profile_showcases;
create policy profile_privacy_guard_showcases_select_own on public.profile_showcases
  for select to authenticated
  using (
    auth.uid() = user_id
    and public.can_view_profile(auth.uid(), user_id)
    and public.can_view_visibility(auth.uid(), user_id, visibility)
  );

drop policy if exists profile_privacy_guard_comments_select_visible on public.profile_comments;
create policy profile_privacy_guard_comments_select_visible on public.profile_comments
  for select to anon, authenticated
  using (
    is_deleted = false
    and public.can_view_profile(auth.uid(), profile_user_id)
    and exists (
      select 1
      from public.profiles p
      where p.id = profile_comments.profile_user_id
        and public.can_view_visibility(auth.uid(), profile_user_id, p.comments_visibility)
    )
  );

drop policy if exists profile_privacy_guard_comments_select_author_or_owner on public.profile_comments;
create policy profile_privacy_guard_comments_select_author_or_owner on public.profile_comments
  for select to authenticated
  using (
    (auth.uid() = profile_user_id or auth.uid() = author_id)
    and public.can_view_profile(auth.uid(), profile_user_id)
    and exists (
      select 1
      from public.profiles p
      where p.id = profile_comments.profile_user_id
        and public.can_view_visibility(auth.uid(), profile_user_id, p.comments_visibility)
    )
  );

drop policy if exists profile_privacy_guard_library_select_visible on public.user_library;
create policy profile_privacy_guard_library_select_visible on public.user_library
  for select to anon, authenticated
  using (
    status in ('active', 'hidden')
    and public.can_view_profile(auth.uid(), user_id)
    and exists (
      select 1
      from public.profiles p
      where p.id = user_library.user_id
        and public.can_view_visibility(auth.uid(), user_id, p.library_visibility)
    )
  );

drop policy if exists profile_privacy_guard_library_select_own on public.user_library;
create policy profile_privacy_guard_library_select_own on public.user_library
  for select to authenticated
  using (
    auth.uid() = user_id
    and public.can_view_profile(auth.uid(), user_id)
    and exists (
      select 1
      from public.profiles p
      where p.id = user_library.user_id
        and public.can_view_visibility(auth.uid(), user_id, p.library_visibility)
    )
  );

drop policy if exists profile_privacy_guard_game_stats_select_visible on public.user_game_stats;
create policy profile_privacy_guard_game_stats_select_visible on public.user_game_stats
  for select to anon, authenticated
  using (
    public.can_view_profile(auth.uid(), user_id)
    and exists (
      select 1
      from public.profiles p
      where p.id = user_game_stats.user_id
        and public.can_view_visibility(auth.uid(), user_id, p.game_activity_visibility)
    )
  );

drop policy if exists profile_privacy_guard_user_achievements_select_visible on public.user_achievements;
create policy profile_privacy_guard_user_achievements_select_visible on public.user_achievements
  for select to anon, authenticated
  using (
    public.can_view_profile(auth.uid(), user_id)
    and exists (
      select 1
      from public.profiles p
      where p.id = user_achievements.user_id
        and public.can_view_visibility(auth.uid(), user_id, p.achievement_visibility)
    )
  );

drop policy if exists profile_privacy_guard_wishlist_select_visible on public.user_wishlist;
create policy profile_privacy_guard_wishlist_select_visible on public.user_wishlist
  for select to anon, authenticated
  using (
    public.can_view_profile(auth.uid(), user_id)
    and exists (
      select 1
      from public.profiles p
      where p.id = user_wishlist.user_id
        and public.can_view_visibility(auth.uid(), user_id, p.wishlist_visibility)
    )
  );

drop policy if exists profile_privacy_guard_activity_select_visible on public.user_activity;
create policy profile_privacy_guard_activity_select_visible on public.user_activity
  for select to anon, authenticated
  using (
    public.can_view_profile(auth.uid(), user_id)
    and public.can_view_visibility(auth.uid(), user_id, visibility)
  );

drop policy if exists profile_privacy_guard_hardware_select_visible on public.user_hardware;
create policy profile_privacy_guard_hardware_select_visible on public.user_hardware
  for select to anon, authenticated
  using (
    public.can_view_profile(auth.uid(), user_id)
    and public.can_view_visibility(auth.uid(), user_id, visibility)
  );

drop policy if exists profile_privacy_guard_profile_showcases_insert_own on public.profile_showcases;
create policy profile_privacy_guard_profile_showcases_insert_own on public.profile_showcases
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists profile_privacy_guard_profile_showcases_update_own on public.profile_showcases;
create policy profile_privacy_guard_profile_showcases_update_own on public.profile_showcases
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists profile_privacy_guard_profile_showcases_delete_own on public.profile_showcases;
create policy profile_privacy_guard_profile_showcases_delete_own on public.profile_showcases
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists profile_privacy_guard_user_wishlist_insert_own on public.user_wishlist;
create policy profile_privacy_guard_user_wishlist_insert_own on public.user_wishlist
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists profile_privacy_guard_user_wishlist_update_own on public.user_wishlist;
create policy profile_privacy_guard_user_wishlist_update_own on public.user_wishlist
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists profile_privacy_guard_user_wishlist_delete_own on public.user_wishlist;
create policy profile_privacy_guard_user_wishlist_delete_own on public.user_wishlist
  for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists profile_privacy_guard_user_hardware_insert_own on public.user_hardware;
create policy profile_privacy_guard_user_hardware_insert_own on public.user_hardware
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists profile_privacy_guard_user_hardware_update_own on public.user_hardware;
create policy profile_privacy_guard_user_hardware_update_own on public.user_hardware
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists profile_privacy_guard_user_hardware_delete_own on public.user_hardware;
create policy profile_privacy_guard_user_hardware_delete_own on public.user_hardware
  for delete to authenticated
  using (auth.uid() = user_id);
