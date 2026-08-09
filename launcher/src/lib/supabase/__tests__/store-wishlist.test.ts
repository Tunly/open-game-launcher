import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const authGetUser = vi.fn();
  const from = vi.fn();
  const getCurrentSupabaseUser = vi.fn();
  const getSupabaseClient = vi.fn();
  return { authGetUser, from, getCurrentSupabaseUser, getSupabaseClient };
});

vi.mock("../client", () => ({
  getCurrentSupabaseUser: mocks.getCurrentSupabaseUser,
  getSupabaseClient: mocks.getSupabaseClient,
}));

describe("store wishlist and price alerts", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.authGetUser.mockReset();
    mocks.from.mockReset();
    mocks.getCurrentSupabaseUser.mockReset();
    mocks.getSupabaseClient.mockReset();

    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.getCurrentSupabaseUser.mockResolvedValue({ id: "user-1" });
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
