create table if not exists public.screenshot_likes (
  screenshot_id uuid not null references public.screenshots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (screenshot_id, user_id)
);

comment on table public.screenshot_likes is 'Per-user likes for visible game screenshots.';

alter table public.screenshot_likes enable row level security;
grant select, insert, delete on public.screenshot_likes to authenticated;
grant select on public.screenshot_likes to anon;

drop policy if exists screenshot_likes_read_visible on public.screenshot_likes;
create policy screenshot_likes_read_visible on public.screenshot_likes
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.screenshots s
      where s.id = screenshot_likes.screenshot_id
        and (s.is_public = true or auth.uid() = s.user_id)
    )
  );

drop policy if exists screenshot_likes_insert_visible_own on public.screenshot_likes;
create policy screenshot_likes_insert_visible_own on public.screenshot_likes
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.screenshots s
      where s.id = screenshot_likes.screenshot_id
        and (s.is_public = true or auth.uid() = s.user_id)
    )
  );

drop policy if exists screenshot_likes_delete_own on public.screenshot_likes;
create policy screenshot_likes_delete_own on public.screenshot_likes
  for delete to authenticated
  using (auth.uid() = user_id);
