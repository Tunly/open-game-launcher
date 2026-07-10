-- Remove the retired remote/mobile contract only when no user rows or unknown
-- schema dependants remain. Known policies, triggers and RPCs are dropped
-- explicitly so RESTRICT remains the final safety net.

begin;

do $$
declare
  target_oids oid[] := array_remove(array[
    to_regclass('public.remote_install_jobs')::oid,
    to_regclass('public.remote_companion_devices')::oid,
    to_regclass('public.mobile_push_registrations')::oid
  ], null::oid);
  target_oid oid;
  has_user_data boolean;
begin
  foreach target_oid in array target_oids loop
    execute format(
      'lock table %s in access exclusive mode',
      target_oid::regclass
    );
  end loop;

  foreach target_oid in array target_oids loop
    execute format(
      'select exists (select 1 from %s)',
      target_oid::regclass
    ) into has_user_data;

    if has_user_data then
      raise exception
        'Cannot remove remote/mobile companion state while user rows remain in %.',
        target_oid::regclass
        using errcode = '55000';
    end if;
  end loop;

  if exists (
    select 1
    from pg_constraint dependency
    where dependency.confrelid = any(target_oids)
      and not (dependency.conrelid = any(target_oids))
  ) or exists (
    select 1
    from pg_depend dependency
    join pg_rewrite rewrite
      on dependency.classid = 'pg_rewrite'::regclass
     and rewrite.oid = dependency.objid
    where dependency.refclassid = 'pg_class'::regclass
      and dependency.refobjid = any(target_oids)
      and not (rewrite.ev_class = any(target_oids))
  ) then
    raise exception
      'Cannot remove remote/mobile companion state while unknown schema dependencies remain.'
      using errcode = '2BP01';
  end if;
end
$$;

do $$
begin
  if to_regclass('public.remote_install_jobs') is not null then
    execute 'drop trigger if exists enforce_remote_install_jobs_terminal_immutability on public.remote_install_jobs';
    execute 'drop trigger if exists set_remote_install_jobs_updated_at on public.remote_install_jobs';
    execute 'drop policy if exists remote_install_jobs_select_owner on public.remote_install_jobs';
  end if;

  if to_regclass('public.remote_companion_devices') is not null then
    execute 'drop trigger if exists set_remote_companion_devices_updated_at on public.remote_companion_devices';
    execute 'drop policy if exists remote_companion_devices_select_owner on public.remote_companion_devices';
  end if;

  if to_regclass('public.mobile_push_registrations') is not null then
    execute 'drop trigger if exists set_mobile_push_registrations_updated_at on public.mobile_push_registrations';
    execute 'drop policy if exists mobile_push_registrations_select_owner on public.mobile_push_registrations';
    execute 'drop policy if exists mobile_push_registrations_insert_owner on public.mobile_push_registrations';
    execute 'drop policy if exists mobile_push_registrations_update_owner on public.mobile_push_registrations';
    execute 'drop policy if exists mobile_push_registrations_delete_owner on public.mobile_push_registrations';
  end if;
end
$$;

drop function if exists public.update_remote_install_job_status(uuid, text, uuid, text, text, text) restrict;
drop function if exists public.claim_remote_install_jobs(uuid, text, integer) restrict;
drop function if exists public.enqueue_remote_install_job(uuid, uuid, uuid, text, text, text, text, jsonb) restrict;
drop function if exists public.record_remote_companion_ping(uuid, text) restrict;
drop function if exists public.redeem_remote_companion_pairing(text, text, text) restrict;
drop function if exists public.create_remote_companion_pairing(text, text, integer) restrict;
drop function if exists public.enforce_remote_install_job_terminal_immutability() restrict;

drop table if exists public.remote_install_jobs restrict;
drop table if exists public.remote_companion_devices restrict;
drop table if exists public.mobile_push_registrations restrict;

commit;
