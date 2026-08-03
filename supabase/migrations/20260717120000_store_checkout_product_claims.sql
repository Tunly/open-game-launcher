-- Serialize Store purchases per user/product before a Stripe Checkout Session
-- can be created. A checkout claim survives payment processing and is released
-- only when the owning order reaches a terminal non-owning state.

create table if not exists public.store_checkout_product_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.store_products(id) on delete cascade,
  order_id uuid not null references public.store_orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id),
  unique (order_id, product_id)
);

comment on table public.store_checkout_product_claims is
  'Service-owned serialization claims that prevent parallel Stripe purchases for the same user and Store product.';

alter table public.store_checkout_product_claims enable row level security;
revoke all on public.store_checkout_product_claims from anon, authenticated;
grant all on public.store_checkout_product_claims to service_role;

-- Payment identifiers are canonical refund lookup keys and must never resolve
-- to more than one order.
create unique index if not exists store_orders_stripe_payment_intent_unique
  on public.store_orders (stripe_payment_intent)
  where stripe_payment_intent is not null;

-- Preserve ownership represented by already-issued licenses first.
insert into public.store_checkout_product_claims (user_id, product_id, order_id)
select distinct on (license.user_id, license.product_id)
  license.user_id,
  license.product_id,
  license.order_id
from public.store_licenses as license
join public.store_orders as store_order
  on store_order.id = license.order_id
where license.is_revoked = false
  and license.order_id is not null
  and store_order.status in ('paid', 'fulfilled')
order by
  license.user_id,
  license.product_id,
  case store_order.status when 'fulfilled' then 0 else 1 end,
  license.created_at
on conflict (user_id, product_id) do nothing;

-- Then preserve in-flight and paid orders that have not issued a license yet.
insert into public.store_checkout_product_claims (user_id, product_id, order_id)
select distinct on (store_order.user_id, order_item.product_id)
  store_order.user_id,
  order_item.product_id,
  store_order.id
from public.store_orders as store_order
join public.store_order_items as order_item
  on order_item.order_id = store_order.id
where store_order.status in ('pending', 'paid', 'fulfilled')
order by
  store_order.user_id,
  order_item.product_id,
  case store_order.status
    when 'fulfilled' then 0
    when 'paid' then 1
    else 2
  end,
  store_order.created_at
on conflict (user_id, product_id) do nothing;

create or replace function private.claim_store_order_item()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  owner_id uuid;
  order_status text;
begin
  select store_order.user_id, store_order.status
  into owner_id, order_status
  from public.store_orders as store_order
  where store_order.id = new.order_id
  for update;

  if owner_id is null then
    raise exception 'Store order does not exist'
      using errcode = '23503';
  end if;

  if order_status <> 'pending' then
    raise exception 'Store order items can only be added to pending orders'
      using errcode = '23514';
  end if;

  -- A Stripe API transport failure may have created a Session even when the
  -- function never received its id. Keep that claim beyond Stripe's maximum
  -- Session lifetime, then reclaim only unattached, still-pending orders.
  delete from public.store_checkout_product_claims as stale_claim
  using public.store_orders as stale_order
  where stale_claim.user_id = owner_id
    and stale_claim.product_id = new.product_id
    and stale_order.id = stale_claim.order_id
    and stale_order.status = 'pending'
    and stale_order.stripe_session_id is null
    and stale_order.created_at < now() - interval '48 hours';

  if exists (
    select 1
    from public.store_licenses as license
    where license.user_id = owner_id
      and license.product_id = new.product_id
      and license.is_revoked = false
      and license.order_id is distinct from new.order_id
  ) then
    raise exception 'Store product is already owned by this user'
      using errcode = '23505',
            constraint = 'store_checkout_product_claims_user_product_key';
  end if;

  insert into public.store_checkout_product_claims (
    user_id,
    product_id,
    order_id
  ) values (
    owner_id,
    new.product_id,
    new.order_id
  );

  return new;
exception
  when unique_violation then
    raise exception 'Store product is already reserved or owned by this user'
      using errcode = '23505',
            constraint = 'store_checkout_product_claims_user_product_key';
end;
$$;

revoke execute on function private.claim_store_order_item()
  from public, anon, authenticated;

drop trigger if exists claim_store_order_item_before_insert
  on public.store_order_items;
create trigger claim_store_order_item_before_insert
  before insert on public.store_order_items
  for each row execute function private.claim_store_order_item();

create or replace function private.guard_store_order_payment_transition()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'refunded'
    or (old.status = 'fulfilled' and new.status <> 'refunded')
    or (old.status = 'paid' and new.status in ('pending', 'failed', 'expired'))
  then
    raise exception 'Store order payment state cannot move backwards'
      using errcode = '23514';
  end if;

  if new.status in ('paid', 'fulfilled') and exists (
    select 1
    from public.store_order_items as order_item
    left join public.store_checkout_product_claims as claim
      on claim.user_id = new.user_id
      and claim.product_id = order_item.product_id
      and claim.order_id = new.id
    where order_item.order_id = new.id
      and claim.order_id is null
  ) then
    raise exception 'Store order does not own every product checkout claim'
      using errcode = '23505',
            constraint = 'store_checkout_product_claims_user_product_key';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_store_order_payment_transition()
  from public, anon, authenticated;

drop trigger if exists guard_store_order_payment_transition_before_update
  on public.store_orders;
create trigger guard_store_order_payment_transition_before_update
  before update of status on public.store_orders
  for each row execute function private.guard_store_order_payment_transition();

create or replace function private.release_store_order_product_claims()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
begin
  if new.status in ('failed', 'expired', 'refunded')
    and new.status is distinct from old.status
  then
    delete from public.store_checkout_product_claims
    where order_id = new.id;
  end if;

  return new;
end;
$$;

revoke execute on function private.release_store_order_product_claims()
  from public, anon, authenticated;

drop trigger if exists release_store_order_product_claims_after_update
  on public.store_orders;
create trigger release_store_order_product_claims_after_update
  after update of status on public.store_orders
  for each row execute function private.release_store_order_product_claims();
