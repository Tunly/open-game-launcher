alter table public.game_invites
  alter column receiver_id drop not null;

alter table public.game_invites
  drop constraint if exists game_invites_not_self_check;

alter table public.game_invites
  add constraint game_invites_not_self_check
  check (receiver_id is null or sender_id <> receiver_id);

alter table public.game_invites
  drop constraint if exists game_invites_accepted_receiver_check;

alter table public.game_invites
  add constraint game_invites_accepted_receiver_check
  check (status <> 'accepted' or receiver_id is not null);

create index if not exists game_invites_open_sender_status_idx
  on public.game_invites (sender_id, status, created_at desc)
  where receiver_id is null;

drop policy if exists game_invites_insert_friend on public.game_invites;
create policy game_invites_insert_friend_or_open_link
  on public.game_invites
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and status = 'pending'
    and expires_at > now()
    and expires_at <= now() + interval '7 days'
    and (
      receiver_id is null
      or public.is_friend(auth.uid(), receiver_id)
    )
  );

drop policy if exists game_invites_update_participant on public.game_invites;

create policy game_invites_update_sender_pending
  on public.game_invites
  for update
  to authenticated
  using (sender_id = auth.uid())
  with check (
    sender_id = auth.uid()
    and status in ('pending', 'cancelled', 'expired')
    and (
      receiver_id is null
      or public.is_friend(auth.uid(), receiver_id)
    )
  );

create policy game_invites_update_receiver_status
  on public.game_invites
  for update
  to authenticated
  using (receiver_id = auth.uid())
  with check (
    receiver_id = auth.uid()
    and status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')
  );

create or replace function public.redeem_share_token(token_input text)
returns table (
  game_invite_id uuid,
  game_title text,
  platform text,
  status text,
  accepted_at timestamptz
)
language plpgsql
security definer
volatile
set search_path = public, private, extensions, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  token_row public.share_tokens%rowtype;
  invite_row public.game_invites%rowtype;
  accepted_time timestamptz := now();
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if not private.share_token_envelope_is_valid(token_input) then
    raise exception 'Invite token is not redeemable.';
  end if;

  select *
  into token_row
  from public.share_tokens st
  where st.token_hash = encode(digest(btrim(coalesce(token_input, '')), 'sha256'), 'hex')
  for update;

  if not found
    or token_row.revoked_at is not null
    or token_row.expires_at <= accepted_time
    or (token_row.max_uses is not null and token_row.uses_count >= token_row.max_uses)
  then
    raise exception 'Invite token is not redeemable.';
  end if;

  select *
  into invite_row
  from public.game_invites gi
  where gi.id = token_row.game_invite_id
  for update;

  if not found or public.is_blocked(invite_row.sender_id, current_user_id) then
    raise exception 'Invite token is not redeemable.';
  end if;

  update public.game_invites as invite
  set status = 'accepted',
      receiver_id = current_user_id
  where invite.id = invite_row.id
    and invite.status = 'pending'
    and invite.expires_at > accepted_time
    and invite.sender_id <> current_user_id
    and (invite.receiver_id is null or invite.receiver_id = current_user_id)
  returning invite.*
  into invite_row;

  if not found then
    raise exception 'Invite token is not redeemable.';
  end if;

  update public.share_tokens
  set uses_count = uses_count + 1,
      used_at = coalesce(used_at, accepted_time)
  where id = token_row.id;

  game_invite_id := invite_row.id;
  game_title := token_row.game_title;
  platform := token_row.platform;
  status := 'accepted';
  accepted_at := accepted_time;
  return next;
end;
$$;

revoke execute on function public.redeem_share_token(text)
  from public, anon, authenticated;
grant execute on function public.redeem_share_token(text)
  to authenticated;
