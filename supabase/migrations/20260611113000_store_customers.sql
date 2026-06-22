-- Persist Stripe customer IDs outside public profile metadata.

create table if not exists public.store_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.store_customers is
  'Private mapping from Supabase users to Stripe customer IDs for hosted Checkout.';

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_store_customers_updated_at') then
    create trigger set_store_customers_updated_at
      before update on public.store_customers
      for each row execute function public.set_updated_at();
  end if;
end $$;

grant select on public.store_customers to authenticated;

alter table public.store_customers enable row level security;

drop policy if exists store_customers_select_own on public.store_customers;
create policy store_customers_select_own on public.store_customers
  for select to authenticated
  using (auth.uid() = user_id);
