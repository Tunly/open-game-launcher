drop policy if exists chat_rooms_select_creator on public.chat_rooms;

create policy chat_rooms_select_creator
  on public.chat_rooms
  for select
  to authenticated
  using (created_by = (select auth.uid()));
