import { STORAGE_KEYS } from "./storage-keys";

export const APP_SHELL_SKIN_CHANGED_EVENT = "og-launcher:app-shell-skin-changed";
export const APP_SHELL_SKIN_STORAGE_KEY = STORAGE_KEYS.APP_SHELL_SKIN;

export type AppShellSkinId = "retro-paper" | "redline-print" | "teal-print";

export interface AppShellSkin {
  description: string;
  id: AppShellSkinId;
  name: string;
  swatches: {
    accent: string;
    highlight: string;
    paper: string;
    secondary: string;
  };
}

export interface AppShellSkinReadinessEvidence {
  activeSkinId: AppShellSkinId;
  activeSkinName: string;
  availableSkinCount: number;
  scope: "browser-local";
  storageKey: typeof APP_SHELL_SKIN_STORAGE_KEY;
  surfaces: string[];
}

export interface AppShellSkinRollbackEvidence {
  defaultSkinId: AppShellSkinId;
  defaultSkinName: string;
  invalidSkinFallback: true;
  resetTarget: "browser-local-default";
  storageKey: typeof APP_SHELL_SKIN_STORAGE_KEY;
}

export const DEFAULT_APP_SHELL_SKIN_ID: AppShellSkinId = "retro-paper";

export const APP_SHELL_SKINS: readonly AppShellSkin[] = [
  {
    description: "Warm paper, red brand ink, teal nav signal.",
    id: "retro-paper",
    name: "Retro Paper",
    swatches: {
      accent: "#b7102a",
      highlight: "#8cf5e4",
      paper: "#fff9ed",
      secondary: "#007166",
    },
  },
  {
    description: "Red active shell strips with teal proof marks.",
    id: "redline-print",
    name: "Redline Print",
    swatches: {
      accent: "#c20b2f",
      highlight: "#8cf5e4",
      paper: "#fff9ed",
      secondary: "#b7102a",
    },
  },
  {
    description: "Teal launcher ink with red alert blocks.",
    id: "teal-print",
    name: "Teal Print",
    swatches: {
      accent: "#007166",
      highlight: "#8cf5e4",
      paper: "#f5eedf",
      secondary: "#087d6d",
    },
  },
] as const;

export function resolveAppShellSkinId(value: unknown): AppShellSkinId {
  return APP_SHELL_SKINS.some((skin) => skin.id === value)
    ? (value as AppShellSkinId)
    : DEFAULT_APP_SHELL_SKIN_ID;
}

export function getAppShellSkin(value: unknown): AppShellSkin {
  const skinId = resolveAppShellSkinId(value);
  return APP_SHELL_SKINS.find((skin) => skin.id === skinId) ?? APP_SHELL_SKINS[0];
}

export function readAppShellSkinId(storage = getBrowserStorage()): AppShellSkinId {
  try {
    return resolveAppShellSkinId(storage?.getItem(APP_SHELL_SKIN_STORAGE_KEY));
  } catch {
    return DEFAULT_APP_SHELL_SKIN_ID;
  }
}

export function writeAppShellSkinId(value: unknown, storage = getBrowserStorage()): AppShellSkinId {
  const skinId = resolveAppShellSkinId(value);

  try {
    storage?.setItem(APP_SHELL_SKIN_STORAGE_KEY, skinId);
  } catch {
    // Browser previews can deny localStorage; the selected skin still applies in memory.
  }

  return skinId;
}

export function resetAppShellSkin(storage = getBrowserStorage()): AppShellSkinId {
  return writeAppShellSkinId(DEFAULT_APP_SHELL_SKIN_ID, storage);
}

export function notifyAppShellSkinChanged(skinId: AppShellSkinId) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(APP_SHELL_SKIN_CHANGED_EVENT, {
      detail: { skinId },
    }),
  );
}

export function buildAppShellSkinRollbackEvidence(): AppShellSkinRollbackEvidence {
  const defaultSkin = getAppShellSkin(DEFAULT_APP_SHELL_SKIN_ID);

  return {
    defaultSkinId: defaultSkin.id,
    defaultSkinName: defaultSkin.name,
    invalidSkinFallback: true,
    resetTarget: "browser-local-default",
    storageKey: APP_SHELL_SKIN_STORAGE_KEY,
  };
}

export function buildAppShellSkinReadinessEvidence(
  skinId: AppShellSkinId = readAppShellSkinId(),
): AppShellSkinReadinessEvidence {
  const skin = getAppShellSkin(skinId);

  return {
    activeSkinId: skin.id,
    activeSkinName: skin.name,
    availableSkinCount: APP_SHELL_SKINS.length,
    scope: "browser-local",
    storageKey: APP_SHELL_SKIN_STORAGE_KEY,
    surfaces: ["header", "navigation", "main shell"],
  };
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
