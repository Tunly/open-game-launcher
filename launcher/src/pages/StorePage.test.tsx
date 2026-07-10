import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import type {
  StoreLicense,
  StoreOrder,
  StoreOrderInvoice,
  StoreProduct,
  StoreRefundRequest,
} from "../lib/types/store";
import { StorePage } from "./StorePage";

const storeMocks = vi.hoisted(() => ({
  addToStoreWishlist: vi.fn(),
  addToCart: vi.fn(),
  createStoreBuildDownloadTicket: vi.fn(),
  getCartItems: vi.fn(),
  getMyLicenses: vi.fn(),
  getMyOrderByStripeSession: vi.fn(),
  getMyStoreReview: vi.fn(),
  getLatestStorePriceDropNotificationRunEvidence: vi.fn(),
  isTrustedStorePriceDropNotificationRunEvidence: vi.fn(),
  listMyOrderItems: vi.fn(),
  listMyOrders: vi.fn(),
  listMyStoreOrderInvoices: vi.fn(),
  listMyStorePriceAlerts: vi.fn(),
  listMyStoreRefundRequests: vi.fn(),
  listMyStoreReviewReports: vi.fn(),
  listMyStoreWishlist: vi.fn(),
  listPublishedProducts: vi.fn(),
  listStoreProductReviews: vi.fn(),
  listStoreReviewReplies: vi.fn(),
  invokeFunction: vi.fn(),
  removeFromCart: vi.fn(),
  removeFromStoreWishlist: vi.fn(),
  removeStorePriceAlert: vi.fn(),
  reportStoreReview: vi.fn(),
  requestStoreOrderRefund: vi.fn(),
  syncStoreOrderInvoice: vi.fn(),
  upsertStorePriceAlert: vi.fn(),
  upsertStoreReview: vi.fn(),
  upsertStoreReviewReply: vi.fn(),
}));

const launcherMocks = vi.hoisted(() => ({
  getLicenseDeviceId: vi.fn(),
  validateLicense: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  isLoading: false,
  user: { id: "user-1" } as { id: string } | null,
}));

vi.mock("../components/launcher/StoreGameCard", () => ({
  StoreGameCard: ({ game, isProcessing }: { game: { title: string }; isProcessing: boolean }) => (
    <article>
      {game.title}
      <button aria-label={`Card buy ${game.title}`} disabled={isProcessing} type="button">
        Card Buy
      </button>
    </article>
  ),
}));

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    error: null,
    isConfigured: true,
    isLoading: authMocks.isLoading,
    session: null,
    signOut: vi.fn(),
    user: authMocks.user,
  }),
}));

vi.mock("../lib/launcher", () => ({
  getLicenseDeviceId: launcherMocks.getLicenseDeviceId,
  validateLicense: launcherMocks.validateLicense,
}));

vi.mock("../lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
      }),
    },
    functions: {
      invoke: storeMocks.invokeFunction,
    },
  }),
}));

vi.mock("../lib/supabase/store", () => storeMocks);

function StoreRoute({ initialEntry = "/store" }: { initialEntry?: string }) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<StorePage />} path="/store" />
      </Routes>
    </MemoryRouter>
  );
}

function renderStoreRoute(initialEntry = "/store") {
  return render(<StoreRoute initialEntry={initialEntry} />);
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function makeStoreProduct(overrides: Partial<StoreProduct> = {}): StoreProduct {
  return {
    coverImageUrl: null,
    createdAt: "2026-06-20T10:00:00.000Z",
    description: "Hosted catalog entry wired to the store hero.",
    developerId: "developer-1",
    discountPercent: 0,
    downloadsCount: 0,
    genres: ["Action"],
    id: "11111111-1111-4111-8111-111111111111",
    metadata: {},
    minSystemRequirements: {},
    platforms: ["windows"],
    priceCents: 1234,
    publisher: "Signal Works",
    rating: null,
    ratingsCount: 0,
    recSystemRequirements: {},
    releaseDate: "2026-06-20",
    shortDescription: "Hosted hero product.",
    slug: "hosted-hero-product",
    status: "published",
    tags: ["Featured"],
    title: "Hosted Hero Product",
    trailerUrl: "https://media.example.com/hosted-hero-trailer",
    updatedAt: "2026-06-20T10:00:00.000Z",
    ...overrides,
  };
}

function makeStoreOrder(overrides: Partial<StoreOrder> = {}): StoreOrder {
  return {
    createdAt: "2026-06-20T10:00:00.000Z",
    currency: "eur",
    id: "22222222-2222-4222-8222-222222222222",
    paidAt: "2026-06-20T10:01:00.000Z",
    paymentMethod: "card",
    status: "fulfilled",
    stripePaymentIntent: "pi_old_account",
    stripeSessionId: "cs_old_account",
    subtotalCents: 1234,
    taxCents: 0,
    totalCents: 1234,
    updatedAt: "2026-06-20T10:01:00.000Z",
    userId: "user-1",
    ...overrides,
  };
}

function makeStoreLicense(productId: string): StoreLicense {
  return {
    activationsLeft: 2,
    createdAt: "2026-06-20T10:01:00.000Z",
    deviceId: "device-old-account",
    expiresAt: null,
    id: "license-old-account",
    isRevoked: false,
    licenseKey: "OLD-ACCOUNT-LICENSE",
    orderId: "22222222-2222-4222-8222-222222222222",
    platform: "windows",
    productId,
    userId: "user-1",
  };
}

function makeStoreInvoice(orderId: string): StoreOrderInvoice {
  return {
    createdAt: "2026-06-20T10:02:00.000Z",
    hostedInvoiceUrl: null,
    id: "invoice-old-account",
    invoiceNumber: "OLD-ACCOUNT-INVOICE",
    issuedAt: "2026-06-20T10:02:00.000Z",
    metadata: {},
    orderId,
    pdfUrl: null,
    provider: "stripe",
    providerInvoiceId: "in_old_account",
    status: "available",
    updatedAt: "2026-06-20T10:02:00.000Z",
    userId: "user-1",
  };
}

function makeStoreRefundRequest(orderId: string): StoreRefundRequest {
  return {
    cancelledAt: null,
    createdAt: "2026-06-20T10:03:00.000Z",
    details: "Old account refund details",
    failureReason: null,
    id: "refund-old-account",
    metadata: {},
    orderId,
    processedAt: null,
    provider: "stripe",
    providerRefundId: "re_old_account",
    providerRefundStatus: "pending",
    reason: "duplicate_purchase",
    refundAmountCents: 1234,
    requestedAt: "2026-06-20T10:03:00.000Z",
    reviewedAt: null,
    status: "requested",
    updatedAt: "2026-06-20T10:03:00.000Z",
    userId: "user-1",
  };
}

describe("StorePage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    authMocks.isLoading = false;
    authMocks.user = { id: "user-1" };
    launcherMocks.getLicenseDeviceId.mockResolvedValue("device-test");
    launcherMocks.validateLicense.mockResolvedValue({ ok: true });
    storeMocks.addToStoreWishlist.mockResolvedValue(undefined);
    storeMocks.addToCart.mockResolvedValue(undefined);
    storeMocks.createStoreBuildDownloadTicket.mockResolvedValue({
      downloadUrl: "https://example.test",
    });
    storeMocks.getCartItems.mockResolvedValue([]);
    storeMocks.getMyLicenses.mockResolvedValue([]);
    storeMocks.getMyOrderByStripeSession.mockResolvedValue(null);
    storeMocks.getMyStoreReview.mockResolvedValue(null);
    storeMocks.getLatestStorePriceDropNotificationRunEvidence.mockResolvedValue(null);
    storeMocks.isTrustedStorePriceDropNotificationRunEvidence.mockReturnValue(false);
    storeMocks.listMyOrderItems.mockResolvedValue([]);
    storeMocks.listMyOrders.mockResolvedValue([]);
    storeMocks.listMyStoreOrderInvoices.mockResolvedValue([]);
    storeMocks.listMyStorePriceAlerts.mockResolvedValue([
      {
        id: "alert-1",
        isActive: true,
        productId: "11111111-1111-4111-8111-111111111111",
        targetPriceCents: 999,
      },
    ]);
    storeMocks.listMyStoreRefundRequests.mockResolvedValue([]);
    storeMocks.listMyStoreReviewReports.mockResolvedValue([]);
    storeMocks.listMyStoreWishlist.mockResolvedValue([]);
    storeMocks.listPublishedProducts.mockResolvedValue([]);
    storeMocks.listStoreProductReviews.mockResolvedValue([]);
    storeMocks.listStoreReviewReplies.mockResolvedValue([]);
    storeMocks.invokeFunction.mockResolvedValue({
      data: {
        id: null,
        order_id: "order-free",
        status: "fulfilled",
        url: null,
      },
      error: null,
    });
    storeMocks.removeFromCart.mockResolvedValue(undefined);
    storeMocks.removeFromStoreWishlist.mockResolvedValue(undefined);
    storeMocks.removeStorePriceAlert.mockResolvedValue(undefined);
    storeMocks.reportStoreReview.mockResolvedValue(undefined);
    storeMocks.requestStoreOrderRefund.mockResolvedValue(undefined);
    storeMocks.syncStoreOrderInvoice.mockResolvedValue(null);
    storeMocks.upsertStorePriceAlert.mockResolvedValue(undefined);
    storeMocks.upsertStoreReview.mockResolvedValue(null);
    storeMocks.upsertStoreReviewReply.mockResolvedValue(null);
  });

  it("does not render or load store price-alert scheduler UI", async () => {
    renderStoreRoute("/store?verify=price-drop-scheduled-evidence");

    await screen.findByRole("region", {
      name: /store catalog source/i,
    });
    await waitFor(() => {
      expect(storeMocks.getCartItems).toHaveBeenCalled();
    });

    expect(
      screen.queryByRole("region", { name: /price-drop scheduler readiness/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Price Alerts")).not.toBeInTheDocument();
    expect(storeMocks.listMyStorePriceAlerts).not.toHaveBeenCalled();
    expect(storeMocks.getLatestStorePriceDropNotificationRunEvidence).not.toHaveBeenCalled();
  });

  it("sends a checkout attempt UUID when starting Stripe checkout", async () => {
    const hostedProduct = makeStoreProduct({ priceCents: 1999 });
    storeMocks.listPublishedProducts.mockResolvedValue([hostedProduct]);
    renderStoreRoute();

    const buyNow = await screen.findByRole("button", {
      name: /buy now -/i,
    });
    await waitFor(() => expect(buyNow).toBeEnabled());
    expect(buyNow).toHaveTextContent("19.99");
    fireEvent.click(buyNow);

    await waitFor(() => {
      expect(storeMocks.invokeFunction).toHaveBeenCalledWith(
        "stripe-create-checkout",
        expect.objectContaining({
          body: expect.objectContaining({
            checkout_attempt_id: expect.stringMatching(
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
            ),
            product_ids: [hostedProduct.id],
          }),
        }),
      );
    });
  });

  it("shows an honest empty hosted catalog without fictional products", async () => {
    renderStoreRoute();

    const sourcePanel = await screen.findByRole("region", {
      name: /store catalog source/i,
    });

    await waitFor(() => {
      expect(within(sourcePanel).getByText("Hosted Empty")).toBeInTheDocument();
    });
    expect(
      within(sourcePanel).getByText(/no local product data is substituted/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("No published products are currently available.")).not.toHaveLength(
      0,
    );
    expect(screen.getByRole("button", { name: /trailer unavailable/i })).toBeDisabled();
    expect(screen.queryByText("Wasteland Drifter")).not.toBeInTheDocument();
    expect(screen.queryByText("System Crash")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /preview only/i })).not.toBeInTheDocument();
    expect(storeMocks.invokeFunction).not.toHaveBeenCalled();
    expect(screen.queryByText(/live sample/i)).not.toBeInTheDocument();
  });

  it("renders no products while the hosted catalog is still loading", async () => {
    const catalog = deferred<StoreProduct[]>();
    storeMocks.listPublishedProducts.mockReturnValue(catalog.promise);

    renderStoreRoute();

    const sourcePanel = await screen.findByRole("region", { name: /store catalog source/i });
    expect(within(sourcePanel).getByText("Loading Catalog")).toBeInTheDocument();
    expect(screen.getByText("Loading the hosted catalog.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /preview only/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Wasteland Drifter")).not.toBeInTheDocument();

    await act(async () => {
      catalog.resolve([]);
      await catalog.promise;
    });
  });

  it("shows a catalog error without substituting local products", async () => {
    storeMocks.listPublishedProducts.mockRejectedValue(new Error("catalog offline"));

    renderStoreRoute();

    const sourcePanel = await screen.findByRole("region", { name: /store catalog source/i });
    await waitFor(() => expect(within(sourcePanel).getByText("Hosted Error")).toBeInTheDocument());
    expect(within(sourcePanel).getByText(/catalog offline/i)).toBeInTheDocument();
    expect(screen.getByText(/no local products are shown/i)).toBeInTheDocument();
    expect(screen.queryByText("Wasteland Drifter")).not.toBeInTheDocument();
  });

  it("drives the hero metadata, price, checkout product, and trailer from the hosted product", async () => {
    const hostedProduct = makeStoreProduct({
      coverImageUrl: "https://media.example.com/hosted-cover.jpg",
      description: "Full hosted product description.",
      publisher: "Hosted Publisher",
      shortDescription: "Short hosted summary.",
    });
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    storeMocks.listPublishedProducts.mockResolvedValue([hostedProduct]);

    const { container } = renderStoreRoute();

    expect(await screen.findAllByRole("heading", { name: "Hosted Hero Product" })).toHaveLength(2);

    const sourcePanel = screen.getByRole("region", {
      name: /store catalog source/i,
    });
    expect(within(sourcePanel).getByText("Hosted Catalog")).toBeInTheDocument();
    expect(screen.getAllByText("Full hosted product description.")).not.toHaveLength(0);
    expect(screen.getAllByText("Hosted Publisher")).not.toHaveLength(0);
    expect(screen.queryByText(/built for players who want/i)).not.toBeInTheDocument();
    expect(
      container.querySelectorAll('img[src="https://media.example.com/hosted-cover.jpg"]'),
    ).not.toHaveLength(0);

    const buyNow = screen.getByRole("button", { name: /buy now -/i });
    await waitFor(() => expect(buyNow).toBeEnabled());
    expect(buyNow).toHaveTextContent("12.34");
    fireEvent.click(buyNow);

    await waitFor(() => {
      expect(storeMocks.invokeFunction).toHaveBeenCalledWith(
        "stripe-create-checkout",
        expect.objectContaining({
          body: expect.objectContaining({
            product_ids: [hostedProduct.id],
          }),
        }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /watch trailer/i }));
    expect(openSpy).toHaveBeenCalledWith(hostedProduct.trailerUrl, "_blank", "noopener,noreferrer");
    openSpy.mockRestore();
  });

  it("never falls back to global local orders for a signed-in account", async () => {
    localStorage.setItem(
      "og-launcher:store:orders",
      JSON.stringify([
        makeStoreOrder({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          userId: "another-user",
        }),
      ]),
    );
    localStorage.setItem("og-launcher:store:owned", JSON.stringify(["foreign-product"]));

    renderStoreRoute("/store?tab=orders");

    expect(await screen.findByText("No orders yet.")).toBeInTheDocument();
    expect(screen.queryByText("Order aaaaaaaa")).not.toBeInTheDocument();
    expect(localStorage.getItem("og-launcher:store:orders")).toBeNull();
    expect(localStorage.getItem("og-launcher:store:owned")).toBeNull();
  });

  it("clears every account-bound store lane on account switch and logout", async () => {
    const hostedProduct = makeStoreProduct();
    const cartProduct = makeStoreProduct({
      id: "33333333-3333-4333-8333-333333333333",
      slug: "cart-product",
      title: "Cart Product",
    });
    const order = makeStoreOrder();
    storeMocks.listPublishedProducts.mockResolvedValue([hostedProduct, cartProduct]);
    storeMocks.getCartItems.mockResolvedValue([{ productId: cartProduct.id }]);
    storeMocks.getMyLicenses.mockResolvedValue([makeStoreLicense(hostedProduct.id)]);
    storeMocks.listMyOrders.mockResolvedValue([order]);
    storeMocks.listMyStoreOrderInvoices.mockResolvedValue([makeStoreInvoice(order.id)]);
    storeMocks.listMyStoreRefundRequests.mockResolvedValue([makeStoreRefundRequest(order.id)]);
    storeMocks.listMyStoreWishlist.mockResolvedValue([{ productId: hostedProduct.id }]);

    const view = renderStoreRoute("/store?tab=orders");

    expect(await screen.findByText("OLD-ACCOUNT-INVOICE")).toBeInTheDocument();
    expect(screen.getByText("1 Licenses")).toBeInTheDocument();
    expect(screen.getByText("re_old_account")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Owned" })).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "Open Cart" })).toHaveTextContent("1");

    const nextAccountLoad = deferred<void>();
    storeMocks.getCartItems.mockImplementation(() => nextAccountLoad.promise.then(() => []));
    storeMocks.getMyLicenses.mockImplementation(() => nextAccountLoad.promise.then(() => []));
    storeMocks.listMyOrders.mockImplementation(() => nextAccountLoad.promise.then(() => []));
    storeMocks.listMyStoreOrderInvoices.mockImplementation(() =>
      nextAccountLoad.promise.then(() => []),
    );
    storeMocks.listMyStoreRefundRequests.mockImplementation(() =>
      nextAccountLoad.promise.then(() => []),
    );
    storeMocks.listMyStoreWishlist.mockImplementation(() => nextAccountLoad.promise.then(() => []));

    await act(async () => {
      authMocks.user = { id: "user-2" };
      view.rerender(<StoreRoute initialEntry="/store?tab=orders" />);
      await Promise.resolve();
    });

    expect(screen.queryByText("OLD-ACCOUNT-INVOICE")).not.toBeInTheDocument();
    expect(screen.queryByText("re_old_account")).not.toBeInTheDocument();
    expect(screen.getByText("0 Licenses")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Owned" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Cart" })).toHaveTextContent("0");
    expect(screen.queryByText(`Order ${order.id.slice(0, 8)}`)).not.toBeInTheDocument();

    await act(async () => {
      nextAccountLoad.resolve(undefined);
      await nextAccountLoad.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText("No orders yet.")).toBeInTheDocument());
    expect(screen.getByText("0 Licenses")).toBeInTheDocument();

    const orderCallsBeforeLogout = storeMocks.listMyOrders.mock.calls.length;
    await act(async () => {
      authMocks.user = null;
      view.rerender(<StoreRoute initialEntry="/store?tab=orders" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("0 Licenses")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Cart" })).toHaveTextContent("0");
    expect(storeMocks.listMyOrders).toHaveBeenCalledTimes(orderCallsBeforeLogout);
  });

  it("guards checkout reentrancy and disables every purchase surface while processing", async () => {
    const hostedProduct = makeStoreProduct({ priceCents: 1999 });
    const checkout = deferred<{
      data: { id: null; order_id: string; status: "fulfilled"; url: null };
      error: null;
    }>();
    storeMocks.listPublishedProducts.mockResolvedValue([hostedProduct]);
    storeMocks.invokeFunction.mockReturnValue(checkout.promise);

    renderStoreRoute();

    const heroBuy = await screen.findByRole("button", { name: /buy now -/i });
    await waitFor(() => expect(heroBuy).toBeEnabled());

    act(() => {
      heroBuy.click();
      heroBuy.click();
    });

    await waitFor(() => expect(storeMocks.invokeFunction).toHaveBeenCalledTimes(1));
    for (const button of screen.getAllByRole("button", { name: /buy|claim/i })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "Add To Cart" })).toBeDisabled();

    await act(async () => {
      checkout.resolve({
        data: { id: null, order_id: "order-free", status: "fulfilled", url: null },
        error: null,
      });
      await checkout.promise;
    });
  });

  it("does not claim free checkout added a game to the library", async () => {
    const hostedProduct = makeStoreProduct({ priceCents: 0 });
    storeMocks.listPublishedProducts.mockResolvedValue([hostedProduct]);
    renderStoreRoute();

    const claim = await screen.findByRole("button", { name: /claim -/i });
    await waitFor(() => expect(claim).toBeEnabled());
    fireEvent.click(claim);

    expect(
      await screen.findByText(
        "Free checkout fulfilled. Account licenses refreshed; library handoff remains separate.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/added to (your )?library/i)).not.toBeInTheDocument();
  });

  it("keeps paid checkout returns pending until fulfillment issues a license", async () => {
    const paidOrder = makeStoreOrder({
      status: "paid",
      stripeSessionId: "cs_paid_return",
    });
    storeMocks.getMyOrderByStripeSession.mockResolvedValue(paidOrder);
    storeMocks.listMyOrders.mockResolvedValue([paidOrder]);

    renderStoreRoute("/store?session_id=cs_paid_return");

    expect(
      await screen.findByText(
        "Payment confirmed. Fulfillment and license issuance are still pending.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Paid / Fulfillment Pending")).toBeInTheDocument();
    expect(screen.queryByText(/licenses and downloads are unlocked/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Unlocked Products")).not.toBeInTheDocument();
  });

  it("shows the Stripe live-staging contract on the verify route without live secret claims", async () => {
    renderStoreRoute("/store?verify=stripe-live-staging-contract");

    const panel = await screen.findByRole("region", {
      name: /stripe staging readiness/i,
    });

    expect(within(panel).getByText("Stripe Live-Staging Contract")).toBeInTheDocument();
    expect(within(panel).getByText("2026-05-27.dahlia")).toBeInTheDocument();
    expect(within(panel).getAllByText("No verify-route write")).toHaveLength(2);
    expect(within(panel).getByText("Signed webhook first")).toBeInTheDocument();
    expect(within(panel).getByText("Tax + invoice Dashboard")).toBeInTheDocument();
    expect(within(panel).getByText("Refund replay ledger")).toBeInTheDocument();
    expect(within(panel).getByText("No raw Stripe key")).toBeInTheDocument();
    expect(within(panel).getByText("No webhook secret in UI")).toBeInTheDocument();
    expect(within(panel).getByText("No Dashboard success claim")).toBeInTheDocument();
    expect(within(panel).getByText("No refund replay success claim")).toBeInTheDocument();
    expect(within(panel).getByText(/signature-first webhook parsing/i)).toBeInTheDocument();

    expect(await screen.findByText("Order 11111111")).toBeInTheDocument();
    expect(screen.getByText("Neo-Strike Staging Fixture")).toBeInTheDocument();
    expect(screen.getByText("Provider Ready")).toBeInTheDocument();
    expect(screen.getByText("Stripe Pending")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /sk_live|whsec_|rk_live|webhook delivered|dashboard verified|tax configured|invoice merchant verified|refund replay succeeded|refund webhook replayed/i,
    );
  });
});
