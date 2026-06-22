import { isTauri } from "@tauri-apps/api/core";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

import { DeduplicationPanel } from "./DeduplicationPanel";
import type { PlatformFriend, PlatformType } from "../../lib/types/friends";
import { importPlatformFriends } from "../../lib/supabase/friend-links";
import {
  fetchEpicFriends,
  fetchGogFriends,
  fetchSteamFriends,
  fetchXboxFriends,
} from "../../lib/launcher";
import { STORAGE_KEYS } from "../../lib/storage-keys";

interface FriendImportProps {
  onImported?: () => void;
}

interface PlatformImportOption {
  key: PlatformType;
  label: string;
  detail: string;
  badge: string;
  accentClass: string;
}

type ImportSource = "native" | "preview";

interface PlatformImportResult {
  friends: PlatformFriend[];
  note: string | null;
  source: ImportSource;
}

const PLATFORM_ORDER: PlatformType[] = [
  "steam",
  "epic",
  "gog",
  "ea",
  "xbox",
  "battlenet",
  "ubisoft",
  "og",
];

const PLATFORM_OPTIONS: Record<PlatformType, PlatformImportOption> = {
  steam: {
    key: "steam",
    label: "Steam",
    detail: "Public friends or local preview",
    badge: "Native",
    accentClass: "bg-[#171411]",
  },
  epic: {
    key: "epic",
    label: "Epic",
    detail: "Legendary roster or local preview",
    badge: "Native",
    accentClass: "bg-[#171411]",
  },
  gog: {
    key: "gog",
    label: "GOG",
    detail: "Galaxy friends or local preview",
    badge: "Native",
    accentClass: "bg-[#087d6d]",
  },
  ea: {
    key: "ea",
    label: "EA App",
    detail: "Connected-account preview",
    badge: "Preview",
    accentClass: "bg-[#b7102a]",
  },
  xbox: {
    key: "xbox",
    label: "Xbox",
    detail: "Gamertag cache or local preview",
    badge: "Preview",
    accentClass: "bg-[#087d6d]",
  },
  battlenet: {
    key: "battlenet",
    label: "Battle.net",
    detail: "BattleTag-style preview",
    badge: "Preview",
    accentClass: "bg-[#171411]",
  },
  ubisoft: {
    key: "ubisoft",
    label: "Ubisoft",
    detail: "Connect roster preview",
    badge: "Preview",
    accentClass: "bg-[#087d6d]",
  },
  og: {
    key: "og",
    label: "OG-Launcher",
    detail: "Launcher network preview",
    badge: "Local",
    accentClass: "bg-[#b7102a]",
  },
};

const PLATFORMS = PLATFORM_ORDER.map((platform) => PLATFORM_OPTIONS[platform]);

const LOCAL_PREVIEW_ROSTERS: Record<
  PlatformType,
  Array<Pick<PlatformFriend, "displayName" | "onlineStatus" | "platformId">>
> = {
  steam: [
    {
      platformId: "preview-steam-arcade-ronin",
      displayName: "ArcadeRonin",
      onlineStatus: "online",
    },
    { platformId: "preview-steam-metro-ghost", displayName: "MetroGhost", onlineStatus: "away" },
    { platformId: "preview-steam-katana-byte", displayName: "KatanaByte", onlineStatus: "offline" },
  ],
  epic: [
    { platformId: "preview-epic-rift-signal", displayName: "RiftSignal", onlineStatus: "online" },
    { platformId: "preview-epic-dropwave", displayName: "DropWave", onlineStatus: "busy" },
    { platformId: "preview-epic-vaultpilot", displayName: "VaultPilot", onlineStatus: "offline" },
  ],
  gog: [
    { platformId: "preview-gog-retro-orbit", displayName: "RetroOrbit", onlineStatus: "online" },
    { platformId: "preview-gog-diskmage", displayName: "DiskMage", onlineStatus: "away" },
    { platformId: "preview-gog-crt-saint", displayName: "CRTSaint", onlineStatus: "offline" },
  ],
  ea: [
    { platformId: "preview-ea-grid-runner", displayName: "GridRunner", onlineStatus: "online" },
    { platformId: "preview-ea-frostline", displayName: "Frostline", onlineStatus: "busy" },
    { platformId: "preview-ea-boostframe", displayName: "BoostFrame", onlineStatus: "away" },
  ],
  xbox: [
    {
      platformId: "preview-xbox-neon-gamertag",
      displayName: "NeonGamertag",
      onlineStatus: "online",
    },
    { platformId: "preview-xbox-green-room", displayName: "GreenRoom", onlineStatus: "away" },
    { platformId: "preview-xbox-party-cable", displayName: "PartyCable", onlineStatus: "offline" },
  ],
  battlenet: [
    {
      platformId: "preview-battlenet-hexrunner-117",
      displayName: "HexRunner#117",
      onlineStatus: "online",
    },
    {
      platformId: "preview-battlenet-raidprint-404",
      displayName: "RaidPrint#404",
      onlineStatus: "busy",
    },
    {
      platformId: "preview-battlenet-stormbit-226",
      displayName: "StormBit#226",
      onlineStatus: "offline",
    },
  ],
  ubisoft: [
    {
      platformId: "preview-ubisoft-splinter-ink",
      displayName: "SplinterInk",
      onlineStatus: "online",
    },
    { platformId: "preview-ubisoft-nomad-loop", displayName: "NomadLoop", onlineStatus: "away" },
    {
      platformId: "preview-ubisoft-siege-panel",
      displayName: "SiegePanel",
      onlineStatus: "offline",
    },
  ],
  og: [
    { platformId: "preview-og-local-coop", displayName: "LocalCoop", onlineStatus: "online" },
    { platformId: "preview-og-library-rival", displayName: "LibraryRival", onlineStatus: "away" },
    { platformId: "preview-og-launch-room", displayName: "LaunchRoom", onlineStatus: "unknown" },
  ],
};

function getPlatformLabel(platform: PlatformType) {
  return PLATFORM_OPTIONS[platform].label;
}

function formatImportCount(count: number, source: ImportSource) {
  const importKind = source === "native" ? "live" : "preview";
  return `${count} ${importKind} friend${count === 1 ? "" : "s"}`;
}

function readLocalStorageString(key: string) {
  if (typeof window === "undefined") return "";

  const raw = window.localStorage.getItem(key);
  if (!raw) return "";

  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : raw;
  } catch {
    return raw.replace(/"/g, "");
  }
}

function createLocalPreviewFriends(platform: PlatformType): PlatformFriend[] {
  return LOCAL_PREVIEW_ROSTERS[platform].map((friend) => ({
    ...friend,
    avatarUrl: null,
    platform,
  }));
}

async function fetchNativePlatformFriends(
  platform: PlatformType,
): Promise<PlatformFriend[] | null> {
  switch (platform) {
    case "steam": {
      const steamId = readLocalStorageString(STORAGE_KEYS.STEAM_ID);
      if (!steamId) throw new Error("Connect Steam first in Settings.");
      return fetchSteamFriends(steamId);
    }
    case "gog": {
      return fetchGogFriends();
    }
    case "epic": {
      if (!readLocalStorageString(STORAGE_KEYS.EPIC_SESSION_MARKER)) {
        throw new Error("Connect Epic Games first in Settings.");
      }
      return fetchEpicFriends();
    }
    case "xbox": {
      if (!readLocalStorageString(STORAGE_KEYS.XBOX_GAMES_CACHE)) {
        throw new Error("Connect Xbox first in Settings.");
      }
      return fetchXboxFriends("");
    }
    case "ea":
    case "battlenet":
    case "ubisoft":
    case "og":
      return null;
  }
}

async function loadPlatformFriends(platform: PlatformType): Promise<PlatformImportResult> {
  if (isTauri()) {
    try {
      const nativeFriends = await fetchNativePlatformFriends(platform);
      if (nativeFriends) {
        return {
          friends: nativeFriends,
          note: null,
          source: "native",
        };
      }
    } catch (err) {
      return {
        friends: createLocalPreviewFriends(platform),
        note: `Native fetch skipped: ${err instanceof Error ? err.message : String(err)}`,
        source: "preview",
      };
    }
  }

  return {
    friends: createLocalPreviewFriends(platform),
    note: "Local preview roster used.",
    source: "preview",
  };
}

export function FriendImport({ onImported }: FriendImportProps) {
  const [loading, setLoading] = useState<PlatformType | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport(platform: PlatformType) {
    setLoading(platform);
    setMessage(null);
    setError(null);

    try {
      const { friends, note, source } = await loadPlatformFriends(platform);
      const count = await importPlatformFriends(friends);
      setMessage(
        `Imported ${formatImportCount(count, source)} from ${getPlatformLabel(platform)}.${
          note ? ` ${note}` : ""
        }`,
      );
      onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PLATFORMS.map(({ key, label, detail, badge, accentClass }) => (
          <button
            key={key}
            className="group min-h-[82px] border-[3px] border-black bg-[#f6edd8] p-2 text-left shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#fff9ed] disabled:opacity-50"
            disabled={loading !== null}
            type="button"
            onClick={() => void handleImport(key)}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                {loading === key ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#b7102a]" />
                ) : (
                  <Download className="h-3.5 w-3.5 shrink-0 text-[#b7102a]" />
                )}
                <span className="neo-copy truncate text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
                  {label}
                </span>
              </span>
              <span
                className={`neo-copy shrink-0 border-2 border-black px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-white ${accentClass}`}
              >
                {badge}
              </span>
            </span>
            <span className="neo-copy mt-2 block text-[8px] font-bold uppercase leading-4 text-[#5b403f]">
              {detail}
            </span>
          </button>
        ))}
      </div>

      {message && (
        <div className="neo-copy border-2 border-black bg-[#087d6d] p-3 text-[11px] font-bold uppercase text-white shadow-[2px_2px_0_#171411]">
          {message}
        </div>
      )}
      {error && (
        <div className="neo-copy border-2 border-black bg-[#b7102a] p-3 text-[11px] font-bold uppercase text-white shadow-[2px_2px_0_#171411]">
          {error}
        </div>
      )}

      <div className="border-t-2 border-black pt-4">
        <DeduplicationPanel onChange={onImported} />
      </div>
    </div>
  );
}
