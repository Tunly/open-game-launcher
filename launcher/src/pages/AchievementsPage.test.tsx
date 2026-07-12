import { act, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AchievementsPage } from "./AchievementsPage";
import type { Game, SyncGameAchievementsResponse } from "../lib/types";
import { STORAGE_KEYS } from "../lib/storage-keys";

const launcherMocks = vi.hoisted(() => ({
  listInstalledGames: vi.fn(),
  openAchievementCacheFolder: vi.fn(),
  syncGameAchievements: vi.fn(),
  updateAchievementProviderStatus: vi.fn(),
}));

const achievementMocks = vi.hoisted(() => ({
  hydrateGamesWithRemoteAchievements: vi.fn(),
}));

const useCurrentUserMock = vi.hoisted(() => vi.fn());

const falseAchievementCacheClaim =
  /\b(?:(?:steam|xbox|gog|epic|ea|ubisoft|battle\.?net|provider)\s*(?:achievement|unlock|cache|sidecar)?\s*(?:sync|import|hydration|job)\s*(?:ready|verified|connected|enabled|synced|complete|executed|started|imported)|provider\s*api\s*(?:called|fetched|ready|verified)|hosted\s*(?:hydration|achievement|cache|sync|job)\s*(?:ready|verified|enabled|complete|executed|started)|supabase\s*(?:(?:achievement|unlock|cache|row|write|writes|hydration)\s*)+(?:written|inserted|updated|synced|ready|verified|complete)|oauth\s*(?:token\s*)?(?:exchanged|connected|verified|complete|exchange\s*(?:ready|verified|complete|executed))|token\s*(?:exchange\s*(?:ready|verified|complete|executed)|read\s*(?:ready|verified|complete|executed|started)|used|stored|vaulted)|live\s*unlock\s*(?:imported|synced|ready|complete|import\s*(?:ready|verified|complete|executed|started)|sync\s*(?:ready|verified|complete|executed|started))|remote\s*cache\s*(?:job|sync|hydration)\s*(?:ready|started|executed|complete|synced)|trusted\s*ingestion\s*(?:called|ready|verified|complete|executed|started)|achievement\s*sync\s*(?:ready|verified|enabled|synced|complete|executed|started|imported))\b/i;

vi.mock("../lib/launcher", () => launcherMocks);

vi.mock("../lib/supabase/achievements", () => achievementMocks);

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

describe("AchievementsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    launcherMocks.listInstalledGames.mockResolvedValue([]);
    launcherMocks.openAchievementCacheFolder.mockResolvedValue("/tmp/achievements");
    launcherMocks.syncGameAchievements.mockRejectedValue(
      new Error("Unexpected achievement sync in this test."),
    );
    launcherMocks.updateAchievementProviderStatus.mockImplementation(({ gameId, status }) =>
      Promise.resolve({ id: gameId, achievementProviderStatuses: [status] }),
    );
    achievementMocks.hydrateGamesWithRemoteAchievements.mockImplementation((games) =>
      Promise.resolve(games),
    );
    useCurrentUserMock.mockReturnValue({ isLoading: false, user: null });
  });

  it("uses the signed-in display name and an honest local fallback for the player archive", async () => {
    const local = renderAchievementsRoute("/achievements");

    expect(screen.getByRole("heading", { name: /local player \/ games/i })).toBeInTheDocument();
    expect(screen.queryByText(/daniel/i)).not.toBeInTheDocument();
    await screen.findByText("No achievement-enabled games found.");
    local.unmount();

    useCurrentUserMock.mockReturnValue({
      isLoading: false,
      user: {
        id: "ada",
        email: "ada@example.test",
        user_metadata: { display_name: "Ada Lovelace" },
      },
    });
    renderAchievementsRoute("/achievements");

    expect(screen.getByRole("heading", { name: /ada lovelace \/ games/i })).toBeInTheDocument();
    await screen.findByText("No achievement-enabled games found.");
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
      await screen.findByRole("status", { name: /refreshing cloud achievements/i }),
    ).toBeInTheDocument();
    expect(achievementMocks.hydrateGamesWithRemoteAchievements).toHaveBeenCalledWith([localGame], {
      userId: "user-fast",
    });

    await act(async () => {
      remoteHydration.resolve([hydratedGame]);
      await remoteHydration.promise;
    });

    expect(await screen.findByText("Remote Unlock")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("status", { name: /refreshing cloud achievements/i }),
      ).not.toBeInTheDocument(),
    );
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
        { userId: "restored-user" },
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
      { userId: "user-new" },
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
