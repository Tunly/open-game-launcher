import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: mocks.authGetUser },
    from: mocks.from,
  }),
  isSupabaseConfigured: true,
}));

import { recordUserModInstall } from "../mods";

describe("user mod install sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ upsert: mocks.upsert });
  });

  it("upserts a scan in one database request", async () => {
    await recordUserModInstall([
      {
        enabled: true,
        gameId: "game-1",
        id: "mod-1",
        installId: "install-1",
        installedAt: 1_788_000_000,
        installedFiles: ["mods/one.pak"],
        provider: "local_folder",
        targetPath: "C:/Games/One",
        title: "One",
      },
      {
        enabled: false,
        gameId: "game-1",
        id: "mod-2",
        installId: "install-2",
        installedAt: 1_788_000_100,
        installedFiles: ["mods/two.pak"],
        provider: "local_folder",
        targetPath: "C:/Games/Two",
        title: "Two",
      },
    ]);

    expect(mocks.authGetUser).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ local_install_id: "install-1", user_id: "user-1" }),
        expect.objectContaining({ local_install_id: "install-2", user_id: "user-1" }),
      ]),
      { onConflict: "user_id,local_install_id" },
    );
  });

  it("skips Supabase entirely for an empty scan", async () => {
    await recordUserModInstall([]);

    expect(mocks.authGetUser).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
