-- Stripe refund execution metadata for store order refund requests.

alter table public.store_order_refund_requests
  add column if not exists provider text not null default 'stripe',
  add column if not exists provider_refund_id text,
  add column if not exists provider_refund_status text,
  add column if not exists refund_amount_cents integer,
  add column if not exists failure_reason text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'store_order_refund_requests_refund_amount_nonnegative'
  ) then
    alter table public.store_order_refund_requests
      add constraint store_order_refund_requests_refund_amount_nonnegative
      check (refund_amount_cents is null or refund_amount_cents >= 0);
  end if;
end $$;

create unique index if not exists store_order_refund_requests_provider_refund_unique
  on public.store_order_refund_requests (provider, provider_refund_id)
  where provider_refund_id is not null;

comment on table public.store_order_refund_requests is
  'Customer refund requests and Stripe refund execution metadata for paid or fulfilled store orders.';

comment on column public.store_order_refund_requests.provider_refund_id is
  'Provider refund identifier, for example Stripe refund id re_*.';

comment on column public.store_order_refund_requests.provider_refund_status is
  'Latest provider-side refund status, for example pending, succeeded, failed, or canceled.';
