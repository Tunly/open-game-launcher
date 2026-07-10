import { fireEvent, render, screen } from "@testing-library/react";
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

  it("renders a Retro Manga PC Game Pass visibility control", () => {
    render(<LibraryFilters isOpen onClose={vi.fn()} />);

    expect(screen.getByText("Xbox // Catalog")).toBeInTheDocument();
    expect(screen.getByText("PC Game Pass")).toBeInTheDocument();
    expect(screen.getByText("Visible")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Show PC Game Pass catalog" })).toBeChecked();
  });

  it("writes an explicit hidden catalog preference", () => {
    render(<LibraryFilters isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Show PC Game Pass catalog" }));

    expect(mocks.setAdvancedFilters).toHaveBeenCalledWith(
      expect.objectContaining({ showGamePassCatalog: false }),
    );
  });
});
