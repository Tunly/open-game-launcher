import { describe, expect, it } from "vitest";

import {
  getAchievementProviderStatusMessage,
  type AchievementProviderStatus,
} from "../achievement-status";

function providerStatus(
  message: string,
  status: AchievementProviderStatus["status"] = "failed",
): AchievementProviderStatus {
  return {
    message,
    source: "ubisoft",
    stability: "unofficial",
    status,
  };
}

describe("getAchievementProviderStatusMessage", () => {
  it.each([
    ["UNC path", String.raw`sync failed: \\server\share\achievements\635.json`],
    ["Windows device path", String.raw`sync failed: \\?\C:\Users\Danie\635.json`],
    ["root home path", "sync failed: /root/.cache/ubisoft/635.json"],
    ["bracketed root path", "sync failed: cache[/root/.cache/ubisoft/635.json]"],
    ["optional install path", "sync failed: /opt/ubisoft/cache/635.json"],
    ["local file URL", "sync failed: file:///root/.cache/ubisoft/635.json"],
    ["forward-slash UNC path", "sync failed: //server/share/achievements/635.json"],
    ["relative checked paths", "sync failed: Checked paths: cache/user/635.json"],
  ])("rejects a %s diagnostic", (_label, message) => {
    const result = getAchievementProviderStatusMessage(providerStatus(message));

    expect(result).toBe("Ubisoft achievement sync failed. Open the game in Library to try again.");
    expect(result).not.toMatch(/server|users|root|opt|checked|635\.json/i);
  });

  it.each([
    "sync failed: Steam profile is private",
    "sync-local-game-achievements failed: Steam profile is private",
    "games::sync failed: Steam profile is private",
  ])("strips a native command prefix from %s", (message) => {
    expect(getAchievementProviderStatusMessage(providerStatus(message))).toBe(
      "Steam profile is private",
    );
  });

  it.each<[AchievementProviderStatus["status"], string]>([
    ["available", "Ubisoft achievement sync is available."],
    ["not_connected", "Ubisoft achievement sync needs a connected account or readable local data."],
    ["no_api", "Ubisoft achievement sync has no stable provider API."],
    ["private", "Ubisoft achievement data is private or unavailable."],
    ["unsupported", "Ubisoft achievement sync is not supported for this game."],
    ["failed", "Ubisoft achievement sync failed. Open the game in Library to try again."],
  ])("uses a safe %s fallback", (status, expected) => {
    expect(
      getAchievementProviderStatusMessage(
        providerStatus(String.raw`\\server\share\private\diagnostic.json`, status),
      ),
    ).toBe(expected);
  });

  it("preserves a short player-facing provider message", () => {
    expect(getAchievementProviderStatusMessage(providerStatus("Steam profile is private"))).toBe(
      "Steam profile is private",
    );
  });
});
