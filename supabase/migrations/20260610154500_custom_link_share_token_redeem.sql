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
set search_path = public, extensions, pg_temp
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

  if not found
    or invite_row.receiver_id <> current_user_id
    or invite_row.status <> 'pending'
    or invite_row.expires_at <= accepted_time
  then
    raise exception 'Invite token is not redeemable.';
  end if;

  update public.game_invites
  set status = 'accepted'
  where id = invite_row.id;

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
