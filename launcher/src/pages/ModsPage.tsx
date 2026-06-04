import { listen } from "@tauri-apps/api/event";
import {
  Archive,
  CheckCircle2,
  ExternalLink,
  FileArchive,
  KeyRound,
  ListFilter,
  PackagePlus,
  PlugZap,
  Power,
  RefreshCcw,
  Search,
  Settings2,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import {
  cancelModInstall,
  disableMod,
  enableMod,
  getModQueue,
  listInstalledGames,
  scanGameMods,
  setModProviderSecret,
  startModInstall,
  uninstallMod,
} from "../lib/launcher";
import { getErrorMessage } from "../lib/formatters";
import { listModCatalogEntries, recordUserModInstall } from "../lib/supabase/mods";
import type { Game } from "../lib/types";
import type {
  InstalledModInfo,
  ModCatalogEntry,
  ModInstallQueueItem,
  ModProvider,
} from "../lib/types/mods";
import {
  isActiveModInstallItem,
  isTerminalModInstallItem,
  selectActiveModInstallCount,
  selectCompletedModInstallCount,
  selectDelegatedModInstallCount,
  selectModInstallTotalProgress,
  useModInstallStore,
} from "../stores/modInstallStore";

type ProviderFilter = ModProvider | "all";

const PROVIDERS: Array<{
  key: ModProvider;
  label: string;
  short: string;
  mode: "direct" | "delegated" | "hybrid";
}> = [
  { key: "direct_url", label: "Direct URL", short: "URL", mode: "direct" },
  { key: "local_archive", label: "Local Archive", short: "Archive", mode: "direct" },
  { key: "local_folder", label: "Local Folder", short: "Folder", mode: "direct" },
  { key: "steam_workshop", label: "Steam Workshop", short: "Steam", mode: "delegated" },
  { key: "modio", label: "mod.io", short: "mod.io", mode: "hybrid" },
  { key: "curseforge", label: "CurseForge", short: "Forge", mode: "hybrid" },
];

const TARGET_POLICIES = [
  { id: "", label: "Auto Preset" },
  { id: "game_mods", label: "Game /mods" },
  { id: "creation_data", label: "Creation Data" },
  { id: "bepinex_plugins", label: "BepInEx Plugins" },
  { id: "minecraft_mods", label: "Minecraft Mods" },
  { id: "root", label: "Game Root" },
];

const FALLBACK_CATALOG: ModCatalogEntry[] = [
  {
    id: "demo-steam-workshop",
    slug: "steam-workshop-launch",
    name: "Workshop Subscription Relay",
    author: "Steam Community",
    summary: "Opens the official Steam Workshop item and tracks the delegated install.",
    description: "Delegates Workshop installation to Steam, then scans local content.",
    provider: "steam_workshop",
    sourceUrl: "steam://openurl/https://steamcommunity.com/workshop/",
    externalId: "workshop",
    categories: ["Workshop"],
    tags: ["delegated", "official"],
    status: "published",
    latestVersion: {
      id: "demo-steam-workshop-v1",
      catalogModId: "demo-steam-workshop",
      version: "external",
      fileSizeBytes: 0,
      installStrategy: "external",
      isLatest: true,
      status: "published",
      createdAt: new Date(0).toISOString(),
    },
  },
];

export function ModsPage() {
  const [searchParams] = useSearchParams();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedQueue, setExpandedQueue] = useState(false);
  const items = useModInstallStore((state) => state.items);
  const setQueueItems = useModInstallStore((state) => state.setItems);
  const upsertQueueItem = useModInstallStore((state) => state.upsertItem);
  const removeQueueItem = useModInstallStore((state) => state.removeItem);
  const activeCount = useModInstallStore(selectActiveModInstallCount);
  const delegatedCount = useModInstallStore(selectDelegatedModInstallCount);
  const completedCount = useModInstallStore(selectCompletedModInstallCount);
  const totalProgress = useModInstallStore(selectModInstallTotalProgress);

  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState(searchParams.get("gameId") ?? "");
  const [catalog, setCatalog] = useState<ModCatalogEntry[]>([]);
  const [installedMods, setInstalledMods] = useState<InstalledModInfo[]>([]);
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [targetPolicyId, setTargetPolicyId] = useState("");
  const [manualProvider, setManualProvider] = useState<ModProvider>("direct_url");
  const [manualTitle, setManualTitle] = useState("");
  const [manualSource, setManualSource] = useState("");
  const [manualSha256, setManualSha256] = useState("");
  const [secretProvider, setSecretProvider] = useState<ModProvider>("modio");
  const [secretValue, setSecretValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) ?? null,
    [games, selectedGameId],
  );

  const visibleCatalog = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return catalog.filter((entry) => {
      if (providerFilter !== "all" && entry.provider !== providerFilter) {
        return false;
      }
      if (!query) return true;
      return [
        entry.name,
        entry.author ?? "",
        entry.summary ?? "",
        entry.tags.join(" "),
        entry.categories.join(" "),
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [catalog, providerFilter, searchQuery]);

  useEffect(() => {
    let active = true;

    const unlistenPromise = listen<ModInstallQueueItem>("mod_install_progress", (event) => {
      if (!active) return;
      upsertQueueItem(event.payload);
      if (
        selectedGameId &&
        event.payload.gameId === selectedGameId &&
        isTerminalModInstallItem(event.payload)
      ) {
        void loadInstalledMods(selectedGameId);
      }
    });

    Promise.all([listInstalledGames(), getModQueue()])
      .then(([libraryGames, queue]) => {
        if (!active) return;
        setGames(libraryGames);
        setQueueItems(queue);
        const requested = searchParams.get("gameId");
        const nextSelected =
          requested && libraryGames.some((game) => game.id === requested)
            ? requested
            : selectedGameId && libraryGames.some((game) => game.id === selectedGameId)
              ? selectedGameId
              : (libraryGames[0]?.id ?? "");
        setSelectedGameId(nextSelected);
        if (nextSelected) {
          void loadInstalledMods(nextSelected);
        }
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerFilter, selectedGameId]);

  async function loadCatalog() {
    try {
      setCatalogLoading(true);
      const entries = await listModCatalogEntries({
        provider: providerFilter,
        gameId: selectedGameId || undefined,
        search: searchQuery,
      });
      setCatalog(entries.length > 0 ? entries : FALLBACK_CATALOG);
    } catch {
      setCatalog(FALLBACK_CATALOG);
    } finally {
      setCatalogLoading(false);
    }
  }

  async function loadInstalledMods(gameId: string) {
    try {
      const mods = await scanGameMods(gameId);
      setInstalledMods(mods);
      await Promise.allSettled(mods.map((mod) => recordUserModInstall(mod)));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleInstallCatalog(entry: ModCatalogEntry) {
    if (!selectedGame) return;
    try {
      setError(null);
      setStatusMessage(null);
      const result = await startModInstall({
        gameId: selectedGame.id,
        provider: entry.provider,
        catalogItemId: entry.id,
        versionId: entry.latestVersion?.id,
        sourceUrl: entry.latestVersion?.downloadUrl ?? entry.sourceUrl ?? undefined,
        targetPolicyId: targetPolicyId || undefined,
        title: entry.name,
        sha256: entry.latestVersion?.sha256 ?? undefined,
      });
      setStatusMessage(result.message);
      const queue = await getModQueue();
      setQueueItems(queue);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleManualInstall() {
    if (!selectedGame || !manualTitle.trim()) return;
    const source = manualSource.trim();
    if (manualProvider !== "local_folder" && manualProvider !== "local_archive" && !source) {
      setError("Source URL is required for this provider.");
      return;
    }
    if ((manualProvider === "local_folder" || manualProvider === "local_archive") && !source) {
      setError("Local path is required for local mod sources.");
      return;
    }

    try {
      setError(null);
      const result = await startModInstall({
        gameId: selectedGame.id,
        provider: manualProvider,
        sourceUrl:
          manualProvider === "local_archive" || manualProvider === "local_folder"
            ? undefined
            : source,
        localPath:
          manualProvider === "local_archive" || manualProvider === "local_folder"
            ? source
            : undefined,
        targetPolicyId: targetPolicyId || undefined,
        title: manualTitle.trim(),
        sha256: manualSha256.trim() || undefined,
      });
      setStatusMessage(result.message);
      setManualTitle("");
      setManualSource("");
      setManualSha256("");
      setQueueItems(await getModQueue());
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleCancel(item: ModInstallQueueItem) {
    try {
      setError(null);
      await cancelModInstall(item.installId);
      removeQueueItem(item.installId);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleToggleMod(mod: InstalledModInfo) {
    try {
      setError(null);
      const updated = mod.enabled
        ? await disableMod(mod.installId)
        : await enableMod(mod.installId);
      setInstalledMods((current) =>
        current.map((entry) => (entry.installId === updated.installId ? updated : entry)),
      );
      await recordUserModInstall(updated);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleUninstallMod(mod: InstalledModInfo) {
    try {
      setError(null);
      await uninstallMod(mod.installId);
      setInstalledMods((current) => current.filter((entry) => entry.installId !== mod.installId));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleSaveSecret() {
    try {
      setError(null);
      await setModProviderSecret(secretProvider, secretValue);
      setSecretValue("");
      setStatusMessage(`${providerLabel(secretProvider)} secret saved in OS keychain.`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  if (loading) {
    return (
      <section className="grid min-h-[420px] place-items-center">
        <div className="neo-copy border-4 border-black bg-[#f5eedf] px-5 py-3 text-xs font-black uppercase shadow-[6px_6px_0_#171411]">
          Loading Mod Rig
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="border-b-4 border-black pb-4">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="neo-copy inline-flex border-2 border-black bg-[#007166] px-3 py-1 text-[10px] font-black uppercase text-white shadow-[3px_3px_0_#171411]">
              Provider deck online
            </span>
            <h1 className="neo-title mt-2 text-[clamp(3.2rem,14vw,6rem)] leading-[0.84] text-[#171411]">
              Mod Manager
            </h1>
            <p className="neo-copy mt-3 max-w-[760px] text-xs font-black uppercase text-[#5b403f]">
              Steam Workshop // mod.io // CurseForge // local archive
            </p>
          </div>

          <div className="grid grid-cols-3 border-4 border-black bg-[#171411] text-center text-[#fff9ed] shadow-[5px_5px_0_#171411]">
            <Readout label="Active" value={activeCount} />
            <Readout label="External" value={delegatedCount} />
            <Readout label="Ready" value={completedCount} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2" />
          <input
            className="neo-copy h-14 w-full border-4 border-black bg-[#fff9ed] pl-11 pr-4 text-[13px] font-black uppercase shadow-[4px_4px_0_#171411] outline-none"
            placeholder="Search mods for selected game"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        <button
          className={`neo-copy flex h-14 items-center gap-2 border-4 border-black px-5 text-[13px] font-black uppercase shadow-[4px_4px_0_#171411] transition-colors ${showAdvanced ? "bg-[#b7102a] text-white" : "bg-[#f5eedf]"}`}
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
        >
          <Settings2 className="h-5 w-5" />
          Advanced
        </button>
      </div>

      {error ? (
        <div className="neo-copy border-4 border-black bg-[#b7102a] p-3 text-xs font-black uppercase text-white shadow-[4px_4px_0_#171411]">
          {error}
        </div>
      ) : null}
      {statusMessage ? (
        <div className="neo-copy border-4 border-black bg-[#007166] p-3 text-xs font-black uppercase text-white shadow-[4px_4px_0_#171411]">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Panel title="Game Target" icon={<PackagePlus className="h-4 w-4" />}>
            <label className="neo-copy block text-[10px] font-black uppercase text-[#5b403f]">
              Local Library
              <select
                className="mt-2 h-11 w-full border-4 border-black bg-[#fff9ed] px-2 text-[12px] font-black text-[#171411] shadow-[3px_3px_0_#171411] outline-none"
                value={selectedGameId}
                onChange={(event) => {
                  setSelectedGameId(event.target.value);
                  void loadInstalledMods(event.target.value);
                }}
              >
                {games.length === 0 ? <option value="">No installed games detected</option> : null}
                {games.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.title}
                  </option>
                ))}
              </select>
            </label>

            {showAdvanced && (
              <label className="neo-copy mt-4 block text-[10px] font-black uppercase text-[#5b403f]">
                Target Policy
                <select
                  className="mt-2 h-10 w-full border-2 border-black bg-[#f6edd8] px-2 text-[11px] font-black outline-none"
                  value={targetPolicyId}
                  onChange={(event) => setTargetPolicyId(event.target.value)}
                >
                  {TARGET_POLICIES.map((policy) => (
                    <option key={policy.id} value={policy.id}>
                      {policy.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="mt-4 border-2 border-black bg-[#1f1c0f] p-3 text-[#fff9ed]">
              <p className="neo-copy text-[10px] font-black uppercase">Selected</p>
              <h2 className="mt-1 text-xl font-black uppercase leading-none">
                {selectedGame?.title ?? "No target"}
              </h2>
              <p className="neo-copy mt-2 break-all text-[10px] font-bold uppercase text-[#f5eedf]">
                {selectedGame?.installPath ?? "Install path missing"}
              </p>
            </div>
          </Panel>

          {showAdvanced && (
            <Panel title="Provider Keys" icon={<KeyRound className="h-4 w-4" />}>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select
                  className="neo-copy h-10 border-2 border-black bg-[#f6edd8] px-2 text-[11px] font-black uppercase"
                  value={secretProvider}
                  onChange={(event) => setSecretProvider(event.target.value as ModProvider)}
                >
                  {PROVIDERS.filter((provider) => provider.mode !== "direct").map((provider) => (
                    <option key={provider.key} value={provider.key}>
                      {provider.label}
                    </option>
                  ))}
                </select>
                <button
                  className="neo-copy border-2 border-black bg-[#007166] px-3 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411]"
                  type="button"
                  onClick={() => void handleSaveSecret()}
                >
                  Save
                </button>
              </div>
              <input
                className="neo-copy mt-2 h-10 w-full border-2 border-black bg-[#fff9ed] px-2 text-[11px] font-bold outline-none"
                placeholder="API key / OAuth token"
                type="password"
                value={secretValue}
                onChange={(event) => setSecretValue(event.target.value)}
              />
              <p className="neo-copy mt-2 text-[10px] font-bold uppercase text-[#5b403f]">
                Stored locally through the OS keychain. No provider key is written to Supabase.
              </p>
            </Panel>
          )}
        </aside>

        <div className="space-y-4">
          <Panel title="Install Queue" icon={<Archive className="h-4 w-4" />}>
            <div className="mb-3 h-4 border-2 border-black bg-[#efe6d4]">
              <div className="h-full bg-[#b7102a]" style={{ width: `${totalProgress}%` }} />
            </div>
            {items.length > 0 ? (
              showAdvanced || expandedQueue ? (
                <div className="grid gap-2">
                  {items.slice(0, 5).map((item) => (
                    <QueueRow
                      key={item.installId}
                      item={item}
                      onCancel={() => void handleCancel(item)}
                    />
                  ))}
                </div>
              ) : (
                <button
                  className="w-full border-2 border-black bg-[#fff9ed] p-3 text-center text-[10px] font-black uppercase text-[#5b403f] shadow-[2px_2px_0_#171411] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                  onClick={() => setExpandedQueue(true)}
                  type="button"
                >
                  Installing {activeCount} mods... (Click for details)
                </button>
              )
            ) : (
              <EmptyState label="No mod installs queued." />
            )}
          </Panel>

          <div
            className={`grid gap-4 ${showAdvanced ? "2xl:grid-cols-[minmax(0,1fr)_360px]" : ""}`}
          >
            <Panel title="Provider Catalog" icon={<PlugZap className="h-4 w-4" />}>
              {showAdvanced && (
                <div className="mb-4 flex justify-end">
                  <div className="grid w-full max-w-[240px] grid-cols-[40px_minmax(0,1fr)] border-2 border-black bg-[#f6edd8]">
                    <span className="grid place-items-center border-r-2 border-black">
                      <ListFilter className="h-4 w-4" />
                    </span>
                    <select
                      className="neo-copy h-10 bg-transparent px-2 text-[11px] font-black uppercase outline-none"
                      value={providerFilter}
                      onChange={(event) => setProviderFilter(event.target.value as ProviderFilter)}
                    >
                      <option value="all">All providers</option>
                      {PROVIDERS.map((provider) => (
                        <option key={provider.key} value={provider.key}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="grid gap-3 lg:grid-cols-2">
                {catalogLoading ? (
                  <EmptyState label="Catalog sync running." />
                ) : visibleCatalog.length > 0 ? (
                  visibleCatalog.map((entry) => (
                    <CatalogCard
                      key={entry.id}
                      entry={entry}
                      disabled={!selectedGame}
                      onInstall={() => void handleInstallCatalog(entry)}
                    />
                  ))
                ) : (
                  <EmptyState label="No catalog entries match this filter." />
                )}
              </div>
            </Panel>

            {showAdvanced && (
              <Panel title="Manual Install" icon={<FileArchive className="h-4 w-4" />}>
                <div className="space-y-3">
                  <label className="neo-copy block text-[10px] font-black uppercase text-[#5b403f]">
                    Provider
                    <select
                      className="mt-1 h-10 w-full border-2 border-black bg-[#f6edd8] px-2 text-[11px] font-black uppercase outline-none"
                      value={manualProvider}
                      onChange={(event) => setManualProvider(event.target.value as ModProvider)}
                    >
                      {PROVIDERS.map((provider) => (
                        <option key={provider.key} value={provider.key}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <TextInput
                    label="Mod title"
                    placeholder="HD texture pack"
                    value={manualTitle}
                    onChange={setManualTitle}
                  />
                  <TextInput
                    label={
                      manualProvider === "local_archive" || manualProvider === "local_folder"
                        ? "Local path"
                        : "Source URL"
                    }
                    placeholder={
                      manualProvider === "local_archive" || manualProvider === "local_folder"
                        ? "C:/Mods/package.zip"
                        : "https://.../download.zip"
                    }
                    value={manualSource}
                    onChange={setManualSource}
                  />
                  <TextInput
                    label="SHA-256 optional"
                    placeholder="64 hex chars"
                    value={manualSha256}
                    onChange={setManualSha256}
                  />
                  <button
                    className="neo-copy flex h-11 w-full items-center justify-center gap-2 border-4 border-black bg-[#b7102a] text-[11px] font-black uppercase text-white shadow-[3px_3px_0_#171411] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!selectedGame || !manualTitle.trim()}
                    type="button"
                    onClick={() => void handleManualInstall()}
                  >
                    <PackagePlus className="h-4 w-4" />
                    Install / Delegate
                  </button>
                </div>
              </Panel>
            )}
          </div>

          <Panel title="Installed Mods" icon={<CheckCircle2 className="h-4 w-4" />}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="neo-copy text-[10px] font-black uppercase text-[#5b403f]">
                {installedMods.length} tracked mods for selected game
              </p>
              <button
                className="neo-copy flex h-9 items-center gap-2 border-2 border-black bg-[#f6edd8] px-3 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411]"
                type="button"
                onClick={() => selectedGameId && void loadInstalledMods(selectedGameId)}
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                Scan
              </button>
            </div>
            {installedMods.length > 0 ? (
              <div className="grid gap-2">
                {installedMods.map((mod) => (
                  <InstalledModRow
                    key={mod.installId}
                    mod={mod}
                    onToggle={() => void handleToggleMod(mod)}
                    onUninstall={() => void handleUninstallMod(mod)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState label="No installed mods found. Install or scan after provider handoff." />
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}

function Panel({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <section className="border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]">
      <div className="flex items-center gap-2 border-b-4 border-black bg-[#171411] px-3 py-2 text-[#fff9ed]">
        {icon}
        <h2 className="neo-copy text-[11px] font-black uppercase tracking-normal">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Readout({ label, value }: { label: string; value: number }) {
  return (
    <div className="not-last:border-r min-w-[92px] border-[#fff9ed] p-3">
      <p className="text-3xl font-black leading-none">{value}</p>
      <p className="neo-copy mt-1 text-[10px] font-black uppercase">{label}</p>
    </div>
  );
}

function QueueRow({ item, onCancel }: { item: ModInstallQueueItem; onCancel: () => void }) {
  const active = isActiveModInstallItem(item);
  return (
    <article className="grid gap-3 border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411] lg:grid-cols-[1fr_120px_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`neo-copy border-2 border-black px-2 py-0.5 text-[9px] font-black uppercase ${statusTone(item.status)}`}
          >
            {item.status}
          </span>
          <span className="neo-copy text-[10px] font-black uppercase text-[#5b403f]">
            {providerLabel(item.provider)} // {item.phase}
          </span>
        </div>
        <h3 className="mt-1 truncate text-lg font-black uppercase leading-none">{item.title}</h3>
        {item.delegatedUrl ? (
          <a
            className="neo-copy mt-1 inline-flex items-center gap-1 text-[10px] font-black uppercase text-[#007166] underline"
            href={item.delegatedUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="h-3 w-3" />
            External provider
          </a>
        ) : null}
      </div>
      <div>
        <p className="neo-copy mb-1 text-[10px] font-black uppercase text-[#5b403f]">
          {item.progress}% // {item.speed}
        </p>
        <div className="h-3 border-2 border-black bg-[#efe6d4]">
          <div className="h-full bg-[#b7102a]" style={{ width: `${item.progress}%` }} />
        </div>
      </div>
      <button
        className="neo-copy flex h-9 items-center justify-center gap-2 border-2 border-black bg-[#f6edd8] px-3 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!active || !item.canCancel}
        type="button"
        onClick={onCancel}
      >
        <XCircle className="h-4 w-4" />
        Cancel
      </button>
    </article>
  );
}

function CatalogCard({
  disabled,
  entry,
  onInstall,
}: {
  disabled: boolean;
  entry: ModCatalogEntry;
  onInstall: () => void;
}) {
  const installStrategy = entry.latestVersion?.installStrategy ?? "external";
  const direct = installStrategy !== "external" || entry.provider === "direct_url";
  return (
    <article className="flex min-h-[190px] flex-col border-4 border-black bg-[#fff9ed] shadow-[4px_4px_0_#171411]">
      <div className={`h-16 border-b-4 border-black ${providerArt(entry.provider)}`} />
      <div className="flex flex-1 flex-col p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="neo-copy border-2 border-black bg-[#007166] px-2 py-0.5 text-[9px] font-black uppercase text-white">
            {providerLabel(entry.provider)}
          </span>
          <span className="neo-copy border-2 border-black bg-[#f6edd8] px-2 py-0.5 text-[9px] font-black uppercase text-[#171411]">
            {direct ? "direct" : "delegated"}
          </span>
        </div>
        <h3 className="mt-2 text-xl font-black uppercase leading-none">{entry.name}</h3>
        <p className="mt-2 line-clamp-2 text-sm font-bold leading-5 text-[#5b403f]">
          {entry.summary ?? entry.description ?? "Provider catalog entry."}
        </p>
        <div className="mt-3 flex flex-wrap gap-1">
          {[...entry.categories, ...entry.tags].slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="neo-copy border border-black bg-[#efe6d4] px-1.5 py-0.5 text-[8px] font-black uppercase"
            >
              {tag}
            </span>
          ))}
        </div>
        <button
          className="neo-copy mt-auto flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#b7102a] px-3 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          type="button"
          onClick={onInstall}
        >
          <PackagePlus className="h-4 w-4" />
          {resolveInstallLabel(entry)}
        </button>
      </div>
    </article>
  );
}

function InstalledModRow({
  mod,
  onToggle,
  onUninstall,
}: {
  mod: InstalledModInfo;
  onToggle: () => void;
  onUninstall: () => void;
}) {
  return (
    <article
      className={`grid gap-3 border-2 border-black p-3 shadow-[2px_2px_0_#171411] lg:grid-cols-[1fr_auto_auto] lg:items-center ${mod.enabled ? "bg-[#fff9ed]" : "bg-[#efe6d4]"}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`neo-copy border-2 border-black px-2 py-0.5 text-[9px] font-black uppercase ${mod.enabled ? "bg-[#007166] text-white" : "bg-[#171411] text-white"}`}
          >
            {mod.enabled ? "enabled" : "disabled"}
          </span>
          <span className="neo-copy text-[10px] font-black uppercase text-[#5b403f]">
            {providerLabel(mod.provider)} // {mod.installedFiles.length} files
          </span>
        </div>
        <h3 className="mt-1 truncate text-lg font-black uppercase leading-none">{mod.title}</h3>
        <p className="neo-copy mt-1 break-all text-[10px] font-bold uppercase text-[#5b403f]">
          {mod.targetPath}
        </p>
      </div>
      <button
        className={`neo-copy flex h-9 items-center justify-center gap-2 border-2 border-black px-3 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] ${mod.enabled ? "bg-[#f6edd8]" : "bg-[#007166] text-white"}`}
        type="button"
        onClick={onToggle}
      >
        <Power className="h-4 w-4" />
        {mod.enabled ? "Disable" : "Enable"}
      </button>
      <button
        className="neo-copy flex h-9 items-center justify-center gap-2 border-2 border-black bg-[#b7102a] px-3 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411]"
        type="button"
        onClick={onUninstall}
      >
        <Trash2 className="h-4 w-4" />
        Remove
      </button>
    </article>
  );
}

function TextInput({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="neo-copy block text-[10px] font-black uppercase text-[#5b403f]">
      {label}
      <input
        className="mt-1 h-10 w-full border-2 border-black bg-[#fff9ed] px-2 text-[11px] font-bold outline-none"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="neo-copy border-2 border-dashed border-black bg-[#fff9ed] p-5 text-center text-[10px] font-black uppercase text-[#5b403f]">
      {label}
    </div>
  );
}

function providerLabel(provider: ModProvider) {
  return PROVIDERS.find((item) => item.key === provider)?.label ?? provider;
}

function statusTone(status: ModInstallQueueItem["status"]) {
  if (status === "completed") return "bg-[#007166] text-white";
  if (status === "failed" || status === "cancelled") return "bg-[#171411] text-white";
  if (status === "delegated") return "bg-[#f6edd8] text-[#171411]";
  return "bg-[#b7102a] text-white";
}

function providerArt(provider: ModProvider) {
  if (provider === "steam_workshop") return "library-source-art library-source-art-steam";
  if (provider === "modio") return "library-source-art library-source-art-gog";
  if (provider === "curseforge") return "library-source-art library-source-art-epic";
  if (provider === "local_archive") return "library-source-art library-source-art-linux";
  if (provider === "local_folder") return "library-source-art library-source-art-macos";
  return "library-source-art library-source-art-battlenet";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function resolveInstallLabel(_entry: ModCatalogEntry) {
  return "Install";
}
