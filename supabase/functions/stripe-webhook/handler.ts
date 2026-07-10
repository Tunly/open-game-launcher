import { corsHeaders } from "../_shared/cors.ts";

export interface ClaimedStripeWebhookEvent {
  id: string;
  claimUpdatedAt: string;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: unknown };
}

export interface StripeWebhookHandlerDeps {
  claimStoreStripeWebhookEvent: (
    eventId: string,
    eventType: string,
  ) => Promise<ClaimedStripeWebhookEvent | null>;
  constructEvent: (
    body: string,
    signature: string,
    secret: string,
  ) => StripeWebhookEvent | Promise<StripeWebhookEvent>;
  fulfillCheckoutSession: (
    sessionId: string,
    licenseDeviceId: string | null,
    checkoutSession: unknown,
  ) => Promise<void>;
  isSignatureVerificationError: (error: unknown) => boolean;
  logError?: (...args: unknown[]) => void;
  logUnhandledEvent?: (eventType: string) => void;
  markStoreStripeWebhookEventFailed: (
    claim: ClaimedStripeWebhookEvent,
    error: unknown,
  ) => Promise<boolean>;
  markStoreStripeWebhookEventProcessed: (
    claim: ClaimedStripeWebhookEvent,
  ) => Promise<boolean>;
  persistCheckoutSessionProgress: (
    sessionId: string,
    checkoutSession: unknown,
    status?: "expired" | "failed" | "pending",
  ) => Promise<void>;
  requireWebhookSecret: () => string;
  syncStoreInvoiceFromStripeInvoice: (
    invoice: unknown,
    eventType: string,
  ) => Promise<unknown>;
  syncStoreRefundFromStripeRefund: (refund: unknown) => Promise<void>;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function checkoutSessionId(checkoutSession: unknown): string {
  const id = readString(asRecord(checkoutSession).id);
  if (!id) {
    throw new Error("Stripe checkout session id missing");
  }
  return id;
}

function checkoutSessionPaymentStatus(checkoutSession: unknown): string | null {
  return readString(asRecord(checkoutSession).payment_status);
}

function checkoutSessionLicenseDeviceId(
  checkoutSession: unknown,
): string | null {
  return readString(asRecord(asRecord(checkoutSession).metadata).device_id);
}

function isCheckoutSessionPaid(checkoutSession: unknown): boolean {
  const paymentStatus = checkoutSessionPaymentStatus(checkoutSession);
  return paymentStatus === "paid" || paymentStatus === "no_payment_required";
}

export async function handleStripeWebhook(
  req: Request,
  deps: StripeWebhookHandlerDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let claimedWebhookEvent: ClaimedStripeWebhookEvent | null = null;
  try {
    const signature = req.headers.get("Stripe-Signature");
    if (!signature) {
      return jsonResponse({ error: "Missing Stripe-Signature header" }, 400);
    }

    const body = await req.text();
    const secret = deps.requireWebhookSecret();
    const event = await deps.constructEvent(body, signature, secret);
    const claimedEvent = await deps.claimStoreStripeWebhookEvent(
      event.id,
      event.type,
    );
    if (!claimedEvent) {
      return jsonResponse({ duplicate: true, received: true });
    }
    claimedWebhookEvent = claimedEvent;

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const licenseDeviceId = checkoutSessionLicenseDeviceId(session);
        if (!isCheckoutSessionPaid(session)) {
          await deps.persistCheckoutSessionProgress(
            checkoutSessionId(session),
            session,
            "pending",
          );
          break;
        }
        await deps.fulfillCheckoutSession(
          checkoutSessionId(session),
          licenseDeviceId,
          session,
        );
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        await deps.fulfillCheckoutSession(
          checkoutSessionId(session),
          checkoutSessionLicenseDeviceId(session),
          session,
        );
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object;
        await deps.persistCheckoutSessionProgress(
          checkoutSessionId(session),
          session,
          "failed",
        );
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object;
        await deps.persistCheckoutSessionProgress(
          checkoutSessionId(session),
          session,
          "expired",
        );
        break;
      }
      case "refund.created":
      case "refund.updated": {
        await deps.syncStoreRefundFromStripeRefund(event.data.object);
        break;
      }
      case "charge.refunded": {
        const charge = asRecord(event.data.object);
        const refunds = Array.isArray(asRecord(charge.refunds).data)
          ? asRecord(charge.refunds).data as unknown[]
          : [];
        for (const refund of refunds) {
          await deps.syncStoreRefundFromStripeRefund({
            ...asRecord(refund),
            payment_intent: charge.payment_intent,
          });
        }
        break;
      }
      case "invoice.created":
      case "invoice.finalized":
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice.updated":
      case "invoice.voided": {
        await deps.syncStoreInvoiceFromStripeInvoice(
          event.data.object,
          event.type,
        );
        break;
      }
      default:
        deps.logUnhandledEvent?.(event.type);
    }

    await deps.markStoreStripeWebhookEventProcessed(claimedEvent);
    claimedWebhookEvent = null;
    return jsonResponse({ received: true });
  } catch (err) {
    if (claimedWebhookEvent) {
      await deps.markStoreStripeWebhookEventFailed(claimedWebhookEvent, err)
        .catch((markError) => {
          deps.logError?.(
            "Failed to persist Stripe webhook failure:",
            markError,
          );
        });
    }
    if (deps.isSignatureVerificationError(err)) {
      deps.logError?.("Stripe signature verification failed:", err);
      return jsonResponse({ error: "Invalid signature" }, 400);
    }
    deps.logError?.("Webhook error:", err);
    return jsonResponse(
      { error: "Webhook processing failed." },
      500,
    );
  }
}
