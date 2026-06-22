import { beforeEach, describe, expect, it } from "vitest";

import {
  appendRemoteInstallHandoffHistory,
  createRemoteInstallHandoffHistoryRecord,
  readRemoteInstallHandoffHistory,
  REMOTE_INSTALL_HANDOFF_HISTORY_LIMIT,
} from "./remote-install-history";

describe("remote install handoff history", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores sanitized host metadata instead of full signed URLs", () => {
    const record = createRemoteInstallHandoffHistoryRecord({
      handoff: {
        downloadSha256: "abc123",
        downloadUrl: "https://cdn.og-launcher.test/signed/demo.zip?token=secret",
        gameId: "demo-remote",
        installManifestSha256: "manifest123",
        installManifestUrl: "https://manifest.og-launcher.test/demo.json?sig=secret",
        source: "web-dashboard",
        title: "Remote Demo",
      },
      message: "Download started.",
      status: "accepted",
      timestamp: 1_780_000_000_000,
    });

    expect(record).toMatchObject({
      downloadHost: "cdn.og-launcher.test",
      gameId: "demo-remote",
      hasDownloadSha256: true,
      hasInstallManifestSha256: true,
      installManifestHost: "manifest.og-launcher.test",
      message: "Download started.",
      source: "web-dashboard",
      status: "accepted",
      title: "Remote Demo",
    });
    expect(JSON.stringify(record)).not.toContain("token=secret");
    expect(JSON.stringify(record)).not.toContain("sig=secret");
  });

  it("caps local history to the newest records", () => {
    for (let index = 0; index < REMOTE_INSTALL_HANDOFF_HISTORY_LIMIT + 2; index += 1) {
      appendRemoteInstallHandoffHistory(
        createRemoteInstallHandoffHistoryRecord({
          gameId: `game-${index}`,
          status: "pending",
          timestamp: index,
          title: `Game ${index}`,
        }),
      );
    }

    const history = readRemoteInstallHandoffHistory();

    expect(history).toHaveLength(REMOTE_INSTALL_HANDOFF_HISTORY_LIMIT);
    expect(history[0]?.gameId).toBe(`game-${REMOTE_INSTALL_HANDOFF_HISTORY_LIMIT + 1}`);
    expect(history.at(-1)?.gameId).toBe("game-2");
  });

  it("can build a failed record from raw params without URL leakage", () => {
    const record = createRemoteInstallHandoffHistoryRecord({
      message: "Remote install handoff rejected a non-HTTP(S) download URL.",
      params: {
        downloadUrl: "javascript:alert(1)",
        gameId: "demo-remote",
        title: "Remote Demo",
      },
      status: "failed",
      timestamp: 42,
    });

    expect(record.downloadHost).toBeUndefined();
    expect(record.title).toBe("Remote Demo");
    expect(record.status).toBe("failed");
  });
});
