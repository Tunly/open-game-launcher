import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Game } from "../../../lib/types";
import { mergeUbisoftOwned } from "../ubisoft";

const mocks = vi.hoisted(() => ({
  fetchUbisoftOwnedGames: vi.fn(),
}));

vi.mock("../../../lib/launcher", () => ({
  fetchUbisoftOwnedGames: (...args: unknown[]) => mocks.fetchUbisoftOwnedGames(...args),
}));

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "ubisoft-635",
    title: "Rainbow Six Siege",
    description: "",
    version: "1.0",
    status: "installed",
    platform: "windows",
    launcher: "ubisoft",
    playtimeMinutes: 0,
    ...overrides,
  } as Game;
}

function ownedGame(id = "635", title = "Rainbow Six Siege") {
  return {
    id: `ubisoft-owned-${id}`,
    externalId: id,
    title,
    description: `Ubisoft Connect game (Owned). ID: ${id}`,
    coverUrl: null,
    logoUrl: null,
    playtimeMinutes: 0,
    lastPlayedAt: null,
  };
}

const context = {
  forceRefresh: false,
  setStatusMessage: vi.fn(),
  shouldApplyResult: () => true,
};

describe("mergeUbisoftOwned", () => {
  beforeEach(() => {
    mocks.fetchUbisoftOwnedGames.mockReset();
    context.setStatusMessage.mockReset();
  });

  it("dedupes legacy installed Ubisoft rows by launcher and externalId", async () => {
    mocks.fetchUbisoftOwnedGames.mockResolvedValue([ownedGame("635")]);
    const installed = makeGame({
      id: "legacy-r6",
      launcher: "ubisoft",
      externalId: "635",
    });

    const result = await mergeUbisoftOwned([installed], context);

    expect(result.games).toEqual([installed]);
  });

  it("dedupes native installed Ubisoft rows by numeric id", async () => {
    mocks.fetchUbisoftOwnedGames.mockResolvedValue([ownedGame("635")]);
    const installed = makeGame({
      id: "ubisoft-635",
      externalId: "635",
    });

    const result = await mergeUbisoftOwned([installed], context);

    expect(result.games).toEqual([installed]);
  });

  it("does not merge Ubisoft owned DLC entries as games", async () => {
    mocks.fetchUbisoftOwnedGames.mockResolvedValue([
      ownedGame("100", "Assassins Creed Odyssey"),
      ownedGame("200", "Assassins Creed Odyssey - Legacy of the First Blade"),
      ownedGame("300", "Tom Clancys The Division 2 - Warlords of New York"),
    ]);

    const result = await mergeUbisoftOwned([], context);

    expect(result.games.map((game) => game.title)).toEqual(["Assassins Creed Odyssey"]);
  });
});
