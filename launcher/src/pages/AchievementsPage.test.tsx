import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AchievementsPage } from "./AchievementsPage";
import type { Game, SyncGameAchievementsResponse } from "../lib/types";
import type { OwnedGame } from "../lib/launcher";
import { STORAGE_KEYS } from "../lib/storage-keys";

const launcherMocks = vi.hoisted(() => ({
  listInstalledGames: vi.fn(),
  syncGameAchievements: vi.fn(),
  updateAchievementProviderStatus: vi.fn(),
  eaFetchOwnedGames: vi.fn(),
  eaGetToken: vi.fn(),
  fetchEpicOwnedGames: vi.fn(),
  fetchGamePassCatalog: vi.fn(),
  fetchGogOwnedGames: vi.fn(),
  fetchSteamOwnedGames: vi.fn(),
  fetchUbisoftOwnedGames: vi.fn(),
  gogGetToken: vi.fn(),
  gogRefreshToken: vi.fn(),
  normalizeSteamOwnedGames: vi.fn(),
  openSteamScraperWindow: vi.fn(),
  processBattleNetGamesPayload: vi.fn(),
}));

const achievementMocks = vi.hoisted(() => ({
  hydrateGamesWithRemoteAchievements: vi.fn(),
}));

const oglCatalogMocks = vi.hoisted(() => ({
  listOglCatalogGames: vi.fn(),
}));

const useCurrentUserMock = vi.hoisted(() => vi.fn());

const falseAchievementCacheClaim =
  /\b(?:(?:steam|xbox|gog|epic|ea|ubisoft|battle\.?net|provider)\s*(?:achievement|unlock|cache|sidecar)?\s*(?:sync|import|hydration|job)\s*(?:ready|verified|connected|enabled|synced|complete|executed|started|imported)|provider\s*api\s*(?:called|fetched|ready|verified)|hosted\s*(?:hydration|achievement|cache|sync|job)\s*(?:ready|verified|enabled|complete|executed|started)|supabase\s*(?:(?:achievement|unlock|cache|row|write|writes|hydration)\s*)+(?:written|inserted|updated|synced|ready|verified|complete)|oauth\s*(?:token\s*)?(?:exchanged|connected|verified|complete|exchange\s*(?:ready|verified|complete|executed))|token\s*(?:exchange\s*(?:ready|verified|complete|executed)|read\s*(?:ready|verified|complete|executed|started)|used|stored|vaulted)|live\s*unlock\s*(?:imported|synced|ready|complete|import\s*(?:ready|verified|complete|executed|started)|sync\s*(?:ready|verified|complete|executed|started))|remote\s*cache\s*(?:job|sync|hydration)\s*(?:ready|started|executed|complete|synced)|trusted\s*ingestion\s*(?:called|ready|verified|complete|executed|started)|achievement\s*sync\s*(?:ready|verified|enabled|synced|complete|executed|started|imported))\b/i;

vi.mock("../lib/launcher", () => launcherMocks);

vi.mock("../lib/supabase/achievements", () => achievementMocks);

vi.mock("../lib/supabase/ogl-catalog", () => oglCatalogMocks);

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: useCurrentUserMock,
}));

function renderAchievementsRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AchievementsPage />
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function syncResponse(
  game: Game,
  achievements: NonNullable<Game["achievements"]>,
): SyncGameAchievementsResponse {
  return {
    game: {
      ...game,
      achievements,
      achievementsSyncedAt: "2026-07-10T13:00:00Z",
    },
    gameId: game.id,
    message: `${game.title} achievements synced.`,
    success: true,
    syncedAchievements: achievements.length,
    unlockedAchievements: achievements.filter((achievement) => achievement.unlockedAt).length,
  };
}

function ownedAchievementGame(id: string, title: string): OwnedGame {
  return {
    id,
    title,
    description: "",
    coverUrl: null,
    logoUrl: null,
    achievements: [
      {
        id: `${id}-unlock`,
        name: `${title} Unlock`,
        source: id.split("-", 1)[0],
        unlockedAt: "2026-07-12T12:00:00Z",
      },
    ],
    achievementsSyncedAt: new Date().toISOString(),
  };
}

function achievementPageGame(id: string, title: string, overrides: Partial<Game> = {}): Game {
  return {
    achievements: [{ id: `${id}-achievement`, name: `${title} Achievement`, unlockedAt: null }],
    achievementsSyncedAt: new Date().toISOString(),
    description: "",
    id,
    launcher: "manual",
    platform: "windows",
    status: "installed",
    title,
    version: "1.0.0",
    ...overrides,
  };
}

describe("AchievementsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    launcherMocks.listInstalledGames.mockResolvedValue([]);
    launcherMocks.syncGameAchievements.mockRejectedValue(
      new Error("Unexpected achievement sync in this test."),
    );
    launcherMocks.updateAchievementProviderStatus.mockImplementation(({ gameId, status }) =>
      Promise.resolve({ id: gameId, achievementProviderStatuses: [status] }),
    );
    launcherMocks.eaFetchOwnedGames.mockResolvedValue([]);
    launcherMocks.eaGetToken.mockResolvedValue(null);
    launcherMocks.fetchEpicOwnedGames.mockResolvedValue([]);
    launcherMocks.fetchGamePassCatalog.mockResolvedValue([]);
    launcherMocks.fetchGogOwnedGames.mockResolvedValue([]);
    launcherMocks.fetchSteamOwnedGames.mockResolvedValue([]);
    launcherMocks.fetchUbisoftOwnedGames.mockResolvedValue([]);
    launcherMocks.gogGetToken.mockResolvedValue(null);
    launcherMocks.gogRefreshToken.mockResolvedValue(null);
    launcherMocks.normalizeSteamOwnedGames.mockImplementation((games) =>
      Array.isArray(games) ? games : [],
    );
    launcherMocks.openSteamScraperWindow.mockResolvedValue(undefined);
    launcherMocks.processBattleNetGamesPayload.mockResolvedValue([]);
    achievementMocks.hydrateGamesWithRemoteAchievements.mockImplementation((games) =>
      Promise.resolve(games),
    );
    oglCatalogMocks.listOglCatalogGames.mockResolvedValue([]);
    useCurrentUserMock.mockReturnValue({ isLoading: false, user: null });
  });

  it("does not render the player archive masthead", async () => {
    renderAchievementsRoute("/achievements");

    await screen.findByText("No achievement-enabled games found.");
    expect(screen.queryByText("Player Archive")).not.toBeInTheDocument();
    expect(screen.queryByText("Local Player")).not.toBeInTheDocument();
  });

  it("exposes accessible page, filter, and sort controls", async () => {
    launcherMocks.listInstalledGames.mockResolvedValueOnce([
      achievementPageGame("steam-accessible", "Accessible Game", {
        launcher: "steam",
        lastPlayedAt: new Date().toISOString(),
      }),
    ]);

    renderAchievementsRoute("/achievements");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Achievements" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search achievement games" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Achievement game views" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Sort achievement games" })).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Filter achievement games by source" }),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /all games/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Achievement Completion" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: /recently played/i }));
    expect(screen.getByRole("button", { name: "Last Played" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Achievement Completion" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Steam" }));
    expect(screen.getByRole("button", { name: "Steam" })).toHaveAttribute("aria-pressed", "true");
  });

  it("sorts the recently played view by latest play time", async () => {
    launcherMocks.listInstalledGames.mockResolvedValueOnce([
      achievementPageGame("manual-oldest", "Oldest", { lastPlayedAt: "2026-07-01T10:00:00Z" }),
      achievementPageGame("manual-newest", "Newest", { lastPlayedAt: "2026-07-15T10:00:00Z" }),
      achievementPageGame("manual-middle", "Middle", { lastPlayedAt: "2026-07-10T10:00:00Z" }),
    ]);

    renderAchievementsRoute("/achievements");
    await screen.findByRole("heading", { name: "Newest" });
    fireEvent.click(screen.getByRole("button", { name: /recently played/i }));

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Newest", "Middle", "Oldest"]);
  });

  it("retries a failed local archive load", async () => {
    launcherMocks.listInstalledGames
      .mockRejectedValueOnce(new Error("Desktop bridge unavailable"))
      .mockResolvedValueOnce([achievementPageGame("manual-retry", "Retry Game")]);

    renderAchievementsRoute("/achievements");

    expect(await screen.findByRole("alert")).toHaveTextContent("Desktop bridge unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry loading achievements" }));

    expect(await screen.findByRole("heading", { name: "Retry Game" })).toBeInTheDocument();
    expect(launcherMocks.listInstalledGames).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Desktop bridge unavailable")).not.toBeInTheDocument();
  });

  it("shows and retries a cloud hydration warning without hiding local data", async () => {
    const game = achievementPageGame("manual-cloud-retry", "Cloud Retry Game", {
      launcher: "steam",
    });
    launcherMocks.listInstalledGames.mockResolvedValue([game]);
    achievementMocks.hydrateGamesWithRemoteAchievements
      .mockImplementationOnce(
        (games: Game[], options: { onError?: (error: unknown, game: Game) => void }) => {
          options.onError?.(new Error("network unavailable"), games[0]);
          return Promise.resolve(games);
        },
      )
      .mockResolvedValueOnce([game]);

    renderAchievementsRoute("/achievements");

    expect(await screen.findByRole("heading", { name: "Cloud Retry Game" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cloud achievements could not be refreshed",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry archive update" }));

    await waitFor(() =>
      expect(achievementMocks.hydrateGamesWithRemoteAchievements).toHaveBeenCalledTimes(2),
    );
    expect(
      screen.queryByText(/cloud achievements could not be refreshed/i),
    ).not.toBeInTheDocument();
  });

  it("shows a hosted OG Launcher test game without a native installation", async () => {
    oglCatalogMocks.listOglCatalogGames.mockResolvedValueOnce([
      {
        achievements: [
          {
            id: "first-boost",
            name: "First Boost",
            source: "ogl",
            sourceAchievementId: "first-boost",
            providerConfidence: "official",
            unlockedAt: null,
          },
        ],
        description: "Supabase test game",
        id: "ogl-neon-runners",
        launcher: "ogl",
        platform: "windows",
        slug: "neon-runners",
        status: "not_installed",
        title: "Neon Runners",
        version: "Catalog",
      },
    ] satisfies Game[]);

    renderAchievementsRoute("/achievements");

    const heading = await screen.findByRole("heading", { name: "Neon Runners" });
    const row = within(heading.closest("article")!);
    expect(row.getByText("0/1")).toBeInTheDocument();
    expect(row.getByTitle("OG Launcher")).toBeInTheDocument();
    expect(row.getByText("OG Launcher: available")).toBeInTheDocument();
    expect(launcherMocks.syncGameAchievements).not.toHaveBeenCalled();
    expect(row.getByRole("link", { name: /view full list/i })).toHaveAttribute(
      "href",
      "/library?game=ogl-neon-runners",
    );
  });

  it("shows hosted definitions for a provider game that is not installed or signed in", async () => {
    const ownedGame: Game = {
      achievements: [],
      description: "",
      externalId: "480",
      id: "steam-480",
      launcher: "steam",
      platform: "windows",
      status: "not_installed",
      title: "Uninstalled Catalog Game",
      version: "Catalog",
    };
    const hydratedGame: Game = {
      ...ownedGame,
      achievements: [
        {
          id: "ACH_REMOTE",
          name: "Remote Catalog Achievement",
          source: "steam",
          sourceAchievementId: "ACH_REMOTE",
          unlockedAt: null,
        },
      ],
    };
    launcherMocks.listInstalledGames.mockResolvedValueOnce([ownedGame]);
    achievementMocks.hydrateGamesWithRemoteAchievements.mockResolvedValueOnce([hydratedGame]);

    renderAchievementsRoute("/achievements");

    await screen.findByRole("heading", { name: "Uninstalled Catalog Game" });
    await waitFor(() => {
      const heading = screen.getByRole("heading", { name: "Uninstalled Catalog Game" });
      expect(within(heading.closest("article")!).getByText("0/1")).toBeInTheDocument();
    });
    expect(achievementMocks.hydrateGamesWithRemoteAchievements).toHaveBeenCalledWith(
      [ownedGame],
      expect.objectContaining({ onError: expect.any(Function), userId: null }),
    );
    expect(launcherMocks.syncGameAchievements).not.toHaveBeenCalled();
  });

  it("keeps the cache readiness panel out of the normal achievements route", async () => {
    renderAchievementsRoute("/achievements");

    expect(await screen.findByText("No achievement-enabled games found.")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /achievement cache readiness/i }),
    ).not.toBeInTheDocument();
    expect(achievementMocks.hydrateGamesWithRemoteAchievements).not.toHaveBeenCalled();
  });

  it("loads PC Game Pass catalog titles beyond the native installed inventory", async () => {
    localStorage.setItem(
      STORAGE_KEYS.GAME_PASS_CATALOG_CACHE,
      JSON.stringify([
        {
          id: "gamepass-9NBLGGH4R315",
          externalId: "9NBLGGH4R315",
          title: "Game Pass Archive",
          description: "",
          coverUrl: null,
          logoUrl: null,
        },
      ]),
    );

    renderAchievementsRoute("/achievements");

    const heading = await screen.findByRole("heading", { name: "Game Pass Archive" });
    const row = within(heading.closest("article")!);
    expect(row.getByText(/pc game pass catalog entry/i)).toBeInTheDocument();
    expect(launcherMocks.syncGameAchievements).not.toHaveBeenCalled();
  });

  it("loads account and cache inventory from every supported launcher", async () => {
    const steam = ownedAchievementGame("steam-owned-10", "Steam Archive");
    const gog = ownedAchievementGame("gog-owned-20", "GOG Archive");
    const ea = ownedAchievementGame("ea-owned-30", "EA Archive");
    const epic = ownedAchievementGame("epic-owned-offer:catalog:app", "Epic Archive");
    const ubisoft = ownedAchievementGame("ubisoft-owned-50", "Ubisoft Archive");
    const xbox = ownedAchievementGame("xbox-owned-60", "Xbox Archive");
    const battlenet = ownedAchievementGame("battlenet-owned-wow", "Battle.net Archive");

    localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify("steam-user"));
    localStorage.setItem(STORAGE_KEYS.EPIC_SESSION_MARKER, "connected");
    localStorage.setItem(STORAGE_KEYS.XBOX_GAMES_CACHE, JSON.stringify([xbox]));
    localStorage.setItem(STORAGE_KEYS.BATTLENET_GAMES_CACHE, JSON.stringify([battlenet]));
    launcherMocks.fetchSteamOwnedGames.mockResolvedValueOnce([steam]);
    launcherMocks.gogGetToken.mockResolvedValueOnce({ accessToken: "gog" });
    launcherMocks.fetchGogOwnedGames.mockResolvedValueOnce([gog]);
    launcherMocks.eaGetToken.mockResolvedValueOnce({ accessToken: "ea" });
    launcherMocks.eaFetchOwnedGames.mockResolvedValueOnce([ea]);
    launcherMocks.fetchEpicOwnedGames.mockResolvedValueOnce([epic]);
    launcherMocks.fetchUbisoftOwnedGames.mockResolvedValueOnce([ubisoft]);

    renderAchievementsRoute("/achievements");

    for (const game of [steam, gog, ea, epic, ubisoft, xbox, battlenet]) {
      expect(await screen.findByRole("heading", { name: game.title })).toBeInTheDocument();
      expect(screen.getByText(`${game.title} Unlock`)).toBeInTheDocument();
    }
  });

  it("keeps a completed basis game perfect when another platform has exclusive achievements", async () => {
    const syncedAt = new Date().toISOString();
    const steamGame: Game = {
      achievements: [
        {
          id: "steam-story-complete",
          name: "Story Complete",
          source: "steam",
          unlockedAt: "2026-07-12T12:00:00Z",
        },
      ],
      achievementsSyncedAt: syncedAt,
      description: "",
      externalId: "101",
      id: "steam-101",
      launcher: "steam",
      platform: "windows",
      status: "installed",
      title: "Cross-Platform Perfect",
      version: "1.0.0",
    };
    const xboxGame: Game = {
      ...steamGame,
      achievements: [
        {
          id: "xbox-exclusive",
          name: "Xbox Exclusive",
          source: "xbox",
          unlockedAt: null,
        },
      ],
      externalId: "202",
      id: "xbox-202",
      launcher: "xbox",
    };
    launcherMocks.listInstalledGames.mockResolvedValueOnce([steamGame, xboxGame]);

    renderAchievementsRoute("/achievements");

    const heading = await screen.findByRole("heading", { name: "Cross-Platform Perfect" });
    const row = within(heading.closest("article")!);
    expect(row.getByText("Perfect")).toBeInTheDocument();
    expect(row.getByText("1/1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Perfect Games (1)" }));

    expect(screen.getByRole("heading", { name: "Cross-Platform Perfect" })).toBeInTheDocument();
  });

  it("shows Steam perfect games from vetted local progress before definition sync finishes", async () => {
    const steamGame: OwnedGame = {
      achievementSummary: {
        unlocked: 31,
        total: 31,
        isPerfect: true,
        source: "steam",
      },
      coverUrl: null,
      description: "",
      externalId: "346900",
      id: "steam-owned-346900",
      logoUrl: null,
      title: "Steam Local Perfect",
    };
    localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify("steam-user"));
    launcherMocks.fetchSteamOwnedGames.mockResolvedValueOnce([steamGame]);

    renderAchievementsRoute("/achievements");

    const heading = await screen.findByRole("heading", { name: "Steam Local Perfect" });
    const row = within(heading.closest("article")!);
    expect(row.getByText("Perfect")).toBeInTheDocument();
    expect(row.getByText("31/31")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Perfect Games (1)" })).toBeInTheDocument();
  });

  it("refreshes empty Steam achievements when the archive opens", async () => {
    const steamGame: Game = {
      achievements: [],
      description: "",
      externalId: "12345",
      id: "steam-12345",
      launcher: "steam",
      platform: "windows",
      status: "installed",
      title: "Steam Refresh Game",
      version: "1.0.0",
    };
    localStorage.setItem(STORAGE_KEYS.STEAM_ID, JSON.stringify("steam-user"));
    launcherMocks.listInstalledGames.mockResolvedValueOnce([steamGame]);
    launcherMocks.syncGameAchievements.mockResolvedValueOnce(
      syncResponse(steamGame, [
        {
          id: "steam-refresh-unlock",
          name: "Steam Refresh Unlock",
          source: "steam",
          unlockedAt: "2026-07-12T12:00:00Z",
        },
      ]),
    );

    renderAchievementsRoute("/achievements");

    expect(await screen.findByText("Steam Refresh Unlock")).toBeInTheDocument();
    expect(launcherMocks.syncGameAchievements).toHaveBeenCalledWith(steamGame, "steam-user");
  });

  it("renders local achievement rows without waiting for cloud hydration", async () => {
    const remoteHydration = deferred<Game[]>();
    const localGame: Game = {
      achievements: [
        {
          id: "local-unlock",
          name: "Local Unlock",
          unlockedAt: "2026-07-10T10:00:00Z",
        },
      ],
      description: "",
      id: "steam-fast-game",
      launcher: "steam",
      platform: "windows",
      status: "installed",
      title: "Fast Game",
      version: "1.0.0",
    };
    const hydratedGame: Game = {
      ...localGame,
      achievements: [
        ...localGame.achievements!,
        {
          id: "remote-unlock",
          name: "Remote Unlock",
          unlockedAt: "2026-07-10T11:00:00Z",
        },
      ],
    };
    launcherMocks.listInstalledGames.mockResolvedValueOnce([localGame]);
    achievementMocks.hydrateGamesWithRemoteAchievements.mockReturnValueOnce(
      remoteHydration.promise,
    );
    useCurrentUserMock.mockReturnValue({
      isLoading: false,
      user: { id: "user-fast", user_metadata: {} },
    });

    renderAchievementsRoute("/achievements");

    expect(await screen.findByRole("heading", { name: "Fast Game" })).toBeInTheDocument();
    expect(screen.getByText("Local Unlock")).toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: /loading local achievement games/i }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("status", { name: /refreshing achievement archive/i }),
    ).toBeInTheDocument();
    expect(achievementMocks.hydrateGamesWithRemoteAchievements).toHaveBeenCalledWith(
      [localGame],
      expect.objectContaining({ onError: expect.any(Function), userId: "user-fast" }),
    );

    await act(async () => {
      remoteHydration.resolve([hydratedGame]);
      await remoteHydration.promise;
    });

    expect(await screen.findByText("Remote Unlock")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("status", { name: /refreshing achievement archive/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows one shared loading indicator while cloud and provider updates overlap", async () => {
    const providerRefresh = deferred<SyncGameAchievementsResponse>();
    const cloudHydration = deferred<Game[]>();
    const staleGame: Game = {
      achievements: [
        {
          id: "xbox-shared-loader",
          name: "Shared Loader Unlock",
          source: "xbox",
          unlockedAt: null,
        },
      ],
      achievementsSyncedAt: "2026-07-01T10:00:00Z",
      description: "",
      externalId: "24681012",
      id: "xbox-shared-loader-game",
      launcher: "xbox",
      platform: "windows",
      status: "installed",
      title: "Shared Loader Game",
      version: "1.0.0",
    };
    launcherMocks.listInstalledGames.mockResolvedValueOnce([staleGame]);
    launcherMocks.syncGameAchievements.mockReturnValueOnce(providerRefresh.promise);
    achievementMocks.hydrateGamesWithRemoteAchievements.mockReturnValueOnce(cloudHydration.promise);
    useCurrentUserMock.mockReturnValue({
      isLoading: false,
      user: { id: "shared-loader-user", user_metadata: {} },
    });

    const view = renderAchievementsRoute("/achievements");

    await waitFor(() => {
      expect(launcherMocks.syncGameAchievements).toHaveBeenCalledWith(staleGame);
      expect(achievementMocks.hydrateGamesWithRemoteAchievements).toHaveBeenCalledWith(
        [staleGame],
        expect.objectContaining({
          onError: expect.any(Function),
          userId: "shared-loader-user",
        }),
      );
    });
    expect(screen.getAllByRole("status", { name: /refreshing achievement archive/i })).toHaveLength(
      1,
    );
    expect(
      screen.getByText("Achievement archive updating / Local games ready"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: /refreshing cloud achievements/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: /refreshing provider achievements/i }),
    ).not.toBeInTheDocument();

    await act(async () => {
      providerRefresh.resolve(syncResponse(staleGame, staleGame.achievements!));
      cloudHydration.resolve([staleGame]);
      await Promise.all([providerRefresh.promise, cloudHydration.promise]);
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("status", { name: /refreshing achievement archive/i }),
      ).not.toBeInTheDocument(),
    );

    view.unmount();
  });

  it("syncs empty non-Steam provider games when the archive opens", async () => {
    const providers = ["xbox", "gog", "epic", "ea", "ubisoft", "battlenet"] as const;
    const providerLabels = {
      battlenet: "Battle.net",
      ea: "EA",
      epic: "Epic",
      gog: "GOG",
      ubisoft: "Ubisoft",
      xbox: "Xbox",
    };
    const providerGames: Game[] = providers.map((launcher, index) => ({
      achievements: [],
      description: "",
      externalId: String(123456789 + index),
      id: `${launcher}-provider-game`,
      launcher,
      platform: "windows",
      status: "installed",
      title: `${providerLabels[launcher]} Provider Game`,
      version: "1.0.0",
    }));
    launcherMocks.listInstalledGames.mockResolvedValueOnce(providerGames);
    launcherMocks.syncGameAchievements.mockImplementation((game: Game) => {
      const label = providerLabels[game.launcher as keyof typeof providerLabels];
      const achievements = [
        {
          id: `${game.launcher}-first`,
          name: `${label} First`,
          source: game.launcher,
          unlockedAt: "2026-07-10T12:00:00Z",
        },
        {
          id: `${game.launcher}-second`,
          name: `${label} Second`,
          source: game.launcher,
          unlockedAt: null,
        },
      ];
      return Promise.resolve(syncResponse(game, achievements));
    });

    renderAchievementsRoute("/achievements");

    for (const game of providerGames) {
      const label = providerLabels[game.launcher as keyof typeof providerLabels];
      const heading = await screen.findByRole("heading", { name: game.title });
      expect(await screen.findByText(`${label} First`)).toBeInTheDocument();
      expect(within(heading.closest("article")!).getByText("1/2")).toBeInTheDocument();
      expect(launcherMocks.syncGameAchievements).toHaveBeenCalledWith(game);
    }
    expect(launcherMocks.syncGameAchievements).toHaveBeenCalledTimes(providerGames.length);
  });

  it("refreshes stale non-Steam achievements so new unlocks appear", async () => {
    const staleGame: Game = {
      achievements: [{ id: "gog-old", name: "GOG Old", source: "gog", unlockedAt: null }],
      achievementsSyncedAt: "2026-07-01T10:00:00Z",
      description: "",
      externalId: "gog-stale",
      id: "gog-stale-game",
      launcher: "gog",
      platform: "windows",
      status: "installed",
      title: "GOG Stale Game",
      version: "1.0.0",
    };
    const refreshedAchievements = [
      {
        id: "gog-old",
        name: "GOG Old",
        source: "gog",
        unlockedAt: "2026-07-10T12:00:00Z",
      },
      {
        id: "gog-new",
        name: "GOG New",
        source: "gog",
        unlockedAt: null,
      },
    ];
    launcherMocks.listInstalledGames.mockResolvedValueOnce([staleGame]);
    launcherMocks.syncGameAchievements.mockResolvedValueOnce(
      syncResponse(staleGame, refreshedAchievements),
    );

    renderAchievementsRoute("/achievements");

    const heading = await screen.findByRole("heading", { name: "GOG Stale Game" });
    expect(await screen.findByText("GOG Old")).toBeInTheDocument();
    expect(within(heading.closest("article")!).getByText("1/2")).toBeInTheDocument();
    expect(launcherMocks.syncGameAchievements).toHaveBeenCalledWith(staleGame);
  });

  it("keeps a fresh non-Steam achievement snapshot without another provider call", async () => {
    const freshGame: Game = {
      achievements: [
        {
          id: "epic-fresh",
          name: "Epic Fresh",
          source: "epic",
          unlockedAt: "2026-07-10T12:00:00Z",
        },
      ],
      achievementsSyncedAt: new Date().toISOString(),
      description: "",
      externalId: "epic-fresh",
      id: "epic-fresh-game",
      launcher: "epic",
      platform: "windows",
      status: "installed",
      title: "Epic Fresh Game",
      version: "1.0.0",
    };
    launcherMocks.listInstalledGames.mockResolvedValueOnce([freshGame]);

    renderAchievementsRoute("/achievements");

    expect(await screen.findByText("Epic Fresh")).toBeInTheDocument();
    expect(launcherMocks.syncGameAchievements).not.toHaveBeenCalled();
  });

  it("reuses a cached achievement snapshot across page visits within the refresh window", async () => {
    const cachedGame: Game = {
      achievements: [
        {
          id: "xbox-cached",
          name: "Xbox Cached",
          source: "xbox",
          unlockedAt: "2026-07-10T12:00:00Z",
        },
      ],
      achievementsSyncedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      description: "",
      externalId: "xbox-cached",
      id: "xbox-cached-game",
      launcher: "xbox",
      platform: "windows",
      status: "installed",
      title: "Xbox Cached Game",
      version: "1.0.0",
    };
    launcherMocks.listInstalledGames.mockResolvedValueOnce([cachedGame]);

    renderAchievementsRoute("/achievements");

    expect(await screen.findByText("Xbox Cached")).toBeInTheDocument();
    expect(launcherMocks.syncGameAchievements).not.toHaveBeenCalled();
  });

  it("does not accept an empty provider response as available", async () => {
    const xboxGame: Game = {
      achievements: [],
      description: "",
      externalId: "24681012",
      id: "xbox-empty-response",
      launcher: "xbox",
      platform: "windows",
      status: "installed",
      title: "Xbox Empty Response",
      version: "1.0.0",
    };
    launcherMocks.listInstalledGames.mockResolvedValueOnce([xboxGame]);
    launcherMocks.syncGameAchievements.mockResolvedValueOnce(syncResponse(xboxGame, []));

    renderAchievementsRoute("/achievements");

    const heading = await screen.findByRole("heading", { name: "Xbox Empty Response" });
    const rowView = within(heading.closest("article")!);
    expect(await rowView.findByText("Unavailable")).toBeInTheDocument();
    expect(launcherMocks.updateAchievementProviderStatus).toHaveBeenCalledWith({
      gameId: xboxGame.id,
      status: expect.objectContaining({ source: "xbox", status: "failed" }),
    });
    expect(launcherMocks.updateAchievementProviderStatus).not.toHaveBeenCalledWith({
      gameId: xboxGame.id,
      status: expect.objectContaining({ status: "available" }),
    });
  });

  it("serializes achievement refreshes for multiple games from the same provider", async () => {
    const xboxGames: Game[] = ["one", "two"].map((suffix, index) => ({
      achievements: [],
      description: "",
      externalId: String(97531000 + index),
      id: `xbox-serial-${suffix}`,
      launcher: "xbox",
      platform: "windows",
      status: "installed",
      title: `Xbox Serial ${suffix}`,
      version: "1.0.0",
    }));
    const firstSync = deferred<SyncGameAchievementsResponse>();
    const secondSync = deferred<SyncGameAchievementsResponse>();
    launcherMocks.listInstalledGames.mockResolvedValueOnce(xboxGames);
    launcherMocks.syncGameAchievements
      .mockReturnValueOnce(firstSync.promise)
      .mockReturnValueOnce(secondSync.promise);

    renderAchievementsRoute("/achievements");

    await waitFor(() => expect(launcherMocks.syncGameAchievements).toHaveBeenCalledTimes(1));
    await act(async () => {
      firstSync.resolve(
        syncResponse(xboxGames[0], [
          {
            id: "xbox-serial-one-ach",
            name: "Xbox Serial One",
            unlockedAt: "2026-07-10T12:00:00Z",
          },
        ]),
      );
      await firstSync.promise;
    });
    await waitFor(() => expect(launcherMocks.syncGameAchievements).toHaveBeenCalledTimes(2));
    await act(async () => {
      secondSync.resolve(
        syncResponse(xboxGames[1], [
          {
            id: "xbox-serial-two-ach",
            name: "Xbox Serial Two",
            unlockedAt: "2026-07-10T12:00:00Z",
          },
        ]),
      );
      await secondSync.promise;
    });
    expect(await screen.findByText("Xbox Serial One")).toBeInTheDocument();
    expect(await screen.findByText("Xbox Serial Two")).toBeInTheDocument();
  });

  it("deduplicates an in-flight provider refresh across page remounts", async () => {
    const gogGame: Game = {
      achievements: [],
      description: "",
      externalId: "gog-in-flight",
      id: "gog-in-flight",
      launcher: "gog",
      platform: "windows",
      status: "installed",
      title: "GOG In Flight",
      version: "1.0.0",
    };
    const pendingSync = deferred<SyncGameAchievementsResponse>();
    launcherMocks.listInstalledGames.mockResolvedValue([gogGame]);
    launcherMocks.syncGameAchievements.mockReturnValue(pendingSync.promise);

    const firstView = renderAchievementsRoute("/achievements");
    await waitFor(() => expect(launcherMocks.syncGameAchievements).toHaveBeenCalledTimes(1));
    firstView.unmount();
    renderAchievementsRoute("/achievements");
    await waitFor(() => expect(launcherMocks.listInstalledGames).toHaveBeenCalledTimes(2));
    expect(launcherMocks.syncGameAchievements).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingSync.resolve(
        syncResponse(gogGame, [
          {
            id: "gog-in-flight-ach",
            name: "GOG In Flight Achievement",
            unlockedAt: "2026-07-10T12:00:00Z",
          },
        ]),
      );
      await pendingSync.promise;
    });
    expect(await screen.findByText("GOG In Flight Achievement")).toBeInTheDocument();
  });

  it("loads the local archive while auth restoration is still pending", async () => {
    const localGame: Game = {
      achievements: [{ id: "local-first", name: "Local First", unlockedAt: null }],
      description: "",
      id: "steam-auth-pending",
      launcher: "steam",
      platform: "windows",
      status: "installed",
      title: "Auth Pending Game",
      version: "1.0.0",
    };
    launcherMocks.listInstalledGames.mockResolvedValueOnce([localGame]);
    useCurrentUserMock.mockReturnValue({ isLoading: true, user: null });

    const view = renderAchievementsRoute("/achievements");

    expect(await screen.findByRole("heading", { name: "Auth Pending Game" })).toBeInTheDocument();
    expect(achievementMocks.hydrateGamesWithRemoteAchievements).not.toHaveBeenCalled();

    useCurrentUserMock.mockReturnValue({
      isLoading: false,
      user: { id: "restored-user", user_metadata: {} },
    });
    view.rerender(
      <MemoryRouter initialEntries={["/achievements"]}>
        <AchievementsPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(achievementMocks.hydrateGamesWithRemoteAchievements).toHaveBeenCalledWith(
        [localGame],
        expect.objectContaining({ onError: expect.any(Function), userId: "restored-user" }),
      ),
    );
  });

  it("does not render placeholder game-stat, content, or overflow actions", async () => {
    const game: Game = {
      achievements: [{ id: "first-run", name: "First Run", unlockedAt: null }],
      description: "",
      id: "real-game",
      launcher: "steam",
      platform: "windows",
      status: "installed",
      title: "Real Game",
      version: "1.0.0",
    };
    launcherMocks.listInstalledGames.mockResolvedValueOnce([game]);

    renderAchievementsRoute("/achievements");

    expect(await screen.findByRole("heading", { name: "Real Game" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /my game stats/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /my game content/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /more actions for/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view full list/i })).toHaveAttribute(
      "href",
      "/library?game=real-game",
    );
  });

  it("replaces persisted provider diagnostics with a safe retry message", async () => {
    const safeMessage =
      "No readable Ubisoft achievement data was found on this PC. Launch the game through Ubisoft Connect, then try again.";
    const diagnosticMessage =
      "sync_local_game_achievements failed: No local ubisoft achievement cache found for Tom Clancy's Rainbow Six Siege X. Checked: C:\\Users\\Danie\\AppData\\Local\\open-game-launcher\\achievement-cache\\ubisoft\\635.json; +52 more";
    const failedGame: Game = {
      achievements: [],
      achievementProviderStatuses: [
        {
          message: diagnosticMessage,
          source: "ubisoft",
          stability: "unofficial",
          status: "failed",
        },
      ],
      description: "",
      id: "ubisoft-rainbow-six",
      launcher: "ubisoft",
      platform: "windows",
      status: "installed",
      title: "Tom Clancy's Rainbow Six Siege X",
      version: "1.0.0",
    };
    launcherMocks.listInstalledGames.mockResolvedValueOnce([failedGame]);
    launcherMocks.syncGameAchievements.mockRejectedValueOnce(new Error(diagnosticMessage));

    renderAchievementsRoute("/achievements");

    const heading = await screen.findByRole("heading", {
      name: "Tom Clancy's Rainbow Six Siege X",
    });
    const row = heading.closest("article");
    expect(row).not.toBeNull();

    const rowView = within(row!);
    const status = rowView.getByRole("status", {
      name: /ubisoft achievement sync unavailable/i,
    });
    expect(status).toHaveTextContent(safeMessage);
    expect(status).not.toHaveTextContent(/sync_local_game_achievements|checked:|[a-z]:\\users\\/i);
    expect(rowView.getByText(/ubisoft: failed/i)).toHaveAttribute("title", safeMessage);
    expect(rowView.getByText("Unavailable")).toBeInTheDocument();
    expect(rowView.queryByText("0/0")).not.toBeInTheDocument();
    expect(launcherMocks.syncGameAchievements).toHaveBeenCalledWith(failedGame);
    expect(rowView.getByRole("link", { name: /retry in library/i })).toHaveAttribute(
      "href",
      "/library?game=ubisoft-rainbow-six",
    );
  });

  it("marks a provider unavailable when its background sync has no readable data", async () => {
    const eaGame: Game = {
      achievements: [],
      description: "",
      externalId: "ea-local-game",
      id: "ea-local-game",
      launcher: "ea",
      platform: "windows",
      status: "installed",
      title: "EA Local Game",
      version: "1.0.0",
    };
    launcherMocks.listInstalledGames.mockResolvedValueOnce([eaGame]);
    launcherMocks.syncGameAchievements.mockRejectedValueOnce(
      new Error(
        "sync_local_game_achievements failed: No local ea achievement cache found for EA Local Game. Checked: C:\\Users\\Danie\\AppData\\Local\\EA\\cache.json",
      ),
    );

    renderAchievementsRoute("/achievements");

    const heading = await screen.findByRole("heading", { name: "EA Local Game" });
    const rowView = within(heading.closest("article")!);
    expect(
      await rowView.findByRole("status", { name: /ea achievement sync unavailable/i }),
    ).toHaveTextContent(
      "No readable EA achievement data was found on this PC. Launch the game through the EA app, then try again.",
    );
    expect(rowView.getByText("Unavailable")).toBeInTheDocument();
    expect(rowView.queryByText("0/0")).not.toBeInTheDocument();
    expect(launcherMocks.updateAchievementProviderStatus).toHaveBeenCalledWith({
      gameId: "ea-local-game",
      status: expect.objectContaining({ source: "ea", status: "failed" }),
    });
  });

  it("clears the previous account rows and rehydrates when the signed-in user changes", async () => {
    const localGame: Game = {
      achievements: [],
      description: "",
      id: "steam-account-game",
      launcher: "steam",
      platform: "windows",
      status: "installed",
      title: "Account Game",
      version: "1.0.0",
    };
    const oldAccountGame: Game = {
      ...localGame,
      achievements: [
        { id: "old-unlock", name: "Old Account Unlock", unlockedAt: "2026-07-01T10:00:00Z" },
      ],
    };
    launcherMocks.listInstalledGames.mockResolvedValue([localGame]);
    achievementMocks.hydrateGamesWithRemoteAchievements
      .mockResolvedValueOnce([oldAccountGame])
      .mockResolvedValueOnce([localGame]);
    useCurrentUserMock.mockReturnValue({
      isLoading: false,
      user: { id: "user-old", user_metadata: {} },
    });

    const view = renderAchievementsRoute("/achievements");
    expect(await screen.findByText("Old Account Unlock")).toBeInTheDocument();

    useCurrentUserMock.mockReturnValue({
      isLoading: false,
      user: { id: "user-new", user_metadata: {} },
    });
    view.rerender(
      <MemoryRouter initialEntries={["/achievements"]}>
        <AchievementsPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Old Account Unlock")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(achievementMocks.hydrateGamesWithRemoteAchievements).toHaveBeenCalledTimes(2),
    );
    expect(achievementMocks.hydrateGamesWithRemoteAchievements).toHaveBeenLastCalledWith(
      [localGame],
      expect.objectContaining({ onError: expect.any(Function), userId: "user-new" }),
    );
    expect(await screen.findByRole("heading", { name: "Account Game" })).toBeInTheDocument();
    expect(
      await screen.findByText("Account Game does not expose a Steam AppID for achievement sync."),
    ).toBeInTheDocument();
  });

  it("renders local cache readiness and skips hosted hydration in verify mode", async () => {
    renderAchievementsRoute("/achievements?verify=achievement-cache-readiness");

    expect(await screen.findByText("No achievement-enabled games found.")).toBeInTheDocument();

    const panel = screen.getByRole("region", { name: /achievement cache readiness/i });
    expect(within(panel).getByText("Cache Readiness")).toBeInTheDocument();
    expect(within(panel).getByText("Local cache fixtures only")).toBeInTheDocument();
    expect(within(panel).getByText("Sidecar review only")).toBeInTheDocument();
    expect(
      within(panel).getByText("No Steam/Xbox/GOG/Epic/EA/Ubisoft/Battle.net provider sync"),
    ).toBeInTheDocument();
    expect(within(panel).getByText("No hosted hydration")).toBeInTheDocument();
    expect(within(panel).getByText("No Supabase writes")).toBeInTheDocument();
    expect(within(panel).getByText("No OAuth/token exchange")).toBeInTheDocument();
    expect(within(panel).getByText("No live unlock import")).toBeInTheDocument();
    expect(within(panel).getByText("No remote cache job")).toBeInTheDocument();
    expect(within(panel).getByText("No provider credential use")).toBeInTheDocument();
    expect(within(panel).getByText("No official unlock proof")).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(falseAchievementCacheClaim);
    expect(achievementMocks.hydrateGamesWithRemoteAchievements).not.toHaveBeenCalled();
  });

  it("renders hosted hydration contract proof without calling remote hydration", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    launcherMocks.listInstalledGames.mockRejectedValueOnce(new Error("Desktop bridge missing"));

    try {
      renderAchievementsRoute("/achievements?verify=achievement-hosted-hydration-contract");

      expect(await screen.findByText("No achievement-enabled games found.")).toBeInTheDocument();

      const panel = screen.getByRole("region", {
        name: /achievement hosted hydration contract/i,
      });
      expect(within(panel).getByText("Hydration Contract")).toBeInTheDocument();
      expect(within(panel).getByText("No-write contract")).toBeInTheDocument();
      expect(within(panel).getByText("Provider Key Filter")).toBeInTheDocument();
      expect(within(panel).getByText("No live hosted staging")).toBeInTheDocument();
      expect(within(panel).getByText("No Supabase writes")).toBeInTheDocument();
      expect(within(panel).getByText("No provider sync")).toBeInTheDocument();
      expect(within(panel).getByText("No trusted ingestion call")).toBeInTheDocument();
      expect(panel).not.toHaveTextContent(falseAchievementCacheClaim);
      expect(achievementMocks.hydrateGamesWithRemoteAchievements).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        "[OG-Launcher] Achievement verify route using empty local list:",
        expect.any(Error),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
