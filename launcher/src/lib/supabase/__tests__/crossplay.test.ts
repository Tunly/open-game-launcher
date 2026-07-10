import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getSupabaseClient: vi.fn(),
}));

vi.mock("../client", () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

interface QueryResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

function makeListChain(result: QueryResult) {
  const enabledEq = vi.fn().mockResolvedValue(result);
  const gameIdEq = vi.fn(() => ({ eq: enabledEq }));
  const select = vi.fn(() => ({ eq: gameIdEq }));
  return { enabledEq, gameIdEq, select };
}

describe("cross-play Supabase helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
    mocks.getSupabaseClient.mockReset();
    mocks.getSupabaseClient.mockReturnValue({ from: mocks.from });
  });

  it("does not query the UUID game_id column for a local launcher game id", async () => {
    const chain = makeListChain({ data: [], error: null });
    mocks.from.mockReturnValue(chain);

    const { listGameCrossPlay } = await import("../crossplay");

    await expect(listGameCrossPlay("steam-owned-792100")).resolves.toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("queries and maps cross-play rows for a catalog game UUID", async () => {
    const gameId = "11111111-1111-4111-8111-111111111111";
    const chain = makeListChain({
      data: [
        {
          created_at: "2026-07-09T10:00:00.000Z",
          game_id: gameId,
          id: "22222222-2222-4222-8222-222222222222",
          is_enabled: true,
          is_verified: false,
          metadata: null,
          notes: null,
          platform: "steam",
          updated_at: "2026-07-09T10:00:00.000Z",
          verified_at: null,
          verified_by_user_id: null,
        },
      ],
      error: null,
    });
    mocks.from.mockReturnValue(chain);

    const { listGameCrossPlay } = await import("../crossplay");
    const result = await listGameCrossPlay(gameId);

    expect(mocks.from).toHaveBeenCalledWith("game_cross_play");
    expect(chain.gameIdEq).toHaveBeenCalledWith("game_id", gameId);
    expect(chain.enabledEq).toHaveBeenCalledWith("is_enabled", true);
    expect(result).toEqual([
      expect.objectContaining({
        gameId,
        metadata: {},
        platform: "steam",
      }),
    ]);
  });

  it("keeps the empty-list fallback when the cross-play table is unavailable", async () => {
    const chain = makeListChain({
      data: null,
      error: { message: "relation game_cross_play does not exist" },
    });
    mocks.from.mockReturnValue(chain);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { listGameCrossPlay } = await import("../crossplay");

    await expect(listGameCrossPlay("11111111-1111-4111-8111-111111111111")).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "listGameCrossPlay: query failed (table may not exist):",
      "relation game_cross_play does not exist",
    );
  });
});
