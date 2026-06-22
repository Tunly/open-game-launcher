// deno-lint-ignore-file no-import-prefix
import { ed25519 } from "https://esm.sh/@noble/curves@1.9.1/ed25519?target=deno";

import {
  base64UrlNoPad,
  cleanStoreLicenseDeviceId,
  createStoreLicenseKey,
  parseLicenseSigningKey,
} from "./store-license.ts";

const signingSeedHex =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

Deno.test("store license key creates signed OGL1 device-bound tokens", () => {
  const result = createStoreLicenseKey({
    deviceId: "device-1",
    now: new Date("2026-06-13T10:00:00.000Z"),
    platform: "windows",
    productId: "product-1",
    signingKey: signingSeedHex,
  });

  assertEquals(result.mode, "signed");
  const [prefix, payloadEncoded, signatureEncoded] = result.key.split(".");
  assertEquals(prefix, "OGL1");
  assertEquals(
    decodePayload(payloadEncoded),
    {
      device_id: "device-1",
      expires_at: "2026-07-13T10:00:00.000Z",
      issued_at: "2026-06-13T10:00:00.000Z",
      platform: "windows",
      product_id: "product-1",
    },
  );

  const signingKey = parseLicenseSigningKey(signingSeedHex);
  if (!signingKey) throw new Error("test signing key did not parse");
  const verified = ed25519.verify(
    base64UrlToBytes(signatureEncoded),
    new TextEncoder().encode(`OGL1.${payloadEncoded}`),
    ed25519.getPublicKey(signingKey),
  );
  assertEquals(verified, true);
});

Deno.test("store license key requires signing key unless staging fallback is enabled", () => {
  assertThrows(() =>
    createStoreLicenseKey({
      deviceId: "device-1",
      platform: "windows",
      productId: "product-1",
      signingKey: null,
    })
  );

  const result = createStoreLicenseKey({
    allowUnsignedFallback: true,
    deviceId: "device-1",
    platform: "windows",
    productId: "product-1",
    randomUuid: () => "11111111-1111-4111-8111-111111111111",
    signingKey: null,
  });

  assertEquals(result, {
    key: "OGL-STAGING-UNSIGNED-11111111-1111-4111-8111-111111111111",
    mode: "unsigned_staging",
    reason: "missing_signing_key",
  });
});

Deno.test("store license key requires device id unless staging fallback is enabled", () => {
  assertThrows(() =>
    createStoreLicenseKey({
      deviceId: null,
      platform: "windows",
      productId: "product-1",
      signingKey: signingSeedHex,
    })
  );

  const result = createStoreLicenseKey({
    allowUnsignedFallback: true,
    deviceId: null,
    platform: "windows",
    productId: "product-1",
    randomUuid: () => "22222222-2222-4222-8222-222222222222",
    signingKey: signingSeedHex,
  });

  assertEquals(result, {
    key: "OGL-STAGING-UNSIGNED-22222222-2222-4222-8222-222222222222",
    mode: "unsigned_staging",
    reason: "missing_device_id",
  });
});

Deno.test("store license key rejects invalid signing keys even with staging fallback enabled", () => {
  assertThrows(() =>
    createStoreLicenseKey({
      allowUnsignedFallback: true,
      deviceId: "device-1",
      platform: "windows",
      productId: "product-1",
      signingKey: "not-a-valid-ed25519-seed",
    })
  );
});

Deno.test("store license device id parser trims and rejects oversized values", () => {
  assertEquals(cleanStoreLicenseDeviceId(" device-1 "), "device-1");
  assertEquals(cleanStoreLicenseDeviceId(""), null);
  assertEquals(cleanStoreLicenseDeviceId("x".repeat(129)), null);
});

Deno.test("issueStoreLicenses skips active licenses before signing new keys", async () => {
  const storeLicenses = mockStoreLicensesTable({
    insertError: null,
    reads: [[{ platform: "windows", product_id: "product-1" }]],
  });

  await withMockedStoreSupabase(storeLicenses.from, async (store) => {
    Deno.env.delete("OGL_LICENSE_SIGNING_KEY");
    await store.issueStoreLicenses(
      "user-1",
      "order-1",
      [product("product-1", ["windows"])],
      null,
    );
  });

  assertEquals(storeLicenses.insertedRows, []);
  assertLicenseReadQuery(storeLicenses.readQueries[0], ["product-1"]);
});

Deno.test(
  "issueStoreLicenses accepts duplicate-key conflicts when active licenses now exist",
  async () => {
    const storeLicenses = mockStoreLicensesTable({
      insertError: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
      reads: [
        [],
        [
          { platform: "windows", product_id: "product-1" },
          { platform: "linux", product_id: "product-2" },
        ],
      ],
    });

    await withMockedStoreSupabase(storeLicenses.from, async (store) => {
      await store.issueStoreLicenses(
        "user-1",
        "order-1",
        [
          product("product-1", ["windows"]),
          product("product-2", ["linux"]),
        ],
        "device-1",
      );
    });

    assertEquals(storeLicenses.readQueries.length, 2);
    assertLicenseReadQuery(storeLicenses.readQueries[0], [
      "product-1",
      "product-2",
    ]);
    assertLicenseReadQuery(storeLicenses.readQueries[1], [
      "product-1",
      "product-2",
    ]);
    assertEquals(
      storeLicenses.insertedRows.map((row) => ({
        platform: row.platform,
        product_id: row.product_id,
      })),
      [
        { platform: "windows", product_id: "product-1" },
        { platform: "linux", product_id: "product-2" },
      ],
    );
  },
);

Deno.test(
  "issueStoreLicenses still fails duplicate-key conflicts when active licenses are missing",
  async () => {
    const storeLicenses = mockStoreLicensesTable({
      insertError: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
      reads: [
        [],
        [{ platform: "windows", product_id: "product-1" }],
      ],
    });

    await assertRejects(
      () =>
        withMockedStoreSupabase(storeLicenses.from, async (store) => {
          await store.issueStoreLicenses(
            "user-1",
            "order-1",
            [
              product("product-1", ["windows"]),
              product("product-2", ["linux"]),
            ],
            "device-1",
          );
        }),
      "Failed to issue licenses: duplicate key value violates unique constraint",
    );

    assertEquals(storeLicenses.readQueries.length, 2);
    assertLicenseReadQuery(storeLicenses.readQueries[0], [
      "product-1",
      "product-2",
    ]);
    assertLicenseReadQuery(storeLicenses.readQueries[1], [
      "product-1",
      "product-2",
    ]);
  },
);

function decodePayload(encoded: string) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded)));
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function assertThrows(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    if (error instanceof Error) return;
    throw new Error(`Expected Error, got ${String(error)}`);
  }
  throw new Error("Expected function to throw");
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
  if (value instanceof Uint8Array) {
    return base64UrlNoPad(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${
      Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
        .join(",")
    }}`;
  }

  return JSON.stringify(value);
}

type StoreModule = typeof import("./store.ts");

type StoreLicenseReadRow = {
  platform: string;
  product_id: string;
};

type StoreLicenseInsertRow = {
  platform: string;
  product_id: string;
};

function product(id: string, platforms: string[]) {
  return {
    discount_percent: 0,
    id,
    platforms,
    price_cents: 1000,
    title: `Game ${id}`,
  };
}

async function withMockedStoreSupabase(
  from: (table: string) => unknown,
  run: (store: StoreModule) => Promise<void>,
) {
  setStoreModuleEnv();
  const [store, adminModule] = await Promise.all([
    import("./store.ts"),
    import("./supabase-admin.ts"),
  ]);
  const admin = adminModule.supabaseAdmin as unknown as {
    auth?: { stopAutoRefresh?: () => void };
    from: (table: string) => unknown;
    realtime?: { disconnect?: () => void };
  };
  const originalFrom = admin.from;
  admin.from = from;
  try {
    await run(store);
  } finally {
    admin.from = originalFrom;
    admin.auth?.stopAutoRefresh?.();
    admin.realtime?.disconnect?.();
  }
}

function setStoreModuleEnv() {
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  Deno.env.set("STRIPE_SECRET_KEY", "sk_test_mock");
  Deno.env.set("OGL_LICENSE_SIGNING_KEY", signingSeedHex);
}

function mockStoreLicensesTable(input: {
  insertError: { code?: string; message: string } | null;
  reads: StoreLicenseReadRow[][];
}) {
  const readResults = [...input.reads];
  const insertedRows: StoreLicenseInsertRow[] = [];
  const readQueries: Array<{
    filters: Array<{ field: string; type: "eq" | "in"; value: unknown }>;
    select: string;
  }> = [];

  return {
    from(table: string) {
      assertEquals(table, "store_licenses");
      return {
        insert(rows: StoreLicenseInsertRow[]) {
          insertedRows.push(...rows);
          return Promise.resolve({ error: input.insertError });
        },
        select(select: string) {
          const filters: Array<{
            field: string;
            type: "eq" | "in";
            value: unknown;
          }> = [];
          const chain = {
            eq(field: string, value: unknown) {
              filters.push({ field, type: "eq", value });
              return chain;
            },
            in(field: string, value: unknown) {
              filters.push({ field, type: "in", value });
              readQueries.push({ filters: [...filters], select });
              return Promise.resolve({
                data: readResults.shift() ?? [],
                error: null,
              });
            },
          };
          return chain;
        },
      };
    },
    insertedRows,
    readQueries,
  };
}

async function assertRejects(
  fn: () => Promise<unknown>,
  expectedMessage: string,
) {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assertIncludes(message, expectedMessage);
    return;
  }
  throw new Error("Expected promise to reject");
}

function assertIncludes(actual: string, expected: string) {
  if (!actual.includes(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(actual)} to include ${expected}`,
    );
  }
}

function assertLicenseReadQuery(
  query: {
    filters: Array<{ field: string; type: "eq" | "in"; value: unknown }>;
  },
  productIds: string[],
) {
  assertEquals(query.filters, [
    { field: "user_id", type: "eq", value: "user-1" },
    { field: "is_revoked", type: "eq", value: false },
    { field: "product_id", type: "in", value: productIds },
  ]);
}
