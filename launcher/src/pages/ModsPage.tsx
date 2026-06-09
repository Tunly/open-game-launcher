import {
  CheckCircle2,
  Download,
  KeyRound,
  PackagePlus,
  Power,
  RefreshCcw,
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

function detectProvider(source: string): ModProvider {
  const lower = source.toLowerCase();
  if (lower.endsWith(".zip") || lower.endsWith(".rar") || lower.endsWith(".7z")) {
    return "local_archive";
  }
  if (lower.includes("steamcommunity.com") || lower.startsWith("steam://")) {
    return "steam_workshop";
  }
  if (lower.includes("mod.io")) return "modio";
  if (lower.includes("curseforge.com") || lower.includes("edgeforge")) return "curseforge";
  return "direct_url";
}

function providerLabel(provider: ModProvider) {
  return PROVIDERS.find((item) => item.key === provider)?.label ?? provider;
}

export function ModsPage() {
  const [searchParams] = useSearchParams();
  const [showSecretsModal, setShowSecretsModal] = useState(false);
  const activeCount = useModInstallStore(selectActiveModInstallCount);
  const delegatedCount = useModInstallStore(selectDelegatedModInstallCount);
  const completedCount = useModInstallStore(selectCompletedModInstallCount);

  const [games, setGames] = useState<Game[]>([]);
  const [selectedGameId, setSelectedGameId] = useState(searchParams.get("gameId") ?? "");
  const [installedMods, setInstalledMods] = useState<InstalledModInfo[]>([]);
  const [addSource, setAddSource] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [secretProvider, setSecretProvider] = useState<ModProvider>("modio");
  const [secretValue, setSecretValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [catalogEntries, setCatalogEntries] = useState<ModCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const selectedGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) ?? null,
    [games, selectedGameId],
  );

  useEffect(() => {
    let active = true;

    Promise.all([listInstalledGames(), getModQueue()])
      .then(([libraryGames, queue]) => {
        if (!active) return;
        setGames(libraryGames);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) {
      void loadCatalog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGameId, loading]);

  async function loadInstalledMods(gameId: string) {
    try {
      const mods = await scanGameMods(gameId);
      setInstalledMods(mods);
      await Promise.allSettled(mods.map((mod) => recordUserModInstall(mod)));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function loadCatalog() {
    try {
      setCatalogLoading(true);
      setCatalogError(null);
      const entries = await listModCatalogEntries({
        gameId: selectedGameId || undefined,
      });
      setCatalogEntries(entries);
    } catch (err) {
      setCatalogError(getErrorMessage(err));
    } finally {
      setCatalogLoading(false);
    }
  }

  async function handleCatalogInstall(entry: ModCatalogEntry) {
    if (!selectedGame) return;
    try {
      setError(null);
      const isLocal = entry.provider === "local_archive" || entry.provider === "local_folder";
      const downloadUrl = entry.latestVersion?.downloadUrl ?? entry.sourceUrl ?? undefined;
      const result = await startModInstall({
        gameId: selectedGame.id,
        provider: entry.provider,
        catalogItemId: entry.id,
        versionId: entry.latestVersion?.id,
        sourceUrl: isLocal ? undefined : downloadUrl,
        localPath: isLocal ? downloadUrl : undefined,
        title: entry.name,
        sha256: entry.latestVersion?.sha256 ?? undefined,
      });
      setStatusMessage(result.message);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleAddMod() {
    if (!selectedGame || !addSource.trim()) return;
    const source = addSource.trim();
    const title = addTitle.trim() || source.split("/").pop() || "Untitled Mod";
    const provider = detectProvider(source);
    const isLocal = provider === "local_archive" || provider === "local_folder";

    try {
      setError(null);
      const result = await startModInstall({
        gameId: selectedGame.id,
        provider,
        sourceUrl: isLocal ? undefined : source,
        localPath: isLocal ? source : undefined,
        title,
      });
      setStatusMessage(result.message);
      setAddSource("");
      setAddTitle("");
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
      {/* 1. Header Row */}
      <div className="border-b-4 border-black pb-4">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="neo-copy inline-flex border-2 border-black bg-[#007166] px-3 py-1 text-[10px] font-black text-white uppercase shadow-[3px_3px_0_#171411]">
              Provider deck online
            </span>
            <h1 className="neo-title mt-2 text-[clamp(3.2rem,14vw,6rem)] leading-[0.84] text-[#171411]">
              Mod Manager
            </h1>
            <p className="neo-copy mt-3 max-w-[760px] text-xs font-black text-[#5b403f] uppercase">
              Steam Workshop // mod.io // CurseForge // local archive
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="grid grid-cols-3 border-4 border-black bg-[#171411] text-center text-[#fff9ed] shadow-[5px_5px_0_#171411]">
              <Readout label="Active" value={activeCount} />
              <Readout label="External" value={delegatedCount} />
              <Readout label="Ready" value={completedCount} />
            </div>
            <button
              className="neo-copy flex h-12 items-center gap-2 border-4 border-black bg-[#f5eedf] px-3 text-[11px] font-black uppercase shadow-[4px_4px_0_#171411] transition-colors hover:bg-[#efe6d4]"
              title="Provider Keys"
              type="button"
              onClick={() => setShowSecretsModal(true)}
            >
              <Settings2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Game Selector */}
      <div className="border-4 border-black bg-[#f5eedf] px-4 py-3 shadow-[5px_5px_0_#171411]">
        <label className="neo-copy block text-[10px] font-black text-[#5b403f] uppercase">
          Target Game
          <select
            className="ml-3 h-11 w-full border-4 border-black bg-[#fff9ed] px-2 text-[12px] font-black text-[#171411] shadow-[3px_3px_0_#171411] outline-none lg:w-auto lg:min-w-[260px]"
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
      </div>

      {/* 2.5. Browse Mods Catalog */}
      <Panel title="Browse Mods" icon={<Download className="h-4 w-4" />}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="neo-copy text-[10px] font-black text-[#5b403f] uppercase">
            {catalogEntries.length} mods available in catalog
          </p>
          <button
            className="neo-copy flex h-9 items-center gap-2 border-2 border-black bg-[#f6edd8] px-3 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411]"
            type="button"
            onClick={() => void loadCatalog()}
            disabled={catalogLoading}
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${catalogLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        {catalogLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="border-4 border-black bg-[#efe6d4] p-4 shadow-[3px_3px_0_#171411]"
              >
                <div className="mb-2 h-4 w-3/4 animate-pulse bg-[#d6cdb4]" />
                <div className="mb-1 h-3 w-1/2 animate-pulse bg-[#d6cdb4]" />
                <div className="mb-2 h-3 w-full animate-pulse bg-[#d6cdb4]" />
                <div className="h-9 w-full animate-pulse bg-[#d6cdb4]" />
              </div>
            ))}
          </div>
        ) : catalogError ? (
          <div className="neo-copy border-2 border-black bg-[#b7102a] p-3 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#171411]">
            {catalogError}
          </div>
        ) : catalogEntries.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {catalogEntries.map((entry) => (
              <CatalogCard
                key={entry.id}
                entry={entry}
                onInstall={() => void handleCatalogInstall(entry)}
                disabled={!selectedGame}
              />
            ))}
          </div>
        ) : (
          <EmptyState label="No mods found in catalog" />
        )}
      </Panel>

      {error ? (
        <div className="neo-copy border-4 border-black bg-[#b7102a] p-3 text-xs font-black text-white uppercase shadow-[4px_4px_0_#171411]">
          {error}
        </div>
      ) : null}
      {statusMessage ? (
        <div className="neo-copy border-4 border-black bg-[#007166] p-3 text-xs font-black text-white uppercase shadow-[4px_4px_0_#171411]">
          {statusMessage}
        </div>
      ) : null}

      {/* 3. Installed Mods (primary view) */}
      <Panel title="Installed Mods" icon={<CheckCircle2 className="h-4 w-4" />}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="neo-copy text-[10px] font-black text-[#5b403f] uppercase">
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
          <EmptyState label="No mods installed for this game. Add one below." />
        )}
      </Panel>

      {/* 4. Add Mod */}
      <Panel title="Add Mod" icon={<PackagePlus className="h-4 w-4" />}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 neo-copy block text-[10px] font-black text-[#5b403f] uppercase">
            URL or Local Path
            <input
              className="mt-1 h-11 w-full border-4 border-black bg-[#fff9ed] px-3 text-[12px] font-black shadow-[3px_3px_0_#171411] outline-none"
              placeholder="https://.../mod.zip or C:/Mods/file.zip"
              value={addSource}
              onChange={(event) => {
                setAddSource(event.target.value);
                if (!addTitle) {
                  const slug = event.target.value.split("/").pop()?.split(".")[0] ?? "";
                  setAddTitle(slug.replace(/[_-]/g, " "));
                }
              }}
            />
          </label>
          <label className="sm:w-52 neo-copy block text-[10px] font-black text-[#5b403f] uppercase">
            Name (optional)
            <input
              className="mt-1 h-11 w-full border-4 border-black bg-[#fff9ed] px-3 text-[12px] font-black shadow-[3px_3px_0_#171411] outline-none"
              placeholder="Auto-filled from URL"
              value={addTitle}
              onChange={(event) => setAddTitle(event.target.value)}
            />
          </label>
          <button
            className="neo-copy flex h-11 items-center justify-center gap-2 border-4 border-black bg-[#b7102a] px-5 text-[11px] font-black text-white uppercase shadow-[3px_3px_0_#171411] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedGame || !addSource.trim()}
            type="button"
            onClick={() => void handleAddMod()}
          >
            <PackagePlus className="h-4 w-4" />
            Install Mod
          </button>
        </div>
      </Panel>

      {/* 5. Provider Keys Modal */}
      {showSecretsModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
          <div className="mx-4 w-full max-w-md border-4 border-black bg-[#f5eedf] shadow-[6px_6px_0_#171411]">
            <div className="flex items-center justify-between border-b-4 border-black bg-[#171411] px-4 py-3 text-[#fff9ed]">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                <h2 className="neo-copy text-[12px] font-black tracking-normal uppercase">
                  Provider Keys
                </h2>
              </div>
              <button
                className="neo-copy flex h-8 items-center justify-center border-2 border-black bg-[#b7102a] px-2 text-[10px] font-black text-white uppercase"
                type="button"
                onClick={() => setShowSecretsModal(false)}
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <label className="neo-copy block text-[10px] font-black text-[#5b403f] uppercase">
                Provider
                <select
                  className="mt-1 h-10 w-full border-2 border-black bg-[#f6edd8] px-2 text-[11px] font-black uppercase outline-none"
                  value={secretProvider}
                  onChange={(event) => setSecretProvider(event.target.value as ModProvider)}
                >
                  {PROVIDERS.filter((provider) => provider.mode !== "direct").map((provider) => (
                    <option key={provider.key} value={provider.key}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="neo-copy block text-[10px] font-black text-[#5b403f] uppercase">
                API Key / OAuth Token
                <input
                  className="mt-1 h-10 w-full border-2 border-black bg-[#fff9ed] px-2 text-[11px] font-bold outline-none"
                  placeholder="Paste your key here"
                  type="password"
                  value={secretValue}
                  onChange={(event) => setSecretValue(event.target.value)}
                />
              </label>
              <p className="neo-copy text-[10px] font-bold text-[#5b403f] uppercase">
                Stored locally through the OS keychain. No provider key is written to Supabase.
              </p>
              <button
                className="neo-copy flex h-10 w-full items-center justify-center gap-2 border-2 border-black bg-[#007166] text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#171411]"
                type="button"
                onClick={() => void handleSaveSecret()}
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Panel({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <section className="border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]">
      <div className="flex items-center gap-2 border-b-4 border-black bg-[#171411] px-3 py-2 text-[#fff9ed]">
        {icon}
        <h2 className="neo-copy text-[11px] font-black tracking-normal uppercase">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Readout({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[92px] border-[#fff9ed] p-3 not-last:border-r">
      <p className="text-3xl leading-none font-black">{value}</p>
      <p className="neo-copy mt-1 text-[10px] font-black uppercase">{label}</p>
    </div>
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
          <span className="neo-copy text-[10px] font-black text-[#5b403f] uppercase">
            {providerLabel(mod.provider)} // {mod.installedFiles.length} files
          </span>
        </div>
        <h3 className="mt-1 truncate text-lg leading-none font-black uppercase">{mod.title}</h3>
        <p className="neo-copy mt-1 text-[10px] font-bold break-all text-[#5b403f] uppercase">
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
        className="neo-copy flex h-9 items-center justify-center gap-2 border-2 border-black bg-[#b7102a] px-3 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#171411]"
        type="button"
        onClick={onUninstall}
      >
        <Trash2 className="h-4 w-4" />
        Remove
      </button>
    </article>
  );
}

function CatalogCard({
  entry,
  onInstall,
  disabled,
}: {
  entry: ModCatalogEntry;
  onInstall: () => void;
  disabled: boolean;
}) {
  return (
    <article className="flex flex-col gap-2 border-4 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="neo-copy border-2 border-black bg-[#171411] px-2 py-0.5 text-[9px] font-black text-white uppercase">
          {providerLabel(entry.provider)}
        </span>
        {entry.author ? (
          <span className="neo-copy text-[9px] font-black text-[#5b403f] uppercase">
            {entry.author}
          </span>
        ) : null}
      </div>
      <h3 className="truncate text-sm leading-tight font-black uppercase">{entry.name}</h3>
      {entry.summary ? (
        <p className="neo-copy truncate text-[10px] font-bold text-[#5b403f] uppercase">
          {entry.summary}
        </p>
      ) : null}
      <button
        className="neo-copy mt-auto flex h-9 items-center justify-center gap-2 border-2 border-black bg-[#007166] px-3 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:opacity-50"
        type="button"
        onClick={onInstall}
        disabled={disabled}
      >
        <Download className="h-3.5 w-3.5" />
        Install
      </button>
    </article>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="neo-copy border-2 border-dashed border-black bg-[#fff9ed] p-5 text-center text-[10px] font-black text-[#5b403f] uppercase">
      {label}
    </div>
  );
}
