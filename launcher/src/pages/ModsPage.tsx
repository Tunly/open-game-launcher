import { ChevronDown, ExternalLink, Gamepad2, Link2, RefreshCcw, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { ManagedModsPanel, type ManagedModView } from "../components/mods/ManagedModsPanel";
import { ModBrowsePanel } from "../components/mods/ModBrowsePanel";
import type { ModCardView } from "../components/mods/ModCard";
import { ModProviderPicker } from "../components/mods/ModProviderPicker";
import { getErrorMessage } from "../lib/formatters";
import {
  browseMods,
  connectNexus,
  disconnectNexus,
  getModProviderStatus,
  getNxmHandlerStatus,
  installMod,
  listInstalledGames,
  listManagedMods,
  openProviderMod,
  openNxmHandlerSettings,
  removeMod,
  setModEnabled,
  takePendingNxmStatus,
} from "../lib/launcher";
import type { Game } from "../lib/types";
import type {
  ManagedMod,
  ModBrowseItem,
  ModBrowseSort,
  ModProvider,
  ModProviderStatus,
  NxmHandlerStatus,
  NxmLinkStatus,
} from "../lib/types/mods";
import { syncUserManagedMods } from "../lib/supabase/mods";

type ModsTab = "browse" | "managed";

const PAGE_SIZE = 12;

export function ModsPage() {
  const [searchParams] = useSearchParams();
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState(searchParams.get("gameId") ?? "");
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ModsTab>("browse");
  const [provider, setProvider] = useState<ModProvider>("nexus");
  const [providerStatus, setProviderStatus] = useState<ModProviderStatus | null>(null);
  const [providerStatusLoading, setProviderStatusLoading] = useState(false);
  const [nxmHandlerStatus, setNxmHandlerStatus] = useState<NxmHandlerStatus | null>(null);

  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ModBrowseSort>("popular");
  const [browseItems, setBrowseItems] = useState<ModBrowseItem[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [browseMessage, setBrowseMessage] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([undefined]);
  const [page, setPage] = useState(1);

  const [managedMods, setManagedMods] = useState<ManagedMod[]>([]);
  const [managedLoading, setManagedLoading] = useState(false);
  const [managedError, setManagedError] = useState<string | null>(null);
  const [busyActionIds, setBusyActionIds] = useState<ReadonlySet<string>>(() => new Set());
  const activeActionIdsRef = useRef(new Set<string>());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;

    function announce(status: NxmLinkStatus) {
      if (!active) return;
      setStatusMessage(
        status.code === "continuation_failed"
          ? `NXM continuation failed // ${status.message}`
          : status.accepted
            ? "NXM link received // Nexus download authorization is being continued securely."
            : `NXM link rejected // ${status.message}`,
      );
    }

    const unlistenPromise = isTauri()
      ? listen<NxmLinkStatus>("nxm-link-status", (event) => announce(event.payload))
      : null;

    async function drainStartupStatuses() {
      // Rust bounds this queue to sixteen redacted entries.
      for (let index = 0; index < 16 && active; index += 1) {
        const status = await takePendingNxmStatus();
        if (!status) break;
        announce(status);
      }
    }

    void drainStartupStatuses().catch(() => undefined);

    return () => {
      active = false;
      void unlistenPromise?.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    let active = true;

    listInstalledGames()
      .then((installedGames) => {
        if (!active) return;
        setGames(installedGames);
        const requestedId = searchParams.get("gameId");
        const nextGameId =
          requestedId && installedGames.some((game) => game.id === requestedId)
            ? requestedId
            : (installedGames[0]?.id ?? "");
        setSelectedGameId(nextGameId);
        setGamesError(null);
      })
      .catch((error) => {
        if (!active) return;
        setGamesError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setGamesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [searchParams]);

  useEffect(() => {
    if (searchText.trim() === query) return;
    const timeout = window.setTimeout(() => {
      setQuery(searchText.trim());
      setPage(1);
      setCursorHistory([undefined]);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [query, searchText]);

  useEffect(() => {
    if (!selectedGameId) {
      setProviderStatus(null);
      return;
    }

    let active = true;
    setProviderStatus(null);
    setNxmHandlerStatus(null);
    setProviderStatusLoading(true);
    getModProviderStatus(provider, selectedGameId)
      .then((result) => {
        if (!active) return;
        setProviderStatus(result);
      })
      .catch((error) => {
        if (!active) return;
        setProviderStatus({
          action: "none",
          actionLabel: null,
          available: false,
          connected: false,
          message: getErrorMessage(error),
          provider,
          supportsBrowse: false,
          supportsNativeInstall: false,
        });
      })
      .finally(() => {
        if (active) setProviderStatusLoading(false);
      });

    return () => {
      active = false;
    };
  }, [provider, refreshToken, selectedGameId]);

  useEffect(() => {
    if (provider !== "nexus" || !providerStatus?.connected) {
      setNxmHandlerStatus(null);
      return;
    }
    let active = true;
    getNxmHandlerStatus()
      .then((result) => {
        if (active && result) setNxmHandlerStatus(result);
      })
      .catch(() => {
        if (active) setNxmHandlerStatus(null);
      });
    return () => {
      active = false;
    };
  }, [provider, providerStatus?.connected, refreshToken]);

  useEffect(() => {
    if (
      provider !== "nexus" ||
      !selectedGameId ||
      providerStatus?.actionLabel !== "Waiting for Nexus"
    ) {
      return;
    }

    let active = true;
    const interval = window.setInterval(() => {
      getModProviderStatus("nexus", selectedGameId)
        .then((result) => {
          if (!active) return;
          setProviderStatus(result);
          if (result.connected) setRefreshToken((current) => current + 1);
        })
        .catch(() => undefined);
    }, 1_500);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [provider, providerStatus?.actionLabel, selectedGameId]);

  useEffect(() => {
    if (!selectedGameId) {
      setBrowseItems([]);
      return;
    }

    let active = true;
    setBrowseLoading(true);
    setBrowseError(null);

    browseMods({
      cursor: cursorHistory[page - 1],
      gameId: selectedGameId,
      pageSize: PAGE_SIZE,
      provider,
      query,
      sort,
    })
      .then((result) => {
        if (!active) return;
        setBrowseItems(result.items);
        setNextCursor(result.nextCursor);
        setBrowseMessage(result.message);
      })
      .catch((error) => {
        if (!active) return;
        setBrowseItems([]);
        setNextCursor(null);
        setBrowseMessage(null);
        setBrowseError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setBrowseLoading(false);
      });

    return () => {
      active = false;
    };
  }, [cursorHistory, page, provider, query, refreshToken, selectedGameId, sort]);

  useEffect(() => {
    if (!selectedGameId) {
      setManagedMods([]);
      return;
    }

    let active = true;
    setManagedLoading(true);
    setManagedError(null);
    listManagedMods(selectedGameId)
      .then((mods) => {
        if (!active) return;
        setManagedMods(mods);
        void syncUserManagedMods(selectedGameId, mods).catch(() => undefined);
      })
      .catch((error) => {
        if (!active) return;
        setManagedMods([]);
        setManagedError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setManagedLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshToken, selectedGameId]);

  function handleProviderChange(nextProvider: ModProvider) {
    resetBrowseView();
    setProviderStatus(null);
    setNxmHandlerStatus(null);
    setProvider(nextProvider);
  }

  function handleGameChange(nextGameId: string) {
    resetBrowseView();
    setSearchText("");
    setQuery("");
    setSort("popular");
    setProviderStatus(null);
    setNxmHandlerStatus(null);
    setSelectedGameId(nextGameId);
  }

  function handleSortChange(nextSort: ModBrowseSort) {
    resetBrowseView();
    setSort(nextSort);
  }

  function resetBrowseView() {
    setPage(1);
    setCursorHistory([undefined]);
    setBrowseItems([]);
    setBrowseError(null);
    setBrowseMessage(null);
    setStatusMessage(null);
  }

  function handlePageChange(nextPage: number) {
    if (nextPage > page && nextCursor) {
      setCursorHistory((current) => {
        const next = current.slice(0, page);
        next[page] = nextCursor;
        return next;
      });
      setPage(nextPage);
      return;
    }
    if (nextPage >= 1 && nextPage < page) {
      setPage(nextPage);
    }
  }

  function beginAction(actionId: string) {
    if (activeActionIdsRef.current.has(actionId)) return false;
    activeActionIdsRef.current.add(actionId);
    setBusyActionIds((current) => new Set(current).add(actionId));
    return true;
  }

  function finishAction(actionId: string) {
    if (!activeActionIdsRef.current.delete(actionId)) return;
    setBusyActionIds((current) => {
      const next = new Set(current);
      next.delete(actionId);
      return next;
    });
  }

  async function handleBrowseAction(item: ModCardView) {
    if (!selectedGameId || item.capability === "unavailable") return;
    const source = browseItems.find((candidate) => candidate.id === item.id);
    if (!source) return;
    if (!beginAction(item.id)) return;

    try {
      setStatusMessage(null);
      const result = await installMod({
        capability: source.installCapability,
        gameId: selectedGameId,
        itemId: source.id,
        provider: source.provider,
        title: source.name,
      });

      setStatusMessage(
        result.status === "handoff" ? `Provider opened // ${result.message}` : result.message,
      );
      if (result.status === "queued") {
        setRefreshToken((current) => current + 1);
      }
    } catch (error) {
      setStatusMessage(`Action failed // ${getErrorMessage(error)}`);
    } finally {
      finishAction(item.id);
    }
  }

  async function handleProviderAction() {
    if (!selectedGameId) return;
    const actionId = "provider-action";
    if (!beginAction(actionId)) return;
    try {
      if (providerStatus?.action === "connect") {
        const result = await connectNexus();
        setProviderStatus(result);
        setStatusMessage(result.message);
      } else if (providerStatus?.action === "disconnect") {
        const result = await disconnectNexus();
        setProviderStatus(result);
        setStatusMessage(result.message);
      } else if (providerStatus?.action === "open_provider") {
        const result = await openProviderMod({
          gameId: selectedGameId,
          provider,
          query,
          sort,
        });
        setStatusMessage(
          result.status === "handoff" ? `Provider opened // ${result.message}` : result.message,
        );
      } else {
        return;
      }
      setRefreshToken((current) => current + 1);
    } catch (error) {
      setStatusMessage(`Provider action failed // ${getErrorMessage(error)}`);
    } finally {
      finishAction(actionId);
    }
  }

  async function handleProviderFallback() {
    if (!selectedGameId) return;
    const actionId = "provider-fallback";
    if (!beginAction(actionId)) return;
    try {
      const result = await openProviderMod({
        gameId: selectedGameId,
        provider,
        query,
        sort,
      });
      setStatusMessage(
        result.status === "handoff" ? `Provider opened // ${result.message}` : result.message,
      );
    } catch (error) {
      setStatusMessage(`Provider handoff failed // ${getErrorMessage(error)}`);
    } finally {
      finishAction(actionId);
    }
  }

  async function handleNxmHandlerSettings() {
    const actionId = "nxm-handler";
    if (!beginAction(actionId)) return;
    try {
      await openNxmHandlerSettings();
      setStatusMessage("System settings opened // Select OG-Launcher for NXM links.");
    } catch (error) {
      setStatusMessage(`NXM handler settings failed // ${getErrorMessage(error)}`);
    } finally {
      finishAction(actionId);
    }
  }

  async function handleToggleManaged(item: ManagedModView) {
    if (!beginAction(item.id)) return;
    try {
      const result = await setModEnabled(item.id, !item.enabled);
      setStatusMessage(`${result.title} // ${result.enabled ? "Enabled" : "Disabled"}`);
      setRefreshToken((current) => current + 1);
    } catch (error) {
      setStatusMessage(`Toggle failed // ${getErrorMessage(error)}`);
    } finally {
      finishAction(item.id);
    }
  }

  async function handleRemoveManaged(item: ManagedModView) {
    if (!beginAction(item.id)) return;
    try {
      await removeMod(item.id);
      setStatusMessage(`${item.title} removed.`);
      setRefreshToken((current) => current + 1);
    } catch (error) {
      setStatusMessage(`Remove failed // ${getErrorMessage(error)}`);
    } finally {
      finishAction(item.id);
    }
  }

  async function handleUpdateManaged(item: ManagedModView) {
    if (!selectedGameId) return;
    const source = managedMods.find((mod) => mod.installId === item.id);
    if (!source) return;
    if (!beginAction(item.id)) return;
    try {
      const result = await installMod({
        capability: "native",
        gameId: selectedGameId,
        itemId: source.providerItemId ?? source.installId,
        provider: source.provider,
        title: source.title,
      });
      setStatusMessage(result.message);
      if (result.status === "queued") setRefreshToken((current) => current + 1);
    } catch (error) {
      setStatusMessage(`Update failed // ${getErrorMessage(error)}`);
    } finally {
      finishAction(item.id);
    }
  }

  async function handleOpenManaged(item: ManagedModView) {
    if (!selectedGameId) return;
    const source = managedMods.find((mod) => mod.installId === item.id);
    if (!source) return;
    if (!beginAction(item.id)) return;
    try {
      const result = await openProviderMod({
        gameId: selectedGameId,
        itemId: source.providerItemId ?? undefined,
        provider: source.provider,
        url: source.manageUrl ?? undefined,
      });
      setStatusMessage(
        result.status === "handoff" ? `Provider opened // ${result.message}` : result.message,
      );
    } catch (error) {
      setStatusMessage(`Provider handoff failed // ${getErrorMessage(error)}`);
    } finally {
      finishAction(item.id);
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextTab: ModsTab = activeTab === "browse" ? "managed" : "browse";
    setActiveTab(nextTab);
    window.setTimeout(() => document.getElementById(`mods-tab-${nextTab}`)?.focus(), 0);
  }

  const cardItems: ModCardView[] = browseItems.map((item) => ({
    artworkUrl: item.bannerUrl ?? item.iconUrl,
    author: item.author,
    capability: item.installCapability,
    downloads: item.downloads,
    id: item.id,
    installed: item.installed,
    provider: item.provider,
    summary: item.summary,
    title: item.name,
    updateAvailable: item.updateAvailable,
    version: item.version,
  }));

  const managedViews: ManagedModView[] = managedMods.map((item) => ({
    canRemove: item.canRemove,
    canToggle: item.canToggle,
    enabled: item.enabled,
    id: item.installId,
    installedAt: item.installedAt,
    provider: item.provider,
    title: item.title,
    updateAvailable: item.status === "update_available",
    version: item.version,
    status: item.status,
  }));

  return (
    <section className="neo-dots space-y-5 pb-8">
      <header className="relative overflow-hidden border-[4px] border-[#171411] bg-[#fff9ed] p-5 shadow-[7px_7px_0_#171411] sm:p-6">
        <div className="neo-dots pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative">
          <div>
            <h1 className="neo-title text-4xl leading-none uppercase sm:text-5xl">Mod Manager</h1>
            <p className="neo-copy mt-2 max-w-2xl text-sm leading-5 text-[#5b403f]">
              Pick a game, choose Nexus or Steam, then install or hand off with one honest action.
            </p>
          </div>
        </div>
      </header>

      <div
        role="tablist"
        tabIndex={-1}
        aria-label="Mod manager sections"
        onKeyDown={handleTabKeyDown}
        className="flex border-[3px] border-[#171411] bg-[#f6edd8] shadow-[4px_4px_0_#171411]"
      >
        <TabButton active={activeTab === "browse"} tab="browse" onSelect={setActiveTab}>
          Browse
        </TabButton>
        <TabButton active={activeTab === "managed"} tab="managed" onSelect={setActiveTab}>
          My Mods <span className="ml-1 opacity-70">[{managedMods.length}]</span>
        </TabButton>
      </div>

      {gamesError ? (
        <div
          role="alert"
          className="border-[3px] border-[#171411] bg-[#b7102a] p-4 text-white shadow-[4px_4px_0_#171411]"
        >
          <p className="neo-copy text-xs font-black uppercase">
            Game library unavailable // {gamesError}
          </p>
        </div>
      ) : null}

      {activeTab === "browse" ? (
        <div
          id="mods-panel-browse"
          role="tabpanel"
          aria-labelledby="mods-tab-browse"
          tabIndex={0}
          className="space-y-5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#007166]"
        >
          <div className="border-[3px] border-[#171411] bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411]">
            <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(340px,1.2fr)]">
              <label className="min-w-0">
                <span className="neo-copy mb-2 block text-[10px] font-black tracking-[0.18em] uppercase">
                  01 // Target Game
                </span>
                <span className="relative block">
                  <Gamepad2
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <select
                    aria-label="Target Game"
                    value={selectedGameId}
                    disabled={gamesLoading || games.length === 0}
                    onChange={(event) => handleGameChange(event.target.value)}
                    className="neo-copy h-14 w-full appearance-none border-[3px] border-[#171411] bg-[#f6edd8] pr-10 pl-10 text-xs font-black tracking-[0.06em] uppercase shadow-[3px_3px_0_#171411] focus:outline-3 focus:outline-offset-2 focus:outline-[#007166] disabled:opacity-50"
                  >
                    {games.length === 0 ? <option value="">No installed games</option> : null}
                    {games.map((game) => (
                      <option key={game.id} value={game.id}>
                        {game.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2"
                    aria-hidden="true"
                  />
                </span>
              </label>

              <ModProviderPicker
                value={provider}
                disabled={!selectedGameId}
                onChange={handleProviderChange}
              />
            </div>

            <div className="mt-4 grid gap-3 border-t-[3px] border-[#171411] pt-4 lg:grid-cols-[1fr_auto]">
              <form
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  setQuery(searchText.trim());
                  setPage(1);
                  setCursorHistory([undefined]);
                }}
              >
                <label htmlFor="mod-search" className="sr-only">
                  Search mods
                </label>
                <span className="relative block">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    id="mod-search"
                    type="search"
                    value={searchText}
                    disabled={!selectedGameId}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder={`Search ${provider === "nexus" ? "Nexus Mods" : "Steam Workshop"}...`}
                    className="neo-copy h-11 w-full border-[3px] border-[#171411] bg-[#f6edd8] pr-3 pl-10 text-xs font-bold placeholder:text-[#655f58] focus:outline-3 focus:outline-offset-2 focus:outline-[#007166] disabled:opacity-50"
                  />
                </span>
              </form>

              <div className="flex" aria-label="Sort mods">
                {(["popular", "latest"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={sort === option}
                    onClick={() => handleSortChange(option)}
                    className={`neo-copy min-h-11 border-[3px] border-[#171411] px-4 text-[10px] font-black tracking-[0.12em] uppercase first:border-r-0 focus-visible:z-10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#007166] ${
                      sort === option
                        ? "bg-[#171411] text-white"
                        : "bg-[#f6edd8] hover:bg-[#8cf5e4]"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <ProviderStatusPanel
            status={providerStatus}
            nxmHandlerStatus={nxmHandlerStatus}
            loading={providerStatusLoading}
            actionBusy={busyActionIds.has("provider-action")}
            handlerActionBusy={busyActionIds.has("nxm-handler")}
            onAction={() => void handleProviderAction()}
            onHandlerAction={() => void handleNxmHandlerSettings()}
          />

          {browseMessage ? (
            <div className="flex flex-col gap-3 border-l-[5px] border-[#007166] bg-[#efe6d4] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="neo-copy text-xs font-bold text-[#5b403f]" aria-live="polite">
                {browseMessage}
              </p>
              {browseItems.length === 0 &&
              providerStatus?.action !== "open_provider" &&
              (provider === "nexus" || providerStatus?.available) ? (
                <button
                  type="button"
                  disabled={busyActionIds.has("provider-fallback")}
                  onClick={() => void handleProviderFallback()}
                  className="neo-copy flex min-h-10 shrink-0 items-center justify-center gap-2 border-[3px] border-[#171411] bg-[#b7102a] px-4 py-2 text-[10px] font-black tracking-[0.1em] text-white uppercase shadow-[3px_3px_0_#171411] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#007166] disabled:opacity-50"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  {provider === "nexus" ? "Continue on Nexus" : "Browse in Steam"}
                </button>
              ) : null}
            </div>
          ) : null}

          <ModBrowsePanel
            busyItemIds={busyActionIds}
            error={browseError}
            hasNextPage={Boolean(nextCursor)}
            items={cardItems}
            loading={browseLoading}
            onAction={(item) => void handleBrowseAction(item)}
            onPageChange={handlePageChange}
            page={page}
            providerLabel={provider === "nexus" ? "Nexus Mods" : "Steam Workshop"}
            query={query}
          />
        </div>
      ) : (
        <div
          id="mods-panel-managed"
          role="tabpanel"
          aria-labelledby="mods-tab-managed"
          tabIndex={0}
          className="space-y-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#007166]"
        >
          <div className="flex flex-col gap-3 border-[3px] border-[#171411] bg-[#171411] p-4 text-white shadow-[5px_5px_0_#b7102a] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="neo-title text-2xl uppercase">Local Mod Rack</h2>
              <p className="neo-copy text-[10px] font-bold tracking-[0.08em] text-[#f6edd8] uppercase">
                Nexus files are controlled here // Workshop subscriptions stay Steam-managed
              </p>
            </div>
            <button
              type="button"
              disabled={!selectedGameId || managedLoading}
              onClick={() => setRefreshToken((current) => current + 1)}
              className="neo-copy flex min-h-10 items-center justify-center gap-2 border-[3px] border-white bg-[#007166] px-4 py-2 text-[10px] font-black tracking-[0.12em] uppercase shadow-[3px_3px_0_#b7102a] hover:-translate-y-0.5 disabled:opacity-50"
            >
              <RefreshCcw
                className={`h-4 w-4 ${managedLoading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />{" "}
              Refresh
            </button>
          </div>
          <ManagedModsPanel
            busyItemIds={busyActionIds}
            error={managedError}
            items={managedViews}
            loading={managedLoading}
            onOpenProvider={(item) => void handleOpenManaged(item)}
            onRemove={(item) => void handleRemoveManaged(item)}
            onToggle={(item) => void handleToggleManaged(item)}
            onUpdate={(item) => void handleUpdateManaged(item)}
          />
        </div>
      )}

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </div>
      {statusMessage ? (
        <div
          className="neo-copy fixed right-4 bottom-4 z-40 max-w-sm border-[3px] border-[#171411] bg-[#8cf5e4] px-4 py-3 text-xs font-black shadow-[5px_5px_0_#171411]"
          aria-hidden="true"
        >
          {statusMessage}
        </div>
      ) : null}
    </section>
  );
}

function TabButton({
  active,
  children,
  onSelect,
  tab,
}: {
  active: boolean;
  children: ReactNode;
  onSelect: (tab: ModsTab) => void;
  tab: ModsTab;
}) {
  return (
    <button
      id={`mods-tab-${tab}`}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={`mods-panel-${tab}`}
      tabIndex={active ? 0 : -1}
      onClick={() => onSelect(tab)}
      className={`neo-copy min-h-12 flex-1 border-r-[3px] border-[#171411] px-4 text-xs font-black tracking-[0.14em] uppercase last:border-r-0 focus-visible:outline-3 focus-visible:outline-offset-[-4px] focus-visible:outline-[#8cf5e4] ${
        active ? "bg-[#b7102a] text-white" : "bg-[#f6edd8] hover:bg-[#8cf5e4]"
      }`}
    >
      {children}
    </button>
  );
}

function ProviderStatusPanel({
  actionBusy,
  handlerActionBusy,
  loading,
  nxmHandlerStatus,
  onAction,
  onHandlerAction,
  status,
}: {
  actionBusy: boolean;
  handlerActionBusy: boolean;
  loading: boolean;
  nxmHandlerStatus: NxmHandlerStatus | null;
  onAction: () => void;
  onHandlerAction: () => void;
  status: ModProviderStatus | null;
}) {
  if (loading && !status) {
    return (
      <div
        className="border-[3px] border-[#171411] bg-[#efe6d4] px-4 py-3 shadow-[3px_3px_0_#171411]"
        aria-busy="true"
      >
        <p className="neo-copy text-[10px] font-black tracking-[0.12em] uppercase">
          Checking official provider...
        </p>
      </div>
    );
  }
  if (!status) return null;

  const showAction = status.action !== "none" && Boolean(status.actionLabel);
  const actionLabel = status.actionLabel ?? "Open provider";
  const showHandlerAction =
    status.provider === "nexus" &&
    nxmHandlerStatus !== null &&
    !nxmHandlerStatus.isDefault &&
    nxmHandlerStatus.state !== "not_checked";

  return (
    <div className="flex flex-col gap-3 border-[3px] border-[#171411] bg-[#efe6d4] px-4 py-3 shadow-[3px_3px_0_#171411] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`mt-0.5 h-3 w-3 shrink-0 border-2 border-[#171411] ${
            status.available ? "bg-[#8cf5e4]" : "bg-[#b7102a]"
          }`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="neo-copy text-[10px] font-black tracking-[0.14em] uppercase">
            {status.provider === "nexus" ? "Nexus Mods" : "Steam Workshop"} //{" "}
            {status.connected ? "Connected" : "Handoff mode"}
          </p>
          <p className="neo-copy mt-1 text-xs leading-5 text-[#5b403f]">{status.message}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
        {showAction ? (
          <button
            type="button"
            disabled={actionBusy}
            onClick={onAction}
            className="neo-copy flex min-h-10 shrink-0 items-center justify-center gap-2 border-[3px] border-[#171411] bg-[#007166] px-4 py-2 text-[10px] font-black tracking-[0.1em] text-white uppercase shadow-[3px_3px_0_#171411] hover:-translate-y-0.5 disabled:opacity-50"
          >
            {actionBusy ? (
              <RefreshCcw className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : status.provider === "nexus" ? (
              <Link2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            )}
            {actionLabel}
          </button>
        ) : null}
        {showHandlerAction ? (
          <button
            type="button"
            disabled={handlerActionBusy}
            onClick={onHandlerAction}
            title={nxmHandlerStatus.message}
            className="neo-copy flex min-h-10 shrink-0 items-center justify-center gap-2 border-[3px] border-[#171411] bg-[#b7102a] px-4 py-2 text-[10px] font-black tracking-[0.1em] text-white uppercase shadow-[3px_3px_0_#171411] hover:-translate-y-0.5 disabled:opacity-50"
          >
            {handlerActionBusy ? (
              <RefreshCcw className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Link2 className="h-4 w-4" aria-hidden="true" />
            )}
            Change NXM Handler
          </button>
        ) : null}
      </div>
    </div>
  );
}
