import { describe, expect, it } from "vitest";

import { createBrowserPreviewMetrics } from "../performance-preview";

describe("createBrowserPreviewMetrics", () => {
  it("creates deterministic starter metrics for browser preview mode", () => {
    expect(createBrowserPreviewMetrics(0)).toEqual({
      cpuPercent: 42,
      ramMb: 4096,
      gpuPercent: 58,
      gpuVramMb: 6144,
      gpuTempC: 64,
      fps: 66,
      frameTimeMs: 16.7,
      fpsSource: "hud_webview",
      uptime: "0m 00s",
    });
  });

  it("clamps negative elapsed time to the preview start", () => {
    expect(createBrowserPreviewMetrics(-12)).toEqual(createBrowserPreviewMetrics(0));
  });
});
