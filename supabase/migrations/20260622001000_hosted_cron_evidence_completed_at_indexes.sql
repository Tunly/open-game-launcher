create index if not exists store_price_drop_notification_runs_trigger_completed_at_idx
  on public.store_price_drop_notification_runs (trigger_source, completed_at desc);

create index if not exists presence_poll_runs_trigger_source_completed_at_idx
  on public.presence_poll_runs (trigger_source, completed_at desc);

create index if not exists account_deletion_processor_runs_trigger_completed_at_idx
  on public.account_deletion_processor_runs (trigger_source, completed_at desc);
