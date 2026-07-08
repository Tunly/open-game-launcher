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
import { isUbisoftDlcEntry } from "../library-filters-helpers";

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

  it("filters by launcher source", () => {
    const filters = { ...defaults, launchers: ["EA"] };
    const eaGame = makeGame({ id: "ea-apex" });
    const steamGame = makeGame({ id: "steam-csgo" });
    expect(gamePassesAdvancedFilters(eaGame, filters, context)).toBe(true);
    expect(gamePassesAdvancedFilters(steamGame, filters, context)).toBe(false);
  });

  it("matches legacy Uplay rows with the Ubisoft launcher filter", () => {
    const filters = { ...defaults, launchers: ["Ubisoft"] };
    const uplayGame = makeGame({ id: "legacy-635", launcher: "Uplay" as never });

    expect(gamePassesAdvancedFilters(uplayGame, filters, context)).toBe(true);
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

  it("matches structured categories and tag labels", () => {
    const game = makeGame({
      categoryLabels: ["Arcade"],
      tagLabels: ["Boss Rush"],
    });

    expect(gamePassesAdvancedFilters(game, { ...defaults, categories: ["arcade"] }, context)).toBe(
      true,
    );
    expect(
      gamePassesAdvancedFilters(game, { ...defaults, categories: ["boss rush"] }, context),
    ).toBe(true);
  });
});

describe("isUbisoftDlcEntry", () => {
  it("does not hide Ubisoft base game editions", () => {
    for (const title of [
      "Assassin's Creed Valhalla Gold Edition",
      "Far Cry 6 - Base Game",
      "Tom Clancy's Rainbow Six Siege - Deluxe Edition",
      "Watch Dogs Legion Ultimate Edition",
    ]) {
      expect(
        isUbisoftDlcEntry(
          makeGame({
            id: "ubisoft-owned-6100",
            title,
            description: "Ubisoft Connect game (Owned). ID: 6100",
            launcher: "ubisoft",
          }),
        ),
      ).toBe(false);
    }
  });

  it("still hides Ubisoft DLC and asset entries", () => {
    for (const [id, launcher, title] of [
      ["ubisoft-owned-6100", "ubisoft", "Assassin's Creed Valhalla - Season Pass"],
      ["ubisoft-6100", "ubisoft", "Far Cry 6 HD Texture Pack"],
      ["legacy-credits", "Uplay", "Rainbow Six Siege 1200 Credits Pack"],
      ["legacy-expansion", "Ubisoft Connect", "Watch Dogs Legion - Bloodline Expansion"],
      ["legacy-odyssey", "Ubisoft Connect", "Assassin's Creed Odyssey - Legacy of the First Blade"],
      ["legacy-division", "ubisoft", "Tom Clancy's The Division 2 - Warlords of New York"],
      ["legacy-crew", "Uplay", "The Crew - Calling All Units"],
    ] as const) {
      expect(
        isUbisoftDlcEntry(
          makeGame({
            id,
            title,
            description: "Ubisoft Connect game (Owned). ID: 6100",
            launcher: launcher as never,
          }),
        ),
      ).toBe(true);
    }
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
});
