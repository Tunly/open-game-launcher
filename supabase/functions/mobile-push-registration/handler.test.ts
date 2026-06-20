import {
  handleMobilePushRegistrationRequest,
  type MobilePushRegistrationHandlerDeps,
} from "./handler.ts";
import type { MobilePushRegistrationMutationPlan } from "./contract.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const registrationId = "22222222-2222-4222-8222-222222222222";
const tokenHash =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

Deno.test(
  "mobile push registration handler answers CORS preflight",
  async () => {
    const response = await handleMobilePushRegistrationRequest(
      new Request("https://functions.example/mobile-push-registration", {
        method: "OPTIONS",
      }),
      stubDeps(),
    );

    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
    assertEquals(
      response.headers.get("Access-Control-Allow-Methods"),
      "POST, OPTIONS",
    );
  },
);

Deno.test("mobile push registration handler requires caller auth", async () => {
  const response = await handleMobilePushRegistrationRequest(
    jsonRequest({ consentGranted: true, platform: "ios", tokenHash }),
    stubDeps({ userId: null }),
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "Invalid or expired token." });
});

Deno.test(
  "mobile push registration handler registers hashed tokens without push-send claims",
  async () => {
    const plans: MobilePushRegistrationMutationPlan[] = [];
    const response = await handleMobilePushRegistrationRequest(
      jsonRequest({
        action: "register",
        consentGranted: true,
        permissionStatus: "prompt",
        platform: "fcm",
        tokenHash,
        tokenHint: "fcm...9999",
      }),
      stubDeps({ plans }),
    );

    assertEquals(response.status, 200);
    assertEquals(await response.json(), {
      action: "register",
      consentGranted: true,
      permissionStatus: "prompt",
      platform: "android",
      pushDelivery: "not_sent",
      rawTokenStored: false,
      registrationId,
      status: "registered",
      tokenHint: "fcm...9999",
      updatedAt: "2026-06-14T12:00:00.000Z",
    });
    assertEquals(plans, [
      {
        action: "upsert",
        registrationId: null,
        row: {
          consent_granted: true,
          owner_id: userId,
          permission_status: "prompt",
          platform: "android",
          token_hash: tokenHash,
          token_hint: "fcm...9999",
        },
        status: "ok",
      },
    ]);
    assertEquals(JSON.stringify(plans).includes("deviceToken"), false);
  },
);

Deno.test(
  "mobile push registration handler rejects raw device tokens",
  async () => {
    const plans: MobilePushRegistrationMutationPlan[] = [];
    const response = await handleMobilePushRegistrationRequest(
      jsonRequest({
        consentGranted: true,
        deviceToken: "apns-live-device-token-c999",
        platform: "ios",
        tokenHash,
      }),
      stubDeps({ plans }),
    );

    assertEquals(response.status, 400);
    assertEquals(await response.json(), {
      error: "Raw device tokens are not accepted.",
    });
    assertEquals(plans, []);
  },
);

Deno.test(
  "mobile push registration handler unregisters owner-scoped rows",
  async () => {
    const plans: MobilePushRegistrationMutationPlan[] = [];
    const response = await handleMobilePushRegistrationRequest(
      jsonRequest({ action: "unregister", registrationId }),
      stubDeps({ plans }),
    );

    assertEquals(response.status, 200);
    assertEquals(await response.json(), {
      action: "unregister",
      deleted: true,
      pushDelivery: "not_sent",
      rawTokenStored: false,
      registrationId,
      status: "unregistered",
    });
    assertEquals(plans, [
      {
        action: "delete",
        ownerId: userId,
        registrationId,
        status: "ok",
      },
    ]);
  },
);

function jsonRequest(body: Record<string, unknown>) {
  return new Request("https://functions.example/mobile-push-registration", {
    body: JSON.stringify(body),
    headers: {
      Authorization: "Bearer user-jwt",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

function stubDeps(
  options: {
    plans?: MobilePushRegistrationMutationPlan[];
    userId?: string | null;
  } = {},
): MobilePushRegistrationHandlerDeps {
  return {
    applyMutation: async (plan) => {
      options.plans?.push(plan);
      if (plan.status === "error") throw new Error(plan.error);
      if (plan.action === "delete") {
        return {
          action: "delete",
          deleted: true,
          registrationId: plan.registrationId,
        };
      }

      return {
        action: "upsert",
        registrationId,
        updatedAt: "2026-06-14T12:00:00.000Z",
      };
    },
    getAuthenticatedUserId: async () =>
      Object.hasOwn(options, "userId") ? options.userId! : userId,
  };
}

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
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
