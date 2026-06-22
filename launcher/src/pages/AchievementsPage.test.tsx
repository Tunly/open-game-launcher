import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AchievementsPage } from "./AchievementsPage";

const launcherMocks = vi.hoisted(() => ({
  listInstalledGames: vi.fn(),
  openAchievementCacheFolder: vi.fn(),
}));

const achievementMocks = vi.hoisted(() => ({
  hydrateGamesWithRemoteAchievements: vi.fn(),
}));

const falseAchievementCacheClaim =
  /\b(?:(?:steam|xbox|gog|epic|ea|ubisoft|battle\.?net|provider)\s*(?:achievement|unlock|cache|sidecar)?\s*(?:sync|import|hydration|job)\s*(?:ready|verified|connected|enabled|synced|complete|executed|started|imported)|provider\s*api\s*(?:called|fetched|ready|verified)|hosted\s*(?:hydration|achievement|cache|sync|job)\s*(?:ready|verified|enabled|complete|executed|started)|supabase\s*(?:(?:achievement|unlock|cache|row|write|writes|hydration)\s*)+(?:written|inserted|updated|synced|ready|verified|complete)|oauth\s*(?:token\s*)?(?:exchanged|connected|verified|complete|exchange\s*(?:ready|verified|complete|executed))|token\s*(?:exchange\s*(?:ready|verified|complete|executed)|read\s*(?:ready|verified|complete|executed|started)|used|stored|vaulted)|live\s*unlock\s*(?:imported|synced|ready|complete|import\s*(?:ready|verified|complete|executed|started)|sync\s*(?:ready|verified|complete|executed|started))|remote\s*cache\s*(?:job|sync|hydration)\s*(?:ready|started|executed|complete|synced)|trusted\s*ingestion\s*(?:called|ready|verified|complete|executed|started)|achievement\s*sync\s*(?:ready|verified|enabled|synced|complete|executed|started|imported))\b/i;

vi.mock("../lib/launcher", () => launcherMocks);

vi.mock("../lib/supabase/achievements", () => achievementMocks);

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
