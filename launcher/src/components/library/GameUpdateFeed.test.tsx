import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GameUpdateFeed } from "./GameUpdateFeed";
import type { Game } from "../../lib/types";

const getGameUpdates = vi.fn();
const resolveSteamAppId = vi.fn();
const openExternalUrl = vi.fn();

vi.mock("../../lib/game-updates", () => ({
  getGameUpdates: (game: Game) => getGameUpdates(game),
  resolveSteamAppId: (game: Game) => resolveSteamAppId(game),
}));

vi.mock("../../lib/launcher", () => ({
  openExternalUrl: (url: string) => openExternalUrl(url),
}));

const game: Game = {
  id: "steam-730",
  title: "Counter-Strike 2",
  description: "Steam game",
  launcher: "steam",
  version: "1.0",
  platform: "windows",
  status: "installed",
};

describe("GameUpdateFeed", () => {
  beforeEach(() => {
    getGameUpdates.mockReset();
    resolveSteamAppId.mockReset();
    openExternalUrl.mockReset();
    resolveSteamAppId.mockReturnValue("730");
    openExternalUrl.mockResolvedValue(undefined);
  });

  it("renders Read Notes and opens the update URL", async () => {
    getGameUpdates.mockResolvedValue([
      {
        id: "news-1",
        source: "steam",
        sourceId: "730",
        title: "Patch Notes",
        url: "https://store.steampowered.com/news/app/730/view/1",
        publishedAt: "2026-06-04T00:00:00.000Z",
        excerpt: "Fixes and balance updates.",
        kind: "patch",
      },
    ]);

    render(<GameUpdateFeed game={game} />);

    const button = await screen.findByRole("button", { name: /read notes/i });
    fireEvent.click(button);

    expect(openExternalUrl).toHaveBeenCalledWith(
      "https://store.steampowered.com/news/app/730/view/1",
    );
  });

  it("does not render Read Notes when no URL is available", async () => {
    getGameUpdates.mockResolvedValue([
      {
        id: "news-1",
        source: "steam",
        sourceId: "730",
        title: "Patch Notes",
        url: null,
        publishedAt: "2026-06-04T00:00:00.000Z",
        excerpt: "Fixes and balance updates.",
        kind: "patch",
      },
    ]);

    render(<GameUpdateFeed game={game} />);

    await waitFor(() => expect(screen.getByText("Patch Notes")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /read notes/i })).not.toBeInTheDocument();
  });

  it("shows an empty state when no Steam AppID is available", () => {
    resolveSteamAppId.mockReturnValue(null);

    render(<GameUpdateFeed game={{ ...game, id: "epic-1", launcher: "epic" }} />);

    expect(screen.getByText("No Update Feed")).toBeInTheDocument();
    expect(getGameUpdates).not.toHaveBeenCalled();
  });
});
