-- Store review abuse reports, refund support requests, and invoice references.

alter table public.store_reviews
  add column if not exists is_hidden_by_reports boolean not null default false,
  add column if not exists hidden_by_reports_at timestamptz;

create index if not exists store_reviews_visible_product_created_idx
  on public.store_reviews (product_id, created_at desc)
  where is_published = true and is_hidden_by_reports = false;

create or replace function public.refresh_store_product_review_stats(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.store_products product
  set
    rating = stats.rating,
    ratings_count = stats.ratings_count,
    updated_at = now()
  from (
    select
      case
        when count(*) = 0 then null
        else round(avg(review.rating)::numeric, 1)
      end as rating,
      count(*)::integer as ratings_count
    from public.store_reviews review
    where review.product_id = p_product_id
      and review.is_published = true
      and review.is_hidden_by_reports = false
  ) stats
  where product.id = p_product_id;
end;
$$;

revoke execute on function public.refresh_store_product_review_stats(uuid)
  from public, anon, authenticated;

drop policy if exists store_reviews_read_published_product on public.store_reviews;
create policy store_reviews_read_published_product
  on public.store_reviews
  for select to anon, authenticated
  using (
    is_published = true
    and is_hidden_by_reports = false
    and exists (
      select 1
      from public.store_products product
      where product.id = store_reviews.product_id
        and product.status = 'published'
    )
  );

create table if not exists public.store_review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.store_reviews(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (
    reason in ('spam', 'harassment', 'hate_or_abuse', 'spoilers', 'off_topic', 'fraud', 'other')
  ),
  details text,
  status text not null default 'active' check (status in ('active', 'dismissed', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_review_reports_unique_reporter unique (review_id, reporter_user_id),
  constraint store_review_reports_details_length_check
    check (details is null or char_length(details) <= 2000)
);

comment on table public.store_review_reports is
  'Authenticated abuse reports for store reviews. Three active distinct reports hide a review.';

create index if not exists store_review_reports_review_status_idx
  on public.store_review_reports (review_id, status);

create index if not exists store_review_reports_reporter_idx
  on public.store_review_reports (reporter_user_id, created_at desc);

create or replace function public.sync_store_review_report_hide_state(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  active_report_count integer;
  should_hide boolean;
begin
  select count(distinct report.reporter_user_id)::integer
  into active_report_count
  from public.store_review_reports report
  where report.review_id = p_review_id
    and report.status = 'active';

  should_hide := active_report_count >= 3;

  update public.store_reviews review
  set
    is_hidden_by_reports = should_hide,
    hidden_by_reports_at = case
      when should_hide then coalesce(review.hidden_by_reports_at, now())
      else null
    end,
    updated_at = now()
  where review.id = p_review_id
    and (
      review.is_hidden_by_reports is distinct from should_hide
      or (should_hide and review.hidden_by_reports_at is null)
    );
end;
$$;

revoke execute on function public.sync_store_review_report_hide_state(uuid)
  from public, anon, authenticated;

create or replace function public.sync_store_review_report_hide_state_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_store_review_report_hide_state(old.review_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.review_id is distinct from new.review_id then
    perform public.sync_store_review_report_hide_state(old.review_id);
  end if;

  perform public.sync_store_review_report_hide_state(new.review_id);
  return new;
end;
$$;

revoke execute on function public.sync_store_review_report_hide_state_trigger()
  from public, anon, authenticated;

create or replace function public.prevent_store_review_report_hide_tampering()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated'
    and (
      new.is_hidden_by_reports is distinct from old.is_hidden_by_reports
      or new.hidden_by_reports_at is distinct from old.hidden_by_reports_at
    )
  then
    raise exception 'Review report moderation fields cannot be changed by review owners';
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_store_review_report_hide_tampering()
  from public, anon, authenticated;

create or replace function public.enforce_store_review_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.store_review_reports report
    where report.reporter_user_id = new.reporter_user_id
      and report.created_at >= now() - interval '1 hour'
      and report.status = 'active'
  ) >= 5 then
    raise exception 'Store review report rate limit exceeded';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_store_review_report_rate_limit()
  from public, anon, authenticated;

do $$ begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_store_review_reports_updated_at'
      and tgrelid = 'public.store_review_reports'::regclass
  ) then
    create trigger set_store_review_reports_updated_at
      before update on public.store_review_reports
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'sync_store_review_report_hide_state_after_write'
      and tgrelid = 'public.store_review_reports'::regclass
  ) then
    create trigger sync_store_review_report_hide_state_after_write
      after insert or update or delete on public.store_review_reports
      for each row execute function public.sync_store_review_report_hide_state_trigger();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'enforce_store_review_report_rate_limit_before_insert'
      and tgrelid = 'public.store_review_reports'::regclass
  ) then
    create trigger enforce_store_review_report_rate_limit_before_insert
      before insert on public.store_review_reports
      for each row execute function public.enforce_store_review_report_rate_limit();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'prevent_store_review_report_hide_tampering_before_update'
      and tgrelid = 'public.store_reviews'::regclass
  ) then
    create trigger prevent_store_review_report_hide_tampering_before_update
      before update of is_hidden_by_reports, hidden_by_reports_at on public.store_reviews
      for each row execute function public.prevent_store_review_report_hide_tampering();
  end if;
end $$;

grant select, insert on public.store_review_reports to authenticated;
grant all on public.store_review_reports to service_role;

alter table public.store_review_reports enable row level security;

drop policy if exists store_review_reports_owner_read on public.store_review_reports;
create policy store_review_reports_owner_read
  on public.store_review_reports
  for select to authenticated
  using (auth.uid() = reporter_user_id);

drop policy if exists store_review_reports_owner_insert on public.store_review_reports;
create policy store_review_reports_owner_insert
  on public.store_review_reports
  for insert to authenticated
  with check (
    auth.uid() = reporter_user_id
    and status = 'active'
    and exists (
      select 1
      from public.store_reviews review
      where review.id = store_review_reports.review_id
        and review.user_id <> auth.uid()
        and review.is_published = true
        and review.is_hidden_by_reports = false
    )
  );

create table if not exists public.store_order_refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 80),
  details text,
  status text not null default 'requested' check (
    status in ('requested', 'reviewing', 'approved', 'rejected', 'cancelled', 'processed')
  ),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  processed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_order_refund_requests_order_unique unique (order_id),
  constraint store_order_refund_requests_details_length_check
    check (details is null or char_length(details) <= 2000)
);

comment on table public.store_order_refund_requests is
  'Customer support refund requests for paid or fulfilled store orders. This does not issue Stripe refunds.';

create index if not exists store_order_refund_requests_user_idx
  on public.store_order_refund_requests (user_id, requested_at desc);

create table if not exists public.store_order_invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'stripe',
  provider_invoice_id text,
  invoice_number text,
  status text not null default 'pending' check (
    status in ('pending', 'available', 'unavailable', 'void')
  ),
  hosted_invoice_url text,
  pdf_url text,
  metadata jsonb not null default '{}'::jsonb,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_order_invoices_order_unique unique (order_id)
);

comment on table public.store_order_invoices is
  'Invoice references and metadata for store orders. PDF URLs are only shown when present.';

create unique index if not exists store_order_invoices_provider_invoice_unique
  on public.store_order_invoices (provider, provider_invoice_id)
  where provider_invoice_id is not null;

create index if not exists store_order_invoices_user_idx
  on public.store_order_invoices (user_id, created_at desc);

create or replace function public.ensure_store_order_support_user_matches_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.store_orders store_order
    where store_order.id = new.order_id
      and store_order.user_id = new.user_id
  ) then
    raise exception 'Store order support record user does not match order owner';
  end if;

  return new;
end;
$$;

revoke execute on function public.ensure_store_order_support_user_matches_order()
  from public, anon, authenticated;

do $$ begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_store_order_refund_requests_updated_at'
      and tgrelid = 'public.store_order_refund_requests'::regclass
  ) then
    create trigger set_store_order_refund_requests_updated_at
      before update on public.store_order_refund_requests
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'ensure_store_order_refund_request_owner_before_write'
      and tgrelid = 'public.store_order_refund_requests'::regclass
  ) then
    create trigger ensure_store_order_refund_request_owner_before_write
      before insert or update of order_id, user_id on public.store_order_refund_requests
      for each row execute function public.ensure_store_order_support_user_matches_order();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_store_order_invoices_updated_at'
      and tgrelid = 'public.store_order_invoices'::regclass
  ) then
    create trigger set_store_order_invoices_updated_at
      before update on public.store_order_invoices
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'ensure_store_order_invoice_owner_before_write'
      and tgrelid = 'public.store_order_invoices'::regclass
  ) then
    create trigger ensure_store_order_invoice_owner_before_write
      before insert or update of order_id, user_id on public.store_order_invoices
      for each row execute function public.ensure_store_order_support_user_matches_order();
  end if;
end $$;

grant select, insert on public.store_order_refund_requests to authenticated;
grant all on public.store_order_refund_requests to service_role;
grant select on public.store_order_invoices to authenticated;
grant all on public.store_order_invoices to service_role;

alter table public.store_order_refund_requests enable row level security;
alter table public.store_order_invoices enable row level security;

drop policy if exists store_order_refund_requests_owner_read on public.store_order_refund_requests;
create policy store_order_refund_requests_owner_read
  on public.store_order_refund_requests
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists store_order_refund_requests_owner_insert on public.store_order_refund_requests;
create policy store_order_refund_requests_owner_insert
  on public.store_order_refund_requests
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and status = 'requested'
    and reviewed_at is null
    and processed_at is null
    and cancelled_at is null
    and exists (
      select 1
      from public.store_orders store_order
      where store_order.id = store_order_refund_requests.order_id
        and store_order.user_id = auth.uid()
        and store_order.status in ('paid', 'fulfilled')
        and store_order.total_cents > 0
    )
  );

drop policy if exists store_order_invoices_owner_read on public.store_order_invoices;
create policy store_order_invoices_owner_read
  on public.store_order_invoices
  for select to authenticated
  using (auth.uid() = user_id);
