import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Game } from "../../../lib/types";

const mocks = vi.hoisted(() => ({ listOglCatalogGames: vi.fn() }));

vi.mock("../../../lib/supabase/ogl-catalog", () => ({
  listOglCatalogGames: () => mocks.listOglCatalogGames(),
}));

const context = {
  forceRefresh: false,
  setStatusMessage: vi.fn(),
  shouldApplyResult: () => true,
};

function game(overrides: Partial<Game>): Game {
  return {
    id: "steam-1",
    title: "Provider Game",
    description: "",
    version: "1",
    platform: "windows",
    status: "installed",
    ...overrides,
  };
}

describe("mergeOglCatalog", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.listOglCatalogGames.mockReset();
  });

  it("adds current OGL games and replaces stale catalog snapshots", async () => {
    const current = game({ id: "ogl-neon-runners", launcher: "ogl", title: "Neon Runners" });
    mocks.listOglCatalogGames.mockResolvedValue([current]);

    const { mergeOglCatalog } = await import("../ogl");
    const result = await mergeOglCatalog(
      [
        game({}),
        game({ id: "ogl-old", launcher: "ogl", status: "not_installed", title: "Old Catalog" }),
      ],
      context,
    );

    expect(result.games.map((item) => item.id)).toEqual(["steam-1", "ogl-neon-runners"]);
  });

  it("preserves the input library when Supabase is unavailable", async () => {
    const existing = [game({}), game({ id: "ogl-saved", launcher: "ogl" })];
    mocks.listOglCatalogGames.mockImplementation(() => {
      throw new Error("offline");
    });

    const { mergeOglCatalog } = await import("../ogl");
    const result = await mergeOglCatalog(existing, context);

    expect(result.games).toEqual(existing);
    expect(result.statusMessage).toMatch(/temporarily unavailable/i);
  });
});
