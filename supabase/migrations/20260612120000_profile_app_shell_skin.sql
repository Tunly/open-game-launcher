-- Browser-local shell skins can sync as a small profile preference.
-- Marketplace/custom skins are intentionally out of scope for this column.

alter table public.profiles
  add column if not exists app_shell_skin text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_app_shell_skin_check'
  ) then
    alter table public.profiles
      add constraint profiles_app_shell_skin_check
      check (
        app_shell_skin is null
        or app_shell_skin in ('retro-paper', 'redline-print', 'teal-print')
      );
  end if;
end
$$;

grant update (app_shell_skin) on public.profiles to authenticated;
