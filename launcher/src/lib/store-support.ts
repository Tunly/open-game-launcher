import type { OrderStatus, StoreOrder, StoreOrderInvoice, StoreRefundRequest } from "./types/store";

export type StoreStagingCheckStatus = "pass" | "warning" | "blocked";

export interface StoreStagingReadinessCheck {
  label: string;
  status: StoreStagingCheckStatus;
  detail: string;
}

export interface StoreStripeLiveStagingContractRow {
  detail: string;
  evidence: string;
  id: string;
  label: string;
  status: StoreStagingCheckStatus;
}

export interface StoreStripeLiveStagingContract {
  apiVersion: string;
  guardCopy: string;
  guards: string[];
  rows: StoreStripeLiveStagingContractRow[];
  statusLabel: "Needs live project";
  summary: string;
  writeMode: "No verify-route write";
}

export interface StoreStagingReadiness {
  statusLabel: "Ready" | "Needs live run" | "Blocked";
  summary: string;
  checks: StoreStagingReadinessCheck[];
  liveContract: StoreStripeLiveStagingContract;
  passedCount: number;
  warningCount: number;
  blockedCount: number;
}

export const STORE_STRIPE_API_VERSION = "2026-05-27.dahlia";

export function canSyncStoreInvoice(orderStatus: OrderStatus): boolean {
  return ["paid", "fulfilled", "refunded"].includes(orderStatus);
}

export function getStoreInvoiceStatusLabel(
  invoice: StoreOrderInvoice | undefined,
  orderStatus: OrderStatus,
): string {
  const pdfUrl = invoice?.pdfUrl?.trim();
  const hostedUrl = invoice?.hostedInvoiceUrl?.trim();
  if (pdfUrl) return "PDF Ready";
  if (hostedUrl) return "Hosted Ready";
  if (invoice?.status === "available" && invoice.providerInvoiceId?.trim()) {
    return "Provider Ready";
  }
  if (invoice?.status === "void") return "Void";
  if (invoice?.status === "unavailable" || !canSyncStoreInvoice(orderStatus)) {
    return "Unavailable";
  }
  return "Sync Pending";
}

export function getStoreRefundProviderState(
  refundRequest: StoreRefundRequest | undefined,
  orderStatus: OrderStatus,
): string {
  const providerStatus = refundRequest?.providerRefundStatus?.trim().toLowerCase() ?? null;
  const hasProviderRefund = Boolean(refundRequest?.providerRefundId?.trim());
  if (
    providerStatus === "succeeded" ||
    (refundRequest?.status === "processed" && hasProviderRefund)
  ) {
    return "Refunded";
  }
  if (orderStatus === "refunded" || refundRequest?.status === "processed") {
    return "Refunded Locally";
  }
  if (providerStatus === "creating") return "Stripe Creating";
  if (providerStatus === "pending" || providerStatus === "requires_action") return "Stripe Pending";
  if (providerStatus === "failed") return "Stripe Failed";
  if (providerStatus === "canceled") return "Stripe Canceled";
  if (refundRequest?.providerRefundId && providerStatus) return `Stripe ${providerStatus}`;
  if (refundRequest?.providerRefundId) return "Stripe Staged";
  if (refundRequest) return "Provider Staged";
  return "Not Requested";
}

export function getStoreStripeStagingReadiness(input: {
  invoices: StoreOrderInvoice[];
  orders: StoreOrder[];
  refundRequests: StoreRefundRequest[];
}): StoreStagingReadiness {
  const stripeOrders = input.orders.filter(
    (order) => order.stripeSessionId || order.stripePaymentIntent,
  );
  const terminalStripeOrders = stripeOrders.filter((order) => canSyncStoreInvoice(order.status));
  const latestTerminalOrder = terminalStripeOrders[0] ?? stripeOrders[0] ?? null;
  const invoiceByOrderId = new Map(input.invoices.map((invoice) => [invoice.orderId, invoice]));
  const refundByOrderId = new Map(
    input.refundRequests.map((refundRequest) => [refundRequest.orderId, refundRequest]),
  );
  const latestInvoice = latestTerminalOrder ? invoiceByOrderId.get(latestTerminalOrder.id) : null;
  const latestRefund = latestTerminalOrder ? refundByOrderId.get(latestTerminalOrder.id) : null;
  const anyInvoiceReady = input.invoices.some(
    (invoice) => Boolean(invoice.pdfUrl?.trim()) || Boolean(invoice.hostedInvoiceUrl?.trim()),
  );
  const anyRefundSynced = input.refundRequests.some((refundRequest) =>
    ["Refunded", "Stripe Pending", "Stripe Staged"].includes(
      getStoreRefundProviderState(refundRequest, "fulfilled"),
    ),
  );

  const checks: StoreStagingReadinessCheck[] = [
    checkoutStagingCheck(stripeOrders, terminalStripeOrders),
    webhookFulfillmentCheck(latestTerminalOrder),
    invoiceStagingCheck(
      latestInvoice ?? undefined,
      latestTerminalOrder?.status ?? "pending",
      anyInvoiceReady,
    ),
    taxStagingCheck(latestTerminalOrder),
    refundStagingCheck(
      latestRefund ?? undefined,
      latestTerminalOrder?.status ?? "pending",
      anyRefundSynced,
    ),
    {
      detail:
        "Final go-live still requires a real Stripe CLI or Dashboard webhook delivery against staging secrets.",
      label: "Live webhook run",
      status: "warning",
    },
  ];
  const passedCount = checks.filter((check) => check.status === "pass").length;
  const warningCount = checks.filter((check) => check.status === "warning").length;
  const blockedCount = checks.filter((check) => check.status === "blocked").length;
  const statusLabel = blockedCount > 0 ? "Blocked" : warningCount > 0 ? "Needs live run" : "Ready";
  const summary =
    statusLabel === "Ready"
      ? "Stripe checkout, invoice, tax, and refund evidence are present for staging."
      : statusLabel === "Blocked"
        ? "Stripe staging has missing local evidence before a real webhook run can be trusted."
        : "Local Stripe evidence is present, but a real webhook/tax/invoice run is still required.";

  return {
    blockedCount,
    checks,
    liveContract: buildStoreStripeLiveStagingContract({
      hasInvoiceEvidence: Boolean(latestInvoice),
      hasRefundEvidence: Boolean(latestRefund),
      hasTerminalStripeOrder: Boolean(latestTerminalOrder),
    }),
    passedCount,
    statusLabel,
    summary,
    warningCount,
  };
}

function buildStoreStripeLiveStagingContract(input: {
  hasInvoiceEvidence: boolean;
  hasRefundEvidence: boolean;
  hasTerminalStripeOrder: boolean;
}): StoreStripeLiveStagingContract {
  return {
    apiVersion: STORE_STRIPE_API_VERSION,
    guardCopy:
      "Local Store Stripe live-staging contract only. It reviews signed-webhook ordering, Dashboard tax/invoice prerequisites, replay-ledger boundaries, and refund idempotency without sending Stripe requests or writing verify-route data.",
    guards: [
      "No raw Stripe key",
      "No webhook secret in UI",
      "No Dashboard success claim",
      "No refund replay success claim",
      "No verify-route write",
    ],
    rows: [
      {
        detail: `Edge client pins ${STORE_STRIPE_API_VERSION}; update Workbench and webhook endpoints during a real staging run.`,
        evidence: "Deno contract reads supabase/functions/_shared/stripe.ts",
        id: "api-version",
        label: "API version pin",
        status: "pass",
      },
      {
        detail: input.hasTerminalStripeOrder
          ? "Signed event parsing is contracted before replay-ledger claim; local order evidence can be reviewed."
          : "Signed event parsing is contracted before replay-ledger claim; no account order evidence loaded.",
        evidence: "stripe.webhooks.constructEvent before store_stripe_webhook_events claim",
        id: "signed-webhook",
        label: "Signed webhook first",
        status: "pass",
      },
      {
        detail: input.hasInvoiceEvidence
          ? "Checkout tax/invoice params and invoice row mapping are staged; Dashboard merchant/tax settings still need a live staging pass."
          : "Checkout tax/invoice params are staged; Dashboard merchant/tax settings still need a live staging pass.",
        evidence: "automatic_tax, tax_id_collection, invoice_creation, invoice sync row",
        id: "tax-invoice-dashboard",
        label: "Tax + invoice Dashboard",
        status: "warning",
      },
      {
        detail: input.hasRefundEvidence
          ? "Refund idempotency and provider-state mapping are staged; live replay still needs Stripe delivery proof."
          : "Refund idempotency is staged; live replay still needs Stripe delivery proof.",
        evidence: "store-order-refund idempotency key + replay-ledger finalizer contract",
        id: "refund-replay",
        label: "Refund replay ledger",
        status: "warning",
      },
      {
        detail:
          "Verify route can show fixture orders and contract rows without checkout, webhook, invoice sync, refund execution, or Supabase mutation.",
        evidence: "Store verify route uses deterministic browser fixtures",
        id: "no-write-verify",
        label: "No-write verify route",
        status: "pass",
      },
    ],
    statusLabel: "Needs live project",
    summary:
      "Contracts are staged for API version pinning, signature-first webhook parsing, tax/invoice setup review, refund replay, and no-write verification; real Stripe Dashboard and webhook delivery remain open.",
    writeMode: "No verify-route write",
  };
}

function checkoutStagingCheck(
  stripeOrders: StoreOrder[],
  terminalStripeOrders: StoreOrder[],
): StoreStagingReadinessCheck {
  if (stripeOrders.length === 0) {
    return {
      detail: "No Stripe-backed order is available in this account yet.",
      label: "Checkout session",
      status: "blocked",
    };
  }
  if (terminalStripeOrders.length === 0) {
    return {
      detail: "Stripe checkout returned an order, but it has not reached paid/fulfilled/refunded.",
      label: "Checkout session",
      status: "warning",
    };
  }
  const order = terminalStripeOrders[0];
  const providerReference = order.stripeSessionId ?? order.stripePaymentIntent;
  return {
    detail: order.stripeSessionId
      ? `Session ${order.stripeSessionId} reached ${order.status}.`
      : `PaymentIntent ${providerReference} reached ${order.status}.`,
    label: "Checkout session",
    status: "pass",
  };
}

function webhookFulfillmentCheck(order: StoreOrder | null): StoreStagingReadinessCheck {
  if (!order) {
    return {
      detail: "Webhook fulfillment cannot be proven without a terminal Stripe order.",
      label: "Webhook fulfillment",
      status: "blocked",
    };
  }
  if (order.status === "fulfilled" || order.status === "refunded") {
    return {
      detail: `Order ${order.id.slice(0, 8)} reached ${order.status} after payment processing.`,
      label: "Webhook fulfillment",
      status: "pass",
    };
  }
  return {
    detail: "Payment is paid, but fulfillment/license issuance still needs webhook evidence.",
    label: "Webhook fulfillment",
    status: "warning",
  };
}

function invoiceStagingCheck(
  invoice: StoreOrderInvoice | undefined,
  orderStatus: OrderStatus,
  anyInvoiceReady: boolean,
): StoreStagingReadinessCheck {
  const label = getStoreInvoiceStatusLabel(invoice, orderStatus);
  if (label === "PDF Ready" || label === "Hosted Ready" || label === "Provider Ready") {
    return {
      detail: `${label} from ${invoice?.provider ?? "stripe"} with provider id ${
        invoice?.providerInvoiceId ?? "pending"
      }.`,
      label: "Stripe invoice",
      status: "pass",
    };
  }
  if (anyInvoiceReady) {
    return {
      detail: "Another order has Stripe invoice evidence, but this latest order still needs sync.",
      label: "Stripe invoice",
      status: "warning",
    };
  }
  return {
    detail: `${label}; sync must retrieve Checkout Session, PaymentIntent, or invoice webhook data.`,
    label: "Stripe invoice",
    status: "warning",
  };
}

function taxStagingCheck(order: StoreOrder | null): StoreStagingReadinessCheck {
  if (!order) {
    return {
      detail: "Tax evidence requires a paid Stripe order with persisted totals.",
      label: "Tax capture",
      status: "blocked",
    };
  }
  if (order.taxCents > 0) {
    return {
      detail: `${order.taxCents} cents of tax were persisted on order ${order.id.slice(0, 8)}.`,
      label: "Tax capture",
      status: "pass",
    };
  }
  return {
    detail:
      "Order has zero tax; confirm Stripe Tax, merchant address, and customer location in staging.",
    label: "Tax capture",
    status: "warning",
  };
}

function refundStagingCheck(
  refundRequest: StoreRefundRequest | undefined,
  orderStatus: OrderStatus,
  anyRefundSynced: boolean,
): StoreStagingReadinessCheck {
  const state = getStoreRefundProviderState(refundRequest, orderStatus);
  if (state === "Refunded") {
    return {
      detail: `Stripe refund ${refundRequest?.providerRefundId ?? "provider id pending"} synced as ${state}.`,
      label: "Refund sync",
      status: "pass",
    };
  }
  if (state !== "Not Requested") {
    return {
      detail: `Refund provider state is ${state}; webhook finalization still needs confirmation.`,
      label: "Refund sync",
      status: "warning",
    };
  }
  if (anyRefundSynced) {
    return {
      detail:
        "A refund exists on another order, but the latest paid order has no refund path exercised.",
      label: "Refund sync",
      status: "warning",
    };
  }
  return {
    detail: "No Stripe refund has been requested from this account yet.",
    label: "Refund sync",
    status: "warning",
  };
}
