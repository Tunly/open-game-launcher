import { isTauri } from "@tauri-apps/api/core";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

import { DeduplicationPanel } from "./DeduplicationPanel";
import type { PlatformFriend, PlatformType } from "../../lib/types/friends";
import { importPlatformFriends } from "../../lib/supabase/friend-links";
import { fetchEpicFriends, fetchGogFriends, fetchSteamFriends } from "../../lib/launcher";
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
  available: boolean;
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
    detail: "Imports your real public Steam friends",
    badge: "Native",
    accentClass: "bg-[#171411]",
    available: true,
  },
  epic: {
    key: "epic",
    label: "Epic",
    detail: "Imports friends through your connected Epic session",
    badge: "Beta",
    accentClass: "bg-[#171411]",
    available: true,
  },
  gog: {
    key: "gog",
    label: "GOG",
    detail: "Imports your real Galaxy roster",
    badge: "Native",
    accentClass: "bg-[#087d6d]",
    available: true,
  },
  ea: {
    key: "ea",
    label: "EA App",
    detail: "Friend import is not supported yet",
    badge: "Unavailable",
    accentClass: "bg-[#b7102a]",
    available: false,
  },
  xbox: {
    key: "xbox",
    label: "Xbox",
    detail: "Secure friend-token handoff is not available yet",
    badge: "Unavailable",
    accentClass: "bg-[#087d6d]",
    available: false,
  },
  battlenet: {
    key: "battlenet",
    label: "Battle.net",
    detail: "Friend import is not supported yet",
    badge: "Unavailable",
    accentClass: "bg-[#171411]",
    available: false,
  },
  ubisoft: {
    key: "ubisoft",
    label: "Ubisoft",
    detail: "Friend import is not supported yet",
    badge: "Unavailable",
    accentClass: "bg-[#087d6d]",
    available: false,
  },
  og: {
    key: "og",
    label: "OG-Launcher",
    detail: "Use Add Friend for launcher accounts",
    badge: "Unavailable",
    accentClass: "bg-[#b7102a]",
    available: false,
  },
};

const PLATFORMS = PLATFORM_ORDER.map((platform) => PLATFORM_OPTIONS[platform]);

function getPlatformLabel(platform: PlatformType) {
  return PLATFORM_OPTIONS[platform].label;
}

function formatImportCount(count: number) {
  return `${count} live friend${count === 1 ? "" : "s"}`;
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

async function fetchNativePlatformFriends(platform: PlatformType): Promise<PlatformFriend[]> {
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
    case "xbox":
    case "ea":
    case "battlenet":
    case "ubisoft":
    case "og":
      throw new Error(`${getPlatformLabel(platform)} friend import is not supported yet.`);
  }
}

async function loadPlatformFriends(platform: PlatformType): Promise<PlatformFriend[]> {
  if (!isTauri()) {
    throw new Error("Friend import is available in the desktop app only.");
  }

  return fetchNativePlatformFriends(platform);
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
      const friends = await loadPlatformFriends(platform);
      const count = await importPlatformFriends(friends);
      setMessage(`Imported ${formatImportCount(count)} from ${getPlatformLabel(platform)}.`);
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
        {PLATFORMS.map(({ key, label, detail, badge, accentClass, available }) => (
          <button
            key={key}
            className="group min-h-[82px] border-[3px] border-black bg-[#f6edd8] p-2 text-left shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#fff9ed] disabled:opacity-50"
            disabled={loading !== null || !available}
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
                <span className="neo-copy truncate text-[10px] font-black tracking-[0.12em] text-[#171411] uppercase">
                  {label}
                </span>
              </span>
              <span
                className={`neo-copy shrink-0 border-2 border-black px-1.5 py-0.5 text-[8px] font-black tracking-[0.1em] text-white uppercase ${accentClass}`}
              >
                {badge}
              </span>
            </span>
            <span className="neo-copy mt-2 block text-[8px] leading-4 font-bold text-[#5b403f] uppercase">
              {detail}
            </span>
          </button>
        ))}
      </div>

      {message && (
        <div className="neo-copy border-2 border-black bg-[#087d6d] p-3 text-[11px] font-bold text-white uppercase shadow-[2px_2px_0_#171411]">
          {message}
        </div>
      )}
      {error && (
        <div className="neo-copy border-2 border-black bg-[#b7102a] p-3 text-[11px] font-bold text-white uppercase shadow-[2px_2px_0_#171411]">
          {error}
        </div>
      )}

      <div className="border-t-2 border-black pt-4">
        <DeduplicationPanel onChange={onImported} />
      </div>
    </div>
  );
}
