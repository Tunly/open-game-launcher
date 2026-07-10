import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const authGetUser = vi.fn();
  const from = vi.fn();
  const getSupabaseClient = vi.fn();
  return { authGetUser, from, getSupabaseClient };
});

vi.mock("../client", () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

describe("store wishlist and price alerts", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.authGetUser.mockReset();
    mocks.from.mockReset();
    mocks.getSupabaseClient.mockReset();

    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.getSupabaseClient.mockReturnValue({
      auth: { getUser: mocks.authGetUser },
      from: mocks.from,
    });
  });

  it("lists my store wishlist entries", async () => {
    const chain = makeSelectChain([
      {
        id: "wish-1",
        user_id: "user-1",
        product_id: "product-1",
        added_at: "2026-06-10T12:00:00.000Z",
      },
    ]);
    mocks.from.mockReturnValue(chain);

    const { listMyStoreWishlist } = await import("../store");
    const result = await listMyStoreWishlist();

    expect(mocks.from).toHaveBeenCalledWith("store_wishlist");
    expect(chain.select).toHaveBeenCalledWith("id, user_id, product_id, added_at");
    expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(chain.order).toHaveBeenCalledWith("added_at", { ascending: false });
    expect(result).toEqual([
      {
        id: "wish-1",
        userId: "user-1",
        productId: "product-1",
        addedAt: "2026-06-10T12:00:00.000Z",
      },
    ]);
  });

  it("upserts and removes store wishlist entries for the current user", async () => {
    const upsertChain = { upsert: vi.fn(() => Promise.resolve({ error: null })) };
    const deleteChain = makeMutationChain();
    mocks.from
      .mockReturnValueOnce(upsertChain)
      .mockReturnValueOnce({ delete: vi.fn(() => deleteChain) });

    const { addToStoreWishlist, removeFromStoreWishlist } = await import("../store");
    await addToStoreWishlist("product-1");
    await removeFromStoreWishlist("product-1");

    expect(upsertChain.upsert).toHaveBeenCalledWith(
      { product_id: "product-1", user_id: "user-1" },
      { onConflict: "user_id,product_id" },
    );
    expect(deleteChain.eq).toHaveBeenNthCalledWith(1, "user_id", "user-1");
    expect(deleteChain.eq).toHaveBeenNthCalledWith(2, "product_id", "product-1");
  });

  it("lists active store price alerts and maps cents", async () => {
    const chain = makeSelectChain([
      {
        id: "alert-1",
        user_id: "user-1",
        product_id: "product-1",
        target_price_cents: 799,
        is_active: true,
        last_notified_at: null,
        created_at: "2026-06-10T12:00:00.000Z",
        updated_at: "2026-06-10T12:30:00.000Z",
      },
    ]);
    mocks.from.mockReturnValue(chain);

    const { listMyStorePriceAlerts } = await import("../store");
    const result = await listMyStorePriceAlerts();

    expect(mocks.from).toHaveBeenCalledWith("store_price_alerts");
    expect(chain.eq).toHaveBeenNthCalledWith(1, "user_id", "user-1");
    expect(chain.eq).toHaveBeenNthCalledWith(2, "is_active", true);
    expect(result[0]).toEqual({
      id: "alert-1",
      userId: "user-1",
      productId: "product-1",
      targetPriceCents: 799,
      isActive: true,
      lastNotifiedAt: null,
      createdAt: "2026-06-10T12:00:00.000Z",
      updatedAt: "2026-06-10T12:30:00.000Z",
    });
  });

  it("loads latest sanitized price-drop notification run evidence", async () => {
    const chain = makeMaybeSingleChain({
      alerts_marked_count: 2,
      candidate_count: 3,
      completed_at: "2026-06-14T14:05:00.000Z",
      dry_run: false,
      limit_count: 500,
      notifications_recorded_count: 2,
      requested_alert_count: 0,
      requested_product_count: 0,
      requested_user_count: 0,
      run_id: "price-drop-run-1",
      scanned_count: 10,
      status: "completed",
      trigger_source: "scheduled",
    });
    mocks.from.mockReturnValue(chain);

    const { getLatestStorePriceDropNotificationRunEvidence } = await import("../store");
    const result = await getLatestStorePriceDropNotificationRunEvidence();

    expect(mocks.from).toHaveBeenCalledWith("store_price_drop_notification_runs");
    expect(chain.select).toHaveBeenCalled();
    expect(chain.order).toHaveBeenCalledWith("completed_at", { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      alertsMarkedCount: 2,
      candidateCount: 3,
      completedAt: "2026-06-14T14:05:00.000Z",
      dryRun: false,
      limit: 500,
      notificationsRecordedCount: 2,
      requestedAlertCount: 0,
      requestedProductCount: 0,
      requestedUserCount: 0,
      runId: "price-drop-run-1",
      scannedCount: 10,
      status: "completed",
      triggerSource: "scheduled",
    });
  });

  it("treats missing price-drop notification run schema as no evidence", async () => {
    const chain = makeMaybeSingleChain(null, {
      code: "42P01",
      message: "relation store_price_drop_notification_runs does not exist",
    });
    mocks.from.mockReturnValue(chain);

    const { getLatestStorePriceDropNotificationRunEvidence } = await import("../store");
    await expect(getLatestStorePriceDropNotificationRunEvidence()).resolves.toBeNull();
  });

  it("trusts only fresh scheduled non-dry-run price-drop evidence", async () => {
    const { isTrustedStorePriceDropNotificationRunEvidence } = await import("../store");
    const evidence = {
      alertsMarkedCount: 2,
      candidateCount: 3,
      completedAt: "2026-06-14T14:05:00.000Z",
      dryRun: false,
      limit: 500,
      notificationsRecordedCount: 2,
      requestedAlertCount: 0,
      requestedProductCount: 0,
      requestedUserCount: 0,
      runId: "price-drop-run-1",
      scannedCount: 10,
      status: "completed",
      triggerSource: "scheduled",
    };

    expect(
      isTrustedStorePriceDropNotificationRunEvidence(evidence, "2026-06-14T15:00:00.000Z"),
    ).toBe(true);
    expect(
      isTrustedStorePriceDropNotificationRunEvidence(
        { ...evidence, dryRun: true },
        "2026-06-14T15:00:00.000Z",
      ),
    ).toBe(false);
    expect(
      isTrustedStorePriceDropNotificationRunEvidence(
        { ...evidence, triggerSource: "hosted_deploy_gate" },
        "2026-06-14T15:00:00.000Z",
      ),
    ).toBe(false);
    expect(
      isTrustedStorePriceDropNotificationRunEvidence(evidence, "2026-06-14T17:00:01.000Z"),
    ).toBe(false);
  });

  it("upserts and clears store price alerts", async () => {
    const upsertChain = { upsert: vi.fn(() => Promise.resolve({ error: null })) };
    const updateChain = makeMutationChain();
    mocks.from.mockReturnValueOnce(upsertChain).mockReturnValueOnce({
      update: vi.fn(() => updateChain),
    });

    const { removeStorePriceAlert, upsertStorePriceAlert } = await import("../store");
    await upsertStorePriceAlert("product-1", 1299);
    await removeStorePriceAlert("product-1");

    expect(upsertChain.upsert).toHaveBeenCalledWith(
      {
        is_active: true,
        product_id: "product-1",
        target_price_cents: 1299,
        user_id: "user-1",
      },
      { onConflict: "user_id,product_id" },
    );
    expect(updateChain.eq).toHaveBeenNthCalledWith(1, "user_id", "user-1");
    expect(updateChain.eq).toHaveBeenNthCalledWith(2, "product_id", "product-1");
  });

  it("loads order items for multiple orders in one query", async () => {
    const chain = {
      in: vi.fn(() =>
        Promise.resolve({
          data: [
            {
              id: "item-1",
              order_id: "order-1",
              price_cents_snapshot: 1299,
              product_id: "product-1",
              quantity: 1,
              title_snapshot: "Cyber Drift",
            },
          ],
          error: null,
        }),
      ),
      select: vi.fn(),
    };
    chain.select.mockReturnValue(chain);
    mocks.from.mockReturnValue(chain);

    const { listMyOrderItems } = await import("../store");
    const result = await listMyOrderItems(["order-1", "order-2", "order-1"]);

    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(chain.in).toHaveBeenCalledWith("order_id", ["order-1", "order-2"]);
    expect(result).toEqual([
      expect.objectContaining({ id: "item-1", orderId: "order-1", productId: "product-1" }),
    ]);
  });

  it("reuses the published product catalog across repeated reads", async () => {
    const chain = makeSelectChain([
      {
        created_at: "2026-07-10T10:00:00.000Z",
        developer_id: "developer-1",
        id: "product-1",
        platforms: ["windows"],
        slug: "cyber-drift",
        status: "published",
        title: "Cyber Drift",
        updated_at: "2026-07-10T10:00:00.000Z",
      },
    ]);
    mocks.from.mockReturnValue(chain);

    const { listPublishedProducts } = await import("../store");
    await Promise.all([listPublishedProducts(), listPublishedProducts()]);
    await listPublishedProducts();

    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
});

function makeMaybeSingleChain(
  data: unknown,
  error: { code?: string; message: string } | null = null,
) {
  const chain = {
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data, error })),
    order: vi.fn(() => chain),
    select: vi.fn(() => chain),
  };
  return chain;
}

function makeSelectChain(rows: unknown[]) {
  const chain = {
    eq: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    select: vi.fn(() => chain),
  };
  return chain;
}

function makeMutationChain() {
  const chain = {
    error: null,
    eq: vi.fn(() => chain),
  };
  return chain;
}
