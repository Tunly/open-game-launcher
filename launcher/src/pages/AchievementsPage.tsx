import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Award, Gamepad2, Loader2, RefreshCw, Search, Settings, Trophy } from "lucide-react";

import { getGameAssetUrl } from "../lib/assets";
import { AchievementCacheReadinessPanel } from "../components/achievements/AchievementCacheReadinessPanel";
import { AchievementHostedHydrationContractPanel } from "../components/achievements/AchievementHostedHydrationContractPanel";
import {
  getGameIconCandidates,
  formatLastPlayed,
  formatPlayTime,
  getSourceDisplayLabel,
  normalizeLauncherKey,
} from "../lib/formatters";
import { createVerifyAchievementCacheReadiness } from "../lib/achievement-cache-readiness";
import { createVerifyAchievementHostedHydrationContract } from "../lib/achievement-hosted-hydration-contract";
import { groupGames, type GameGroup } from "../lib/game-groups";
import { listInstalledGames } from "../lib/launcher";
import { hydrateGamesWithRemoteAchievements } from "../lib/supabase/achievements";
import { runProviderInventory } from "../library/providers";
import type { Game } from "../lib/types";
import { AchievementViewerModal } from "../components/library/AchievementViewerModal";
import { PlatformSourceIcon } from "../components/library/PlatformIcons";
import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  getAchievementProviderDisplayName,
  getAchievementProviderStatusLabel,
  getAchievementProviderStatusMessage,
} from "../lib/achievement-status";
import {
  hasPendingAchievementArchiveSync,
  syncAchievementArchiveGames,
} from "../lib/achievement-archive-sync";
import { calculateSteamAverageGameCompletionRate } from "../lib/achievement-completion";
import {
  buildAchievementRow,
  formatDate,
  parseTime,
  type GameAchievementRow,
} from "../lib/achievement-row";

type GameTab = "recent" | "all" | "perfect" | "unfinished";
type GameSort = "lastPlayed" | "playtime" | "name" | "completion";

const TABS: { key: GameTab; label: string }[] = [
  { key: "recent", label: "Recently Played" },
  { key: "all", label: "All Games" },
  { key: "perfect", label: "Perfect Games" },
  { key: "unfinished", label: "Unfinished" },
];

const SORTS: { key: GameSort; label: string }[] = [
  { key: "lastPlayed", label: "Last Played" },
  { key: "playtime", label: "Playtime" },
  { key: "name", label: "Name" },
  { key: "completion", label: "Achievement Completion" },
];

const ACHIEVEMENT_ARCHIVE_REFRESH_TIMEOUT_MS = 15_000;

function startAchievementArchiveRefreshWatchdog(operationLabel: string, onTimeout: () => void) {
  return globalThis.setTimeout(() => {
    console.warn(
      `[OG-Launcher] ${operationLabel} is still running after ${ACHIEVEMENT_ARCHIVE_REFRESH_TIMEOUT_MS / 1_000} seconds; hiding the busy indicator while local archive data remains available.`,
    );
    onTimeout();
  }, ACHIEVEMENT_ARCHIVE_REFRESH_TIMEOUT_MS);
}

function gameMatchesSearch(row: GameAchievementRow, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return (
    row.group.title.toLowerCase().includes(normalized) ||
    row.group.sources.some((source) => source.toLowerCase().includes(normalized)) ||
    row.group.achievements.some(
      (achievement) =>
        achievement.name.toLowerCase().includes(normalized) ||
        achievement.description?.toLowerCase().includes(normalized),
    )
  );
}

function SourceBadges({ group }: { group: GameGroup }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {group.variants.slice(0, 5).map((variant) => (
        <span
          key={variant.id}
          className="grid h-6 w-6 place-items-center border-2 border-black bg-[#fbf4e7] text-[#171411] shadow-[1px_1px_0_#171411]"
          title={getSourceDisplayLabel(variant.launcher ?? variant.title)}
        >
          <PlatformSourceIcon game={variant} className="h-3.5 w-3.5" />
        </span>
      ))}
    </div>
  );
}

function providerStatusClass(status: string, stability: string) {
  if (status === "available") {
    return "bg-[#087d6d] text-white";
  }
  if (stability === "unofficial") {
    return "bg-[#fbf4e7] text-[#b7102a]";
  }
  if (status === "failed" || status === "private") {
    return "bg-[#b7102a] text-white";
  }
  return "bg-[#fbf4e7] text-[#55504a]";
}

function ProviderStatusBadges({ group }: { group: GameGroup }) {
  const statuses = group.achievementProviderStatuses ?? [];
  if (statuses.length === 0) {
    return null;
  }
  const hasAchievements = (group.achievements ?? []).length > 0;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <span className="neo-copy text-[9px] font-black text-[#5b403f] uppercase">Providers</span>
      {statuses.map((provider) => (
        <span
          key={provider.source}
          className={`neo-copy border-2 border-black px-1.5 py-0.5 text-[8px] font-black uppercase ${
            provider.status === "available"
              ? "bg-[#087d6d] text-white"
              : hasAchievements && (provider.status === "failed" || provider.status === "private")
                ? "bg-[#fbf4e7] text-[#55504a]"
                : providerStatusClass(provider.status, provider.stability)
          }`}
          title={getAchievementProviderStatusMessage(provider)}
        >
          {getAchievementProviderStatusLabel(provider, hasAchievements)}
        </span>
      ))}
    </div>
  );
}

function ArtworkPanel({ group }: { group: GameGroup }) {
  // Cover first, then icon/logo candidates, so every row gets a usable image
  // even when the preferred art is missing or fails to load.
  const candidates = useMemo(
    () =>
      [group.primaryGame.coverUrl, ...getGameIconCandidates(group.primaryGame)].filter(
        (url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index,
      ),
    [group.primaryGame],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const imageUrl = getGameAssetUrl(candidates[candidateIndex]);
  const isCover = candidateIndex === 0 && Boolean(group.primaryGame.coverUrl);

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidates]);

  return (
    <div className="relative aspect-video w-full overflow-hidden border-[3px] border-black bg-[#171411]">
      {imageUrl ? (
        <img
          alt=""
          className={`h-full w-full ${isCover ? "object-cover" : "object-contain p-2"}`}
          decoding="async"
          loading="lazy"
          src={imageUrl}
          onError={() =>
            setCandidateIndex((current) =>
              current + 1 >= candidates.length ? candidates.length : current + 1,
            )
          }
        />
      ) : (
        <div className="grid h-full place-items-center bg-[#171411] text-[#fbf4e7]">
          <Gamepad2 className="h-9 w-9" />
        </div>
      )}
      <div className="neo-dots absolute inset-0 opacity-20" />
      <div className="absolute right-0 bottom-0 left-0 border-t-2 border-black bg-[#171411]/80 px-2 py-1">
        <SourceBadges group={group} />
      </div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-3 border-2 border-black bg-[#fbf4e7]">
      <div
        className="h-full bg-[#087d6d]"
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}

function GameRow({
  row,
  onViewFullList,
}: {
  row: GameAchievementRow;
  onViewFullList: (row: GameAchievementRow) => void;
}) {
  const { group, total, unlocked, completion, isPerfect, recentAchievements } = row;
  const attentionStatus = group.achievementProviderStatuses?.find(
    (provider) => provider.status !== "available",
  );
  const libraryGameId = group.achievementBasisGameId ?? group.primaryGame.id;
  const actionLabel = attentionStatus?.status === "failed" ? "Retry in Library" : "Open in Library";
  const attentionMessage = attentionStatus
    ? getAchievementProviderStatusMessage(attentionStatus)
    : null;
  const attentionProviderLabel = attentionStatus
    ? getAchievementProviderDisplayName(attentionStatus.source)
    : "Achievement";
  const hasAchievementData = group.achievements.length > 0;
  const achievementProgressLabel =
    total > 0 ? `${unlocked}/${total}` : attentionStatus ? "Unavailable" : "Not synced";

  return (
    <article className="border-4 border-black bg-[#f6edd8] shadow-[5px_5px_0_#171411]">
      <div className="grid gap-3 p-2 md:grid-cols-[280px_minmax(0,1fr)]">
        <ArtworkPanel group={group} />

        <div className="min-w-0 py-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-[18px] leading-tight font-black text-[#171411]">
                {group.title}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {isPerfect ? (
                  <span className="neo-copy border-2 border-black bg-[#087d6d] px-2 py-0.5 text-[9px] font-black text-white uppercase shadow-[1px_1px_0_#171411]">
                    Perfect
                  </span>
                ) : null}
                <span className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-0.5 text-[9px] font-black uppercase">
                  {group.variants.length} variant{group.variants.length === 1 ? "" : "s"}
                </span>
                {group.achievementBasisSource ? (
                  <span className="neo-copy border-2 border-black bg-[#171411] px-2 py-0.5 text-[9px] font-black text-[#fbf4e7] uppercase">
                    Basis: {getSourceDisplayLabel(group.achievementBasisSource)}
                  </span>
                ) : null}
              </div>
              <ProviderStatusBadges group={group} />
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[90px_90px_minmax(160px,1fr)]">
            <div>
              <p className="neo-copy text-[10px] font-black text-[#5b403f] uppercase">
                Total Played
              </p>
              <p className="text-[12px] font-black text-[#171411]">
                {formatPlayTime(group.playtimeMinutes)}
              </p>
            </div>
            <div>
              <p className="neo-copy text-[10px] font-black text-[#5b403f] uppercase">
                Last Played
              </p>
              <p className="text-[12px] font-black text-[#171411]">
                {formatLastPlayed(
                  group.lastPlayedAt ??
                    group.primaryGame.lastPlayedAt ??
                    group.primaryGame.lastPlayed,
                )}
              </p>
            </div>
            <div className="min-w-0">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="neo-copy text-[10px] font-black text-[#5b403f] uppercase">
                  Achievements
                </p>
                <p className="neo-copy text-[10px] font-black text-[#171411] uppercase">
                  {achievementProgressLabel}
                </p>
              </div>
              <ProgressBar value={completion} />
            </div>
          </div>

          {recentAchievements.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {recentAchievements.map((achievement) => (
                <span
                  key={achievement.id}
                  className="neo-copy inline-flex max-w-full items-center gap-1.5 border-2 border-black bg-[#efe6d4] px-2 py-1 text-[9px] font-black uppercase"
                  title={`${achievement.name} - ${formatDate(achievement.unlockedAt)}`}
                >
                  <Award className="h-3.5 w-3.5 text-[#087d6d]" />
                  <span className="truncate">{achievement.name}</span>
                </span>
              ))}
            </div>
          ) : null}

          {total === 0 || (attentionStatus && !hasAchievementData) ? (
            <div
              aria-label={`${attentionProviderLabel} achievement sync unavailable`}
              className="mt-3 grid gap-2 border-2 border-black bg-[#fbf4e7] px-2 py-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
              role="status"
            >
              <p className="neo-copy min-w-0 text-[9px] leading-4 font-black [overflow-wrap:anywhere] text-[#5b403f] uppercase">
                {attentionMessage ?? "No achievements have been synced for this game yet."}
              </p>
              <Link
                className="neo-copy shrink-0 justify-self-start border-2 border-black bg-[#b7102a] px-2 py-1 text-[9px] font-black text-white uppercase shadow-[2px_2px_0_#171411] hover:-translate-y-0.5 sm:justify-self-end"
                to={`/library?game=${encodeURIComponent(libraryGameId)}`}
              >
                {actionLabel}
              </Link>
            </div>
          ) : (
            <button
              className="neo-copy mt-3 inline-flex border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black text-[#fbf4e7] uppercase transition-colors hover:bg-[#2b2722]"
              onClick={() => onViewFullList(row)}
              type="button"
            >
              View Full List
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

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
    <div
      className={`min-w-[92px] border-[3px] border-black p-3 shadow-[3px_3px_0_#171411] ${toneClass}`}
    >
      <p className="neo-title text-2xl leading-none">{value}</p>
      <p className="neo-copy mt-1 text-[9px] font-black tracking-[0.12em] uppercase">{label}</p>
    </div>
  );
}

export function AchievementsPage() {
  const { isLoading: isAuthLoading, user } = useCurrentUser();
  const [searchParams] = useSearchParams();
  const verifyMode = searchParams.get("verify");
  const isAchievementCacheReadinessVerify = verifyMode === "achievement-cache-readiness";
  const isAchievementHostedHydrationContractVerify =
    verifyMode === "achievement-hosted-hydration-contract";
  const shouldSkipRemoteHydration =
    isAchievementCacheReadinessVerify || isAchievementHostedHydrationContractVerify;
  const [localGames, setLocalGames] = useState<Game[] | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProviderSyncing, setIsProviderSyncing] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerWarning, setProviderWarning] = useState<string | null>(null);
  const [hydrationWarning, setHydrationWarning] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [activeTab, setActiveTab] = useState<GameTab>("all");
  const [sortMode, setSortMode] = useState<GameSort>("completion");
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [achievementViewerRow, setAchievementViewerRow] = useState<GameAchievementRow | null>(null);

  useEffect(() => {
    let mounted = true;
    let providerRefreshWatchdog: ReturnType<typeof globalThis.setTimeout> | null = null;
    setLocalGames(null);
    setGames([]);
    setError(null);
    setProviderWarning(null);
    setHydrationWarning(null);
    setStatusMessage(null);
    setIsLoading(true);
    setIsProviderSyncing(false);
    void (async () => {
      try {
        const listedGames = await listInstalledGames().catch((err) => {
          if (shouldSkipRemoteHydration) {
            console.warn("[OG-Launcher] Achievement verify route using empty local list:", err);
            return [];
          }
          throw err;
        });
        let allGames = listedGames.map((game) => {
          const launcher = normalizeLauncherKey(game.launcher, game.id);
          return launcher === game.launcher ? game : { ...game, launcher };
        });

        // Show the native/local achievement archive as soon as the desktop list is
        // available. Provider inventory enrichment can continue in the background
        // without blocking the first useful render of this page.
        if (mounted) {
          setGames(allGames);
          setIsLoading(false);
        }

        if (!shouldSkipRemoteHydration) {
          const providerContext = {
            forceRefresh: false,
            setStatusMessage,
            shouldApplyResult: () => mounted,
          };
          try {
            const inventory = await runProviderInventory(allGames, providerContext);
            if (mounted) {
              for (const warning of inventory.warnings) {
                console.warn(warning);
              }
              if (inventory.statusMessage) {
                setStatusMessage(inventory.statusMessage);
              }
              allGames = inventory.games;
            }
          } catch (err) {
            console.warn("[OG-Launcher] Achievement inventory provider skipped:", err);
          }
        }

        if (mounted) {
          // Keep the provider-enriched list as the hydration source once the
          // background inventory pass has completed.
          setLocalGames(allGames);
          setGames(allGames);
        }

        if (!shouldSkipRemoteHydration && hasPendingAchievementArchiveSync(allGames) && mounted) {
          setIsProviderSyncing(true);
          providerRefreshWatchdog = startAchievementArchiveRefreshWatchdog(
            "Provider achievement refresh",
            () => {
              if (mounted) setIsProviderSyncing(false);
            },
          );
          void syncAchievementArchiveGames(allGames)
            .then((syncedGames) => {
              if (mounted) {
                setLocalGames(syncedGames);
                setGames(syncedGames);
              }
            })
            .catch((err) => {
              console.warn("[OG-Launcher] Achievement provider refresh skipped:", err);
              if (mounted) {
                setProviderWarning(
                  "Provider achievements could not be refreshed. Local archive data is still available.",
                );
              }
            })
            .finally(() => {
              if (providerRefreshWatchdog !== null) {
                globalThis.clearTimeout(providerRefreshWatchdog);
                providerRefreshWatchdog = null;
              }
              if (mounted) setIsProviderSyncing(false);
            });
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
      if (providerRefreshWatchdog !== null) {
        globalThis.clearTimeout(providerRefreshWatchdog);
      }
    };
  }, [loadAttempt, shouldSkipRemoteHydration]);

  useEffect(() => {
    if (!localGames) {
      setIsHydrating(false);
      return;
    }

    setGames(localGames);
    const userId = user?.id ?? null;
    if (shouldSkipRemoteHydration || isAuthLoading || localGames.length === 0) {
      setIsHydrating(false);
      return;
    }

    let mounted = true;
    setHydrationWarning(null);
    setIsHydrating(true);
    const hydrationRefreshWatchdog = startAchievementArchiveRefreshWatchdog(
      "Cloud achievement refresh",
      () => {
        if (mounted) setIsHydrating(false);
      },
    );
    void hydrateGamesWithRemoteAchievements(localGames, {
      onError: () => {
        if (mounted) {
          setHydrationWarning(
            "Cloud achievements could not be refreshed. Showing the latest local archive data.",
          );
        }
      },
      userId,
    })
      .then((hydratedGames) => {
        if (mounted) setGames(hydratedGames);
      })
      .catch((err) => {
        console.warn("[OG-Launcher] Remote achievement hydration skipped:", err);
        if (mounted) {
          setHydrationWarning(
            "Cloud achievements could not be refreshed. Showing the latest local archive data.",
          );
        }
      })
      .finally(() => {
        globalThis.clearTimeout(hydrationRefreshWatchdog);
        if (mounted) setIsHydrating(false);
      });

    return () => {
      mounted = false;
      globalThis.clearTimeout(hydrationRefreshWatchdog);
    };
  }, [isAuthLoading, localGames, shouldSkipRemoteHydration, user?.id]);

  const rows = useMemo(
    () =>
      groupGames(games)
        .filter(
          (group) =>
            group.achievements.length > 0 ||
            group.sources.some((source) =>
              ["steam", "xbox", "gog", "epic", "ea", "ubisoft", "battlenet"].includes(
                source.toLowerCase(),
              ),
            ),
        )
        .map(buildAchievementRow),
    [games],
  );

  const stats = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const unlocked = rows.reduce((sum, row) => sum + row.unlocked, 0);
    const perfect = rows.filter((row) => row.isPerfect).length;
    const pct = calculateSteamAverageGameCompletionRate(rows);
    return { total, unlocked, perfect, pct };
  }, [rows]);

  const sourceFilters = useMemo(
    () =>
      Array.from(
        new Set(
          rows.flatMap((row) => [
            ...row.group.sources,
            ...row.group.achievements.flatMap((achievement) => achievement.sourceLabels),
          ]),
        ),
      ).sort(),
    [rows],
  );

  const tabCounts = useMemo(
    () => ({
      recent: rows.filter((row) => parseTime(row.group.lastPlayedAt) > Number.NEGATIVE_INFINITY)
        .length,
      all: rows.length,
      perfect: rows.filter((row) => row.isPerfect).length,
      unfinished: rows.filter((row) => row.total > 0 && !row.isPerfect).length,
    }),
    [rows],
  );

  const visibleRows = useMemo(() => {
    let next = rows.filter((row) => gameMatchesSearch(row, searchQuery));

    if (sourceFilter !== "all") {
      next = next.filter(
        (row) =>
          row.group.sources.includes(sourceFilter) ||
          row.group.achievements.some((achievement) =>
            achievement.sourceLabels.includes(sourceFilter),
          ),
      );
    }

    if (activeTab === "recent") {
      next = next.filter((row) => parseTime(row.group.lastPlayedAt) > Number.NEGATIVE_INFINITY);
    } else if (activeTab === "perfect") {
      next = next.filter((row) => row.isPerfect);
    } else if (activeTab === "unfinished") {
      next = next.filter((row) => row.total > 0 && !row.isPerfect);
    }

    next = [...next];
    if (sortMode === "name") {
      next.sort((left, right) => left.group.title.localeCompare(right.group.title));
    } else if (sortMode === "lastPlayed") {
      next.sort((left, right) => {
        const leftTime = parseTime(left.group.lastPlayedAt);
        const rightTime = parseTime(right.group.lastPlayedAt);
        return leftTime === rightTime
          ? left.group.title.localeCompare(right.group.title)
          : rightTime - leftTime;
      });
    } else if (sortMode === "playtime") {
      next.sort(
        (left, right) =>
          right.group.playtimeMinutes - left.group.playtimeMinutes ||
          left.group.title.localeCompare(right.group.title),
      );
    } else {
      next.sort(
        (left, right) =>
          right.completion - left.completion ||
          right.unlocked - left.unlocked ||
          left.group.title.localeCompare(right.group.title),
      );
    }

    return next;
  }, [activeTab, rows, searchQuery, sortMode, sourceFilter]);

  if (error) {
    return (
      <section aria-labelledby="achievements-heading" className="neo-dots space-y-6">
        <h1 className="sr-only" id="achievements-heading">
          Achievements
        </h1>
        <div
          className="border-4 border-[#b7102a] bg-[#f5d6d9] p-4 text-sm font-bold text-[#77101f] shadow-[4px_4px_0_#171411]"
          role="alert"
        >
          <p>Failed to load achievements: {error}</p>
          <button
            className="neo-copy mt-3 inline-flex items-center gap-2 border-2 border-black bg-[#b7102a] px-3 py-2 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#171411] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#087d6d]"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            type="button"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry loading achievements
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="achievements-heading" className="neo-dots space-y-5">
      <h1 className="sr-only" id="achievements-heading">
        Achievements
      </h1>
      <div className="mx-auto max-w-[980px] border-4 border-black bg-[#fbf4e7] shadow-[6px_6px_0_#171411]">
        <div className="flex flex-wrap gap-2 border-b-4 border-black bg-[#171411] px-4 py-3 text-[#fbf4e7]">
          <div className="flex flex-wrap gap-2">
            <StatCard label="Total" value={stats.total} tone="paper" />
            <StatCard label="Unlocked" value={stats.unlocked} tone="teal" />
            <StatCard label="Perfect" value={stats.perfect} tone="red" />
            <StatCard label="Avg. Complete" value={`${stats.pct}%`} tone="ink" />
          </div>
        </div>

        {statusMessage ? (
          <div
            aria-live="polite"
            className="neo-copy border-b-4 border-black bg-[#087d6d] px-4 py-2 text-[10px] font-black text-white uppercase"
            role="status"
          >
            {statusMessage}
          </div>
        ) : null}

        {providerWarning || hydrationWarning ? (
          <div
            className="grid gap-2 border-b-4 border-black bg-[#f5d6d9] px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            role="alert"
          >
            <p className="neo-copy text-[10px] leading-4 font-black text-[#77101f] uppercase">
              {[providerWarning, hydrationWarning].filter(Boolean).join(" ")}
            </p>
            <button
              className="neo-copy inline-flex items-center gap-2 justify-self-start border-2 border-black bg-[#b7102a] px-3 py-1.5 text-[9px] font-black text-white uppercase shadow-[2px_2px_0_#171411] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#087d6d] sm:justify-self-end"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              type="button"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry archive update
            </button>
          </div>
        ) : null}

        {isHydrating || isProviderSyncing ? (
          <div
            aria-label="Refreshing achievement archive"
            aria-live="polite"
            className="neo-copy flex items-center gap-2 border-b-4 border-black bg-[#8cf5e4] px-4 py-2 text-[10px] font-black text-[#171411] uppercase"
            role="status"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Achievement archive updating / Local games ready
          </div>
        ) : null}

        <div className="border-b-4 border-black bg-[#f6edd8] px-4 pt-3">
          <div aria-label="Achievement game views" className="flex flex-wrap gap-4" role="group">
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setActiveTab(tab.key);
                    if (tab.key === "recent") setSortMode("lastPlayed");
                  }}
                  className={`neo-copy border-b-4 px-1 pb-2 text-[11px] font-black uppercase transition ${
                    active
                      ? "border-[#087d6d] text-[#087d6d]"
                      : "border-transparent text-[#5b403f] hover:text-[#171411]"
                  }`}
                >
                  {tab.label} ({tabCounts[tab.key]})
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 border-b-4 border-black bg-[#efe6d4] p-3 md:grid-cols-[minmax(220px,1fr)_auto]">
          <label className="flex h-10 min-w-0 items-center gap-2 border-[3px] border-black bg-[#fbf4e7] px-3 shadow-[2px_2px_0_#171411] focus-within:outline-4 focus-within:outline-offset-2 focus-within:outline-[#087d6d]">
            <Search className="h-4 w-4 text-[#5b403f]" />
            <input
              className="neo-copy min-w-0 flex-1 bg-transparent text-[12px] font-black text-[#171411] uppercase outline-none placeholder:text-[#655f58]"
              aria-label="Search achievement games"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Find a game"
              type="search"
            />
          </label>

          <div
            aria-label="Sort achievement games"
            className="flex flex-wrap items-center gap-2"
            role="group"
          >
            <Settings className="h-4 w-4 text-[#5b403f]" />
            {SORTS.map((sort) => (
              <button
                key={sort.key}
                type="button"
                aria-pressed={sortMode === sort.key}
                onClick={() => setSortMode(sort.key)}
                className={`neo-copy border-2 border-black px-2 py-1 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] ${
                  sortMode === sort.key ? "bg-[#087d6d] text-white" : "bg-[#fbf4e7] text-[#171411]"
                }`}
              >
                {sort.label}
              </button>
            ))}
          </div>
          <div
            aria-label="Filter achievement games by source"
            className="flex flex-wrap items-center gap-2 md:col-span-2"
            role="group"
          >
            <span className="neo-copy text-[10px] font-black text-[#5b403f] uppercase">Source</span>
            {["all", ...sourceFilters].map((source) => (
              <button
                key={source}
                type="button"
                aria-pressed={sourceFilter === source}
                onClick={() => setSourceFilter(source)}
                className={`neo-copy border-2 border-black px-2 py-1 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] ${
                  sourceFilter === source
                    ? "bg-[#b7102a] text-white"
                    : "bg-[#fbf4e7] text-[#171411]"
                }`}
              >
                {source === "all" ? "All" : getSourceDisplayLabel(source)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isAchievementCacheReadinessVerify ? (
        <AchievementCacheReadinessPanel readiness={createVerifyAchievementCacheReadiness()} />
      ) : null}

      {isAchievementHostedHydrationContractVerify ? (
        <AchievementHostedHydrationContractPanel
          contract={createVerifyAchievementHostedHydrationContract()}
        />
      ) : null}

      <div className="mx-auto max-w-[980px] space-y-3">
        {isLoading ? (
          <div
            aria-label="Loading local achievement games"
            className="grid min-h-[260px] place-items-center border-4 border-black bg-[#fbf4e7] shadow-[5px_5px_0_#171411]"
            role="status"
          >
            <Loader2 className="h-9 w-9 animate-spin text-[#5b403f]" />
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="grid min-h-[260px] place-items-center border-4 border-black bg-[#fbf4e7] p-6 text-center shadow-[5px_5px_0_#171411]">
            <div>
              <Trophy className="mx-auto h-14 w-14 text-[#5b403f]" />
              <p className="neo-copy mt-3 text-[13px] font-black text-[#5b403f] uppercase">
                {rows.length === 0
                  ? "No achievement-enabled games found."
                  : "No games match this filter."}
              </p>
            </div>
          </div>
        ) : (
          visibleRows.map((row) => (
            <GameRow key={row.group.id} row={row} onViewFullList={setAchievementViewerRow} />
          ))
        )}
      </div>

      {achievementViewerRow ? (
        <AchievementViewerModal
          achievements={achievementViewerRow.group.achievements}
          completionAchievements={achievementViewerRow.group.achievements.filter(
            (achievement) => !achievement.isAdditional,
          )}
          gameTitle={achievementViewerRow.group.title}
          onClose={() => setAchievementViewerRow(null)}
        />
      ) : null}
    </section>
  );
}
