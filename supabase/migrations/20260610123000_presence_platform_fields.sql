-- Platform-aware presence for external launcher polling.
alter table public.user_presence
  add column if not exists platform text,
  add column if not exists platform_source text,
  add column if not exists platform_game_id text,
  add column if not exists platform_last_polled_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_presence_platform_check'
      and conrelid = 'public.user_presence'::regclass
  ) then
    alter table public.user_presence
      add constraint user_presence_platform_check
      check (
        platform is null
        or platform in ('steam', 'epic', 'gog', 'ea', 'xbox', 'battlenet', 'ubisoft', 'og')
      );
  end if;
end $$;

create index if not exists user_presence_platform_last_polled_idx
  on public.user_presence (platform, platform_last_polled_at desc);

comment on column public.user_presence.platform is
  'Launcher/platform that produced the visible game presence, for example steam or epic.';
comment on column public.user_presence.platform_source is
  'Provider or integration source used to fetch platform presence, for example steam_web_api.';
comment on column public.user_presence.platform_game_id is
  'External platform game identifier when the provider exposes one.';
comment on column public.user_presence.platform_last_polled_at is
  'Last time trusted backend polling refreshed platform presence for this row.';
