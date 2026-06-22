import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleInstallDeepLink } from "./deep-link-handlers";
import { router } from "./router";
import { startDownload } from "../lib/launcher";
import { readRemoteInstallHandoffHistory } from "../lib/remote-install-history";

vi.mock("./router", () => ({
  router: {
    navigate: vi.fn(),
  },
}));

vi.mock("../lib/launcher", () => ({
  startDownload: vi.fn(),
}));

describe("handleInstallDeepLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("starts a remote install handoff and navigates to Downloads status", async () => {
    vi.mocked(startDownload).mockResolvedValue({
      downloadId: "download-demo-remote",
      gameId: "demo-remote",
      message: "Download started.",
      status: "started",
    });

    await handleInstallDeepLink(
      {
        downloadSha256: "abc123",
        downloadUrl: "https://cdn.og-launcher.test/demo.zip",
        gameId: "demo-remote",
        installManifestSha256: "manifest123",
        installManifestUrl: "https://cdn.og-launcher.test/demo.og-manifest.json",
        source: "web-dashboard",
        title: "Remote Demo",
      },
      "",
    );

    expect(startDownload).toHaveBeenCalledWith(
      "demo-remote",
      "Remote Demo",
      "https://cdn.og-launcher.test/demo.zip",
      "abc123",
      "https://cdn.og-launcher.test/demo.og-manifest.json",
      "manifest123",
    );
    expect(vi.mocked(router.navigate).mock.calls[0]?.[0]).toContain(
      "/downloads?remoteHandoff=pending",
    );
    expect(vi.mocked(router.navigate).mock.calls[1]?.[0]).toContain(
      "/downloads?remoteHandoff=accepted",
    );
    expect(vi.mocked(router.navigate).mock.calls[1]?.[0]).toContain("Download+started");

    const history = readRemoteInstallHandoffHistory();
    expect(history.map((record) => record.status)).toEqual(["accepted", "pending"]);
    expect(history[0]).toMatchObject({
      downloadHost: "cdn.og-launcher.test",
      gameId: "demo-remote",
      hasDownloadSha256: true,
      hasInstallManifestSha256: true,
      source: "web-dashboard",
      status: "accepted",
    });
    expect(JSON.stringify(history)).not.toContain("demo.zip");
  });

  it("reports invalid handoffs without starting downloads", async () => {
    await handleInstallDeepLink({ gameId: "demo-remote" }, "");

    expect(startDownload).not.toHaveBeenCalled();
    expect(vi.mocked(router.navigate).mock.calls[0]?.[0]).toContain(
      "/downloads?remoteHandoff=failed",
    );
    expect(readRemoteInstallHandoffHistory()[0]?.status).toBe("failed");
  });

  it("reports startDownload failures on the Downloads status route", async () => {
    vi.mocked(startDownload).mockRejectedValue(new Error("native queue offline"));

    await handleInstallDeepLink(
      {
        downloadUrl: "https://cdn.og-launcher.test/demo.zip",
        gameId: "demo-remote",
        title: "Remote Demo",
      },
      "",
    );

    expect(vi.mocked(router.navigate).mock.calls.at(-1)?.[0]).toContain(
      "/downloads?remoteHandoff=failed",
    );
    expect(vi.mocked(router.navigate).mock.calls.at(-1)?.[0]).toContain("native+queue+offline");
  });

  it("starts external provider handoffs without requiring a download URL", async () => {
    vi.mocked(startDownload).mockResolvedValue({
      downloadId: "download-steam-440",
      gameId: "steam-440",
      message: "Installation started in Steam.",
      status: "started",
    });

    await handleInstallDeepLink(
      {
        gameId: "steam-440",
        title: "Team Fortress 2",
      },
      "",
    );

    expect(startDownload).toHaveBeenCalledWith(
      "steam-440",
      "Team Fortress 2",
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(vi.mocked(router.navigate).mock.calls.at(-1)?.[0]).toContain(
      "/downloads?remoteHandoff=accepted",
    );
  });

  it("keeps existing store install links as the fallback path", async () => {
    await handleInstallDeepLink({}, "cyber-drift");

    expect(startDownload).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith("/store?slug=cyber-drift&install=1");
  });
});
