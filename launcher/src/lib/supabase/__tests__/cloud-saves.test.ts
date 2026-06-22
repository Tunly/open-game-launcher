import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const authGetUser = vi.fn();
  const from = vi.fn();
  const getSupabaseClient = vi.fn();
  return {
    authGetUser,
    from,
    getSupabaseClient,
  };
});

vi.mock("../client", () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

describe("cloud save supabase helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.authGetUser.mockReset();
    mocks.from.mockReset();
    mocks.getSupabaseClient.mockReset();

    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.getSupabaseClient.mockReturnValue({
      auth: { getUser: mocks.authGetUser },
      from: mocks.from,
    });
  });

  it("maps cloud save set rows with fallback launcher, sync mode, and metadata", async () => {
    const chain = makeCloudSaveSetListChain([
      makeSaveSetRow({
        launcher: "steam",
        metadata: { savePaths: ["Slot1.sav"] },
        sync_mode: "on_exit",
      }),
      makeSaveSetRow({
        id: "set-2",
        launcher: "itch",
        metadata: ["not", "an", "object"],
        sync_mode: "whenever",
      }),
    ]);
    mocks.from.mockReturnValue(chain);

    const { listMyCloudSaveSets } = await import("../cloud-saves");
    const result = await listMyCloudSaveSets();

    expect(mocks.authGetUser).toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledWith("user_cloud_save_sets");
    expect(chain.select).toHaveBeenCalledWith("*");
    expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(chain.order).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(result).toEqual([
      expect.objectContaining({
        id: "set-1",
        launcher: "steam",
        metadata: { savePaths: ["Slot1.sav"] },
        syncMode: "on_exit",
        userId: "user-1",
      }),
      expect.objectContaining({
        id: "set-2",
        launcher: "unknown",
        metadata: {},
        syncMode: "manual",
      }),
    ]);
  });

  it("maps cloud save file rows with nullable storage fields and size fallback", async () => {
    const chain = makeCloudSaveFileListChain([
      makeSaveFileRow({
        checksum_sha256: "sha-1",
        size_bytes: 120,
        storage_object_path: "user-1/set-1/Slot1.sav",
      }),
      makeSaveFileRow({
        id: "file-2",
        label: null,
        size_bytes: "large",
        storage_object_path: null,
      }),
    ]);
    mocks.from.mockReturnValue(chain);

    const { listCloudSaveFilesForSet } = await import("../cloud-saves");
    const result = await listCloudSaveFilesForSet("set-1");

    expect(mocks.from).toHaveBeenCalledWith("user_cloud_save_files");
    expect(chain.select).toHaveBeenCalledWith("*");
    expect(chain.eq).toHaveBeenCalledWith("save_set_id", "set-1");
    expect(chain.order).toHaveBeenCalledWith("local_path");
    expect(result).toEqual([
      expect.objectContaining({
        checksumSha256: "sha-1",
        id: "file-1",
        saveSetId: "set-1",
        sizeBytes: 120,
        storageObjectPath: "user-1/set-1/Slot1.sav",
        userId: "user-1",
      }),
      expect.objectContaining({
        id: "file-2",
        label: null,
        sizeBytes: null,
        storageObjectPath: null,
      }),
    ]);
  });

  it("upserts cloud save file metadata with storage object and checksum fields", async () => {
    const chain = makeSaveFileUpsertChain(
      makeSaveFileRow({
        checksum_sha256: "a".repeat(64),
        label: "Profile Slot",
        local_path: "Profiles/Slot1.sav",
        modified_at: "2026-06-13T10:10:00.000Z",
        size_bytes: 2048,
        storage_object_path: "user-1/steam-440/profile-slot/Profiles/Slot1.sav.enc",
        synced_at: "2026-06-13T10:11:00.000Z",
      }),
    );
    mocks.from.mockReturnValue(chain);

    const { upsertCloudSaveFile } = await import("../cloud-saves");
    const result = await upsertCloudSaveFile({
      checksumSha256: "a".repeat(64),
      label: "Profile Slot",
      localPath: " Profiles/Slot1.sav ",
      modifiedAt: "2026-06-13T10:10:00.000Z",
      saveSetId: "set-1",
      sizeBytes: 2048,
      storageObjectPath: "user-1/steam-440/profile-slot/Profiles/Slot1.sav.enc",
      syncedAt: "2026-06-13T10:11:00.000Z",
    });

    expect(mocks.authGetUser).toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledWith("user_cloud_save_files");
    expect(chain.upsert).toHaveBeenCalledWith(
      {
        checksum_sha256: "a".repeat(64),
        label: "Profile Slot",
        local_path: "Profiles/Slot1.sav",
        modified_at: "2026-06-13T10:10:00.000Z",
        save_set_id: "set-1",
        size_bytes: 2048,
        storage_object_path: "user-1/steam-440/profile-slot/Profiles/Slot1.sav.enc",
        synced_at: "2026-06-13T10:11:00.000Z",
        user_id: "user-1",
      },
      { onConflict: "save_set_id,local_path" },
    );
    expect(chain.select).toHaveBeenCalledWith("*");
    expect(chain.single).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        checksumSha256: "a".repeat(64),
        localPath: "Profiles/Slot1.sav",
        saveSetId: "set-1",
        storageObjectPath: "user-1/steam-440/profile-slot/Profiles/Slot1.sav.enc",
        userId: "user-1",
      }),
    );
  });

  it("rejects empty cloud save file paths before issuing metadata writes", async () => {
    const { upsertCloudSaveFile } = await import("../cloud-saves");

    await expect(
      upsertCloudSaveFile({
        localPath: "  ",
        saveSetId: "set-1",
      }),
    ).rejects.toThrow("Local save path");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("upserts cloud save set metadata with the authenticated user and conflict key", async () => {
    const chain = makeSaveSetUpsertChain(
      makeSaveSetRow({
        external_id: null,
        launcher: "unknown",
        local_game_key: "steam:440",
        metadata: { savePaths: ["tf/cfg"] },
        platform: "linux",
        sync_mode: "scheduled",
        title: "Team Fortress 2",
      }),
    );
    mocks.from.mockReturnValue(chain);

    const { upsertCloudSaveSet } = await import("../cloud-saves");
    const result = await upsertCloudSaveSet({
      externalId: null,
      launcher: "itch",
      localGameKey: "steam:440",
      metadata: { savePaths: ["tf/cfg"] },
      platform: "linux",
      syncMode: "scheduled",
      title: "Team Fortress 2",
    });

    expect(mocks.authGetUser).toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledWith("user_cloud_save_sets");
    expect(chain.upsert).toHaveBeenCalledWith(
      {
        external_id: null,
        launcher: "unknown",
        local_game_key: "steam:440",
        metadata: { savePaths: ["tf/cfg"] },
        platform: "linux",
        sync_mode: "scheduled",
        title: "Team Fortress 2",
        user_id: "user-1",
      },
      { onConflict: "user_id,local_game_key" },
    );
    expect(chain.select).toHaveBeenCalledWith("*");
    expect(chain.single).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        externalId: null,
        launcher: "unknown",
        localGameKey: "steam:440",
        metadata: { savePaths: ["tf/cfg"] },
        platform: "linux",
        syncMode: "scheduled",
      }),
    );
  });

  it("updates cloud save set sync mode through a scoped table update", async () => {
    const chain = makeSaveSetUpdateReturningChain(
      makeSaveSetRow({
        sync_mode: "on_launch",
      }),
    );
    mocks.from.mockReturnValue(chain);

    const { updateCloudSaveSetSyncMode } = await import("../cloud-saves");
    const result = await updateCloudSaveSetSyncMode("set-1", "on_launch");

    expect(mocks.from).toHaveBeenCalledWith("user_cloud_save_sets");
    expect(chain.update).toHaveBeenCalledWith({ sync_mode: "on_launch" });
    expect(chain.eq).toHaveBeenCalledWith("id", "set-1");
    expect(chain.select).toHaveBeenCalledWith("*");
    expect(chain.single).toHaveBeenCalled();
    expect(result.syncMode).toBe("on_launch");
  });

  it("marks a cloud save set synced without selecting a row", async () => {
    const chain = makeUpdateOnlyChain();
    mocks.from.mockReturnValue(chain);

    const { markCloudSaveSetSynced } = await import("../cloud-saves");
    await expect(markCloudSaveSetSynced("set-1", "2026-06-13T12:00:00.000Z")).resolves.toBe(
      undefined,
    );

    expect(mocks.from).toHaveBeenCalledWith("user_cloud_save_sets");
    expect(chain.update).toHaveBeenCalledWith({
      last_synced_at: "2026-06-13T12:00:00.000Z",
    });
    expect(chain.eq).toHaveBeenCalledWith("id", "set-1");
  });

  it("deletes a cloud save set by id", async () => {
    const chain = makeDeleteChain();
    mocks.from.mockReturnValue(chain);

    const { deleteCloudSaveSet } = await import("../cloud-saves");
    await expect(deleteCloudSaveSet("set-1")).resolves.toBe(undefined);

    expect(mocks.from).toHaveBeenCalledWith("user_cloud_save_sets");
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("id", "set-1");
  });

  it("deletes a cloud save file by save set and local path", async () => {
    const chain = makeDeleteByPathChain();
    mocks.from.mockReturnValue(chain);

    const { deleteCloudSaveFileByPath } = await import("../cloud-saves");
    await expect(deleteCloudSaveFileByPath("set-1", " Slot1.sav ")).resolves.toBe(undefined);

    expect(mocks.from).toHaveBeenCalledWith("user_cloud_save_files");
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("save_set_id", "set-1");
    expect(chain.eq).toHaveBeenCalledWith("local_path", "Slot1.sav");
  });

  it("looks up a cloud save set by game key and falls back to null when schema is absent", async () => {
    const missingSchemaChain = makeCloudSaveSetByGameKeyChain(null, {
      code: "42P01",
      message: "relation does not exist",
    });
    mocks.from.mockReturnValue(missingSchemaChain);

    const { getCloudSaveSetByGameKey } = await import("../cloud-saves");
    const result = await getCloudSaveSetByGameKey("steam:440");

    expect(result).toBeNull();
    expect(missingSchemaChain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(missingSchemaChain.eq).toHaveBeenCalledWith("local_game_key", "steam:440");
  });

  it("aggregates storage usage with exact counts and numeric file sizes", async () => {
    const setsChain = makeUsageSetsChain(2);
    const filesChain = makeUsageFilesChain(
      [{ size_bytes: 128 }, { size_bytes: 256 }, { size_bytes: "unknown" }],
      3,
    );
    mocks.from.mockImplementation((table: string) => {
      if (table === "user_cloud_save_sets") return setsChain;
      if (table === "user_cloud_save_files") return filesChain;
      return {};
    });

    const { getCloudStorageUsage } = await import("../cloud-saves");
    const result = await getCloudStorageUsage();

    expect(setsChain.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(setsChain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(filesChain.select).toHaveBeenCalledWith("size_bytes", { count: "exact" });
    expect(filesChain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(result).toEqual({
      fileCount: 3,
      setCount: 2,
      totalSizeBytes: 384,
    });
  });

  it("returns zero storage usage when the session has no authenticated user", async () => {
    mocks.authGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const { getCloudStorageUsage } = await import("../cloud-saves");
    const result = await getCloudStorageUsage();

    expect(result).toEqual({
      fileCount: 0,
      setCount: 0,
      totalSizeBytes: 0,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("surfaces missing Supabase configuration from direct CRUD helpers", async () => {
    mocks.getSupabaseClient.mockImplementation(() => {
      throw new Error("Missing Supabase config");
    });

    const { listMyCloudSaveSets } = await import("../cloud-saves");
    await expect(listMyCloudSaveSets()).rejects.toThrow("Missing Supabase config");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

function makeSaveSetRow(overrides: Record<string, unknown> = {}) {
  return {
    created_at: "2026-06-13T10:00:00.000Z",
    external_id: "440",
    id: "set-1",
    last_synced_at: null,
    launcher: "steam",
    local_game_key: "steam:440",
    metadata: {},
    platform: "windows",
    sync_mode: "manual",
    title: "Team Fortress 2",
    updated_at: "2026-06-13T10:05:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function makeSaveFileRow(overrides: Record<string, unknown> = {}) {
  return {
    checksum_sha256: null,
    created_at: "2026-06-13T10:00:00.000Z",
    id: "file-1",
    label: "Slot 1",
    local_path: "Slot1.sav",
    modified_at: "2026-06-13T09:00:00.000Z",
    save_set_id: "set-1",
    size_bytes: null,
    storage_object_path: null,
    synced_at: null,
    updated_at: "2026-06-13T10:05:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

function makeCloudSaveSetListChain(rows: unknown[]) {
  const chain = {
    eq: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    select: vi.fn(() => chain),
  };
  return chain;
}

function makeCloudSaveFileListChain(rows: unknown[]) {
  const chain = {
    eq: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    select: vi.fn(() => chain),
  };
  return chain;
}

function makeSaveSetUpsertChain(row: unknown) {
  const chain = {
    select: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: row, error: null })),
    upsert: vi.fn(() => chain),
  };
  return chain;
}

function makeSaveFileUpsertChain(row: unknown) {
  const chain = {
    select: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: row, error: null })),
    upsert: vi.fn(() => chain),
  };
  return chain;
}

function makeSaveSetUpdateReturningChain(row: unknown) {
  const chain = {
    eq: vi.fn(() => chain),
    select: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: row, error: null })),
    update: vi.fn(() => chain),
  };
  return chain;
}

function makeUpdateOnlyChain() {
  const chain = {
    eq: vi.fn(() => Promise.resolve({ error: null })),
    update: vi.fn(() => chain),
  };
  return chain;
}

function makeDeleteChain() {
  const chain = {
    delete: vi.fn(() => chain),
    eq: vi.fn(() => Promise.resolve({ error: null })),
  };
  return chain;
}

function makeDeleteByPathChain() {
  let eqCalls = 0;
  const chain = {
    delete: vi.fn(() => chain),
    eq: vi.fn(() => {
      eqCalls += 1;
      return eqCalls >= 2 ? Promise.resolve({ error: null }) : chain;
    }),
  };
  return chain;
}

function makeCloudSaveSetByGameKeyChain(
  row: unknown,
  error: { code?: string; message: string } | null = null,
) {
  const chain = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: row, error })),
    select: vi.fn(() => chain),
  };
  return chain;
}

function makeUsageSetsChain(count: number) {
  const chain = {
    eq: vi.fn(() => Promise.resolve({ count, data: null, error: null })),
    select: vi.fn(() => chain),
  };
  return chain;
}

function makeUsageFilesChain(rows: unknown[], count: number | null) {
  const chain = {
    eq: vi.fn(() => Promise.resolve({ count, data: rows, error: null })),
    select: vi.fn(() => chain),
  };
  return chain;
}
