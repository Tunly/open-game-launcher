import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "../supabase/migrations/20260714143000_store_friend_activity_events.sql"),
  "utf8",
);

describe("store friend activity event migration", () => {
  it("adds wishlist and trusted purchase events without widening client inserts", () => {
    expect(migration).toMatch(/'wishlist_added'/);
    expect(migration).toMatch(/'game_purchased'/);
    expect(migration).not.toMatch(/activity_feed_insert_own[\s\S]*wishlist_added/i);
    expect(migration).not.toMatch(/activity_feed_insert_own[\s\S]*game_purchased/i);
  });

  it("publishes from authoritative store rows with privacy and deduplication", () => {
    expect(migration).toMatch(/after insert on public\.store_wishlist/i);
    expect(migration).toMatch(/status in \('paid', 'fulfilled'\)/i);
    expect(migration).toMatch(/wishlist_visibility/i);
    expect(migration).toMatch(/library_visibility/i);
    expect(migration).toMatch(/source_key/i);
    expect(migration).toMatch(/on conflict[\s\S]*do nothing/i);
    expect(migration).toMatch(
      /insert into public\.activity_feed[\s\S]*from public\.store_wishlist/i,
    );
    expect(migration).toMatch(
      /from public\.store_orders as store_order[\s\S]*store_order\.status in \('paid', 'fulfilled'\)/i,
    );
    expect(migration).not.toMatch(/jsonb_build_object\([\s\S]*'orderId'/i);
  });

  it("rechecks current wishlist and library privacy when events are read", () => {
    expect(migration).toMatch(/activity_feed_select_own[\s\S]*wishlist_visibility/i);
    expect(migration).toMatch(/activity_feed_select_own[\s\S]*library_visibility/i);
  });
});
