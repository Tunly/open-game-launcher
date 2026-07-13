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
        entity: { id: "game-1", title: "Arcade" },
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
});
