-- Family Sharing: ein User kann bis zu 6 Mitgliedern in seiner Family haben.
-- Pro Game kann ein Familien-Owner eine Library-Lizenz mit allen Mitgliedern teilen.
-- Mitglieder können das Game in den Launcher einsehen und spielen (Steam-Family-Sharing-ähnlich).

create table if not exists public.family_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Family',
  invite_code text unique not null,
  max_members smallint not null default 6 check (max_members between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.family_groups is 'A family of players sharing their owned game library.';

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.family_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (family_id, user_id)
);

comment on table public.family_members is 'Members of a family. Owner is in family_members as well (role=owner).';

create table if not exists public.family_shared_games (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.family_groups(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  shared_by_user_id uuid not null references auth.users(id) on delete cascade,
  is_available boolean not null default true,
  current_user_id uuid references auth.users(id) on delete set null,
  shared_at timestamptz not null default now(),
  unique (family_id, game_id)
);

comment on table public.family_shared_games is 'Games a family-owner shares with their family. If currently borrowed, current_user_id is set.';

-- triggers for updated_at
drop trigger if exists set_family_groups_updated_at on public.family_groups;
create trigger set_family_groups_updated_at
  before update on public.family_groups
  for each row execute function public.set_updated_at();

-- RLS for family_groups
alter table public.family_groups enable row level security;
grant select, insert, update, delete on public.family_groups to authenticated;
drop policy if exists family_groups_owner_self on public.family_groups;
create policy family_groups_owner_self on public.family_groups
  for all to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
drop policy if exists family_groups_member_read on public.family_groups;
create policy family_groups_member_read on public.family_groups
  for select to authenticated
  using (
    exists (select 1 from public.family_members m where m.family_id = id and m.user_id = auth.uid())
  );

-- RLS for family_members
alter table public.family_members enable row level security;
grant select, insert, update, delete on public.family_members to authenticated;
drop policy if exists family_members_self_read on public.family_members;
create policy family_members_self_read on public.family_members
  for select to authenticated
  using (auth.uid() = user_id);
drop policy if exists family_members_owner_manage on public.family_members;
create policy family_members_owner_manage on public.family_members
  for all to authenticated
  using (
    exists (select 1 from public.family_groups g where g.id = family_id and g.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.family_groups g where g.id = family_id and g.owner_id = auth.uid())
  );

-- RLS for family_shared_games
alter table public.family_shared_games enable row level security;
grant select, insert, update, delete on public.family_shared_games to authenticated;
drop policy if exists family_shared_games_owner_manage on public.family_shared_games;
create policy family_shared_games_owner_manage on public.family_shared_games
  for all to authenticated
  using (
    exists (select 1 from public.family_groups g where g.id = family_id and g.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.family_groups g where g.id = family_id and g.owner_id = auth.uid())
  );
drop policy if exists family_shared_games_member_read on public.family_shared_games;
create policy family_shared_games_member_read on public.family_shared_games
  for select to authenticated
  using (
    is_available = true and exists (
      select 1 from public.family_members m where m.family_id = family_shared_games.family_id and m.user_id = auth.uid()
    )
  );

-- Helper function: generate a random 8-char invite code
create or replace function public.generate_family_invite_code() returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
begin
  for i in 1..8 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;
  return result;
end;
$$;

-- Auto-populate invite_code on insert if null
create or replace function public.set_family_invite_code() returns trigger
language plpgsql
as $$
begin
  if new.invite_code is null or new.invite_code = '' then
    new.invite_code := public.generate_family_invite_code();
  end if;
  return new;
end;
$$;

drop trigger if exists set_family_invite_code_trigger on public.family_groups;
create trigger set_family_invite_code_trigger
  before insert on public.family_groups
  for each row execute function public.set_family_invite_code();
