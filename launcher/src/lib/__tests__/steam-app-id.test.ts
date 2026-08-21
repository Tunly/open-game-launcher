import { describe, expect, it } from "vitest";

import { resolveSteamAppId } from "../steam-app-id";
import type { Game } from "../types";

function game(overrides: Partial<Game> = {}): Game {
  return {
    description: "",
    id: "steam-440",
    platform: "windows",
    status: "installed",
    title: "Team Fortress 2",
    version: "1.0",
    ...overrides,
  } as Game;
}

describe("resolveSteamAppId", () => {
  it("uses a numeric externalId on a steam-launcher game", () => {
    expect(
      resolveSteamAppId(game({ externalId: "570", id: "steam-owned-570", launcher: "steam" })),
    ).toBe("570");
  });

  it("falls back to the steam-owned- prefix", () => {
    expect(resolveSteamAppId(game({ id: "steam-owned-440" }))).toBe("440");
  });

  it("falls back to the steam- prefix", () => {
    expect(resolveSteamAppId(game({ id: "steam-440" }))).toBe("440");
  });

  it("reads a numeric AppID from a rungameid launch URI", () => {
    expect(resolveSteamAppId(game({ id: "steam-cs2", launchUri: "steam://rungameid/730" }))).toBe(
      "730",
    );
  });

  it("returns null when no AppID is derivable", () => {
    expect(resolveSteamAppId(game({ id: "epic-fortnite" }))).toBeNull();
    expect(resolveSteamAppId(game({ id: "steam-nonnumeric" }))).toBeNull();
    expect(resolveSteamAppId(game({ id: "steam-440", launchUri: "steam://rungameid/abc" }))).toBe(
      "440",
    );
  });
});
