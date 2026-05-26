import { FolderOpen, HardDrive, Power, RefreshCw, ShieldCheck, Link, LogOut, Gamepad2 } from "lucide-react";
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { getDefaultInstallDir, getSystemInfo, openSteamLoginWindow, openGogLoginWindow, openEpicLoginWindow, normalizeSteamOwnedGames, openSteamScraperWindow } from "../lib/launcher";
import type { SystemInfo } from "../lib/types";


function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

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
  );
  const [autoUpdateGames, setAutoUpdateGames] = useLocalStorageState(
    "launcher.autoUpdateGames",
    true,
  );
  const [installDir, setInstallDir] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [folderMessage, setFolderMessage] = useState<string | null>(null);

  const [steamId, setSteamId] = useLocalStorageState(
    "launcher.steamId",
    "",
  );
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [steamTestResult, setSteamTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSteamTesting, setIsSteamTesting] = useState(false);

  const [gogConnected, setGogConnected] = useState(false);
  const [epicConnected, setEpicConnected] = useState(false);
  const [epicCodeInput, setEpicCodeInput] = useState("");
  const [epicDisplayName, setEpicDisplayName] = useState("");

  useEffect(() => {
    const gogTokenStr = localStorage.getItem("launcher.gogToken");
    if (gogTokenStr) {
      try {
        const token = JSON.parse(gogTokenStr);
        if (token && token.accessToken) {
          setGogConnected(true);
        }
      } catch {
        localStorage.removeItem("launcher.gogToken");
      }
    }

    const epicTokenStr = localStorage.getItem("launcher.epicToken");
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
  }, []);

  async function handleGogCodeExchange(code: string) {
    setTestResult({ success: true, message: "GOG login code received. Exchanging..." });
    try {
      const params = new URLSearchParams();
      params.append("client_id", "46899977096215655");
      params.append("client_secret", "9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9");
      params.append("grant_type", "authorization_code");
      params.append("code", code);
      params.append("redirect_uri", "http://127.0.0.1:18235/");

      const response = await fetch("https://auth.gog.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        throw new Error(`Token exchange failed with status: ${response.status}`);
      }

      const data = await response.json();
      if (data.access_token) {
        localStorage.setItem("launcher.gogToken", JSON.stringify({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + (data.expires_in * 1000),
          userId: data.user_id,
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
    setTestResult({ success: true, message: "Exchanging Epic authorization code..." });
    try {
      const params = new URLSearchParams();
      params.append("grant_type", "authorization_code");
      params.append("code", authCode.trim());

      const response = await fetch("https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": "Basic MzRhMDJjZjhmNDQxNGUyOWIxNTk4NTI4ZmIzNDYyNDU6YjA3MGVlNTM1YjliNGNjZmJhMmM1NTZiNjk2Nzc1ZGI=",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        throw new Error(`Epic exchange failed with status: ${response.status}`);
      }

      const data = await response.json();
      if (data.access_token) {
        localStorage.setItem("launcher.epicToken", JSON.stringify({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + (data.expires_in * 1000),
          accountId: data.account_id,
          displayName: data.displayName,
        }));
        setEpicConnected(true);
        setEpicDisplayName(data.displayName || "");
        setEpicCodeInput("");
        setTestResult({
          success: true,
          message: `Successfully linked Epic Games. Signed in as ${data.displayName}.`,
        });
      } else {
        throw new Error("No access_token received from Epic response.");
      }
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
      unlistenPromise = listen<string>("steam_login_success", (event) => {
        if (!isMounted) return;
        const steamIdVal = event.payload;
        setSteamId(steamIdVal);
        setTestResult({
          success: true,
          message: "Login successful. Your game list is now being fetched...",
        });
      });

      unlistenScrapedPromise = listen<unknown[]>("steam_scraped_games_success", (event) => {
        if (!isMounted) return;
        const ownedGames = normalizeSteamOwnedGames(event.payload);
        console.log("[Settings] Scraped games successfully:", ownedGames.length);
        localStorage.setItem("launcher.steamOwnedGamesCache", JSON.stringify(ownedGames));
        localStorage.setItem("launcher.steamOwnedGamesCacheVersion", "2");

        const successMsg = `OK: Found ${ownedGames.length} owned games`;
        setSteamTestResult({
          success: true,
          message: successMsg,
        });
        setIsSteamTesting(false);
        setTestResult({
          success: true,
          message: `Successfully signed in through Steam. ${ownedGames.length} games were synced.`,
        });
      });

      unlistenErrorPromise = listen<string>("steam_scraped_games_error", (event) => {
        if (!isMounted) return;
        console.warn("[Settings] Scraper failed:", event.payload);

        const errorMsg = `Error: ${event.payload}`;
        setSteamTestResult({
          success: false,
          message: errorMsg,
        });
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
  }, [setSteamId]);

  useEffect(() => {
    let unlistenPromise: Promise<() => void> | null = null;

    try {
      unlistenPromise = listen<string>("gog_login_code", async (event) => {
        const code = event.payload;
        await handleGogCodeExchange(code);
      });
    } catch (err) {
      console.warn("Failed to setup gog_login_code listener:", err);
    }

    return () => {
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
                      Syncs your Steam library through secure login. No API key required.
                    </p>
                  </div>
                  <div>
                    {steamId ? (
                      <div className="border border-black bg-[#f5eedf] p-3 space-y-2">
                        <span className="neo-copy text-[8px] font-bold uppercase text-[#55504a] block">Connected SteamID64</span>
                        <span className="font-black text-xs text-[#087d6d] block truncate" title={steamId}>{steamId}</span>

                        <div className="flex gap-2">
                          <button
                            className="neo-copy flex-1 flex h-8 items-center justify-center gap-1 border-2 border-black bg-[#087d6d] px-2 text-[9px] font-bold uppercase text-white shadow-[1px_1px_0_#171411] hover:bg-[#065e52] transition disabled:opacity-50"
                            type="button"
                            disabled={isSteamTesting}
                            onClick={() => {
                              setIsSteamTesting(true);
                              setSteamTestResult(null);
                              setSteamTestResult({ success: true, message: "Silent scraper started..." });
                              void openSteamScraperWindow(steamId).catch((err) => {
                                setSteamTestResult({ success: false, message: `Error: ${getErrorMessage(err)}` });
                                setIsSteamTesting(false);
                              });
                            }}
                          >
                            {isSteamTesting ? "Testing..." : "Test"}
                          </button>
                          <button
                            className="neo-copy flex-1 flex h-8 items-center justify-center gap-1 border-2 border-black bg-[#c20b2f] px-2 text-[9px] font-bold uppercase text-white shadow-[1px_1px_0_#171411] hover:bg-[#a10825] transition"
                            type="button"
                            onClick={() => { setSteamId(""); setTestResult(null); setSteamTestResult(null); }}
                          >
                            <LogOut className="h-3 w-3" />
                            Disconnect
                          </button>
                        </div>
                        {steamTestResult && (
                          <p className={`neo-copy text-[9px] font-bold leading-tight break-all ${steamTestResult.success ? "text-[#087d6d]" : "text-[#c20b2f]"}`}>
                            {steamTestResult.message}
                          </p>
                        )}
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
                            localStorage.removeItem("launcher.gogToken");
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

                {/* EPIC GAMES CARD */}
                <div className="border-2 border-black bg-[#efe6d4] p-4 flex flex-col justify-between shadow-[2px_2px_0_#171411]">
                  <div>
                    <h3 className="text-xl font-black uppercase text-[#171411] mb-1">
                      Epic Games
                    </h3>
                    <p className="neo-copy text-[9px] font-bold uppercase text-[#55504a] leading-relaxed mb-4">
                      Import your Epic library. Sign in through the browser and paste the received code.
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
                            localStorage.removeItem("launcher.epicToken");
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
                      <div className="space-y-2">
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
                          1. Browser Login
                        </button>

                        <div className="flex gap-1.5 mt-2">
                          <input
                            type="text"
                            placeholder="Epic Auth-Code..."
                            value={epicCodeInput}
                            onChange={(e) => setEpicCodeInput(e.target.value)}
                            className="neo-copy flex-1 border-2 border-black bg-[#f5eedf] px-2 text-[10px] font-bold outline-none placeholder:text-[#8c8273]"
                          />
                          <button
                            type="button"
                            onClick={() => void handleEpicCodeExchange(epicCodeInput)}
                            className="neo-copy border-2 border-black bg-[#087d6d] px-3 py-1.5 text-[9px] font-black uppercase text-white shadow-[1.5px_1.5px_0_#171411] hover:bg-[#066154]"
                          >
                            Link
                          </button>
                        </div>
                      </div>
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
                  ["EA App", "Local game library scan"],
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
