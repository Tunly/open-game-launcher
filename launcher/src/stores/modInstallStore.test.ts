import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ModInstallQueueItem, ModInstallStatus } from "../lib/types/mods";
import {
  isActiveModInstallItem,
  isTerminalModInstallItem,
<<<<<<< HEAD
  selectActiveModInstallCount,
  selectCompletedModInstallCount,
  selectDelegatedModInstallCount,
  selectModInstallTotalProgress,
=======
>>>>>>> feature/phase-3-librarypage-refactor
  useModInstallStore,
} from "./modInstallStore";

function makeItem(overrides: Partial<ModInstallQueueItem> = {}): ModInstallQueueItem {
  return {
    external: false,
    gameId: "game-1",
    id: "row-1",
    installId: "install-1",
    lastUpdatedAt: 0,
    phase: "",
    progress: 0,
    provider: "local_archive",
    speed: "0 B/s",
    status: "queued",
    title: "Test",
    canCancel: false,
    canPause: false,
    ...overrides,
  };
}

describe("useModInstallStore", () => {
  beforeEach(() => {
    useModInstallStore.setState({ items: [] });
  });

  it("upserts a new item and normalises unknown statuses to failed", () => {
    act(() => {
<<<<<<< HEAD
      useModInstallStore
        .getState()
        .upsertItem(makeItem({ status: "garbage" as unknown as ModInstallStatus }));
=======
      useModInstallStore.getState().upsertItem(
        makeItem({ status: "garbage" as unknown as ModInstallStatus }),
      );
>>>>>>> feature/phase-3-librarypage-refactor
    });
    expect(useModInstallStore.getState().items[0].status).toBe("failed");
  });

  it("clamps NaN/Infinity progress to 0", () => {
    act(() => {
      useModInstallStore.getState().upsertItem(makeItem({ progress: Number.NaN }));
    });
    expect(useModInstallStore.getState().items[0].progress).toBe(0);

    act(() => {
      useModInstallStore.getState().upsertItem(makeItem({ installId: "i2", progress: 250 }));
    });
<<<<<<< HEAD
    expect(useModInstallStore.getState().items.find((i) => i.installId === "i2")!.progress).toBe(
      100,
    );
=======
    expect(useModInstallStore.getState().items.find((i) => i.installId === "i2")!.progress).toBe(100);
>>>>>>> feature/phase-3-librarypage-refactor
  });

  it("sorts items by status rank on every mutation", () => {
    act(() => {
<<<<<<< HEAD
      useModInstallStore
        .getState()
        .setItems([
          makeItem({ installId: "completed-a", status: "completed" }),
          makeItem({ installId: "downloading", status: "downloading" }),
          makeItem({ installId: "failed-a", status: "failed" }),
        ]);
=======
      useModInstallStore.getState().setItems([
        makeItem({ installId: "completed-a", status: "completed" }),
        makeItem({ installId: "downloading", status: "downloading" }),
        makeItem({ installId: "failed-a", status: "failed" }),
      ]);
>>>>>>> feature/phase-3-librarypage-refactor
    });
    const ids = useModInstallStore.getState().items.map((i) => i.installId);
    // Status rank: active (0) < delegated (1) < failed (2) < cancelled (3) < completed (4).
    expect(ids[0]).toBe("downloading");
    expect(ids[ids.length - 1]).toBe("completed-a");
    expect(ids).toEqual(["downloading", "failed-a", "completed-a"]);
  });

  it("removes items by installId", () => {
    act(() => {
<<<<<<< HEAD
      useModInstallStore
        .getState()
        .setItems([makeItem({ installId: "a" }), makeItem({ installId: "b" })]);
=======
      useModInstallStore.getState().setItems([
        makeItem({ installId: "a" }),
        makeItem({ installId: "b" }),
      ]);
>>>>>>> feature/phase-3-librarypage-refactor
      useModInstallStore.getState().removeItem("a");
    });
    expect(useModInstallStore.getState().items.map((i) => i.installId)).toEqual(["b"]);
  });

  it("merges updates for an existing installId", () => {
    act(() => {
      useModInstallStore.getState().upsertItem(makeItem({ installId: "x", progress: 10 }));
<<<<<<< HEAD
      useModInstallStore
        .getState()
        .upsertItem(makeItem({ installId: "x", progress: 70, status: "installing" }));
=======
      useModInstallStore.getState().upsertItem(makeItem({ installId: "x", progress: 70, status: "installing" }));
>>>>>>> feature/phase-3-librarypage-refactor
    });
    const items = useModInstallStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].progress).toBe(70);
    expect(items[0].status).toBe("installing");
  });
});

describe("modInstallStore derived counts", () => {
  beforeEach(() => {
    useModInstallStore.setState({ items: [] });
  });

  it("counts active, delegated, and completed items", () => {
    act(() => {
<<<<<<< HEAD
      useModInstallStore
        .getState()
        .setItems([
          makeItem({ installId: "d1", status: "downloading" }),
          makeItem({ installId: "d2", status: "installing" }),
          makeItem({ installId: "g1", status: "delegated" }),
          makeItem({ installId: "c1", status: "completed" }),
          makeItem({ installId: "f1", status: "failed" }),
        ]);
    });
    const state = useModInstallStore.getState();
    expect(selectActiveModInstallCount(state)).toBe(2);
    expect(selectDelegatedModInstallCount(state)).toBe(1);
    expect(selectCompletedModInstallCount(state)).toBe(1);
=======
      useModInstallStore.getState().setItems([
        makeItem({ installId: "d1", status: "downloading" }),
        makeItem({ installId: "d2", status: "installing" }),
        makeItem({ installId: "g1", status: "delegated" }),
        makeItem({ installId: "c1", status: "completed" }),
        makeItem({ installId: "f1", status: "failed" }),
      ]);
    });
    const state = useModInstallStore.getState();
    expect(state.activeCount()).toBe(2);
    expect(state.delegatedCount()).toBe(1);
    expect(state.completedCount()).toBe(1);
>>>>>>> feature/phase-3-librarypage-refactor
  });

  it("totalProgress averages active + delegated items, falls back to 100 with completed only", () => {
    act(() => {
<<<<<<< HEAD
      useModInstallStore
        .getState()
        .setItems([
          makeItem({ installId: "a", progress: 20, status: "downloading" }),
          makeItem({ installId: "b", progress: 40, status: "delegated" }),
        ]);
    });
    expect(selectModInstallTotalProgress(useModInstallStore.getState())).toBe(30);
=======
      useModInstallStore.getState().setItems([
        makeItem({ installId: "a", progress: 20, status: "downloading" }),
        makeItem({ installId: "b", progress: 40, status: "delegated" }),
      ]);
    });
    expect(useModInstallStore.getState().totalProgress()).toBe(30);
>>>>>>> feature/phase-3-librarypage-refactor

    act(() => {
      useModInstallStore.getState().setItems([makeItem({ installId: "c", status: "completed" })]);
    });
<<<<<<< HEAD
    expect(selectModInstallTotalProgress(useModInstallStore.getState())).toBe(100);
=======
    expect(useModInstallStore.getState().totalProgress()).toBe(100);
>>>>>>> feature/phase-3-librarypage-refactor
  });
});

describe("modInstallStore predicate helpers", () => {
  it.each([
    ["completed", true, false],
    ["failed", true, false],
    ["cancelled", true, false],
    ["queued", false, true],
    ["downloading", false, true],
    ["installing", false, true],
    ["delegated", false, false], // not in the "active" set; only in delegatedCount
  ] as const)("classifies %s status", (status, terminal, active) => {
    const item = makeItem({ status });
    expect(isTerminalModInstallItem(item)).toBe(terminal);
    expect(isActiveModInstallItem(item)).toBe(active);
  });
});
