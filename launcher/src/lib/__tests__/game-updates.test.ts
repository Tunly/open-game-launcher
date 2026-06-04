import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Game } from "../types";
import {
  classifyGameUpdate,
  fetchSteamNews,
  getGameUpdates,
  mapSteamNewsItems,
  readCachedUpdates,
  resolveSteamAppId,
  writeCachedUpdates,
} from "../game-updates";

const fetchSteamNewsForApp = vi.fn();

vi.mock("../launcher", () => ({
  fetchSteamNewsForApp: (appId: string) => fetchSteamNewsForApp(appId),
}));

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "steam-12345",
    title: "Test Game",
    description: "Steam game",
    launcher: "steam",
    version: "1.0",
    platform: "windows",
    status: "installed",
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("resolveSteamAppId", () => {
  it("uses externalId for Steam games", () => {
    expect(resolveSteamAppId(makeGame({ externalId: "730", id: "steam-123" }))).toBe("730");
  });

  it("uses steam-prefixed ids", () => {
    expect(resolveSteamAppId(makeGame({ id: "steam-440", externalId: undefined }))).toBe("440");
  });

  it("uses launch URIs when no explicit id exists", () => {
    expect(
      resolveSteamAppId(
        makeGame({
          id: "manual-steam",
          externalId: undefined,
          launchUri: "steam://rungameid/620",
        }),
      ),
    ).toBe("620");
  });

  it("returns null for non-Steam games", () => {
    expect(
      resolveSteamAppId(makeGame({ id: "epic-1", launcher: "epic", externalId: "730" })),
    ).toBeNull();
  });
});

describe("mapSteamNewsItems", () => {
  it("maps Steam news and prioritizes update-like items", () => {
    const items = mapSteamNewsItems("730", [
      {
        gid: "1",
        title: "Community Spotlight",
        contents: "Hello",
        date: 1,
        url: "https://example.test/news",
      },
      { gid: "2", title: "Patch 1.2.3", contents: "Fixes and balance", date: 2 },
    ]);

    expect(items[0]).toMatchObject({
      id: "2",
      source: "steam",
      sourceId: "730",
      kind: "patch",
      title: "Patch 1.2.3",
    });
    expect(items[1].kind).toBe("news");
  });

  it("sanitizes html and bbcode content", () => {
    const [item] = mapSteamNewsItems("730", [
      { title: "[h1]Update[/h1]", contents: "<p>Fixed &amp; tuned</p>", date: 1 },
    ]);

    expect(item.title).toBe("Update");
    expect(item.excerpt).toBe("Fixed & tuned");
  });
});

describe("classifyGameUpdate", () => {
  it("classifies patch notes", () => {
    expect(classifyGameUpdate("Hotfix 2.0.1")).toBe("patch");
  });

  it("classifies update posts", () => {
    expect(classifyGameUpdate("Developer Update")).toBe("update");
  });

  it("classifies unrelated posts as news", () => {
    expect(classifyGameUpdate("Community Spotlight")).toBe("news");
  });
});

describe("cache", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("reads cached updates before ttl expires", () => {
    const items = mapSteamNewsItems("730", [{ title: "Patch", date: 1 }]);
    writeCachedUpdates("730", items);

    expect(readCachedUpdates("730")).toEqual(items);
  });

  it("ignores expired cached updates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const items = mapSteamNewsItems("730", [{ title: "Patch", date: 1 }]);
    writeCachedUpdates("730", items);

    vi.setSystemTime(new Date("2026-01-01T07:00:00.000Z"));
    expect(readCachedUpdates("730")).toBeNull();
  });
});

describe("fetchSteamNews", () => {
  beforeEach(() => {
    fetchSteamNewsForApp.mockReset();
  });

  it("fetches Steam news through the native launcher command", async () => {
    fetchSteamNewsForApp.mockResolvedValue({
      appnews: { newsitems: [{ gid: "1", title: "Patch", date: 1 }] },
    });

    const result = await fetchSteamNews("730");

    expect(fetchSteamNewsForApp).toHaveBeenCalledWith("730");
    expect(result[0].title).toBe("Patch");
  });

  it("uses cache through getGameUpdates", async () => {
    const items = mapSteamNewsItems("730", [{ gid: "1", title: "Patch", date: 1 }]);
    writeCachedUpdates("730", items);

    expect(await getGameUpdates(makeGame({ externalId: "730" }))).toEqual(items);
    expect(fetchSteamNewsForApp).not.toHaveBeenCalled();
  });
});
