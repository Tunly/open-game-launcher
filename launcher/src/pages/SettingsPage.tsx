import { Link as LinkIcon, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { z } from "zod";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import {
  isSteamScrapedGamesEventForAccount,
  isSteamScrapeErrorEventForAccount,
  normalizeSteamLoginSuccessEvent,
  openSteamLoginWindow,
  openGogLoginWindow,
  openEpicLoginWindow,
  openEaLoginWindow,
  openXboxLoginWindow,
  fetchXboxOwnedGames,
  fetchSteamProfileName,
  authenticateEpicLegendary,
  gogExchangeCode,
  gogLogout,
  gogGetToken,
  eaGetToken,
  eaLogout,
  openBattleNetLoginWindow,
  processBattleNetGamesPayload,
  verifySteamOpenIdLocally,
} from "../lib/launcher";
import { normalizeSteamOwnedGames } from "../lib/steam-owned-games";
import { readLocalStorageString } from "../lib/library-providers";
import {
  activateSteamAccount,
  clearSteamAccount,
  writeSteamOwnedGamesCache,
} from "../lib/steam-owned-games-cache";
import { STORAGE_KEYS } from "../lib/storage-keys";
import {
  clearEpicSessionMarker,
  clearLegacyEaTokenCopy,
  clearLegacyGogTokenCopy,
  clearLegacyPlatformTokenCopies,
  readEpicSessionMarker,
  writeEpicSessionMarker,
} from "../lib/platform-token-storage";
import { LauncherUpdatePanel } from "../components/settings/LauncherUpdatePanel";
import type { SteamVerifiedIdentity } from "../lib/launcher";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const settingSchemas = {
  steamId: z.string().max(64),
  steamUsername: z.string().max(128),
};

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "ink" | "teal" | "red" | "paper";
}) {
  const toneClass = {
    ink: "bg-[#171411] text-[#fbf4e7]",
    teal: "bg-[#087d6d] text-white",
    red: "bg-[#b7102a] text-white",
    paper: "bg-[#fbf4e7] text-[#171411]",
  }[tone];

  return (
    <div className={`min-w-[92px] px-2 py-1.5 ${toneClass}`}>
      <p className="neo-title text-base leading-none">{value}</p>
      <p className="neo-copy mt-0.5 text-[8px] font-black tracking-[0.1em] uppercase">{label}</p>
    </div>
  );
}

export function SettingsPage() {
  const isDesktopRuntime = isTauri();

  const [steamId, setSteamId] = useLocalStorageState(
    "launcher.steamId",
    "",
    settingSchemas.steamId,
  );
  const [steamUsername, setSteamUsername] = useLocalStorageState(
    "launcher.steamUsername",
    "",
    settingSchemas.steamUsername,
  );
  const [steamVerifiedAccount, setSteamVerifiedAccount] = useState<SteamVerifiedIdentity | null>(
    null,
  );
  const [steamVerifiedMessage, setSteamVerifiedMessage] = useState<string | null>(null);

  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [gogConnected, setGogConnected] = useState(false);
  const [eaConnected, setEaConnected] = useState(false);
  const [epicConnected, setEpicConnected] = useState(false);
  const [epicDisplayName, setEpicDisplayName] = useState("");

  const [xboxConnected, setXboxConnected] = useState(false);
  const [xboxGamesCount, setXboxGamesCount] = useState(0);
  const [xboxGamertag, setXboxGamertag] = useState("");

  const [battlenetConnected, setBattlenetConnected] = useState(false);
  const [battlenetGamesCount, setBattlenetGamesCount] = useState(0);

  const providerCount = [
    Boolean(steamId),
    gogConnected,
    eaConnected,
    epicConnected,
    xboxConnected,
    battlenetConnected,
  ].filter(Boolean).length;

  function openDesktopLogin(label: string, action: () => Promise<unknown>) {
    if (!isDesktopRuntime) {
      setTestResult({
        success: false,
        message: `${label} login requires the desktop app. Browser preview does not open native login windows.`,
      });
      return;
    }

    void action().catch((err) => {
      setTestResult({
        success: false,
        message: `Failed to open ${label}: ${getErrorMessage(err)}`,
      });
    });
  }

  useEffect(() => {
    let isMounted = true;
    clearLegacyPlatformTokenCopies();

    if (isDesktopRuntime) {
      gogGetToken()
        .then((backendToken) => {
          if (!isMounted) return;
          setGogConnected(Boolean(backendToken?.accessToken));
        })
        .catch(() => {
          if (!isMounted) return;
          setGogConnected(false);
        });
    } else {
      setGogConnected(false);
    }

    if (isDesktopRuntime) {
      eaGetToken()
        .then((backendEaToken) => {
          if (!isMounted) return;
          setEaConnected(Boolean(backendEaToken?.accessToken));
        })
        .catch(() => {
          if (!isMounted) return;
          setEaConnected(false);
        });
    } else {
      setEaConnected(false);
    }

    if (steamId && !steamUsername) {
      if (!isDesktopRuntime) {
        setSteamUsername("Steam User");
      } else {
        void fetchSteamProfileName(steamId)
          .then((name) => {
            if (!isMounted) return;
            setSteamUsername(name ?? "Steam User");
          })
          .catch((err) => {
            console.warn("Failed to fetch steam username on mount:", err);
            if (isMounted) setSteamUsername("Steam User");
          });
      }
    }

    const epicMarker = readEpicSessionMarker();
    if (epicMarker) {
      setEpicConnected(true);
      setEpicDisplayName(epicMarker);
    }

    const xboxGamesStr = localStorage.getItem(STORAGE_KEYS.XBOX_GAMES_CACHE);
    if (xboxGamesStr) {
      try {
        const games = JSON.parse(xboxGamesStr);
        if (Array.isArray(games)) {
          setXboxConnected(true);
          setXboxGamesCount(games.length);
          const gt = localStorage.getItem(STORAGE_KEYS.XBOX_USERNAME);
          if (gt) setXboxGamertag(gt);
        }
      } catch {
        // ignore
      }
    }

    const battlenetGamesStr = localStorage.getItem(STORAGE_KEYS.BATTLENET_GAMES_CACHE);
    if (battlenetGamesStr) {
      try {
        const games = JSON.parse(battlenetGamesStr);
        if (Array.isArray(games)) {
          setBattlenetConnected(true);
          setBattlenetGamesCount(games.length);
        }
      } catch {
        // ignore
      }
    }

    return () => {
      isMounted = false;
    };
  }, [isDesktopRuntime, setSteamUsername, steamId, steamUsername]);

  async function handleSteamDisconnect() {
    clearSteamAccount();
    setSteamId("");
    setSteamUsername("");
    setSteamVerifiedAccount(null);
    setSteamVerifiedMessage(null);
    setTestResult(null);
  }

  async function handleGogCodeExchange(code: string) {
    setTestResult({ success: true, message: "GOG login code received. Exchanging..." });
    try {
      const token = await gogExchangeCode(code);
      if (token && token.accessToken) {
        clearLegacyGogTokenCopy();
        setGogConnected(true);
        setTestResult({
          success: true,
          message: "Successfully linked GOG. Your GOG games are now syncing.",
        });
      } else {
        throw new Error("No access_token received from GOG response.");
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: `GOG login failed: ${getErrorMessage(err)}`,
      });
    }
  }

  async function handleEpicCodeExchange(authCode: string) {
    if (!authCode.trim()) {
      setTestResult({ success: false, message: "Enter a valid Epic authorization code." });
      return;
    }
    setTestResult({ success: true, message: "Authenticating with Legendary..." });
    try {
      const response = await authenticateEpicLegendary(authCode.trim());

      writeEpicSessionMarker();
      setEpicConnected(true);
      setEpicDisplayName("Epic User");
      setTestResult({
        success: true,
        message: response,
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: `Epic Games login failed: ${getErrorMessage(err)}`,
      });
    }
  }

  async function handleGogDisconnect() {
    if (isDesktopRuntime) await gogLogout().catch(() => {});
    clearLegacyPlatformTokenCopies();
    setGogConnected(false);
    setTestResult({ success: true, message: "GOG account disconnected." });
  }

  async function handleEaDisconnect() {
    if (isDesktopRuntime) await eaLogout().catch(() => {});
    clearLegacyEaTokenCopy();
    setEaConnected(false);
    setTestResult({ success: true, message: "EA account disconnected." });
  }

  function handleEpicDisconnect() {
    clearEpicSessionMarker();
    setEpicConnected(false);
    setEpicDisplayName("");
    setTestResult({ success: true, message: "Epic account disconnected." });
  }

  function handleXboxDisconnect() {
    localStorage.removeItem(STORAGE_KEYS.XBOX_GAMES_CACHE);
    setXboxConnected(false);
    setXboxGamesCount(0);
    setXboxGamertag("");
    setTestResult({ success: true, message: "Xbox account disconnected." });
  }

  function handleBattlenetDisconnect() {
    localStorage.removeItem(STORAGE_KEYS.BATTLENET_GAMES_CACHE);
    setBattlenetConnected(false);
    setBattlenetGamesCount(0);
    setTestResult(null);
  }

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let isMounted = true;
    let unlistenPromise: Promise<() => void> | null = null;
    let unlistenScrapedPromise: Promise<() => void> | null = null;
    let unlistenErrorPromise: Promise<() => void> | null = null;

    try {
      unlistenPromise = listen<unknown>("steam_login_success", async (event) => {
        if (!isMounted) return;
        const login = normalizeSteamLoginSuccessEvent(event.payload);
        if (!login) return;
        const steamIdVal = login.steamId;
        activateSteamAccount(steamIdVal);
        setSteamId(steamIdVal);
        const isCurrentSteamLogin = () =>
          isMounted && readLocalStorageString(STORAGE_KEYS.STEAM_ID) === steamIdVal;
        try {
          const name = await fetchSteamProfileName(steamIdVal);
          if (!isCurrentSteamLogin()) return;
          setSteamUsername(name ?? "Steam User");
        } catch (err) {
          console.warn("Failed to fetch steam username:", err);
          if (!isCurrentSteamLogin()) return;
          setSteamUsername("Steam User");
        }
        if (!isCurrentSteamLogin()) return;

        if (login.openidResponseUrl) {
          try {
            const verified = await verifySteamOpenIdLocally(login.openidResponseUrl);
            if (!isCurrentSteamLogin()) return;
            if (verified && verified.steamId === steamIdVal) {
              setSteamVerifiedAccount(verified);
              setSteamVerifiedMessage(
                "Steam login confirmed via Steam's authenticated callback. Local cache remains the game source.",
              );
            } else {
              setSteamVerifiedAccount(null);
              setSteamVerifiedMessage(
                "Steam connected locally. Verification was not confirmed; local cache fallback remains active.",
              );
            }
          } catch (error) {
            if (!isCurrentSteamLogin()) return;
            setSteamVerifiedAccount(null);
            setSteamVerifiedMessage(
              `Steam connected locally, but verification failed: ${getErrorMessage(error)}`,
            );
          }
        } else {
          setSteamVerifiedAccount(null);
          setSteamVerifiedMessage(
            "Steam connected through the legacy local event. Local cache fallback remains active.",
          );
        }
        setTestResult({
          success: true,
          message: "Login successful. Your game list is now being fetched...",
        });
      });

      unlistenScrapedPromise = listen<unknown>("steam_scraped_games_success", (event) => {
        if (!isMounted) return;
        const currentSteamId = readLocalStorageString(STORAGE_KEYS.STEAM_ID) ?? "";
        if (!isSteamScrapedGamesEventForAccount(event.payload, currentSteamId)) return;
        const ownedGames = normalizeSteamOwnedGames(event.payload.games);
        writeSteamOwnedGamesCache(event.payload.steamId, ownedGames);

        setTestResult({
          success: true,
          message: `Successfully signed in through Steam. ${ownedGames.length} games were synced.`,
        });
      });

      unlistenErrorPromise = listen<unknown>("steam_scraped_games_error", (event) => {
        if (!isMounted) return;
        const currentSteamId = readLocalStorageString(STORAGE_KEYS.STEAM_ID) ?? "";
        if (!isSteamScrapeErrorEventForAccount(event.payload, currentSteamId)) return;
        console.warn("[Settings] Scraper failed:", event.payload.message);

        setTestResult({
          success: false,
          message: `Steam sync failed: ${event.payload.message}`,
        });
      });
    } catch (err) {
      console.warn("Failed to setup Steam event listeners:", err);
    }

    return () => {
      isMounted = false;
      if (unlistenPromise) void unlistenPromise.then((un) => un());
      if (unlistenScrapedPromise) void unlistenScrapedPromise.then((un) => un());
      if (unlistenErrorPromise) void unlistenErrorPromise.then((un) => un());
    };
  }, [setSteamId, setSteamUsername]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let unlistenPromise: Promise<() => void> | null = null;
    let unlistenEpicPromise: Promise<() => void> | null = null;

    try {
      unlistenPromise = listen<string>("gog_login_code", async (event) => {
        const code = event.payload;
        await handleGogCodeExchange(code);
      });
      unlistenEpicPromise = listen<string>("epic_login_code", async (event) => {
        const code = event.payload;
        await handleEpicCodeExchange(code);
      });
    } catch (err) {
      console.warn("Failed to setup gog or epic login listeners:", err);
    }

    let unlistenEaPromise: Promise<() => void> | null = null;
    try {
      unlistenEaPromise = listen("ea_login_success", async () => {
        const token = await eaGetToken();
        if (token?.accessToken) {
          clearLegacyEaTokenCopy();
          setEaConnected(true);
          setTestResult({
            success: true,
            message: "Successfully linked EA App. Your EA library is now syncing.",
          });
        }
      });
    } catch (err) {
      console.warn("Failed to setup EA login listener:", err);
    }

    return () => {
      if (unlistenPromise) void unlistenPromise.then((unlisten) => unlisten());
      if (unlistenEpicPromise) void unlistenEpicPromise.then((unlisten) => unlisten());
      if (unlistenEaPromise) void unlistenEaPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let isMounted = true;
    let unlistenPromise: Promise<() => void> | null = null;

    try {
      unlistenPromise = listen<string>("xbox_login_code", async (event) => {
        if (!isMounted) return;
        setTestResult({ success: true, message: "Xbox login code received. Fetching library..." });
        try {
          const result = await fetchXboxOwnedGames(event.payload);
          localStorage.setItem(STORAGE_KEYS.XBOX_GAMES_CACHE, JSON.stringify(result.games));
          if (result.gamertag) {
            localStorage.setItem(STORAGE_KEYS.XBOX_USERNAME, result.gamertag);
            setXboxGamertag(result.gamertag);
          }
          setXboxConnected(true);
          setXboxGamesCount(result.games.length);
          setTestResult({
            success: true,
            message: `Successfully linked Xbox Live. ${result.games.length} games imported.`,
          });
        } catch (err) {
          setTestResult({
            success: false,
            message: `Xbox Live login failed: ${getErrorMessage(err)}`,
          });
        }
      });
    } catch (err) {
      console.warn("Failed to setup xbox_login_code listener:", err);
    }

    return () => {
      isMounted = false;
      if (unlistenPromise) {
        void unlistenPromise.then((unlisten) => unlisten());
      }
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let isMounted = true;
    let unlistenPromise: Promise<() => void> | null = null;

    try {
      unlistenPromise = listen<string>("battlenet_login_data", async (event) => {
        if (!isMounted) return;
        setTestResult({
          success: true,
          message: "Battle.net session captured. Processing library...",
        });
        try {
          const games = await processBattleNetGamesPayload(event.payload);
          localStorage.setItem(STORAGE_KEYS.BATTLENET_GAMES_CACHE, JSON.stringify(games));
          setBattlenetConnected(true);
          setBattlenetGamesCount(games.length);
          setTestResult({
            success: true,
            message: `Successfully linked Battle.net. ${games.length} games imported.`,
          });

          // Dispatch a custom event so LibraryPage can reload
          window.dispatchEvent(new Event("battlenet_library_updated"));
        } catch (err) {
          setTestResult({
            success: false,
            message: `Battle.net parsing failed: ${getErrorMessage(err)}`,
          });
        }
      });
    } catch (err) {
      console.warn("Failed to setup battlenet_login_data listener:", err);
    }

    return () => {
      isMounted = false;
      if (unlistenPromise) {
        void unlistenPromise.then((unlisten) => unlisten());
      }
    };
  }, []);

  return (
    <section aria-labelledby="settings-heading" className="neo-dots space-y-3">
      <div className="mx-auto w-full max-w-[980px]">
        <h1
          className="neo-title border-b-2 border-black pb-2 text-xl leading-none text-[#171411] uppercase"
          id="settings-heading"
        >
          Settings Panel
        </h1>
      </div>
      <div className="mx-auto max-w-[980px] bg-[#fbf4e7]">
        {/* HEADER STRIP */}
        <div className="flex flex-wrap gap-2 border-b-2 border-black bg-[#171411] px-3 py-2 text-[#fbf4e7]">
          <StatCard label="Providers" value={providerCount} tone="paper" />
          <StatCard label="Steam" value={steamId ? "On" : "Off"} tone={steamId ? "teal" : "ink"} />
          <StatCard
            label="GOG"
            value={gogConnected ? "On" : "Off"}
            tone={gogConnected ? "teal" : "ink"}
          />
          <StatCard
            label="EA"
            value={eaConnected ? "On" : "Off"}
            tone={eaConnected ? "teal" : "ink"}
          />
          <StatCard
            label="Epic"
            value={epicConnected ? "On" : "Off"}
            tone={epicConnected ? "teal" : "ink"}
          />
          <StatCard
            label="Xbox"
            value={xboxConnected ? "On" : "Off"}
            tone={xboxConnected ? "teal" : "ink"}
          />
          <StatCard
            label="BNet"
            value={battlenetConnected ? "On" : "Off"}
            tone={battlenetConnected ? "teal" : "ink"}
          />
        </div>

        {/* STATUS MESSAGE */}
        {testResult ? (
          <div
            aria-live="polite"
            className={`neo-copy border-b-2 border-black px-3 py-1.5 text-[10px] font-black text-white uppercase ${
              testResult.success ? "bg-[#087d6d]" : "bg-[#b7102a]"
            }`}
            role={testResult.success ? "status" : "alert"}
          >
            {testResult.message}
          </div>
        ) : null}

        {steamVerifiedMessage ? (
          <div
            aria-live="polite"
            className={`neo-copy border-b-2 border-black px-3 py-1.5 text-[10px] font-black uppercase ${
              steamVerifiedMessage.includes("failed") ||
              steamVerifiedMessage.includes("unavailable")
                ? "bg-[#f5d6d9] text-[#77101f]"
                : "bg-[#8cf5e4] text-[#171411]"
            }`}
            role="status"
          >
            {steamVerifiedMessage}
          </div>
        ) : null}

        {/* CLOUD ACCOUNTS */}
        <div className="px-3 pt-3 pb-6">
          <div className="mb-2 flex items-center gap-2 border-b-2 border-black pb-2">
            <div className="min-w-0">
              <h2 className="neo-title text-base leading-none text-[#171411] uppercase">
                Cloud Account Link
              </h2>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            {/* STEAM CARD */}
            <article className="flex flex-col border-2 border-black bg-[#f6edd8] p-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-black text-[#171411] uppercase">Steam</h3>
                {steamId ? (
                  <span className="neo-copy border-2 border-black bg-[#087d6d] px-2 py-0.5 text-[9px] font-black text-white uppercase shadow-[1px_1px_0_#171411]">
                    Connected
                  </span>
                ) : null}
              </div>
              {steamId ? (
                <div className="space-y-1">
                  <span className="neo-copy block text-[10px] font-bold text-[#55504a] uppercase">
                    Signed in as
                  </span>
                  <span className="block truncate text-xs font-black text-[#087d6d]">
                    {steamUsername || "Steam User"}
                  </span>
                  <span
                    className={`neo-copy block border-2 border-black px-2 py-1 text-[10px] font-black uppercase ${
                      steamVerifiedAccount
                        ? "bg-[#087d6d] text-white"
                        : "bg-[#efe6d4] text-[#171411]"
                    }`}
                  >
                    {steamVerifiedAccount ? "Verified locally" : "Local fallback"}
                  </span>
                  <button
                    className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                    type="button"
                    onClick={() => void handleSteamDisconnect()}
                  >
                    <LogOut className="h-3 w-3" />
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-black text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                  type="button"
                  onClick={() => openDesktopLogin("Steam", openSteamLoginWindow)}
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  Connect
                </button>
              )}
            </article>

            {/* GOG CARD */}
            <article className="flex flex-col border-2 border-black bg-[#f6edd8] p-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-black text-[#171411] uppercase">GOG Galaxy</h3>
                {gogConnected ? (
                  <span className="neo-copy border-2 border-black bg-[#087d6d] px-2 py-0.5 text-[9px] font-black text-white uppercase shadow-[1px_1px_0_#171411]">
                    Connected
                  </span>
                ) : null}
              </div>
              {gogConnected ? (
                <div className="space-y-1">
                  <span className="neo-copy block text-[10px] font-bold text-[#55504a] uppercase">
                    Status
                  </span>
                  <span className="block truncate text-xs font-black text-[#087d6d]">
                    Successfully Connected
                  </span>
                  <button
                    className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                    type="button"
                    onClick={() => void handleGogDisconnect()}
                  >
                    <LogOut className="h-3 w-3" />
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-black text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                  type="button"
                  onClick={() => openDesktopLogin("GOG", openGogLoginWindow)}
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  Connect
                </button>
              )}
            </article>

            {/* EA CARD */}
            <article className="flex flex-col border-2 border-black bg-[#f6edd8] p-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-black text-[#171411] uppercase">EA App</h3>
                {eaConnected ? (
                  <span className="neo-copy border-2 border-black bg-[#087d6d] px-2 py-0.5 text-[9px] font-black text-white uppercase shadow-[1px_1px_0_#171411]">
                    Connected
                  </span>
                ) : null}
              </div>
              {eaConnected ? (
                <div className="space-y-1">
                  <span className="neo-copy block text-[10px] font-bold text-[#55504a] uppercase">
                    Status
                  </span>
                  <span className="block truncate text-xs font-black text-[#087d6d]">
                    Successfully Connected
                  </span>
                  <button
                    className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                    type="button"
                    onClick={() => void handleEaDisconnect()}
                  >
                    <LogOut className="h-3 w-3" />
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-black text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                  type="button"
                  onClick={() => openDesktopLogin("EA", openEaLoginWindow)}
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  Connect
                </button>
              )}
            </article>

            {/* EPIC CARD */}
            <article className="flex flex-col border-2 border-black bg-[#f6edd8] p-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-black text-[#171411] uppercase">Epic Games</h3>
                {epicConnected ? (
                  <span className="neo-copy border-2 border-black bg-[#087d6d] px-2 py-0.5 text-[9px] font-black text-white uppercase shadow-[1px_1px_0_#171411]">
                    Connected
                  </span>
                ) : null}
              </div>
              {epicConnected ? (
                <div className="space-y-1">
                  <span className="neo-copy block text-[10px] font-bold text-[#55504a] uppercase">
                    Signed in as
                  </span>
                  <span className="block truncate text-xs font-black text-[#087d6d]">
                    {epicDisplayName || "Epic User"}
                  </span>
                  <button
                    className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                    type="button"
                    onClick={handleEpicDisconnect}
                  >
                    <LogOut className="h-3 w-3" />
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-black text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                  type="button"
                  onClick={() => openDesktopLogin("Epic", openEpicLoginWindow)}
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  Connect
                </button>
              )}
            </article>

            {/* XBOX CARD */}
            <article className="flex flex-col border-2 border-black bg-[#f6edd8] p-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-black text-[#171411] uppercase">Xbox</h3>
                {xboxConnected ? (
                  <span className="neo-copy border-2 border-black bg-[#087d6d] px-2 py-0.5 text-[9px] font-black text-white uppercase shadow-[1px_1px_0_#171411]">
                    Connected
                  </span>
                ) : null}
              </div>
              {xboxConnected ? (
                <div className="space-y-1">
                  <span className="neo-copy block text-[10px] font-bold text-[#55504a] uppercase">
                    Status
                  </span>
                  <span className="block truncate text-xs font-black text-[#087d6d]">
                    {xboxGamertag || "Connected"} ({xboxGamesCount} games)
                  </span>
                  <button
                    className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                    type="button"
                    onClick={handleXboxDisconnect}
                  >
                    <LogOut className="h-3 w-3" />
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-black text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                  type="button"
                  onClick={() => openDesktopLogin("Xbox", openXboxLoginWindow)}
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  Connect
                </button>
              )}
            </article>

            {/* BATTLENET CARD */}
            <article className="flex flex-col border-2 border-black bg-[#f6edd8] p-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-black text-[#171411] uppercase">Battle.net</h3>
                {battlenetConnected ? (
                  <span className="neo-copy border-2 border-black bg-[#087d6d] px-2 py-0.5 text-[9px] font-black text-white uppercase shadow-[1px_1px_0_#171411]">
                    Connected
                  </span>
                ) : null}
              </div>
              {battlenetConnected ? (
                <div className="space-y-1">
                  <span className="neo-copy block text-[10px] font-bold text-[#55504a] uppercase">
                    Status
                  </span>
                  <span className="block truncate text-xs font-black text-[#087d6d]">
                    Connected ({battlenetGamesCount} games)
                  </span>
                  <button
                    className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                    type="button"
                    onClick={handleBattlenetDisconnect}
                  >
                    <LogOut className="h-3 w-3" />
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  className="neo-copy flex h-8 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-black text-white uppercase shadow-[1px_1px_0_#171411] transition hover:bg-[#a10825]"
                  type="button"
                  onClick={() => openDesktopLogin("Battle.net", openBattleNetLoginWindow)}
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  Connect
                </button>
              )}
            </article>
          </div>
        </div>

        <LauncherUpdatePanel />
      </div>
    </section>
  );
}
