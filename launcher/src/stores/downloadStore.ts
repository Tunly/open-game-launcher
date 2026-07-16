import { create } from "zustand";
import type { DownloadItem, DownloadStatus } from "../lib/types";

export interface DownloadState {
  items: DownloadItem[];
  setItems: (items: DownloadItem[]) => void;
  upsertItem: (item: DownloadItem) => void;
  upsertItems: (items: DownloadItem[]) => void;
  removeItem: (gameId: string) => void;
}

const MAX_RETAINED_TERMINAL_ITEMS = 100;
const TERMINAL_STATUSES = new Set<DownloadStatus>(["completed", "failed", "cancelled", "error"]);
const ACTIVE_STATUSES = new Set<DownloadStatus>([
  "queued",
  "starting",
  "downloading",
  "resuming",
  "installing",
]);
const PAUSED_STATUSES = new Set<DownloadStatus>(["pausing", "paused"]);
const PAUSE_TOGGLE_STATUSES = new Set<DownloadStatus>(["downloading", "paused"]);

export const useDownloadStore = create<DownloadState>()((set) => ({
  items: [],

  setItems: (items) =>
    set((state) => {
      const normalizedItems = items.map(normalizeDownloadItem);
      const incomingByGameId = new Map(normalizedItems.map((item) => [item.gameId, item]));
      const retainedTerminalItems = state.items
        .filter((item) => !incomingByGameId.has(item.gameId) && TERMINAL_STATUSES.has(item.status))
        .slice(-MAX_RETAINED_TERMINAL_ITEMS);

      return { items: capRetainedTerminalItems([...normalizedItems, ...retainedTerminalItems]) };
    }),

  upsertItem: (item) =>
    set((state) => {
      const normalizedItem = normalizeDownloadItem(item);
      const index = state.items.findIndex((i) => i.gameId === normalizedItem.gameId);
      if (index > -1) {
        const updated = [...state.items];
        updated[index] = normalizeDownloadItem({
          ...updated[index],
          ...normalizedItem,
        });
        return { items: capRetainedTerminalItems(updated) };
      }
      return { items: capRetainedTerminalItems([...state.items, normalizedItem]) };
    }),

  upsertItems: (items) =>
    set((state) => {
      if (items.length === 0) return state;

      const normalizedByGameId = new Map<string, DownloadItem>();
      for (const item of items) {
        normalizedByGameId.set(item.gameId, normalizeDownloadItem(item));
      }

      const next = [...state.items];
      for (const normalizedItem of normalizedByGameId.values()) {
        const index = next.findIndex((entry) => entry.gameId === normalizedItem.gameId);
        if (index > -1) {
          next[index] = normalizeDownloadItem({
            ...next[index],
            ...normalizedItem,
          });
        } else {
          next.push(normalizedItem);
        }
      }

      return { items: capRetainedTerminalItems(next) };
    }),

  removeItem: (gameId) =>
    set((state) => ({
      items: state.items.filter((i) => i.gameId !== gameId),
    })),
}));

function capRetainedTerminalItems(items: DownloadItem[]) {
  const terminalItems = items.filter((item) => TERMINAL_STATUSES.has(item.status));
  if (terminalItems.length <= MAX_RETAINED_TERMINAL_ITEMS) {
    return items;
  }

  const retainedTerminalGameIds = new Set(
    terminalItems.slice(-MAX_RETAINED_TERMINAL_ITEMS).map((item) => item.gameId),
  );
  return items.filter(
    (item) => !TERMINAL_STATUSES.has(item.status) || retainedTerminalGameIds.has(item.gameId),
  );
}

export function selectActiveCount(state: DownloadState): number {
  return state.items.filter((item) => isActiveDownloadItem(item)).length;
}

export function selectPausedCount(state: DownloadState): number {
  return state.items.filter((item) => isPausedDownloadItem(item)).length;
}

export function selectCompletedCount(state: DownloadState): number {
  return state.items.filter((i) => i.status === "completed").length;
}

export function selectTotalProgress(state: DownloadState): number {
  const items = state.items.filter(
    (item) => isActiveDownloadItem(item) || isPausedDownloadItem(item),
  );
  if (items.length === 0) {
    return state.items.some((item) => item.status === "completed") ? 100 : 0;
  }
  return Math.round(items.reduce((sum, i) => sum + i.progress, 0) / items.length);
}

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
