import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { LibrarySidebar } from "../components/library/LibrarySidebar";
import { LibraryFilters } from "../components/library/LibraryFilters";
import { AddGameDialog } from "../components/library/AddGameDialog";
import { ProviderPickerDialog } from "../components/library/ProviderPickerDialog";
import { GameDetailPanel } from "../components/library/GameDetailPanel";
import { useCloudAutoSync } from "../hooks/useCloudAutoSync";
import { useDownloadStore, selectCompletedCount } from "../stores/downloadStore";
import { LibraryProvider } from "../context/LibraryProvider";
import { launchCrossPlayJoin } from "../lib/launcher";

import { useLibrarySync } from "../hooks/library/useLibrarySync";
import { useLibraryFilters } from "../hooks/library/useLibraryFilters";
import { useManualCollections } from "../hooks/library/useManualCollections";
import { useDynamicCollections } from "../hooks/library/useDynamicCollections";
import { useAchievementAutoSync } from "../hooks/library/useAchievementAutoSync";
import { useProviderPicking } from "../hooks/library/useProviderPicking";

export function LibraryPage() {
  const gameListScrollRef = useRef<HTMLDivElement>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isAddGameOpen, setIsAddGameOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const downloadCount = useDownloadStore((s) => s.items.length);
  const completedDownloadCount = useDownloadStore(selectCompletedCount);

  const sync = useLibrarySync({ setStatusMessage });
  const manual = useManualCollections();
  const filters = useLibraryFilters({
    installedGames: sync.installedGames,
    customArtwork: sync.customArtwork,
    favorites: manual.favorites,
    hiddenGames: manual.hiddenGames,
    customCategories: manual.customCategories,
    manualCollections: manual.manualCollections,
    selectedManualCollectionName: manual.selectedManualCollectionName,
    isDiscoveringGames: sync.isDiscoveringGames,
  });
  const dynamic = useDynamicCollections({
    setAdvancedFilters: filters.setAdvancedFilters,
    setActivePlatformFilter: filters.setActivePlatformFilter,
    setSearchQuery: filters.setSearchQuery,
    currentAdvancedFilters: filters.advancedFilters,
    currentPlatformFilter: filters.activePlatformFilter,
    currentSearchQuery: filters.searchQuery,
    currentSortOption: filters.sortOption,
  });
  const achievements = useAchievementAutoSync({
    selectedGroup: filters.selectedGroup,
    setInstalledGames: sync.setInstalledGames,
    setStatusMessage,
  });
  const { maybeSyncOnLaunch: maybeAutoSyncOnLaunch } = useCloudAutoSync({
    game: filters.selectedGroup?.primaryGame ?? filters.selectedGroup?.displayGame ?? null,
    onMessage: setStatusMessage,
  });
  const picking = useProviderPicking({
    selectedGroup: filters.selectedGroup,
    setStatusMessage,
    maybeAutoSyncOnLaunch,
  });

  // Deep-link `?join=...&platform=...&invite=...` from a universallauncher://join URL.
  // The Rust deep-link handler navigates here, but this is where we actually trigger
  // the cross-play launch and tidy up the URL so a reload doesn't re-fire it.
  useEffect(() => {
    const joinSlug = searchParams.get("join");
    if (!joinSlug) return;

    const platform = searchParams.get("platform") ?? "";
    const invite = searchParams.get("invite") ?? "";
    const wanted = joinSlug.toLowerCase();

    const match = sync.installedGames.find((game) => {
      const candidates = [game.slug, game.id, game.externalId, game.title]
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .map((value) => value.toLowerCase());
      return candidates.includes(wanted);
    });

    if (!match) {
      setStatusMessage(
        `Could not join "${joinSlug}" — game is not installed yet. Install it first.`,
      );
      const next = new URLSearchParams(searchParams);
      next.delete("join");
      next.delete("platform");
      next.delete("invite");
      setSearchParams(next, { replace: true });
      return;
    }

    const gameSlug = match.slug || match.id;
    if (!platform) {
      setStatusMessage(`Could not join "${match.title}" — missing platform parameter.`);
      const next = new URLSearchParams(searchParams);
      next.delete("join");
      next.delete("platform");
      next.delete("invite");
      setSearchParams(next, { replace: true });
      return;
    }

    launchCrossPlayJoin(platform, gameSlug)
      .then((uri) => {
        const inviteSuffix = invite ? ` (invite ${invite})` : "";
        setStatusMessage(`Joining ${match.title} on ${platform}${inviteSuffix}…`);
        console.info("[deep-link] launched", uri);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setStatusMessage(`Could not join ${match.title}: ${message}`);
      })
      .finally(() => {
        const next = new URLSearchParams(searchParams);
        next.delete("join");
        next.delete("platform");
        next.delete("invite");
        setSearchParams(next, { replace: true });
      });
  }, [searchParams, setSearchParams, sync.installedGames, setStatusMessage]);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setStatusMessage(null);
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(() => {
    if (filters.filteredGroups.length === 0) {
      filters.setSelectedGroupId(null);
      return;
    }

    if (filters.pendingSelectedGameId) {
      const pendingGroup = filters.filteredGroups.find((group) =>
        group.variants.some((game) => game.id === filters.pendingSelectedGameId),
      );
      if (pendingGroup) {
        filters.setSelectedGroupId(pendingGroup.id);
        filters.setPendingSelectedGameId(null);
        return;
      }
    }

    if (
      !filters.selectedGroup ||
      !filters.filteredGroups.some((group) => group.id === filters.selectedGroup?.id)
    ) {
      filters.setSelectedGroupId(filters.filteredGroups[0].id);
    }
  }, [filters]);

  function handleAddManualGame(input: { title: string; installPath: string }) {
    return sync.addGameToLibrary(input).then((game) => {
      filters.setPendingSelectedGameId(game.id);
      setStatusMessage(`${game.title} has been added to the library.`);
    });
  }

  return (
    <LibraryProvider
      value={{
        sync,
        manual,
        filters,
        dynamic,
        achievements,
        picking,
        statusMessage,
        setStatusMessage,
      }}
    >
      <div className="library-steam-shell h-full min-h-0 overflow-hidden border-x-0 border-black bg-[#fbf4e7] text-[#171411] sm:border-x-4">
        <div className="relative grid h-full min-h-0 min-w-0 grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[290px_minmax(0,1fr)]">
          <LibrarySidebar
            games={filters.libraryGroups}
            filteredGames={filters.filteredGroups}
            searchQuery={filters.searchQuery}
            setSearchQuery={filters.setSearchQuery}
            sortOption={filters.sortOption}
            setSortOption={filters.setSortOption}
            isFilterPopupOpen={filters.isFilterPopupOpen}
            setIsFilterPopupOpen={filters.setIsFilterPopupOpen}
            activePlatformFilter={filters.activePlatformFilter}
            advancedFilters={filters.advancedFilters}
            hasActiveFilters={filters.hasActiveFilters}
            onResetFilters={filters.resetAdvancedFilters}
            groupOption={"none"}
            groupedGames={{}}
            selectedGroup={filters.selectedGroup}
            setSelectedGroup={(group) => filters.setSelectedGroupId(group.id)}
            favorites={manual.favorites}
            fallbackMockGames={filters.fallbackMockGames}
            listScrollRef={gameListScrollRef}
            setIsAddGameOpen={setIsAddGameOpen}
            onArtworkDrop={sync.handleArtworkDrop}
          />
          <LibraryFilters
            isOpen={filters.isFilterPopupOpen}
            onClose={() => filters.setIsFilterPopupOpen(false)}
          />
          <GameDetailPanel />
        </div>

        <AddGameDialog
          isOpen={isAddGameOpen}
          onClose={() => setIsAddGameOpen(false)}
          onAddGame={handleAddManualGame}
        />

        <ProviderPickerDialog
          state={picking.providerPicker}
          onClose={() => picking.setProviderPicker(null)}
          onSelect={picking.handlePlayVariant}
        />

        <footer className="flex h-10 items-center justify-between border-t-4 border-black bg-[#f4ead8] px-4 text-[14px] font-black">
          <button
            type="button"
            onClick={() => {
              setIsAddGameOpen(true);
            }}
          >
            + Add a Game
          </button>
          <span className="hidden sm:inline">
            Downloads - {completedDownloadCount} of {downloadCount} items Complete
          </span>
          <button type="button">Friends & Chat +</button>
        </footer>
      </div>
    </LibraryProvider>
  );
}
