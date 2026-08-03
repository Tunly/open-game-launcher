import {
  assertMatch,
  assertNotMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260717120000_store_checkout_product_claims.sql",
    import.meta.url,
  ),
);

Deno.test("store checkout products are serialized in Postgres before payment", () => {
  assertMatch(
    migration,
    /primary key \(user_id, product_id\)/i,
  );
  assertMatch(
    migration,
    /before insert on public\.store_order_items[\s\S]*?private\.claim_store_order_item\(\)/i,
  );
  assertMatch(
    migration,
    /insert into public\.store_checkout_product_claims[\s\S]*?new\.product_id[\s\S]*?new\.order_id/i,
  );
  assertMatch(
    migration,
    /new\.status in \('paid', 'fulfilled'\)[\s\S]*?claim\.order_id is null[\s\S]*?raise exception 'Store order does not own every product checkout claim'/i,
  );
  assertNotMatch(
    migration,
    /on conflict \(user_id, product_id\) do update/i,
  );
});

Deno.test("terminal non-owning orders release claims and payment intents stay unique", () => {
  assertMatch(
    migration,
    /create unique index if not exists store_orders_stripe_payment_intent_unique[\s\S]*?where stripe_payment_intent is not null/i,
  );
  assertMatch(
    migration,
    /new\.status in \('failed', 'expired', 'refunded'\)[\s\S]*?delete from public\.store_checkout_product_claims[\s\S]*?where order_id = new\.id/i,
  );
  assertMatch(
    migration,
    /old\.status = 'fulfilled' and new\.status <> 'refunded'/i,
  );
});

Deno.test("unattached pending claims are reclaimed only after Stripe can no longer collect", () => {
  assertMatch(
    migration,
    /delete from public\.store_checkout_product_claims as stale_claim[\s\S]*?stale_order\.status = 'pending'[\s\S]*?stale_order\.stripe_session_id is null[\s\S]*?stale_order\.created_at < now\(\) - interval '48 hours'/i,
  );
  assertNotMatch(
    migration,
    /stale_order\.created_at < now\(\) - interval '(?:[0-9]|1[0-9]|2[0-4]) hours'/i,
  );
});
