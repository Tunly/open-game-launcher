import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  selectEqUser: vi.fn(),
  selectEqGame: vi.fn(),
  selectInProviders: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  updateEqUser: vi.fn(),
  updateEqGame: vi.fn(),
  updateInProviders: vi.fn(),
  updateInInstallIds: vi.fn(),
}));

vi.mock("../client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: mocks.authGetUser },
    from: mocks.from,
  }),
  isSupabaseConfigured: true,
}));

import { syncUserManagedMods } from "../mods";

describe("user mod install sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.selectInProviders.mockResolvedValue({ data: [], error: null });
    mocks.selectEqGame.mockReturnValue({ in: mocks.selectInProviders });
    mocks.selectEqUser.mockReturnValue({ eq: mocks.selectEqGame });
    mocks.select.mockReturnValue({ eq: mocks.selectEqUser });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.updateInInstallIds.mockResolvedValue({ error: null });
    mocks.updateInProviders.mockReturnValue({ in: mocks.updateInInstallIds });
    mocks.updateEqGame.mockReturnValue({ in: mocks.updateInProviders });
    mocks.updateEqUser.mockReturnValue({ eq: mocks.updateEqGame });
    mocks.update.mockReturnValue({ eq: mocks.updateEqUser });
    mocks.from.mockReturnValue({
      select: mocks.select,
      update: mocks.update,
      upsert: mocks.upsert,
    });
  });

  it("upserts a scan in one database request", async () => {
    await syncUserManagedMods("game-1", [
      {
        canRemove: true,
        canToggle: true,
        enabled: true,
        gameId: "game-1",
        installId: "install-1",
        installedAt: 1_788_000_000,
        manageUrl: null,
        provider: "nexus",
        providerItemId: "42",
        status: "installed",
        title: "One",
        version: "1.0",
      },
      {
        canRemove: false,
        canToggle: false,
        enabled: false,
        gameId: "game-1",
        installId: "install-2",
        installedAt: 1_788_000_100,
        manageUrl: null,
        provider: "steam_workshop",
        providerItemId: "123",
        status: "external",
        title: "Two",
        version: null,
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
    const payload = mocks.upsert.mock.calls[0]?.[0] as Array<{
      install_path: string | null;
      last_error: string | null;
      legacy_mod_id: string | null;
      manifest: { provider: string; providerItemId: string | null };
      source_url: string | null;
      target_dir: string | null;
    }>;
    expect(payload.every((row) => row.source_url === null)).toBe(true);
    expect(payload.every((row) => row.target_dir === null)).toBe(true);
    expect(payload.every((row) => row.install_path === null)).toBe(true);
    expect(payload.every((row) => row.last_error === null)).toBe(true);
    expect(payload.every((row) => row.legacy_mod_id === null)).toBe(true);
    expect(payload.every((row) => !Object.hasOwn(row.manifest, "installedFiles"))).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("key=secret");
    expect(JSON.stringify(payload)).not.toContain("C:/Games");
    expect(JSON.stringify(payload)).not.toContain("mods/one.pak");
    expect(payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          catalog_mod_id: null,
          catalog_version_id: null,
          provider_item_id: "42",
          provider_version_id: "1.0",
        }),
      ]),
    );
  });

  it("does not sync legacy providers that are no longer active", async () => {
    await syncUserManagedMods("game-1", {
      canRemove: false,
      canToggle: false,
      enabled: true,
      gameId: "game-1",
      installId: "legacy-install",
      installedAt: 1_788_000_000,
      manageUrl: null,
      provider: "local_folder",
      providerItemId: null,
      status: "installed",
      title: "Legacy",
      version: null,
    });

    expect(mocks.authGetUser).toHaveBeenCalledTimes(1);
    expect(mocks.selectInProviders).toHaveBeenCalledWith("provider", ["nexus", "steam_workshop"]);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("marks active-provider rows missing from an empty scan as removed", async () => {
    mocks.selectInProviders.mockResolvedValueOnce({
      data: [
        { local_install_id: "install-1", provider: "nexus" },
        { local_install_id: "install-2", provider: "steam_workshop" },
      ],
      error: null,
    });

    await syncUserManagedMods("game-1", []);

    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        catalog_mod_id: null,
        catalog_version_id: null,
        install_path: null,
        install_state: "removed",
        last_error: null,
        legacy_mod_id: null,
        manifest: {},
        source_url: null,
        target_dir: null,
      }),
    );
    expect(mocks.updateInInstallIds).toHaveBeenCalledWith("local_install_id", [
      "install-1",
      "install-2",
    ]);
  });

  it("only marks stale rows removed after upserting the current scan", async () => {
    mocks.selectInProviders.mockResolvedValueOnce({
      data: [
        { local_install_id: "install-1", provider: "nexus" },
        { local_install_id: "stale-install", provider: "nexus" },
      ],
      error: null,
    });

    await syncUserManagedMods("game-1", {
      canRemove: true,
      canToggle: true,
      enabled: true,
      gameId: "game-1",
      installId: "install-1",
      installedAt: 1_788_000_000,
      manageUrl: null,
      provider: "nexus",
      providerItemId: "42",
      status: "installed",
      title: "One",
      version: "1.0",
    });

    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.updateInInstallIds).toHaveBeenCalledWith("local_install_id", ["stale-install"]);
  });
});
