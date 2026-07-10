import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserPlaySession } from "../lib/supabase/playtime";
import { GameActivityDashboardPage } from "./GameActivityDashboardPage";

const useUserPlaySessionsMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useUserPlaySessions", () => ({
  useUserPlaySessions: useUserPlaySessionsMock,
}));

let root: Root | null = null;

function makeSession({
  durationMinutes = 125,
  gameId = "game-joined-1",
  id = "session-joined-1",
  title = "Joined Archive Shift",
  year = new Date().getFullYear(),
}: {
  durationMinutes?: number;
  gameId?: string;
  id?: string;
  title?: string;
  year?: number;
} = {}): UserPlaySession {
  const startedAt = new Date(year, 2, 1, 18, 0, 0, 0);
  const endedAt = new Date(startedAt.getTime() + durationMinutes * 60_000);

  return {
    catalogGameId: gameId,
    durationMinutes,
    endedAt: endedAt.toISOString(),
    gameCoverUrl: "https://cdn.example.test/joined-archive-shift.jpg",
    gameId,
    gameTitle: title,
    id,
    launcherDeviceId: "test-device",
    platform: "web",
    startedAt: startedAt.toISOString(),
  };
}

function setHookResult(
  overrides: Partial<{
    availableYears: number[];
    error: string | null;
    isAuthenticated: boolean;
    isConfigured: boolean;
    isLoading: boolean;
    refetch: () => void;
    sessions: UserPlaySession[];
  }> = {},
) {
  const result = {
    availableYears: [],
    error: null,
    isAuthenticated: true,
    isConfigured: true,
    isLoading: false,
    refetch: vi.fn(),
    sessions: [makeSession()],
    ...overrides,
  };
  useUserPlaySessionsMock.mockReturnValue(result);
  return result;
}

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
  Object.defineProperty(navigator, "canShare", {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: undefined,
  });
  setHookResult({
    isAuthenticated: false,
    isConfigured: false,
    sessions: [],
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
  useUserPlaySessionsMock.mockReset();
  vi.restoreAllMocks();
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

function renderActivityRoute(initialEntry = "/activity") {
  return renderWithRoot(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<GameActivityDashboardPage />} path="/activity" />
      </Routes>
    </MemoryRouter>,
  );
}

function findButton(container: HTMLElement, label: RegExp) {
  const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
    label.test(candidate.textContent ?? ""),
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

function findShareCard(container: HTMLElement) {
  const shareCard = container.querySelector<HTMLElement>(
    'section[aria-label="Activity recap share card"]',
  );
  if (!shareCard) throw new Error("Share card not found");
  return shareCard;
}

function yearButtonLabels(container: HTMLElement) {
  const yearGroup = container.querySelector('[aria-label="Activity year"]');
  if (!yearGroup) throw new Error("Activity year group not found");
  return Array.from(yearGroup.querySelectorAll("button"), (button) =>
    (button.textContent ?? "").trim(),
  );
}

describe("GameActivityDashboardPage", () => {
  it("uses a stable inclusive-start and exclusive-end calendar range", () => {
    const currentYear = new Date().getFullYear();
    setHookResult({ sessions: [makeSession({ year: currentYear - 2 })] });

    renderActivityRoute(`/activity?year=${currentYear - 2}`);

    expect(useUserPlaySessionsMock).toHaveBeenLastCalledWith({
      includeAvailableYears: true,
      since: new Date(currentYear - 2, 0, 1),
      until: new Date(currentYear - 1, 0, 1),
    });
  });

  it("never substitutes synthetic sessions on plain /activity", () => {
    const container = renderActivityRoute();

    expect(container).toHaveTextContent("Activity data service unavailable");
    expect(container).not.toHaveTextContent("Verification Preview");
    expect(container).not.toHaveTextContent("Sample Data");
    expect(container).not.toHaveTextContent("Neon Runner");
    expect(container).not.toHaveTextContent("Share Card");
  });

  it("activates sample sessions only for the explicit development verification query", () => {
    const currentYear = new Date().getFullYear();
    const previewYear = currentYear - 1;
    const container = renderActivityRoute(`/activity?verify=activity-preview&year=${previewYear}`);

    expect(container).toHaveTextContent("Verification Preview");
    expect(container).toHaveTextContent("Sample Data");
    expect(container).toHaveTextContent(`${previewYear} Gaming Year`);
    expect(container).toHaveTextContent("Neon Runner");
    expect(container).toHaveTextContent("Share Card");
    expect(container).not.toHaveTextContent("Activity data service unavailable");

    act(() => {
      findButton(container, new RegExp(`^${currentYear}$`)).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(container).toHaveTextContent("Verification Preview");
    expect(container).toHaveTextContent("Sample Data");
    expect(container).toHaveTextContent(`${currentYear} Gaming Year`);
    expect(container).toHaveTextContent("Neon Runner");
  });

  it("renders a distinct signed-out state with a sign-in link", () => {
    setHookResult({
      isAuthenticated: false,
      sessions: [],
    });

    const container = renderActivityRoute();

    expect(container).toHaveTextContent("Sign in to load activity");
    expect(container).not.toHaveTextContent("Activity data service unavailable");
    expect(container.querySelector<HTMLAnchorElement>('a[href="/auth"]')).toHaveTextContent(
      "Sign In",
    );
  });

  it("keeps the loading state visible while authentication is hydrating", () => {
    setHookResult({
      isAuthenticated: false,
      isLoading: true,
      sessions: [],
    });

    const container = renderActivityRoute();

    expect(container).toHaveTextContent("Loading yearly activity tape");
    expect(container).not.toHaveTextContent("Sign in to load activity");
  });

  it("shows load errors in the project palette and retries the real reads", () => {
    const refetch = vi.fn();
    setHookResult({
      error: "playtime unavailable",
      refetch,
      sessions: [],
    });

    const container = renderActivityRoute();
    const errorPanel = container.querySelector('[role="alert"]');

    expect(errorPanel).toHaveTextContent("Activity load failed");
    expect(errorPanel).toHaveTextContent("playtime unavailable");
    expect(errorPanel?.className).toContain("bg-[#fff9ed]");
    expect(errorPanel?.className).not.toContain("#fbd6dc");

    act(() => {
      findButton(container, /^retry$/i).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders an honest empty state for the selected Supabase year", () => {
    const currentYear = new Date().getFullYear();
    setHookResult({ sessions: [] });

    const container = renderActivityRoute(`/activity?year=${currentYear - 1}`);

    expect(container).toHaveTextContent(`No sessions recorded in ${currentYear - 1}`);
    expect(container).toHaveTextContent("Supabase has no play sessions for this calendar year");
    expect(container).not.toHaveTextContent("Neon Runner");
    expect(container).not.toHaveTextContent("Share Card");
  });

  it("rejects a requested future year", () => {
    const currentYear = new Date().getFullYear();
    setHookResult({ availableYears: [currentYear + 1], sessions: [] });

    const container = renderActivityRoute(`/activity?year=${currentYear + 1}`);

    expect(container).toHaveTextContent(`${currentYear} Gaming Year`);
    expect(container).not.toHaveTextContent(`${currentYear + 1} Gaming Year`);
    expect(yearButtonLabels(container)).not.toContain(String(currentYear + 1));
    expect(useUserPlaySessionsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        since: new Date(currentYear, 0, 1),
        until: new Date(currentYear + 1, 0, 1),
      }),
    );
  });

  it("keeps current, previous, selected, and Supabase years stable without future years", () => {
    const currentYear = new Date().getFullYear();
    const selectedYear = currentYear - 3;
    setHookResult({
      availableYears: [currentYear + 2, currentYear - 2, currentYear - 4],
      sessions: [],
    });

    const container = renderActivityRoute(`/activity?year=${selectedYear}`);

    expect(yearButtonLabels(container)).toEqual([
      String(currentYear),
      String(currentYear - 1),
      String(currentYear - 2),
      String(selectedYear),
      String(currentYear - 4),
    ]);

    act(() => {
      findButton(container, new RegExp(`^${currentYear - 4}$`)).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(yearButtonLabels(container)).toContain(String(currentYear - 2));
    expect(yearButtonLabels(container)).not.toContain(String(currentYear + 2));
  });

  it("renders the joined Supabase game title in the ready recap", async () => {
    const currentYear = new Date().getFullYear();
    setHookResult({
      availableYears: [currentYear],
      sessions: [
        makeSession({
          gameId: "6809cf82-3c64-4de6-bb53-e2ba06276780",
          title: "Joined Supabase Title",
          year: currentYear,
        }),
      ],
    });

    const container = renderActivityRoute();

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Joined Supabase Title");
      expect(container).not.toHaveTextContent("6809cf82-3c64-4de6-bb53-e2ba06276780");
      expect(container).toHaveTextContent("Share Card");
      expect(container).toHaveTextContent("Month Tape");
    });
  });

  it("filters synced sessions by the selected query year", async () => {
    setHookResult({
      availableYears: [2026, 2025],
      sessions: [
        makeSession({
          gameId: "game-2025",
          id: "session-2025",
          title: "Archive Shift",
          year: 2025,
        }),
        makeSession({
          durationMinutes: 240,
          gameId: "game-2026",
          id: "session-2026",
          title: "Future Shift",
          year: 2026,
        }),
      ],
    });

    const container = renderActivityRoute("/activity?year=2025");

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("2025 Gaming Year");
      expect(container).toHaveTextContent("Archive Shift");
      expect(container).not.toHaveTextContent("Future Shift");
      expect(container).toHaveTextContent("2.1h");
      expect(container).toHaveTextContent("OG-Launcher Gaming Year 2025");
      expect(container).toHaveTextContent("Top game: Archive Shift");
      expect(
        container.querySelector<HTMLAnchorElement>(
          'a[download="og-launcher-activity-recap-2025.txt"]',
        ),
      ).toHaveAttribute("href", expect.stringContaining("Archive%20Shift"));
    });
  });

  it("resets share feedback when the recap year changes", async () => {
    const currentYear = new Date().getFullYear();
    setHookResult({
      availableYears: [currentYear, currentYear - 1],
      sessions: [
        makeSession({ id: "current-session", title: "Current Relay", year: currentYear }),
        makeSession({ id: "archive-session", title: "Archive Relay", year: currentYear - 1 }),
      ],
    });
    const container = renderActivityRoute();

    await act(async () => {
      findButton(findShareCard(container), /copy card/i).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(container).toHaveTextContent("Share card copied.");

    act(() => {
      findButton(container, new RegExp(`^${currentYear - 1}$`)).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    await waitForAssertion(() => {
      expect(container).toHaveTextContent(`${currentYear - 1} Gaming Year`);
      expect(container).toHaveTextContent("Archive Relay");
      expect(container).not.toHaveTextContent("Share card copied.");
      expect(container).toHaveTextContent(`og-launcher-activity-recap-${currentYear - 1}.txt`);
    });
  });

  it("ignores a pending share result after the recap year changes", async () => {
    const currentYear = new Date().getFullYear();
    let resolveClipboard!: () => void;
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveClipboard = resolve;
        }),
    );
    Object.assign(navigator, { clipboard: { writeText } });
    setHookResult({
      availableYears: [currentYear, currentYear - 1],
      sessions: [
        makeSession({ id: "pending-current", title: "Current Relay", year: currentYear }),
        makeSession({ id: "pending-archive", title: "Archive Relay", year: currentYear - 1 }),
      ],
    });
    const container = renderActivityRoute();

    act(() => {
      findButton(findShareCard(container), /copy card/i).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    act(() => {
      findButton(container, new RegExp(`^${currentYear - 1}$`)).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    await act(async () => {
      resolveClipboard();
      await Promise.resolve();
    });

    expect(container).toHaveTextContent(`${currentYear - 1} Gaming Year`);
    expect(container).toHaveTextContent(`og-launcher-activity-recap-${currentYear - 1}.txt`);
    expect(container).not.toHaveTextContent("Share card copied.");
  });

  it("copies the yearly share card text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });
    setHookResult();
    const container = renderActivityRoute();

    await act(async () => {
      findButton(findShareCard(container), /copy card/i).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("OG-Launcher Gaming Year"));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Top game: Joined Archive Shift"),
    );
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Longest run:"));
    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Share card copied.");
    });
  });

  it("shows a copy failure state when clipboard access is unavailable", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, {
      clipboard: { writeText },
    });
    setHookResult();
    const container = renderActivityRoute();

    await act(async () => {
      findButton(findShareCard(container), /copy card/i).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Clipboard unavailable.");
    });
  });

  it("opens the browser share handoff with the yearly SVG file payload", async () => {
    const canShare = vi.fn().mockReturnValue(true);
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: canShare,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    setHookResult();
    const container = renderActivityRoute();

    await act(async () => {
      findButton(findShareCard(container), /browser share/i).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(canShare).toHaveBeenCalledWith({
      files: [expect.any(File)],
      text: expect.stringContaining("Top game: Joined Archive Shift"),
      title: expect.stringContaining("OG-Launcher Gaming Year"),
    });
    expect(share).toHaveBeenCalledWith({
      files: [expect.any(File)],
      text: expect.stringContaining("Longest run:"),
      title: expect.stringContaining("OG-Launcher Gaming Year"),
    });
    const sharedPayload = share.mock.calls[0]?.[0] as ShareData & { files?: File[] };
    expect(sharedPayload.files?.[0]?.name).toMatch(/^og-launcher-activity-recap-\d{4}\.svg$/);
    expect(sharedPayload.files?.[0]?.type).toBe("image/svg+xml");
    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Image file share handoff opened.");
    });
  });

  it("falls back to the yearly text payload when file sharing is unavailable", async () => {
    const canShare = vi.fn((payload: ShareData & { files?: File[] }) => !payload.files);
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: canShare,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    setHookResult();
    const container = renderActivityRoute();

    await act(async () => {
      findButton(findShareCard(container), /browser share/i).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(canShare).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [expect.any(File)],
      }),
    );
    expect(canShare).toHaveBeenCalledWith({
      text: expect.stringContaining("Top game: Joined Archive Shift"),
      title: expect.stringContaining("OG-Launcher Gaming Year"),
    });
    expect(share).toHaveBeenCalledWith({
      text: expect.stringContaining("Longest run:"),
      title: expect.stringContaining("OG-Launcher Gaming Year"),
    });
    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Browser share handoff opened.");
    });
  });

  it("keeps the TXT fallback when browser share is unavailable", async () => {
    setHookResult();
    const container = renderActivityRoute();

    await act(async () => {
      findButton(findShareCard(container), /browser share/i).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Browser share unavailable; TXT fallback ready.");
      expect(
        container.querySelector<HTMLAnchorElement>('a[download^="og-launcher-activity-recap-"]'),
      )?.toHaveAttribute("href", expect.stringContaining("data:text/plain"));
    });
  });
});
