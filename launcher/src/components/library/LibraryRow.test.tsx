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

  it("shows PC Game Pass membership from any grouped variant", () => {
    const installed = makeGame({ id: "xbox-installed", launcher: "xbox" });
    const catalog = makeGame({
      catalogSource: "pc_game_pass",
      id: "xbox-9NBLGGH4R315",
      launcher: "xbox",
      status: "not_installed",
    });
    const group = aggregateGameGroup([installed, catalog]);

    render(<LibraryRow group={group} onSelect={vi.fn()} />);

    expect(screen.getByText("PC Game Pass")).toBeInTheDocument();
  });

  it("does not label ordinary Xbox rows as Game Pass catalog entries", () => {
    const group = aggregateGameGroup([makeGame({ id: "xbox-installed", launcher: "xbox" })]);

    render(<LibraryRow group={group} onSelect={vi.fn()} />);

    expect(screen.queryByText("PC Game Pass")).not.toBeInTheDocument();
  });
});
