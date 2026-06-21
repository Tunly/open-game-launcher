import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";

import { AchievementsPage } from "./AchievementsPage";
import { AuthPage } from "./AuthPage";
import { CommunityPage } from "./CommunityPage";
import { ControllersPage } from "./ControllersPage";
import { DeveloperPortalPage } from "./DeveloperPortalPage";
import { DownloadsPage } from "./DownloadsPage";
import { EditProfilePage } from "./EditProfilePage";
import { FamilyPage } from "./FamilyPage";
import { FpsHudPage } from "./FpsHudPage";
import { FriendsPage } from "./FriendsPage";
import { GameActivityDashboardPage } from "./GameActivityDashboardPage";
import { HomePage } from "./HomePage";
import { InviteFallbackPage } from "./InviteFallbackPage";
import { LibraryPage } from "./LibraryPage";
import { ModsPage } from "./ModsPage";
import { NewsPage } from "./NewsPage";
import { NotFoundPage } from "./NotFoundPage";
import { OverlayPage } from "./OverlayPage";
import { PerfHistoryPage } from "./PerfHistoryPage";
import { PrivacySettingsPage } from "./PrivacySettingsPage";
import { ProfileCustomizePage } from "./ProfileCustomizePage";
import { ProfilePage } from "./ProfilePage";
import { RemoteInstallDashboardPage } from "./RemoteInstallDashboardPage";
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
  cancelLanTransferCopyJob: vi.fn(),
  cancelModInstall: vi.fn(),
  clearBroadcastStreamKeySecret: vi.fn(),
  detectHardwareInfo: vi.fn(),
  disableMod: vi.fn(),
  eaGetToken: vi.fn(),
  eaLogout: vi.fn(),
  enableMod: vi.fn(),
  fetchSteamProfileName: vi.fn(),
  fetchXboxOwnedGames: vi.fn(),
  getBroadcastStreamKeyVaultStatus: vi.fn(),
  getControllerRuntimeStatus: vi.fn(),
  getDefaultInstallDir: vi.fn(),
  getDownloadQueue: vi.fn(),
  getLicenseDeviceId: vi.fn(),
  getRemoteCompanionDeviceSecretStatus: vi.fn(),
  getSystemInfo: vi.fn(),
  gogExchangeCode: vi.fn(),
  gogGetToken: vi.fn(),
  gogLogout: vi.fn(),
  launchCrossPlayJoin: vi.fn(),
  launchGame: vi.fn(),
  listInstalledGames: vi.fn(),
  listControllers: vi.fn(),
  normalizeSteamOwnedGames: vi.fn(),
  openBattleNetLoginWindow: vi.fn(),
  openAchievementCacheFolder: vi.fn(),
  openEaLoginWindow: vi.fn(),
  openEpicLoginWindow: vi.fn(),
  openGogLoginWindow: vi.fn(),
  openSteamLoginWindow: vi.fn(),
  openXboxLoginWindow: vi.fn(),
  pauseDownload: vi.fn(),
  previewLanTransferCopy: vi.fn(),
  previewLanTransferResumeCancelLedger: vi.fn(),
  processBattleNetGamesPayload: vi.fn(),
  runLanTransferCleanupCandidates: vi.fn(),
  runLanTransferCopy: vi.fn(),
  runLanTransferResumeCopy: vi.fn(),
  scanGameMods: vi.fn(),
  scanLocalPluginManifests: vi.fn(),
  scrapeNexusModInfo: vi.fn(),
  searchNexusMods: vi.fn(),
  setBroadcastStreamKeySecret: vi.fn(),
  setModProviderSecret: vi.fn(),
  stageSignedPluginPackage: vi.fn(),
  startLanTransferCopyJob: vi.fn(),
  startModInstall: vi.fn(),
  uninstallMod: vi.fn(),
  validateLicense: vi.fn(),
}));

const newsMocks = vi.hoisted(() => ({
  listPublishedNews: vi.fn(),
}));

const achievementMocks = vi.hoisted(() => ({
  hydrateGamesWithRemoteAchievements: vi.fn(),
}));

const storeMocks = vi.hoisted(() => ({
  addToCart: vi.fn(),
  addToStoreWishlist: vi.fn(),
  createStoreBuildDownloadTicket: vi.fn(),
  getCartItems: vi.fn(),
  getMyLicenses: vi.fn(),
  getMyOrderByStripeSession: vi.fn(),
  getMyStoreReview: vi.fn(),
  getLatestStorePriceDropNotificationRunEvidence: vi.fn(),
  getStoreProductPriceHistory: vi.fn(),
  isTrustedStorePriceDropNotificationRunEvidence: vi.fn(),
  listMyOrderItems: vi.fn(),
  listMyOrders: vi.fn(),
  listMyStoreOrderInvoices: vi.fn(),
  listMyStorePriceAlerts: vi.fn(),
  listMyStoreRefundRequests: vi.fn(),
  listMyStoreReviewReports: vi.fn(),
  listMyStoreWishlist: vi.fn(),
  listPublishedProducts: vi.fn(),
  listStoreProductReviews: vi.fn(),
  listStoreReviewReplies: vi.fn(),
  removeFromCart: vi.fn(),
  removeFromStoreWishlist: vi.fn(),
  removeStorePriceAlert: vi.fn(),
  reportStoreReview: vi.fn(),
  requestStoreOrderRefund: vi.fn(),
  submitDeveloperApplication: vi.fn(),
  syncStoreOrderInvoice: vi.fn(),
  upsertStorePriceAlert: vi.fn(),
  upsertStoreReview: vi.fn(),
  upsertStoreReviewReply: vi.fn(),
}));

const modMocks = vi.hoisted(() => ({
  listModCatalogEntries: vi.fn(),
  listSharedModProviderGameMappings: vi.fn(),
  recordUserModInstall: vi.fn(),
  upsertSharedModProviderGameMapping: vi.fn(),
}));

const nativeModSearchMocks = vi.hoisted(() => ({
  searchNativeMods: vi.fn(),
}));

const remoteCompanionMocks = vi.hoisted(() => ({
  enqueueRemoteCompanionInstallJob: vi.fn(),
}));

const performanceMocks = vi.hoisted(() => ({
  listPerformanceSessions: vi.fn(),
  listPerformanceSnapshots: vi.fn(),
  savePerformanceSession: vi.fn(),
  savePerformanceSnapshotFromMetrics: vi.fn(),
}));

const noop = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

vi.mock("recharts", () => ({
  CartesianGrid: () => null,
  Line: () => null,
  LineChart: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

vi.mock("../components/controllers/ControllerLayoutEditor", () => ({
  ControllerLayoutEditor: () => <section aria-label="Controller layout editor mock" />,
}));

vi.mock("../components/launcher/StoreGameCard", () => ({
  StoreGameCard: ({ game }: { game: { title: string } }) => <article>{game.title}</article>,
}));

vi.mock("../components/library/AddGameDialog", () => ({
  AddGameDialog: () => null,
}));

vi.mock("../components/library/GameDetailPanel", () => ({
  GameDetailPanel: (props: { verifyMode?: string | null }) => (
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

vi.mock("../components/settings/ActivitySection", () => ({
  ActivitySection: () => <section aria-label="Activity settings mock" />,
}));

vi.mock("../components/settings/BackupRestoreSettings", () => ({
  BackupRestoreSettings: () => <section aria-label="Backup settings mock" />,
}));

vi.mock("../components/settings/ClientManagerMountApplyContractPanel", () => ({
  ClientManagerMountApplyContractPanel: () => (
    <section aria-label="Client manager mount apply contract mock" />
  ),
}));

vi.mock("../components/settings/ClientUpdateSchedulerSettings", () => ({
  ClientUpdateSchedulerSettings: () => <section aria-label="Client scheduler mock" />,
}));

vi.mock("../components/settings/CloudSavesSettings", () => ({
  CloudSavesSettings: () => <section aria-label="Cloud saves mock" />,
}));

vi.mock("../components/settings/OneClickSetupE2EReadinessPanel", () => ({
  OneClickSetupE2EReadinessPanel: () => <section aria-label="One-click setup E2E readiness mock" />,
}));

vi.mock("../components/settings/OneClickSetupReadinessPanel", () => ({
  OneClickSetupReadinessPanel: () => <section aria-label="One-click setup readiness mock" />,
}));

vi.mock("../components/settings/PlatformHealthPanel", () => ({
  PlatformHealthPanel: () => <section aria-label="Platform health mock" />,
}));

vi.mock("../components/settings/PluginSystemReadinessPanel", () => ({
  PluginSystemReadinessPanel: () => <section aria-label="Plugin system readiness mock" />,
}));

vi.mock("../components/settings/PresencePollingReadinessPanel", () => ({
  PresencePollingReadinessPanel: () => <section aria-label="Presence polling readiness mock" />,
}));

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: currentUserMock,
}));

vi.mock("../hooks/useCloudAutoSync", () => ({
  useCloudAutoSync: () => ({
    maybeSyncOnLaunch: noop,
  }),
}));

vi.mock("../hooks/library/useAchievementAutoSync", () => ({
  useAchievementAutoSync: () => ({
    handleSyncAchievements: noop,
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
  useProviderPicking: () => ({
    handleInstallFromProvider: noop,
    handlePlay: noop,
    handlePlayVariant: noop,
    maybeSyncOnLaunch: noop,
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

vi.mock("../lib/supabase/mods", () => modMocks);

vi.mock("../lib/supabase/news", () => newsMocks);

vi.mock("../lib/mod-provider-search", () => nativeModSearchMocks);

vi.mock("../lib/supabase/performance", () => performanceMocks);

vi.mock("../lib/supabase/remote-companion", () => remoteCompanionMocks);

vi.mock("../lib/supabase/store", () => storeMocks);

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
    selectCompletedCount: (value: { items: Array<{ status: string }> }) =>
      value.items.filter((item) => item.status === "completed").length,
    selectTotalProgress: () => 0,
    useDownloadStore,
  };
});

vi.mock("../stores/modInstallStore", () => ({
  selectActiveModInstallCount: () => 0,
  selectCompletedModInstallCount: () => 0,
  selectDelegatedModInstallCount: () => 0,
  useModInstallStore: (selector: (value: { items: never[] }) => unknown) => selector({ items: [] }),
}));

function renderRoute(ui: ReactNode, initialEntry = "/") {
  return render(<MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>);
}

function renderRoutedPage(ui: ReactNode, path: string, initialEntry = path) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={ui} path={path} />
      </Routes>
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

describe("routed page smoke coverage", () => {
  beforeEach(() => {
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
    launcherMocks.cancelLanTransferCopyJob.mockResolvedValue(null);
    launcherMocks.cancelModInstall.mockResolvedValue(undefined);
    launcherMocks.clearBroadcastStreamKeySecret.mockResolvedValue({
      configured: false,
      message: "Stream-key vault empty.",
    });
    launcherMocks.detectHardwareInfo.mockResolvedValue(null);
    launcherMocks.disableMod.mockResolvedValue(undefined);
    launcherMocks.eaGetToken.mockResolvedValue(null);
    launcherMocks.eaLogout.mockResolvedValue(undefined);
    launcherMocks.enableMod.mockResolvedValue(undefined);
    launcherMocks.fetchSteamProfileName.mockResolvedValue("Steam User");
    launcherMocks.fetchXboxOwnedGames.mockResolvedValue({ games: [], gamertag: "Xbox User" });
    launcherMocks.getBroadcastStreamKeyVaultStatus.mockResolvedValue({
      configured: false,
      message: "Stream-key vault empty.",
    });
    launcherMocks.getControllerRuntimeStatus.mockResolvedValue({
      activeGameId: null,
      activeLayoutName: "Arcade Default",
      activeTemplate: "gamepadGyro",
      configPath: "test",
      driverMessage: "Runtime ready for local routing.",
      keyboardMouseEmulationReady: true,
      nativePassthroughReady: false,
      vigemBusDetected: true,
    });
    launcherMocks.getDefaultInstallDir.mockResolvedValue("/games");
    launcherMocks.getDownloadQueue.mockResolvedValue([]);
    launcherMocks.getLicenseDeviceId.mockResolvedValue("device-test");
    launcherMocks.getRemoteCompanionDeviceSecretStatus.mockResolvedValue({
      deviceId: null,
      deviceSecretHint: null,
      hasSecret: false,
      updatedAtEpochMs: null,
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
    launcherMocks.listControllers.mockResolvedValue([]);
    launcherMocks.normalizeSteamOwnedGames.mockImplementation((games) => games);
    launcherMocks.openAchievementCacheFolder.mockResolvedValue("/tmp/achievements");
    launcherMocks.openBattleNetLoginWindow.mockResolvedValue(undefined);
    launcherMocks.openEaLoginWindow.mockResolvedValue(undefined);
    launcherMocks.openEpicLoginWindow.mockResolvedValue(undefined);
    launcherMocks.openGogLoginWindow.mockResolvedValue(undefined);
    launcherMocks.openSteamLoginWindow.mockResolvedValue(undefined);
    launcherMocks.openXboxLoginWindow.mockResolvedValue(undefined);
    launcherMocks.pauseDownload.mockResolvedValue(undefined);
    launcherMocks.previewLanTransferCopy.mockResolvedValue(null);
    launcherMocks.previewLanTransferResumeCancelLedger.mockResolvedValue(null);
    launcherMocks.processBattleNetGamesPayload.mockResolvedValue([]);
    launcherMocks.runLanTransferCleanupCandidates.mockResolvedValue(null);
    launcherMocks.runLanTransferCopy.mockResolvedValue(null);
    launcherMocks.runLanTransferResumeCopy.mockResolvedValue(null);
    launcherMocks.scanGameMods.mockResolvedValue([]);
    launcherMocks.scrapeNexusModInfo.mockResolvedValue(null);
    launcherMocks.searchNexusMods.mockResolvedValue([]);
    launcherMocks.setBroadcastStreamKeySecret.mockResolvedValue({
      configured: true,
      message: "Stream-key vault staged.",
    });
    launcherMocks.setModProviderSecret.mockResolvedValue(undefined);
    launcherMocks.startLanTransferCopyJob.mockResolvedValue(null);
    launcherMocks.startModInstall.mockResolvedValue(undefined);
    launcherMocks.uninstallMod.mockResolvedValue(undefined);
    launcherMocks.validateLicense.mockResolvedValue({ ok: true });
    newsMocks.listPublishedNews.mockResolvedValue([newsItem]);
    achievementMocks.hydrateGamesWithRemoteAchievements.mockImplementation((games) =>
      Promise.resolve(games),
    );
    storeMocks.addToCart.mockResolvedValue(undefined);
    storeMocks.addToStoreWishlist.mockResolvedValue(undefined);
    storeMocks.createStoreBuildDownloadTicket.mockResolvedValue({
      downloadUrl: "https://example.test/download",
    });
    storeMocks.getCartItems.mockResolvedValue([]);
    storeMocks.getMyLicenses.mockResolvedValue([]);
    storeMocks.getMyOrderByStripeSession.mockResolvedValue(null);
    storeMocks.getMyStoreReview.mockResolvedValue(null);
    storeMocks.getLatestStorePriceDropNotificationRunEvidence.mockResolvedValue(null);
    storeMocks.getStoreProductPriceHistory.mockResolvedValue([]);
    storeMocks.isTrustedStorePriceDropNotificationRunEvidence.mockReturnValue(false);
    storeMocks.listMyOrderItems.mockResolvedValue([]);
    storeMocks.listMyOrders.mockResolvedValue([]);
    storeMocks.listMyStoreOrderInvoices.mockResolvedValue([]);
    storeMocks.listMyStorePriceAlerts.mockResolvedValue([]);
    storeMocks.listMyStoreRefundRequests.mockResolvedValue([]);
    storeMocks.listMyStoreReviewReports.mockResolvedValue([]);
    storeMocks.listMyStoreWishlist.mockResolvedValue([]);
    storeMocks.listPublishedProducts.mockResolvedValue([]);
    storeMocks.listStoreProductReviews.mockResolvedValue([]);
    storeMocks.listStoreReviewReplies.mockResolvedValue([]);
    storeMocks.removeFromCart.mockResolvedValue(undefined);
    storeMocks.removeFromStoreWishlist.mockResolvedValue(undefined);
    storeMocks.removeStorePriceAlert.mockResolvedValue(undefined);
    storeMocks.reportStoreReview.mockResolvedValue(undefined);
    storeMocks.requestStoreOrderRefund.mockResolvedValue(undefined);
    storeMocks.submitDeveloperApplication.mockResolvedValue(null);
    storeMocks.syncStoreOrderInvoice.mockResolvedValue(null);
    storeMocks.upsertStorePriceAlert.mockResolvedValue(undefined);
    storeMocks.upsertStoreReview.mockResolvedValue(null);
    storeMocks.upsertStoreReviewReply.mockResolvedValue(null);
    modMocks.listModCatalogEntries.mockResolvedValue([]);
    modMocks.listSharedModProviderGameMappings.mockResolvedValue([]);
    modMocks.recordUserModInstall.mockResolvedValue(null);
    modMocks.upsertSharedModProviderGameMapping.mockResolvedValue(null);
    nativeModSearchMocks.searchNativeMods.mockResolvedValue([]);
    remoteCompanionMocks.enqueueRemoteCompanionInstallJob.mockResolvedValue(null);
    performanceMocks.listPerformanceSessions.mockResolvedValue([]);
    performanceMocks.listPerformanceSnapshots.mockResolvedValue([]);
    performanceMocks.savePerformanceSession.mockResolvedValue(true);
    performanceMocks.savePerformanceSnapshotFromMetrics.mockResolvedValue(undefined);
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
    window.localStorage.clear();
  });

  it("renders the home play desk", () => {
    renderRoute(<HomePage />);

    expect(screen.getByRole("heading", { name: /play desk/i })).toBeInTheDocument();
    expect(screen.getByText("Launcher HQ")).toBeInTheDocument();
  });

  it("renders the documented library route shell", () => {
    renderRoutedPage(<LibraryPage />, "/library");

    expect(
      screen.getByRole("complementary", { name: /library sidebar mock/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /game detail panel mock/i })).toHaveAttribute(
      "data-verify-mode",
      "null",
    );
  });

  it("renders the AI hosted eval verify route shell", () => {
    renderRoutedPage(
      <LibraryPage />,
      "/library",
      "/library?verify=ai-recommendations-hosted-eval-contract",
    );

    expect(screen.getByRole("region", { name: /game detail panel mock/i })).toHaveAttribute(
      "data-verify-mode",
      "ai-recommendations-hosted-eval-contract",
    );
  });

  it("renders the store discovery shelf", async () => {
    renderRoutedPage(<StorePage />, "/store");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: /neo-strike/i })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /price-drop scheduler readiness/i }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(storeMocks.listPublishedProducts).toHaveBeenCalled();
      expect(storeMocks.listMyOrders).toHaveBeenCalled();
    });
  });

  it("renders the community relay board", () => {
    renderRoutedPage(<CommunityPage />, "/community");

    expect(screen.getByRole("heading", { name: /community hub/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /community feed/i })).toBeInTheDocument();
  });

  it("renders the broadcasting audience status verify route", () => {
    window.history.replaceState(
      null,
      "",
      "/community?verify=broadcasting-audience-status-contract",
    );

    renderRoutedPage(
      <CommunityPage />,
      "/community",
      "/community?verify=broadcasting-audience-status-contract",
    );

    expect(
      screen.getByRole("region", { name: /broadcasting audience status contract/i }),
    ).toBeInTheDocument();
  });

  it("renders the downloads queue route", async () => {
    renderRoutedPage(<DownloadsPage />, "/downloads");

    expect(screen.getByRole("region", { name: /remote download readiness/i })).toBeInTheDocument();
    expect(screen.getByText(/there are no downloads in the queue/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(launcherMocks.getDownloadQueue).toHaveBeenCalled();
    });
  });

  it("renders the remote downloads dashboard route", () => {
    renderRoutedPage(<RemoteInstallDashboardPage />, "/downloads/remote");

    expect(screen.getByRole("heading", { level: 1, name: /remote install/i })).toBeInTheDocument();
    expect(screen.getByText(/remote install web dashboard/i)).toBeInTheDocument();
  });

  it("renders the controllers support route after desktop bridge fallback load", async () => {
    renderRoutedPage(<ControllersPage />, "/controllers");

    expect(await screen.findByRole("heading", { name: /controller support/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /local multiplayer hub/i })).toBeInTheDocument();
  });

  it("renders the mods manager route after local library load", async () => {
    renderRoutedPage(<ModsPage />, "/mods");

    expect(await screen.findByRole("heading", { name: /mod manager/i })).toBeInTheDocument();
    expect(screen.getByText("Installed Mods")).toBeInTheDocument();
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
      expect(storeMocks.submitDeveloperApplication).toHaveBeenCalledWith(
        "Redline Studio",
        "https://redline.example",
        "Arcade launch plan",
      ),
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
      expect(storeMocks.submitDeveloperApplication).toHaveBeenCalledWith(
        "Redline Studio",
        null,
        null,
      ),
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
    expect(screen.getByText("Cache Folder")).toBeInTheDocument();
  });

  it("renders realtime metrics in the FPS HUD", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    writeActivePerformanceGameContext({
      gameId: "page-smoke-game",
      gameTitle: "Page Smoke Game",
      launcher: "steam",
    });

    renderRoute(<FpsHudPage />);

    expect(await screen.findByText("61 FPS")).toBeInTheDocument();
    expect(screen.getByText("28% CPU")).toBeInTheDocument();
    expect(screen.getByText("42% GPU")).toBeInTheDocument();
  });

  it("renders browser preview metrics in the FPS HUD without native invokes", async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    vi.mocked(invoke).mockClear();

    renderRoute(<FpsHudPage />);

    expect(await screen.findByText("Browser Preview")).toBeInTheDocument();
    expect(screen.getByText("66 FPS")).toBeInTheDocument();
    expect(screen.getByText("42% CPU")).toBeInTheDocument();
    expect(screen.getByText("58% GPU")).toBeInTheDocument();
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
    expect(
      await screen.findByRole("region", { name: /activity settings mock/i }),
    ).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Screenshots" })).toBeInTheDocument();
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
});
