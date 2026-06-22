import {
  CheckCircle2,
  CloudUpload,
  Download,
  ExternalLink,
  KeyRound,
  PackagePlus,
  Power,
  RefreshCcw,
  Save,
  Search,
  Settings2,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { ModApiStagingReadinessPanel } from "../components/mods/ModApiStagingReadinessPanel";
import {
  disableMod,
  enableMod,
  listInstalledGames,
  scanGameMods,
  scrapeNexusModInfo,
  searchNexusMods,
  setModProviderSecret,
  startModInstall,
  uninstallMod,
} from "../lib/launcher";
import { getErrorMessage } from "../lib/formatters";
import { searchNativeMods } from "../lib/mod-provider-search";
import {
  listModCatalogEntries,
  listSharedModProviderGameMappings,
  recordUserModInstall,
  upsertSharedModProviderGameMapping,
} from "../lib/supabase/mods";
import type { Game } from "../lib/types";
import type {
  InstalledModInfo,
  ModCatalogEntry,
  ModProvider,
  NativeModSearchResult,
  NexusModInfo,
  NexusSearchResult,
} from "../lib/types/mods";
import {
  buildModProviderGameIdHints,
  buildModProviderGameIdPromotionEvidence,
  getEffectiveModProviderGameId,
  getModProviderGameIdSource,
  getPreferredModProviderGameId,
  getStoredModProviderGameId,
  normalizeModProviderGameId,
  readModProviderGameIdMappings,
  removeModProviderGameIdMapping,
  setModProviderGameIdMapping,
  sharedModProviderGameMappingsToLocalShape,
  writeModProviderGameIdMappings,
  type ModProviderGameIdHint,
  type ModProviderGameIdMappings,
} from "../lib/mod-provider-game-ids";
import {
  createVerifyModApiStagingReadiness,
  createVerifyModProviderStagingProbe,
} from "../lib/mod-api-staging-readiness";
import {
  selectActiveModInstallCount,
  selectCompletedModInstallCount,
  selectDelegatedModInstallCount,
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

const PROVIDER_API_VERIFY_GAME: Game = {
  description: "Local browser fixture for provider API-key staging verification.",
  id: "mods-api-staging-demo",
  launcher: "steam",
  platform: "windows",
  status: "installed",
  title: "Mod API Staging Demo",
  version: "verify",
};

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

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

export function ModsPage() {
  const [searchParams] = useSearchParams();
  const isProviderApiKeyStagingVerify = searchParams.get("verify") === "provider-api-key-staging";
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

  const [nexusLoading, setNexusLoading] = useState(false);
  const [nexusInfo, setNexusInfo] = useState<NexusModInfo | null>(null);

  const [activeTab, setActiveTab] = useState<"installed" | "browse">(
    isProviderApiKeyStagingVerify ? "browse" : "installed",
  );
  const [nexusQuery, setNexusQuery] = useState("");
  const [nexusGameSlug, setNexusGameSlug] = useState("");
  const [nexusResults, setNexusResults] = useState<NexusSearchResult[]>([]);
  const [nexusSearchLoading, setNexusSearchLoading] = useState(false);
  const [nexusSearchError, setNexusSearchError] = useState<string | null>(null);
  const [nativeProvider, setNativeProvider] = useState<"modio" | "curseforge">("modio");
  const [nativeProviderGameId, setNativeProviderGameId] = useState("");
  const [providerGameIdMappings, setProviderGameIdMappings] = useState<ModProviderGameIdMappings>(
    () => readModProviderGameIdMappings(),
  );
  const [sharedProviderGameIdMappings, setSharedProviderGameIdMappings] =
    useState<ModProviderGameIdMappings>({});
  const [sharedProviderMappingLoading, setSharedProviderMappingLoading] = useState(false);
  const [sharedProviderMappingSaving, setSharedProviderMappingSaving] = useState(false);
  const [sharedProviderMappingError, setSharedProviderMappingError] = useState<string | null>(null);
  const [providerMappingMessage, setProviderMappingMessage] = useState<string | null>(null);
  const [providerMappingError, setProviderMappingError] = useState<string | null>(null);
  const [nativeQuery, setNativeQuery] = useState("");
  const [nativeResults, setNativeResults] = useState<NativeModSearchResult[]>([]);
  const [nativeSearchLoading, setNativeSearchLoading] = useState(false);
  const [nativeSearchError, setNativeSearchError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) ?? null,
    [games, selectedGameId],
  );
  const nativeProviderGameIdHints = useMemo(
    () => buildModProviderGameIdHints(selectedGame, nativeProvider),
    [nativeProvider, selectedGame],
  );
  const storedNativeProviderGameId = useMemo(
    () => getStoredModProviderGameId(providerGameIdMappings, selectedGame, nativeProvider),
    [nativeProvider, providerGameIdMappings, selectedGame],
  );
  const sharedNativeProviderGameId = useMemo(
    () => getStoredModProviderGameId(sharedProviderGameIdMappings, selectedGame, nativeProvider),
    [nativeProvider, selectedGame, sharedProviderGameIdMappings],
  );
  const nativeProviderGameIdSource = useMemo(
    () =>
      getModProviderGameIdSource(
        selectedGame,
        nativeProvider,
        providerGameIdMappings,
        sharedProviderGameIdMappings,
      ),
    [nativeProvider, providerGameIdMappings, selectedGame, sharedProviderGameIdMappings],
  );
  const normalizedNativeProviderGameId = useMemo(
    () => normalizeModProviderGameId(nativeProvider, nativeProviderGameId),
    [nativeProvider, nativeProviderGameId],
  );

  useEffect(() => {
    let active = true;

    Promise.all([listInstalledGames()])
      .then(([libraryGames]) => {
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
      .catch((err) => {
        if (!active) return;
        if (isProviderApiKeyStagingVerify) {
          setGames([PROVIDER_API_VERIFY_GAME]);
          setSelectedGameId(PROVIDER_API_VERIFY_GAME.id);
          setInstalledMods([]);
          setError(null);
          return;
        }
        setError(getErrorMessage(err));
      })
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

  useEffect(() => {
    if (selectedGame && !nexusGameSlug) {
      setNexusGameSlug(selectedGame.title.toLowerCase().replace(/[^a-z0-9]/g, ""));
    }
  }, [selectedGame, nexusGameSlug]);

  useEffect(() => {
    setNativeProviderGameId(
      (current) =>
        current ||
        getEffectiveModProviderGameId(
          selectedGame,
          nativeProvider,
          providerGameIdMappings,
          sharedProviderGameIdMappings,
        ),
    );
  }, [nativeProvider, providerGameIdMappings, selectedGame, sharedProviderGameIdMappings]);

  useEffect(() => {
    if (!selectedGameId) {
      setSharedProviderGameIdMappings({});
      setSharedProviderMappingError(null);
      return;
    }
    void loadSharedProviderGameIdMappings(selectedGameId);
  }, [selectedGameId]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const lower = addSource.toLowerCase();
    if (!lower.includes("nexusmods.com")) {
      setNexusInfo(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function scrape() {
      setNexusLoading(true);
      setNexusInfo(null);
      try {
        const info = await scrapeNexusModInfo(addSource.trim());
        if (!cancelled && !controller.signal.aborted) {
          setNexusInfo(info);
          setAddTitle(info.name);
        }
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          setNexusInfo(null);
        }
      } finally {
        if (!cancelled && !controller.signal.aborted) {
          setNexusLoading(false);
        }
      }
    }

    void scrape();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [addSource]);

  async function loadInstalledMods(gameId: string) {
    if (isProviderApiKeyStagingVerify && gameId === PROVIDER_API_VERIFY_GAME.id) {
      setInstalledMods([]);
      return;
    }
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

  async function loadSharedProviderGameIdMappings(localGameId: string) {
    try {
      setSharedProviderMappingLoading(true);
      setSharedProviderMappingError(null);
      const rows = await listSharedModProviderGameMappings({ localGameId });
      setSharedProviderGameIdMappings(sharedModProviderGameMappingsToLocalShape(rows));
    } catch (err) {
      setSharedProviderMappingError(getErrorMessage(err));
      setSharedProviderGameIdMappings({});
    } finally {
      setSharedProviderMappingLoading(false);
    }
  }

  async function handleNexusSearch(query: string, gameSlug: string) {
    if (!query.trim() || !gameSlug.trim()) {
      setNexusResults([]);
      return;
    }
    try {
      setNexusSearchLoading(true);
      setNexusSearchError(null);
      const results = await searchNexusMods(gameSlug.trim(), query.trim());
      setNexusResults(results);
    } catch (err) {
      setNexusSearchError(getErrorMessage(err));
      setNexusResults([]);
    } finally {
      setNexusSearchLoading(false);
    }
  }

  async function handleNativeSearch() {
    const provider = nativeProvider;
    const providerGameId = normalizedNativeProviderGameId;
    const query = nativeQuery.trim();

    if (!query || !providerGameId) {
      setNativeResults([]);
      if (query && nativeProviderGameId.trim()) {
        setNativeSearchError("CurseForge game IDs must be numeric.");
      }
      return;
    }
    try {
      setNativeSearchLoading(true);
      setNativeSearchError(null);
      const results = await searchNativeMods({
        provider,
        providerGameId,
        query,
        pageSize: 12,
      });
      setNativeResults(results);
      void promoteProviderGameIdFromNativeResults(provider, providerGameId, query, results);
    } catch (err) {
      setNativeSearchError(getErrorMessage(err));
      setNativeResults([]);
    } finally {
      setNativeSearchLoading(false);
    }
  }

  async function promoteProviderGameIdFromNativeResults(
    provider: "modio" | "curseforge",
    providerGameId: string,
    query: string,
    results: NativeModSearchResult[],
  ) {
    if (!selectedGame) return;
    const evidence = buildModProviderGameIdPromotionEvidence({
      provider,
      providerGameId,
      query,
      results,
    });
    if (!evidence) return;

    const nextMappings = setModProviderGameIdMapping(
      providerGameIdMappings,
      selectedGame.id,
      provider,
      evidence.providerGameId,
    );
    setProviderGameIdMappings(nextMappings);
    writeModProviderGameIdMappings(nextMappings);
    setNativeProviderGameId(evidence.providerGameId);
    setProviderMappingError(null);
    setProviderMappingMessage(
      `Provider API confirmed // local map promoted ${providerLabel(provider)} -> ${evidence.providerGameId}`,
    );

    try {
      setSharedProviderMappingSaving(true);
      const sharedRow = await upsertSharedModProviderGameMapping({
        gameTitle: selectedGame.title,
        localGameId: selectedGame.id,
        metadata: {
          providerApi: {
            promotedAt: new Date().toISOString(),
            query: evidence.query,
            resultCount: evidence.resultCount,
            sampleExternalIds: evidence.sampleExternalIds,
          },
        },
        provider,
        providerGameId: evidence.providerGameId,
        source: "provider_api",
      });

      if (sharedRow) {
        setSharedProviderGameIdMappings((current) =>
          setModProviderGameIdMapping(
            current,
            sharedRow.localGameId,
            sharedRow.provider,
            sharedRow.providerGameId,
          ),
        );
        setSharedProviderMappingError(null);
        setProviderMappingMessage(
          `Provider API confirmed // shared catalog promoted ${providerLabel(provider)} -> ${evidence.providerGameId}`,
        );
      }
    } catch (err) {
      setSharedProviderMappingError(getErrorMessage(err));
      setProviderMappingMessage(
        `Provider API confirmed // local map promoted ${providerLabel(provider)} -> ${evidence.providerGameId}`,
      );
    } finally {
      setSharedProviderMappingSaving(false);
    }
  }

  function handleSearchInputChange(value: string) {
    setNexusQuery(value);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (value.trim() && nexusGameSlug.trim()) {
      searchTimeoutRef.current = setTimeout(() => {
        void handleNexusSearch(value, nexusGameSlug);
      }, 500);
    } else {
      setNexusResults([]);
    }
  }

  function clearProviderMappingFeedback() {
    setProviderMappingMessage(null);
    setProviderMappingError(null);
  }

  function handleSaveProviderGameIdMapping() {
    if (!selectedGame) {
      setProviderMappingError("Select a target game first.");
      setProviderMappingMessage(null);
      return;
    }

    const normalized = normalizeModProviderGameId(nativeProvider, nativeProviderGameId);
    if (!normalized) {
      setProviderMappingError(
        nativeProvider === "curseforge"
          ? "CurseForge game IDs must be numeric."
          : "Enter a mod.io game slug or id first.",
      );
      setProviderMappingMessage(null);
      return;
    }

    const nextMappings = setModProviderGameIdMapping(
      providerGameIdMappings,
      selectedGame.id,
      nativeProvider,
      normalized,
    );
    setProviderGameIdMappings(nextMappings);
    writeModProviderGameIdMappings(nextMappings);
    setNativeProviderGameId(normalized);
    setProviderMappingError(null);
    setProviderMappingMessage(
      `Local map saved // ${providerLabel(nativeProvider)} -> ${normalized}`,
    );
  }

  function handleClearProviderGameIdMapping() {
    if (!selectedGame) return;

    const nextMappings = removeModProviderGameIdMapping(
      providerGameIdMappings,
      selectedGame.id,
      nativeProvider,
    );
    setProviderGameIdMappings(nextMappings);
    writeModProviderGameIdMappings(nextMappings);
    setNativeProviderGameId(getPreferredModProviderGameId(selectedGame, nativeProvider));
    setProviderMappingError(null);
    setProviderMappingMessage(`Local ${providerLabel(nativeProvider)} map cleared.`);
  }

  async function handleSyncSharedProviderGameIdMapping() {
    if (!selectedGame) {
      setProviderMappingError("Select a target game first.");
      setProviderMappingMessage(null);
      return;
    }

    const normalized = normalizeModProviderGameId(nativeProvider, nativeProviderGameId);
    if (!normalized) {
      setProviderMappingError(
        nativeProvider === "curseforge"
          ? "CurseForge game IDs must be numeric."
          : "Enter a mod.io game slug or id first.",
      );
      setProviderMappingMessage(null);
      return;
    }

    const nextMappings = setModProviderGameIdMapping(
      providerGameIdMappings,
      selectedGame.id,
      nativeProvider,
      normalized,
    );
    setProviderGameIdMappings(nextMappings);
    writeModProviderGameIdMappings(nextMappings);
    setNativeProviderGameId(normalized);
    setProviderMappingError(null);

    try {
      setSharedProviderMappingSaving(true);
      const sharedRow = await upsertSharedModProviderGameMapping({
        gameTitle: selectedGame.title,
        localGameId: selectedGame.id,
        provider: nativeProvider,
        providerGameId: normalized,
        source: storedNativeProviderGameId === normalized ? "manual" : "local_hint",
      });

      if (sharedRow) {
        setSharedProviderGameIdMappings((current) =>
          setModProviderGameIdMapping(
            current,
            sharedRow.localGameId,
            sharedRow.provider,
            sharedRow.providerGameId,
          ),
        );
        setSharedProviderMappingError(null);
        setProviderMappingMessage(
          `Shared catalog map synced // ${providerLabel(nativeProvider)} -> ${normalized}`,
        );
      } else {
        setProviderMappingMessage(
          `Local map saved // shared catalog unavailable for ${providerLabel(nativeProvider)}`,
        );
      }
    } catch (err) {
      setSharedProviderMappingError(getErrorMessage(err));
      setProviderMappingError(getErrorMessage(err));
      setProviderMappingMessage(null);
    } finally {
      setSharedProviderMappingSaving(false);
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

  async function handleNativeInstall(result: NativeModSearchResult) {
    if (!selectedGame) return;
    try {
      setError(null);
      const installResult = await startModInstall({
        gameId: selectedGame.id,
        provider: result.provider,
        catalogItemId: result.externalId,
        sourceUrl: result.downloadUrl ?? result.providerAppUrl ?? result.url,
        title: result.name,
      });
      setStatusMessage(installResult.message);
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
            <span className="neo-copy inline-flex border-2 border-black bg-[#007166] px-3 py-1 text-[10px] font-black uppercase text-white shadow-[3px_3px_0_#171411]">
              Provider deck online
            </span>
            <h1 className="neo-title mt-2 text-[3.2rem] leading-[0.84] text-[#171411] sm:text-[4.4rem] lg:text-[5.4rem] xl:text-[6rem]">
              Mod Manager
            </h1>
            <p className="neo-copy mt-3 max-w-[760px] text-xs font-black uppercase text-[#5b403f]">
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
        <label className="neo-copy block text-[10px] font-black uppercase text-[#5b403f]">
          Target Game
          <select
            className="ml-3 h-11 w-full border-4 border-black bg-[#fff9ed] px-2 text-[12px] font-black text-[#171411] shadow-[3px_3px_0_#171411] outline-none lg:w-auto lg:min-w-[260px]"
            value={selectedGameId}
            onChange={(event) => {
              const nextGameId = event.target.value;
              const nextGame = games.find((game) => game.id === nextGameId) ?? null;
              setSelectedGameId(nextGameId);
              setNativeProviderGameId(
                getEffectiveModProviderGameId(
                  nextGame,
                  nativeProvider,
                  providerGameIdMappings,
                  sharedProviderGameIdMappings,
                ),
              );
              setNativeResults([]);
              setNativeSearchError(null);
              clearProviderMappingFeedback();
              void loadInstalledMods(nextGameId);
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

      {/* 2.5. Tab Bar */}
      <div className="flex border-4 border-b-0 border-black bg-[#171411] shadow-[5px_5px_0_#171411]">
        <button
          className={`neo-copy flex-1 px-4 py-3 text-[11px] font-black uppercase transition-colors ${
            activeTab === "installed"
              ? "bg-[#f5eedf] text-[#171411]"
              : "text-[#fff9ed] hover:bg-[#2a2520]"
          }`}
          type="button"
          onClick={() => setActiveTab("installed")}
        >
          <span className="flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Installed ({installedMods.length})
          </span>
        </button>
        <button
          className={`neo-copy flex-1 px-4 py-3 text-[11px] font-black uppercase transition-colors ${
            activeTab === "browse"
              ? "bg-[#f5eedf] text-[#171411]"
              : "text-[#fff9ed] hover:bg-[#2a2520]"
          }`}
          type="button"
          onClick={() => setActiveTab("browse")}
        >
          <span className="flex items-center justify-center gap-2">
            <Search className="h-4 w-4" />
            Browse Mods
          </span>
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

      {/* TAB CONTENT */}
      {activeTab === "installed" && (
        <>
          {/* Installed Mods */}
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
              <EmptyState label="No mods installed for this game. Add one below." />
            )}
          </Panel>

          {/* Add Mod */}
          <Panel title="Add Mod" icon={<PackagePlus className="h-4 w-4" />}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="neo-copy block flex-1 text-[10px] font-black uppercase text-[#5b403f]">
                URL or Local Path
                <div className="relative">
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
                  {nexusLoading ? (
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                      <RefreshCcw className="h-4 w-4 animate-spin text-[#007166]" />
                    </div>
                  ) : null}
                </div>
              </label>
              <label className="neo-copy block text-[10px] font-black uppercase text-[#5b403f] sm:w-52">
                Name (optional)
                <input
                  className="mt-1 h-11 w-full border-4 border-black bg-[#fff9ed] px-3 text-[12px] font-black shadow-[3px_3px_0_#171411] outline-none"
                  placeholder="Auto-filled from URL"
                  value={addTitle}
                  onChange={(event) => setAddTitle(event.target.value)}
                />
              </label>
              <button
                className="neo-copy flex h-11 items-center justify-center gap-2 border-4 border-black bg-[#b7102a] px-5 text-[11px] font-black uppercase text-white shadow-[3px_3px_0_#171411] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!selectedGame || !addSource.trim() || nexusLoading}
                type="button"
                onClick={() => void handleAddMod()}
              >
                <PackagePlus className="h-4 w-4" />
                Install Mod
              </button>
            </div>
            {nexusInfo ? (
              <div className="mt-3 flex items-center gap-3 border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
                {nexusInfo.iconUrl ? (
                  <img
                    src={nexusInfo.iconUrl}
                    alt=""
                    className="h-10 w-10 border-2 border-black object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black uppercase">{nexusInfo.name}</p>
                  <p className="neo-copy text-[10px] font-bold uppercase text-[#5b403f]">
                    by {nexusInfo.author} // {nexusInfo.gameName}
                    {nexusInfo.downloadsCount ? ` // ${nexusInfo.downloadsCount} downloads` : ""}
                  </p>
                </div>
                <span className="neo-copy border-2 border-black bg-[#007166] px-2 py-0.5 text-[9px] font-black uppercase text-white">
                  Nexus Mods
                </span>
              </div>
            ) : null}
          </Panel>
        </>
      )}

      {activeTab === "browse" && (
        <>
          {/* Nexus Search */}
          <Panel title="Search Nexus Mods" icon={<Search className="h-4 w-4" />}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="neo-copy block flex-1 text-[10px] font-black uppercase text-[#5b403f]">
                Game Slug
                <input
                  className="mt-1 h-11 w-full border-4 border-black bg-[#fff9ed] px-3 text-[12px] font-black shadow-[3px_3px_0_#171411] outline-none"
                  placeholder="e.g. skyrimspecialedition, cyberpunk2077"
                  value={nexusGameSlug}
                  onChange={(event) => setNexusGameSlug(event.target.value)}
                />
              </label>
              <label className="neo-copy block flex-[2] text-[10px] font-black uppercase text-[#5b403f]">
                Search Query
                <div className="relative">
                  <input
                    className="mt-1 h-11 w-full border-4 border-black bg-[#fff9ed] px-3 pr-10 text-[12px] font-black shadow-[3px_3px_0_#171411] outline-none"
                    placeholder="Search for mods..."
                    value={nexusQuery}
                    onChange={(event) => handleSearchInputChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && nexusQuery.trim() && nexusGameSlug.trim()) {
                        void handleNexusSearch(nexusQuery, nexusGameSlug);
                      }
                    }}
                  />
                  {nexusSearchLoading ? (
                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                      <RefreshCcw className="h-4 w-4 animate-spin text-[#007166]" />
                    </div>
                  ) : (
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b403f]" />
                  )}
                </div>
              </label>
              <button
                className="neo-copy flex h-11 items-center justify-center gap-2 border-4 border-black bg-[#007166] px-5 text-[11px] font-black uppercase text-white shadow-[3px_3px_0_#171411] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!nexusQuery.trim() || !nexusGameSlug.trim() || nexusSearchLoading}
                type="button"
                onClick={() => void handleNexusSearch(nexusQuery, nexusGameSlug)}
              >
                <Search className="h-4 w-4" />
                Search
              </button>
            </div>
          </Panel>

          <Panel title="Native Provider Search" icon={<Download className="h-4 w-4" />}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              <label className="neo-copy block text-[10px] font-black uppercase text-[#5b403f] lg:w-44">
                Provider
                <select
                  className="mt-1 h-11 w-full border-4 border-black bg-[#fff9ed] px-2 text-[12px] font-black shadow-[3px_3px_0_#171411] outline-none"
                  value={nativeProvider}
                  onChange={(event) => {
                    const provider = event.target.value as "modio" | "curseforge";
                    setNativeProvider(provider);
                    setNativeProviderGameId(
                      getEffectiveModProviderGameId(
                        selectedGame,
                        provider,
                        providerGameIdMappings,
                        sharedProviderGameIdMappings,
                      ),
                    );
                    setNativeResults([]);
                    setNativeSearchError(null);
                    clearProviderMappingFeedback();
                  }}
                >
                  <option value="modio">mod.io</option>
                  <option value="curseforge">CurseForge</option>
                </select>
              </label>
              <div className="lg:w-72">
                <label className="neo-copy block text-[10px] font-black uppercase text-[#5b403f]">
                  Provider Game ID
                  <input
                    className="mt-1 h-11 w-full border-4 border-black bg-[#fff9ed] px-3 text-[12px] font-black shadow-[3px_3px_0_#171411] outline-none"
                    placeholder={nativeProvider === "modio" ? "game-slug or id" : "numeric game id"}
                    value={nativeProviderGameId}
                    onChange={(event) => {
                      setNativeProviderGameId(event.target.value);
                      clearProviderMappingFeedback();
                    }}
                  />
                </label>
                <ProviderGameIdMappingControls
                  canSave={Boolean(selectedGame && normalizedNativeProviderGameId)}
                  error={providerMappingError}
                  message={providerMappingMessage}
                  provider={nativeProvider}
                  sharedError={sharedProviderMappingError}
                  sharedLoading={sharedProviderMappingLoading}
                  sharedSource={nativeProviderGameIdSource}
                  sharedValue={sharedNativeProviderGameId}
                  storedValue={storedNativeProviderGameId}
                  onClear={handleClearProviderGameIdMapping}
                  onSave={handleSaveProviderGameIdMapping}
                  onSync={() => void handleSyncSharedProviderGameIdMapping()}
                  syncDisabled={!selectedGame || !normalizedNativeProviderGameId}
                  syncing={sharedProviderMappingSaving}
                />
                <ProviderGameIdHints
                  hints={nativeProviderGameIdHints}
                  provider={nativeProvider}
                  selectedValue={nativeProviderGameId}
                  onUse={(value) => {
                    setNativeProviderGameId(value);
                    clearProviderMappingFeedback();
                  }}
                />
              </div>
              <label className="neo-copy block flex-1 text-[10px] font-black uppercase text-[#5b403f]">
                Search Query
                <input
                  className="mt-1 h-11 w-full border-4 border-black bg-[#fff9ed] px-3 text-[12px] font-black shadow-[3px_3px_0_#171411] outline-none"
                  placeholder="Search native provider catalog..."
                  value={nativeQuery}
                  onChange={(event) => setNativeQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void handleNativeSearch();
                    }
                  }}
                />
              </label>
              <button
                className="neo-copy flex h-11 items-center justify-center gap-2 border-4 border-black bg-[#b7102a] px-5 text-[11px] font-black uppercase text-white shadow-[3px_3px_0_#171411] disabled:cursor-not-allowed disabled:opacity-50 lg:mt-5"
                disabled={
                  !nativeQuery.trim() || !normalizedNativeProviderGameId || nativeSearchLoading
                }
                type="button"
                onClick={() => void handleNativeSearch()}
              >
                <Search className="h-4 w-4" />
                Search
              </button>
            </div>
            <p className="neo-copy mt-3 text-[10px] font-bold uppercase text-[#5b403f]">
              Uses provider API keys from the local OS keychain. Direct file URLs install natively;
              provider pages open through delegation.
            </p>
          </Panel>

          {isProviderApiKeyStagingVerify ? (
            <ModApiStagingReadinessPanel
              readiness={createVerifyModApiStagingReadiness()}
              stagingProbe={createVerifyModProviderStagingProbe()}
            />
          ) : null}

          {nativeSearchError ? (
            <div className="neo-copy border-4 border-black bg-[#b7102a] p-3 text-xs font-black uppercase text-white shadow-[4px_4px_0_#171411]">
              {nativeSearchError}
            </div>
          ) : null}

          <Panel
            title={`Native Results${nativeResults.length > 0 ? ` (${nativeResults.length})` : ""}`}
            icon={<Download className="h-4 w-4" />}
          >
            {nativeSearchLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="border-4 border-black bg-[#efe6d4] p-4 shadow-[3px_3px_0_#171411]"
                  >
                    <div className="mb-2 h-4 w-3/4 animate-pulse bg-[#d6cdb4]" />
                    <div className="mb-1 h-3 w-full animate-pulse bg-[#d6cdb4]" />
                    <div className="h-9 w-full animate-pulse bg-[#d6cdb4]" />
                  </div>
                ))}
              </div>
            ) : nativeResults.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {nativeResults.map((result) => (
                  <NativeModSearchCard
                    key={`${result.provider}-${result.externalId}`}
                    result={result}
                    disabled={!selectedGame}
                    onInstall={() => void handleNativeInstall(result)}
                  />
                ))}
              </div>
            ) : nativeQuery.trim() ? (
              <EmptyState label="No native provider results found" />
            ) : (
              <EmptyState label="Search mod.io or CurseForge with a provider game id" />
            )}
          </Panel>

          {nexusSearchError ? (
            <div className="neo-copy border-4 border-black bg-[#b7102a] p-3 text-xs font-black uppercase text-white shadow-[4px_4px_0_#171411]">
              {nexusSearchError}
            </div>
          ) : null}

          {/* Search Results */}
          <Panel
            title={`Results${nexusResults.length > 0 ? ` (${nexusResults.length})` : ""}`}
            icon={<Download className="h-4 w-4" />}
          >
            {nexusSearchLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="border-4 border-black bg-[#efe6d4] p-4 shadow-[3px_3px_0_#171411]"
                  >
                    <div className="mb-2 flex gap-3">
                      <div className="h-12 w-12 shrink-0 animate-pulse bg-[#d6cdb4]" />
                      <div className="flex-1">
                        <div className="mb-1 h-4 w-3/4 animate-pulse bg-[#d6cdb4]" />
                        <div className="h-3 w-1/2 animate-pulse bg-[#d6cdb4]" />
                      </div>
                    </div>
                    <div className="mb-1 h-3 w-full animate-pulse bg-[#d6cdb4]" />
                    <div className="h-3 w-2/3 animate-pulse bg-[#d6cdb4]" />
                  </div>
                ))}
              </div>
            ) : nexusResults.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {nexusResults.map((result, idx) => (
                  <NexusSearchCard key={`${result.url}-${idx}`} result={result} />
                ))}
              </div>
            ) : nexusQuery.trim() ? (
              <EmptyState label="No results found. Try a different query." />
            ) : (
              <EmptyState label="Search Nexus Mods for any game" />
            )}
          </Panel>

          {/* Catalog Section */}
          <Panel title="Catalog" icon={<Download className="h-4 w-4" />}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="neo-copy text-[10px] font-black uppercase text-[#5b403f]">
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
              <div className="neo-copy border-2 border-black bg-[#b7102a] p-3 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411]">
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
        </>
      )}

      {/* 5. Provider Keys Modal */}
      {showSecretsModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#171411]/90 bg-[radial-gradient(circle,rgba(255,249,237,0.14)_1px,transparent_1px)] bg-[length:10px_10px]">
          <div className="mx-4 w-full max-w-md border-4 border-black bg-[#f5eedf] shadow-[6px_6px_0_#171411]">
            <div className="flex items-center justify-between border-b-4 border-black bg-[#171411] px-4 py-3 text-[#fff9ed]">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                <h2 className="neo-copy text-[12px] font-black uppercase tracking-normal">
                  Provider Keys
                </h2>
              </div>
              <button
                className="neo-copy flex h-8 items-center justify-center border-2 border-black bg-[#b7102a] px-2 text-[10px] font-black uppercase text-white"
                type="button"
                onClick={() => setShowSecretsModal(false)}
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <label className="neo-copy block text-[10px] font-black uppercase text-[#5b403f]">
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
              <label className="neo-copy block text-[10px] font-black uppercase text-[#5b403f]">
                API Key / OAuth Token
                <input
                  className="mt-1 h-10 w-full border-2 border-black bg-[#fff9ed] px-2 text-[11px] font-bold outline-none"
                  placeholder="Paste your key here"
                  type="password"
                  value={secretValue}
                  onChange={(event) => setSecretValue(event.target.value)}
                />
              </label>
              <p className="neo-copy text-[10px] font-bold uppercase text-[#5b403f]">
                Stored locally through the OS keychain. No provider key is written to Supabase.
              </p>
              <button
                className="neo-copy flex h-10 w-full items-center justify-center gap-2 border-2 border-black bg-[#007166] text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411]"
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

function ProviderGameIdMappingControls({
  canSave,
  error,
  message,
  onClear,
  onSave,
  onSync,
  provider,
  sharedError,
  sharedLoading,
  sharedSource,
  sharedValue,
  storedValue,
  syncDisabled,
  syncing,
}: {
  canSave: boolean;
  error: string | null;
  message: string | null;
  onClear: () => void;
  onSave: () => void;
  onSync: () => void;
  provider: "modio" | "curseforge";
  sharedError: string | null;
  sharedLoading: boolean;
  sharedSource: "local" | "shared" | "hint" | "none";
  sharedValue: string;
  storedValue: string;
  syncDisabled: boolean;
  syncing: boolean;
}) {
  const hasStoredValue = Boolean(storedValue);
  const hasSharedValue = Boolean(sharedValue);
  const sharedStatus = sharedLoading
    ? "Checking"
    : sharedError
      ? "Blocked"
      : hasSharedValue
        ? "Ready"
        : sharedSource === "hint" || sharedSource === "none"
          ? "Missing"
          : "Sync Pending";
  const sharedStatusClass = sharedError
    ? "bg-[#b7102a] text-white"
    : hasSharedValue
      ? "bg-[#007166] text-white"
      : "bg-[#efe6d4] text-[#171411]";

  return (
    <div className="mt-2 border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="neo-copy border-2 border-black bg-[#171411] px-2 py-0.5 text-[8px] font-black uppercase text-[#fff9ed]">
          Local Map
        </span>
        <span
          className={`neo-copy border-2 border-black px-2 py-0.5 text-[8px] font-black uppercase ${
            hasStoredValue ? "bg-[#007166] text-white" : "bg-[#efe6d4] text-[#171411]"
          }`}
        >
          {hasStoredValue ? "Mapped" : "Not Saved"}
        </span>
        <span className="neo-copy border-2 border-black bg-[#171411] px-2 py-0.5 text-[8px] font-black uppercase text-[#fff9ed]">
          Shared Catalog
        </span>
        <span
          className={`neo-copy border-2 border-black px-2 py-0.5 text-[8px] font-black uppercase ${sharedStatusClass}`}
        >
          {sharedStatus}
        </span>
      </div>

      {hasStoredValue ? (
        <p className="neo-copy mt-2 break-all text-[9px] font-black uppercase text-[#5b403f]">
          {providerLabel(provider)} -&gt; {storedValue}
        </p>
      ) : null}
      {hasSharedValue ? (
        <p className="neo-copy mt-1 break-all text-[9px] font-black uppercase text-[#007166]">
          Shared {providerLabel(provider)} -&gt; {sharedValue}
        </p>
      ) : null}

      <div className="mt-2 grid grid-cols-3 gap-2">
        <button
          className="neo-copy flex h-8 items-center justify-center gap-1 border-2 border-black bg-[#007166] px-2 text-[9px] font-black uppercase text-white shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canSave}
          type="button"
          onClick={onSave}
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </button>
        <button
          className="neo-copy flex h-8 items-center justify-center gap-1 border-2 border-black bg-[#b7102a] px-2 text-[9px] font-black uppercase text-white shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={syncDisabled || syncing}
          type="button"
          onClick={onSync}
        >
          <CloudUpload className="h-3.5 w-3.5" />
          {syncing ? "Syncing" : "Sync"}
        </button>
        <button
          className="neo-copy flex h-8 items-center justify-center gap-1 border-2 border-black bg-[#f6edd8] px-2 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasStoredValue}
          type="button"
          onClick={onClear}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Forget
        </button>
      </div>

      {message ? (
        <p className="neo-copy mt-2 border-2 border-black bg-[#007166] px-2 py-1 text-[9px] font-black uppercase text-white">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="neo-copy mt-2 border-2 border-black bg-[#b7102a] px-2 py-1 text-[9px] font-black uppercase text-white">
          {error}
        </p>
      ) : null}
      {sharedError ? (
        <p className="neo-copy mt-2 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[9px] font-black uppercase text-[#5b403f]">
          Shared catalog: {sharedError}
        </p>
      ) : null}
    </div>
  );
}

function ProviderGameIdHints({
  hints,
  onUse,
  provider,
  selectedValue,
}: {
  hints: ModProviderGameIdHint[];
  onUse: (value: string) => void;
  provider: "modio" | "curseforge";
  selectedValue: string;
}) {
  const hasUsableHint = hints.some((hint) => hint.action === "use");

  return (
    <div className="mt-2 border-2 border-black bg-[#f6edd8] p-2 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="neo-copy border-2 border-black bg-[#171411] px-2 py-0.5 text-[8px] font-black uppercase text-[#fff9ed]">
          ID Hints
        </span>
        <span
          className={`neo-copy border-2 border-black px-2 py-0.5 text-[8px] font-black uppercase ${
            hasUsableHint ? "bg-[#007166] text-white" : "bg-[#b7102a] text-white"
          }`}
        >
          {hasUsableHint ? providerLabel(provider) : "Manual ID"}
        </span>
      </div>

      {hints.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {hints.map((hint) =>
            hint.action === "use" ? (
              <button
                key={hint.id}
                className={`neo-copy max-w-full border-2 border-black px-2 py-1 text-left text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] ${
                  selectedValue === hint.value
                    ? "bg-[#007166] text-white"
                    : "bg-[#fff9ed] text-[#171411]"
                }`}
                title={hint.detail}
                type="button"
                onClick={() => onUse(hint.value)}
              >
                <span className="block">{hint.label}</span>
                <span className="block break-all">{hint.value}</span>
              </button>
            ) : (
              <span
                key={hint.id}
                className="neo-copy max-w-full border-2 border-black bg-[#efe6d4] px-2 py-1 text-[9px] font-black uppercase text-[#5b403f]"
                title={hint.detail}
              >
                <span className="block">{hint.label}</span>
                <span className="block break-all">{hint.value}</span>
              </span>
            ),
          )}
        </div>
      ) : (
        <p className="neo-copy mt-2 text-[9px] font-black uppercase text-[#5b403f]">
          Select a target game first.
        </p>
      )}
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
        <span className="neo-copy border-2 border-black bg-[#171411] px-2 py-0.5 text-[9px] font-black uppercase text-white">
          {providerLabel(entry.provider)}
        </span>
        {entry.author ? (
          <span className="neo-copy text-[9px] font-black uppercase text-[#5b403f]">
            {entry.author}
          </span>
        ) : null}
      </div>
      <h3 className="truncate text-sm font-black uppercase leading-tight">{entry.name}</h3>
      {entry.summary ? (
        <p className="neo-copy truncate text-[10px] font-bold uppercase text-[#5b403f]">
          {entry.summary}
        </p>
      ) : null}
      <button
        className="neo-copy mt-auto flex h-9 items-center justify-center gap-2 border-2 border-black bg-[#007166] px-3 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:opacity-50"
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

function NativeModSearchCard({
  disabled,
  onInstall,
  result,
}: {
  disabled: boolean;
  onInstall: () => void;
  result: NativeModSearchResult;
}) {
  const usesProviderApp = result.provider === "curseforge" && !result.downloadUrl;

  function openProviderPage() {
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <article className="flex flex-col gap-2 border-4 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex gap-3">
        {result.iconUrl ? (
          <img
            src={result.iconUrl}
            alt=""
            className="h-12 w-12 shrink-0 border-2 border-black object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-black bg-[#efe6d4]">
            <Download className="h-5 w-5 text-[#5b403f]" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="neo-copy border-2 border-black bg-[#171411] px-2 py-0.5 text-[8px] font-black uppercase text-[#fff9ed]">
              {providerLabel(result.provider)}
            </span>
            <span
              className={`neo-copy border-2 border-black px-2 py-0.5 text-[8px] font-black uppercase ${
                result.downloadUrl ? "bg-[#007166] text-white" : "bg-[#f6edd8] text-[#171411]"
              }`}
            >
              {result.downloadUrl ? "Native" : "Delegated"}
            </span>
            {usesProviderApp ? (
              <span className="neo-copy border-2 border-black bg-[#007166] px-2 py-0.5 text-[8px] font-black uppercase text-white">
                Overwolf
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 truncate text-sm font-black uppercase leading-tight">
            {result.name}
          </h3>
          {result.author ? (
            <p className="neo-copy text-[9px] font-black uppercase text-[#5b403f]">
              by {result.author}
            </p>
          ) : null}
        </div>
      </div>
      {result.summary ? (
        <p className="neo-copy line-clamp-2 text-[10px] font-bold uppercase text-[#5b403f]">
          {result.summary}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {result.downloads ? (
          <span className="neo-copy border-2 border-black bg-[#171411] px-2 py-0.5 text-[8px] font-black uppercase text-[#fff9ed]">
            {result.downloads} downloads
          </span>
        ) : null}
        {result.follows ? (
          <span className="neo-copy border-2 border-black bg-[#007166] px-2 py-0.5 text-[8px] font-black uppercase text-white">
            {result.follows} follows
          </span>
        ) : null}
        {result.latestVersion ? (
          <span className="neo-copy border-2 border-black bg-[#f6edd8] px-2 py-0.5 text-[8px] font-black uppercase text-[#171411]">
            v{result.latestVersion}
          </span>
        ) : null}
        {result.fileSizeBytes ? (
          <span className="neo-copy border-2 border-black bg-[#f6edd8] px-2 py-0.5 text-[8px] font-black uppercase text-[#171411]">
            {formatFileSize(result.fileSizeBytes)}
          </span>
        ) : null}
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2">
        <button
          className="neo-copy flex h-9 items-center justify-center gap-2 border-2 border-black bg-[#007166] px-3 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411] disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={onInstall}
          disabled={disabled}
          title={
            result.downloadUrl
              ? "Install through OG-Launcher"
              : usesProviderApp
                ? "Open the CurseForge/Overwolf handoff"
                : "Open provider installer"
          }
        >
          <Download className="h-3.5 w-3.5" />
          {usesProviderApp ? "Open App" : "Install"}
        </button>
        <button
          className="neo-copy flex h-9 items-center justify-center gap-2 border-2 border-black bg-[#b7102a] px-3 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411]"
          type="button"
          onClick={openProviderPage}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View
        </button>
      </div>
    </article>
  );
}

function NexusSearchCard({ result }: { result: NexusSearchResult }) {
  function openInBrowser() {
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <article className="flex flex-col gap-2 border-4 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex gap-3">
        {result.iconUrl ? (
          <img
            src={result.iconUrl}
            alt=""
            className="h-12 w-12 shrink-0 border-2 border-black object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-black bg-[#efe6d4]">
            <Download className="h-5 w-5 text-[#5b403f]" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-black uppercase leading-tight">{result.name}</h3>
          <p className="neo-copy text-[9px] font-black uppercase text-[#5b403f]">
            by {result.author}
          </p>
        </div>
      </div>
      {result.summary ? (
        <p className="neo-copy line-clamp-2 text-[10px] font-bold uppercase text-[#5b403f]">
          {result.summary}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {result.downloads ? (
          <span className="neo-copy border-2 border-black bg-[#171411] px-2 py-0.5 text-[8px] font-black uppercase text-[#fff9ed]">
            {result.downloads} downloads
          </span>
        ) : null}
        {result.endorsements ? (
          <span className="neo-copy border-2 border-black bg-[#007166] px-2 py-0.5 text-[8px] font-black uppercase text-white">
            {result.endorsements} endorsements
          </span>
        ) : null}
      </div>
      <button
        className="neo-copy mt-auto flex h-9 items-center justify-center gap-2 border-2 border-black bg-[#b7102a] px-3 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#171411]"
        type="button"
        onClick={openInBrowser}
      >
        <ExternalLink className="h-3.5 w-3.5" />
        View on Nexus
      </button>
    </article>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="neo-copy border-2 border-dashed border-black bg-[#fff9ed] p-5 text-center text-[10px] font-black uppercase text-[#5b403f]">
      {label}
    </div>
  );
}
