import { isTauri } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Game } from "../../../lib/types";
import { mergeBattlenetOwned } from "../battlenet";

const mocks = vi.hoisted(() => ({
  processBattleNetGamesPayload: vi.fn(),
}));

vi.mock("../../../lib/launcher", () => ({
  processBattleNetGamesPayload: mocks.processBattleNetGamesPayload,
}));

const cacheKey = "launcher.battlenetGamesCache";
const context = {
  forceRefresh: false,
  setStatusMessage: () => undefined,
  shouldApplyResult: () => true,
};

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "battlenet-wow_classic_anniversary",
    externalId: "wow_classic_anniversary",
    title: "Jubiläum von Burning Crusade",
    description: "",
    version: "",
    launcher: "battlenet",
    platform: "windows",
    playtimeMinutes: 0,
    status: "installed",
    ...overrides,
  } as Game;
}

function cacheGames(games: unknown[]) {
  localStorage.setItem(cacheKey, JSON.stringify(games));
}

describe("mergeBattlenetOwned artwork", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.processBattleNetGamesPayload.mockReset();
    vi.mocked(isTauri).mockReturnValue(false);
  });

  it("hydrates Black Ops 4 artwork in the Tauri runtime", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    cacheGames([
      {
        id: "battlenet-owned-1447645266",
        externalId: "1447645266",
        title: "Call of Duty: Black Ops 4",
        coverUrl: null,
        logoUrl: null,
        iconUrl: null,
      },
    ]);
    mocks.processBattleNetGamesPayload.mockResolvedValue([
      {
        id: "battlenet-owned-1447645266",
        externalId: "1447645266",
        title: "Call of Duty: Black Ops 4",
        coverUrl: "C:\\open-game-launcher\\battlenet-assets\\black-ops-4-cover.webp",
        logoUrl: "C:\\open-game-launcher\\battlenet-assets\\black-ops-4-logo.png",
        iconUrl: "C:\\open-game-launcher\\battlenet-assets\\black-ops-4-icon.png",
      },
    ]);

    const result = await mergeBattlenetOwned([], context);

    expect(mocks.processBattleNetGamesPayload).toHaveBeenCalledOnce();
    expect(result.games[0].coverUrl).toContain("black-ops-4-cover.webp");
    expect(result.games[0].iconUrl).toContain("black-ops-4-icon.png");
    expect(localStorage.getItem(cacheKey)).toContain("black-ops-4-cover");
  });

  it("matches the trademarked Diablo III title from Battle.net", async () => {
    cacheGames([
      {
        id: "battlenet-owned-17459",
        externalId: "17459",
        title: "Diablo® III",
        coverUrl: null,
        logoUrl: null,
        iconUrl: null,
      },
    ]);

    const result = await mergeBattlenetOwned([], context);

    expect(result.games[0].coverUrl).toContain("blz-contentstack-images.akamaized.net");
    expect(result.games[0].iconUrl).toBe(result.games[0].coverUrl);
  });

  it("replaces generated World of Warcraft placeholders with provider artwork", async () => {
    cacheGames([
      {
        id: "battlenet-owned-5730135",
        externalId: "5730135",
        title: "World of Warcraft®",
        description: "",
        coverUrl: "data:image/svg+xml,%3Csvg%3E",
        iconUrl: "data:image/svg+xml,%3Csvg%3E",
        logoUrl: null,
        lastPlayedAt: null,
      },
    ]);

    const result = await mergeBattlenetOwned([], context);

    expect(result.games[0].coverUrl).toMatch(/^https:\/\/bnetcmsus-a\.akamaihd\.net\//);
    expect(result.games[0].iconUrl).toBe(result.games[0].coverUrl);
  });

  it("upgrades the installed Battle.net game even when cached owned ids differ", async () => {
    cacheGames([
      {
        id: "battlenet-owned-5730135",
        externalId: "5730135",
        title: "World of Warcraft®",
        description: "",
        coverUrl: null,
        iconUrl: null,
        logoUrl: null,
        lastPlayedAt: null,
      },
    ]);

    const result = await mergeBattlenetOwned(
      [
        makeGame({
          coverUrl: "data:image/svg+xml,%3Csvg%3E",
          iconUrl: "data:image/svg+xml,%3Csvg%3E",
        }),
      ],
      context,
    );

    expect(result.games[0].coverUrl).toMatch(/^https:\/\/bnetcmsus-a\.akamaihd\.net\//);
    expect(result.games[0].iconUrl).toBe(result.games[0].coverUrl);
  });

  it("preserves an existing non-placeholder Battle.net image", async () => {
    cacheGames([
      {
        id: "battlenet-owned-5730135",
        externalId: "5730135",
        title: "World of Warcraft®",
        description: "",
        coverUrl: null,
        iconUrl: null,
        logoUrl: null,
        lastPlayedAt: null,
      },
    ]);

    const result = await mergeBattlenetOwned(
      [makeGame({ coverUrl: "https://custom.example/cover.jpg", iconUrl: "custom-icon.png" })],
      context,
    );

    expect(result.games[0].coverUrl).toBe("https://custom.example/cover.jpg");
    expect(result.games[0].iconUrl).toBe("custom-icon.png");
  });
});
