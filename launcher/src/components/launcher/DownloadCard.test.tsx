import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DownloadItem, Game } from "../../lib/types";
import { DownloadCard } from "./DownloadCard";

function makeItem(overrides: Partial<DownloadItem> = {}): DownloadItem {
  return {
    canCancel: true,
    canPause: true,
    gameId: "steam-1234",
    id: "dl-1",
    progress: 0,
    speed: "",
    status: "downloading",
    title: "Test Game",
    ...overrides,
  };
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    description: "",
    id: "steam-1234",
    platform: "windows",
    status: "installed",
    title: "Test Game",
    version: "1.0",
    ...overrides,
  };
}

const handlers = {
  onArchive: vi.fn(),
  onCancel: vi.fn(),
  onPauseToggle: vi.fn(),
  onRetry: vi.fn(),
};

describe("DownloadCard cover image", () => {
  function renderCard(item: DownloadItem, game: Game) {
    const { container } = render(<DownloadCard item={item} game={game} {...handlers} />);
    const img = container.querySelector("img");
    return { container, img };
  }

  it("uses the game icon URL when the game has no cover or logo", () => {
    const item = makeItem();
    const game = makeGame({ iconUrl: "https://cdn.example.com/game-icon.png" });

    const { img } = renderCard(item, game);

    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("https://cdn.example.com/game-icon.png");
  });

  it("uses the cover image before icon and logo fallbacks, like the Achievements page", () => {
    const item = makeItem();
    const game = makeGame({
      coverUrl: "https://cdn.example.com/game-cover.jpg",
      iconUrl: "https://cdn.example.com/game-icon.png",
    });

    const { img } = renderCard(item, game);

    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("https://cdn.example.com/game-cover.jpg");
    expect(img).toHaveClass("object-cover");
    expect(img!.parentElement).toHaveClass("aspect-video");
  });

  it("falls back to the game icon when the game has no cover", () => {
    const item = makeItem();
    const game = makeGame({ iconUrl: "https://cdn.example.com/game-icon.png" });

    const { img } = renderCard(item, game);

    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("https://cdn.example.com/game-icon.png");
  });

  it("uses contained rendering for icon fallbacks", () => {
    const item = makeItem();
    const game = makeGame({ iconUrl: "https://cdn.example.com/game-icon.png" });

    const { img } = renderCard(item, game);

    expect(img).toHaveClass("object-contain", "p-2");
  });

  it("renders the title placeholder when the game has no image assets", () => {
    const item = makeItem();
    const game = makeGame();

    const { img } = renderCard(item, game);

    expect(img).toBeNull();
    expect(screen.getAllByText("Test Game").length).toBeGreaterThan(0);
  });
});
