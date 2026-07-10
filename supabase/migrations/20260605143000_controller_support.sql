-- Steam-like controller layouts: per-game layouts, default layouts and community-shared presets.

create table if not exists public.controller_layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text,
  name text not null,
  controller_type text not null default 'generic' check (controller_type in ('xbox', 'playstation', 'switch', 'steam', 'generic')),
  template text not null default 'gamepad' check (template in ('gamepad', 'gamepadGyro', 'keyboardMouse', 'disabled')),
  bindings jsonb not null default '[]'::jsonb,
  gyro_enabled boolean not null default false,
  haptics_enabled boolean not null default true,
  is_community boolean not null default false,
  is_default boolean not null default false,
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint controller_layouts_bindings_array check (jsonb_typeof(bindings) = 'array')
);
comment on table public.controller_layouts is 'Per-user and optional community controller layouts, inspired by Steam Input.';
comment on column public.controller_layouts.game_id is 'Null means global/default layout. Text matches local launcher game ids.';
create index if not exists controller_layouts_user_game_idx on public.controller_layouts(user_id, game_id);
create index if not exists controller_layouts_community_idx on public.controller_layouts(game_id, controller_type) where is_community = true;
create unique index if not exists controller_layouts_one_default_per_scope_idx
  on public.controller_layouts(user_id, coalesce(game_id, '__global__'), controller_type)
  where is_default = true;
create or replace function public.touch_controller_layouts_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists controller_layouts_touch_updated_at on public.controller_layouts;
create trigger controller_layouts_touch_updated_at
before update on public.controller_layouts
for each row execute function public.touch_controller_layouts_updated_at();
grant select, insert, update, delete on public.controller_layouts to authenticated;
grant select on public.controller_layouts to anon;
alter table public.controller_layouts enable row level security;
create policy controller_layouts_read_own_or_community
on public.controller_layouts
for select
to anon, authenticated
using (is_community = true or auth.uid() = user_id);
create policy controller_layouts_insert_own
on public.controller_layouts
for insert
to authenticated
with check (auth.uid() = user_id);
create policy controller_layouts_update_own
on public.controller_layouts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
create policy controller_layouts_delete_own
on public.controller_layouts
for delete
to authenticated
using (auth.uid() = user_id);
