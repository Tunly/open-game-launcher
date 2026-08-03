-- Legacy mod rows contain per-user installation state and must never be
-- exposed as a public catalog. Keep the authenticated owner policy intact.

begin;

revoke all privileges on table public.mods from anon;
revoke select on table public.mods from public;

drop policy if exists mods_read_public on public.mods;

alter table public.mods enable row level security;

commit;
