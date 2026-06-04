import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

import { DeduplicationPanel } from "./DeduplicationPanel";
import type { PlatformType } from "../../lib/types/friends";
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

const PLATFORMS: Array<{ key: PlatformType; label: string; color: string }> = [
  { key: "steam", label: "Steam", color: "bg-[#171411]" },
  { key: "epic", label: "Epic", color: "bg-[#171411]" },
  { key: "gog", label: "GOG", color: "bg-[#087d6d]" },
  { key: "xbox", label: "Xbox", color: "bg-[#107c10]" },
];

export function FriendImport({ onImported }: FriendImportProps) {
  const [loading, setLoading] = useState<PlatformType | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport(platform: PlatformType) {
    setLoading(platform);
    setMessage(null);
    setError(null);

    try {
      let friends;
      switch (platform) {
        case "steam": {
          const steamId = localStorage.getItem("launcher.steamId")?.replace(/"/g, "") ?? "";
          if (!steamId) throw new Error("Connect Steam first in Settings.");
          friends = await fetchSteamFriends(steamId);
          break;
        }
        case "gog": {
          const gogTokenRaw = localStorage.getItem(STORAGE_KEYS.GOG_TOKEN);
          if (!gogTokenRaw) throw new Error("Connect GOG first in Settings.");
          const gogToken = JSON.parse(gogTokenRaw) as {
            accessToken?: string;
            access_token?: string;
          };
          const token = gogToken.accessToken ?? gogToken.access_token ?? "";
          if (!token) throw new Error("GOG token expired. Reconnect in Settings.");
          friends = await fetchGogFriends(token);
          break;
        }
        case "epic": {
          friends = await fetchEpicFriends();
          break;
        }
        case "xbox": {
          const xboxData = localStorage.getItem(STORAGE_KEYS.XBOX_GAMES_CACHE);
          if (!xboxData) throw new Error("Connect Xbox first in Settings.");
          friends = await fetchXboxFriends("");
          break;
        }
        default:
          throw new Error(`Import not supported for ${platform} yet.`);
      }

      const count = await importPlatformFriends(friends);
      setMessage(`Imported ${count} friends from ${platform}.`);
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
        {PLATFORMS.map(({ key, label, color }) => (
          <button
            key={key}
            className={`neo-copy flex h-12 items-center justify-center gap-2 border-2 border-black ${color} text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5 disabled:opacity-50`}
            disabled={loading !== null}
            type="button"
            onClick={() => void handleImport(key)}
          >
            {loading === key ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {label}
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
