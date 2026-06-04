import { create } from "zustand";
import type {
  ModInstallQueueItem,
  ModInstallStatus,
} from "../lib/types/mods";

export interface ModInstallState {
  items: ModInstallQueueItem[];
  setItems: (items: ModInstallQueueItem[]) => void;
  upsertItem: (item: ModInstallQueueItem) => void;
  removeItem: (installId: string) => void;
  activeCount: () => number;
  delegatedCount: () => number;
  completedCount: () => number;
  totalProgress: () => number;
}

const TERMINAL_STATUSES = new Set<ModInstallStatus>([
  "completed",
  "failed",
  "cancelled",
]);

const ACTIVE_STATUSES = new Set<ModInstallStatus>([
  "queued",
  "starting",
  "downloading",
  "installing",
]);

export const useModInstallStore = create<ModInstallState>()((set, get) => ({
  items: [],

  setItems: (items) =>
    set({ items: items.map(normalizeModInstallItem).sort(sortQueueItems) }),

  upsertItem: (item) =>
    set((state) => {
      const normalizedItem = normalizeModInstallItem(item);
      const index = state.items.findIndex(
        (entry) => entry.installId === normalizedItem.installId,
      );
      if (index > -1) {
        const next = [...state.items];
        next[index] = normalizeModInstallItem({
          ...next[index],
          ...normalizedItem,
        });
        return { items: next.sort(sortQueueItems) };
      }
      return { items: [...state.items, normalizedItem].sort(sortQueueItems) };
    }),

  removeItem: (installId) =>
    set((state) => ({
      items: state.items.filter((entry) => entry.installId !== installId),
    })),

  activeCount: () =>
    get().items.filter((item) => isActiveModInstallItem(item)).length,

  delegatedCount: () =>
    get().items.filter((item) => item.status === "delegated").length,

  completedCount: () =>
    get().items.filter((item) => item.status === "completed").length,

  totalProgress: () => {
    const activeItems = get().items.filter(
      (item) => isActiveModInstallItem(item) || item.status === "delegated",
    );
    if (activeItems.length === 0) {
      return get().items.some((item) => item.status === "completed") ? 100 : 0;
    }
    return Math.round(
      activeItems.reduce((sum, item) => sum + item.progress, 0) /
        activeItems.length,
    );
  },
}));

function normalizeModInstallItem(
  item: ModInstallQueueItem,
): ModInstallQueueItem {
  const status = isKnownStatus(item.status) ? item.status : "failed";
  const isTerminal = TERMINAL_STATUSES.has(status);
  return {
    ...item,
    status,
    progress: clampProgress(item.progress),
    canCancel: Boolean(item.canCancel) && !isTerminal,
    canPause: false,
    external: Boolean(item.external),
  };
}

function isKnownStatus(status: string): status is ModInstallStatus {
  return (
    ACTIVE_STATUSES.has(status as ModInstallStatus) ||
    TERMINAL_STATUSES.has(status as ModInstallStatus) ||
    status === "delegated"
  );
}

function clampProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

function sortQueueItems(
  left: ModInstallQueueItem,
  right: ModInstallQueueItem,
) {
  return statusRank(left.status) - statusRank(right.status)
    || right.lastUpdatedAt - left.lastUpdatedAt;
}

function statusRank(status: ModInstallStatus) {
  if (ACTIVE_STATUSES.has(status)) return 0;
  if (status === "delegated") return 1;
  if (status === "failed") return 2;
  if (status === "cancelled") return 3;
  return 4;
}

export function isActiveModInstallStatus(status: ModInstallStatus) {
  return ACTIVE_STATUSES.has(status);
}

export function isTerminalModInstallStatus(status: ModInstallStatus) {
  return TERMINAL_STATUSES.has(status);
}

export function isActiveModInstallItem(item: ModInstallQueueItem) {
  return isActiveModInstallStatus(item.status);
}

export function isTerminalModInstallItem(item: ModInstallQueueItem) {
  return isTerminalModInstallStatus(item.status);
}
