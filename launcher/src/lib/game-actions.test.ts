import { describe, expect, it } from "vitest";

import type { Game } from "./types";
import {
  resolveGameActionCapability,
  resolveGroupGameActionCapabilities,
  resolveGroupSelectionState,
  resolveOfficialSupportDestination,
  resolveSelectedCopyActionCapabilities,
  type GameActionRuntimeContext,
} from "./game-actions";

const desktopContext: GameActionRuntimeContext = {
  runtime: "desktop",
  operatingSystem: "windows",
};

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "steam-440",
    title: "Team Fortress 2",
    description: "Test game",
    version: "1.0",
    launcher: "steam",
    status: "installed",
    platform: "windows",
    installPath: "C:\\Games\\Team Fortress 2",
    ...overrides,
  };
}

describe("resolveSelectedCopyActionCapabilities", () => {
  it("keeps browser-only provider actions honest while allowing support and local artwork", () => {
    const capabilities = resolveSelectedCopyActionCapabilities(makeGame(), {
      runtime: "browser",
      operatingSystem: "windows",
      clientInstalled: true,
      providerAutomationAvailable: true,
    });

    expect(capabilities.support).toMatchObject({
      available: true,
      completionObservable: false,
      mode: "user_handoff",
      scope: "selected_copy",
    });
    expect(capabilities.local_artwork).toMatchObject({
      available: true,
      mode: "local_managed",
    });
    expect(capabilities.verify).toMatchObject({
      available: false,
      mode: "not_applicable",
      reason: expect.stringMatching(/desktop app/i),
    });
    expect(capabilities.client_manager.available).toBe(false);
    expect(capabilities.open_provider.available).toBe(false);
  });

  it("models manual entries as launch-target checks and library-only removal", () => {
    const game = makeGame({
      id: "manual-local-game",
      launcher: "manual",
      executablePath: "C:\\Games\\Local\\game.exe",
    });
    const capabilities = resolveSelectedCopyActionCapabilities(game, desktopContext);

    expect(capabilities.verify).toMatchObject({
      available: true,
      completionObservable: true,
      label: "Check launch target",
      mode: "local_read_only",
    });
    expect(capabilities.remove_from_library).toMatchObject({
      available: true,
      destructive: true,
      label: "Remove from Library",
      mode: "local_managed",
      requiresConfirmation: true,
    });
    for (const action of ["repair", "check_update", "update", "uninstall"] as const) {
      expect(capabilities[action]).toMatchObject({
        available: false,
        mode: "not_applicable",
      });
    }
  });

  it("blocks a manual launch-target check when no local target is configured", () => {
    const capability = resolveGameActionCapability(
      makeGame({ id: "manual-missing", launcher: "manual", installPath: undefined }),
      "verify",
      desktopContext,
    );

    expect(capability).toMatchObject({
      available: false,
      label: "Check launch target",
      mode: "local_read_only",
      reason: expect.stringMatching(/no local launch target/i),
    });
  });

  it("requires trusted local evidence for OG-managed maintenance", () => {
    const game = makeGame({ id: "og-local-game", launcher: "manual" });
    const capabilities = resolveSelectedCopyActionCapabilities(game, {
      ...desktopContext,
      ogManaged: true,
      manifestTrust: "signed",
      hasLocalRepairPackage: true,
      hasSignedUpdatePackage: false,
      managedInstallPathVerified: true,
    });

    expect(capabilities.verify).toMatchObject({ available: true, mode: "local_read_only" });
    expect(capabilities.repair).toMatchObject({ available: true, mode: "local_managed" });
    expect(capabilities.check_update).toMatchObject({ available: true, mode: "local_read_only" });
    expect(capabilities.update).toMatchObject({
      available: false,
      mode: "local_managed",
      reason: expect.stringMatching(/signed update package/i),
    });
    expect(capabilities.uninstall).toMatchObject({
      available: true,
      destructive: true,
      mode: "local_managed",
      requiresConfirmation: true,
    });
    expect(capabilities.remove_from_library.available).toBe(false);
  });

  it("does not enable provider automation merely because a client is installed", () => {
    const capabilities = resolveSelectedCopyActionCapabilities(makeGame(), {
      ...desktopContext,
      clientInstalled: true,
      clientLoggedIn: true,
      clientVersionFingerprint: "steam-1",
    });

    expect(capabilities.verify).toMatchObject({
      available: false,
      label: "Verify in Steam",
      mode: "provider_automation",
      reason: expect.stringMatching(/automation adapter/i),
    });
    expect(capabilities.open_provider).toMatchObject({
      available: true,
      completionObservable: false,
      label: "Open Steam",
      mode: "user_handoff",
    });
  });

  it("enables provider actions only when every declared automation prerequisite is present", () => {
    const context: GameActionRuntimeContext = {
      ...desktopContext,
      clientInstalled: true,
      clientLoggedIn: true,
      clientVersionFingerprint: "steam-1",
      providerAutomationAvailable: true,
    };

    expect(resolveGameActionCapability(makeGame(), "repair", context)).toMatchObject({
      available: true,
      completionObservable: true,
      label: "Repair in Steam",
      mode: "provider_automation",
    });
    expect(resolveGameActionCapability(makeGame(), "uninstall", context)).toMatchObject({
      available: true,
      destructive: true,
      label: "Uninstall with Steam",
      requiresConfirmation: true,
    });
  });

  it("uses not_applicable when a provider does not exist on the current OS", () => {
    const capability = resolveGameActionCapability(
      makeGame({ id: "xbox-game", launcher: "xbox" }),
      "verify",
      {
        runtime: "desktop",
        operatingSystem: "macos",
        clientInstalled: true,
        providerAutomationAvailable: true,
      },
    );

    expect(capability).toMatchObject({
      available: false,
      mode: "not_applicable",
      reason: expect.stringMatching(/not available on macos/i),
    });
  });

  it("blocks maintenance while the selected game copy is running", () => {
    const capability = resolveGameActionCapability(makeGame(), "uninstall", {
      ...desktopContext,
      clientInstalled: true,
      clientLoggedIn: true,
      clientVersionFingerprint: "steam-1",
      providerAutomationAvailable: true,
      gameRunning: true,
    });

    expect(capability).toMatchObject({
      available: false,
      destructive: true,
      reason: expect.stringMatching(/running/i),
    });
  });

  it("does not offer installed-copy maintenance to a catalog-only copy", () => {
    const capability = resolveGameActionCapability(
      makeGame({ status: "not_installed", installPath: undefined }),
      "repair",
      {
        ...desktopContext,
        clientInstalled: true,
        providerAutomationAvailable: true,
      },
    );

    expect(capability).toMatchObject({ available: false, mode: "not_applicable" });
  });
});

describe("group action capabilities", () => {
  it("resolves all/some/none state without selecting an implicit primary copy", () => {
    const ids = ["steam-1", "gog-1", "xbox-1"];

    expect(resolveGroupSelectionState(ids, () => false)).toBe("none");
    expect(resolveGroupSelectionState(ids, (id) => id === "steam-1")).toBe("some");
    expect(resolveGroupSelectionState(ids, () => true)).toBe("all");
  });

  it("keeps group metadata local and scoped to all copies", () => {
    const capabilities = resolveGroupGameActionCapabilities(
      [makeGame(), makeGame({ id: "gog-1", launcher: "gog" })],
      { favorite: "some", hidden: "none" },
    );

    expect(capabilities.favorite).toMatchObject({
      aggregateState: "some",
      available: true,
      mode: "local_managed",
      scope: "all_copies",
    });
    expect(capabilities.hidden.aggregateState).toBe("none");
    expect(capabilities.categories.aggregateState).toBe("none");
    expect(capabilities.collections.aggregateState).toBe("none");
  });
});

describe("support destinations", () => {
  it("returns provider-owned HTTPS destinations without game or account data", () => {
    expect(resolveOfficialSupportDestination(makeGame())).toEqual({
      label: "Steam Support",
      provider: "steam",
      url: "https://help.steampowered.com/",
    });
    expect(
      resolveOfficialSupportDestination(makeGame({ id: "manual-1", launcher: "manual" })),
    ).toBeNull();
  });
});
