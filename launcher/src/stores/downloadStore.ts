import { create } from "zustand";
import type { DownloadItem, DownloadStatus } from "../lib/types";

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

const MAX_RETAINED_TERMINAL_ITEMS = 100;
const TERMINAL_STATUSES = new Set<DownloadStatus>([
  "completed",
  "failed",
  "cancelled",
  "error",
]);
const ACTIVE_STATUSES = new Set<DownloadStatus>([
  "queued",
  "starting",
  "downloading",
  "pausing",
  "resuming",
  "installing",
]);
const PAUSED_STATUSES = new Set<DownloadStatus>(["paused"]);
const PAUSE_TOGGLE_STATUSES = new Set<DownloadStatus>([
  "downloading",
  "paused",
]);

export const useDownloadStore = create<DownloadState>()((set, get) => ({
  items: [],

  setItems: (items) =>
    set((state) => {
      const normalizedItems = items.map(normalizeDownloadItem);
      const incomingByGameId = new Map(
        normalizedItems.map((item) => [item.gameId, item]),
      );
      const retainedTerminalItems = state.items
        .filter(
          (item) =>
            !incomingByGameId.has(item.gameId) &&
            TERMINAL_STATUSES.has(item.status),
        )
        .slice(-MAX_RETAINED_TERMINAL_ITEMS);

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
    get().items.filter((item) => isActiveDownloadItem(item)).length,

  pausedCount: () =>
    get().items.filter((item) => isPausedDownloadItem(item)).length,

  completedCount: () =>
    get().items.filter((i) => i.status === "completed").length,

  totalProgress: () => {
    const items = get().items.filter(
      (item) => isActiveDownloadItem(item) || isPausedDownloadItem(item),
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
  const isTerminal = isTerminalDownloadItem(item);

  return {
    ...item,
    progress: clampProgress(item.progress),
    canPause:
      Boolean(item.canPause) &&
      PAUSE_TOGGLE_STATUSES.has(item.status) &&
      (!external || isSteamDownload(item.gameId)) &&
      !isTerminal,
    canCancel: Boolean(item.canCancel) && !external && !isTerminal,
    external,
  };
}

function isSteamDownload(gameId: string) {
  return /^steam-(owned-)?\d+$/.test(gameId);
}

function clampProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

export function isTerminalDownloadStatus(status: DownloadStatus) {
  return TERMINAL_STATUSES.has(status);
}

export function isActiveDownloadStatus(status: DownloadStatus) {
  return ACTIVE_STATUSES.has(status);
}

export function isPausedDownloadStatus(status: DownloadStatus) {
  return PAUSED_STATUSES.has(status);
}

export function isTerminalDownloadItem(item: DownloadItem) {
  return isTerminalDownloadStatus(item.status);
}

export function isActiveDownloadItem(item: DownloadItem) {
  return isActiveDownloadStatus(item.status);
}

export function isPausedDownloadItem(item: DownloadItem) {
  return isPausedDownloadStatus(item.status);
}

export function isLiveDownloadItem(item: DownloadItem) {
  return isActiveDownloadItem(item) || isPausedDownloadItem(item);
}
