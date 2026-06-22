create extension if not exists pgcrypto;

create table if not exists public.share_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  token_hint text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  game_invite_id uuid not null references public.game_invites(id) on delete cascade,
  game_title text not null,
  platform text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  uses_count integer not null default 0,
  max_uses integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint share_tokens_game_title_check check (char_length(btrim(game_title)) between 1 and 160),
  constraint share_tokens_platform_length_check check (platform is null or char_length(platform) <= 32),
  constraint share_tokens_uses_count_check check (uses_count >= 0),
  constraint share_tokens_max_uses_check check (max_uses is null or max_uses > 0),
  constraint share_tokens_expiry_check check (expires_at > created_at)
);

comment on table public.share_tokens is
  'RLS-protected hashed public share tokens. Plaintext tokens are returned only once by RPC and are never stored.';

create index if not exists share_tokens_active_hash_idx
  on public.share_tokens (token_hash)
  where revoked_at is null;

create index if not exists share_tokens_creator_invite_idx
  on public.share_tokens (created_by, game_invite_id, created_at desc);

drop trigger if exists set_share_tokens_updated_at on public.share_tokens;
create trigger set_share_tokens_updated_at
  before update on public.share_tokens
  for each row execute function public.set_updated_at();

alter table public.share_tokens enable row level security;

revoke all on public.share_tokens from public, anon, authenticated;
grant all on public.share_tokens to service_role;

create policy share_tokens_select_owner
  on public.share_tokens
  for select
  to authenticated
  using (created_by = auth.uid());

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
set search_path = public, extensions, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  invite_row public.game_invites%rowtype;
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
    generated_token := 'ogl_' || translate(rtrim(encode(gen_random_bytes(32), 'base64'), '='), '+/', '-_');
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
        left(generated_token, 10),
        current_user_id,
        invite_row.id,
        invite_row.game_title,
        nullif(btrim(platform_input), ''),
        effective_expires_at,
        1
      );

      token := generated_token;
      token_hint := left(generated_token, 10);
      expires_at := effective_expires_at;
      game_title := invite_row.game_title;
      platform := nullif(btrim(platform_input), '');
      return next;
      return;
    exception
      when unique_violation then
        -- Extremely unlikely token collision; retry with fresh random bytes.
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
set search_path = public, extensions, pg_temp
as $$
  select st.game_invite_id, st.game_title, st.platform, st.expires_at
  from public.share_tokens st
  join public.game_invites gi on gi.id = st.game_invite_id
  where st.token_hash = encode(digest(btrim(coalesce(token_input, '')), 'sha256'), 'hex')
    and st.revoked_at is null
    and st.expires_at > now()
    and (st.max_uses is null or st.uses_count < st.max_uses)
    and gi.status = 'pending'
    and gi.expires_at > now()
  limit 1;
$$;

revoke execute on function public.create_game_invite_share_token(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.create_game_invite_share_token(uuid, text, integer)
  to authenticated;

revoke execute on function public.resolve_share_token(text)
  from public, anon, authenticated;
grant execute on function public.resolve_share_token(text)
  to anon, authenticated;
