import { describe, expect, it } from "vitest";

import {
  buildGameActivityRecapShareImage,
  buildGameActivityRecapShareCard,
  buildGameActivityYearRecap,
  getPlaySessionMinutes,
} from "../game-activity-recap";
import type { UserPlaySession } from "../supabase/playtime";

function session(
  id: string,
  gameId: string,
  gameTitle: string,
  startedAt: string,
  durationMinutes: number | null,
  endedAt?: string | null,
): UserPlaySession {
  return {
    catalogGameId: gameId,
    durationMinutes,
    endedAt: endedAt ?? null,
    gameCoverUrl: null,
    gameId,
    gameTitle,
    id,
    launcherDeviceId: "test-device",
    platform: "web",
    startedAt,
  };
}

describe("game activity recap", () => {
  it("returns an empty yearly recap when there are no sessions", () => {
    const recap = buildGameActivityYearRecap([], { year: 2026 });

    expect(recap.year).toBe(2026);
    expect(recap.totalMinutes).toBe(0);
    expect(recap.totalSessions).toBe(0);
    expect(recap.uniqueGameCount).toBe(0);
    expect(recap.topGame).toBeNull();
    expect(recap.monthlyMinutes).toHaveLength(12);
    expect(recap.longestActiveDayStreak).toBe(0);
  });

  it("filters by year and aggregates top games, months, days, and streaks", () => {
    const recap = buildGameActivityYearRecap(
      [
        session("one", "game-a", "Game A", "2026-01-01T20:00:00.000Z", 90),
        session("two", "game-a", "Game A", "2026-01-02T20:00:00.000Z", 30),
        session("three", "game-b", "Game B", "2026-06-05T10:00:00.000Z", 120),
        session("old", "game-c", "Game C", "2025-06-05T10:00:00.000Z", 999),
      ],
      { year: 2026 },
    );

    expect(recap.totalMinutes).toBe(240);
    expect(recap.totalHours).toBe(4);
    expect(recap.totalSessions).toBe(3);
    expect(recap.uniqueGameCount).toBe(2);
    expect(recap.topGame?.title).toBe("Game A");
    expect(recap.topGame?.minutes).toBe(120);
    expect(recap.topGames[0]?.percent).toBe(50);
    expect(recap.monthlyMinutes[0]?.minutes).toBe(120);
    expect(recap.monthlyMinutes[5]?.minutes).toBe(120);
    expect(recap.activeDayCount).toBe(3);
    expect(recap.longestActiveDayStreak).toBe(2);
    expect(recap.longestSession?.title).toBe("Game B");
  });

  it("falls back to start and end timestamps when duration is missing", () => {
    const row = session(
      "fallback",
      "game-a",
      "Game A",
      "2026-03-02T18:00:00.000Z",
      null,
      "2026-03-02T19:45:00.000Z",
    );

    expect(getPlaySessionMinutes(row)).toBe(105);

    const recap = buildGameActivityYearRecap([row], { year: 2026 });
    expect(recap.totalMinutes).toBe(105);
    expect(recap.longestSession?.minutes).toBe(105);
  });

  it("formats a portable text share card for yearly recaps", () => {
    const recap = buildGameActivityYearRecap(
      [
        session("one", "game-a", "Game A", "2026-01-05T20:00:00.000Z", 90),
        session("two", "game-a", "Game A", "2026-01-06T20:00:00.000Z", 45),
        session("three", "game-b", "Game B", "2026-06-05T10:00:00.000Z", 120),
      ],
      { year: 2026 },
    );

    const shareCard = buildGameActivityRecapShareCard(recap);

    expect(shareCard.fileName).toBe("og-launcher-activity-recap-2026.txt");
    expect(shareCard.title).toBe("OG-Launcher Gaming Year 2026");
    expect(shareCard.text.split("\n")).toEqual([
      "OG-Launcher Gaming Year 2026",
      "4h 15m played across 3 sessions",
      "2 games / 3 active days / 2 day streak",
      "Top game: Game A (2h 15m)",
      "Prime window: Prime Time / Fri / Jan",
      "Longest run: Game B (2h)",
    ]);
  });

  it("formats an empty share card without placeholder leaks", () => {
    const shareCard = buildGameActivityRecapShareCard(
      buildGameActivityYearRecap([], { year: 2026 }),
    );

    expect(shareCard.fileName).toBe("og-launcher-activity-recap-2026.txt");
    expect(shareCard.text.split("\n")).toEqual([
      "OG-Launcher Gaming Year 2026",
      "0m played across 0 sessions",
      "0 games / 0 active days / 0 day streak",
      "Top game: No top game yet",
      "Prime window: No pattern yet",
      "Longest run: No session yet",
    ]);
  });

  it("builds a portable SVG share image with escaped local recap data", () => {
    const recap = buildGameActivityYearRecap(
      [session("one", "game-a", "A&B <Runner>", "2026-01-05T20:00:00.000Z", 90)],
      { year: 2026 },
    );

    const shareImage = buildGameActivityRecapShareImage(recap);

    expect(shareImage.fileName).toBe("og-launcher-activity-recap-2026.svg");
    expect(shareImage.mimeType).toBe("image/svg+xml");
    expect(shareImage.dataUri).toContain("data:image/svg+xml");
    expect(shareImage.svg).toContain("2026 GAMING YEAR");
    expect(shareImage.svg).toContain("A&amp;B &lt;Runner&gt;");
    expect(shareImage.svg).not.toContain("A&B <Runner>");
  });
});
