import { describe, expect, it } from "vitest";

import {
  buildRemoteInstallDeepLink,
  buildRemoteInstallHandoffSearch,
  getRemoteInstallHandoffNotice,
  parseRemoteInstallHandoff,
} from "./remote-install-handoff";

describe("remote install handoff helpers", () => {
  it("parses direct internal handoffs with an HTTP download URL", () => {
    expect(
      parseRemoteInstallHandoff({
        downloadSha256: "abc123",
        downloadUrl: "https://cdn.og-launcher.test/demo.zip",
        gameId: "demo-remote",
        installManifestSha256: "manifest123",
        installManifestUrl: "https://cdn.og-launcher.test/demo.og-manifest.json",
        title: "Remote Demo",
      }),
    ).toEqual({
      handoff: {
        downloadSha256: "abc123",
        downloadUrl: "https://cdn.og-launcher.test/demo.zip",
        gameId: "demo-remote",
        installManifestSha256: "manifest123",
        installManifestUrl: "https://cdn.og-launcher.test/demo.og-manifest.json",
        title: "Remote Demo",
      },
      status: "valid",
    });
  });

  it("allows external provider handoffs without a direct download URL", () => {
    expect(
      parseRemoteInstallHandoff({
        gameId: "steam-440",
        title: "Team Fortress 2",
      }),
    ).toEqual({
      handoff: {
        downloadSha256: undefined,
        downloadUrl: undefined,
        gameId: "steam-440",
        installManifestSha256: undefined,
        installManifestUrl: undefined,
        title: "Team Fortress 2",
      },
      status: "valid",
    });
  });

  it("accepts snake_case aliases from native deep-link parsers", () => {
    expect(
      parseRemoteInstallHandoff({
        download_sha256: "abc123",
        download_url: "https://cdn.og-launcher.test/demo.zip",
        game_id: "demo-remote",
        game_title: "Remote Demo",
        manifest_sha256: "manifest123",
        manifest_url: "https://cdn.og-launcher.test/demo.og-manifest.json",
      }),
    ).toEqual({
      handoff: {
        downloadSha256: "abc123",
        downloadUrl: "https://cdn.og-launcher.test/demo.zip",
        gameId: "demo-remote",
        installManifestSha256: "manifest123",
        installManifestUrl: "https://cdn.og-launcher.test/demo.og-manifest.json",
        title: "Remote Demo",
      },
      status: "valid",
    });
  });

  it("keeps old store install links absent unless they use gameId", () => {
    expect(parseRemoteInstallHandoff({ game: "cyber-drift", install: "1" })).toEqual({
      status: "absent",
    });
  });

  it("rejects unsafe or incomplete internal handoffs", () => {
    expect(parseRemoteInstallHandoff({ gameId: "demo-remote" })).toMatchObject({
      status: "invalid",
    });
    expect(
      parseRemoteInstallHandoff({
        downloadUrl: "javascript:alert(1)",
        gameId: "demo-remote",
      }),
    ).toMatchObject({ status: "invalid" });
    expect(
      parseRemoteInstallHandoff({
        downloadUrl: "https://cdn.og-launcher.test/demo.zip",
        gameId: "demo-remote",
        installManifestUrl: "file:///tmp/og-manifest.json",
      }),
    ).toMatchObject({ status: "invalid" });
  });

  it("round-trips handoff status query strings into notices", () => {
    const search = buildRemoteInstallHandoffSearch({
      gameId: "demo-remote",
      message: "Download started.",
      status: "accepted",
      title: "Remote Demo",
    });

    expect(getRemoteInstallHandoffNotice(new URLSearchParams(search))).toEqual({
      detail: "Remote Demo: Download started.",
      status: "accepted",
      title: "Remote handoff accepted",
    });
  });

  it("builds encoded remote install deep links for the web dashboard", () => {
    expect(
      buildRemoteInstallDeepLink({
        downloadSha256: "abc 123",
        downloadUrl: "https://cdn.og-launcher.test/demo build.zip",
        gameId: "demo-remote",
        installManifestSha256: "manifest abc",
        installManifestUrl: "https://cdn.og-launcher.test/demo manifest.json",
        source: "web-dashboard",
        title: "Remote Demo",
      }),
    ).toBe(
      "oglauncher://install?gameId=demo-remote&title=Remote+Demo&downloadUrl=https%3A%2F%2Fcdn.og-launcher.test%2Fdemo+build.zip&downloadSha256=abc+123&installManifestUrl=https%3A%2F%2Fcdn.og-launcher.test%2Fdemo+manifest.json&installManifestSha256=manifest+abc&source=web-dashboard",
    );
  });

  it("parses safe handoff source metadata without accepting arbitrary origins", () => {
    expect(
      parseRemoteInstallHandoff({
        gameId: "steam-440",
        source: "web-dashboard",
      }),
    ).toMatchObject({
      handoff: {
        gameId: "steam-440",
        source: "web-dashboard",
      },
      status: "valid",
    });
    const unsafeSource = parseRemoteInstallHandoff({
      gameId: "steam-440",
      source: "https://evil.test/?token=secret",
    });
    expect(unsafeSource.status).toBe("valid");
    if (unsafeSource.status === "valid") {
      expect(unsafeSource.handoff.source).toBeUndefined();
    }
  });

  it("truncates long handoff status messages in query strings", () => {
    const search = buildRemoteInstallHandoffSearch({
      gameId: "demo-remote",
      message: "x".repeat(320),
      status: "failed",
    });

    expect(new URLSearchParams(search).get("message")).toHaveLength(240);
  });
});
