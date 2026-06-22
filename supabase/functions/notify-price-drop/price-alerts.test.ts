import {
  findTriggeredPriceAlerts,
  type StorePriceAlertRow,
} from "./price-alerts.ts";

const publishedProduct = {
  discount_percent: 25,
  id: "product-1",
  price_cents: 2000,
  slug: "mock-game",
  status: "published",
  title: "Mock Game",
  updated_at: "2026-06-10T10:00:00.000Z",
};

function alertRow(
  overrides: Partial<StorePriceAlertRow> = {},
): StorePriceAlertRow {
  return {
    id: "alert-1",
    is_active: true,
    last_notified_at: null,
    product: publishedProduct,
    product_id: "product-1",
    target_price_cents: 1500,
    updated_at: "2026-06-10T09:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

Deno.test("findTriggeredPriceAlerts selects discounted products at target", () => {
  const result = findTriggeredPriceAlerts([alertRow()]);

  assertEquals(result.scanned, 1);
  assertEquals(result.skipped.not_met, 0);
  assertEquals(result.candidates, [
    {
      alertId: "alert-1",
      alertUpdatedAt: "2026-06-10T09:00:00.000Z",
      currentPriceCents: 1500,
      discountPercent: 25,
      lastNotifiedAt: null,
      originalPriceCents: 2000,
      productId: "product-1",
      productSlug: "mock-game",
      productTitle: "Mock Game",
      productUpdatedAt: "2026-06-10T10:00:00.000Z",
      targetPriceCents: 1500,
      userId: "user-1",
    },
  ]);
});

Deno.test("findTriggeredPriceAlerts skips unpublished products", () => {
  const result = findTriggeredPriceAlerts([
    alertRow({
      product: {
        ...publishedProduct,
        status: "draft",
      },
    }),
  ]);

  assertEquals(result.candidates, []);
  assertEquals(result.skipped.unpublished_product, 1);
});

Deno.test("findTriggeredPriceAlerts skips alerts already notified for current version", () => {
  const result = findTriggeredPriceAlerts([
    alertRow({
      last_notified_at: "2026-06-10T10:00:00.000Z",
      product: {
        ...publishedProduct,
        updated_at: "2026-06-10T10:00:01.000Z",
      },
      updated_at: "2026-06-10T10:00:01.000Z",
    }),
  ]);

  assertEquals(result.candidates, []);
  assertEquals(result.skipped.already_notified, 1);
});

Deno.test("findTriggeredPriceAlerts reprocesses after product price changes", () => {
  const result = findTriggeredPriceAlerts([
    alertRow({
      last_notified_at: "2026-06-10T10:00:00.000Z",
      product: {
        ...publishedProduct,
        discount_percent: 50,
        updated_at: "2026-06-10T10:00:03.000Z",
      },
      target_price_cents: 1000,
      updated_at: "2026-06-10T10:00:00.500Z",
    }),
  ]);

  assertEquals(result.candidates.length, 1);
  assertEquals(result.candidates[0].currentPriceCents, 1000);
  assertEquals(result.skipped.already_notified, 0);
});

function assertEquals(actual: unknown, expected: unknown) {
  const actualJson = stableJson(actual);
  const expectedJson = stableJson(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `Assertion failed:\nactual:   ${actualJson}\nexpected: ${expectedJson}`,
    );
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${
      Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
        .join(",")
    }}`;
  }

  return JSON.stringify(value);
}
