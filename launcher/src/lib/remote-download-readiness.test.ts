import { describe, expect, it } from "vitest";

import { getRemoteDownloadReadiness } from "./remote-download-readiness";

describe("getRemoteDownloadReadiness", () => {
  it("reports ready when desktop, companion, always-on, vault and hosted auth are configured", () => {
    const readiness = getRemoteDownloadReadiness({
      activeDownloadCount: 2,
      alwaysOnConfigured: true,
      hasRemoteCompanion: true,
      hasDesktopVault: true,
      hasHostedAuth: true,
      isDesktopApp: true,
    });

    expect(readiness).toMatchObject({
      blocker: null,
      progress: 100,
      tone: "ready",
    });
    expect(readiness.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "desktop-app", status: "ready" }),
        expect.objectContaining({ id: "remote-companion", status: "ready" }),
        expect.objectContaining({ id: "always-on", status: "ready" }),
        expect.objectContaining({ id: "desktop-vault", status: "ready" }),
        expect.objectContaining({ id: "hosted-auth", status: "ready" }),
        expect.objectContaining({
          detail: "2 active downloads in the queue.",
          id: "download-queue",
          status: "ready",
        }),
      ]),
    );
  });

  it("keeps local companion and always-on evidence guarded without production prerequisites", () => {
    const readiness = getRemoteDownloadReadiness({
      activeDownloadCount: 0,
      alwaysOnConfigured: true,
      companionStatus: "linked",
      hasRemoteCompanion: true,
      isDesktopApp: true,
    });

    expect(readiness).toMatchObject({
      progress: 67,
      tone: "blocked",
    });
    expect(readiness.blocker).toEqual(
      expect.objectContaining({
        id: "desktop-vault",
        status: "blocked",
      }),
    );
    expect(readiness.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "desktop-app", status: "ready" }),
        expect.objectContaining({ id: "remote-companion", status: "ready" }),
        expect.objectContaining({ id: "always-on", status: "ready" }),
        expect.objectContaining({
          detail: expect.stringMatching(/outside browser storage/i),
          id: "desktop-vault",
          status: "blocked",
        }),
        expect.objectContaining({
          detail: expect.stringMatching(/cannot claim production readiness/i),
          id: "hosted-auth",
          status: "blocked",
        }),
      ]),
    );
  });

  it("blocks web/mobile usage without the desktop app", () => {
    const readiness = getRemoteDownloadReadiness({
      activeDownloadCount: 0,
      alwaysOnConfigured: true,
      hasRemoteCompanion: true,
      hasDesktopVault: true,
      hasHostedAuth: true,
      isDesktopApp: false,
    });

    expect(readiness.tone).toBe("blocked");
    expect(readiness.progress).toBe(83);
    expect(readiness.blocker).toEqual(
      expect.objectContaining({
        id: "desktop-app",
        status: "blocked",
      }),
    );
  });

  it("blocks when the mobile/web companion is missing", () => {
    const readiness = getRemoteDownloadReadiness({
      activeDownloadCount: 0,
      alwaysOnConfigured: true,
      hasRemoteCompanion: false,
      hasDesktopVault: true,
      hasHostedAuth: true,
      isDesktopApp: true,
    });

    expect(readiness.tone).toBe("blocked");
    expect(readiness.progress).toBe(83);
    expect(readiness.blocker).toEqual(
      expect.objectContaining({
        id: "remote-companion",
        label: "Mobile/Web Companion",
        status: "blocked",
      }),
    );
  });

  it("blocks staged companion pairings until a fresh ping is present", () => {
    const readiness = getRemoteDownloadReadiness({
      activeDownloadCount: 0,
      alwaysOnConfigured: true,
      companionStatus: "pairing",
      hasRemoteCompanion: false,
      hasDesktopVault: true,
      hasHostedAuth: true,
      isDesktopApp: true,
    });

    expect(readiness.tone).toBe("blocked");
    expect(readiness.blocker).toEqual(
      expect.objectContaining({
        detail: expect.stringMatching(/wait for a companion ping/i),
        id: "remote-companion",
        status: "blocked",
      }),
    );
  });

  it("blocks expired companion pairings", () => {
    const readiness = getRemoteDownloadReadiness({
      activeDownloadCount: 0,
      alwaysOnConfigured: true,
      companionStatus: "expired",
      hasRemoteCompanion: false,
      hasDesktopVault: true,
      hasHostedAuth: true,
      isDesktopApp: true,
    });

    expect(readiness.tone).toBe("blocked");
    expect(readiness.blocker).toEqual(
      expect.objectContaining({
        detail: expect.stringMatching(/expired/i),
        id: "remote-companion",
        status: "blocked",
      }),
    );
  });

  it("keeps remote downloads warning-only when always-on is not configured", () => {
    const readiness = getRemoteDownloadReadiness({
      activeDownloadCount: 0,
      alwaysOnConfigured: false,
      hasRemoteCompanion: true,
      hasDesktopVault: true,
      hasHostedAuth: true,
      isDesktopApp: true,
    });

    expect(readiness).toMatchObject({
      blocker: null,
      progress: 83,
      tone: "warning",
    });
    expect(readiness.rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "always-on", status: "warning" })]),
    );
  });

  it("uses the first hard blocker when multiple required pieces are missing", () => {
    const readiness = getRemoteDownloadReadiness({
      activeDownloadCount: 1,
      alwaysOnConfigured: false,
      hasRemoteCompanion: false,
      isDesktopApp: false,
    });

    expect(readiness.tone).toBe("blocked");
    expect(readiness.blocker).toEqual(expect.objectContaining({ id: "desktop-app" }));
    expect(readiness.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "desktop-app", status: "blocked" }),
        expect.objectContaining({ id: "remote-companion", status: "blocked" }),
        expect.objectContaining({ id: "always-on", status: "warning" }),
      ]),
    );
  });

  it("normalizes invalid active download counts to an empty queue", () => {
    const readiness = getRemoteDownloadReadiness({
      activeDownloadCount: Number.NaN,
      alwaysOnConfigured: true,
      hasRemoteCompanion: true,
      hasDesktopVault: true,
      hasHostedAuth: true,
      isDesktopApp: true,
    });

    expect(readiness.tone).toBe("ready");
    expect(readiness.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: "No active downloads are using the queue right now.",
          id: "download-queue",
        }),
      ]),
    );
  });

  it("does not expose ignored token or relay URL fields in readiness output", () => {
    const inputWithSecrets = {
      activeDownloadCount: 0,
      alwaysOnConfigured: true,
      companionStatus: "linked" as const,
      hasRemoteCompanion: true,
      isDesktopApp: true,
      relayUrl: "https://relay.og-launcher.test/jobs?token=remote-secret",
      sessionToken: "remote-secret",
    };

    const readiness = getRemoteDownloadReadiness(inputWithSecrets);
    const serialized = JSON.stringify(readiness);

    expect(serialized).not.toContain("https://relay.og-launcher.test");
    expect(serialized).not.toContain("remote-secret");
    expect(serialized).not.toContain("sessionToken");
    expect(serialized).not.toContain("relayUrl");
  });
});
