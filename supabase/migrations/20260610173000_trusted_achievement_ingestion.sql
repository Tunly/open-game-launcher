-- Route achievement unlocks and profile XP through service-role ingestion.
-- Profile owners keep cosmetic/privacy/theme writes, but XP/level is derived.

revoke insert, update on public.profiles from anon, authenticated;

grant insert (
  id,
  username,
  display_name,
  avatar_url,
  banner_url,
  bio,
  country_code,
  language,
  timezone,
  profile_visibility,
  online_status_visibility,
  game_activity_visibility,
  achievement_visibility,
  library_visibility,
  wishlist_visibility,
  comments_visibility,
  profile_theme_id,
  featured_badge_id,
  featured_game_id,
  featured_achievement_id
) on public.profiles to authenticated;

grant update (
  username,
  display_name,
  avatar_url,
  banner_url,
  bio,
  country_code,
  language,
  timezone,
  profile_visibility,
  online_status_visibility,
  game_activity_visibility,
  achievement_visibility,
  library_visibility,
  wishlist_visibility,
  comments_visibility,
  profile_theme_id,
  featured_badge_id,
  featured_game_id,
  featured_achievement_id
) on public.profiles to authenticated;

revoke insert, update, delete on public.achievements from anon, authenticated;
revoke insert, update, delete on public.user_achievements from anon, authenticated;
revoke insert, update, delete on public.achievement_progress from anon, authenticated;
revoke insert, update, delete on public.user_activity from anon, authenticated;

drop policy if exists activity_feed_insert_own on public.activity_feed;
create policy activity_feed_insert_own
  on public.activity_feed
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and type in ('game_start', 'game_stop', 'screenshot_taken')
  );
