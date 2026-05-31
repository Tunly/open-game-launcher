import { create } from "zustand";
import type { DownloadItem } from "../lib/types";

export interface DownloadState {
  items: DownloadItem[];
  setItems: (items: DownloadItem[]) => void;
  upsertItem: (item: DownloadItem) => void;
  removeItem: (gameId: string) => void;
  activeCount: () => number;
  pausedCount: () => number;
  completedCount: () => number;
  totalProgress: () => number;
}

export const useDownloadStore = create<DownloadState>()((set, get) => ({
  items: [],

  setItems: (items) =>
    set((state) => {
      const normalizedItems = items.map(normalizeDownloadItem);
      const incomingByGameId = new Map(
        normalizedItems.map((item) => [item.gameId, item]),
      );
      const retainedTerminalItems = state.items.filter(
        (item) =>
          !incomingByGameId.has(item.gameId) &&
          (item.status === "completed" ||
            item.status === "failed" ||
            item.status === "cancelled" ||
            item.status === "error"),
      );

      return { items: [...normalizedItems, ...retainedTerminalItems] };
    }),

  upsertItem: (item) =>
    set((state) => {
      const normalizedItem = normalizeDownloadItem(item);
      const index = state.items.findIndex(
        (i) => i.gameId === normalizedItem.gameId,
      );
      if (index > -1) {
        const updated = [...state.items];
        updated[index] = normalizeDownloadItem({
          ...updated[index],
          ...normalizedItem,
        });
        return { items: updated };
      }
      return { items: [...state.items, normalizedItem] };
    }),

  removeItem: (gameId) =>
    set((state) => ({
      items: state.items.filter((i) => i.gameId !== gameId),
    })),

  activeCount: () =>
    get().items.filter((i) => i.status === "downloading").length,

  pausedCount: () =>
    get().items.filter((i) => i.status === "paused").length,

  completedCount: () =>
    get().items.filter((i) => i.status === "completed").length,

  totalProgress: () => {
    const items = get().items.filter(
      (item) => item.status === "downloading" || item.status === "paused",
    );
    if (items.length === 0) {
      return get().items.some((item) => item.status === "completed") ? 100 : 0;
    }
    return Math.round(
      items.reduce((sum, i) => sum + i.progress, 0) / items.length,
    );
  },
}));

function normalizeDownloadItem(item: DownloadItem): DownloadItem {
  const external = Boolean(item.external);
  const isTerminal =
    item.status === "completed" ||
    item.status === "failed" ||
    item.status === "cancelled" ||
    item.status === "error";

  return {
    ...item,
    progress: clampProgress(item.progress),
    canPause: Boolean(item.canPause) && !external && !isTerminal,
    canCancel: Boolean(item.canCancel) && !external && !isTerminal,
    external,
  };
}

function clampProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, Math.round(progress)));
}
