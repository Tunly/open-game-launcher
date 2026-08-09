-- ============================================================================
-- Store catalog sync cron schedule
-- ============================================================================
-- Schedules the `sync-store-catalog` Edge Function to run every 6 hours via
-- The function enriches ITAD-discovered games with IGDB metadata and stores the normalized catalog.
--
-- MANUAL SETUP REQUIRED (run once in the SQL editor as a superuser, or via
-- the Supabase CLI against the hosted project, before this job can fire):
--
--   alter database postgres set app.settings.project_ref = '<your-project-ref>';
--   alter database postgres set app.settings.service_role_key = '<your-service-role-key>';
--
-- The service role key is a secret — do NOT commit it into this migration.
-- On hosted Supabase projects, pg_cron and pg_net must also be enabled in
-- Database > Extensions (the `create extension` statements below are no-ops
-- there unless run as a privileged role).
--
-- To verify the schedule after applying:
--   select * from cron.job where jobname = 'sync-store-catalog';
-- To inspect recent runs:
--   select * from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'sync-store-catalog')
--   order by start_time desc limit 10;
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any pre-existing schedule with the same name so re-applying this
-- migration is idempotent (cron.schedule would otherwise create a duplicate).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-store-catalog') then
    perform cron.unschedule('sync-store-catalog');
  end if;
end;
$$;

-- Schedule store catalog sync every 6 hours (at minute 0 of every 6th hour).
select cron.schedule(
  'sync-store-catalog',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://' || current_setting('app.settings.project_ref') || '.supabase.co/functions/v1/sync-store-catalog',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
