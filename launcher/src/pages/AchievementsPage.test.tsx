import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AchievementsPage } from "./AchievementsPage";
import type { Game } from "../lib/types";

const launcherMocks = vi.hoisted(() => ({
  listInstalledGames: vi.fn(),
  openAchievementCacheFolder: vi.fn(),
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

describe("AchievementsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    launcherMocks.listInstalledGames.mockResolvedValue([]);
    launcherMocks.openAchievementCacheFolder.mockResolvedValue("/tmp/achievements");
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
    expect(achievementMocks.hydrateGamesWithRemoteAchievements).toHaveBeenCalledTimes(1);
    expect(achievementMocks.hydrateGamesWithRemoteAchievements).toHaveBeenCalledWith([]);
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

  it("keeps failed and unsynced provider games visible with a retry drilldown", async () => {
    const failedGame: Game = {
      achievements: [],
      achievementProviderStatuses: [
        {
          message: "Hosted ingestion timed out",
          source: "steam",
          stability: "official",
          status: "failed",
        },
      ],
      description: "",
      id: "steam-failed",
      launcher: "steam",
      platform: "windows",
      status: "installed",
      title: "Retry Game",
      version: "1.0.0",
    };
    launcherMocks.listInstalledGames.mockResolvedValueOnce([failedGame]);

    renderAchievementsRoute("/achievements");

    expect(await screen.findByRole("heading", { name: "Retry Game" })).toBeInTheDocument();
    expect(screen.getByText("Hosted ingestion timed out")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /retry in library/i })).toHaveAttribute(
      "href",
      "/library?game=steam-failed",
    );
  });

  it("clears the previous account rows and rehydrates when the signed-in user changes", async () => {
    const oldGame: Game = {
      achievements: [
        { id: "old-unlock", name: "Old Account Unlock", unlockedAt: "2026-07-01T10:00:00Z" },
      ],
      description: "",
      id: "steam-account-game",
      launcher: "steam",
      platform: "windows",
      status: "installed",
      title: "Account Game",
      version: "1.0.0",
    };
    launcherMocks.listInstalledGames.mockResolvedValue([oldGame]);
    achievementMocks.hydrateGamesWithRemoteAchievements
      .mockResolvedValueOnce([oldGame])
      .mockResolvedValueOnce([{ ...oldGame, achievements: [] }]);
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
    expect(achievementMocks.hydrateGamesWithRemoteAchievements).toHaveBeenLastCalledWith([oldGame]);
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
