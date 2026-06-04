import { describe, expect, it } from "vitest";
import type { Game } from "../types";
import {
  executableTitleFromPath,
  formatAchievementProgress,
  formatLastPlayed,
  formatPlayTime,
  getErrorMessage,
  getFallbackBannerClass,
  getGameIconCandidates,
  getGameLogoCandidates,
  getGameSource,
  getLogoPlacementStyle,
  getLogoPositionClass,
  getPlatformBannerClass,
  matchesLauncherFilter,
  normalizeLauncherKey,
} from "../formatters";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "steam-12345",
    title: "Test Game",
    description: "",
    developer: "",
    publisher: "",
    platform: "windows",
    status: "installed",
    playtimeMinutes: 0,
    achievements: [],
    ...overrides,
  } as Game;
}

describe("getErrorMessage", () => {
  it("returns the message for Error instances", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("stringifies non-Error values", () => {
    expect(getErrorMessage("oops")).toBe("oops");
    expect(getErrorMessage(42)).toBe("42");
    expect(getErrorMessage(null)).toBe("null");
    expect(getErrorMessage(undefined)).toBe("undefined");
  });

  it("preserves subclass messages (e.g. CloudNotConfiguredError)", () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "CustomError";
      }
    }
    expect(getErrorMessage(new CustomError("nope"))).toBe("nope");
  });
});

describe("executableTitleFromPath", () => {
  it("strips the .exe extension", () => {
    expect(executableTitleFromPath("C:/games/Foo/Bar.exe")).toBe("Bar");
  });

  it("replaces underscores and dashes with spaces", () => {
    expect(executableTitleFromPath("/games/super_mario-run.exe")).toBe("super mario run");
  });

  it("falls back to the file name for empty results", () => {
    const fileName = "___.exe";
    expect(executableTitleFromPath(fileName)).toBe(fileName);
  });

  it("handles paths without extension", () => {
    expect(executableTitleFromPath("/games/just/a/file")).toBe("file");
  });
});

describe("formatLastPlayed", () => {
  it("returns 'Not played' for null/undefined", () => {
    expect(formatLastPlayed()).toBe("Not played");
    expect(formatLastPlayed(null)).toBe("Not played");
    expect(formatLastPlayed("")).toBe("Not played");
  });

  it("returns the raw string for invalid dates", () => {
    expect(formatLastPlayed("not-a-date")).toBe("not-a-date");
  });

  it("formats a valid ISO date as month + day", () => {
    const result = formatLastPlayed("2024-03-15T10:00:00.000Z");
    expect(result).toMatch(/Mar/);
    expect(result).toMatch(/15/);
  });
});

describe("formatPlayTime", () => {
  it("returns '0 hours' for missing/zero playtime", () => {
    expect(formatPlayTime()).toBe("0 hours");
    expect(formatPlayTime(0)).toBe("0 hours");
    expect(formatPlayTime(-10)).toBe("0 hours");
  });

  it("returns one decimal hour for small values", () => {
    expect(formatPlayTime(60)).toBe("1.0 hours");
    expect(formatPlayTime(30)).toBe("0.5 hours");
  });

  it("rounds larger hour values", () => {
    expect(formatPlayTime(600)).toBe("10 hours");
    expect(formatPlayTime(60 * 24)).toBe("24 hours");
  });
});

describe("formatAchievementProgress", () => {
  it("returns 0/0 when there are no achievements", () => {
    expect(formatAchievementProgress(makeGame())).toBe("0/0");
  });

  it("counts unlocked achievements", () => {
    const game = makeGame({
      achievements: [
        { name: "a1", unlockedAt: "2024-01-01" } as never,
        { name: "a2", unlockedAt: null } as never,
        { name: "a3", unlockedAt: "2024-02-01" } as never,
      ],
    });
    expect(formatAchievementProgress(game)).toBe("2/3");
  });
});

describe("getGameLogoCandidates", () => {
  it("deduplicates and filters empty values", () => {
    const game = makeGame({ logoUrl: "a.png", logoUrls: ["a.png", "b.png", ""] });
    const result = getGameLogoCandidates(game);
    expect(result).toEqual(["a.png", "b.png"]);
  });

  it("returns an empty array if nothing is set", () => {
    const game = makeGame({ logoUrl: undefined, logoUrls: [] });
    expect(getGameLogoCandidates(game)).toEqual([]);
  });
});

describe("getGameIconCandidates", () => {
  it("merges icon, logo, and cover sources in priority order", () => {
    const game = makeGame({
      iconUrl: "icon.png",
      iconUrls: ["icon2.png"],
      logoUrl: "logo.png",
      coverUrl: "cover.png",
    });
    const result = getGameIconCandidates(game);
    expect(result[0]).toBe("icon.png");
    expect(result).toContain("icon2.png");
    expect(result).toContain("logo.png");
    expect(result).toContain("cover.png");
  });

  it("deduplicates values", () => {
    const game = makeGame({
      iconUrl: "a.png",
      logoUrl: "a.png",
      coverUrl: "a.png",
    });
    const result = getGameIconCandidates(game);
    expect(result.filter((value) => value === "a.png")).toHaveLength(1);
  });
});

describe("getLogoPositionClass", () => {
  it("returns the correct class per known position", () => {
    const game = makeGame({ logoPosition: "upperCenter" });
    expect(getLogoPositionClass(game)).toContain("top-");
  });

  it("falls back to bottomLeft for unknown values", () => {
    expect(getLogoPositionClass(makeGame())).toContain("bottom-");
  });
});

describe("getLogoPlacementStyle", () => {
  it("returns undefined when percents are not set", () => {
    const style = getLogoPlacementStyle(makeGame());
    expect(style.width).toBeUndefined();
    expect(style.maxHeight).toBeUndefined();
  });

  it("clamps the percent values to allowed ranges", () => {
    const style = getLogoPlacementStyle(makeGame({ logoWidthPercent: 5, logoHeightPercent: 99 }));
    expect(style.width).toBe("18%");
    expect(style.maxHeight).toBe("46%");
  });
});

describe("normalizeLauncherKey", () => {
  it("identifies launcher from id prefix", () => {
    expect(normalizeLauncherKey(undefined, "steam-123")).toBe("steam");
    expect(normalizeLauncherKey(undefined, "epic-fortnite")).toBe("epic");
    expect(normalizeLauncherKey(undefined, "gog-witcher")).toBe("gog");
    expect(normalizeLauncherKey(undefined, "ubisoft-ac")).toBe("ubisoft");
    expect(normalizeLauncherKey(undefined, "xbox-game")).toBe("xbox");
    expect(normalizeLauncherKey(undefined, "gamepass-xyz")).toBe("xbox");
    expect(normalizeLauncherKey(undefined, "battlenet-wow")).toBe("battlenet");
    expect(normalizeLauncherKey(undefined, "ea-apex")).toBe("ea");
    expect(normalizeLauncherKey(undefined, "manual-local")).toBe("manual");
  });

  it("identifies launcher from label", () => {
    expect(normalizeLauncherKey("Steam")).toBe("steam");
    expect(normalizeLauncherKey("EA App")).toBe("ea");
  });

  it("falls back to unknown when nothing matches and no label is provided", () => {
    expect(normalizeLauncherKey(undefined, "no-prefix")).toBe("unknown");
  });
});

describe("getGameSource", () => {
  it("prefers the id prefix over the label", () => {
    expect(getGameSource(makeGame({ id: "steam-1", launcher: "epic" }))).toBe("steam");
  });

  it("falls back to platform if nothing else matches", () => {
    const game = makeGame({
      id: "no-prefix",
      description: "",
      platform: "macos",
    });
    expect(getGameSource(game)).toBe("macos");
  });
});

describe("matchesLauncherFilter", () => {
  it("matches an exact launcher token", () => {
    expect(matchesLauncherFilter(makeGame({ id: "ea-game" }), "ea")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(matchesLauncherFilter(makeGame({ id: "ea-game" }), "EA")).toBe(true);
  });

  it("rejects non-matching sources", () => {
    expect(matchesLauncherFilter(makeGame({ id: "steam-1" }), "EA")).toBe(false);
  });
});

describe("getFallbackBannerClass", () => {
  it("returns empty string when a cover url is set", () => {
    expect(getFallbackBannerClass(makeGame({ coverUrl: "cover.png" }))).toBe("");
  });

  it("returns a library-source-art class when no cover is set", () => {
    const result = getFallbackBannerClass(makeGame({ id: "steam-1" }));
    expect(result).toContain("library-source-art");
  });
});

describe("getPlatformBannerClass", () => {
  it("returns a class per known platform", () => {
    expect(getPlatformBannerClass(makeGame({ id: "steam-1" }))).toBe("steam-game-banner-hero");
  });

  it("returns the matching banner class for known sources", () => {
    expect(getPlatformBannerClass(makeGame({ id: "xbox-1" }))).toBe("xbox-game-banner-hero");
    expect(getPlatformBannerClass(makeGame({ id: "epic-1" }))).toBe("epic-game-banner-hero");
  });
});
