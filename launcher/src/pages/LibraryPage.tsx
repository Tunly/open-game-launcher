import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";

import { LibrarySidebar, type LibraryGroupOption } from "../components/library/LibrarySidebar";
import { LibraryFilters } from "../components/library/LibraryFilters";
const loadAddGameDialog = () => import("../components/library/AddGameDialog");
const loadFriendsChatPopup = () => import("../components/library/FriendsChatPopup");
const loadProviderPickerDialog = () => import("../components/library/ProviderPickerDialog");
const AddGameDialog = React.lazy(() =>
  loadAddGameDialog().then((module) => ({ default: module.AddGameDialog })),
);
const FriendsChatPopup = React.lazy(() =>
  loadFriendsChatPopup().then((module) => ({ default: module.FriendsChatPopup })),
);
const ProviderPickerDialog = React.lazy(() =>
  loadProviderPickerDialog().then((module) => ({ default: module.ProviderPickerDialog })),
);
const GameDetailPanel = React.lazy(() =>
  import("../components/library/GameDetailPanel").then((m) => ({ default: m.GameDetailPanel })),
);
import { useDownloadStore, selectCompletedCount } from "../stores/downloadStore";
import { LibraryProvider } from "../context/LibraryProvider";
import {
  getCrossPlayLaunchIdentity,
  launchCrossPlayJoin,
  toClientPlatformId,
} from "../lib/launcher";
import { isPlayableGame, type GameGroup } from "../lib/game-groups";
import { redeemShareToken, resolveShareToken } from "../lib/supabase/social";
import type { Game } from "../lib/types";
import { getLibraryArtworkUrls } from "../lib/library-artwork-audit";

import { useLibrarySync } from "../hooks/library/useLibrarySync";
import { useLibraryFilters } from "../hooks/library/useLibraryFilters";
import { useManualCollections } from "../hooks/library/useManualCollections";
import { useDynamicCollections } from "../hooks/library/useDynamicCollections";
import { useAchievementAutoSync } from "../hooks/library/useAchievementAutoSync";
import { useProviderPicking } from "../hooks/library/useProviderPicking";

function matchesGameReference(game: Game, reference: string) {
  const wanted = reference.trim().toLowerCase();
  if (!wanted) return false;

  return [game.slug, game.id, game.externalId, game.title].some(
    (value) => typeof value === "string" && value.trim().toLowerCase() === wanted,
  );
}

function findInstalledProviderGame(games: Game[], reference: string, platform: string) {
  const requestedProvider = toClientPlatformId(platform);
  if (!requestedProvider) return null;

  return (
    games.find(
      (game) =>
        isPlayableGame(game) &&
        matchesGameReference(game, reference) &&
        toClientPlatformId(game.launcher) === requestedProvider,
    ) ?? null
  );
}

function formatGroupLabel(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function groupLibraryGames(groups: GameGroup[], option: LibraryGroupOption) {
  if (option === "none") return {};

  return groups.reduce<Record<string, GameGroup[]>>((grouped, group) => {
    const game = group.displayGame;
    const rawLabel =
      option === "source"
        ? (game.launcher ?? "Manual")
        : option === "platform"
          ? game.platform
          : game.status;
    const label = formatGroupLabel(rawLabel || "Other");
    (grouped[label] ??= []).push(group);
    return grouped;
  }, {});
}

export function LibraryPage() {
  const gameListScrollRef = useRef<HTMLDivElement>(null);
  const claimedJoinRequestRef = useRef<string | null>(null);
  const claimedPlayRequestRef = useRef<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isAddGameOpen, setIsAddGameOpen] = useState(false);
  const [isFriendsChatOpen, setIsFriendsChatOpen] = useState(false);
  const [groupOption, setGroupOption] = useState<LibraryGroupOption>("none");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const downloadCount = useDownloadStore((s) => s.items.length);
  const completedDownloadCount = useDownloadStore(selectCompletedCount);
  const isDesktopRuntime = isTauri();

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
    setSortOption: filters.setSortOption,
    currentAdvancedFilters: filters.advancedFilters,
    currentPlatformFilter: filters.activePlatformFilter,
    currentSearchQuery: filters.searchQuery,
    currentSortOption: filters.sortOption,
  });
  const achievements = useAchievementAutoSync({
    installedGames: sync.installedGames,
    selectedGroup: filters.selectedGroup,
    setInstalledGames: sync.setInstalledGames,
    setStatusMessage,
  });
  const picking = useProviderPicking({
    selectedGroup: filters.selectedGroup,
    setStatusMessage,
  });
  const groupedGames = useMemo(
    () => groupLibraryGames(filters.filteredGroups, groupOption),
    [filters.filteredGroups, groupOption],
  );

  useEffect(() => {
    let cancelled = false;
    const urls = getLibraryArtworkUrls(filters.enrichedLibraryGames ?? []);
    if (urls.length === 0 || typeof Image === "undefined") return;

    void Promise.all(
      urls.map(
        (url) =>
          new Promise<[string, boolean]>((resolve) => {
            const image = new Image();
            image.onload = () => resolve([url, true]);
            image.onerror = () => resolve([url, false]);
            image.src = url;
          }),
      ),
    ).then(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
    };
  }, [filters.enrichedLibraryGames]);

  useEffect(() => {
    const requestedGameId = searchParams.get("game");
    if (!requestedGameId) return;
    const requestedAction = searchParams.get("action");

    // The first render may contain a non-empty but stale browser snapshot.
    // Keep the deep-link intact until the native/provider inventory has been
    // reconciled so a valid target cannot be rejected prematurely.
    if (!sync.hasCompletedInitialLibraryLoad) return;

    const match = sync.installedGames.find((game) => game.id === requestedGameId);
    if (match) {
      filters.setPendingSelectedGameId(match.id);
      if (requestedAction === "play" && claimedPlayRequestRef.current !== match.id) {
        claimedPlayRequestRef.current = match.id;
        void picking.handlePlayVariant(match);
      }
    } else if (sync.shouldShowLibraryLoading || sync.isDiscoveringGames) {
      return;
    } else {
      setStatusMessage("The requested game is no longer in this library.");
    }

    const next = new URLSearchParams(searchParams);
    next.delete("game");
    next.delete("action");
    setSearchParams(next, { replace: true });
  }, [filters, picking, searchParams, setSearchParams, sync]);

  // Deep-link `?join=...&platform=...&invite=...` from a universallauncher://join URL.
  // The Rust deep-link handler navigates here, but this is where we actually trigger
  // the cross-play launch and tidy up the URL so a reload doesn't re-fire it.
  useEffect(() => {
    const joinSlug = searchParams.get("join");
    if (!joinSlug) {
      claimedJoinRequestRef.current = null;
      return;
    }

    if (sync.isDiscoveringGames || sync.shouldShowLibraryLoading) {
      return;
    }

    const platform = searchParams.get("platform")?.trim() ?? "";
    const invite = searchParams.get("invite")?.trim() ?? "";
    const requestKey = `${joinSlug}\u0000${platform}\u0000${invite}`;
    if (claimedJoinRequestRef.current === requestKey) {
      return;
    }

    claimedJoinRequestRef.current = requestKey;
    const next = new URLSearchParams(searchParams);
    next.delete("join");
    next.delete("platform");
    next.delete("invite");
    setSearchParams(next, { replace: true });

    void (async () => {
      let inviteAccepted = false;
      let requestedGame = joinSlug;
      let requestedPlatform = platform;
      let match: Game | null = null;

      try {
        if (invite) {
          const resolvedInvite = await resolveShareToken(invite);
          if (!resolvedInvite) {
            throw new Error("the invite token is invalid, expired, or already used");
          }

          requestedGame = resolvedInvite.gameTitle;
          requestedPlatform = resolvedInvite.platform?.trim() || requestedPlatform;
        }

        if (!requestedPlatform) {
          throw new Error("the invite does not identify a launcher platform");
        }

        match = findInstalledProviderGame(sync.installedGames, requestedGame, requestedPlatform);
        if (!match) {
          throw new Error(
            `the ${requestedPlatform} version is not installed yet. Install it first`,
          );
        }

        if (invite) {
          const redeemedInvite = await redeemShareToken(invite);
          if (!redeemedInvite || redeemedInvite.status !== "accepted") {
            throw new Error("the invite token could not be accepted");
          }
          inviteAccepted = true;
        }

        const gameIdentity = getCrossPlayLaunchIdentity(match);
        const uri = await launchCrossPlayJoin(requestedPlatform, gameIdentity);
        setStatusMessage(
          inviteAccepted
            ? `Invite accepted. Opened ${match.title} on ${requestedPlatform}; this invite does not contain a provider session target, so finish joining in the game.`
            : `Opened ${match.title} on ${requestedPlatform}.`,
        );
        console.info("[deep-link] opened provider game", uri);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const title = match?.title ?? requestedGame;
        setStatusMessage(
          inviteAccepted
            ? `Invite accepted, but ${title} could not be opened: ${message}`
            : `Could not open ${title}: ${message}`,
        );
      }
    })();
  }, [
    searchParams,
    setSearchParams,
    sync.installedGames,
    sync.isDiscoveringGames,
    sync.shouldShowLibraryLoading,
  ]);

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
      <div className="library-steam-shell flex h-full min-h-0 flex-col overflow-hidden border-x-0 border-black bg-[#fbf4e7] text-[#171411] sm:border-x-4">
        <div className="relative grid min-h-0 min-w-0 flex-1 grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[290px_minmax(0,1fr)]">
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
            groupOption={groupOption}
            groupedGames={groupedGames}
            setGroupOption={setGroupOption}
            selectedGroup={filters.selectedGroup}
            setSelectedGroup={(group) => filters.setSelectedGroupId(group.id)}
            favorites={manual.favorites}
            gameRuntimeById={sync.gameRuntimeById}
            runningGameIds={sync.runningGameIds}
            listScrollRef={gameListScrollRef}
            onArtworkDrop={sync.handleArtworkDrop}
          />
          <LibraryFilters
            isOpen={filters.isFilterPopupOpen}
            onClose={() => filters.setIsFilterPopupOpen(false)}
          />
          <React.Suspense fallback={null}>
            <GameDetailPanel verifyMode={searchParams.get("verify")} />
          </React.Suspense>
        </div>

        {isAddGameOpen ? (
          <React.Suspense fallback={null}>
            <AddGameDialog
              isOpen
              onClose={() => setIsAddGameOpen(false)}
              onAddGame={handleAddManualGame}
            />
          </React.Suspense>
        ) : null}

        {picking.providerPicker ? (
          <React.Suspense fallback={null}>
            <ProviderPickerDialog
              state={picking.providerPicker}
              onClose={() => picking.setProviderPicker(null)}
              onSelect={picking.handlePlayVariant}
            />
          </React.Suspense>
        ) : null}

        {isFriendsChatOpen ? (
          <React.Suspense fallback={null}>
            <FriendsChatPopup
              onClose={() => setIsFriendsChatOpen(false)}
              onOpenSocial={(tab, friendId) => {
                const params = new URLSearchParams();
                if (tab !== "friends") {
                  params.set("tab", tab);
                }
                if (friendId) {
                  params.set("friend", friendId);
                }
                const query = params.toString();
                navigate(query ? `/friends?${query}` : "/friends");
              }}
            />
          </React.Suspense>
        ) : null}

        <footer className="flex h-10 shrink-0 items-center justify-between border-t-4 border-black bg-[#f4ead8] px-4 text-[14px] font-black">
          <button
            type="button"
            disabled={!isDesktopRuntime}
            aria-label={isDesktopRuntime ? "Add a Game" : "Add a Game — Desktop Only"}
            title={
              isDesktopRuntime
                ? "Add a local game"
                : "Adding local games requires the OG-Launcher desktop app."
            }
            className="disabled:cursor-not-allowed disabled:text-[#655f58]"
            onFocus={() => void loadAddGameDialog()}
            onPointerEnter={() => void loadAddGameDialog()}
            onClick={() => {
              setIsAddGameOpen(true);
            }}
          >
            {isDesktopRuntime ? "+ Add a Game" : "+ Add a Game — Desktop Only"}
          </button>
          <button
            type="button"
            className="hidden hover:text-[#b7102a] sm:inline"
            onClick={() => navigate("/downloads")}
          >
            Downloads - {completedDownloadCount} of {downloadCount} items Complete
          </button>
          <button
            aria-controls="library-friends-chat-popup"
            aria-expanded={isFriendsChatOpen}
            type="button"
            onFocus={() => void loadFriendsChatPopup()}
            onPointerEnter={() => void loadFriendsChatPopup()}
            onClick={() => setIsFriendsChatOpen((current) => !current)}
          >
            Friends & Chat {isFriendsChatOpen ? "−" : "+"}
          </button>
        </footer>
      </div>
    </LibraryProvider>
  );
}
