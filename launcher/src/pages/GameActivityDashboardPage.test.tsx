import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GameActivityDashboardPage } from "./GameActivityDashboardPage";

const useUserPlaySessionsMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useUserPlaySessions", () => ({
  useUserPlaySessions: useUserPlaySessionsMock,
}));

let root: Root | null = null;

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
  useUserPlaySessionsMock.mockReturnValue({
    error: null,
    isConfigured: false,
    isLoading: false,
    refetch: vi.fn(),
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

describe("GameActivityDashboardPage", () => {
  it("renders the local yearly recap when Supabase is not configured", async () => {
    const container = renderActivityRoute();

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Game Activity Dashboard");
      expect(container).toHaveTextContent("Local Activity Relay");
      expect(container).toHaveTextContent("Neon Runner");
      expect(container).toHaveTextContent("Share Card");
      expect(container).toHaveTextContent("OG-Launcher Gaming Year");
      expect(container).toHaveTextContent("Browser Share");
      expect(container).toHaveTextContent("Export TXT");
      expect(container).toHaveTextContent("Export SVG");
      expect(
        container.querySelector<HTMLAnchorElement>('a[download^="og-launcher-activity-recap-"]'),
      )?.toHaveAttribute("href", expect.stringContaining("data:text/plain"));
      expect(container.querySelector<HTMLAnchorElement>('a[download$=".svg"]'))?.toHaveAttribute(
        "href",
        expect.stringContaining("data:image/svg+xml"),
      );
      expect(container).toHaveTextContent("Month Tape");
      expect(
        container.querySelector('a[aria-label="Open performance history for Neon Runner"]'),
      ).toHaveAttribute(
        "href",
        "/settings/performance?range=365d&gameId=local-demo-neon-runner&bucket=auto&source=activity#playtime-detail",
      );
    });
  });

  it("filters synced sessions by the selected query year", async () => {
    useUserPlaySessionsMock.mockReturnValue({
      error: null,
      isConfigured: true,
      isLoading: false,
      refetch: vi.fn(),
      sessions: [
        {
          catalogGameId: "game-2025",
          durationMinutes: 125,
          endedAt: "2025-03-01T20:05:00.000Z",
          gameCoverUrl: null,
          gameId: "game-2025",
          gameTitle: "Archive Shift",
          id: "session-2025",
          launcherDeviceId: "test-device",
          platform: "web",
          startedAt: "2025-03-01T18:00:00.000Z",
        },
        {
          catalogGameId: "game-2026",
          durationMinutes: 240,
          endedAt: "2026-03-01T22:00:00.000Z",
          gameCoverUrl: null,
          gameId: "game-2026",
          gameTitle: "Future Shift",
          id: "session-2026",
          launcherDeviceId: "test-device",
          platform: "web",
          startedAt: "2026-03-01T18:00:00.000Z",
        },
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

  it("copies the yearly share card text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });
    const container = renderActivityRoute();

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Copy Card");
    });

    await act(async () => {
      findButton(findShareCard(container), /copy card/i).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("OG-Launcher Gaming Year"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Top game: Neon Runner"));
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
    const container = renderActivityRoute();

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Copy Card");
    });

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
    const container = renderActivityRoute();

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Browser Share");
    });

    await act(async () => {
      findButton(findShareCard(container), /browser share/i).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(canShare).toHaveBeenCalledWith({
      files: [expect.any(File)],
      text: expect.stringContaining("Top game: Neon Runner"),
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
    const container = renderActivityRoute();

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Browser Share");
    });

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
      text: expect.stringContaining("Top game: Neon Runner"),
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
    const container = renderActivityRoute();

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Browser Share");
    });

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
