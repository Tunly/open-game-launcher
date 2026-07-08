import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { aggregateGameGroup } from "../../lib/game-groups";
import type { Game } from "../../lib/types";
import { LibraryRow } from "./LibraryRow";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    description: "Steam",
    id: "steam-1",
    launcher: "steam",
    platform: "windows",
    status: "installed",
    title: "Test Game",
    version: "1.0",
    ...overrides,
  };
}

describe("LibraryRow", () => {
  it("does not show source-client status chrome for a selected game", () => {
    const group = aggregateGameGroup([makeGame()]);

    render(<LibraryRow group={group} selected onSelect={vi.fn()} />);

    expect(screen.queryByTitle("Steam: Running")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Steam: Running")).not.toBeInTheDocument();
    expect(screen.queryByText(/Steam on/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Running$/i)).not.toBeInTheDocument();
  });

  it("keeps the game runtime badge for games that are actually running", () => {
    const group = aggregateGameGroup([makeGame()]);

    render(<LibraryRow group={group} isRunning onSelect={vi.fn()} />);

    expect(screen.getByText("Running")).toBeInTheDocument();
  });
});
