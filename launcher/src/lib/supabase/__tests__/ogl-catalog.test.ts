import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getCurrentSessionUserId: vi.fn(),
}));

vi.mock("../client", () => ({
  getCurrentSessionUserId: () => mocks.getCurrentSessionUserId(),
  getSupabaseClient: () => ({ from: mocks.from }),
  isSupabaseConfigured: true,
}));

function makeCatalogQuery(data: unknown, error: { message: string } | null = null) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockResolvedValue({ data, error });
  return chain;
}

function makeUnlockQuery(data: unknown) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.in.mockResolvedValue({ data, error: null });
  return chain;
}

const catalogRow = {
  id: "catalog-neon",
  slug: "neon-runners",
  title: "Neon Runners",
  description: "Race through the night city.",
  short_description: "Fast arcade racing.",
  developer_name: "Open Forge Studio",
  publisher_name: "Open Game Publishing",
  cover_url: null,
  banner_url: "https://cdn.example/neon-banner.jpg",
  icon_url: "https://cdn.example/neon-icon.png",
  release_date: "2026-03-15",
  updated_at: "2026-07-14T08:00:00.000Z",
  achievements: [
    {
      id: "achievement-first-boost",
      key: "first-boost",
      name: "First Boost",
      description: "Finish your first race.",
      icon_url: null,
      rarity_percent: 42.5,
      source_synced_at: "2026-07-14T09:00:00.000Z",
      updated_at: "2026-07-14T08:30:00.000Z",
    },
  ],
};

describe("OG Launcher catalog", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.getCurrentSessionUserId.mockReset();
  });

  it("maps hosted catalog games and their unprefixed achievements", async () => {
    mocks.getCurrentSessionUserId.mockResolvedValue("user-1");
    mocks.from.mockImplementation((table: string) => {
      if (table === "games") return makeCatalogQuery([catalogRow]);
      if (table === "user_achievements") {
        return makeUnlockQuery([
          {
            achievement_id: "achievement-first-boost",
            unlocked_at: "2026-07-14T10:00:00.000Z",
          },
        ]);
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const { listOglCatalogGames } = await import("../ogl-catalog");
    const games = await listOglCatalogGames();

    expect(games).toEqual([
      expect.objectContaining({
        id: "ogl-neon-runners",
        launcher: "ogl",
        status: "not_installed",
        title: "Neon Runners",
        coverUrl: "https://cdn.example/neon-banner.jpg",
        achievementsSyncedAt: "2026-07-14T09:00:00.000Z",
        achievements: [
          expect.objectContaining({
            id: "first-boost",
            name: "First Boost",
            providerConfidence: "official",
            rarity: 42.5,
            source: "ogl",
            sourceAchievementId: "first-boost",
            unlockedAt: "2026-07-14T10:00:00.000Z",
          }),
        ],
      }),
    ]);
  });

  it("keeps public definitions visible and locked without a signed-in user", async () => {
    mocks.getCurrentSessionUserId.mockRejectedValue(new Error("Auth session missing"));
    mocks.from.mockImplementation((table: string) => {
      if (table === "games") return makeCatalogQuery([catalogRow]);
      throw new Error(`Unexpected table: ${table}`);
    });

    const { listOglCatalogGames } = await import("../ogl-catalog");
    const [game] = await listOglCatalogGames();

    expect(game.achievements?.[0]?.unlockedAt).toBeNull();
    expect(mocks.from).not.toHaveBeenCalledWith("user_achievements");
  });
});
