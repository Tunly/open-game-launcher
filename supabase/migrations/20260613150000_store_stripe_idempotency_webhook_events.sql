-- Store Stripe checkout idempotency and signed webhook replay ledger.

alter table public.store_orders
  add column if not exists checkout_attempt_id uuid;

create unique index if not exists store_orders_user_checkout_attempt_id_unique
  on public.store_orders (user_id, checkout_attempt_id)
  where checkout_attempt_id is not null;

comment on column public.store_orders.checkout_attempt_id is
  'Client-generated checkout attempt UUID used to deduplicate Stripe Checkout session creation.';

create table if not exists public.store_stripe_webhook_events (
  id text primary key,
  event_type text not null,
  processing_status text not null default 'processing'
    check (processing_status in ('processing', 'processed', 'failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.store_stripe_webhook_events is
  'Service-role Stripe webhook event ledger used to deduplicate signed event replays.';

create index if not exists store_stripe_webhook_events_status_idx
  on public.store_stripe_webhook_events (processing_status, updated_at desc);

alter table public.store_stripe_webhook_events enable row level security;

revoke all on public.store_stripe_webhook_events from anon, authenticated;
grant all on public.store_stripe_webhook_events to service_role;

do $$ begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_store_stripe_webhook_events_updated_at'
  ) then
    create trigger set_store_stripe_webhook_events_updated_at
      before update on public.store_stripe_webhook_events
      for each row execute function public.set_updated_at();
  end if;
end $$;
