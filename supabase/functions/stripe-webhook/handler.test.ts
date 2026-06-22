import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  type ClaimedStripeWebhookEvent,
  handleStripeWebhook,
  type StripeWebhookEvent,
  type StripeWebhookHandlerDeps,
} from "./handler.ts";

const claim: ClaimedStripeWebhookEvent = {
  claimUpdatedAt: "2026-06-15T12:00:00.000Z",
  id: "evt_1",
};

class SignatureError extends Error {}

Deno.test("stripe webhook handler answers CORS and requires signature before secrets", async () => {
  const calls = callLog();
  const optionsResponse = await handleStripeWebhook(
    new Request("https://functions.example/stripe-webhook", {
      method: "OPTIONS",
    }),
    stubDeps({ calls }),
  );
  assertEquals(optionsResponse.status, 200);
  assertEquals(optionsResponse.headers.get("Access-Control-Allow-Origin"), "*");

  const getResponse = await handleStripeWebhook(
    new Request("https://functions.example/stripe-webhook", {
      method: "GET",
    }),
    stubDeps({ calls }),
  );
  assertEquals(getResponse.status, 405);
  assertEquals(await getResponse.json(), { error: "Method not allowed." });

  const missingSignatureResponse = await handleStripeWebhook(
    stripeRequest("{}", null),
    stubDeps({ calls }),
  );

  assertEquals(missingSignatureResponse.status, 400);
  assertEquals(await missingSignatureResponse.json(), {
    error: "Missing Stripe-Signature header",
  });
  assertEquals(calls.secrets, 0);
  assertEquals(calls.claims, []);
});

Deno.test("stripe webhook handler rejects invalid signatures before claiming events", async () => {
  const calls = callLog();
  const response = await handleStripeWebhook(
    stripeRequest("raw-body", "bad-signature"),
    stubDeps({
      calls,
      constructEvent: () => {
        throw new SignatureError("bad signature");
      },
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: "Invalid signature" });
  assertEquals(calls.claims, []);
  assertEquals(calls.failed, []);
});

Deno.test("stripe webhook handler returns duplicate response for already claimed events", async () => {
  const calls = callLog();
  const response = await handleStripeWebhook(
    stripeRequest("{}"),
    stubDeps({ calls, claimedEvent: null }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { duplicate: true, received: true });
  assertEquals(calls.claims, [{ eventId: "evt_1", eventType: "ping" }]);
  assertEquals(calls.processed, []);
  assertEquals(calls.failed, []);
});

Deno.test("stripe webhook handler fulfills paid checkout sessions and finalizes claim", async () => {
  const calls = callLog();
  const session = {
    id: "cs_paid",
    metadata: { device_id: "device-1" },
    payment_status: "paid",
  };
  const response = await handleStripeWebhook(
    stripeRequest("{}"),
    stubDeps({
      calls,
      event: event("checkout.session.completed", session),
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { received: true });
  assertEquals(calls.fulfilled, [{
    deviceId: "device-1",
    session,
    sessionId: "cs_paid",
  }]);
  assertEquals(calls.progress, []);
  assertEquals(calls.processed, [claim]);
});

Deno.test("stripe webhook handler treats no-payment-required sessions as fulfilled", async () => {
  const calls = callLog();
  const session = {
    id: "cs_free",
    metadata: {},
    payment_status: "no_payment_required",
  };
  const response = await handleStripeWebhook(
    stripeRequest("{}"),
    stubDeps({
      calls,
      event: event("checkout.session.completed", session),
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(calls.fulfilled, [{
    deviceId: null,
    session,
    sessionId: "cs_free",
  }]);
  assertEquals(calls.progress, []);
});

Deno.test("stripe webhook handler records pending progress for unpaid completed sessions", async () => {
  const calls = callLog();
  const session = {
    id: "cs_pending",
    metadata: { device_id: "device-1" },
    payment_status: "unpaid",
  };
  const response = await handleStripeWebhook(
    stripeRequest("{}"),
    stubDeps({
      calls,
      event: event("checkout.session.completed", session),
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(calls.fulfilled, []);
  assertEquals(calls.progress, [{
    session,
    sessionId: "cs_pending",
    status: "pending",
  }]);
});

Deno.test("stripe webhook handler routes async success failed and expired sessions", async () => {
  const successCalls = callLog();
  const successSession = {
    id: "cs_async_success",
    metadata: { device_id: "device-async" },
  };
  const successResponse = await handleStripeWebhook(
    stripeRequest("{}"),
    stubDeps({
      calls: successCalls,
      event: event(
        "checkout.session.async_payment_succeeded",
        successSession,
      ),
    }),
  );
  assertEquals(successResponse.status, 200);
  assertEquals(successCalls.fulfilled, [{
    deviceId: "device-async",
    session: successSession,
    sessionId: "cs_async_success",
  }]);

  for (
    const [eventType, status] of [
      ["checkout.session.async_payment_failed", "failed"],
      ["checkout.session.expired", "expired"],
    ] as const
  ) {
    const calls = callLog();
    const session = { id: `cs_${status}` };
    const response = await handleStripeWebhook(
      stripeRequest("{}"),
      stubDeps({ calls, event: event(eventType, session) }),
    );
    assertEquals(response.status, 200);
    assertEquals(calls.progress, [{ session, sessionId: session.id, status }]);
    assertEquals(calls.fulfilled, []);
  }
});

Deno.test("stripe webhook handler fans out charge refund payloads with payment intent", async () => {
  const calls = callLog();
  const response = await handleStripeWebhook(
    stripeRequest("{}"),
    stubDeps({
      calls,
      event: event("charge.refunded", {
        payment_intent: "pi_1",
        refunds: { data: [{ id: "re_1" }, { id: "re_2" }] },
      }),
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(calls.refunds, [
    { id: "re_1", payment_intent: "pi_1" },
    { id: "re_2", payment_intent: "pi_1" },
  ]);
  assertEquals(calls.processed, [claim]);
});

Deno.test("stripe webhook handler routes direct refund events", async () => {
  for (const eventType of ["refund.created", "refund.updated"]) {
    const calls = callLog();
    const refund = { id: `${eventType}_re_1` };
    const response = await handleStripeWebhook(
      stripeRequest("{}"),
      stubDeps({ calls, event: event(eventType, refund) }),
    );

    assertEquals(response.status, 200);
    assertEquals(calls.refunds, [refund]);
    assertEquals(calls.processed, [claim]);
  }
});

Deno.test("stripe webhook handler routes invoice events to invoice sync", async () => {
  const calls = callLog();
  const invoice = { id: "in_1" };
  const response = await handleStripeWebhook(
    stripeRequest("{}"),
    stubDeps({
      calls,
      event: event("invoice.updated", invoice),
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(calls.invoices, [{ eventType: "invoice.updated", invoice }]);
  assertEquals(calls.processed, [claim]);
});

Deno.test("stripe webhook handler logs and finalizes unhandled events", async () => {
  const calls = callLog();
  const response = await handleStripeWebhook(
    stripeRequest("{}"),
    stubDeps({
      calls,
      event: event("customer.updated", { id: "cus_1" }),
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { received: true });
  assertEquals(calls.unhandled, ["customer.updated"]);
  assertEquals(calls.processed, [claim]);
});

Deno.test("stripe webhook handler marks claimed events failed on processing errors", async () => {
  const calls = callLog();
  const error = new Error("fulfillment failed");
  const response = await handleStripeWebhook(
    stripeRequest("{}"),
    stubDeps({
      calls,
      event: event("checkout.session.async_payment_succeeded", {
        id: "cs_failed",
        metadata: { device_id: "device-1" },
      }),
      fulfillCheckoutSession: () => {
        throw error;
      },
    }),
  );

  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: "fulfillment failed" });
  assertEquals(calls.processed, []);
  assertEquals(calls.failed.length, 1);
  assertEquals(calls.failed[0].claim, claim);
  assertStrictEquals(calls.failed[0].error, error);
});

Deno.test("stripe webhook handler returns generic errors before claiming without failed ledger writes", async () => {
  const calls = callLog();
  const response = await handleStripeWebhook(
    stripeRequest("{}"),
    stubDeps({
      calls,
      requireWebhookSecret: () => {
        throw new Error("missing secret");
      },
    }),
  );

  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: "missing secret" });
  assertEquals(calls.claims, []);
  assertEquals(calls.failed, []);
});

function stripeRequest(body: string, signature: string | null = "sig_test") {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (signature !== null) {
    headers.set("Stripe-Signature", signature);
  }
  return new Request("https://functions.example/stripe-webhook", {
    body,
    headers,
    method: "POST",
  });
}

function event(type: string, object: unknown): StripeWebhookEvent {
  return {
    data: { object },
    id: "evt_1",
    type,
  };
}

function callLog() {
  return {
    claims: [] as Array<{ eventId: string; eventType: string }>,
    failed: [] as Array<{ claim: ClaimedStripeWebhookEvent; error: unknown }>,
    fulfilled: [] as Array<
      { deviceId: string | null; session: unknown; sessionId: string }
    >,
    invoices: [] as Array<{ eventType: string; invoice: unknown }>,
    processed: [] as ClaimedStripeWebhookEvent[],
    progress: [] as Array<
      { session: unknown; sessionId: string; status?: string }
    >,
    refunds: [] as unknown[],
    secrets: 0,
    unhandled: [] as string[],
  };
}

function stubDeps(
  options: {
    calls?: ReturnType<typeof callLog>;
    claimedEvent?: ClaimedStripeWebhookEvent | null;
    constructEvent?: StripeWebhookHandlerDeps["constructEvent"];
    event?: StripeWebhookEvent;
    fulfillCheckoutSession?: StripeWebhookHandlerDeps["fulfillCheckoutSession"];
    requireWebhookSecret?: StripeWebhookHandlerDeps["requireWebhookSecret"];
  } = {},
): StripeWebhookHandlerDeps {
  const calls = options.calls ?? callLog();
  return {
    claimStoreStripeWebhookEvent: async (eventId, eventType) => {
      calls.claims.push({ eventId, eventType });
      return options.claimedEvent === undefined ? claim : options.claimedEvent;
    },
    constructEvent: options.constructEvent ??
      (() => options.event ?? event("ping", { id: "obj_1" })),
    fulfillCheckoutSession: async (sessionId, deviceId, session) => {
      if (options.fulfillCheckoutSession) {
        await options.fulfillCheckoutSession(sessionId, deviceId, session);
        return;
      }
      calls.fulfilled.push({ deviceId, session, sessionId });
    },
    isSignatureVerificationError: (error) => error instanceof SignatureError,
    logError: () => {},
    logUnhandledEvent: (eventType) => calls.unhandled.push(eventType),
    markStoreStripeWebhookEventFailed: async (failedClaim, error) => {
      calls.failed.push({ claim: failedClaim, error });
      return true;
    },
    markStoreStripeWebhookEventProcessed: async (processedClaim) => {
      calls.processed.push(processedClaim);
      return true;
    },
    persistCheckoutSessionProgress: async (sessionId, session, status) => {
      calls.progress.push({ session, sessionId, status });
    },
    requireWebhookSecret: options.requireWebhookSecret ??
      (() => {
        calls.secrets += 1;
        return "whsec_test";
      }),
    syncStoreInvoiceFromStripeInvoice: async (invoice, eventType) => {
      calls.invoices.push({ eventType, invoice });
    },
    syncStoreRefundFromStripeRefund: async (refund) => {
      calls.refunds.push(refund);
    },
  };
}
