create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists private.share_token_signing_keys (
  kid text primary key,
  key_secret bytea not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint share_token_signing_keys_kid_check check (char_length(btrim(kid)) between 1 and 64)
);

revoke all on private.share_token_signing_keys from public, anon, authenticated;
grant all on private.share_token_signing_keys to service_role;

insert into private.share_token_signing_keys (kid, key_secret)
values ('share-token-v1', extensions.gen_random_bytes(32))
on conflict (kid) do nothing;

create or replace function private.share_token_base64url(value bytea)
returns text
language sql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
  select translate(
    rtrim(regexp_replace(encode(value, 'base64'), '\s', '', 'g'), '='),
    '+/',
    '-_'
  );
$$;

create or replace function private.share_token_sign(
  signing_input text,
  kid_input text default 'share-token-v1'
)
returns text
language sql
stable
strict
security definer
set search_path = private, public, extensions, pg_temp
as $$
  select private.share_token_base64url(
    hmac(convert_to(signing_input, 'UTF8'), key_secret, 'sha256')
  )
  from private.share_token_signing_keys
  where kid = kid_input
    and active = true
  limit 1;
$$;

create or replace function private.share_token_hint(token_input text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, pg_temp
as $$
  select left(token_input, 10) || '...' || right(token_input, 6);
$$;

create or replace function private.share_token_envelope_is_valid(token_input text)
returns boolean
language plpgsql
stable
security definer
set search_path = private, public, extensions, pg_temp
as $$
declare
  trimmed_token text := btrim(coalesce(token_input, ''));
  envelope_body text;
  envelope_parts text[];
  expected_signature text;
begin
  if trimmed_token = '' then
    return false;
  end if;

  -- Legacy opaque share tokens had no JWT-like sections. Keep them redeemable.
  if position('.' in trimmed_token) = 0 then
    return true;
  end if;

  if left(trimmed_token, 4) <> 'ogl_' then
    return false;
  end if;

  envelope_body := substring(trimmed_token from 5);
  envelope_parts := string_to_array(envelope_body, '.');

  if array_length(envelope_parts, 1) <> 3
    or coalesce(envelope_parts[1], '') = ''
    or coalesce(envelope_parts[2], '') = ''
    or coalesce(envelope_parts[3], '') = ''
  then
    return false;
  end if;

  expected_signature := private.share_token_sign(envelope_parts[1] || '.' || envelope_parts[2]);
  return expected_signature is not null and expected_signature = envelope_parts[3];
end;
$$;

revoke all on function private.share_token_base64url(bytea) from public, anon, authenticated;
revoke all on function private.share_token_sign(text, text) from public, anon, authenticated;
revoke all on function private.share_token_hint(text) from public, anon, authenticated;
revoke all on function private.share_token_envelope_is_valid(text) from public, anon, authenticated;

create or replace function public.create_game_invite_share_token(
  invite_id_input uuid,
  platform_input text default null,
  ttl_seconds_input integer default 1800
)
returns table (
  token text,
  token_hint text,
  expires_at timestamptz,
  game_title text,
  platform text
)
language plpgsql
security definer
volatile
set search_path = public, private, extensions, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  invite_row public.game_invites%rowtype;
  generated_header text;
  generated_payload text;
  generated_signature text;
  generated_signing_input text;
  generated_token text;
  generated_hash text;
  effective_ttl_seconds integer;
  effective_expires_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  select *
  into invite_row
  from public.game_invites gi
  where gi.id = invite_id_input
    and gi.sender_id = current_user_id
    and gi.status = 'pending'
    and gi.expires_at > now();

  if not found then
    raise exception 'Invite is not shareable.';
  end if;

  effective_ttl_seconds := greatest(300, least(coalesce(ttl_seconds_input, 1800), 604800));
  effective_expires_at := least(invite_row.expires_at, now() + make_interval(secs => effective_ttl_seconds));

  for attempt in 1..5 loop
    generated_header := private.share_token_base64url(convert_to(jsonb_build_object(
      'typ', 'ogl-share',
      'alg', 'HS256',
      'kid', 'share-token-v1'
    )::text, 'UTF8'));
    generated_payload := private.share_token_base64url(convert_to(jsonb_build_object(
      'v', 1,
      'jti', gen_random_uuid()::text,
      'iat', extract(epoch from now())::bigint,
      'exp', extract(epoch from effective_expires_at)::bigint
    )::text, 'UTF8'));
    generated_signing_input := generated_header || '.' || generated_payload;
    generated_signature := private.share_token_sign(generated_signing_input);

    if generated_signature is null then
      raise exception 'Share token signing key is not available.';
    end if;

    generated_token := 'ogl_' || generated_signing_input || '.' || generated_signature;
    generated_hash := encode(digest(generated_token, 'sha256'), 'hex');

    begin
      insert into public.share_tokens (
        token_hash,
        token_hint,
        created_by,
        game_invite_id,
        game_title,
        platform,
        expires_at,
        max_uses
      )
      values (
        generated_hash,
        private.share_token_hint(generated_token),
        current_user_id,
        invite_row.id,
        invite_row.game_title,
        nullif(btrim(platform_input), ''),
        effective_expires_at,
        1
      );

      token := generated_token;
      token_hint := private.share_token_hint(generated_token);
      expires_at := effective_expires_at;
      game_title := invite_row.game_title;
      platform := nullif(btrim(platform_input), '');
      return next;
      return;
    exception
      when unique_violation then
        -- Extremely unlikely token collision; retry with fresh envelope claims.
    end;
  end loop;

  raise exception 'Could not create share token.';
end;
$$;

create or replace function public.resolve_share_token(token_input text)
returns table (
  game_invite_id uuid,
  game_title text,
  platform text,
  expires_at timestamptz
)
language sql
security definer
stable
set search_path = public, private, extensions, pg_temp
as $$
  select st.game_invite_id, st.game_title, st.platform, st.expires_at
  from public.share_tokens st
  join public.game_invites gi on gi.id = st.game_invite_id
  where private.share_token_envelope_is_valid(token_input)
    and st.token_hash = encode(digest(btrim(coalesce(token_input, '')), 'sha256'), 'hex')
    and st.revoked_at is null
    and st.expires_at > now()
    and (st.max_uses is null or st.uses_count < st.max_uses)
    and gi.status = 'pending'
    and gi.expires_at > now()
  limit 1;
$$;

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

revoke execute on function public.create_game_invite_share_token(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.create_game_invite_share_token(uuid, text, integer)
  to authenticated;

revoke execute on function public.resolve_share_token(text)
  from public, anon, authenticated;
grant execute on function public.resolve_share_token(text)
  to anon, authenticated;

revoke execute on function public.redeem_share_token(text)
  from public, anon, authenticated;
grant execute on function public.redeem_share_token(text)
  to authenticated;
