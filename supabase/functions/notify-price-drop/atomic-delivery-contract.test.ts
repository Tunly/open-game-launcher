import { assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260711201500_atomic_price_drop_notifications.sql",
    import.meta.url,
  ),
);

Deno.test("price-drop notification claim and insert share one transaction", () => {
  assertMatch(
    migration,
    /update public\.store_price_alerts[\s\S]*?last_notified_at is not distinct from[\s\S]*?returning alert\.id into claimed_alert_id/i,
  );
  assertMatch(
    migration,
    /if claimed_alert_id is null then[\s\S]*?continue[\s\S]*?insert into public\.user_notifications/i,
  );
  assertMatch(
    migration,
    /product\.updated_at = \(delivery ->> 'productUpdatedAt'\)::timestamptz/i,
  );
  assertMatch(
    migration,
    /revoke execute[\s\S]*?from public, anon, authenticated[\s\S]*?grant execute[\s\S]*?to service_role/i,
  );
});
