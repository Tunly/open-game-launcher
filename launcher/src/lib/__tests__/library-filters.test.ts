import { describe, expect, it } from "vitest";
import type { Game } from "../types";
import {
  type LibraryAdvancedFilters,
  type LibraryFilterContext,
  countActiveAdvancedFilters,
  gamePassesAdvancedFilters,
  matchesSearchQuery,
  matchesSizeQuery,
} from "../library-filters";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "steam-1",
    title: "Test Game",
    description: "",
    developer: "",
    publisher: "",
    platform: "windows",
    status: "installed",
    playtimeMinutes: 0,
    productCategory: "game",
    achievements: [],
    features: [],
    genres: [],
    players: [],
    ...overrides,
  } as Game;
}

const defaults: LibraryAdvancedFilters = {
  players: [],
  features: [],
  hardware: [],
  genres: [],
  status: [],
  platforms: [],
  launchers: [],
  categories: [],
  sizeQuery: "",
  productCategories: ["game"],
  showGamePassCatalog: false,
};

const context: LibraryFilterContext = {
  activePlatformFilter: "all",
  favorites: {},
  hiddenGames: {},
  customCategories: {},
};

describe("matchesSizeQuery", () => {
  it("matches when the query is empty", () => {
    expect(matchesSizeQuery(50, "")).toBe(true);
    expect(matchesSizeQuery(50, "  ")).toBe(true);
  });

  it("matches exact sizes", () => {
    expect(matchesSizeQuery(50, "=50gb")).toBe(true);
    expect(matchesSizeQuery(50.04, "=50gb")).toBe(true);
  });

  it("matches greater-than sizes", () => {
    expect(matchesSizeQuery(120, ">100gb")).toBe(true);
    expect(matchesSizeQuery(50, ">100gb")).toBe(false);
  });

  it("matches less-than sizes", () => {
    expect(matchesSizeQuery(50, "<100gb")).toBe(true);
    expect(matchesSizeQuery(150, "<100gb")).toBe(false);
  });

  it("converts units to GB", () => {
    expect(matchesSizeQuery(1500, ">1tb")).toBe(true);
    expect(matchesSizeQuery(1, "<2048mb")).toBe(true);
    expect(matchesSizeQuery(0.5, ">100mb")).toBe(true);
  });
});

describe("matchesSearchQuery", () => {
  it("returns true for empty queries", () => {
    expect(matchesSearchQuery(makeGame(), "")).toBe(true);
  });

  it("matches the title case-insensitively", () => {
    expect(matchesSearchQuery(makeGame({ title: "Elden Ring" }), "elden")).toBe(true);
  });

  it("matches inside features, genres, and players", () => {
    const game = makeGame({
      features: ["Steam Achievements"],
      genres: ["RPG"],
      players: ["Co-op"],
    });
    expect(matchesSearchQuery(game, "achievement")).toBe(true);
    expect(matchesSearchQuery(game, "rpg")).toBe(true);
    expect(matchesSearchQuery(game, "co-op")).toBe(true);
  });

  it("returns false when nothing matches", () => {
    expect(matchesSearchQuery(makeGame({ title: "Foo" }), "bar")).toBe(false);
  });
});

describe("gamePassesAdvancedFilters", () => {
  it("passes a vanilla game with defaults", () => {
    expect(gamePassesAdvancedFilters(makeGame(), defaults, context)).toBe(true);
  });

  it("rejects games whose productCategory is not in the filter", () => {
    const game = makeGame({ productCategory: "dlc" });
    expect(gamePassesAdvancedFilters(game, defaults, context)).toBe(false);
  });

  it("rejects gamepass games when showGamePassCatalog is false", () => {
    const game = makeGame({ id: "gamepass-foo" });
    expect(gamePassesAdvancedFilters(game, defaults, context)).toBe(false);
  });

  it("allows gamepass games when showGamePassCatalog is true", () => {
    const filters = { ...defaults, showGamePassCatalog: true };
    const game = makeGame({ id: "gamepass-foo" });
    expect(gamePassesAdvancedFilters(game, filters, context)).toBe(true);
  });

  it("filters by launcher source", () => {
    const filters = { ...defaults, launchers: ["EA"] };
    const eaGame = makeGame({ id: "ea-apex" });
    const steamGame = makeGame({ id: "steam-csgo" });
    expect(gamePassesAdvancedFilters(eaGame, filters, context)).toBe(true);
    expect(gamePassesAdvancedFilters(steamGame, filters, context)).toBe(false);
  });

  it("respects hidden games in status filter", () => {
    const hiddenContext: LibraryFilterContext = {
      ...context,
      hiddenGames: { "steam-1": true },
    };
    expect(
      gamePassesAdvancedFilters(makeGame(), { ...defaults, status: ["installed"] }, hiddenContext),
    ).toBe(false);
  });

  it("matches custom category tags", () => {
    const taggedContext: LibraryFilterContext = {
      ...context,
      customCategories: { "steam-1": ["favorites", "speedrun"] },
    };
    const filters = { ...defaults, categories: ["speedrun"] };
    expect(gamePassesAdvancedFilters(makeGame(), filters, taggedContext)).toBe(true);
  });
});

describe("countActiveAdvancedFilters", () => {
  it("returns 0 for the defaults", () => {
    expect(countActiveAdvancedFilters(defaults, defaults)).toBe(0);
  });

  it("counts each activated filter", () => {
    const modified: LibraryAdvancedFilters = {
      ...defaults,
      players: ["Singleplayer"],
      features: ["Steam Achievements"],
      sizeQuery: ">10gb",
    };
    expect(countActiveAdvancedFilters(modified, defaults)).toBe(3);
  });

  it("counts changed productCategories once", () => {
    const modified: LibraryAdvancedFilters = {
      ...defaults,
      productCategories: ["dlc", "video"],
    };
    expect(countActiveAdvancedFilters(modified, defaults)).toBe(1);
  });

  it("counts a toggled gamepass catalog flag", () => {
    const modified: LibraryAdvancedFilters = { ...defaults, showGamePassCatalog: true };
    expect(countActiveAdvancedFilters(modified, defaults)).toBe(1);
  });
});