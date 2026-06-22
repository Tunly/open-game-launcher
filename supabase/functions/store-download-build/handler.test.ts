import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import type { StoreBuildQueryPlan } from "./download-ticket.ts";
import {
  handleStoreDownloadBuild,
  type StoreBuildRow,
  type StoreDownloadBuildHandlerDeps,
  type StoreDownloadBuildLicenseLookup,
  type StoreLicenseRow,
} from "./handler.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const buildId = "33333333-3333-4333-8333-333333333333";

Deno.test("store download build handler answers CORS and method guards without dependencies", async () => {
  const deps = stubDeps({
    getUserId: () => {
      throw new Error("auth should not be checked");
    },
  });

  const optionsResponse = await handleStoreDownloadBuild(
    new Request("https://functions.example/store-download-build", {
      method: "OPTIONS",
    }),
    deps,
  );
  assertEquals(optionsResponse.status, 200);
  assertEquals(optionsResponse.headers.get("Access-Control-Allow-Origin"), "*");

  const getResponse = await handleStoreDownloadBuild(
    new Request("https://functions.example/store-download-build", {
      method: "GET",
    }),
    deps,
  );
  assertEquals(getResponse.status, 405);
  assertEquals(await getResponse.json(), { error: "Method not allowed" });
});

Deno.test("store download build handler requires user auth before parsing", async () => {
  let licenseCalls = 0;
  const response = await handleStoreDownloadBuild(
    jsonRequest({ product_id: productId }),
    stubDeps({
      findActiveLicense: async () => {
        licenseCalls += 1;
        return license();
      },
      getUserId: async () => null,
    }),
  );

  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: "Invalid or expired token" });
  assertEquals(licenseCalls, 0);
});

Deno.test("store download build handler rejects invalid body before license lookup", async () => {
  let licenseCalls = 0;
  const response = await handleStoreDownloadBuild(
    jsonRequest({ build_id: "not-a-uuid" }),
    stubDeps({
      findActiveLicense: async () => {
        licenseCalls += 1;
        return license();
      },
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: "product_id is required" });
  assertEquals(licenseCalls, 0);
});

Deno.test("store download build handler rejects missing active licenses", async () => {
  const lookups: StoreDownloadBuildLicenseLookup[] = [];
  let buildCalls = 0;
  const response = await handleStoreDownloadBuild(
    jsonRequest({ platform: "Windows", product_id: productId }),
    stubDeps({
      findActiveLicense: async (lookup) => {
        lookups.push(lookup);
        return null;
      },
      findStoreBuild: async () => {
        buildCalls += 1;
        return build();
      },
    }),
  );

  assertEquals(response.status, 403);
  assertEquals(await response.json(), {
    error: "No active license for this product",
  });
  assertEquals(lookups, [{ platform: "windows", productId, userId }]);
  assertEquals(buildCalls, 0);
});

Deno.test("store download build handler returns 404 when no build matches", async () => {
  const plans: StoreBuildQueryPlan[] = [];
  const response = await handleStoreDownloadBuild(
    jsonRequest({ product_id: productId }),
    stubDeps({
      findStoreBuild: async (plan) => {
        plans.push(plan);
        return null;
      },
    }),
  );

  assertEquals(response.status, 404);
  assertEquals(await response.json(), {
    error: "No downloadable build is available",
  });
  assertEquals(plans, [
    {
      buildId: null,
      platform: "linux",
      productId,
      requireLatest: true,
    },
  ]);
});

Deno.test("store download build handler returns signed latest build payload", async () => {
  const signedBuilds: StoreBuildRow[] = [];
  const response = await handleStoreDownloadBuild(
    jsonRequest({ product_id: productId }),
    stubDeps({
      createSignedBuildUrl: async (storeBuild) => {
        signedBuilds.push(storeBuild);
        return "https://signed.example/download";
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    build: {
      arch: "x64",
      changelog: "Initial build",
      createdAt: "2026-06-01T08:00:00.000Z",
      fileName: "mock-game-linux.zip",
      id: "build-1",
      isLatest: true,
      platform: "linux",
      productId,
      sha256: "abc123",
      sizeBytes: 123456,
      storagePath: "products/mock-game/linux.zip",
      uploadedAt: "2026-06-01T09:00:00.000Z",
      version: "1.0.0",
    },
    expiresAt: "2026-06-15T12:10:00.000Z",
    licenseId: "license-1",
    url: "https://signed.example/download",
  });
  assertEquals(signedBuilds, [build()]);
});

Deno.test("store download build handler applies exact build plan and maps signed URL errors", async () => {
  const lookups: StoreDownloadBuildLicenseLookup[] = [];
  const plans: StoreBuildQueryPlan[] = [];
  const errors: unknown[] = [];
  const response = await handleStoreDownloadBuild(
    jsonRequest({
      build_id: buildId,
      platform: "Windows",
      product_id: productId,
    }),
    stubDeps({
      createSignedBuildUrl: async () => {
        throw new Error("signed URL failed");
      },
      findActiveLicense: async (lookup) => {
        lookups.push(lookup);
        return license({ platform: "windows" });
      },
      findStoreBuild: async (plan) => {
        plans.push(plan);
        return build({ platform: "windows" });
      },
      logError: (_message, error) => {
        errors.push(error);
      },
    }),
  );

  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: "signed URL failed" });
  assertEquals(lookups, [{ platform: "windows", productId, userId }]);
  assertEquals(plans, [
    {
      buildId,
      platform: "windows",
      productId,
      requireLatest: false,
    },
  ]);
  assertEquals(errors.length, 1);
});

function jsonRequest(body: Record<string, unknown>) {
  return new Request("https://functions.example/store-download-build", {
    body: JSON.stringify(body),
    headers: {
      Authorization: "Bearer user-jwt",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

function license(
  overrides: Partial<StoreLicenseRow> = {},
): StoreLicenseRow {
  return {
    id: "license-1",
    platform: "linux",
    ...overrides,
  };
}

function build(overrides: Partial<StoreBuildRow> = {}): StoreBuildRow {
  return {
    arch: "x64",
    changelog: "Initial build",
    created_at: "2026-06-01T08:00:00.000Z",
    file_name: "mock-game-linux.zip",
    id: "build-1",
    is_latest: true,
    platform: "linux",
    product_id: productId,
    sha256: "abc123",
    size_bytes: 123456,
    storage_path: "products/mock-game/linux.zip",
    uploaded_at: "2026-06-01T09:00:00.000Z",
    version: "1.0.0",
    ...overrides,
  };
}

function stubDeps(
  overrides: Partial<StoreDownloadBuildHandlerDeps> = {},
): StoreDownloadBuildHandlerDeps {
  return {
    createSignedBuildUrl: async () => "https://signed.example/download",
    findActiveLicense: async () => license(),
    findStoreBuild: async () => build(),
    getUserId: async () => userId,
    logError: () => {},
    now: () => new Date("2026-06-15T12:00:00.000Z"),
    signedUrlTtlSeconds: 600,
    ...overrides,
  };
}
