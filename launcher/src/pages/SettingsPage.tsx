import { FolderOpen, HardDrive, Power, RefreshCw, ShieldCheck, Link, LogOut, Gamepad2 } from "lucide-react";
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { z } from "zod";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { getDefaultInstallDir, getSystemInfo, openSteamLoginWindow, openGogLoginWindow, openEpicLoginWindow, openEaLoginWindow, openXboxLoginWindow, fetchXboxOwnedGames, normalizeSteamOwnedGames, fetchSteamProfileName, authenticateEpicLegendary, gogExchangeCode, gogLogout, gogGetToken, eaGetToken, eaLogout, openBattleNetLoginWindow, processBattleNetGamesPayload } from "../lib/launcher";
import { STEAM_OWNED_GAMES_CACHE_VERSION, STORAGE_KEYS } from "../lib/storage-keys";
import type { SystemInfo } from "../lib/types";


function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

const settingSchemas = {
  startWithSystem: z.boolean(),
  autoUpdateGames: z.boolean(),
  steamId: z.string().max(64),
  steamUsername: z.string().max(128),
};

interface NeoToggleProps {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}

function NeoToggle({ checked, description, label, onChange }: NeoToggleProps) {
  return (
    <div className="grid gap-4 border-4 border-black bg-[#f5eedf] p-5 shadow-[4px_4px_0_#171411] sm:grid-cols-[1fr_110px] sm:items-center">
      <div>
        <h3 className="text-2xl font-black uppercase leading-none text-[#171411]">
          {label}
        </h3>
        <p className="neo-copy mt-2 text-[10px] font-bold uppercase text-[#55504a]">
          {description}
        </p>
      </div>
      <button
        aria-checked={checked}
        aria-label={label}
        className={`neo-copy h-12 border-2 border-black text-xs font-bold uppercase shadow-[3px_3px_0_#171411] ${
          checked ? "bg-[#087d6d] text-white" : "bg-[#efe6d4] text-[#171411]"
        }`}
        role="switch"
        type="button"
        onClick={() => onChange(!checked)}
      >
        {checked ? "Active" : "Off"}
      </button>
    </div>
  );
}

export function SettingsPage() {
  const [startWithSystem, setStartWithSystem] = useLocalStorageState(
    "launcher.startWithSystem",
    false,
    settingSchemas.startWithSystem,
  );
  const [autoUpdateGames, setAutoUpdateGames] = useLocalStorageState(
    "launcher.autoUpdateGames",
    true,
    settingSchemas.autoUpdateGames,
  );
  const [installDir, setInstallDir] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [folderMessage, setFolderMessage] = useState<string | null>(null);

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

  useEffect(() => {
    let isMounted = true;

    // Check GOG connection via backend token first, then fallback to localStorage
    gogGetToken().then((backendToken) => {
      if (!isMounted) return;
      if (backendToken && backendToken.accessToken) {
        setGogConnected(true);
        // Sync to localStorage for backward compatibility
        localStorage.setItem(STORAGE_KEYS.GOG_TOKEN, JSON.stringify({
          accessToken: backendToken.accessToken,
          refreshToken: backendToken.refreshToken,
          expiresAt: backendToken.expiresAt,
          userId: backendToken.userId,
        }));
      } else {
        // Check localStorage as fallback
        const gogTokenStr = localStorage.getItem(STORAGE_KEYS.GOG_TOKEN);
        if (gogTokenStr) {
          try {
            const token = JSON.parse(gogTokenStr);
            if (token && token.accessToken) {
              setGogConnected(true);
            }
          } catch {
            localStorage.removeItem(STORAGE_KEYS.GOG_TOKEN);
          }
        }
      }
    }).catch(() => {
      if (!isMounted) return;
      const gogTokenStr = localStorage.getItem(STORAGE_KEYS.GOG_TOKEN);
      if (gogTokenStr) {
        try {
          const token = JSON.parse(gogTokenStr);
          if (token && token.accessToken) {
            setGogConnected(true);
          }
        } catch {
          localStorage.removeItem(STORAGE_KEYS.GOG_TOKEN);
        }
      }
    });

    eaGetToken().then((backendEaToken) => {
      if (!isMounted) return;
      if (backendEaToken?.accessToken) {
        setEaConnected(true);
        localStorage.setItem(STORAGE_KEYS.EA_TOKEN, JSON.stringify({
          accessToken: backendEaToken.accessToken,
          capturedAt: backendEaToken.capturedAt,
        }));
      } else {
        const eaTokenStr = localStorage.getItem(STORAGE_KEYS.EA_TOKEN);
        if (eaTokenStr) {
          try {
            const token = JSON.parse(eaTokenStr);
            if (token?.accessToken) {
              setEaConnected(true);
            }
          } catch {
            localStorage.removeItem(STORAGE_KEYS.EA_TOKEN);
          }
        }
      }
    }).catch(() => {
      if (!isMounted) return;
      const eaTokenStr = localStorage.getItem(STORAGE_KEYS.EA_TOKEN);
      if (eaTokenStr) {
        try {
          const token = JSON.parse(eaTokenStr);
          if (token?.accessToken) {
            setEaConnected(true);
          }
        } catch {
          localStorage.removeItem(STORAGE_KEYS.EA_TOKEN);
        }
      }
    });

    const epicTokenStr = localStorage.getItem(STORAGE_KEYS.EPIC_TOKEN);
    if (epicTokenStr) {
      try {
        const token = JSON.parse(epicTokenStr);
        if (token && token.accessToken) {
          setEpicConnected(true);
          setEpicDisplayName(token.displayName || "");
        }
      } catch {
        localStorage.removeItem("launcher.epicToken");
      }
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

    if (steamId && !steamUsername) {
      void fetchSteamProfileName(steamId).then(name => {
        if (!isMounted) return;
        setSteamUsername(name ?? "Steam User");
      }).catch(err => {
        console.warn("Failed to fetch steam username on mount:", err);
        if (isMounted) setSteamUsername("Steam User");
      });
    }

    return () => {
      isMounted = false;
    };
  }, [steamId, steamUsername, setSteamUsername]);

  async function handleGogCodeExchange(code: string) {
    setTestResult({ success: true, message: "GOG login code received. Exchanging..." });
    try {
      const token = await gogExchangeCode(code);
      if (token && token.accessToken) {
        // Store in localStorage for backward compatibility with LibraryPage
        localStorage.setItem(STORAGE_KEYS.GOG_TOKEN, JSON.stringify({
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          expiresAt: token.expiresAt,
          userId: token.userId,
        }));
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
      
      localStorage.setItem(STORAGE_KEYS.EPIC_TOKEN, JSON.stringify({
        accessToken: "legendary-auth-token",
        displayName: "Epic User",
      }));
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

  useEffect(() => {
    let isMounted = true;
    let unlistenPromise: Promise<() => void> | null = null;
    let unlistenScrapedPromise: Promise<() => void> | null = null;
    let unlistenErrorPromise: Promise<() => void> | null = null;

    try {
      unlistenPromise = listen<string>("steam_login_success", async (event) => {
        if (!isMounted) return;
        const steamIdVal = event.payload;
        setSteamId(steamIdVal);
        try {
          const name = await fetchSteamProfileName(steamIdVal);
          if (isMounted) setSteamUsername(name ?? "Steam User");
        } catch (err) {
          console.warn("Failed to fetch steam username:", err);
          if (isMounted) setSteamUsername("Steam User");
        }
        setTestResult({
          success: true,
          message: "Login successful. Your game list is now being fetched...",
        });
      });

      unlistenScrapedPromise = listen<unknown[]>("steam_scraped_games_success", (event) => {
        if (!isMounted) return;
        const ownedGames = normalizeSteamOwnedGames(event.payload);
        localStorage.setItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE, JSON.stringify(ownedGames));
        localStorage.setItem(STORAGE_KEYS.STEAM_OWNED_GAMES_CACHE_VERSION, STEAM_OWNED_GAMES_CACHE_VERSION);

        setTestResult({
          success: true,
          message: `Successfully signed in through Steam. ${ownedGames.length} games were synced.`,
        });
      });

      unlistenErrorPromise = listen<string>("steam_scraped_games_error", (event) => {
        if (!isMounted) return;
        console.warn("[Settings] Scraper failed:", event.payload);

        setTestResult({
          success: false,
          message: `Steam sync failed: ${event.payload}`,
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
          localStorage.setItem(STORAGE_KEYS.EA_TOKEN, JSON.stringify({
            accessToken: token.accessToken,
            capturedAt: token.capturedAt,
          }));
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
          setTestResult({ success: true, message: `Successfully linked Xbox Live. ${result.games.length} games imported.` });
        } catch (err) {
          setTestResult({ success: false, message: `Xbox Live login failed: ${getErrorMessage(err)}` });
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
    let isMounted = true;
    let unlistenPromise: Promise<() => void> | null = null;

    try {
      unlistenPromise = listen<string>("battlenet_login_data", async (event) => {
        if (!isMounted) return;
        setTestResult({ success: true, message: "Battle.net session captured. Processing library..." });
        try {
          const games = await processBattleNetGamesPayload(event.payload);
          localStorage.setItem(STORAGE_KEYS.BATTLENET_GAMES_CACHE, JSON.stringify(games));
          setBattlenetConnected(true);
          setBattlenetGamesCount(games.length);
          setTestResult({ success: true, message: `Successfully linked Battle.net. ${games.length} games imported.` });
          
          // Dispatch a custom event so LibraryPage can reload
          window.dispatchEvent(new Event("battlenet_library_updated"));
        } catch (err) {
          setTestResult({ success: false, message: `Battle.net parsing failed: ${getErrorMessage(err)}` });
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

  useEffect(() => {
    let isMounted = true;

    async function loadNativeSettings() {
      try {
        const [info, defaultDir] = await Promise.all([
          getSystemInfo(),
          getDefaultInstallDir(),
        ]);

        if (isMounted) {
          setSystemInfo(info);
          setInstallDir(defaultDir);
          setCommandError(null);
        }
      } catch (error) {
        if (isMounted) {
          setCommandError(getErrorMessage(error));
        }
      }
    }

    void loadNativeSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleChooseInstallFolder() {
    setFolderMessage(
      "Native folder dialog is prepared and waiting for Tauri integration.",
    );
  }

  function handleReloadPath() {
    setInstallDir(null);
    setCommandError(null);
    void getDefaultInstallDir()
      .then(setInstallDir)
      .catch((error: unknown) => setCommandError(getErrorMessage(error)));
  }

  return (
    <section>
      <div className="mb-8 border-b-4 border-black pb-4">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="neo-copy inline-flex border-2 border-black bg-[#171411] px-3 py-1 text-xs font-bold uppercase text-white shadow-[3px_3px_0_#171411]">
              System Configuration
            </span>
            <h1 className="neo-title mt-2 max-w-[680px] text-[clamp(3.5rem,15vw,6rem)] leading-[0.82] text-[#171411]">
              Settings Panel
            </h1>
            <p className="neo-copy mt-3 text-xs font-bold uppercase text-[#55504a]">
              Launcher runtime // local storage // native paths
            </p>
          </div>

          <button
            className="neo-copy flex h-10 w-full items-center justify-center gap-3 border-2 border-black bg-[#f5eedf] px-5 text-xs font-bold uppercase shadow-[2px_2px_0_#171411] sm:w-fit"
            type="button"
            onClick={handleReloadPath}
          >
            <RefreshCw className="h-4 w-4" />
            Reload
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]">
            <div className="flex items-center justify-between border-b-4 border-black p-5">
              <div>
                <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                  Install Target
                </p>
                <h2 className="text-3xl font-black uppercase text-[#171411]">
                  Game Storage
                </h2>
              </div>
              <HardDrive className="h-10 w-10 text-[#c20b2f]" />
            </div>

            <div className="p-5">
              <div className="border-2 border-black bg-[#efe6d4] p-4">
                <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                  Default install folder
                </p>
                <p className="mt-2 break-all text-lg font-black text-[#171411]">
                  {installDir ?? "Loading native path..."}
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  className="neo-copy flex h-11 items-center justify-center gap-3 border-2 border-black bg-[#c20b2f] px-5 text-xs font-bold uppercase text-white shadow-[3px_3px_0_#171411]"
                  type="button"
                  onClick={handleChooseInstallFolder}
                >
                  <FolderOpen className="h-4 w-4" />
                  Choose Folder
                </button>
                <button
                  className="neo-copy flex h-11 items-center justify-center gap-3 border-2 border-black bg-[#f5eedf] px-5 text-xs font-bold uppercase shadow-[3px_3px_0_#171411]"
                  type="button"
                  onClick={handleReloadPath}
                >
                  <RefreshCw className="h-4 w-4" />
                  Reload Path
                </button>
              </div>

              {folderMessage ? (
                <p className="neo-copy mt-4 border-2 border-black bg-[#087d6d] px-3 py-2 text-[10px] font-bold uppercase text-white">
                  {folderMessage}
                </p>
              ) : null}
            </div>
          </div>

          {/* CLOUD ACCOUNTS LINKING */}
          <div className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]">
            <div className="flex items-center justify-between border-b-4 border-black p-5">
              <div>
                <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                  Third-Party Integration
                </p>
                <h2 className="text-3xl font-black uppercase text-[#171411]">
                  Cloud Account Link
                </h2>
              </div>
              <Link className="h-10 w-10 text-[#087d6d]" />
            </div>

            <div className="p-5 space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                {/* STEAM CARD */}
                <div className="border-2 border-black bg-[#efe6d4] p-4 flex flex-col justify-between shadow-[2px_2px_0_#171411]">
                  <div>
                    <h3 className="text-xl font-black uppercase text-[#171411] mb-1">
                      Steam
                    </h3>
                    <p className="neo-copy text-[9px] font-bold uppercase text-[#55504a] leading-relaxed mb-4">
                      Syncs your Steam library through secure login and local Steam cache. No API key required.
                    </p>
                  </div>
                  <div>
                    {steamId ? (
                      <div className="border border-black bg-[#f5eedf] p-3 space-y-2">
                        <span className="neo-copy text-[8px] font-bold uppercase text-[#55504a] block">Signed in as</span>
                        <span className="font-black text-xs text-[#087d6d] block truncate">{steamUsername || "Steam User"}</span>
                        <button
                          className="neo-copy w-full flex h-8 items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold uppercase text-white shadow-[1px_1px_0_#171411] hover:bg-[#a10825] transition"
                          type="button"
                          onClick={() => { setSteamId(""); setSteamUsername(""); setTestResult(null); }}
                        >
                          <LogOut className="h-3 w-3" />
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        className="neo-copy w-full flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-4 text-xs font-black uppercase text-white shadow-[2px_2px_0_#171411] hover:bg-[#a10825] transition"
                        type="button"
                        onClick={() => {
                          void openSteamLoginWindow().catch((err) => {
                            setTestResult({ success: false, message: `Failed to open: ${getErrorMessage(err)}` });
                          });
                        }}
                      >
                        <Link className="h-3.5 w-3.5" />
                        Connect
                      </button>
                    )}
                  </div>
                </div>

                {/* GOG CARD */}
                <div className="border-2 border-black bg-[#efe6d4] p-4 flex flex-col justify-between shadow-[2px_2px_0_#171411]">
                  <div>
                    <h3 className="text-xl font-black uppercase text-[#171411] mb-1">
                      GOG Galaxy
                    </h3>
                    <p className="neo-copy text-[9px] font-bold uppercase text-[#55504a] leading-relaxed mb-4">
                      Fully automatic synchronization of your GOG games through secure login.
                    </p>
                  </div>
                  <div>
                    {gogConnected ? (
                      <div className="border border-black bg-[#f5eedf] p-3 space-y-2">
                        <span className="neo-copy text-[8px] font-bold uppercase text-[#55504a] block">Status</span>
                        <span className="font-black text-xs text-[#087d6d] block truncate">Successfully Connected</span>
                        <button
                          className="neo-copy w-full flex h-8 items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold uppercase text-white shadow-[1px_1px_0_#171411] hover:bg-[#a10825] transition"
                          type="button"
                          onClick={() => {
                            gogLogout().catch(() => {});
                            localStorage.removeItem(STORAGE_KEYS.GOG_TOKEN);
                            setGogConnected(false);
                            setTestResult(null);
                          }}
                        >
                          <LogOut className="h-3 w-3" />
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        className="neo-copy w-full flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#087d6d] px-4 text-xs font-black uppercase text-white shadow-[2px_2px_0_#171411] hover:bg-[#066154] transition"
                        type="button"
                        onClick={() => {
                          void openGogLoginWindow().catch((err) => {
                            setTestResult({ success: false, message: `Failed to open: ${getErrorMessage(err)}` });
                          });
                        }}
                      >
                        <Link className="h-3.5 w-3.5" />
                        Connect
                      </button>
                    )}
                  </div>
                </div>

                {/* EA APP CARD */}
                <div className="border-2 border-black bg-[#efe6d4] p-4 flex flex-col justify-between shadow-[2px_2px_0_#171411]">
                  <div>
                    <h3 className="text-xl font-black uppercase text-[#171411] mb-1">
                      EA App
                    </h3>
                    <p className="neo-copy text-[9px] font-bold uppercase text-[#55504a] leading-relaxed mb-4">
                      Sync your EA library via secure browser login (same flow as Playnite). Installed EA games are still detected locally.
                    </p>
                  </div>
                  <div>
                    {eaConnected ? (
                      <div className="border border-black bg-[#f5eedf] p-3 space-y-2">
                        <span className="neo-copy text-[8px] font-bold uppercase text-[#55504a] block">Status</span>
                        <span className="font-black text-xs text-[#087d6d] block truncate">Successfully Connected</span>
                        <button
                          className="neo-copy w-full flex h-8 items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold uppercase text-white shadow-[1px_1px_0_#171411] hover:bg-[#a10825] transition"
                          type="button"
                          onClick={() => {
                            void eaLogout().catch(() => {});
                            localStorage.removeItem(STORAGE_KEYS.EA_TOKEN);
                            setEaConnected(false);
                            setTestResult(null);
                          }}
                        >
                          <LogOut className="h-3 w-3" />
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        className="neo-copy w-full flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#f56c2d] px-4 text-xs font-black uppercase text-white shadow-[2px_2px_0_#171411] hover:bg-[#d45a22] transition"
                        type="button"
                        onClick={() => {
                          void openEaLoginWindow().catch((err) => {
                            setTestResult({ success: false, message: `Failed to open: ${getErrorMessage(err)}` });
                          });
                        }}
                      >
                        <Link className="h-3.5 w-3.5" />
                        Connect EA
                      </button>
                    )}
                  </div>
                </div>

                {/* EPIC GAMES CARD */}
                <div className="border-2 border-black bg-[#efe6d4] p-4 flex flex-col justify-between shadow-[2px_2px_0_#171411]">
                  <div>
                    <h3 className="text-xl font-black uppercase text-[#171411] mb-1">
                      Epic Games
                    </h3>
                    <p className="neo-copy text-[9px] font-bold uppercase text-[#55504a] leading-relaxed mb-4">
                      Import your Epic library. Sign in through the browser to automatically connect.
                    </p>
                  </div>
                  <div>
                    {epicConnected ? (
                      <div className="border border-black bg-[#f5eedf] p-3 space-y-2">
                        <span className="neo-copy text-[8px] font-bold uppercase text-[#55504a] block">Signed in as</span>
                        <span className="font-black text-xs text-[#087d6d] block truncate">{epicDisplayName || "Epic User"}</span>
                        <button
                          className="neo-copy w-full flex h-8 items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold uppercase text-white shadow-[1px_1px_0_#171411] hover:bg-[#a10825] transition"
                          type="button"
                          onClick={() => {
                            localStorage.removeItem(STORAGE_KEYS.EPIC_TOKEN);
                            setEpicConnected(false);
                            setEpicDisplayName("");
                            setTestResult(null);
                          }}
                        >
                          <LogOut className="h-3 w-3" />
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        className="neo-copy w-full flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#171411] px-4 text-xs font-black uppercase text-white shadow-[2px_2px_0_#171411] hover:bg-[#333] transition"
                        type="button"
                        onClick={() => {
                          void openEpicLoginWindow().catch((err) => {
                            setTestResult({ success: false, message: `Failed to open: ${getErrorMessage(err)}` });
                          });
                        }}
                      >
                        <Link className="h-3.5 w-3.5" />
                        Browser Login
                      </button>
                    )}
                  </div>
                </div>

                {/* XBOX CARD */}
                <div className="border-2 border-black bg-[#efe6d4] p-4 flex flex-col justify-between shadow-[2px_2px_0_#171411]">
                  <div>
                    <h3 className="text-xl font-black uppercase text-[#171411] mb-1">
                      Xbox / MS Store
                    </h3>
                    <p className="neo-copy text-[9px] font-bold uppercase text-[#55504a] leading-relaxed mb-4">
                      Import your Xbox Game Pass and Microsoft Store games.
                    </p>
                  </div>
                  <div>
                    {xboxConnected ? (
                      <div className="border border-black bg-[#f5eedf] p-3 space-y-2">
                        <span className="neo-copy text-[8px] font-bold uppercase text-[#55504a] block">Status</span>
                        <div className="flex flex-col gap-1">
                          <span className="font-black text-xs text-[#087d6d] block truncate">Connected ({xboxGamesCount} games)</span>
                          {xboxGamertag && <span className="font-bold text-[10px] text-black">User: {xboxGamertag}</span>}
                        </div>
                        <button
                          className="neo-copy w-full flex h-8 items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold uppercase text-white shadow-[1px_1px_0_#171411] hover:bg-[#a10825] transition"
                          type="button"
                          onClick={() => {
                            localStorage.removeItem(STORAGE_KEYS.XBOX_GAMES_CACHE);
                            localStorage.removeItem(STORAGE_KEYS.XBOX_USERNAME);
                            setXboxConnected(false);
                            setXboxGamesCount(0);
                            setXboxGamertag("");
                            setTestResult(null);
                          }}
                        >
                          <LogOut className="h-3 w-3" />
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        className="neo-copy w-full flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#107c10] px-4 text-xs font-black uppercase text-white shadow-[2px_2px_0_#171411] hover:bg-[#0b580b] transition"
                        type="button"
                        onClick={() => {
                          void openXboxLoginWindow().catch((err) => {
                            setTestResult({ success: false, message: `Failed to open: ${getErrorMessage(err)}` });
                          });
                        }}
                      >
                        <Link className="h-3.5 w-3.5" />
                        Connect Xbox
                      </button>
                    )}
                  </div>
                </div>

                {/* BATTLENET CARD */}
                <div className="border-2 border-black bg-[#efe6d4] p-4 flex flex-col justify-between shadow-[2px_2px_0_#171411]">
                  <div>
                    <h3 className="text-xl font-black uppercase text-[#171411] mb-1">
                      Battle.net
                    </h3>
                    <p className="neo-copy text-[9px] font-bold uppercase text-[#55504a] leading-relaxed mb-4">
                      Import your Blizzard library via web login.
                    </p>
                  </div>
                  <div>
                    {battlenetConnected ? (
                      <div className="border border-black bg-[#f5eedf] p-3 space-y-2">
                        <span className="neo-copy text-[8px] font-bold uppercase text-[#55504a] block">Status</span>
                        <span className="font-black text-xs text-[#087d6d] block truncate">Connected ({battlenetGamesCount} games)</span>
                        <button
                          className="neo-copy w-full flex h-8 items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-3 text-[10px] font-bold uppercase text-white shadow-[1px_1px_0_#171411] hover:bg-[#a10825] transition"
                          type="button"
                          onClick={() => {
                            localStorage.removeItem(STORAGE_KEYS.BATTLENET_GAMES_CACHE);
                            setBattlenetConnected(false);
                            setBattlenetGamesCount(0);
                            setTestResult(null);
                          }}
                        >
                          <LogOut className="h-3 w-3" />
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        className="neo-copy w-full flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#0074e0] px-4 text-xs font-black uppercase text-white shadow-[2px_2px_0_#171411] hover:bg-[#005bb5] transition"
                        type="button"
                        onClick={() => {
                          void openBattleNetLoginWindow().catch((err) => {
                            setTestResult({ success: false, message: `Failed to open: ${getErrorMessage(err)}` });
                          });
                        }}
                      >
                        <Link className="h-3.5 w-3.5" />
                        Connect BNet
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {testResult ? (
                <div
                  className={`neo-copy border-2 border-black px-3 py-2 text-xs font-bold uppercase text-white shadow-[2px_2px_0_#171411] ${
                    testResult.success ? "bg-[#087d6d]" : "bg-[#c20b2f]"
                  }`}
                >
                  {testResult.message}
                </div>
              ) : null}
            </div>
          </div>

          {/* MULTI-PLATFORM SCANNER STATUS */}
          <div className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]">
            <div className="flex items-center justify-between border-b-4 border-black p-5">
              <div>
                <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                  System Compatibility
                </p>
                <h2 className="text-3xl font-black uppercase text-[#171411]">
                  Local Scanners & Launchers
                </h2>
              </div>
              <Gamepad2 className="h-10 w-10 text-[#c20b2f]" />
            </div>

            <div className="p-5">
              <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a] leading-relaxed mb-4">
                Open Game Launcher automatically scans your PC in the background for installed games from these launchers. No login required.
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["Steam", "Local scan & cloud sync"],
                  ["Epic Games", "Local manifest scan (Windows/Linux)"],
                  ["GOG Galaxy", "Local manifest scan (Windows/Linux)"],
                  ["Ubisoft Connect", "Automatic path scan & launcher launch"],
                  ["EA App", "Local scan + cloud library when connected"],
                  ["Battle.net", "Automatic scan of installed titles"],
                  ["MS Store / Xbox", "Local Windows/MS app library scan"],
                ].map(([name, desc]) => (
                  <div key={name} className="border-2 border-black bg-[#efe6d4] p-3 flex flex-col justify-between">
                    <div>
                      <span className="font-black text-sm text-[#171411] block uppercase">{name}</span>
                      <span className="neo-copy text-[8px] font-bold uppercase text-[#55504a] leading-tight block mt-1">{desc}</span>
                    </div>
                    <div className="mt-2 text-left">
                      <span className="neo-copy inline-block border border-black bg-[#087d6d] px-1.5 py-0.5 text-[8px] font-black uppercase text-white">
                        Active // Local
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <NeoToggle
            checked={startWithSystem}
            description="Local launcher preference in browser storage"
            label="Start With System"
            onChange={setStartWithSystem}
          />
          <NeoToggle
            checked={autoUpdateGames}
            description="Automatically queue updates in the download queue"
            label="Auto-Update Games"
            onChange={setAutoUpdateGames}
          />
        </div>

        <aside className="space-y-4">
          <div className="border-4 border-black bg-[#171411] p-5 text-[#f5eedf] shadow-[4px_4px_0_#171411]">
            <div className="flex items-center gap-3">
              <Power className="h-6 w-6 text-[#c20b2f]" />
              <h2 className="text-2xl font-black uppercase">Runtime</h2>
            </div>
            <dl className="mt-5 space-y-3">
              {[
                ["OS", systemInfo?.os ?? "Unavailable"],
                ["Arch", systemInfo?.arch ?? "Unavailable"],
                ["Version", systemInfo?.appVersion ?? "0.1.0"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-4 border-2 border-[#f5eedf] p-3"
                >
                  <dt className="neo-copy text-[10px] font-bold uppercase">
                    {label}
                  </dt>
                  <dd className="font-black uppercase">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411]">
            <div className="border-b-4 border-black p-5">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-[#087d6d]" />
                <h2 className="text-2xl font-black uppercase">Status</h2>
              </div>
            </div>
            <div className="p-5">
              <p className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                Native Commands
              </p>
              <p className="mt-2 text-3xl font-black uppercase text-[#171411]">
                {commandError ? "Fallback" : "Ready"}
              </p>
              {commandError ? (
                <p className="neo-copy mt-4 border-2 border-black bg-[#efe6d4] p-3 text-[10px] font-bold uppercase text-[#55504a]">
                  {commandError}
                </p>
              ) : (
                <p className="neo-copy mt-4 text-[10px] font-bold uppercase text-[#55504a]">
                  System data loaded.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
