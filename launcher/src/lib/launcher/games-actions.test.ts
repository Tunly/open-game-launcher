import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  GameActionCapability,
  GameActionResult,
  PrepareGameActionConfirmationInput,
  PrepareGameActionConfirmationResult,
  RunGameActionInput,
} from "../game-actions";

const mocks = vi.hoisted(() => ({
  invokeCommand: vi.fn(),
  isTauri: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: mocks.isTauri,
}));

vi.mock("./shared", () => ({
  invokeCommand: mocks.invokeCommand,
}));

import {
  getGameActionCapabilities,
  prepareGameActionConfirmation,
  runGameAction,
  verifyGameFiles,
} from "./games";

describe("game action launcher wrappers", () => {
  beforeEach(() => {
    mocks.invokeCommand.mockReset();
    mocks.isTauri.mockReset();
  });

  it("invokes the native capability command with the exact game id payload", async () => {
    const capabilities: GameActionCapability[] = [
      {
        action: "verify",
        available: true,
        completionObservable: true,
        destructive: false,
        label: "Verify Files",
        mode: "local_read_only",
        reason: "Local verification is available.",
        requiresConfirmation: false,
      },
    ];
    mocks.isTauri.mockReturnValue(true);
    mocks.invokeCommand.mockResolvedValue(capabilities);

    await expect(getGameActionCapabilities("steam-440")).resolves.toEqual(capabilities);
    expect(mocks.invokeCommand).toHaveBeenCalledWith("get_game_action_capabilities", {
      gameId: "steam-440",
    });
  });

  it("passes the complete stale-selection and confirmation contract to run_game_action", async () => {
    const input: RunGameActionInput = {
      action: "uninstall",
      gameId: "steam-440",
      expectedProvider: "steam",
      expectedTitle: "Team Fortress 2",
      confirmationToken: "opaque-server-token",
    };
    const result: GameActionResult = {
      action: "uninstall",
      details: [],
      gameId: "steam-440",
      libraryChanged: false,
      message: "Confirmation is not available yet.",
      outcome: "blocked",
      provider: "steam",
      rescanRecommended: false,
      sessionId: "session-1",
    };
    mocks.isTauri.mockReturnValue(true);
    mocks.invokeCommand.mockResolvedValue(result);

    await expect(runGameAction(input)).resolves.toEqual(result);
    expect(mocks.invokeCommand).toHaveBeenCalledWith("run_game_action", { input });
  });

  it("requests a short-lived confirmation grant for the exact selected action binding", async () => {
    const input: PrepareGameActionConfirmationInput = {
      action: "repair",
      gameId: "og-managed-1",
      expectedProvider: "unknown",
      expectedTitle: "Managed Test Game",
    };
    const grant: PrepareGameActionConfirmationResult = {
      gameId: "og-managed-1",
      action: "repair",
      confirmationToken: "opaque-server-token",
      expiresAt: "2026-07-13T00:05:00Z",
      expiresInSeconds: 120,
    };
    mocks.isTauri.mockReturnValue(true);
    mocks.invokeCommand.mockResolvedValue(grant);

    await expect(prepareGameActionConfirmation(input)).resolves.toEqual(grant);
    expect(mocks.invokeCommand).toHaveBeenCalledWith("prepare_game_action_confirmation", {
      input,
    });
  });

  it.each([
    ["capability lookup", () => getGameActionCapabilities("steam-440")],
    [
      "action execution",
      () =>
        runGameAction({
          action: "verify",
          gameId: "steam-440",
          expectedProvider: "steam",
          expectedTitle: "Team Fortress 2",
        }),
    ],
    [
      "confirmation preparation",
      () =>
        prepareGameActionConfirmation({
          action: "uninstall",
          gameId: "steam-440",
          expectedProvider: "steam",
          expectedTitle: "Team Fortress 2",
        }),
    ],
    ["legacy file verification", () => verifyGameFiles("steam-440")],
  ])("fails closed for %s in the browser without invoking native code", async (_, operation) => {
    mocks.isTauri.mockReturnValue(false);

    await expect(operation()).rejects.toThrow(/desktop app/i);
    expect(mocks.invokeCommand).not.toHaveBeenCalled();
  });
});
