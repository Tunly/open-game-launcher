import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleInstallDeepLink } from "./deep-link-handlers";
import { router } from "./router";
import { shouldMountLauncherUpdateHost } from "./window-view-policy";

vi.mock("./router", () => ({
  router: {
    navigate: vi.fn(),
  },
}));

describe("handleInstallDeepLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores direct install payloads after direct downloads are removed", async () => {
    await handleInstallDeepLink(
      {
        downloadSha256: "abc123",
        downloadUrl: "https://cdn.og-launcher.test/demo.zip",
        gameId: "demo-direct",
        installManifestSha256: "manifest123",
        installManifestUrl: "https://cdn.og-launcher.test/demo.og-manifest.json",
        source: "legacy-client",
        title: "Direct Demo",
      },
      "",
    );

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it("keeps existing store install links as the fallback path", async () => {
    await handleInstallDeepLink({}, "cyber-drift");

    expect(router.navigate).toHaveBeenCalledWith("/store?slug=cyber-drift&install=1");
  });
});

describe("launcher update host window policy", () => {
  it("mounts only in the main launcher window", () => {
    expect(shouldMountLauncherUpdateHost("main")).toBe(true);
    expect(shouldMountLauncherUpdateHost("overlay")).toBe(false);
    expect(shouldMountLauncherUpdateHost("fps-hud")).toBe(false);
  });
});
