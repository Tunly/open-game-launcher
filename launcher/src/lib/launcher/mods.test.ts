import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeCommand: vi.fn(),
}));

vi.mock("./shared", () => ({
  invokeCommand: mocks.invokeCommand,
}));

import {
  browseMods,
  getModProviderStatus,
  getNxmHandlerStatus,
  installMod,
  listManagedMods,
  openProviderMod,
  openNxmHandlerSettings,
  removeMod,
  setModEnabled,
  takePendingNxmStatus,
} from "./mods";

describe("simplified mod provider launcher wrappers", () => {
  beforeEach(() => {
    mocks.invokeCommand.mockReset();
    mocks.invokeCommand.mockResolvedValue(undefined);
  });

  it("passes the normalized browse request as one command payload", async () => {
    const input = {
      gameId: "steam-owned-440",
      provider: "nexus" as const,
      query: "interface",
      sort: "popular" as const,
      pageSize: 24,
    };

    await browseMods(input);

    expect(mocks.invokeCommand).toHaveBeenCalledWith("browse_mods", { input });
  });

  it("keeps installation and provider URLs inside structured command payloads", async () => {
    const input = {
      capability: "nxm_handoff" as const,
      gameId: "steam-owned-440",
      itemId: "123",
      provider: "nexus" as const,
      title: "Interface Overhaul",
    };

    await installMod(input);
    await openProviderMod({
      gameId: input.gameId,
      itemId: input.itemId,
      provider: input.provider,
      url: "https://www.nexusmods.com/example/mods/123",
    });

    expect(mocks.invokeCommand).toHaveBeenNthCalledWith(1, "install_mod", { input });
    expect(mocks.invokeCommand).toHaveBeenNthCalledWith(2, "open_provider_mod", {
      input: {
        gameId: input.gameId,
        itemId: input.itemId,
        provider: input.provider,
        url: "https://www.nexusmods.com/example/mods/123",
      },
    });
  });

  it("uses exact selected identifiers for status and management commands", async () => {
    await getModProviderStatus("steam_workshop", "steam-owned-440");
    await listManagedMods("steam-owned-440");
    await setModEnabled("install-1", false);
    await removeMod("install-1");

    expect(mocks.invokeCommand).toHaveBeenNthCalledWith(1, "get_mod_provider_status", {
      provider: "steam_workshop",
      gameId: "steam-owned-440",
    });
    expect(mocks.invokeCommand).toHaveBeenNthCalledWith(2, "list_managed_mods", {
      gameId: "steam-owned-440",
    });
    expect(mocks.invokeCommand).toHaveBeenNthCalledWith(3, "set_mod_enabled", {
      enabled: false,
      installId: "install-1",
    });
    expect(mocks.invokeCommand).toHaveBeenNthCalledWith(4, "remove_mod", {
      installId: "install-1",
    });
  });

  it("keeps NXM secrets behind redacted status-only commands", async () => {
    await getNxmHandlerStatus();
    await takePendingNxmStatus();
    await openNxmHandlerSettings();

    expect(mocks.invokeCommand).toHaveBeenNthCalledWith(1, "get_nxm_handler_status");
    expect(mocks.invokeCommand).toHaveBeenNthCalledWith(2, "take_pending_nxm_status");
    expect(mocks.invokeCommand).toHaveBeenNthCalledWith(3, "open_nxm_handler_settings");
  });
});
