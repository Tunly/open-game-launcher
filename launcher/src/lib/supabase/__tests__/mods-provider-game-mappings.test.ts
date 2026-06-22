import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const authGetUser = vi.fn();
  const from = vi.fn();
  return { authGetUser, from };
});

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: mocks.authGetUser },
    from: mocks.from,
  }),
  isSupabaseConfigured: true,
}));

function makeSelectChain(data: unknown[], error: { message: string; code?: string } | null = null) {
  const chain = {
    eq: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data, error })),
    order: vi.fn(() => chain),
    select: vi.fn(() => chain),
  };
  return chain;
}

function makeUpsertChain(data: unknown, error: { message: string; code?: string } | null = null) {
  const chain = {
    select: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data, error })),
    upsert: vi.fn(() => chain),
  };
  return chain;
}

describe("shared mod provider game mappings", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.authGetUser.mockReset();
    mocks.from.mockReset();
    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("lists active shared provider game mappings with filters", async () => {
    const chain = makeSelectChain([
      {
        confidence: "verified",
        created_at: "2026-06-10T09:00:00.000Z",
        created_by: "admin",
        game_id: null,
        game_title: "Baldur's Gate 3",
        id: "mapping-1",
        local_game_id: "steam-owned-1086940",
        provider: "modio",
        provider_game_id: "baldurs-gate-3",
        source: "admin",
        status: "active",
        updated_at: "2026-06-10T09:00:00.000Z",
        verified_at: "2026-06-10T09:30:00.000Z",
      },
    ]);
    mocks.from.mockReturnValue(chain);

    const { listSharedModProviderGameMappings } = await import("../mods");
    const rows = await listSharedModProviderGameMappings({
      localGameId: "steam-owned-1086940",
      provider: "modio",
    });

    expect(mocks.from).toHaveBeenCalledWith("mod_provider_game_mappings");
    expect(chain.eq).toHaveBeenCalledWith("status", "active");
    expect(chain.eq).toHaveBeenCalledWith("local_game_id", "steam-owned-1086940");
    expect(chain.eq).toHaveBeenCalledWith("provider", "modio");
    expect(rows).toEqual([
      expect.objectContaining({
        confidence: "verified",
        localGameId: "steam-owned-1086940",
        provider: "modio",
        providerGameId: "baldurs-gate-3",
      }),
    ]);
  });

  it("returns an empty list when the shared mapping table is not deployed", async () => {
    const chain = makeSelectChain([], { code: "42P01", message: "relation does not exist" });
    mocks.from.mockReturnValue(chain);

    const { listSharedModProviderGameMappings } = await import("../mods");
    await expect(listSharedModProviderGameMappings()).resolves.toEqual([]);
  });

  it("upserts authenticated user contributions without accepting caller-owned ids", async () => {
    const chain = makeUpsertChain({
      confidence: "manual",
      created_at: "2026-06-10T09:00:00.000Z",
      created_by: "user-1",
      game_id: null,
      game_title: "Baldur's Gate 3",
      id: "mapping-1",
      local_game_id: "steam-owned-1086940",
      provider: "modio",
      provider_game_id: "baldurs-gate-3",
      source: "manual",
      status: "active",
      updated_at: "2026-06-10T09:00:00.000Z",
      verified_at: null,
    });
    mocks.from.mockReturnValue(chain);

    const { upsertSharedModProviderGameMapping } = await import("../mods");
    const row = await upsertSharedModProviderGameMapping({
      gameTitle: "Baldur's Gate 3",
      localGameId: "steam-owned-1086940",
      provider: "modio",
      providerGameId: "baldurs-gate-3",
    });

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        created_by: "user-1",
        local_game_id: "steam-owned-1086940",
        provider: "modio",
        provider_game_id: "baldurs-gate-3",
      }),
      { onConflict: "provider,local_game_id,provider_game_id" },
    );
    expect(row).toEqual(
      expect.objectContaining({
        createdBy: "user-1",
        localGameId: "steam-owned-1086940",
        providerGameId: "baldurs-gate-3",
      }),
    );
  });

  it("upserts provider API promotions as high-confidence unverified rows with metadata", async () => {
    const chain = makeUpsertChain({
      confidence: "high",
      created_at: "2026-06-10T09:00:00.000Z",
      created_by: "user-1",
      game_id: null,
      game_title: "Baldur's Gate 3",
      id: "mapping-1",
      local_game_id: "steam-owned-1086940",
      metadata: {
        providerApi: {
          query: "dice",
          resultCount: 2,
          sampleExternalIds: ["123", "456"],
        },
      },
      provider: "modio",
      provider_game_id: "baldurs-gate-3",
      source: "provider_api",
      status: "active",
      updated_at: "2026-06-10T09:00:00.000Z",
      verified_at: null,
    });
    mocks.from.mockReturnValue(chain);

    const { upsertSharedModProviderGameMapping } = await import("../mods");
    const row = await upsertSharedModProviderGameMapping({
      gameTitle: "Baldur's Gate 3",
      localGameId: "steam-owned-1086940",
      metadata: {
        providerApi: {
          query: "dice",
          resultCount: 2,
          sampleExternalIds: ["123", "456"],
        },
      },
      provider: "modio",
      providerGameId: "baldurs-gate-3",
      source: "provider_api",
    });

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        confidence: "high",
        metadata: {
          providerApi: {
            query: "dice",
            resultCount: 2,
            sampleExternalIds: ["123", "456"],
          },
        },
        source: "provider_api",
        verified_at: null,
      }),
      { onConflict: "provider,local_game_id,provider_game_id" },
    );
    expect(row).toEqual(
      expect.objectContaining({
        confidence: "high",
        metadata: {
          providerApi: {
            query: "dice",
            resultCount: 2,
            sampleExternalIds: ["123", "456"],
          },
        },
        source: "provider_api",
        verifiedAt: null,
      }),
    );
  });

  it("skips shared upsert when no user is signed in", async () => {
    mocks.authGetUser.mockResolvedValue({ data: { user: null } });

    const { upsertSharedModProviderGameMapping } = await import("../mods");
    await expect(
      upsertSharedModProviderGameMapping({
        localGameId: "game",
        provider: "curseforge",
        providerGameId: "432",
      }),
    ).resolves.toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
