import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UseProviderPickingOptions } from "../hooks/library/useProviderPicking";
import { LibraryPage } from "./LibraryPage";

const gameDetailPanelMock = vi.hoisted(() => vi.fn());
const useProviderPickingMock = vi.hoisted(() =>
  vi.fn((options: UseProviderPickingOptions) => {
    void options;

    return {
      handleInstallFromProvider: vi.fn(),
      handlePlay: vi.fn(),
      handlePlayVariant: vi.fn(),
      providerPicker: null,
      setProviderPicker: vi.fn(),
    };
  }),
);

const noop = vi.fn();

vi.mock("../components/library/AddGameDialog", () => ({
  AddGameDialog: () => null,
}));

vi.mock("../components/library/GameDetailPanel", () => ({
  GameDetailPanel: (props: { verifyMode?: string | null }) => {
    gameDetailPanelMock(props);

    return (
      <section aria-label="Game detail panel mock" data-verify-mode={props.verifyMode ?? "null"} />
    );
  },
}));

vi.mock("../components/library/LibraryFilters", () => ({
  LibraryFilters: () => null,
}));

vi.mock("../components/library/LibrarySidebar", () => ({
  LibrarySidebar: () => <aside aria-label="Library sidebar mock" />,
}));

vi.mock("../components/library/ProviderPickerDialog", () => ({
  ProviderPickerDialog: () => null,
}));

vi.mock("../hooks/library/useAchievementAutoSync", () => ({
  useAchievementAutoSync: () => ({
    syncingAchievementGameId: null,
  }),
}));

vi.mock("../hooks/library/useDynamicCollections", () => ({
  useDynamicCollections: () => ({
    setSelectedCollectionName: noop,
  }),
}));

vi.mock("../hooks/library/useLibraryFilters", () => ({
  useLibraryFilters: () => ({
    activePlatformFilter: "all",
    advancedFilters: {},
    fallbackMockGames: [],
    filteredGroups: [],
    hasActiveFilters: false,
    isFilterPopupOpen: false,
    libraryGroups: [],
    pendingSelectedGameId: null,
    resetAdvancedFilters: noop,
    searchQuery: "",
    selectedGroup: null,
    setActivePlatformFilter: noop,
    setAdvancedFilters: noop,
    setIsFilterPopupOpen: noop,
    setPendingSelectedGameId: noop,
    setSearchQuery: noop,
    setSelectedGroupId: noop,
    setSortOption: noop,
    sortOption: "recent",
  }),
}));

vi.mock("../hooks/library/useLibrarySync", () => ({
  useLibrarySync: () => ({
    addGameToLibrary: vi.fn().mockResolvedValue({ id: "manual-game", title: "Manual Game" }),
    closeArtworkPreview: noop,
    customArtwork: {},
    discoveryMessage: null,
    gameRuntimeById: {},
    handleApplyCustomArtworkUrl: noop,
    handleArtworkDrop: noop,
    handleConfirmArtwork: noop,
    handleLogoError: noop,
    handleLogoLoad: noop,
    handleResetCustomArtwork: noop,
    handleSelectCustomArtwork: noop,
    initialLibrarySnapshot: [],
    installedGames: [],
    isDiscoveringGames: false,
    loadedLogoUrls: new Set<string>(),
    logoCandidateIndexes: {},
    openArtworkPreview: noop,
    pendingArtworkFile: null,
    pendingArtworkGameId: null,
    pendingArtworkKind: "cover",
    runAutomaticLibrarySync: vi.fn().mockResolvedValue(undefined),
    runningGameIds: new Set<string>(),
    setInstalledGames: noop,
    shouldShowLibraryLoading: false,
  }),
}));

vi.mock("../hooks/library/useManualCollections", () => ({
  useManualCollections: () => ({
    clearManualCollectionSelection: noop,
    customCategories: {},
    favorites: {},
    hiddenGames: {},
    manualCollections: {},
    selectedManualCollectionName: null,
    setCustomCategories: noop,
    setFavorites: noop,
    setHiddenGames: noop,
    setManualCollections: noop,
  }),
}));

vi.mock("../hooks/library/useProviderPicking", () => ({
  useProviderPicking: useProviderPickingMock,
}));

vi.mock("../lib/launcher", () => ({
  launchCrossPlayJoin: vi.fn(),
}));

vi.mock("../stores/downloadStore", () => ({
  selectCompletedCount: (state: { items: Array<{ status: string }> }) =>
    state.items.filter((item) => item.status === "completed").length,
  useDownloadStore: (selector: (state: { items: Array<{ status: string }> }) => unknown) =>
    selector({ items: [] }),
}));

import { Suspense } from "react";

function renderLibraryRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Suspense fallback={null}>
        <Routes>
          <Route element={<LibraryPage />} path="/library" />
          <Route element={<FriendsRouteProbe />} path="/friends" />
        </Routes>
      </Suspense>
    </MemoryRouter>,
  );
}

function FriendsRouteProbe() {
  const location = useLocation();

  return (
    <div data-testid="friends-route">
      {location.pathname}
      {location.search}
    </div>
  );
}

describe("LibraryPage verification route wiring", () => {
  beforeEach(() => {
    gameDetailPanelMock.mockClear();
    useProviderPickingMock.mockClear();
  });

  it("passes IGDB cross-play readiness verify mode to GameDetailPanel", async () => {
    renderLibraryRoute("/library?verify=igdb-cross-play-readiness");

    await waitFor(() => {
      expect(screen.getByRole("region", { name: /game detail panel mock/i })).toHaveAttribute(
        "data-verify-mode",
        "igdb-cross-play-readiness",
      );
    });
    expect(gameDetailPanelMock).toHaveBeenLastCalledWith({
      verifyMode: "igdb-cross-play-readiness",
    });
  });

  it.each([
    ["cross-store-save-sync"],
    ["cross-store-save-sync-e2e-readiness"],
    ["hosted-community-artwork"],
  ])("passes %s verify mode to GameDetailPanel", (verifyMode) => {
    renderLibraryRoute(`/library?verify=${verifyMode}`);

    expect(screen.getByRole("region", { name: /game detail panel mock/i })).toHaveAttribute(
      "data-verify-mode",
      verifyMode,
    );
    expect(gameDetailPanelMock).toHaveBeenLastCalledWith({ verifyMode });
  });

  it("passes null verify mode to GameDetailPanel on the base library route", () => {
    renderLibraryRoute("/library");

    expect(screen.getByRole("region", { name: /game detail panel mock/i })).toHaveAttribute(
      "data-verify-mode",
      "null",
    );
    expect(gameDetailPanelMock).toHaveBeenLastCalledWith({ verifyMode: null });
  });

  it("does not pass a first-party cloud auto-sync callback to provider picking", () => {
    renderLibraryRoute("/library");

    const lastCall = useProviderPickingMock.mock.lastCall as [{ selectedGroup: null }] | undefined;
    const options = lastCall?.[0];
    expect(options).toEqual(
      expect.objectContaining({
        selectedGroup: null,
        setStatusMessage: expect.any(Function),
      }),
    );
    expect(options).not.toHaveProperty("maybeAutoSyncOnLaunch");
  });

  it("routes the footer Friends & Chat control to the chat tab", () => {
    renderLibraryRoute("/library");

    fireEvent.click(screen.getByRole("button", { name: /friends & chat \+/i }));

    expect(screen.getByTestId("friends-route")).toHaveTextContent("/friends?tab=chat");
  });
});
