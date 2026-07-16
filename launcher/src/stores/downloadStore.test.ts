import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import type { DownloadItem } from "../lib/types";
import {
  isActiveDownloadItem,
  isLiveDownloadItem,
  isPausedDownloadItem,
  isTerminalDownloadItem,
  selectActiveCount,
  selectCompletedCount,
  selectPausedCount,
  selectTotalProgress,
  useDownloadStore,
} from "./downloadStore";

function makeItem(overrides: Partial<DownloadItem> = {}): DownloadItem {
  return {
    gameId: "game-1",
    id: "item-1",
    progress: 0,
    speed: "0 B/s",
    status: "queued",
    title: "Test",
    ...overrides,
  };
}

describe("useDownloadStore", () => {
  beforeEach(() => {
    useDownloadStore.setState({ items: [] });
  });

  it("upserts a new item and normalises progress", () => {
    act(() => {
      useDownloadStore.getState().upsertItem(makeItem({ progress: 150 }));
    });

    const items = useDownloadStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].progress).toBe(100);
  });

  it("merges updates for an existing gameId", () => {
    act(() => {
      useDownloadStore.getState().upsertItem(makeItem({ progress: 10 }));
      useDownloadStore
        .getState()
        .upsertItem(makeItem({ gameId: "game-1", progress: 50, status: "downloading" }));
    });

    const items = useDownloadStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].progress).toBe(50);
    expect(items[0].status).toBe("downloading");
  });

  it("removes items by gameId", () => {
    act(() => {
      useDownloadStore.getState().setItems([makeItem({ gameId: "a" }), makeItem({ gameId: "b" })]);
      useDownloadStore.getState().removeItem("a");
    });
    expect(useDownloadStore.getState().items.map((item) => item.gameId)).toEqual(["b"]);
  });

  it("setItems caps terminal items even when the native queue returns many old rows", () => {
    const initial: DownloadItem[] = Array.from({ length: 150 }, (_, index) =>
      makeItem({ gameId: `done-${index}`, status: "completed" }),
    );
    act(() => {
      useDownloadStore.getState().setItems(initial);
    });
    expect(useDownloadStore.getState().items).toHaveLength(100);
    expect(useDownloadStore.getState().items.map((item) => item.gameId)).toContain("done-149");
    expect(useDownloadStore.getState().items.map((item) => item.gameId)).not.toContain("done-0");

    // Second call with a fresh active item keeps up to 100 of the prior terminal items too.
    act(() => {
      useDownloadStore.getState().setItems([makeItem({ gameId: "fresh" })]);
    });
    const retainedIds = useDownloadStore.getState().items.map((item) => item.gameId);
    // New active item comes first, then at most 100 retained terminal items.
    expect(retainedIds[0]).toBe("fresh");
    expect(retainedIds).toHaveLength(101);
    // The cap keeps the *latest* terminal ids and discards the oldest.
    expect(retainedIds).toContain("done-149");
    expect(retainedIds).not.toContain("done-0");
    expect(retainedIds).not.toContain("done-49");
  });

  it("upsertItem caps terminal items during long event streams", () => {
    act(() => {
      for (let index = 0; index < 140; index += 1) {
        useDownloadStore
          .getState()
          .upsertItem(makeItem({ gameId: `stream-done-${index}`, status: "completed" }));
      }
      useDownloadStore.getState().upsertItem(makeItem({ gameId: "active", status: "downloading" }));
    });

    const ids = useDownloadStore.getState().items.map((item) => item.gameId);
    expect(ids).toHaveLength(101);
    expect(ids).toContain("active");
    expect(ids).toContain("stream-done-139");
    expect(ids).not.toContain("stream-done-0");
  });

  it("upsertItems batches progress updates and keeps the latest event per game", () => {
    act(() => {
      useDownloadStore
        .getState()
        .upsertItems([
          makeItem({ gameId: "game-1", progress: 10, status: "downloading" }),
          makeItem({ gameId: "game-2", progress: 25, status: "queued" }),
          makeItem({ gameId: "game-1", progress: 80, status: "downloading" }),
        ]);
    });

    const state = useDownloadStore.getState();
    expect(state.items).toHaveLength(2);
    expect(state.items.find((item) => item.gameId === "game-1")?.progress).toBe(80);
    expect(state.items.find((item) => item.gameId === "game-2")?.progress).toBe(25);
  });

  it("clamps NaN/Infinity progress to 0", () => {
    act(() => {
      useDownloadStore.getState().upsertItem(makeItem({ progress: Number.NaN }));
    });
    expect(useDownloadStore.getState().items[0].progress).toBe(0);

    act(() => {
      useDownloadStore
        .getState()
        .upsertItem(makeItem({ gameId: "g2", progress: Number.POSITIVE_INFINITY }));
    });
    // clampProgress treats anything non-finite (NaN, +/-Infinity) as 0.
    expect(useDownloadStore.getState().items.find((item) => item.gameId === "g2")!.progress).toBe(
      0,
    );
  });

  it("canCancel and canPause are cleared for terminal items", () => {
    act(() => {
      useDownloadStore
        .getState()
        .upsertItem(makeItem({ canCancel: true, canPause: true, status: "downloading" }));
    });
    act(() => {
      useDownloadStore
        .getState()
        .upsertItem(makeItem({ canCancel: true, canPause: true, status: "completed" }));
    });
    const item = useDownloadStore.getState().items[0];
    expect(item.canCancel).toBe(false);
    expect(item.canPause).toBe(false);
  });

  it("canPause is false for non-steam external downloads", () => {
    act(() => {
      useDownloadStore
        .getState()
        .upsertItem(
          makeItem({ canPause: true, external: true, gameId: "epic-123", status: "downloading" }),
        );
    });
    expect(useDownloadStore.getState().items[0].canPause).toBe(false);
  });

  it("canPause is allowed for steam downloads", () => {
    act(() => {
      useDownloadStore
        .getState()
        .upsertItem(
          makeItem({ canPause: true, external: true, gameId: "steam-1234", status: "downloading" }),
        );
    });
    expect(useDownloadStore.getState().items[0].canPause).toBe(true);
  });
});

describe("downloadStore derived counts", () => {
  beforeEach(() => {
    useDownloadStore.setState({ items: [] });
  });

  it("counts active and completed items", () => {
    act(() => {
      useDownloadStore
        .getState()
        .setItems([
          makeItem({ gameId: "a", status: "downloading" }),
          makeItem({ gameId: "b", status: "paused" }),
          makeItem({ gameId: "c", status: "completed" }),
          makeItem({ gameId: "d", status: "failed" }),
          makeItem({ gameId: "e", status: "pausing" }),
        ]);
    });

    const state = useDownloadStore.getState();
    expect(selectActiveCount(state)).toBe(1);
    expect(selectPausedCount(state)).toBe(2);
    expect(selectCompletedCount(state)).toBe(1);
  });

  it("totalProgress averages live items and falls back to 100 when only completed exist", () => {
    act(() => {
      useDownloadStore
        .getState()
        .setItems([
          makeItem({ gameId: "a", progress: 20, status: "downloading" }),
          makeItem({ gameId: "b", progress: 80, status: "downloading" }),
        ]);
    });
    expect(selectTotalProgress(useDownloadStore.getState())).toBe(50);

    act(() => {
      useDownloadStore.getState().setItems([makeItem({ gameId: "c", status: "completed" })]);
    });
    expect(selectTotalProgress(useDownloadStore.getState())).toBe(100);
  });
});

describe("downloadStore predicate helpers", () => {
  it.each([
    ["completed", true, false, false],
    ["failed", true, false, false],
    ["downloading", false, true, true],
    ["pausing", false, false, true],
    ["paused", false, false, true],
    ["queued", false, true, true],
  ] as const)("classifies %s status", (status, terminal, active, live) => {
    const item = makeItem({ status });
    expect(isTerminalDownloadItem(item)).toBe(terminal);
    expect(isActiveDownloadItem(item)).toBe(active);
    expect(isPausedDownloadItem(item)).toBe(status === "pausing" || status === "paused");
    expect(isLiveDownloadItem(item)).toBe(live);
  });
});
