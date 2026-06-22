import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
    functions: {
      invoke: mocks.invoke,
    },
  }),
}));

const productId = "22222222-2222-4222-8222-222222222222";
const buildId = "33333333-3333-4333-8333-333333333333";

describe("store download build tickets", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.invoke.mockReset();
  });

  it("passes optional exact build id to the edge function", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        build: {
          arch: "x64",
          changelog: null,
          createdAt: "2026-06-11T12:00:00.000Z",
          fileName: "demo.zip",
          id: buildId,
          isLatest: false,
          platform: "windows",
          productId,
          sha256: null,
          sizeBytes: 123,
          storagePath: "private/demo.zip",
          uploadedAt: "2026-06-11T12:00:00.000Z",
          version: "1.0.0",
        },
        expiresAt: "2026-06-11T12:10:00.000Z",
        licenseId: "license-1",
        url: "https://signed.example.test/demo.zip?sig=abc",
      },
      error: null,
    });

    const { createStoreBuildDownloadTicket } = await import("../store");
    const result = await createStoreBuildDownloadTicket(productId, "windows", buildId);

    expect(mocks.invoke).toHaveBeenCalledWith("store-download-build", {
      body: {
        build_id: buildId,
        platform: "windows",
        product_id: productId,
      },
    });
    expect(result.build.id).toBe(buildId);
  });
});
