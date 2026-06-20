import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { STORAGE_KEYS } from "../lib/storage-keys";
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
  getStoreProductPriceHistory: vi.fn(),
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

vi.mock("recharts", () => ({
  CartesianGrid: () => null,
  Line: () => null,
  LineChart: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

vi.mock("../components/launcher/StoreGameCard", () => ({
  StoreGameCard: ({ game }: { game: { title: string } }) => <article>{game.title}</article>,
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

function renderStoreRoute(initialEntry = "/store") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<StorePage />} path="/store" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StorePage price-drop scheduler readiness", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
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
    storeMocks.getStoreProductPriceHistory.mockResolvedValue([]);
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

  it("wires local and remote price alert counts into the readiness panel", async () => {
    localStorage.setItem(STORAGE_KEYS.STORE_PRICE_ALERTS, JSON.stringify({ "deep-signal": 15 }));

    renderStoreRoute();

    const panel = await screen.findByRole("region", {
      name: /price-drop scheduler readiness/i,
    });

    await waitFor(() => {
      expect(within(panel).getByText("Cron rows").parentElement).toHaveTextContent("1");
    });

    expect(within(panel).getByText("Local alerts").parentElement).toHaveTextContent("2");
    expect(within(panel).getByText("Cron rows").parentElement).toHaveTextContent("1");
    expect(within(panel).getByText("Remote sync")).toBeInTheDocument();
    expect(within(panel).getByText("Needs hosted cron")).toBeInTheDocument();
  });

  it("keeps the scheduled-evidence verify route local-only until trusted evidence exists", async () => {
    renderStoreRoute("/store?verify=price-drop-scheduled-evidence");

    const panel = await screen.findByRole("region", {
      name: /price-drop scheduler readiness/i,
    });

    await waitFor(() => {
      expect(within(panel).getByText("Needs hosted cron")).toBeInTheDocument();
    });
    expect(within(panel).getByText("Cron rows").parentElement).toHaveTextContent("1");
    expect(within(panel).getByText("Hosted cron")).toBeInTheDocument();
    expect(within(panel).getByText("Hosted Scheduler Proof")).toBeInTheDocument();
    expect(within(panel).getByText("price-drop-scheduled-fixture")).toBeInTheDocument();
    expect(within(panel).getByText("Run evidence row")).toBeInTheDocument();
    expect(within(panel).getByText("Trusted scheduled row")).toBeInTheDocument();
    expect(within(panel).getByText("No-write verify route")).toBeInTheDocument();
    expect(within(panel).getAllByText("No verify-route notification write")).toHaveLength(2);
    expect(
      within(panel).getByText("No hosted cron success claim without trusted row"),
    ).toBeInTheDocument();
    expect(within(panel).queryByText("Ready")).not.toBeInTheDocument();
    expect(within(panel).getByText(/real hosted Supabase Scheduled Function/i)).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(
      /PRICE_DROP_NOTIFY_SECRET=|notification body:|@example\.|hosted cron ready/i,
    );
  });

  it("shows real scheduled price-drop evidence as hosted cron ready", async () => {
    storeMocks.getLatestStorePriceDropNotificationRunEvidence.mockResolvedValue({
      alertsMarkedCount: 1,
      candidateCount: 1,
      completedAt: "2026-06-15T00:00:00.000Z",
      dryRun: false,
      limit: 500,
      notificationsRecordedCount: 1,
      requestedAlertCount: 0,
      requestedProductCount: 0,
      requestedUserCount: 0,
      runId: "price-drop-run-1",
      scannedCount: 1,
      status: "completed",
      triggerSource: "scheduled",
    });
    storeMocks.isTrustedStorePriceDropNotificationRunEvidence.mockReturnValue(true);

    renderStoreRoute();

    const panel = await screen.findByRole("region", {
      name: /price-drop scheduler readiness/i,
    });

    await waitFor(() => {
      expect(within(panel).getByText("Ready")).toBeInTheDocument();
    });
    expect(within(panel).getByText("Cron rows").parentElement).toHaveTextContent("1");
    expect(within(panel).getByText("Hosted cron")).toBeInTheDocument();
    expect(within(panel).getByText("price-drop-run-1")).toBeInTheDocument();
    expect(within(panel).getByText("Trusted scheduled row")).toBeInTheDocument();
    expect(within(panel).getByText(/sanitized run rows/i)).toBeInTheDocument();
  });

  it("sends a checkout attempt UUID when starting Stripe checkout", async () => {
    renderStoreRoute();

    const buyNow = await screen.findByRole("button", {
      name: /buy now - 49\.99 eur/i,
    });
    fireEvent.click(buyNow);

    await waitFor(() => {
      expect(storeMocks.invokeFunction).toHaveBeenCalledWith(
        "stripe-create-checkout",
        expect.objectContaining({
          body: expect.objectContaining({
            checkout_attempt_id: expect.stringMatching(
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
            ),
            product_ids: expect.any(Array),
          }),
        }),
      );
    });
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
