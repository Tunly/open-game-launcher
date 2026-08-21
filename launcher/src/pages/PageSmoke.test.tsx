import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";

import { AchievementsPage } from "./AchievementsPage";
import { AuthPage } from "./AuthPage";
import { DeveloperPortalPage } from "./DeveloperPortalPage";
import { DownloadsPage } from "./DownloadsPage";
import { EditProfilePage } from "./EditProfilePage";
import { FamilyPage } from "./FamilyPage";
import { FpsHudPage } from "./FpsHudPage";
import { FriendsPage } from "./FriendsPage";
import { GameActivityDashboardPage } from "./GameActivityDashboardPage";
import { InviteFallbackPage } from "./InviteFallbackPage";
import { LibraryPage } from "./LibraryPage";
import { NewsPage } from "./NewsPage";
import { NotFoundPage } from "./NotFoundPage";
import { OverlayPage } from "./OverlayPage";
import { PerfHistoryPage } from "./PerfHistoryPage";
import { PrivacySettingsPage } from "./PrivacySettingsPage";
import { ProfileCustomizePage } from "./ProfileCustomizePage";
import { ProfilePage } from "./ProfilePage";
import { SettingsPage } from "./SettingsPage";
import { StorePage } from "./StorePage";
import type { NewsItem } from "../lib/types/news";
import type { RealtimeMetrics } from "../lib/types/performance";
import { writeActivePerformanceGameContext } from "../lib/performance-context";
import { ACTIVE_GAME_PERFORMANCE_POLL_INTERVAL_MS } from "../lib/performance-polling";

const currentUserMock = vi.hoisted(() => vi.fn());
const useUserPlaySessionsMock = vi.hoisted(() => vi.fn());

const familyMocks = vi.hoisted(() => ({
  createFamilyGroup: vi.fn(),
  getMyFamilyGroup: vi.fn(),
  joinFamilyGroup: vi.fn(),
  listFamilyMembers: vi.fn(),
  listFamilySharedGames: vi.fn(),
}));

const launcherMocks = vi.hoisted(() => ({
  archiveDownload: vi.fn(),
  authenticateEpicLegendary: vi.fn(),
  cancelDownload: vi.fn(),
  detectHardwareInfo: vi.fn(),
  eaGetToken: vi.fn(),
  eaLogout: vi.fn(),
  fetchSteamProfileName: vi.fn(),
  fetchUbisoftOwnedGames: vi.fn(),
  fetchXboxOwnedGames: vi.fn(),
  getDownloadQueue: vi.fn(),
  getDownloadSettings: vi.fn(),
  getSystemInfo: vi.fn(),
  gogExchangeCode: vi.fn(),
  gogGetToken: vi.fn(),
  gogLogout: vi.fn(),
  launchCrossPlayJoin: vi.fn(),
  launchGame: vi.fn(),
  listInstalledGames: vi.fn(),
  openBattleNetLoginWindow: vi.fn(),
  openEaLoginWindow: vi.fn(),
  openEpicLoginWindow: vi.fn(),
  openGogLoginWindow: vi.fn(),
  openSteamLoginWindow: vi.fn(),
  openXboxLoginWindow: vi.fn(),
  pauseDownload: vi.fn(),
  processBattleNetGamesPayload: vi.fn(),
  scanLocalPluginManifests: vi.fn(),
  stageSignedPluginPackage: vi.fn(),
}));

const newsMocks = vi.hoisted(() => ({
  listPublishedNews: vi.fn(),
}));

const achievementMocks = vi.hoisted(() => ({
  hydrateGamesWithRemoteAchievements: vi.fn(),
}));

const storeMocks = vi.hoisted(() => ({
  addToStoreWishlist: vi.fn(),
  createStoreCheckout: vi.fn(),
  getMyStoreReview: vi.fn(),
  listMyStoreReviewReports: vi.fn(),
  listMyStoreWishlist: vi.fn(),
  listPublishedProducts: vi.fn(),
  listPublishedProductsPage: vi.fn(),
  listStoreProductReviews: vi.fn(),
  listStoreReviewReplies: vi.fn(),
  removeFromStoreWishlist: vi.fn(),
  reportStoreReview: vi.fn(),
  submitDeveloperApplication: vi.fn(),
  upsertStoreReview: vi.fn(),
  upsertStoreReviewReply: vi.fn(),
}));

const catalogQueryMocks = vi.hoisted(() => ({
  queryCatalogPage: vi.fn(),
}));

const storeApiMocks = vi.hoisted(() => ({
  listApiStoreProducts: vi.fn(),
}));

const performanceMocks = vi.hoisted(() => ({
  listPerformanceSessions: vi.fn(),
  listPerformanceSnapshots: vi.fn(),
  savePerformanceSession: vi.fn(),
  savePerformanceSnapshotFromMetrics: vi.fn(),
}));

const friendLinkMocks = vi.hoisted(() => ({
  getMyFriendLinks: vi.fn(),
}));

const presenceMocks = vi.hoisted(() => ({
  getVisiblePresence: vi.fn(),
  subscribeToPresenceChanges: vi.fn(),
}));

const socialMocks = vi.hoisted(() => ({
  getDirectThread: vi.fn(),
  getGroupMessages: vi.fn(),
  getMyGameInvites: vi.fn(),
  getMyGroupChats: vi.fn(),
  proveInviteHostedReplay: vi.fn(),
  redeemShareToken: vi.fn(),
  resolveShareToken: vi.fn(),
  sendDirectMessage: vi.fn(),
  sendGameInvite: vi.fn(),
  sendGroupMessage: vi.fn(),
  subscribeToGameInvites: vi.fn(),
  subscribeToGroupMessages: vi.fn(),
  subscribeToRoomMessages: vi.fn(),
  updateGameInviteStatus: vi.fn(),
}));

const noop = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

vi.mock("../components/launcher/StoreGameCard", () => ({
  StoreGameCard: ({ game }: { game: { title: string } }) => <article>{game.title}</article>,
}));

vi.mock("../components/library/AddGameDialog", () => ({
  AddGameDialog: () => null,
}));

vi.mock("../components/library/GameDetails", () => ({
  GameDetails: (props: { verifyMode?: string | null }) => (
    <section aria-label="Game detail panel mock" data-verify-mode={props.verifyMode ?? "null"} />
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

vi.mock("../components/profile/ProfileCustomizeForm", () => ({
  ProfileCustomizeForm: () => <section aria-label="Profile customize form mock" />,
}));

vi.mock("../components/profile/ProfileThemePreview", () => ({
  ProfileThemePreview: ({ theme }: { theme: { name: string } }) => (
    <section aria-label="Profile theme preview mock">{theme.name}</section>
  ),
}));

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: currentUserMock,
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
    hasCompletedInitialLibraryLoad: true,
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
  useProviderPicking: () => ({
    handleInstallFromProvider: noop,
    handlePlay: noop,
    handlePlayVariant: noop,
    providerPicker: null,
    setProviderPicker: noop,
  }),
}));

vi.mock("../hooks/useUserPlaySessions", () => ({
  useUserPlaySessions: useUserPlaySessionsMock,
}));

vi.mock("../lib/launcher", () => launcherMocks);

vi.mock("../lib/supabase/achievements", () => achievementMocks);

vi.mock("../lib/supabase/client", () => ({
  clearSupabaseAuthCache: vi.fn(),
  getCurrentSessionUserId: vi.fn(() => Promise.resolve(null)),
  getCurrentSupabaseUser: vi.fn(() => Promise.resolve(null)),
  getSupabaseClient: vi.fn(() => {
    return {
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: null } })),
      },
      functions: {
        invoke: vi.fn(() => Promise.resolve({ data: null, error: null })),
      },
    };
  }),
  isSupabaseConfigured: false,
  requireCurrentSessionUserId: vi.fn(() => Promise.reject(new Error("You must be signed in."))),
  requireCurrentSupabaseUser: vi.fn(() => Promise.reject(new Error("You must be signed in."))),
  supabase: null,
  supabaseConfigError: "Missing Supabase environment variables.",
}));

vi.mock("../lib/supabase/family", () => familyMocks);

vi.mock("../lib/supabase/friend-links", () => friendLinkMocks);

vi.mock("../lib/supabase/news", () => newsMocks);

vi.mock("../lib/supabase/presence", () => presenceMocks);

vi.mock("../lib/supabase/performance", () => performanceMocks);

vi.mock("../lib/supabase/store", () => storeMocks);
vi.mock("../lib/store-api", () => storeApiMocks);
vi.mock("../lib/supabase/catalog-query", () => ({
  queryCatalogPage: catalogQueryMocks.queryCatalogPage,
}));

vi.mock("../lib/supabase/social", () => socialMocks);

vi.mock("../stores/downloadStore", () => {
  const state = {
    items: [],
    removeItem: vi.fn(),
    setItems: vi.fn(),
    upsertItem: vi.fn(),
  };
  const useDownloadStore = (selector: (value: typeof state) => unknown) => selector(state);
  useDownloadStore.getState = () => state;

  return {
    isActiveDownloadItem: (item: { status?: string }) =>
      item.status === "downloading" || item.status === "queued",
    isPausedDownloadItem: (item: { status?: string }) => item.status === "paused",
    selectActiveCount: (value: { items: Array<{ status: string }> }) =>
      value.items.filter((item) => item.status === "downloading" || item.status === "queued")
        .length,
    selectCompletedCount: (value: { items: Array<{ status: string }> }) =>
      value.items.filter((item) => item.status === "completed").length,
    selectTotalProgress: () => 0,
    useDownloadStore,
  };
});

function renderRoute(ui: ReactNode, initialEntry = "/") {
  return render(<MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>);
}

import { Suspense } from "react";

function renderRoutedPage(ui: ReactNode, path: string, initialEntry = path) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Suspense fallback={null}>
        <Routes>
          <Route element={ui} path={path} />
        </Routes>
      </Suspense>
    </MemoryRouter>,
  );
}

function renderProfileRoute(initialEntry = "/u/daniel") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<ProfilePage />} path="/u/:username" />
      </Routes>
    </MemoryRouter>,
  );
}

const newsItem: NewsItem = {
  authorId: "author-1",
  body: "The local news relay is rendering a live-looking bulletin from mocked Supabase data.",
  coverImageUrl: null,
  createdAt: "2026-06-11T09:00:00.000Z",
  excerpt: "The local news relay is rendering from mocked Supabase data.",
  gameId: null,
  id: "news-1",
  isPublished: true,
  publishedAt: "2026-06-11T09:00:00.000Z",
  slug: "mock-news-relay",
  tags: ["Patch", "Relay"],
  title: "Mock News Relay",
  updatedAt: "2026-06-11T09:00:00.000Z",
};

const metrics: RealtimeMetrics = {
  cpuPercent: 28,
  fps: 61,
  frameTimeMs: 16.4,
  fpsSource: "hud_webview",
  gpuPercent: 42,
  gpuTempC: 64,
  gpuVramMb: 4096,
  ramMb: 8192,
  uptime: "00:10:00",
};

function pollPerformanceMetricCallCount() {
  return vi.mocked(invoke).mock.calls.filter(([command]) => command === "poll_performance_metrics")
    .length;
}

function overlayClickThroughCallCount() {
  return vi
    .mocked(invoke)
    .mock.calls.filter(([command]) => command === "set_in_game_overlay_click_through").length;
}

describe("routed page smoke coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    currentUserMock.mockReturnValue({
      error: null,
      isConfigured: false,
      isLoading: false,
      session: null,
      signOut: vi.fn(),
      user: null,
    });
    useUserPlaySessionsMock.mockReturnValue({
      error: null,
      isConfigured: false,
      isLoading: false,
      refetch: vi.fn(),
      sessions: [],
    });
    familyMocks.createFamilyGroup.mockResolvedValue(null);
    familyMocks.getMyFamilyGroup.mockResolvedValue(null);
    familyMocks.joinFamilyGroup.mockResolvedValue(null);
    familyMocks.listFamilyMembers.mockResolvedValue([]);
    familyMocks.listFamilySharedGames.mockResolvedValue([]);
    launcherMocks.archiveDownload.mockResolvedValue(undefined);
    launcherMocks.authenticateEpicLegendary.mockResolvedValue("Epic authenticated.");
    launcherMocks.cancelDownload.mockResolvedValue(undefined);
    launcherMocks.detectHardwareInfo.mockResolvedValue(null);
    launcherMocks.eaGetToken.mockResolvedValue(null);
    launcherMocks.eaLogout.mockResolvedValue(undefined);
    launcherMocks.fetchSteamProfileName.mockResolvedValue("Steam User");
    launcherMocks.fetchUbisoftOwnedGames.mockResolvedValue([]);
    launcherMocks.fetchXboxOwnedGames.mockResolvedValue({ games: [], gamertag: "Xbox User" });
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.getDownloadSettings.mockResolvedValue({
      bandwidthLimitKbps: 0,
      maxConcurrentDownloads: 2,
    });
    launcherMocks.getSystemInfo.mockResolvedValue({
      appVersion: "0.1.0",
      arch: "web",
      os: "Browser Preview",
    });
    launcherMocks.gogExchangeCode.mockResolvedValue({ accessToken: "token" });
    launcherMocks.gogGetToken.mockResolvedValue(null);
    launcherMocks.gogLogout.mockResolvedValue(undefined);
    launcherMocks.launchCrossPlayJoin.mockResolvedValue(undefined);
    launcherMocks.launchGame.mockResolvedValue(undefined);
    launcherMocks.listInstalledGames.mockResolvedValue([]);
    launcherMocks.openBattleNetLoginWindow.mockResolvedValue(undefined);
    launcherMocks.openEaLoginWindow.mockResolvedValue(undefined);
    launcherMocks.openEpicLoginWindow.mockResolvedValue(undefined);
    launcherMocks.openGogLoginWindow.mockResolvedValue(undefined);
    launcherMocks.openSteamLoginWindow.mockResolvedValue(undefined);
    launcherMocks.openXboxLoginWindow.mockResolvedValue(undefined);
    launcherMocks.pauseDownload.mockResolvedValue(undefined);
    launcherMocks.processBattleNetGamesPayload.mockResolvedValue([]);
    newsMocks.listPublishedNews.mockResolvedValue([newsItem]);
    achievementMocks.hydrateGamesWithRemoteAchievements.mockImplementation((games) =>
      Promise.resolve(games),
    );
    storeMocks.addToStoreWishlist.mockResolvedValue(undefined);
    storeApiMocks.listApiStoreProducts.mockResolvedValue([]);
    storeMocks.createStoreCheckout.mockResolvedValue({ id: null, status: "fulfilled", url: null });
    storeMocks.getMyStoreReview.mockResolvedValue(null);
    storeMocks.listMyStoreReviewReports.mockResolvedValue([]);
    storeMocks.listMyStoreWishlist.mockResolvedValue([]);
    storeMocks.listPublishedProducts.mockResolvedValue([]);
    storeMocks.listPublishedProductsPage.mockResolvedValue([]);
    catalogQueryMocks.queryCatalogPage.mockResolvedValue({
      products: [],
      hasMore: false,
      bothFailed: false,
      hostedCount: 0,
      catalogCount: 0,
    });
    storeMocks.listStoreProductReviews.mockResolvedValue([]);
    storeMocks.listStoreReviewReplies.mockResolvedValue([]);
    storeMocks.removeFromStoreWishlist.mockResolvedValue(undefined);
    storeMocks.reportStoreReview.mockResolvedValue(undefined);
    storeMocks.submitDeveloperApplication.mockResolvedValue(null);
    storeMocks.upsertStoreReview.mockResolvedValue(null);
    storeMocks.upsertStoreReviewReply.mockResolvedValue(null);
    performanceMocks.listPerformanceSessions.mockResolvedValue([]);
    performanceMocks.listPerformanceSnapshots.mockResolvedValue([]);
    performanceMocks.savePerformanceSession.mockResolvedValue(true);
    performanceMocks.savePerformanceSnapshotFromMetrics.mockResolvedValue(undefined);
    friendLinkMocks.getMyFriendLinks.mockResolvedValue([]);
    presenceMocks.getVisiblePresence.mockResolvedValue([]);
    presenceMocks.subscribeToPresenceChanges.mockReturnValue(() => undefined);
    socialMocks.getDirectThread.mockResolvedValue({
      room: {
        createdAt: "2026-06-22T00:00:00.000Z",
        createdBy: "user-1",
        id: "room-1",
        name: null,
        type: "dm",
        updatedAt: "2026-06-22T00:00:00.000Z",
      },
      messages: [],
    });
    socialMocks.getMyGameInvites.mockResolvedValue([]);
    socialMocks.getGroupMessages.mockResolvedValue([]);
    socialMocks.getMyGroupChats.mockResolvedValue([]);
    socialMocks.proveInviteHostedReplay.mockResolvedValue(null);
    socialMocks.redeemShareToken.mockResolvedValue(null);
    socialMocks.resolveShareToken.mockResolvedValue(null);
    socialMocks.sendDirectMessage.mockResolvedValue(null);
    socialMocks.sendGameInvite.mockResolvedValue(null);
    socialMocks.sendGroupMessage.mockResolvedValue(null);
    socialMocks.subscribeToGameInvites.mockReturnValue(() => undefined);
    socialMocks.subscribeToGroupMessages.mockReturnValue(() => undefined);
    socialMocks.subscribeToRoomMessages.mockReturnValue(() => undefined);
    socialMocks.updateGameInviteStatus.mockResolvedValue(null);
    vi.mocked(isTauri).mockReturnValue(false);
    vi.mocked(invoke).mockResolvedValue(metrics);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
    window.localStorage.clear();
  });

  it("renders the documented library route shell", async () => {
    renderRoutedPage(<LibraryPage />, "/library");

    expect(
      screen.getByRole("complementary", { name: /library sidebar mock/i }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("region", { name: /game detail panel mock/i })).toHaveAttribute(
        "data-verify-mode",
        "null",
      );
    });
  });

  it("renders a usable local store catalog when no hosted products are published", async () => {
    renderRoutedPage(<StorePage />, "/store");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(catalogQueryMocks.queryCatalogPage).toHaveBeenCalled();
    });
    expect((await screen.findAllByText(/^STORE$/i)).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Void Harvest|Petal & Ash|Dungeon Post|Crimson Circuit/i).length,
    ).toBeGreaterThan(0);
  });

  it("renders the downloads queue route", async () => {
    renderRoutedPage(<DownloadsPage />, "/downloads");

    expect(screen.getByText(/queue clear/i)).toBeInTheDocument();
    expect(launcherMocks.getDownloadQueue).not.toHaveBeenCalled();
  });

  it("renders the yearly activity route", () => {
    renderRoutedPage(<GameActivityDashboardPage />, "/activity");

    expect(screen.getByRole("region", { name: /game activity dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/local activity relay/i)).toBeInTheDocument();
  });

  it("renders the route-missing fallback", () => {
    renderRoute(<NotFoundPage />);

    expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(screen.getByText("Page Not Found")).toBeInTheDocument();
  });

  it("renders the auth account form", () => {
    renderRoute(<AuthPage />);

    expect(screen.getByRole("heading", { name: /launcher account/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /login/i })).toBeInTheDocument();
  });

  it("renders the invite web fallback route", () => {
    renderRoutedPage(<InviteFallbackPage />, "/invite/:token", "/invite/local-token");

    expect(screen.getByRole("heading", { name: /join session/i })).toBeInTheDocument();
    expect(screen.getByText(/open og launcher/i)).toBeInTheDocument();
  });

  it("renders the developer portal intake form", () => {
    renderRoute(<DeveloperPortalPage />);

    expect(screen.getByRole("heading", { name: /developer portal/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Studio Name")).toBeInTheDocument();
  });

  it("submits the developer portal intake form", async () => {
    renderRoute(<DeveloperPortalPage />);

    const submitButton = screen.getByRole("button", { name: /submit application/i });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Studio Name"), {
      target: { value: "Redline Studio" },
    });
    expect(submitButton).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Website"), {
      target: { value: "https://redline.example" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Arcade launch plan" },
    });
    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(storeMocks.submitDeveloperApplication).toHaveBeenCalledWith({
        studioName: "Redline Studio",
        website: "https://redline.example",
        description: "Arcade launch plan",
      }),
    );
    expect(await screen.findByText("Application queued")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /review pending/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Studio Name")).not.toBeInTheDocument();
  });

  it("keeps developer portal intake form state after submit errors", async () => {
    storeMocks.submitDeveloperApplication.mockRejectedValueOnce(
      new Error("Supabase is not configured."),
    );
    renderRoute(<DeveloperPortalPage />);

    fireEvent.change(screen.getByLabelText("Studio Name"), {
      target: { value: "  Redline Studio  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit application/i }));

    await waitFor(() =>
      expect(storeMocks.submitDeveloperApplication).toHaveBeenCalledWith({
        studioName: "Redline Studio",
        website: null,
        description: null,
      }),
    );
    expect(await screen.findByText("Supabase is not configured.")).toBeInTheDocument();
    expect(screen.getByLabelText("Studio Name")).toHaveValue("  Redline Studio  ");
    expect(screen.queryByRole("heading", { name: /review pending/i })).not.toBeInTheDocument();
  });

  it("renders family sharing after the empty relay load", async () => {
    renderRoute(<FamilyPage />);

    expect(await screen.findByRole("heading", { name: /family sharing/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /create family group/i })).toBeInTheDocument();
  });

  it("renders mocked news feed data", async () => {
    renderRoute(<NewsPage />);

    expect(await screen.findByRole("heading", { name: /news feed/i })).toBeInTheDocument();
    expect(screen.getAllByText("Mock News Relay").length).toBeGreaterThan(0);
  });

  it("renders the achievements archive empty state", async () => {
    renderRoute(<AchievementsPage />);

    expect(await screen.findByText("No achievement-enabled games found.")).toBeInTheDocument();
    expect(screen.queryByText("Cache Folder")).not.toBeInTheDocument();
  });

  it("renders realtime metrics in the FPS HUD", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "get_overlay_settings") {
        return Promise.resolve({
          fpsHudEnabled: true,
          opacity: 0.95,
          showGpu: true,
        });
      }
      return Promise.resolve(metrics);
    });
    writeActivePerformanceGameContext({
      gameId: "page-smoke-game",
      gameTitle: "Page Smoke Game",
      launcher: "steam",
    });

    renderRoute(<FpsHudPage />);

    expect(await screen.findByText("61 FPS")).toBeInTheDocument();
    expect(screen.getByText("28% System CPU")).toBeInTheDocument();
    expect(screen.getByText("42% System GPU")).toBeInTheDocument();
  });

  it("renders browser preview metrics in the FPS HUD without native invokes", async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    vi.mocked(invoke).mockClear();

    renderRoute(<FpsHudPage />);

    expect(await screen.findByText("Browser Preview")).toBeInTheDocument();
    expect(screen.getByText("66 FPS")).toBeInTheDocument();
    expect(screen.getByText("42% System CPU")).toBeInTheDocument();
    expect(screen.getByText("58% System GPU")).toBeInTheDocument();
    expect(screen.queryByText("•••")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("renders the offline social board", () => {
    renderRoute(<FriendsPage />, "/friends");

    expect(screen.getByRole("heading", { name: /friends/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /offline social board/i })).toBeInTheDocument();
    expect(screen.getByText("Local Only")).toBeInTheDocument();
  });

  it("renders the settings panel route", async () => {
    renderRoutedPage(<SettingsPage />, "/settings");

    expect(screen.getByRole("heading", { name: /settings panel/i })).toBeInTheDocument();
  });

  it("renders the edit profile settings route", async () => {
    renderRoutedPage(<EditProfilePage />, "/settings/profile");

    expect(await screen.findByRole("heading", { name: /edit profile/i })).toBeInTheDocument();
    expect(screen.getByText(/save local draft/i)).toBeInTheDocument();
  });

  it("renders the profile customization settings route", async () => {
    renderRoutedPage(<ProfileCustomizePage />, "/settings/profile/customize");

    expect(await screen.findByRole("heading", { name: /customize profile/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /browser-only shell skin/i })).toBeInTheDocument();
  });

  it("renders the performance settings route", () => {
    renderRoutedPage(<PerfHistoryPage />, "/settings/performance");

    expect(screen.getByRole("heading", { name: /perf history/i })).toBeInTheDocument();
    expect(screen.getByText(/local performance preview/i)).toBeInTheDocument();
  });

  it("renders the privacy settings route", async () => {
    renderRoutedPage(<PrivacySettingsPage />, "/settings/privacy");

    expect(screen.getByRole("heading", { name: /privacy deck/i })).toBeInTheDocument();
    expect(await screen.findByText(/local privacy preview/i)).toBeInTheDocument();
  });

  it("renders the local fallback profile route", async () => {
    renderProfileRoute();

    expect(await screen.findByText(/local profile relay active/i)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: /daniel prime/i }).length).toBeGreaterThan(0);
  });

  it("renders the overlay dock shell", () => {
    renderRoute(<OverlayPage />);

    expect(screen.getByText("OG-Launcher")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Friends" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Screenshots" })).not.toBeInTheDocument();
  });

  it("does not offer a dead FPS HUD action in the anti-cheat fallback", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "get_overlay_settings") {
        return Promise.resolve({ fpsHudEnabled: false });
      }
      if (command === "detect_anti_cheat_processes") {
        return Promise.resolve([
          { blocks_overlay: true, name: "Test Guard", process_name: "guard.exe" },
        ]);
      }
      return Promise.resolve(undefined);
    });

    renderRoute(<OverlayPage />);

    expect(await screen.findByText("Safety Fallback")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Toggle FPS HUD" })).not.toBeInTheDocument();
    expect(screen.getByText(/fps hud is disabled/i)).toBeInTheDocument();
  });

  it("loads existing messages when an overlay group chat opens", async () => {
    currentUserMock.mockReturnValue({
      error: null,
      isConfigured: true,
      isLoading: false,
      session: null,
      signOut: vi.fn(),
      user: { id: "user-1" },
    });
    socialMocks.getMyGroupChats.mockResolvedValue([
      {
        memberCount: 2,
        room: {
          createdAt: "2026-06-22T00:00:00.000Z",
          createdBy: "user-1",
          id: "group-1",
          name: "Night Shift",
          type: "group",
          updatedAt: "2026-06-22T00:00:00.000Z",
        },
      },
    ]);
    socialMocks.getGroupMessages.mockResolvedValue([
      {
        content: "Earlier message",
        createdAt: "2026-06-22T00:01:00.000Z",
        deletedAt: null,
        id: "message-1",
        roomId: "group-1",
        senderId: "friend-1",
        updatedAt: "2026-06-22T00:01:00.000Z",
      },
    ]);

    renderRoute(<OverlayPage />);
    fireEvent.click(screen.getByRole("button", { name: "Chat" }));

    expect(await screen.findByText("Earlier message")).toBeInTheDocument();
    expect(socialMocks.getGroupMessages).toHaveBeenCalledWith("group-1");
    expect(socialMocks.subscribeToGroupMessages).toHaveBeenCalledWith(
      "group-1",
      expect.any(Function),
    );
  });

  it("makes the external overlay click-through while only pinned panels remain", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "get_overlay_settings") {
        return Promise.resolve({
          fpsHudEnabled: false,
          isEnabled: true,
          opacity: 0.95,
          position: "bottom_right",
          showGpu: true,
        });
      }
      if (command === "detect_anti_cheat_processes") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    renderRoute(<OverlayPage />);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_in_game_overlay_click_through", {
        enabled: false,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Friends" }));
    fireEvent.click(await screen.findByTitle("Pin panel"));
    fireEvent.click(screen.getByRole("button", { name: "Back to Game" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_in_game_overlay_click_through", {
        enabled: true,
      }),
    );
    const clickThroughCalls = overlayClickThroughCallCount();
    fireEvent.resize(window);
    await waitFor(() => expect(overlayClickThroughCallCount()).toBe(clickThroughCalls));
    expect(screen.queryByRole("button", { name: "Back to Game" })).not.toBeInTheDocument();
    expect(screen.getByTitle("Unpin")).toBeInTheDocument();
  });

  it("uses presence platform IDs for joins and sends invites without native prompts", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Native Prompt Game");
    currentUserMock.mockReturnValue({
      error: null,
      isConfigured: true,
      isLoading: false,
      session: null,
      signOut: vi.fn(),
      user: { id: "user-1" },
    });
    friendLinkMocks.getMyFriendLinks.mockResolvedValue([
      {
        createdAt: "2026-06-22T00:00:00.000Z",
        dismissed: false,
        id: "link-1",
        matchMethod: "manual",
        matchedUserId: "friend-1",
        mergeGroupId: null,
        ownerId: "user-1",
        platform: "steam",
        platformFriendAvatar: null,
        platformFriendId: "steam-friend-1",
        platformFriendName: "Arcade Rival",
        updatedAt: "2026-06-22T00:00:00.000Z",
      },
    ]);
    presenceMocks.getVisiblePresence.mockResolvedValue([
      {
        customStatus: null,
        currentGameId: "game-1",
        currentGameTitle: "Neon Drift",
        lastHeartbeatAt: "2026-06-22T00:00:00.000Z",
        platform: "epic",
        platformGameId: "epic-neon-drift",
        platformLastPolledAt: "2026-06-22T00:00:00.000Z",
        platformSource: "epic",
        status: "online",
        updatedAt: "2026-06-22T00:00:00.000Z",
        userId: "friend-1",
      },
    ]);

    renderRoute(<OverlayPage />);
    fireEvent.click(screen.getByRole("button", { name: "Friends" }));

    expect(await screen.findByText("Arcade Rival")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Join"));
    await waitFor(() =>
      expect(launcherMocks.launchCrossPlayJoin).toHaveBeenCalledWith("epic", "epic-neon-drift"),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Opening Neon Drift via epic.");

    fireEvent.click(screen.getByTitle("Invite"));

    expect(promptSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("form", { name: /overlay game invite/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/game invite title/i)).toHaveValue("Neon Drift");

    fireEvent.change(screen.getByLabelText(/game invite title/i), {
      target: { value: "Mecha Signal" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() =>
      expect(socialMocks.sendGameInvite).toHaveBeenCalledWith({
        gameTitle: "Mecha Signal",
        receiverId: "friend-1",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Invite sent for Mecha Signal.");
  });

  it("keeps the overlay friend invite verify route local-only", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Native Prompt Game");
    window.history.replaceState(null, "", "/overlay?verify=overlay-friend-invite");

    renderRoute(<OverlayPage />);
    fireEvent.click(screen.getByRole("button", { name: "Friends" }));

    expect(await screen.findByText("Arcade Rival")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: /overlay game invite/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/game invite title/i)).toHaveValue("Neon Drift");

    fireEvent.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Local verify invite preview for Neon Drift. No Supabase invite sent.",
      );
    });
    expect(socialMocks.sendGameInvite).not.toHaveBeenCalled();
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it("polls overlay performance metrics at 1Hz for active game context", async () => {
    vi.useFakeTimers();
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "detect_anti_cheat_processes") return Promise.resolve([]);
      if (command === "poll_performance_metrics") return Promise.resolve(metrics);
      return Promise.resolve(undefined);
    });
    writeActivePerformanceGameContext({
      gameId: "overlay-active-game",
      gameTitle: "Overlay Active Game",
      launcher: "steam",
    });

    renderRoute(<OverlayPage />);
    fireEvent.click(screen.getByRole("button", { name: "Performance" }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Overlay Active Game")).toBeInTheDocument();
    expect(screen.getAllByText("HUD FPS").length).toBeGreaterThan(0);
    expect(screen.getByText(/not game FPS or a benchmark/i)).toBeInTheDocument();
    expect(pollPerformanceMetricCallCount()).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(ACTIVE_GAME_PERFORMANCE_POLL_INTERVAL_MS - 1);
      await Promise.resolve();
    });
    expect(pollPerformanceMetricCallCount()).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(pollPerformanceMetricCallCount()).toBe(2);
  });

  it("does not poll overlay native metrics without active game context", async () => {
    vi.useFakeTimers();
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockImplementation((command) => {
      if (command === "detect_anti_cheat_processes") return Promise.resolve([]);
      if (command === "poll_performance_metrics") return Promise.resolve(metrics);
      return Promise.resolve(undefined);
    });

    renderRoute(<OverlayPage />);
    fireEvent.click(screen.getByRole("button", { name: "Performance" }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Standalone Overlay")).toBeInTheDocument();
    expect(pollPerformanceMetricCallCount()).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(pollPerformanceMetricCallCount()).toBe(0);
  });

  it("opens the local system-telemetry panel on its development verify route", async () => {
    window.history.replaceState(null, "", "/overlay?verify=performance-system-telemetry");

    renderRoute(<OverlayPage />);

    expect(await screen.findByText("Standalone Overlay")).toBeInTheDocument();
    expect(screen.getAllByText("HUD FPS").length).toBeGreaterThan(0);
    expect(screen.getByText(/not game FPS or a benchmark/i)).toBeInTheDocument();
    expect(pollPerformanceMetricCallCount()).toBe(0);
  });
});
