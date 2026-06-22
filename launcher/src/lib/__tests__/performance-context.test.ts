import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  OVERLAY_RUNTIME_GAME_ID,
  readActivePerformanceGameContext,
  readActivePerformanceGameContextFromLocation,
  readStoredActivePerformanceGameContext,
  resolvePerformanceAttribution,
  writeActivePerformanceGameContext,
} from "../performance-context";
import { STORAGE_KEYS } from "../storage-keys";

describe("performance active game context", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
    vi.useRealTimers();
  });

  it("stores active game context with a finite expiry", () => {
    const context = writeActivePerformanceGameContext(
      { gameId: "steam-owned-440", gameTitle: "Team Fortress 2", launcher: "steam" },
      Date.parse("2026-06-09T10:00:00.000Z"),
    );

    expect(context).toEqual({
      gameId: "steam-owned-440",
      gameTitle: "Team Fortress 2",
      launcher: "steam",
      startedAt: "2026-06-09T10:00:00.000Z",
      expiresAt: "2026-06-09T18:00:00.000Z",
    });
    expect(readStoredActivePerformanceGameContext(Date.parse("2026-06-09T11:00:00.000Z"))).toEqual(
      context,
    );
  });

  it("prefers explicit overlay URL context over stored context", () => {
    writeActivePerformanceGameContext(
      { gameId: "stored-game", gameTitle: "Stored Game" },
      Date.parse("2026-06-09T10:00:00.000Z"),
    );
    window.history.replaceState({}, "", "/overlay?gameId=url-game&gameTitle=URL%20Game");

    expect(readActivePerformanceGameContext()?.gameId).toBe("url-game");
    expect(readActivePerformanceGameContext()?.gameTitle).toBe("URL Game");
  });

  it("falls back to stored context when URL context is expired", () => {
    const nowMs = Date.parse("2026-06-09T12:00:00.000Z");
    writeActivePerformanceGameContext(
      { gameId: "stored-game", gameTitle: "Stored Game" },
      Date.parse("2026-06-09T10:00:00.000Z"),
    );
    window.history.replaceState(
      {},
      "",
      "/overlay?gameId=expired-url-game&expiresAt=2026-06-09T11%3A00%3A00.000Z",
    );

    expect(readActivePerformanceGameContext(nowMs)?.gameId).toBe("stored-game");
  });

  it("reads hash query context used by floating windows", () => {
    expect(
      readActivePerformanceGameContextFromLocation({
        search: "",
        hash: "#overlay?gameId=hash-game&launcher=gog",
      })?.launcher,
    ).toBe("gog");
  });

  it("drops expired stored context", () => {
    window.localStorage.setItem(
      STORAGE_KEYS.PERFORMANCE_ACTIVE_GAME,
      JSON.stringify({
        gameId: "old-game",
        gameTitle: "Old Game",
        launcher: "steam",
        startedAt: "2026-06-09T09:00:00.000Z",
        expiresAt: "2026-06-09T10:00:00.000Z",
      }),
    );

    expect(readStoredActivePerformanceGameContext(Date.parse("2026-06-09T10:00:01.000Z"))).toBe(
      null,
    );
    expect(window.localStorage.getItem(STORAGE_KEYS.PERFORMANCE_ACTIVE_GAME)).toBeNull();
  });

  it("drops stored context with invalid dates", () => {
    window.localStorage.setItem(
      STORAGE_KEYS.PERFORMANCE_ACTIVE_GAME,
      JSON.stringify({
        gameId: "broken-game",
        gameTitle: "Broken Game",
        launcher: "manual",
        startedAt: "not-a-date",
        expiresAt: "also-not-a-date",
      }),
    );

    expect(readStoredActivePerformanceGameContext(Date.parse("2026-06-09T10:00:01.000Z"))).toBe(
      null,
    );
    expect(window.localStorage.getItem(STORAGE_KEYS.PERFORMANCE_ACTIVE_GAME)).toBeNull();
  });

  it("drops malformed stored context JSON", () => {
    window.localStorage.setItem(STORAGE_KEYS.PERFORMANCE_ACTIVE_GAME, "{bad-json");

    expect(readStoredActivePerformanceGameContext(Date.parse("2026-06-09T10:00:01.000Z"))).toBe(
      null,
    );
    expect(window.localStorage.getItem(STORAGE_KEYS.PERFORMANCE_ACTIVE_GAME)).toBeNull();
  });

  it("falls back without throwing when browser storage access is blocked", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage blocked");
      },
    });

    try {
      expect(writeActivePerformanceGameContext({ gameId: "blocked-game" })).toBeNull();
      expect(readStoredActivePerformanceGameContext()).toBeNull();
      expect(resolvePerformanceAttribution(readActivePerformanceGameContext())).toEqual(
        expect.objectContaining({
          gameId: OVERLAY_RUNTIME_GAME_ID,
          isFallback: true,
        }),
      );
    } finally {
      if (descriptor) {
        Object.defineProperty(window, "localStorage", descriptor);
      }
    }
  });

  it("falls back without throwing when setItem fails", () => {
    withMockedLocalStorage(
      makeThrowingStorage({
        setItem: () => {
          throw new Error("quota exceeded");
        },
      }),
      () => {
        expect(writeActivePerformanceGameContext({ gameId: "blocked-game" })).toBeNull();
      },
    );
  });

  it("falls back without throwing when getItem fails", () => {
    withMockedLocalStorage(
      makeThrowingStorage({
        getItem: () => {
          throw new Error("read blocked");
        },
      }),
      () => {
        expect(readStoredActivePerformanceGameContext()).toBeNull();
      },
    );
  });

  it("falls back without throwing when invalid context cleanup fails", () => {
    withMockedLocalStorage(
      makeThrowingStorage({
        getItem: () => JSON.stringify({ gameId: "broken-game" }),
        removeItem: () => {
          throw new Error("remove blocked");
        },
      }),
      () => {
        expect(readStoredActivePerformanceGameContext()).toBeNull();
      },
    );
  });

  it("resolves missing context to standalone overlay attribution", () => {
    expect(resolvePerformanceAttribution(null)).toEqual(
      expect.objectContaining({
        gameId: OVERLAY_RUNTIME_GAME_ID,
        isFallback: true,
        label: "Standalone Overlay",
      }),
    );
  });

  it("resolves active context to game attribution", () => {
    expect(
      resolvePerformanceAttribution({
        gameId: "steam-owned-440",
        gameTitle: "Team Fortress 2",
        launcher: "steam",
        startedAt: "2026-06-09T10:00:00.000Z",
        expiresAt: "2026-06-09T18:00:00.000Z",
      }),
    ).toEqual(
      expect.objectContaining({
        gameId: "steam-owned-440",
        isFallback: false,
        label: "Team Fortress 2",
      }),
    );
  });
});

function makeThrowingStorage(overrides: Partial<Storage>): Storage {
  return {
    clear: vi.fn(),
    getItem: vi.fn(() => null),
    key: vi.fn(() => null),
    length: 0,
    removeItem: vi.fn(),
    setItem: vi.fn(),
    ...overrides,
  };
}

function withMockedLocalStorage(storage: Storage, run: () => void) {
  const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });

  try {
    run();
  } finally {
    if (descriptor) {
      Object.defineProperty(window, "localStorage", descriptor);
    }
  }
}
