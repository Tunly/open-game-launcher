import { fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Game } from "../../lib/types";
import { aggregateGameGroup } from "../../lib/game-groups";
import { LibrarySidebar } from "./LibrarySidebar";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    description: "",
    id: overrides.id ?? "steam-1",
    platform: "windows",
    status: "installed",
    title: overrides.title ?? "Test Game",
    version: "1.0",
    ...overrides,
  };
}

const fallbackMockGames: Game[] = [makeGame({ id: "manual-1", title: "Fallback" })];

function renderSidebar(overrides: Partial<React.ComponentProps<typeof LibrarySidebar>> = {}) {
  const gameA = makeGame({ id: "steam-10", title: "Alpha" });
  const gameB = makeGame({ id: "gog-20", title: "Beta" });
  const groupA = aggregateGameGroup([gameA]);
  const groupB = aggregateGameGroup([gameB]);
  const games = [groupA, groupB];
  const listScrollRef = createRef<HTMLDivElement>();
  const defaultProps: React.ComponentProps<typeof LibrarySidebar> = {
    activePlatformFilter: "all",
    advancedFilters: {
      categories: [],
      features: [],
      genres: [],
      hardware: [],
      launchers: [],
      platforms: [],
      players: [],
      productCategories: [],
      showGamePassCatalog: false,
      sizeQuery: "",
      status: [],
    },
    fallbackMockGames,
    favorites: {},
    filteredGames: games,
    games,
    groupOption: "none",
    groupedGames: {},
    isFilterPopupOpen: false,
    listScrollRef,
    searchQuery: "",
    selectedGroup: null,
    setAddGameError: vi.fn(),
    setIsAddGameOpen: vi.fn(),
    setIsFilterPopupOpen: vi.fn(),
    setSearchQuery: vi.fn(),
    setSelectedGroup: vi.fn(),
    setSortOption: vi.fn(),
    sortOption: "alphabetical",
    ...overrides,
  };
  return render(<LibrarySidebar {...defaultProps} />);
}

describe("LibrarySidebar", () => {
  it("renders the count of filtered games and total games", () => {
    renderSidebar();

    // The header shows "Library (count)" without filter indication when none are active.
    const headerButton = screen.getByRole("button", { name: /Library \(2/ });
    expect(headerButton).toBeInTheDocument();
  });

  it("emits a selection when a game row is clicked", () => {
    const setSelectedGroup = vi.fn();
    renderSidebar({ setSelectedGroup });

    const rows = screen.getAllByRole("button", { name: /Alpha|Beta/ });
    fireEvent.click(rows[0]);

    expect(setSelectedGroup).toHaveBeenCalledTimes(1);
  });

  it("renders a grouped layout when groupOption is not 'none'", () => {
    const gameA = makeGame({ id: "steam-1", title: "Alpha" });
    const groupA = aggregateGameGroup([gameA]);
    renderSidebar({
      games: [groupA],
      filteredGames: [groupA],
      groupOption: "source",
      groupedGames: { Steam: [groupA] },
    });

    // The grouped header should appear.
    expect(screen.getByText(/Steam \(1\)/)).toBeInTheDocument();
  });

  it("toggles the advanced filter popup via the filter button", () => {
    const setIsFilterPopupOpen = vi.fn();
    renderSidebar({ isFilterPopupOpen: false, setIsFilterPopupOpen });

    const filterButton = screen.getByTitle("Advanced Filters");
    fireEvent.click(filterButton);

    expect(setIsFilterPopupOpen).toHaveBeenCalledWith(true);
  });

  it("shows a reset filters button only when filters are active", () => {
    const onResetFilters = vi.fn();
    renderSidebar({
      filteredGames: [],
      games: [],
      onResetFilters,
      searchQuery: "halo",
    });

    const resetButton = screen.getByRole("button", { name: "Reset Filters" });
    fireEvent.click(resetButton);

    expect(onResetFilters).toHaveBeenCalledTimes(1);
  });

  it("emits setIsAddGameOpen when the Add a Game button is pressed", () => {
    const setIsAddGameOpen = vi.fn();
    const setAddGameError = vi.fn();
    renderSidebar({ setAddGameError, setIsAddGameOpen });

    fireEvent.click(screen.getByRole("button", { name: /\+ Add a Game/ }));

    expect(setAddGameError).toHaveBeenCalledWith(null);
    expect(setIsAddGameOpen).toHaveBeenCalledWith(true);
  });

  it("shows the empty-state message when no games match", () => {
    renderSidebar({ filteredGames: [], games: [] });

    const aside = screen.getByRole("complementary");
    expect(
      within(aside).getByText(/No games found|No games match active filters/),
    ).toBeInTheDocument();
  });

  it("shows cross-source runtime metadata for grouped variants", async () => {
    const steamGame = makeGame({
      id: "steam-440",
      launcher: "steam",
      title: "Team Fortress 2",
    });
    const epicGame = makeGame({
      id: "epic-tf2",
      launcher: "epic",
      title: "Team Fortress 2",
    });
    const group = aggregateGameGroup([epicGame, steamGame]);

    renderSidebar({
      filteredGames: [group],
      games: [group],
      gameRuntimeById: {
        "steam-440": {
          gameId: "steam-440",
          launcher: "steam",
          occurredAt: "2026-06-10T10:00:00.000Z",
          pid: 4242,
          processName: "hl2.exe",
          running: true,
          title: "Team Fortress 2",
          uptimeSeconds: 185,
        },
      },
      runningGameIds: new Set(["steam-440"]),
      selectedGroup: group,
    });

    await screen.findByText("Desktop only");

    expect(screen.getByText(/via Steam/i)).toBeInTheDocument();
    expect(screen.getByText(/hl2\.exe/i)).toBeInTheDocument();
  });

  it("updates the search query through the controlled input", () => {
    const setSearchQuery = vi.fn();
    renderSidebar({ setSearchQuery });

    const searchInput = screen.getByLabelText("Search library");
    fireEvent.change(searchInput, { target: { value: "halo" } });

    expect(setSearchQuery).toHaveBeenCalledWith("halo");
  });
});
