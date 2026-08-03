import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  activityRangeToPerformanceRange,
  buildPerformanceHistoryPath,
} from "../../lib/activity-performance-links";
import { ActivitySection } from "./ActivitySection";

const useUserPlaySessionsMock = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useUserPlaySessions", () => ({
  useUserPlaySessions: useUserPlaySessionsMock,
}));

let root: Root | null = null;

beforeEach(() => {
  useUserPlaySessionsMock.mockReturnValue({
    error: null,
    isConfigured: true,
    isLoading: false,
    refetch: vi.fn(),
    sessions: [
      {
        catalogGameId: "game-1",
        durationMinutes: 125,
        endedAt: new Date().toISOString(),
        gameCoverUrl: null,
        gameId: "game-1",
        gameTitle: "Game One",
        id: "session-1",
        launcherDeviceId: "test-device",
        platform: "web",
        startedAt: new Date().toISOString(),
      },
    ],
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
  useUserPlaySessionsMock.mockReset();
});

function renderWithRoot(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
  return container;
}

async function waitForAssertion(assertion: () => void) {
  const timeoutAt = Date.now() + 1000;
  let lastError: unknown;

  while (Date.now() < timeoutAt) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

describe("ActivitySection performance history links", () => {
  it("maps the week activity range to the 7d performance range", () => {
    expect(activityRangeToPerformanceRange("week")).toBe("7d");
    expect(buildPerformanceHistoryPath("week", "game-1")).toBe(
      "/settings/performance?range=7d&gameId=game-1&bucket=auto&source=activity#playtime-detail",
    );
  });

  it("links top games to performance history with the selected game id", async () => {
    const container = renderWithRoot(
      <MemoryRouter>
        <ActivitySection />
      </MemoryRouter>,
    );

    await waitForAssertion(() => {
      const link = container.querySelector<HTMLAnchorElement>(
        'a[aria-label="Open performance history for Game One"]',
      );
      expect(link).toHaveAttribute(
        "href",
        "/settings/performance?range=7d&gameId=game-1&bucket=auto&source=activity#playtime-detail",
      );
      expect(
        container.querySelector<HTMLAnchorElement>(
          'a[aria-label="Open yearly activity dashboard"]',
        ),
      ).toHaveAttribute("href", "/activity/recap");
    });

    expect(useUserPlaySessionsMock).toHaveBeenCalledWith({
      since: expect.any(Date),
      until: expect.any(Date),
    });
    const [{ since, until }] = useUserPlaySessionsMock.mock.calls.at(-1) as [
      { since: Date; until: Date },
    ];
    expect(until.getTime() - since.getTime()).toBeGreaterThan(330 * 24 * 60 * 60 * 1_000);
    expect(until.getTime() - since.getTime()).toBeLessThan(370 * 24 * 60 * 60 * 1_000);
  });

  it("renders local preview sessions when Supabase is not configured", async () => {
    useUserPlaySessionsMock.mockReturnValue({
      error: null,
      isConfigured: false,
      isLoading: false,
      refetch: vi.fn(),
      sessions: [],
    });

    const container = renderWithRoot(
      <MemoryRouter>
        <ActivitySection />
      </MemoryRouter>,
    );

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Local Activity Relay");
      expect(container).toHaveTextContent("Neon Runner");
    });
  });
});
