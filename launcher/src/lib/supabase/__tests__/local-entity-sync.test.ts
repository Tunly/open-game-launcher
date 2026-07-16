import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyRemoteLocalEntities: vi.fn(),
  from: vi.fn(),
  getPendingLocalEntities: vi.fn(),
  markLocalEntitiesSynced: vi.fn(),
}));

vi.mock("../../launcher", () => ({
  applyRemoteLocalEntities: mocks.applyRemoteLocalEntities,
  getPendingLocalEntities: mocks.getPendingLocalEntities,
  markLocalEntitiesSynced: mocks.markLocalEntitiesSynced,
}));

vi.mock("../client", () => ({
  getSupabaseClient: () => ({ from: mocks.from }),
}));

describe("local entity cloud sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("uploads and acknowledges only cloud-supported entity kinds", async () => {
    mocks.getPendingLocalEntities.mockResolvedValue([
      {
        entity: {
          executablePath: "C:\\Games\\Arcade\\game.exe",
          id: "game-1",
          installPath: "C:\\Games\\Arcade",
          launchUri: "steam://run/1",
          processNames: ["game.exe"],
          status: "installed",
          title: "Arcade",
        },
        id: "game-1",
        kind: "games",
        syncToken: "game-upload-token",
        updatedAt: 100,
      },
      {
        entity: { id: "install-1", targetRoot: "C:\\Games\\Arcade" },
        id: "install-1",
        kind: "mod_installs",
        syncToken: "local-only-token",
        updatedAt: 101,
      },
    ]);
    mocks.markLocalEntitiesSynced.mockResolvedValue(undefined);
    mocks.applyRemoteLocalEntities.mockResolvedValue(undefined);

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ select, upsert });

    const { syncLocalEntitiesWithSupabase } = await import("../local-entity-sync");
    await syncLocalEntitiesWithSupabase("user-1");

    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          deleted_at: null,
          entity: {
            id: "game-1",
            status: "not_installed",
            title: "Arcade",
          },
          entity_id: "game-1",
          kind: "games",
          local_updated_at: 100,
        }),
      ],
      { onConflict: "user_id,device_id,kind,entity_id" },
    );
    expect(mocks.markLocalEntitiesSynced).toHaveBeenCalledWith([
      { id: "game-1", kind: "games", syncToken: "game-upload-token" },
    ]);
  });

  it("uploads tombstones and applies only the latest row per entity", async () => {
    mocks.getPendingLocalEntities.mockResolvedValue([
      {
        deletedAt: 1_800_000_000_000,
        entity: {},
        id: "game-1",
        kind: "games",
        syncToken: "delete-token",
        updatedAt: 1_800_000_000_000,
      },
    ]);
    mocks.markLocalEntitiesSynced.mockResolvedValue(undefined);
    mocks.applyRemoteLocalEntities.mockResolvedValue(undefined);

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          deleted_at: null,
          entity: { id: "game-1", title: "old" },
          entity_id: "game-1",
          kind: "games",
          local_updated_at: 100,
        },
        {
          deleted_at: null,
          entity: { id: "game-1", title: "newer-live" },
          entity_id: "game-1",
          kind: "games",
          local_updated_at: 200,
        },
        {
          deleted_at: "2027-01-15T08:00:00.000Z",
          entity: {},
          entity_id: "game-1",
          kind: "games",
          local_updated_at: 200,
        },
      ],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ select, upsert });

    const { syncLocalEntitiesWithSupabase } = await import("../local-entity-sync");
    await syncLocalEntitiesWithSupabase("user-1");

    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          deleted_at: "2027-01-15T08:00:00.000Z",
          entity: {},
          entity_id: "game-1",
        }),
      ],
      { onConflict: "user_id,device_id,kind,entity_id" },
    );
    expect(mocks.applyRemoteLocalEntities).toHaveBeenCalledWith([
      expect.objectContaining({
        deletedAt: 200,
        id: "game-1",
        updatedAt: 200,
      }),
    ]);
  });
});
