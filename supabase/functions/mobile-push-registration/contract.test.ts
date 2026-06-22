import {
  buildMobilePushRegistrationMutationPlan,
  readMobilePushRegistrationRequest,
} from "./contract.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const registrationId = "22222222-2222-4222-8222-222222222222";
const tokenHash =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

Deno.test(
  "mobile push registration parses consented token-hash registration",
  () => {
    assertEquals(
      readMobilePushRegistrationRequest({
        action: "register",
        consentGranted: true,
        deviceLabel: " Steam Deck Companion ",
        permissionStatus: "granted",
        platform: "APNS",
        tokenHash,
        tokenHint: "apns...c999",
      }),
      {
        action: "register",
        consentGranted: true,
        deviceLabel: "Steam Deck Companion",
        permissionStatus: "granted",
        platform: "ios",
        status: "ok",
        tokenHash,
        tokenHint: "apns...c999",
      },
    );
  },
);

Deno.test(
  "mobile push registration rejects raw token payloads and invalid hashes",
  () => {
    assertEquals(
      readMobilePushRegistrationRequest({
        action: "register",
        consentGranted: true,
        deviceToken: "apns-live-device-token-9999999999c999",
        platform: "ios",
        tokenHash,
      }),
      {
        error: "Raw device tokens are not accepted.",
        status: "error",
        statusCode: 400,
      },
    );

    assertEquals(
      readMobilePushRegistrationRequest({
        action: "register",
        consentGranted: true,
        platform: "ios",
        tokenHash: "raw-device-token",
      }),
      {
        error: "token_hash must be sha256:<64 hex>",
        status: "error",
        statusCode: 400,
      },
    );
  },
);

Deno.test("mobile push registration redacts token-shaped hints", () => {
  const tokenShapedHints = [
    "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    "eyJhbGciOiJIUzI1NiJ9.eyJmb28iOiJiYXIifQ.abcdef0123456789",
    "dR_xY6LqSTm9uZ02bLqZfA:APA91bHvzY4qhz5m1x8v8fCMliveValue",
  ];

  for (const tokenHint of tokenShapedHints) {
    const register = readMobilePushRegistrationRequest({
      action: "register",
      consentGranted: true,
      platform: "ios",
      tokenHash,
      tokenHint,
    });

    assertEquals(register, {
      action: "register",
      consentGranted: true,
      deviceLabel: "Mobile Companion",
      permissionStatus: "granted",
      platform: "ios",
      status: "ok",
      tokenHash,
      tokenHint: "token hint redacted",
    });

    const plan = buildMobilePushRegistrationMutationPlan(userId, register);
    assertEquals(JSON.stringify(plan).includes(tokenHint), false);
  }
});

Deno.test("mobile push registration requires consent before register", () => {
  assertEquals(
    readMobilePushRegistrationRequest({
      action: "register",
      consentGranted: false,
      platform: "android",
      tokenHash,
    }),
    {
      error: "consent_granted must be true for registration.",
      status: "error",
      statusCode: 400,
    },
  );
});

Deno.test("mobile push registration parses unregister requests", () => {
  assertEquals(
    readMobilePushRegistrationRequest({
      action: "unregister",
      registrationId,
    }),
    {
      action: "unregister",
      registrationId,
      status: "ok",
    },
  );
});

Deno.test(
  "mobile push registration mutation plans are owner scoped and redacted",
  () => {
    const register = readMobilePushRegistrationRequest({
      action: "register",
      consent_granted: true,
      platform: "fcm",
      token_hash: tokenHash,
      token_hint: "fcm...9999",
    });
    const registerPlan = buildMobilePushRegistrationMutationPlan(
      userId,
      register,
    );

    assertEquals(registerPlan, {
      action: "upsert",
      registrationId: null,
      row: {
        consent_granted: true,
        owner_id: userId,
        permission_status: "granted",
        platform: "android",
        token_hash: tokenHash,
        token_hint: "fcm...9999",
      },
      status: "ok",
    });
    assertEquals(JSON.stringify(registerPlan).includes("deviceToken"), false);
    assertEquals(
      JSON.stringify(registerPlan).includes("apns-live-device-token"),
      false,
    );

    const unregister = readMobilePushRegistrationRequest({
      action: "unregister",
      registration_id: registrationId,
    });

    assertEquals(buildMobilePushRegistrationMutationPlan(userId, unregister), {
      action: "delete",
      ownerId: userId,
      registrationId,
      status: "ok",
    });
  },
);

Deno.test(
  "mobile push registration migration keeps client writes service-role only",
  async () => {
    const migration = normalizeSql(
      await Deno.readTextFile(
        new URL(
          "../../migrations/20260614120000_mobile_push_registration_contract.sql",
          import.meta.url,
        ),
      ),
    );

    assertIncludes(
      migration,
      "alter table public.mobile_push_registrations enable row level security;",
    );
    assertIncludes(
      migration,
      "revoke all on public.mobile_push_registrations from public, anon, authenticated;",
    );
    assertIncludes(
      migration,
      "grant select on public.mobile_push_registrations to authenticated;",
    );
    assertIncludes(
      migration,
      "grant all on public.mobile_push_registrations to service_role;",
    );
    assertIncludes(
      migration,
      "create policy mobile_push_registrations_select_owner on public.mobile_push_registrations for select to authenticated using (owner_id = auth.uid());",
    );

    for (const policyName of [
      "mobile_push_registrations_insert_owner",
      "mobile_push_registrations_update_owner",
      "mobile_push_registrations_delete_owner",
    ]) {
      assertIncludes(
        migration,
        `drop policy if exists ${policyName} on public.mobile_push_registrations;`,
      );
      assertDoesNotMatch(
        migration,
        new RegExp(
          `create policy ${policyName} on public\\.mobile_push_registrations`,
          "i",
        ),
      );
    }

    assertDoesNotMatch(
      migration,
      /grant\s+(insert|update|delete|all)\s+on\s+public\.mobile_push_registrations\s+to\s+authenticated/i,
    );
  },
);

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

function assertIncludes(source: string, expected: string) {
  if (!source.includes(expected)) {
    throw new Error(`Expected source to include ${JSON.stringify(expected)}`);
  }
}

function assertDoesNotMatch(source: string, pattern: RegExp) {
  if (pattern.test(source)) {
    throw new Error(`Expected source not to match ${pattern}`);
  }
}

function normalizeSql(source: string) {
  return source.replace(/\s+/g, " ").trim();
}
