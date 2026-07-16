import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { initialAdvancedFilters } from "../../lib/library-filters-helpers";
import { LibraryFilters } from "./LibraryFilters";

const mocks = vi.hoisted(() => ({
  context: null as unknown,
  applyDynamicCollection: vi.fn(),
  clearManualCollectionSelection: vi.fn(),
  resetAdvancedFilters: vi.fn(),
  saveCurrentFilterAsCollection: vi.fn(),
  selectManualCollection: vi.fn(),
  setAdvancedFilters: vi.fn(),
  setSelectedCollectionName: vi.fn(),
}));

vi.mock("../../context/useLibraryContext", () => ({
  useLibraryContext: () => mocks.context,
}));

function installContext(
  showGamePassCatalog: boolean,
  options: {
    dynamicCollections?: { name: string }[];
    manualCollections?: Record<string, string[]>;
    newCollectionName?: string;
    selectedCollectionName?: string | null;
    selectedManualCollectionName?: string | null;
  } = {},
) {
  mocks.context = {
    filters: {
      advancedFilters: { ...initialAdvancedFilters, showGamePassCatalog },
      resetAdvancedFilters: mocks.resetAdvancedFilters,
      setAdvancedFilters: mocks.setAdvancedFilters,
    },
    manual: {
      clearManualCollectionSelection: mocks.clearManualCollectionSelection,
      customCategories: {},
      manualCollections: options.manualCollections ?? {},
      selectManualCollection: mocks.selectManualCollection,
      selectedManualCollectionName: options.selectedManualCollectionName ?? null,
    },
    dynamic: {
      applyDynamicCollection: mocks.applyDynamicCollection,
      dynamicCollections: options.dynamicCollections ?? [],
      newCollectionName: options.newCollectionName ?? "",
      saveCurrentFilterAsCollection: mocks.saveCurrentFilterAsCollection,
      selectedCollectionName: options.selectedCollectionName ?? null,
      setNewCollectionName: vi.fn(),
      setSelectedCollectionName: mocks.setSelectedCollectionName,
    },
  };
}

describe("LibraryFilters", () => {
  beforeEach(() => {
    mocks.resetAdvancedFilters.mockReset();
    mocks.setAdvancedFilters.mockReset();
    mocks.applyDynamicCollection.mockReset();
    mocks.clearManualCollectionSelection.mockReset();
    mocks.saveCurrentFilterAsCollection.mockReset();
    mocks.selectManualCollection.mockReset();
    mocks.setSelectedCollectionName.mockReset();
    installContext(true);
  });

  it("renders the PC Game Pass visibility control inside Game Platform", () => {
    render(<LibraryFilters isOpen onClose={vi.fn()} />);

    const storeSection = screen.getByRole("heading", {
      name: "Game Platform (Store)",
    }).parentElement;
    expect(storeSection).not.toBeNull();
    expect(screen.queryByText("Xbox // Catalog")).not.toBeInTheDocument();
    expect(within(storeSection!).getByText("PC Game Pass Catalog")).toBeInTheDocument();
    expect(within(storeSection!).queryByText("Visible")).not.toBeInTheDocument();
    expect(within(storeSection!).queryByText("Hidden")).not.toBeInTheDocument();
    expect(
      within(storeSection!).getByRole("checkbox", { name: "Show PC Game Pass catalog" }),
    ).toBeChecked();
  });

  it("writes an explicit hidden catalog preference", () => {
    render(<LibraryFilters isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Show PC Game Pass catalog" }));

    expect(mocks.setAdvancedFilters).toHaveBeenCalledWith(
      expect.objectContaining({ showGamePassCatalog: false }),
    );
  });

  it("keeps the complete filter panel inside the scrollable library viewport", () => {
    render(<LibraryFilters isOpen onClose={vi.fn()} />);

    const panel = screen.getByRole("dialog", { name: "Advanced Filters" });
    expect(panel).toHaveClass(
      "top-12",
      "bottom-2",
      "overflow-y-auto",
      "overscroll-contain",
      "[scrollbar-gutter:stable]",
    );
    expect(panel).not.toHaveClass("max-h-[82vh]");
  });

  it("does not render the retired feature filter options", () => {
    render(<LibraryFilters isOpen onClose={vi.fn()} />);

    expect(screen.queryByRole("heading", { name: "Features" })).not.toBeInTheDocument();
    expect(screen.queryByText("Steam Achievements")).not.toBeInTheDocument();
    expect(screen.queryByText("Steam Trading Cards")).not.toBeInTheDocument();
    expect(screen.queryByText("Steam Workshop")).not.toBeInTheDocument();
  });

  it("clears the manual selection before applying a dynamic collection", () => {
    installContext(true, {
      dynamicCollections: [{ name: "Recently Played" }],
      selectedManualCollectionName: "Favorites",
    });
    render(<LibraryFilters isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Recently Played" }));

    expect(mocks.clearManualCollectionSelection).toHaveBeenCalledOnce();
    expect(mocks.applyDynamicCollection).toHaveBeenCalledWith("Recently Played");
  });

  it("clears the dynamic selection before applying a manual collection", () => {
    installContext(true, {
      manualCollections: { Favorites: ["g1"] },
      selectedCollectionName: "Recently Played",
    });
    render(<LibraryFilters isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));

    expect(mocks.setSelectedCollectionName).toHaveBeenCalledWith(null);
    expect(mocks.selectManualCollection).toHaveBeenCalledWith("Favorites");
  });

  it("global reset clears manual and dynamic collection selections", () => {
    installContext(true, {
      selectedCollectionName: "Recently Played",
      selectedManualCollectionName: "Favorites",
    });
    render(<LibraryFilters isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset All" }));

    expect(mocks.resetAdvancedFilters).toHaveBeenCalledOnce();
    expect(mocks.clearManualCollectionSelection).toHaveBeenCalledOnce();
    expect(mocks.setSelectedCollectionName).toHaveBeenCalledWith(null);
  });

  it("clears a manual selection when saving and selecting a dynamic collection", () => {
    installContext(true, {
      newCollectionName: "My Smart List",
      selectedManualCollectionName: "Favorites",
    });
    render(<LibraryFilters isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mocks.clearManualCollectionSelection).toHaveBeenCalledOnce();
    expect(mocks.saveCurrentFilterAsCollection).toHaveBeenCalledWith("My Smart List");
  });
});
