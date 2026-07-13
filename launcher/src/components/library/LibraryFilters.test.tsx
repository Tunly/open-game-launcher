import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { initialAdvancedFilters } from "../../lib/library-filters-helpers";
import { LibraryFilters } from "./LibraryFilters";

const mocks = vi.hoisted(() => ({
  context: null as unknown,
  resetAdvancedFilters: vi.fn(),
  setAdvancedFilters: vi.fn(),
}));

vi.mock("../../context/useLibraryContext", () => ({
  useLibraryContext: () => mocks.context,
}));

function installContext(showGamePassCatalog: boolean) {
  mocks.context = {
    filters: {
      advancedFilters: { ...initialAdvancedFilters, showGamePassCatalog },
      resetAdvancedFilters: mocks.resetAdvancedFilters,
      setAdvancedFilters: mocks.setAdvancedFilters,
    },
    manual: {
      clearManualCollectionSelection: vi.fn(),
      customCategories: {},
      manualCollections: {},
      selectManualCollection: vi.fn(),
      selectedManualCollectionName: null,
    },
    dynamic: {
      applyDynamicCollection: vi.fn(),
      dynamicCollections: [],
      newCollectionName: "",
      saveCurrentFilterAsCollection: vi.fn(),
      selectedCollectionName: null,
      setNewCollectionName: vi.fn(),
      setSelectedCollectionName: vi.fn(),
    },
  };
}

describe("LibraryFilters", () => {
  beforeEach(() => {
    mocks.resetAdvancedFilters.mockReset();
    mocks.setAdvancedFilters.mockReset();
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
});
