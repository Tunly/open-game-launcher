-- Keep migration history aligned with the linked project while completing the
-- already-finished removal of the controller-layout feature from the launcher.
-- Refuse to discard layouts or unknown schema dependants silently.

begin;

do $$
declare
  target_oid oid := to_regclass('public.controller_layouts')::oid;
  has_user_data boolean;
begin
  if target_oid is not null then
    execute format(
      'lock table %s in access exclusive mode',
      target_oid::regclass
    );
    execute format(
      'select exists (select 1 from %s)',
      target_oid::regclass
    ) into has_user_data;

    if has_user_data then
      raise exception
        'Cannot remove controller layouts while user layout rows remain.'
        using errcode = '55000';
    end if;

    if exists (
      select 1
      from pg_constraint dependency
      where dependency.confrelid = target_oid
        and dependency.conrelid <> target_oid
    ) or exists (
      select 1
      from pg_depend dependency
      join pg_rewrite rewrite
        on dependency.classid = 'pg_rewrite'::regclass
       and rewrite.oid = dependency.objid
      where dependency.refclassid = 'pg_class'::regclass
        and dependency.refobjid = target_oid
        and rewrite.ev_class <> target_oid
    ) then
      raise exception
        'Cannot remove controller layouts while unknown schema dependencies remain.'
        using errcode = '2BP01';
    end if;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.controller_layouts') is not null then
    execute 'drop trigger if exists controller_layouts_touch_updated_at on public.controller_layouts';
    execute 'drop policy if exists controller_layouts_read_own_or_community on public.controller_layouts';
    execute 'drop policy if exists controller_layouts_insert_own on public.controller_layouts';
    execute 'drop policy if exists controller_layouts_update_own on public.controller_layouts';
    execute 'drop policy if exists controller_layouts_delete_own on public.controller_layouts';
  end if;
end
$$;

drop function if exists public.touch_controller_layouts_updated_at() restrict;
drop table if exists public.controller_layouts restrict;

commit;
