import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createStoreDownloadBuildAdapters } from "./adapters.ts";
import type { StoreBuildRow } from "./handler.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const buildId = "33333333-3333-4333-8333-333333333333";

Deno.test("store download build adapters authenticate without live Supabase secrets", async () => {
  const calls: unknown[] = [];
  const adapters = createStoreDownloadBuildAdapters({
    ...deps(),
    createClient: (supabaseUrl, supabaseAnonKey, options) => {
      calls.push({ options, supabaseAnonKey, supabaseUrl });
      return {
        auth: {
          getUser: async () => ({
            data: { user: { id: userId } },
            error: null,
          }),
        },
      };
    },
  });

  assertEquals(
    await adapters.getUserId(new Request("https://example.test")),
    null,
  );
  assertEquals(
    await adapters.getUserId(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer user-jwt" },
      }),
    ),
    userId,
  );
  assertEquals(calls, [
    {
      options: {
        auth: { persistSession: false },
        global: { headers: { Authorization: "Bearer user-jwt" } },
      },
      supabaseAnonKey: "anon-test",
      supabaseUrl: "https://supabase.test",
    },
  ]);
});

Deno.test("store download build adapters read active licenses with platform scope", async () => {
  const operations: Operation[] = [];
  const adapters = createStoreDownloadBuildAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      dataByTable: {
        store_licenses: [{ id: "license-1", platform: "windows" }],
      },
      operations,
    }),
  });

  assertEquals(
    await adapters.findActiveLicense({
      platform: "windows",
      productId,
      userId,
    }),
    { id: "license-1", platform: "windows" },
  );
  assertEquals(operations, [
    { args: ["store_licenses"], method: "from" },
    { args: ["id, platform"], method: "select", table: "store_licenses" },
    { args: ["user_id", userId], method: "eq", table: "store_licenses" },
    {
      args: ["product_id", productId],
      method: "eq",
      table: "store_licenses",
    },
    { args: ["is_revoked", false], method: "eq", table: "store_licenses" },
    {
      args: ["created_at", { ascending: false }],
      method: "order",
      table: "store_licenses",
    },
    { args: [1], method: "limit", table: "store_licenses" },
    { args: ["platform", "windows"], method: "eq", table: "store_licenses" },
  ]);
});

Deno.test("store download build adapters omit platform license filter when absent", async () => {
  const operations: Operation[] = [];
  const adapters = createStoreDownloadBuildAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      dataByTable: {
        store_licenses: [{ id: "license-1", platform: "linux" }],
      },
      operations,
    }),
  });

  assertEquals(
    await adapters.findActiveLicense({
      platform: null,
      productId,
      userId,
    }),
    { id: "license-1", platform: "linux" },
  );
  assertEquals(
    operations.some((operation) =>
      operation.method === "eq" && operation.args[0] === "platform"
    ),
    false,
  );
});

Deno.test("store download build adapters read exact build query shape", async () => {
  const operations: Operation[] = [];
  const adapters = createStoreDownloadBuildAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      dataByTable: {
        store_builds: [build({ id: buildId, platform: "windows" })],
      },
      operations,
    }),
  });

  assertEquals(
    await adapters.findStoreBuild({
      buildId,
      platform: "windows",
      productId,
      requireLatest: false,
    }),
    build({ id: buildId, platform: "windows" }),
  );
  assertEquals(operations, [
    { args: ["store_builds"], method: "from" },
    {
      args: [
        "id, product_id, version, platform, arch, file_name, size_bytes, sha256, storage_path, changelog, is_latest, uploaded_at, created_at",
      ],
      method: "select",
      table: "store_builds",
    },
    { args: ["product_id", productId], method: "eq", table: "store_builds" },
    {
      args: ["uploaded_at", { ascending: false }],
      method: "order",
      table: "store_builds",
    },
    { args: [1], method: "limit", table: "store_builds" },
    { args: ["id", buildId], method: "eq", table: "store_builds" },
    { args: ["platform", "windows"], method: "eq", table: "store_builds" },
  ]);
});

Deno.test("store download build adapters read latest build query shape", async () => {
  const operations: Operation[] = [];
  const adapters = createStoreDownloadBuildAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      dataByTable: { store_builds: [build()] },
      operations,
    }),
  });

  assertEquals(
    await adapters.findStoreBuild({
      buildId: null,
      platform: null,
      productId,
      requireLatest: true,
    }),
    build(),
  );
  assertEquals(
    operations.some((operation) =>
      operation.method === "eq" && operation.args[0] === "platform"
    ),
    false,
  );
  assertEquals(operations.at(-1), {
    args: ["is_latest", true],
    method: "eq",
    table: "store_builds",
  });
});

Deno.test("store download build adapters create signed URLs through configured storage bucket", async () => {
  const operations: Operation[] = [];
  const adapters = createStoreDownloadBuildAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      operations,
      signedUrlData: { signedUrl: "https://signed.example/download" },
    }),
  });

  assertEquals(
    await adapters.createSignedBuildUrl(build()),
    "https://signed.example/download",
  );
  assertEquals(operations, [
    { args: ["test-store-builds"], method: "storage.from" },
    {
      args: [
        "products/mock-game/linux.zip",
        600,
        { download: "mock-game-linux.zip" },
      ],
      bucket: "test-store-builds",
      method: "createSignedUrl",
    },
  ]);
});

Deno.test("store download build adapters map Supabase and storage errors", async () => {
  const licenseAdapters = createStoreDownloadBuildAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      errorByTable: { store_licenses: { message: "license read failed" } },
    }),
  });
  await assertRejects(
    () =>
      licenseAdapters.findActiveLicense({
        platform: null,
        productId,
        userId,
      }),
    Error,
    "Failed to read store license: license read failed",
  );

  const buildAdapters = createStoreDownloadBuildAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      errorByTable: { store_builds: { message: "build read failed" } },
    }),
  });
  await assertRejects(
    () =>
      buildAdapters.findStoreBuild({
        buildId: null,
        platform: null,
        productId,
        requireLatest: true,
      }),
    Error,
    "Failed to read store build: build read failed",
  );

  const signedUrlAdapters = createStoreDownloadBuildAdapters({
    ...deps(),
    supabaseAdmin: supabaseStub({
      signedUrlError: { message: "sign failed" },
    }),
  });
  await assertRejects(
    () => signedUrlAdapters.createSignedBuildUrl(build()),
    Error,
    "Failed to create download URL: sign failed",
  );
});

type Operation = {
  args: unknown[];
  bucket?: string;
  method: string;
  table?: string;
};

function deps() {
  return {
    createClient: () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: userId } }, error: null }),
      },
    }),
    signedUrlTtlSeconds: 600,
    storeBuildsBucket: "test-store-builds",
    supabaseAdmin: supabaseStub(),
    supabaseAnonKey: "anon-test",
    supabaseUrl: "https://supabase.test",
  };
}

function supabaseStub(options: {
  dataByTable?: Record<string, unknown[] | null>;
  errorByTable?: Record<string, { message?: string } | null>;
  operations?: Operation[];
  signedUrlData?: { signedUrl?: string } | null;
  signedUrlError?: { message?: string } | null;
} = {}) {
  const operations = options.operations ?? [];
  return {
    from: (table: string) => {
      operations.push({ args: [table], method: "from" });
      const result = () => ({
        data: options.dataByTable?.[table] ?? null,
        error: options.errorByTable?.[table] ?? null,
      });
      const query = {
        eq(column: string, value: unknown) {
          operations.push({ args: [column, value], method: "eq", table });
          return query;
        },
        limit(count: number) {
          operations.push({ args: [count], method: "limit", table });
          return query;
        },
        order(column: string, orderOptions: { ascending: boolean }) {
          operations.push({
            args: [column, orderOptions],
            method: "order",
            table,
          });
          return query;
        },
        select(columns: string) {
          operations.push({ args: [columns], method: "select", table });
          return query;
        },
        then(
          onfulfilled?: ((value: unknown) => unknown) | null,
          onrejected?: ((reason: unknown) => unknown) | null,
        ) {
          return Promise.resolve(result()).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
    storage: {
      from: (bucket: string) => {
        operations.push({ args: [bucket], method: "storage.from" });
        return {
          createSignedUrl(
            path: string,
            expiresIn: number,
            createOptions: { download: string },
          ) {
            operations.push({
              args: [path, expiresIn, createOptions],
              bucket,
              method: "createSignedUrl",
            });
            return Promise.resolve({
              data: options.signedUrlData ?? null,
              error: options.signedUrlError ?? null,
            });
          },
        };
      },
    },
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
