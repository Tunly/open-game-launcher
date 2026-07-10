import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ModInstallQueueItem, ModInstallStatus } from "../lib/types/mods";
import {
  isActiveModInstallItem,
  isTerminalModInstallItem,
  selectActiveModInstallCount,
  selectCompletedModInstallCount,
  selectDelegatedModInstallCount,
  selectModInstallTotalProgress,
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
      useModInstallStore
        .getState()
        .upsertItem(makeItem({ status: "garbage" as unknown as ModInstallStatus }));
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
    expect(useModInstallStore.getState().items.find((i) => i.installId === "i2")!.progress).toBe(
      100,
    );
  });

  it("sorts items by status rank on every mutation", () => {
    act(() => {
      useModInstallStore
        .getState()
        .setItems([
          makeItem({ installId: "completed-a", status: "completed" }),
          makeItem({ installId: "downloading", status: "downloading" }),
          makeItem({ installId: "failed-a", status: "failed" }),
        ]);
    });
    const ids = useModInstallStore.getState().items.map((i) => i.installId);
    // Status rank: active (0) < delegated (1) < failed (2) < cancelled (3) < completed (4).
    expect(ids[0]).toBe("downloading");
    expect(ids[ids.length - 1]).toBe("completed-a");
    expect(ids).toEqual(["downloading", "failed-a", "completed-a"]);
  });

  it("removes items by installId", () => {
    act(() => {
      useModInstallStore
        .getState()
        .setItems([makeItem({ installId: "a" }), makeItem({ installId: "b" })]);
      useModInstallStore.getState().removeItem("a");
    });
    expect(useModInstallStore.getState().items.map((i) => i.installId)).toEqual(["b"]);
  });

  it("merges updates for an existing installId", () => {
    act(() => {
      useModInstallStore.getState().upsertItem(makeItem({ installId: "x", progress: 10 }));
      useModInstallStore
        .getState()
        .upsertItem(makeItem({ installId: "x", progress: 70, status: "installing" }));
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
  });

  it("totalProgress averages active + delegated items, falls back to 100 with completed only", () => {
    act(() => {
      useModInstallStore
        .getState()
        .setItems([
          makeItem({ installId: "a", progress: 20, status: "downloading" }),
          makeItem({ installId: "b", progress: 40, status: "delegated" }),
        ]);
    });
    expect(selectModInstallTotalProgress(useModInstallStore.getState())).toBe(30);

    act(() => {
      useModInstallStore.getState().setItems([makeItem({ installId: "c", status: "completed" })]);
    });
    expect(selectModInstallTotalProgress(useModInstallStore.getState())).toBe(100);

    act(() => {
      useModInstallStore.getState().setItems([]);
    });
    expect(selectModInstallTotalProgress(useModInstallStore.getState())).toBe(0);
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
