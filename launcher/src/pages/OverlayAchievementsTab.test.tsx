import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Game } from "../lib/types";
import { OverlayAchievementsTab } from "./OverlayPage";

const launcherMocks = vi.hoisted(() => ({
  listInstalledGames: vi.fn(),
}));

const achievementMocks = vi.hoisted(() => ({
  hydrateGamesWithRemoteAchievements: vi.fn(),
}));

const useCurrentUserMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/launcher", () => launcherMocks);
vi.mock("../lib/supabase/achievements", () => achievementMocks);
vi.mock("../hooks/useCurrentUser", () => ({ useCurrentUser: useCurrentUserMock }));

const steamGame: Game = {
  achievements: [
    {
      id: "steam-first",
      name: "First Step",
      source: "steam",
      unlockedAt: "2026-07-10T08:00:00.000Z",
    },
  ],
  description: "",
  id: "steam-10",
  launcher: "steam",
  platform: "windows",
  status: "installed",
  title: "Shared Game",
  version: "1.0.0",
};

describe("OverlayAchievementsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCurrentUserMock.mockReturnValue({ isLoading: false, user: { id: "user-1" } });
    launcherMocks.listInstalledGames.mockResolvedValue([steamGame]);
    achievementMocks.hydrateGamesWithRemoteAchievements.mockImplementation((games) =>
      Promise.resolve(games),
    );
  });

  it("hydrates remote rows before grouping cross-platform achievements", async () => {
    const xboxGame: Game = {
      ...steamGame,
      achievements: [
        {
          id: "xbox-second",
          name: "Second Step",
          source: "xbox",
          unlockedAt: null,
        },
      ],
      id: "xbox-10",
      launcher: "xbox",
    };
    launcherMocks.listInstalledGames.mockResolvedValue([steamGame, xboxGame]);

    render(<OverlayAchievementsTab />);

    expect(await screen.findByText("Shared Game")).toBeInTheDocument();
    expect(screen.getByText("1 / 2 achievements")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /shared game/i }));
    expect(screen.getByText("First Step")).toBeInTheDocument();
    expect(screen.getByText("Second Step")).toBeInTheDocument();
    expect(achievementMocks.hydrateGamesWithRemoteAchievements).toHaveBeenCalledWith([
      steamGame,
      xboxGame,
    ]);
  });

  it("shows load failures and retries instead of claiming the archive is empty", async () => {
    launcherMocks.listInstalledGames
      .mockRejectedValueOnce(new Error("Local achievement cache unavailable"))
      .mockResolvedValueOnce([steamGame]);

    render(<OverlayAchievementsTab />);

    expect(await screen.findByText("Achievement load failed")).toBeInTheDocument();
    expect(screen.getByText("Local achievement cache unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No achievements synced yet.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry Achievement Load" }));

    expect(await screen.findByText("Shared Game")).toBeInTheDocument();
    expect(launcherMocks.listInstalledGames).toHaveBeenCalledTimes(2);
  });
});
