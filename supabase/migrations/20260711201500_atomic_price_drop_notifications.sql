create or replace function public.record_store_price_drop_notifications(
  deliveries jsonb,
  delivered_at timestamptz
)
returns table (
  alerts_marked_count integer,
  notifications_recorded_count integer
)
language plpgsql
security definer
volatile
set search_path = public, private, extensions, pg_temp
as $$
declare
  delivery jsonb;
  claimed_alert_id uuid;
begin
  if delivered_at is null then
    raise exception 'Delivery timestamp is required.';
  end if;
  if jsonb_typeof(deliveries) <> 'array' or jsonb_array_length(deliveries) > 500 then
    raise exception 'Price-drop deliveries must be an array of at most 500 items.';
  end if;

  alerts_marked_count := 0;
  notifications_recorded_count := 0;

  for delivery in select value from jsonb_array_elements(deliveries)
  loop
    claimed_alert_id := null;

    update public.store_price_alerts as alert
    set last_notified_at = delivered_at
    where alert.id = (delivery ->> 'alertId')::uuid
      and alert.user_id = (delivery ->> 'userId')::uuid
      and alert.product_id = (delivery ->> 'productId')::uuid
      and alert.is_active = true
      and alert.last_notified_at is not distinct from
        nullif(delivery ->> 'lastNotifiedAt', '')::timestamptz
      and alert.updated_at = (delivery ->> 'alertUpdatedAt')::timestamptz
      and exists (
        select 1
        from public.store_products product
        where product.id = alert.product_id
          and product.status = 'published'
          and product.updated_at = (delivery ->> 'productUpdatedAt')::timestamptz
      )
    returning alert.id into claimed_alert_id;

    if claimed_alert_id is null then
      continue;
    end if;

    insert into public.user_notifications (user_id, type, title, body, data)
    values (
      (delivery ->> 'userId')::uuid,
      'store_price_drop',
      delivery ->> 'title',
      delivery ->> 'body',
      coalesce(delivery -> 'data', '{}'::jsonb)
    );

    alerts_marked_count := alerts_marked_count + 1;
    notifications_recorded_count := notifications_recorded_count + 1;
  end loop;

  return next;
end;
$$;

revoke execute on function public.record_store_price_drop_notifications(jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_store_price_drop_notifications(jsonb, timestamptz)
  to service_role;

comment on function public.record_store_price_drop_notifications(jsonb, timestamptz) is
  'Atomically claims unchanged price-alert/product versions and records one notification. Concurrent or retried stale candidates are skipped.';
