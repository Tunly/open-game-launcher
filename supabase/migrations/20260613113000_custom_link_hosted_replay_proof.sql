create or replace function public.prove_share_token_replay_denial(token_input text)
returns table (
  game_invite_id uuid,
  game_title text,
  platform text,
  invite_status text,
  used_at timestamptz,
  uses_count integer,
  max_uses integer,
  replay_denied boolean
)
language plpgsql
security definer
stable
set search_path = public, private, extensions, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  token_row public.share_tokens%rowtype;
  invite_row public.game_invites%rowtype;
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if not private.share_token_envelope_is_valid(token_input) then
    raise exception 'Invite token proof is not available.';
  end if;

  select *
  into token_row
  from public.share_tokens st
  where st.token_hash = encode(digest(btrim(coalesce(token_input, '')), 'sha256'), 'hex');

  if not found then
    raise exception 'Invite token proof is not available.';
  end if;

  select *
  into invite_row
  from public.game_invites gi
  where gi.id = token_row.game_invite_id;

  if not found
    or (
      token_row.created_by is distinct from current_user_id
      and invite_row.receiver_id is distinct from current_user_id
    )
  then
    raise exception 'Invite token proof is not available.';
  end if;

  game_invite_id := invite_row.id;
  game_title := token_row.game_title;
  platform := token_row.platform;
  invite_status := invite_row.status;
  used_at := token_row.used_at;
  uses_count := token_row.uses_count;
  max_uses := token_row.max_uses;
  replay_denied :=
    invite_row.status = 'accepted'
    and token_row.used_at is not null
    and token_row.max_uses is not null
    and token_row.uses_count >= token_row.max_uses;
  return next;
end;
$$;

revoke execute on function public.prove_share_token_replay_denial(text)
  from public, anon, authenticated;
grant execute on function public.prove_share_token_replay_denial(text)
  to authenticated;
