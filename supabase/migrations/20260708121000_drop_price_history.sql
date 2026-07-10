-- Price history is no longer a Store feature. Preserve any populated history
-- or unknown schema dependant instead of deleting it implicitly.

begin;

do $$
declare
  target_oid oid := to_regclass('public.price_history')::oid;
  has_data boolean;
begin
  if target_oid is not null then
    execute format(
      'lock table %s in access exclusive mode',
      target_oid::regclass
    );
    execute format(
      'select exists (select 1 from %s)',
      target_oid::regclass
    ) into has_data;

    if has_data then
      raise exception
        'Cannot remove price history while recorded price rows remain.'
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
        'Cannot remove price history while unknown schema dependencies remain.'
        using errcode = '2BP01';
    end if;

    execute 'drop policy if exists price_history_read_public on public.price_history';
    execute 'revoke all on table public.price_history from anon, authenticated';
  end if;
end
$$;

drop table if exists public.price_history restrict;

commit;
