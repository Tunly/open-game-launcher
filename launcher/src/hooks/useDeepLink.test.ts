import { describe, expect, it } from "vitest";

import { getDeepLinkLogSummary } from "./useDeepLink";

describe("getDeepLinkLogSummary", () => {
  it("logs only action and parameter keys, not signed URL values", () => {
    const summary = getDeepLinkLogSummary({
      action: "install",
      params: {
        downloadUrl: "https://cdn.og-launcher.test/build.zip?token=secret",
        gameId: "demo",
        invite: "ogl.secret.payload",
      },
      rawUrl:
        "oglauncher://install?gameId=demo&downloadUrl=https%3A%2F%2Fcdn.og-launcher.test%2Fbuild.zip%3Ftoken%3Dsecret",
    });

    expect(summary).toEqual({
      action: "install",
      paramKeys: ["downloadUrl", "gameId", "invite"],
      rawUrlPresent: true,
    });
    expect(JSON.stringify(summary)).not.toContain("token=secret");
    expect(JSON.stringify(summary)).not.toContain("ogl.secret.payload");
    expect(JSON.stringify(summary)).not.toContain("oglauncher://install");
  });
});
