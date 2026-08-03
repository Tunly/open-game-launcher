import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Game } from "../../../lib/types";
import { PlaytimeEditorPanel } from "./PlaytimeEditorPanel";

const mocks = vi.hoisted(() => ({
  deleteGameSession: vi.fn(),
  isTauri: vi.fn(),
  listGameSessions: vi.fn(),
  resolveCatalogGameId: vi.fn(),
  setCachedGamePlaytime: vi.fn(),
  updateGameSession: vi.fn(),
  updateUserGamePlaytime: vi.fn(),
  useCurrentUser: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: mocks.isTauri,
}));

vi.mock("../../../hooks/useCurrentUser", () => ({
  useCurrentUser: mocks.useCurrentUser,
}));

vi.mock("../../../lib/launcher", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/launcher")>()),
  setCachedGamePlaytime: mocks.setCachedGamePlaytime,
}));

vi.mock("../../../lib/supabase/playtime", () => ({
  deleteGameSession: mocks.deleteGameSession,
  listGameSessions: mocks.listGameSessions,
  resolveCatalogGameId: mocks.resolveCatalogGameId,
  updateGameSession: mocks.updateGameSession,
  updateUserGamePlaytime: mocks.updateUserGamePlaytime,
}));

const game: Game = {
  description: "Test game",
  id: "game-1",
  platform: "windows",
  playtimeMinutes: 90,
  status: "installed",
  title: "Test Game",
  version: "1.0.0",
};

describe("PlaytimeEditorPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTauri.mockReturnValue(true);
    mocks.useCurrentUser.mockReturnValue({
      session: { user: { id: "user-1" } },
      user: { id: "user-1" },
    });
    mocks.resolveCatalogGameId.mockResolvedValue("catalog-game-1");
    mocks.listGameSessions.mockResolvedValue({ sessions: [], total: 0 });
    mocks.setCachedGamePlaytime.mockResolvedValue(undefined);
    mocks.updateUserGamePlaytime.mockResolvedValue(true);
  });

  it("updates the native cache, hosted aggregate, and parent library state", async () => {
    const onPlaytimeChanged = vi.fn();
    const onStatusMessage = vi.fn();
    render(
      <PlaytimeEditorPanel
        game={game}
        onPlaytimeChanged={onPlaytimeChanged}
        onStatusMessage={onStatusMessage}
      />,
    );

    await waitFor(() => expect(mocks.listGameSessions).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Edit total playtime" }));
    const minutes = screen.getByRole("spinbutton");
    fireEvent.change(minutes, { target: { value: "135" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.setCachedGamePlaytime).toHaveBeenCalledWith("game-1", 135));
    expect(mocks.updateUserGamePlaytime).toHaveBeenCalledWith("user-1", "catalog-game-1", 135);
    expect(onPlaytimeChanged).toHaveBeenCalledWith(135);
    expect(onStatusMessage).toHaveBeenCalledWith("Playtime updated.");
  });

  it("traps the editor as a labelled modal and restores focus after Escape", async () => {
    render(<PlaytimeEditorPanel game={game} />);
    await waitFor(() => expect(mocks.listGameSessions).toHaveBeenCalled());

    const opener = screen.getByRole("button", { name: "Edit total playtime" });
    opener.focus();
    fireEvent.click(opener);

    expect(screen.getByRole("dialog", { name: "Edit Total Playtime" })).toBeVisible();
    expect(screen.getByRole("spinbutton")).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Edit Total Playtime" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
