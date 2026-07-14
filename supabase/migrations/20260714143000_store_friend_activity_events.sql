-- Publish store wishlist and trusted purchase lifecycle events into the existing
-- privacy-aware friend activity feed. Client inserts remain restricted to the
-- narrow status/game lifecycle allow-list.

alter table public.activity_feed
  drop constraint if exists activity_feed_type_check;
alter table public.activity_feed
  add constraint activity_feed_type_check
  check (type in (
    'status',
    'game_start',
    'game_stop',
    'achievement_unlocked',
    'wishlist_added',
    'game_purchased'
  ));

alter table public.activity_feed
  add column if not exists source_key text;

create unique index if not exists activity_feed_source_key_unique_idx
  on public.activity_feed (type, user_id, source_key)
  where source_key is not null;

-- Re-evaluate store-lane privacy at read time so changing profile privacy also
-- hides historical wishlist/purchase entries. Blocked users never retain feed
-- access even if a stale accepted friendship row still exists.
drop policy if exists activity_feed_select_own on public.activity_feed;
create policy activity_feed_select_own on public.activity_feed
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      not public.is_blocked(auth.uid(), user_id)
      and (
        visibility = 'public'
        or (visibility = 'friends_only' and public.is_friend(auth.uid(), user_id))
      )
      and case
        when type = 'wishlist_added' then exists (
          select 1
          from public.profiles as profile
          where profile.id = activity_feed.user_id
            and public.can_view_visibility(
              auth.uid(),
              activity_feed.user_id,
              profile.wishlist_visibility
            )
        )
        when type = 'game_purchased' then exists (
          select 1
          from public.profiles as profile
          where profile.id = activity_feed.user_id
            and public.can_view_visibility(
              auth.uid(),
              activity_feed.user_id,
              profile.library_visibility
            )
        )
        else true
      end
    )
  );

create or replace function public.publish_store_wishlist_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  product public.store_products%rowtype;
  feed_visibility text;
begin
  select * into product
  from public.store_products
  where id = new.product_id;

  if product.id is null then
    return new;
  end if;

  select coalesce(profile.wishlist_visibility, 'friends_only')
  into feed_visibility
  from public.profiles as profile
  where profile.id = new.user_id;

  insert into public.activity_feed (
    user_id,
    type,
    game_title,
    metadata,
    source_key,
    visibility,
    created_at
  ) values (
    new.user_id,
    'wishlist_added',
    product.title,
    jsonb_strip_nulls(jsonb_build_object(
      'productId', product.id,
      'productSlug', product.slug,
      'coverImageUrl', product.cover_image_url,
      'priceCents', product.price_cents,
      'currency', 'EUR',
      'source', 'store_wishlist'
    )),
    md5('store-wishlist:' || new.id::text),
    coalesce(feed_visibility, 'friends_only'),
    new.added_at
  );

  return new;
end;
$$;

revoke all on function public.publish_store_wishlist_activity() from public;
revoke all on function public.publish_store_wishlist_activity() from anon;
revoke all on function public.publish_store_wishlist_activity() from authenticated;

drop trigger if exists publish_store_wishlist_activity_after_insert
  on public.store_wishlist;
create trigger publish_store_wishlist_activity_after_insert
  after insert on public.store_wishlist
  for each row execute function public.publish_store_wishlist_activity();

create or replace function public.publish_store_order_purchase_activity(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_order public.store_orders%rowtype;
  feed_visibility text;
  item record;
begin
  select * into target_order
  from public.store_orders
  where id = target_order_id
    and status in ('paid', 'fulfilled');

  if target_order.id is null then
    return;
  end if;

  select coalesce(profile.library_visibility, 'friends_only')
  into feed_visibility
  from public.profiles as profile
  where profile.id = target_order.user_id;

  for item in
    select order_item.*, product.slug, product.cover_image_url
    from public.store_order_items as order_item
    join public.store_products as product on product.id = order_item.product_id
    where order_item.order_id = target_order.id
  loop
    insert into public.activity_feed (
      user_id,
      type,
      game_title,
      metadata,
      source_key,
      visibility,
      created_at
    )
    select
      target_order.user_id,
      'game_purchased',
      item.title_snapshot,
      jsonb_strip_nulls(jsonb_build_object(
        'productId', item.product_id,
        'productSlug', item.slug,
        'coverImageUrl', item.cover_image_url,
        'priceCents', item.price_cents_snapshot * item.quantity,
        'currency', upper(target_order.currency),
        'quantity', item.quantity,
        'source', 'trusted_store_order'
      )),
      md5('store-purchase:' || target_order.id::text || ':' || item.product_id::text),
      coalesce(feed_visibility, 'friends_only'),
      coalesce(target_order.paid_at, target_order.updated_at, target_order.created_at)
    on conflict (type, user_id, source_key) where source_key is not null
    do nothing;
  end loop;
end;
$$;

revoke all on function public.publish_store_order_purchase_activity(uuid) from public;
revoke all on function public.publish_store_order_purchase_activity(uuid) from anon;
revoke all on function public.publish_store_order_purchase_activity(uuid) from authenticated;

create or replace function public.publish_store_order_purchase_activity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'store_orders' then
    if tg_op = 'INSERT' and new.status in ('paid', 'fulfilled') then
      perform public.publish_store_order_purchase_activity(new.id);
    elsif tg_op = 'UPDATE'
      and new.status in ('paid', 'fulfilled')
      and old.status not in ('paid', 'fulfilled') then
      perform public.publish_store_order_purchase_activity(new.id);
    end if;
  elsif tg_table_name = 'store_order_items' then
    perform public.publish_store_order_purchase_activity(new.order_id);
  end if;
  return new;
end;
$$;

revoke all on function public.publish_store_order_purchase_activity_trigger() from public;
revoke all on function public.publish_store_order_purchase_activity_trigger() from anon;
revoke all on function public.publish_store_order_purchase_activity_trigger() from authenticated;

drop trigger if exists publish_store_purchase_after_order_state
  on public.store_orders;
create constraint trigger publish_store_purchase_after_order_state
  after insert or update on public.store_orders
  deferrable initially deferred
  for each row execute function public.publish_store_order_purchase_activity_trigger();

drop trigger if exists publish_store_purchase_after_order_item
  on public.store_order_items;
create constraint trigger publish_store_purchase_after_order_item
  after insert on public.store_order_items
  deferrable initially deferred
  for each row execute function public.publish_store_order_purchase_activity_trigger();

-- Idempotently backfill the current hosted state so the feed does not begin at
-- deployment time and silently omit already-owned or already-wishlisted games.
insert into public.activity_feed (
  user_id,
  type,
  game_title,
  metadata,
  source_key,
  visibility,
  created_at
)
select
  wishlist.user_id,
  'wishlist_added',
  product.title,
  jsonb_strip_nulls(jsonb_build_object(
    'productId', product.id,
    'productSlug', product.slug,
    'coverImageUrl', product.cover_image_url,
    'priceCents', product.price_cents,
    'currency', 'EUR',
    'source', 'store_wishlist_backfill'
  )),
  md5('store-wishlist:' || wishlist.id::text),
  coalesce(profile.wishlist_visibility, 'friends_only'),
  wishlist.added_at
from public.store_wishlist as wishlist
join public.store_products as product on product.id = wishlist.product_id
left join public.profiles as profile on profile.id = wishlist.user_id
on conflict (type, user_id, source_key) where source_key is not null
do nothing;

insert into public.activity_feed (
  user_id,
  type,
  game_title,
  metadata,
  source_key,
  visibility,
  created_at
)
select
  store_order.user_id,
  'game_purchased',
  order_item.title_snapshot,
  jsonb_strip_nulls(jsonb_build_object(
    'productId', order_item.product_id,
    'productSlug', product.slug,
    'coverImageUrl', product.cover_image_url,
    'priceCents', order_item.price_cents_snapshot * order_item.quantity,
    'currency', upper(store_order.currency),
    'quantity', order_item.quantity,
    'source', 'trusted_store_order_backfill'
  )),
  md5('store-purchase:' || store_order.id::text || ':' || order_item.product_id::text),
  coalesce(profile.library_visibility, 'friends_only'),
  coalesce(store_order.paid_at, store_order.updated_at, store_order.created_at)
from public.store_orders as store_order
join public.store_order_items as order_item on order_item.order_id = store_order.id
join public.store_products as product on product.id = order_item.product_id
left join public.profiles as profile on profile.id = store_order.user_id
where store_order.status in ('paid', 'fulfilled')
on conflict (type, user_id, source_key) where source_key is not null
do nothing;
