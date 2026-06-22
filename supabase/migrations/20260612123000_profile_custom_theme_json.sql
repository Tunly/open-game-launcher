-- Store one validated custom theme exchange payload as an owner-managed profile draft.
-- This keeps imported custom themes separate from the public profile_themes catalog.

alter table public.profiles
  add column if not exists custom_theme_json jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_custom_theme_json_object_check'
  ) then
    alter table public.profiles
      add constraint profiles_custom_theme_json_object_check
      check (
        custom_theme_json is null
        or jsonb_typeof(custom_theme_json) = 'object'
      );
  end if;
end $$;

grant update (custom_theme_json) on public.profiles to authenticated;
