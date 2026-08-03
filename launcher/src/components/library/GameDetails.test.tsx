import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GameActionCapability, GameActionResult } from "../../lib/game-actions";
import type { Game } from "../../lib/types";
import { GameDetails, type GameDetailsProps } from "./GameDetails";

const launcherMocks = vi.hoisted(() => ({
  getGameActionCapabilities: vi.fn(),
  getPlatformClientAssetCacheLookup: vi.fn(),
  getPlatformClientInstallerMetadata: vi.fn(),
  getPlatformClientModificationConfig: vi.fn(),
  getPlatformClientUpdateStatus: vi.fn(),
  isTauri: vi.fn(),
  listen: vi.fn(),
  moveGame: vi.fn(),
  openDirectory: vi.fn(),
  openExternalUrl: vi.fn(),
  pollPlatformClientHealth: vi.fn(),
  prepareGameActionConfirmation: vi.fn(),
  previewPlatformClientAutoApply: vi.fn(),
  previewPlatformClientInstall: vi.fn(),
  runGameAction: vi.fn(),
  stopGame: vi.fn(),
  syncGameSaves: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: launcherMocks.isTauri,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: launcherMocks.listen,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: launcherMocks.openDirectory,
}));

vi.mock("../../lib/launcher", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/launcher")>()),
  getGameActionCapabilities: launcherMocks.getGameActionCapabilities,
  getPlatformClientAssetCacheLookup: launcherMocks.getPlatformClientAssetCacheLookup,
  getPlatformClientInstallerMetadata: launcherMocks.getPlatformClientInstallerMetadata,
  getPlatformClientModificationConfig: launcherMocks.getPlatformClientModificationConfig,
  getPlatformClientUpdateStatus: launcherMocks.getPlatformClientUpdateStatus,
  moveGame: launcherMocks.moveGame,
  openExternalUrl: launcherMocks.openExternalUrl,
  pollPlatformClientHealth: launcherMocks.pollPlatformClientHealth,
  prepareGameActionConfirmation: launcherMocks.prepareGameActionConfirmation,
  previewPlatformClientAutoApply: launcherMocks.previewPlatformClientAutoApply,
  previewPlatformClientInstall: launcherMocks.previewPlatformClientInstall,
  runGameAction: launcherMocks.runGameAction,
  stopGame: launcherMocks.stopGame,
  syncGameSaves: launcherMocks.syncGameSaves,
}));

vi.mock("../../lib/supabase/crossplay", () => ({
  getCrossPlayPlatforms: vi.fn().mockResolvedValue([]),
}));

describe("GameDetails actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    launcherMocks.isTauri.mockReturnValue(false);
    launcherMocks.getGameActionCapabilities.mockResolvedValue([]);
    launcherMocks.getPlatformClientAssetCacheLookup.mockResolvedValue(null);
    launcherMocks.getPlatformClientInstallerMetadata.mockResolvedValue(null);
    launcherMocks.getPlatformClientModificationConfig.mockResolvedValue(null);
    launcherMocks.getPlatformClientUpdateStatus.mockResolvedValue(null);
    launcherMocks.listen.mockResolvedValue(() => undefined);
    launcherMocks.moveGame.mockResolvedValue(undefined);
    launcherMocks.openDirectory.mockResolvedValue(null);
    launcherMocks.pollPlatformClientHealth.mockResolvedValue([]);
    launcherMocks.previewPlatformClientAutoApply.mockResolvedValue(null);
    launcherMocks.previewPlatformClientInstall.mockResolvedValue(null);
    launcherMocks.stopGame.mockResolvedValue({
      gameId: "local-test-game",
      message: "Local Test Game was stopped.",
      pid: 4242,
      success: true,
    });
    launcherMocks.syncGameSaves.mockResolvedValue({
      game: selectedGame,
      gameId: "local-test-game",
      message: "Local Test Game save sync completed.",
      missingFiles: [],
      success: true,
      syncedFiles: ["C:\\OG Launcher\\save-cache\\slot-1.sav"],
      syncRoot: "C:\\OG Launcher\\save-cache",
    });
  });

  it("renders the settings trigger but not screenshot or platform cloud save panels", async () => {
    renderGameDetails();

    expect(screen.getByRole("button", { name: "Game Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mods" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Capture screenshot" })).not.toBeInTheDocument();
    expect(screen.queryByText("Screenshots")).not.toBeInTheDocument();
    expect(screen.queryByText(/captures/i)).not.toBeInTheDocument();
    await expect(
      screen.findByRole("region", { name: /platform cloud saves/i }, { timeout: 250 }),
    ).rejects.toThrow();
  });

  it("describes achievement auto-sync instead of a missing trophy control", () => {
    renderGameDetails();

    expect(screen.getByText(/achievement auto-sync runs/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /sync now|retry sync|syncing/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/trophy button/i)).not.toBeInTheDocument();
  });

  it("shows the concrete provider reason when achievement sync is unavailable", () => {
    renderGameDetails({
      achievementProviderStatuses: [
        {
          message: "Connect Steam in Settings before syncing achievements.",
          source: "steam",
          stability: "official",
          status: "not_connected",
        },
      ],
    });

    expect(
      screen.getByText("Connect Steam in Settings before syncing achievements."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/achievement auto-sync runs/i)).not.toBeInTheDocument();
  });

  it("hides persisted achievement cache diagnostics", () => {
    const safeMessage =
      "No readable Ubisoft achievement data was found on this PC. Launch the game through Ubisoft Connect, then try again.";
    renderGameDetails({
      achievementProviderStatuses: [
        {
          message:
            "sync_local_game_achievements failed: No local ubisoft achievement cache found for Local Test Game. Checked: C:\\Users\\Danie\\AppData\\Local\\Ubisoft\\635.json; +52 more",
          source: "ubisoft",
          stability: "unofficial",
          status: "failed",
        },
      ],
      launcher: "ubisoft",
    });

    expect(screen.getByText(safeMessage)).toBeInTheDocument();
    expect(screen.queryByText(/sync_local_game_achievements|checked:/i)).not.toBeInTheDocument();
    expect(screen.getByText(/ubisoft: failed/i)).toHaveAttribute("title", safeMessage);
  });

  it("does not render the red achievement progress bar", () => {
    const { container } = renderGameDetails({
      achievements: [
        {
          id: "first-clear",
          name: "First Clear",
          description: "Finish the opening route.",
          unlockedAt: "2026-07-01T10:00:00.000Z",
        },
        {
          id: "secret-route",
          name: "Secret Route",
          description: "Find the hidden route.",
        },
      ],
    });

    expect(screen.getByText("1/2 · 50%")).toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll("div")).some((element) =>
        element.className.includes("bg-[#c20b2f]"),
      ),
    ).toBe(false);
  });

  it("keeps the achievement sort selector without a visible sort label", () => {
    renderGameDetails({
      achievements: [
        {
          id: "first-clear",
          name: "First Clear",
          description: "Finish the opening route.",
        },
      ],
    });

    const sortSelector = screen.getByRole("combobox", { name: "Sort achievements" });

    expect(sortSelector).toBeInTheDocument();
    expect(sortSelector.parentElement).not.toHaveClass("ml-auto");
    expect(screen.queryByText("Sort", { exact: true })).not.toBeInTheDocument();
  });

  it("does not display the achievement sync timestamp", () => {
    renderGameDetails({
      achievements: [
        {
          id: "first-clear",
          name: "First Clear",
          description: "Finish the opening route.",
        },
      ],
      achievementsSyncedAt: new Date().toISOString(),
    });

    expect(screen.queryByText(/synced\s+just now/i)).not.toBeInTheDocument();
  });

  it("does not fabricate friend play or wishlist activity", () => {
    renderGameDetails();

    expect(screen.queryByText("Friends Who Play")).not.toBeInTheDocument();
    expect(screen.queryByText(/friends have played previously/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /view all friends who play/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render the metadata information card", () => {
    renderGameDetails();

    expect(screen.queryByText("Metadaten & Infos")).not.toBeInTheDocument();
    expect(screen.queryByText("Provider and scanner data only.")).not.toBeInTheDocument();
    expect(screen.queryByText("Move Folder")).not.toBeInTheDocument();
    expect(screen.getByText("Not detected")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Up to date")).not.toBeInTheDocument();
  });

  it("shows the community artwork import deck in game settings and applies artwork", async () => {
    const onApplyCustomArtworkUrl = vi.fn();
    renderGameDetails({}, { onApplyCustomArtworkUrl });

    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));

    expect(
      await screen.findByRole(
        "region",
        { name: "Community artwork import deck" },
        { timeout: 10_000 },
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Import Panel Break Cover"));
    expect(onApplyCustomArtworkUrl).toHaveBeenCalledWith(
      "local-test-game",
      "cover",
      "/artwork/community-panel-cover.svg",
      "Panel Break Cover",
    );
  });

  it("keeps custom artwork local-only", () => {
    renderGameDetails({
      coverUrl: "https://cdn.example.test/cover.jpg",
      iconUrl: "https://cdn.example.test/icon.jpg",
      logoUrl: "https://cdn.example.test/logo.png",
    });

    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));

    expect(screen.getByTitle("Choose custom banner artwork")).toBeVisible();
    expect(screen.getByTitle("Choose custom icon artwork")).toBeVisible();
    expect(screen.getByTitle("Choose custom logo artwork")).toBeVisible();
    expect(screen.queryByText("Auto Artwork")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /hosted community artwork upload/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Community Art Deck")).not.toBeInTheDocument();
  });

  it("opens a Retro Manga dossier with explicit selected-copy and all-copies scopes", async () => {
    renderGameDetails(
      { id: "steam-shared-game", launcher: "steam" },
      {
        gameVariants: [
          { ...selectedGame, id: "steam-shared-game", launcher: "steam" },
          {
            ...selectedGame,
            id: "gog-shared-game",
            launcher: "gog",
            status: "update_available",
          },
        ],
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));

    expect(screen.getByRole("dialog", { name: "Game Options" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Selected copy actions" })).toBeVisible();
    expect(screen.getByRole("region", { name: "All copies organization" })).toBeVisible();
    expect(screen.getAllByText("All copies").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Select GOG copy" }));

    expect(screen.getByRole("button", { name: "Select GOG copy" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Update with GOG Galaxy/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /Verify in GOG Galaxy/i })).toBeDisabled();
    });
    expect(
      screen.getAllByText(
        "This action requires the OG-Launcher desktop app; no native operation ran in the browser.",
      ).length,
    ).toBeGreaterThan(0);
    expect(launcherMocks.getGameActionCapabilities).not.toHaveBeenCalled();
    expect(launcherMocks.prepareGameActionConfirmation).not.toHaveBeenCalled();
    expect(launcherMocks.runGameAction).not.toHaveBeenCalled();
  });

  it("treats Game Options as a focus-managed modal", () => {
    renderGameDetails();
    const trigger = screen.getByRole("button", { name: "Game Settings" });

    trigger.focus();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.getByRole("button", { name: "Close Game Options" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Game Options" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("runs a native action with the exact selected variant binding", async () => {
    launcherMocks.isTauri.mockReturnValue(true);
    launcherMocks.getGameActionCapabilities.mockImplementation(async (gameId: string) => [
      capability("verify", {
        label: `Verify ${gameId}`,
        reason: `Verify only ${gameId}.`,
      }),
    ]);
    launcherMocks.runGameAction.mockResolvedValue(
      actionResult("verify", "gog-shared-game", "gog", {
        message: "Selected GOG files were verified.",
      }),
    );

    renderGameDetails(
      { id: "steam-shared-game", launcher: "steam" },
      {
        gameVariants: [
          { ...selectedGame, id: "steam-shared-game", launcher: "steam" },
          { ...selectedGame, id: "gog-shared-game", launcher: "gog" },
        ],
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Select GOG copy" }));
    const verifyButton = await screen.findByRole("button", { name: /Verify gog-shared-game/i });
    await waitFor(() => expect(verifyButton).toBeEnabled());
    fireEvent.click(verifyButton);

    await waitFor(() => {
      expect(launcherMocks.runGameAction).toHaveBeenCalledWith({
        action: "verify",
        gameId: "gog-shared-game",
        expectedProvider: "gog",
        expectedTitle: "Local Test Game",
      });
    });
  });

  it("exposes and runs the native check-for-updates capability", async () => {
    launcherMocks.isTauri.mockReturnValue(true);
    launcherMocks.getGameActionCapabilities.mockResolvedValue([
      capability("check_update", {
        label: "Check OG-managed update",
        reason: "Reads signed update metadata without changing game files.",
      }),
    ]);
    launcherMocks.runGameAction.mockResolvedValue(
      actionResult("check_update", "ogl-managed-game", "og", {
        message: "No signed update is available.",
        outcome: "not_needed",
      }),
    );

    renderGameDetails({ id: "ogl-managed-game", launcher: "ogl" });
    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));

    const checkButton = await screen.findByRole("button", {
      name: /Check OG-managed update/i,
    });
    await waitFor(() => expect(checkButton).toBeEnabled());
    fireEvent.click(checkButton);

    await waitFor(() => {
      expect(launcherMocks.runGameAction).toHaveBeenCalledWith({
        action: "check_update",
        gameId: "ogl-managed-game",
        expectedProvider: "ogl",
        expectedTitle: "Local Test Game",
      });
    });
  });

  it("stops only the exact path-verified running copy", async () => {
    const setStatusMessage = vi.fn();
    launcherMocks.isTauri.mockReturnValue(true);

    renderGameDetails(
      {},
      {
        isGameRunning: true,
        runningGameIds: new Set(["local-test-game"]),
        setStatusMessage,
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Stop Game/i }));

    await waitFor(() => {
      expect(launcherMocks.stopGame).toHaveBeenCalledWith("local-test-game");
      expect(setStatusMessage).toHaveBeenCalledWith("Local Test Game was stopped.");
    });
  });

  it("backs up tracked save paths and reloads their metadata", async () => {
    const runAutomaticLibrarySync = vi.fn().mockResolvedValue(undefined);
    launcherMocks.isTauri.mockReturnValue(true);

    renderGameDetails(
      {
        saveFiles: [{ id: "slot-1", path: "C:\\Games\\Local Test Game\\slot-1.sav" }],
      },
      { runAutomaticLibrarySync },
    );
    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Backup Saves/i }));

    await waitFor(() => {
      expect(launcherMocks.syncGameSaves).toHaveBeenCalledWith("local-test-game");
      expect(runAutomaticLibrarySync).toHaveBeenCalledWith(false);
    });
    expect(screen.getByText("Local Test Game save sync completed.")).toBeVisible();
  });

  it("confirms and runs a same-drive move for a manual install", async () => {
    const runAutomaticLibrarySync = vi.fn().mockResolvedValue(undefined);
    launcherMocks.isTauri.mockReturnValue(true);
    launcherMocks.openDirectory.mockResolvedValue("C:\\Games Two");

    renderGameDetails({ launcher: "manual" }, { runAutomaticLibrarySync });
    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Move Install/i }));

    const dialog = await screen.findByRole("dialog", { name: "Confirm Install Move" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Move Game" }));

    await waitFor(() => {
      expect(launcherMocks.openDirectory).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: "Move Local Test Game to...",
      });
      expect(launcherMocks.moveGame).toHaveBeenCalledWith({
        gameId: "local-test-game",
        newPath: "C:\\Games Two",
      });
      expect(runAutomaticLibrarySync).toHaveBeenCalledWith(false);
    });
  });

  it("prepares a short-lived exact grant and immediately binds it to the confirmed action", async () => {
    const runAutomaticLibrarySync = vi.fn().mockResolvedValue(undefined);
    launcherMocks.isTauri.mockReturnValue(true);
    launcherMocks.getGameActionCapabilities.mockResolvedValue([
      capability("remove_from_library", {
        destructive: true,
        label: "Remove Manual Entry",
        reason: "Remove only this manual library entry.",
        requiresConfirmation: true,
      }),
    ]);
    launcherMocks.prepareGameActionConfirmation.mockResolvedValue({
      action: "remove_from_library",
      confirmationToken: "short-lived-token",
      expiresAt: "2026-07-13T00:02:00Z",
      expiresInSeconds: 120,
      gameId: "manual-entry",
    });
    launcherMocks.runGameAction.mockResolvedValue(
      actionResult("remove_from_library", "manual-entry", "manual", {
        libraryChanged: true,
        message: "Manual entry removed.",
      }),
    );

    renderGameDetails(
      { id: "manual-entry", launcher: "manual", status: "not_installed" },
      { runAutomaticLibrarySync },
    );
    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));
    const removeButton = await screen.findByRole("button", { name: /Remove Manual Entry/i });
    await waitFor(() => expect(removeButton).toBeEnabled());
    fireEvent.click(removeButton);

    const dialog = screen.getByRole("dialog", { name: "Confirm Selected Copy Action" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove Manual Entry" }));

    await waitFor(() => {
      expect(launcherMocks.prepareGameActionConfirmation).toHaveBeenCalledWith({
        action: "remove_from_library",
        gameId: "manual-entry",
        expectedProvider: "manual",
        expectedTitle: "Local Test Game",
      });
      expect(launcherMocks.runGameAction).toHaveBeenCalledWith({
        action: "remove_from_library",
        gameId: "manual-entry",
        expectedProvider: "manual",
        expectedTitle: "Local Test Game",
        confirmationToken: "short-lived-token",
      });
      expect(runAutomaticLibrarySync).toHaveBeenCalledWith(false);
    });
    expect(launcherMocks.prepareGameActionConfirmation.mock.invocationCallOrder[0]).toBeLessThan(
      launcherMocks.runGameAction.mock.invocationCallOrder[0],
    );
  });

  it("marks a verified completed uninstall as not installed after the native rescan", async () => {
    const runAutomaticLibrarySync = vi.fn().mockResolvedValue(undefined);
    const onVerifiedUninstall = vi.fn();
    launcherMocks.isTauri.mockReturnValue(true);
    launcherMocks.getGameActionCapabilities.mockResolvedValue([
      capability("uninstall", {
        destructive: true,
        label: "Uninstall Xbox Game",
        mode: "os_automation",
        reason: "Remove and verify the exact Xbox package.",
        requiresConfirmation: true,
      }),
    ]);
    launcherMocks.prepareGameActionConfirmation.mockResolvedValue({
      action: "uninstall",
      confirmationToken: "uninstall-token",
      expiresAt: "2026-07-13T00:02:00Z",
      expiresInSeconds: 120,
      gameId: "xbox-installed",
    });
    launcherMocks.runGameAction.mockResolvedValue(
      actionResult("uninstall", "xbox-installed", "xbox", {
        libraryChanged: true,
        message: "Xbox package removal verified.",
        outcome: "completed",
      }),
    );

    renderGameDetails(
      { id: "xbox-installed", launcher: "xbox", status: "installed" },
      { onVerifiedUninstall, runAutomaticLibrarySync },
    );
    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));
    const uninstallButton = await screen.findByRole("button", { name: /Uninstall Xbox Game/i });
    fireEvent.click(uninstallButton);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Confirm Selected Copy Action" })).getByRole(
        "button",
        { name: "Uninstall Xbox Game" },
      ),
    );

    await waitFor(() => {
      expect(runAutomaticLibrarySync).toHaveBeenCalledWith(false);
      expect(onVerifiedUninstall).toHaveBeenCalledWith("xbox-installed");
    });
    expect(runAutomaticLibrarySync.mock.invocationCallOrder[0]).toBeLessThan(
      onVerifiedUninstall.mock.invocationCallOrder[0],
    );
  });

  it("reports provider handoff as handoff required, never completed", async () => {
    const requestLibraryRescanOnNextFocus = vi.fn();
    launcherMocks.isTauri.mockReturnValue(true);
    launcherMocks.getGameActionCapabilities.mockResolvedValue([
      capability("repair", {
        completionObservable: false,
        destructive: true,
        label: "Repair in Steam",
        mode: "user_handoff",
        reason: "Steam must finish this repair.",
        requiresConfirmation: true,
      }),
    ]);
    launcherMocks.prepareGameActionConfirmation.mockResolvedValue({
      action: "repair",
      confirmationToken: "repair-token",
      expiresAt: "2026-07-13T00:02:00Z",
      expiresInSeconds: 120,
      gameId: "steam-handoff",
    });
    launcherMocks.runGameAction.mockResolvedValue(
      actionResult("repair", "steam-handoff", "steam", {
        message: "Steam opened; finish the repair there.",
        outcome: "handoff_required",
        rescanRecommended: true,
      }),
    );

    renderGameDetails(
      { id: "steam-handoff", launcher: "steam" },
      { requestLibraryRescanOnNextFocus },
    );
    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));
    const repairButton = await screen.findByRole("button", { name: /Repair in Steam/i });
    fireEvent.click(repairButton);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Confirm Selected Copy Action" })).getByRole(
        "button",
        { name: "Repair in Steam" },
      ),
    );

    expect(await screen.findByText("Handoff required")).toBeVisible();
    expect(screen.getByText("Steam opened; finish the repair there.")).toBeVisible();
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
    expect(requestLibraryRescanOnNextFocus).toHaveBeenCalledOnce();
  });

  it("ignores a stale capability response after the selected variant changes", async () => {
    launcherMocks.isTauri.mockReturnValue(true);
    const steamCapabilities = deferred<GameActionCapability[]>();
    const gogCapabilities = deferred<GameActionCapability[]>();
    launcherMocks.getGameActionCapabilities.mockImplementation((gameId: string) =>
      gameId === "steam-stale" ? steamCapabilities.promise : gogCapabilities.promise,
    );

    renderGameDetails(
      { id: "steam-stale", launcher: "steam" },
      {
        gameVariants: [
          { ...selectedGame, id: "steam-stale", launcher: "steam" },
          { ...selectedGame, id: "gog-current", launcher: "gog" },
        ],
      },
    );
    await waitFor(() =>
      expect(launcherMocks.getGameActionCapabilities).toHaveBeenCalledWith("steam-stale"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Select GOG copy" }));
    await waitFor(() =>
      expect(launcherMocks.getGameActionCapabilities).toHaveBeenCalledWith("gog-current"),
    );

    gogCapabilities.resolve([
      capability("verify", { label: "Verify Current GOG Copy", reason: "Current selection." }),
    ]);
    expect(await screen.findByRole("button", { name: /Verify Current GOG Copy/i })).toBeEnabled();
    steamCapabilities.resolve([
      capability("verify", { label: "Stale Steam Action", reason: "Stale selection." }),
    ]);

    await waitFor(() => {
      expect(screen.queryByText("Stale Steam Action")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Verify Current GOG Copy/i })).toBeEnabled();
    });
  });

  it("rejects a prepared confirmation grant when the selected copy changes", async () => {
    const confirmationGrant = deferred<{
      action: "repair";
      confirmationToken: string;
      expiresAt: string;
      expiresInSeconds: number;
      gameId: string;
    }>();
    const setStatusMessage = vi.fn();
    launcherMocks.isTauri.mockReturnValue(true);
    launcherMocks.getGameActionCapabilities.mockImplementation(async (gameId: string) =>
      gameId === "steam-confirm"
        ? [
            capability("repair", {
              destructive: true,
              label: "Repair Confirmed Steam Copy",
              requiresConfirmation: true,
            }),
          ]
        : [capability("verify", { label: "Verify Current GOG Copy" })],
    );
    launcherMocks.prepareGameActionConfirmation.mockReturnValue(confirmationGrant.promise);

    renderGameDetails(
      { id: "steam-confirm", launcher: "steam" },
      {
        gameVariants: [
          { ...selectedGame, id: "steam-confirm", launcher: "steam" },
          { ...selectedGame, id: "gog-after-confirm", launcher: "gog" },
        ],
        setStatusMessage,
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));
    const repairButton = await screen.findByRole("button", {
      name: /Repair Confirmed Steam Copy/i,
    });
    fireEvent.click(repairButton);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Confirm Selected Copy Action" })).getByRole(
        "button",
        { name: "Repair Confirmed Steam Copy" },
      ),
    );
    await waitFor(() =>
      expect(launcherMocks.prepareGameActionConfirmation).toHaveBeenCalledTimes(1),
    );

    fireEvent.click(screen.getByRole("button", { name: "Select GOG copy" }));
    confirmationGrant.resolve({
      action: "repair",
      confirmationToken: "now-stale-token",
      expiresAt: "2026-07-13T00:02:00Z",
      expiresInSeconds: 120,
      gameId: "steam-confirm",
    });

    await waitFor(() => {
      expect(launcherMocks.runGameAction).not.toHaveBeenCalled();
      expect(setStatusMessage).toHaveBeenCalledWith(
        expect.stringMatching(/selected copy changed.*nothing was started/i),
      );
    });
  });

  it("fails closed for backend maintenance capabilities while the exact copy is running", async () => {
    launcherMocks.isTauri.mockReturnValue(true);
    launcherMocks.getGameActionCapabilities.mockResolvedValue([
      capability("update", { label: "Native Update" }),
      capability("verify", { label: "Native Verify" }),
      capability("repair", { label: "Native Repair" }),
      capability("uninstall", { destructive: true, label: "Native Uninstall" }),
    ]);

    renderGameDetails({ id: "running-copy", launcher: "steam" }, { isGameRunning: true });
    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));

    for (const label of ["Native Update", "Native Verify", "Native Repair", "Native Uninstall"]) {
      const actionButton = await screen.findByRole("button", { name: new RegExp(label, "i") });
      expect(actionButton).toBeDisabled();
      expect(actionButton).toHaveAttribute(
        "title",
        "Close this selected copy before running maintenance actions.",
      );
    }
    expect(launcherMocks.runGameAction).not.toHaveBeenCalled();
  });

  it("blocks install maintenance for a not-installed copy but keeps manual removal available", async () => {
    launcherMocks.isTauri.mockReturnValue(true);
    launcherMocks.getGameActionCapabilities.mockResolvedValue([
      capability("verify", { label: "Native Verify" }),
      capability("remove_from_library", {
        destructive: true,
        label: "Remove Catalog Entry",
        requiresConfirmation: true,
      }),
    ]);

    renderGameDetails({ id: "manual-catalog", launcher: "manual", status: "not_installed" });
    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));

    const verifyButton = await screen.findByRole("button", { name: /Native Verify/i });
    const removeButton = screen.getByRole("button", { name: /Remove Catalog Entry/i });
    expect(verifyButton).toBeDisabled();
    expect(verifyButton).toHaveAttribute(
      "title",
      "Install this selected copy before running maintenance actions.",
    );
    expect(removeButton).toBeEnabled();
  });

  it("shows an inert catalog action for an OGL game without an installable build", () => {
    const handlePlay = vi.fn();
    renderGameDetails(
      {
        id: "ogl-neon-runners",
        launcher: "ogl",
        status: "not_installed",
      },
      { handlePlay },
    );

    expect(screen.getByRole("button", { name: "OG Catalog" })).toBeDisabled();
    expect(handlePlay).not.toHaveBeenCalled();
  });

  it("shows provider and sync errors in the empty library state", () => {
    renderGameDetails(null, {
      discoveryMessage: "No installed games were detected on this PC.",
      statusMessage: "Steam authentication failed. Sign in and retry.",
    });

    expect(screen.getByText("No Games Detected")).toBeVisible();
    expect(screen.getByText("Steam authentication failed. Sign in and retry.")).toBeVisible();
  });

  it("opens only the resolver-owned HTTPS support destination", () => {
    const openWindow = vi.spyOn(window, "open").mockImplementation(() => null);
    renderGameDetails({ id: "steam-support-game", launcher: "steam" });

    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Steam Support/i }));

    expect(openWindow).toHaveBeenCalledWith(
      "https://help.steampowered.com/",
      "_blank",
      "noopener,noreferrer",
    );
    openWindow.mockRestore();
  });

  it("uses the selected variant id for local artwork", () => {
    const openArtworkPreview = vi.fn();
    const { container } = renderGameDetails(
      { id: "steam-shared-game", launcher: "steam" },
      {
        gameVariants: [
          { ...selectedGame, id: "steam-shared-game", launcher: "steam" },
          { ...selectedGame, id: "gog-shared-game", launcher: "gog" },
        ],
        openArtworkPreview,
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Select GOG copy" }));
    const coverInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File(["cover"], "cover.png", { type: "image/png" });

    expect(coverInput).not.toBeNull();
    fireEvent.change(coverInput!, { target: { files: [file] } });

    expect(openArtworkPreview).toHaveBeenCalledWith("gog-shared-game", "cover", file);
  });

  it("fans all-copy organization changes out to every variant id", () => {
    const setFavorites = vi.fn();
    renderGameDetails(
      { id: "steam-shared-game", launcher: "steam" },
      {
        gameVariants: [
          { ...selectedGame, id: "steam-shared-game", launcher: "steam" },
          { ...selectedGame, id: "gog-shared-game", launcher: "gog" },
        ],
        favorites: { "steam-shared-game": true },
        setFavorites,
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));
    expect(screen.getByText("1/2 copies")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Favorite/i }));

    const update = setFavorites.mock.calls[0]?.[0] as (
      current: Record<string, boolean>,
    ) => Record<string, boolean>;
    expect(update({ "steam-shared-game": true })).toEqual({
      "steam-shared-game": true,
      "gog-shared-game": true,
    });
  });

  it("removes grouped copies and renames or deletes local collections", () => {
    const setManualCollections = vi.fn();
    renderGameDetails(
      { id: "steam-shared-game", launcher: "steam" },
      {
        gameVariants: [
          { ...selectedGame, id: "steam-shared-game", launcher: "steam" },
          { ...selectedGame, id: "gog-shared-game", launcher: "gog" },
        ],
        manualCollections: {
          Backlog: ["steam-shared-game", "gog-shared-game", "other-game"],
        },
        setManualCollections,
      },
    );

    fireEvent.click(screen.getByRole("button", { name: "Game Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove all copies" }));
    const removeCopies = setManualCollections.mock.calls[0]?.[0] as (
      current: Record<string, string[]>,
    ) => Record<string, string[]>;
    expect(
      removeCopies({ Backlog: ["steam-shared-game", "gog-shared-game", "other-game"] }),
    ).toEqual({ Backlog: ["other-game"] });

    fireEvent.click(screen.getByRole("button", { name: "Rename local" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Rename Backlog" }), {
      target: { value: "Weekend" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const rename = setManualCollections.mock.calls[1]?.[0] as (
      current: Record<string, string[]>,
    ) => Record<string, string[]>;
    expect(rename({ Backlog: ["steam-shared-game"], Weekend: ["other-game"] })).toEqual({
      Weekend: ["other-game", "steam-shared-game"],
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete local collection" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete local collection" }));
    const removeCollection = setManualCollections.mock.calls[2]?.[0] as (
      current: Record<string, string[]>,
    ) => Record<string, string[]>;
    expect(removeCollection({ Backlog: ["steam-shared-game"] })).toEqual({});
  });

  it("shows an Xbox catalog title when no logo artwork is available", () => {
    renderGameDetails({
      catalogSource: "pc_game_pass",
      id: "xbox-9NBLGGH4R315",
      launcher: "xbox",
      logoUrl: undefined,
      status: "not_installed",
      title: "Game Pass Catalog Title",
    });

    expect(
      screen.getByRole("heading", { name: "Game Pass Catalog Title", level: 1 }),
    ).toBeVisible();
  });
});

const selectedGame: Game = {
  id: "local-test-game",
  title: "Local Test Game",
  description: "Local game without a source client.",
  version: "1.0.0",
  status: "installed",
  platform: "windows",
  installPath: "C:\\Games\\Local Test Game",
  executablePath: "C:\\Games\\Local Test Game\\game.exe",
};

function renderGameDetails(
  gameOverrides: Partial<Game> | null = {},
  propOverrides: Partial<GameDetailsProps> = {},
) {
  const noop = vi.fn();
  const game = gameOverrides === null ? null : { ...selectedGame, ...gameOverrides };

  return render(
    <MemoryRouter>
      <GameDetails
        selectedGame={game}
        enrichedSelectedGame={game}
        shouldShowLibraryLoading={false}
        handlePlay={noop}
        logoCandidateIndexes={{}}
        loadedLogoUrls={new Set<string>()}
        handleLogoLoad={noop}
        handleLogoError={noop}
        statusMessage={null}
        setStatusMessage={noop}
        favorites={{}}
        setFavorites={stateSetter<Record<string, boolean>>()}
        hiddenGames={{}}
        setHiddenGames={stateSetter<Record<string, boolean>>()}
        customCategories={{}}
        setCustomCategories={stateSetter<Record<string, string[]>>()}
        manualCollections={{}}
        setManualCollections={stateSetter<Record<string, string[]>>()}
        detailScrollRef={{ current: null } as RefObject<HTMLElement | null>}
        isDiscoveringGames={false}
        discoveryMessage={null}
        runAutomaticLibrarySync={vi.fn().mockResolvedValue(undefined)}
        customArtwork={null}
        onSelectCustomArtwork={noop}
        onArtworkDrop={noop}
        onConfirmArtwork={noop}
        onResetCustomArtwork={noop}
        pendingArtworkFile={null}
        pendingArtworkKind="cover"
        pendingArtworkGameId={null}
        openArtworkPreview={noop}
        closeArtworkPreview={noop}
        {...propOverrides}
      />
    </MemoryRouter>,
  );
}

function stateSetter<T>(): Dispatch<SetStateAction<T>> {
  return vi.fn() as unknown as Dispatch<SetStateAction<T>>;
}

function capability(
  action: GameActionCapability["action"],
  overrides: Partial<GameActionCapability> = {},
): GameActionCapability {
  return {
    action,
    available: true,
    completionObservable: true,
    destructive: false,
    label: action,
    mode: "local_read_only",
    reason: `${action} is available for this exact selected copy.`,
    requiresConfirmation: false,
    ...overrides,
  };
}

function actionResult(
  action: GameActionResult["action"],
  gameId: string,
  provider: string,
  overrides: Partial<GameActionResult> = {},
): GameActionResult {
  return {
    action,
    details: [],
    gameId,
    libraryChanged: false,
    message: `${action} completed.`,
    outcome: "completed",
    provider,
    rescanRecommended: false,
    sessionId: "session-1",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
