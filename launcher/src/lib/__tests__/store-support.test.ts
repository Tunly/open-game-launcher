import { describe, expect, it } from "vitest";
import {
  canSyncStoreInvoice,
  getStoreInvoiceStatusLabel,
  getStoreRefundProviderState,
  getStoreStripeStagingReadiness,
  STORE_STRIPE_API_VERSION,
} from "../store-support";
import type { StoreOrder, StoreOrderInvoice, StoreRefundRequest } from "../types/store";

function makeOrder(overrides: Partial<StoreOrder> = {}): StoreOrder {
  return {
    createdAt: "2026-06-10T10:00:00.000Z",
    currency: "eur",
    id: "order-1",
    paidAt: "2026-06-10T10:01:00.000Z",
    paymentMethod: "card",
    status: "fulfilled",
    stripePaymentIntent: "pi_1",
    stripeSessionId: "cs_1",
    subtotalCents: 1999,
    taxCents: 380,
    totalCents: 2379,
    updatedAt: "2026-06-10T10:02:00.000Z",
    userId: "user-1",
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<StoreOrderInvoice> = {}): StoreOrderInvoice {
  return {
    createdAt: "2026-06-10T10:00:00.000Z",
    hostedInvoiceUrl: null,
    id: "invoice-1",
    invoiceNumber: null,
    issuedAt: null,
    metadata: {},
    orderId: "order-1",
    pdfUrl: null,
    provider: "stripe",
    providerInvoiceId: null,
    status: "pending",
    updatedAt: "2026-06-10T10:00:00.000Z",
    userId: "user-1",
    ...overrides,
  };
}

function makeRefund(overrides: Partial<StoreRefundRequest> = {}): StoreRefundRequest {
  return {
    cancelledAt: null,
    createdAt: "2026-06-10T10:00:00.000Z",
    details: null,
    failureReason: null,
    id: "refund-1",
    metadata: {},
    orderId: "order-1",
    processedAt: null,
    provider: "stripe",
    providerRefundId: null,
    providerRefundStatus: null,
    reason: "duplicate_purchase",
    refundAmountCents: null,
    requestedAt: "2026-06-10T10:00:00.000Z",
    reviewedAt: null,
    status: "requested",
    updatedAt: "2026-06-10T10:00:00.000Z",
    userId: "user-1",
    ...overrides,
  };
}

describe("store support labels", () => {
  it("only allows invoice sync for paid terminal order states", () => {
    expect(canSyncStoreInvoice("pending")).toBe(false);
    expect(canSyncStoreInvoice("fulfilled")).toBe(true);
    expect(canSyncStoreInvoice("refunded")).toBe(true);
  });

  it("distinguishes Stripe hosted invoices from missing PDFs", () => {
    expect(
      getStoreInvoiceStatusLabel(
        makeInvoice({ hostedInvoiceUrl: "https://stripe.test/i" }),
        "paid",
      ),
    ).toBe("Hosted Ready");
    expect(
      getStoreInvoiceStatusLabel(makeInvoice({ pdfUrl: "https://stripe.test/i.pdf" }), "paid"),
    ).toBe("PDF Ready");
    expect(
      getStoreInvoiceStatusLabel(
        makeInvoice({ providerInvoiceId: "in_test_redacted", status: "available" }),
        "paid",
      ),
    ).toBe("Provider Ready");
    expect(getStoreInvoiceStatusLabel(makeInvoice({ status: "unavailable" }), "fulfilled")).toBe(
      "Unavailable",
    );
  });

  it("shows provider refund state without assuming a local refund is complete", () => {
    expect(
      getStoreRefundProviderState(
        makeRefund({
          providerRefundId: "re_1",
          providerRefundStatus: "pending",
          status: "approved",
        }),
        "fulfilled",
      ),
    ).toBe("Stripe Pending");
    expect(
      getStoreRefundProviderState(
        makeRefund({
          providerRefundId: "re_2",
          providerRefundStatus: "requires_action",
          status: "approved",
        }),
        "fulfilled",
      ),
    ).toBe("Stripe Pending");
    expect(
      getStoreRefundProviderState(
        makeRefund({
          providerRefundId: "re_1",
          providerRefundStatus: "succeeded",
          status: "processed",
        }),
        "refunded",
      ),
    ).toBe("Refunded");
    expect(getStoreRefundProviderState(undefined, "refunded")).toBe("Refunded Locally");
  });

  it("summarizes complete Stripe staging evidence while keeping live webhook run visible", () => {
    const readiness = getStoreStripeStagingReadiness({
      invoices: [
        makeInvoice({
          hostedInvoiceUrl: "https://stripe.test/invoice",
          invoiceNumber: "INV-1",
          providerInvoiceId: "in_1",
          status: "available",
        }),
      ],
      orders: [makeOrder()],
      refundRequests: [
        makeRefund({
          providerRefundId: "re_1",
          providerRefundStatus: "succeeded",
          status: "processed",
        }),
      ],
    });

    expect(readiness.statusLabel).toBe("Needs live run");
    expect(readiness.blockedCount).toBe(0);
    expect(readiness.passedCount).toBeGreaterThanOrEqual(5);
    expect(readiness.liveContract.apiVersion).toBe(STORE_STRIPE_API_VERSION);
    expect(readiness.liveContract.writeMode).toBe("No verify-route write");
    expect(readiness.liveContract.guards).toContain("No raw Stripe key");
    expect(readiness.liveContract.guards).toContain("No webhook secret in UI");
    expect(readiness.liveContract.guards).toContain("No Dashboard success claim");
    expect(readiness.liveContract.guards).toContain("No refund replay success claim");
    expect(readiness.liveContract.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "API version pin", status: "pass" }),
        expect.objectContaining({ label: "Signed webhook first", status: "pass" }),
        expect.objectContaining({ label: "Tax + invoice Dashboard", status: "warning" }),
        expect.objectContaining({ label: "Refund replay ledger", status: "warning" }),
        expect.objectContaining({ label: "No-write verify route", status: "pass" }),
      ]),
    );
    expect(JSON.stringify(readiness.liveContract)).not.toMatch(/sk_live|whsec_|rk_live/i);
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Checkout session", status: "pass" }),
        expect.objectContaining({ label: "Stripe invoice", status: "pass" }),
        expect.objectContaining({ label: "Tax capture", status: "pass" }),
        expect.objectContaining({ label: "Refund sync", status: "pass" }),
        expect.objectContaining({ label: "Live webhook run", status: "warning" }),
      ]),
    );
  });

  it("blocks readiness when there is no Stripe-backed order evidence", () => {
    const readiness = getStoreStripeStagingReadiness({
      invoices: [],
      orders: [],
      refundRequests: [],
    });

    expect(readiness.statusLabel).toBe("Blocked");
    expect(readiness.blockedCount).toBeGreaterThanOrEqual(2);
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Checkout session", status: "blocked" }),
        expect.objectContaining({ label: "Webhook fulfillment", status: "blocked" }),
      ]),
    );
  });

  it("does not treat local paid orders as Stripe staging evidence", () => {
    const readiness = getStoreStripeStagingReadiness({
      invoices: [],
      orders: [
        makeOrder({
          stripePaymentIntent: null,
          stripeSessionId: null,
          totalCents: 2379,
        }),
      ],
      refundRequests: [],
    });

    expect(readiness.statusLabel).toBe("Blocked");
    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Checkout session", status: "blocked" }),
      ]),
    );
  });

  it("requires provider refund evidence before marking refund sync as passed", () => {
    const readiness = getStoreStripeStagingReadiness({
      invoices: [],
      orders: [makeOrder({ status: "refunded" })],
      refundRequests: [],
    });

    expect(readiness.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Refund sync", status: "warning" }),
      ]),
    );
  });
});
