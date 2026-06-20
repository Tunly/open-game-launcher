// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  buildStoreBuildQueryPlan,
  readStoreDownloadBuildRequest,
} from "../../../../supabase/functions/store-download-build/download-ticket";

const productId = "22222222-2222-4222-8222-222222222222";
const buildId = "33333333-3333-4333-8333-333333333333";

describe("store download ticket helper", () => {
  it("accepts optional exact build ids for remote claimed jobs", () => {
    expect(
      readStoreDownloadBuildRequest({
        build_id: buildId,
        platform: "Windows",
        product_id: productId,
      }),
    ).toEqual({
      buildId,
      platform: "windows",
      productId,
      status: "ok",
    });
  });

  it("rejects invalid build ids instead of falling back to latest", () => {
    expect(
      readStoreDownloadBuildRequest({
        build_id: "not-a-uuid",
        product_id: productId,
      }),
    ).toEqual({
      error: "build_id must be a valid UUID",
      status: "error",
      statusCode: 400,
    });
  });

  it("does not require latest when an exact build id is supplied", () => {
    expect(buildStoreBuildQueryPlan({ buildId, platform: "windows", productId })).toEqual({
      buildId,
      platform: "windows",
      productId,
      requireLatest: false,
    });

    expect(buildStoreBuildQueryPlan({ buildId: null, platform: "windows", productId })).toEqual({
      buildId: null,
      platform: "windows",
      productId,
      requireLatest: true,
    });
  });
});
