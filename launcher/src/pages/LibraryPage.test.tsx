import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Suspense, type ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UseProviderPickingOptions } from "../hooks/library/useProviderPicking";
import type { Game } from "../lib/types";
import { LibraryPage } from "./LibraryPage";

const gameDetailPanelMock = vi.hoisted(() => vi.fn());
const launchCrossPlayJoinMock = vi.hoisted(() => vi.fn());
const tauriMocks = vi.hoisted(() => ({ isTauri: vi.fn() }));
const shareTokenMocks = vi.hoisted(() => ({
  redeemShareToken: vi.fn(),
  resolveShareToken: vi.fn(),
}));
const useLibrarySyncMock = vi.hoisted(() => vi.fn());
const setPendingSelectedGameIdMock = vi.hoisted(() => vi.fn());
const handlePlayVariantMock = vi.hoisted(() => vi.fn());
const useProviderPickingMock = vi.hoisted(() =>
  vi.fn((options: UseProviderPickingOptions) => {
    void options;

    return {
      handleInstallFromProvider: vi.fn(),
      handlePlay: vi.fn(),
      handlePlayVariant: handlePlayVariantMock,
      providerPicker: null,
      setProviderPicker: vi.fn(),
    };
  }),
);

const noop = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: tauriMocks.isTauri,
}));

vi.mock("../components/library/AddGameDialog", () => ({
  AddGameDialog: () => null,
}));

vi.mock("../components/library/GameDetails", () => ({
  GameDetails: (props: { verifyMode?: string | null }) => {
    gameDetailPanelMock(props);

    return (
      <section aria-label="Game detail panel mock" data-verify-mode={props.verifyMode ?? "null"} />
    );
  },
}));

vi.mock("../components/library/FriendsChatPopup", () => ({
  FriendsChatPopup: ({ onClose }: { onClose: () => void }) => (
    <section aria-label="Friends and chat" role="dialog">
      <button type="button" onClick={onClose}>
        Close friends and chat
      </button>
    </section>
  ),
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

vi.mock("../context/LibraryProvider", () => ({
  LibraryProvider: ({
    children,
    value,
  }: {
    children: ReactNode;
    value: { statusMessage: string | null };
  }) => (
    <>
      <output aria-label="Library status">{value.statusMessage}</output>
      {children}
    </>
  ),
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
    setPendingSelectedGameId: setPendingSelectedGameIdMock,
    setSearchQuery: noop,
    setSelectedGroupId: noop,
    setSortOption: noop,
    sortOption: "recent",
  }),
}));

vi.mock("../hooks/library/useLibrarySync", () => ({
  useLibrarySync: (...args: unknown[]) => useLibrarySyncMock(...args),
}));

function makeLibrarySyncResult(
  overrides: Partial<{
    installedGames: Game[];
    hasCompletedInitialLibraryLoad: boolean;
    isDiscoveringGames: boolean;
    shouldShowLibraryLoading: boolean;
  }> = {},
) {
  const installedGames = overrides.installedGames ?? [];

  return {
    addGameToLibrary: vi.fn().mockResolvedValue({ id: "manual-game", title: "Manual Game" }),
    closeArtworkPreview: noop,
    customArtwork: {},
    discoveryMessage: null,
    gameRuntimeById: {},
    hasCompletedInitialLibraryLoad: overrides.hasCompletedInitialLibraryLoad ?? true,
    handleApplyCustomArtworkUrl: noop,
    handleArtworkDrop: noop,
    handleConfirmArtwork: noop,
    handleLogoError: noop,
    handleLogoLoad: noop,
    handleResetCustomArtwork: noop,
    handleSelectCustomArtwork: noop,
    initialLibrarySnapshot: [],
    installedGames,
    installedGamesRef: { current: installedGames },
    isDiscoveringGames: overrides.isDiscoveringGames ?? false,
    loadInstalledGames: vi.fn().mockResolvedValue(undefined),
    loadedLogoUrls: new Set<string>(),
    logoCandidateIndexes: {},
    openArtworkPreview: noop,
    pendingArtworkFile: null,
    pendingArtworkGameId: null,
    pendingArtworkKind: "cover",
    runAutomaticLibrarySync: vi.fn().mockResolvedValue(undefined),
    runningGameIds: new Set<string>(),
    setInstalledGames: noop,
    shouldShowLibraryLoading: overrides.shouldShowLibraryLoading ?? false,
  };
}

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
  getCrossPlayLaunchIdentity: (game: Game) => {
    const externalId = game.externalId?.trim();
    if (!externalId) throw new Error("missing exact provider launch identity");
    return externalId;
  },
  launchCrossPlayJoin: (...args: unknown[]) => launchCrossPlayJoinMock(...args),
  toClientPlatformId: (value: string | null | undefined) => {
    const provider = value?.trim().toLowerCase();
    if (provider === "origin") return "ea";
    if (provider === "uplay") return "ubisoft";
    return provider || null;
  },
}));

vi.mock("../lib/supabase/social", () => shareTokenMocks);

vi.mock("../stores/downloadStore", () => ({
  selectCompletedCount: (state: { items: Array<{ status: string }> }) =>
    state.items.filter((item) => item.status === "completed").length,
  useDownloadStore: (selector: (state: { items: Array<{ status: string }> }) => unknown) =>
    selector({ items: [] }),
}));

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "steam-neon-circuit",
    title: "Neon Circuit",
    slug: "neon-circuit",
    description: "",
    externalId: "480",
    version: "1.0",
    status: "installed",
    platform: "windows",
    launcher: "steam",
    ...overrides,
  };
}

function LibraryRoute({ initialEntry }: { initialEntry: string }) {
  return (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Suspense fallback={null}>
        <Routes>
          <Route
            element={
              <>
                <LibraryPage />
                <LibraryRouteProbe />
              </>
            }
            path="/library"
          />
          <Route element={<FriendsRouteProbe />} path="/friends" />
          <Route element={<DownloadsRouteProbe />} path="/downloads" />
        </Routes>
      </Suspense>
    </MemoryRouter>
  );
}

function renderLibraryRoute(initialEntry: string) {
  return render(<LibraryRoute initialEntry={initialEntry} />);
}

function LibraryRouteProbe() {
  const location = useLocation();

  return (
    <div data-testid="library-route">
      {location.pathname}
      {location.search}
    </div>
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

function DownloadsRouteProbe() {
  const location = useLocation();

  return <div data-testid="downloads-route">{location.pathname}</div>;
}

describe("LibraryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.isTauri.mockReturnValue(true);
    launchCrossPlayJoinMock.mockResolvedValue("steam://run/480");
    shareTokenMocks.resolveShareToken.mockResolvedValue({
      expiresAt: "2026-07-15T12:30:00.000Z",
      gameInviteId: "invite-id",
      gameTitle: "Neon Circuit",
      platform: "steam",
    });
    shareTokenMocks.redeemShareToken.mockResolvedValue({
      acceptedAt: "2026-07-15T12:00:00.000Z",
      gameInviteId: "invite-id",
      gameTitle: "Neon Circuit",
      platform: "steam",
      status: "accepted",
    });
    useLibrarySyncMock.mockReturnValue(makeLibrarySyncResult());
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

  it("keeps a game deep-link while a stale non-empty snapshot is still hydrating", async () => {
    const initialEntry = "/library?game=steam-requested&verify=keep-me";
    useLibrarySyncMock.mockReturnValue(
      makeLibrarySyncResult({
        installedGames: [makeGame({ id: "steam-stale" })],
        hasCompletedInitialLibraryLoad: false,
        isDiscoveringGames: false,
        shouldShowLibraryLoading: false,
      }),
    );
    const view = renderLibraryRoute(initialEntry);

    await act(async () => {
      await Promise.resolve();
    });

    expect(setPendingSelectedGameIdMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("library-route")).toHaveTextContent(initialEntry);

    useLibrarySyncMock.mockReturnValue(
      makeLibrarySyncResult({
        installedGames: [makeGame({ id: "steam-requested" })],
        hasCompletedInitialLibraryLoad: true,
      }),
    );
    view.rerender(<LibraryRoute initialEntry={initialEntry} />);

    await waitFor(() => {
      expect(setPendingSelectedGameIdMock).toHaveBeenCalledWith("steam-requested");
      expect(screen.getByTestId("library-route")).toHaveTextContent("/library?verify=keep-me");
    });
    expect(screen.getByRole("status", { name: /library status/i })).toBeEmptyDOMElement();
  });

  it("launches a requested game once and preserves unrelated query state", async () => {
    const requestedGame = makeGame({ id: "steam-requested" });
    const initialEntry = "/library?game=steam-requested&action=play&verify=keep-me";
    useLibrarySyncMock.mockReturnValue(makeLibrarySyncResult({ installedGames: [requestedGame] }));
    const view = renderLibraryRoute(initialEntry);

    await waitFor(() => {
      expect(handlePlayVariantMock).toHaveBeenCalledWith(requestedGame);
      expect(screen.getByTestId("library-route")).toHaveTextContent("/library?verify=keep-me");
    });

    useLibrarySyncMock.mockReturnValue(
      makeLibrarySyncResult({ installedGames: [{ ...requestedGame }] }),
    );
    view.rerender(<LibraryRoute initialEntry={initialEntry} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(handlePlayVariantMock).toHaveBeenCalledTimes(1);
  });

  it("waits for startup library discovery before consuming a cross-play join", async () => {
    const initialEntry = "/library?join=Neon%20Circuit&platform=steam&invite=invite-1";
    useLibrarySyncMock.mockReturnValue(
      makeLibrarySyncResult({
        installedGames: [],
        isDiscoveringGames: true,
        shouldShowLibraryLoading: true,
      }),
    );
    const view = renderLibraryRoute(initialEntry);

    await act(async () => {
      await Promise.resolve();
    });

    expect(launchCrossPlayJoinMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("library-route")).toHaveTextContent(
      "/library?join=Neon%20Circuit&platform=steam&invite=invite-1",
    );

    useLibrarySyncMock.mockReturnValue(makeLibrarySyncResult({ installedGames: [makeGame()] }));
    view.rerender(<LibraryRoute initialEntry={initialEntry} />);

    await waitFor(() => {
      expect(launchCrossPlayJoinMock).toHaveBeenCalledWith("steam", "480");
    });
    expect(shareTokenMocks.resolveShareToken).toHaveBeenCalledWith("invite-1");
    expect(shareTokenMocks.redeemShareToken).toHaveBeenCalledWith("invite-1");
    expect(launchCrossPlayJoinMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("library-route")).toHaveTextContent(/^\/library$/);
  });

  it("claims and clears a join query before a pending launch can be repeated", async () => {
    const initialEntry = "/library?join=neon-circuit&platform=steam&invite=invite-2&verify=keep-me";
    launchCrossPlayJoinMock.mockReturnValue(new Promise<string>(() => undefined));
    useLibrarySyncMock.mockReturnValue(makeLibrarySyncResult({ installedGames: [makeGame()] }));
    const view = renderLibraryRoute(initialEntry);

    await waitFor(() => {
      expect(launchCrossPlayJoinMock).toHaveBeenCalledTimes(1);
    });

    useLibrarySyncMock.mockReturnValue(
      makeLibrarySyncResult({ installedGames: [{ ...makeGame() }] }),
    );
    view.rerender(<LibraryRoute initialEntry={initialEntry} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(launchCrossPlayJoinMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("library-route")).toHaveTextContent("/library?verify=keep-me");
  });

  it("does not launch a matching library entry that is not installed", async () => {
    useLibrarySyncMock.mockReturnValue(
      makeLibrarySyncResult({
        installedGames: [makeGame({ status: "not_installed" })],
      }),
    );

    renderLibraryRoute("/library?join=neon-circuit&platform=steam");

    await waitFor(() => {
      expect(screen.getByTestId("library-route")).toHaveTextContent(/^\/library$/);
    });
    expect(launchCrossPlayJoinMock).not.toHaveBeenCalled();
  });

  it("selects the requested provider variant and launches its external id", async () => {
    useLibrarySyncMock.mockReturnValue(
      makeLibrarySyncResult({
        installedGames: [
          makeGame({ externalId: "EpicCatalogItem", id: "epic-neon", launcher: "epic" }),
          makeGame({ externalId: "480", id: "steam-neon", launcher: "steam" }),
        ],
      }),
    );

    renderLibraryRoute("/library?join=Neon%20Circuit&platform=steam");

    await waitFor(() => {
      expect(launchCrossPlayJoinMock).toHaveBeenCalledWith("steam", "480");
    });
    expect(launchCrossPlayJoinMock).toHaveBeenCalledTimes(1);
  });

  it("does not fall back to an internal wrapper id when externalId is missing", async () => {
    useLibrarySyncMock.mockReturnValue(
      makeLibrarySyncResult({
        installedGames: [makeGame({ externalId: undefined, id: "steam-owned-480" })],
      }),
    );

    renderLibraryRoute("/library?join=Neon%20Circuit&platform=steam");

    await waitFor(() => {
      expect(screen.getByRole("status", { name: /library status/i })).toHaveTextContent(
        /missing exact provider launch identity/i,
      );
    });
    expect(launchCrossPlayJoinMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid invite without opening a provider game", async () => {
    shareTokenMocks.resolveShareToken.mockResolvedValue(null);
    useLibrarySyncMock.mockReturnValue(makeLibrarySyncResult({ installedGames: [makeGame()] }));

    renderLibraryRoute("/library?join=Neon%20Circuit&platform=steam&invite=expired-token");

    await waitFor(() => {
      expect(screen.getByRole("status", { name: /library status/i })).toHaveTextContent(
        /invalid, expired, or already used/i,
      );
    });
    expect(shareTokenMocks.redeemShareToken).not.toHaveBeenCalled();
    expect(launchCrossPlayJoinMock).not.toHaveBeenCalled();
  });

  it("accepts a valid invite but honestly reports that only the provider game was opened", async () => {
    useLibrarySyncMock.mockReturnValue(makeLibrarySyncResult({ installedGames: [makeGame()] }));

    renderLibraryRoute("/library?join=Tampered%20Title&platform=epic&invite=valid-token");

    await waitFor(() => {
      expect(screen.getByRole("status", { name: /library status/i })).toHaveTextContent(
        /invite accepted\. opened neon circuit on steam/i,
      );
    });
    expect(screen.getByRole("status", { name: /library status/i })).toHaveTextContent(
      /does not contain a provider session target/i,
    );
    expect(launchCrossPlayJoinMock).toHaveBeenCalledWith("steam", "480");
  });

  it("reserves shell space for the footer instead of clipping it below the full-height grid", () => {
    const { container } = renderLibraryRoute("/library");

    const shell = container.querySelector(".library-steam-shell");
    const contentGrid = shell?.firstElementChild;
    const footer = screen.getByRole("contentinfo");

    expect(shell).toHaveClass("flex", "h-full", "min-h-0", "flex-col", "overflow-hidden");
    expect(contentGrid).toHaveClass("grid", "min-h-0", "flex-1");
    expect(contentGrid).not.toHaveClass("h-full");
    expect(footer).toHaveClass("h-10", "shrink-0");
  });

  it("opens and closes the footer Friends & Chat popup without leaving the library", async () => {
    renderLibraryRoute("/library");

    fireEvent.click(screen.getByRole("button", { name: /friends & chat \+/i }));

    expect(await screen.findByRole("dialog", { name: /friends and chat/i })).toBeVisible();
    expect(screen.getByTestId("library-route")).toHaveTextContent("/library");

    fireEvent.click(screen.getByRole("button", { name: /close friends and chat/i }));

    expect(screen.queryByRole("dialog", { name: /friends and chat/i })).not.toBeInTheDocument();
  });

  it("routes the footer Downloads control to the downloads page", () => {
    renderLibraryRoute("/library");

    fireEvent.click(screen.getByRole("button", { name: /downloads - 0 of 0 items complete/i }));

    expect(screen.getByTestId("downloads-route")).toHaveTextContent("/downloads");
  });

  it("marks Add a Game desktop-only and disables it in the browser", () => {
    tauriMocks.isTauri.mockReturnValue(false);

    renderLibraryRoute("/library");

    const addGameButton = screen.getByRole("button", {
      name: /add a game — desktop only/i,
    });
    expect(addGameButton).toBeDisabled();
    expect(addGameButton).toHaveAttribute(
      "title",
      "Adding local games requires the OG-Launcher desktop app.",
    );
  });
});
