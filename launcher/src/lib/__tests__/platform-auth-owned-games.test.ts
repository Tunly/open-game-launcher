import { describe, expect, it } from "vitest";

import { normalizeSteamOwnedGames } from "../launcher/platform-auth";

describe("normalizeSteamOwnedGames playtime provenance", () => {
  it("does not invent zero playtime when Steam supplied no playtime field", () => {
    const [game] = normalizeSteamOwnedGames([{ appid: 10, name: "Counter-Strike" }]);

    expect(game).toBeDefined();
    expect(game).not.toHaveProperty("playtimeMinutes");
  });

  it("preserves an explicit provider zero", () => {
    const [game] = normalizeSteamOwnedGames([
      { appid: 10, name: "Counter-Strike", hours_forever: 0 },
    ]);

    expect(game?.playtimeMinutes).toBe(0);
  });

  it("prefers explicit minutes, including zero, over an hours fallback", () => {
    const [game] = normalizeSteamOwnedGames([
      {
        appid: 10,
        name: "Counter-Strike",
        hours_forever: 12,
        playtimeMinutes: 0,
      },
    ]);

    expect(game?.playtimeMinutes).toBe(0);
  });

  it("converts provider hours and rejects invalid negative values", () => {
    const [known] = normalizeSteamOwnedGames([
      { appid: 10, name: "Counter-Strike", hours_forever: "1.5" },
    ]);
    const [unknown] = normalizeSteamOwnedGames([
      { appid: 20, name: "Team Fortress Classic", playtimeMinutes: -1 },
    ]);

    expect(known?.playtimeMinutes).toBe(90);
    expect(unknown).not.toHaveProperty("playtimeMinutes");
  });

  it("restores validated local achievement data from the account-scoped cache", () => {
    const [game] = normalizeSteamOwnedGames([
      {
        achievements: [
          {
            id: "first-win",
            name: "First Win",
            source: "steam",
            unlockedAt: "2026-07-10T10:00:00.000Z",
          },
          { id: "invalid-without-name" },
        ],
        achievementsSyncedAt: "2026-07-10T10:05:00.000Z",
        appid: 10,
        name: "Counter-Strike",
      },
    ]);

    expect(game?.achievements).toEqual([
      {
        id: "first-win",
        name: "First Win",
        source: "steam",
        unlockedAt: "2026-07-10T10:00:00.000Z",
      },
    ]);
    expect(game?.achievementsSyncedAt).toBe("2026-07-10T10:05:00.000Z");
  });
});
