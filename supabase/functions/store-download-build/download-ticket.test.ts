import {
  buildStoreBuildQueryPlan,
  readStoreDownloadBuildRequest,
} from "./download-ticket.ts";

const productId = "22222222-2222-4222-8222-222222222222";
const buildId = "33333333-3333-4333-8333-333333333333";

Deno.test(
  "readStoreDownloadBuildRequest accepts optional exact build id",
  () => {
    assertEquals(
      readStoreDownloadBuildRequest({
        build_id: buildId,
        platform: "Windows",
        product_id: productId,
      }),
      {
        buildId,
        platform: "windows",
        productId,
        status: "ok",
      },
    );
  },
);

Deno.test("readStoreDownloadBuildRequest rejects invalid build id", () => {
  assertEquals(
    readStoreDownloadBuildRequest({
      build_id: "not-a-uuid",
      product_id: productId,
    }),
    {
      error: "build_id must be a valid UUID",
      status: "error",
      statusCode: 400,
    },
  );
});

Deno.test(
  "buildStoreBuildQueryPlan distinguishes exact build from latest",
  () => {
    assertEquals(
      buildStoreBuildQueryPlan({
        buildId,
        platform: "windows",
        productId,
      }),
      {
        buildId,
        platform: "windows",
        productId,
        requireLatest: false,
      },
    );

    assertEquals(
      buildStoreBuildQueryPlan({
        buildId: null,
        platform: "windows",
        productId,
      }),
      {
        buildId: null,
        platform: "windows",
        productId,
        requireLatest: true,
      },
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
