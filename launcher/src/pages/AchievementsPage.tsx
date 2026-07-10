import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Award, FolderOpen, Gamepad2, Loader2, Search, Settings, Trophy } from "lucide-react";

import { getGameAssetUrl, getGameBannerStyle } from "../lib/assets";
import { AchievementCacheReadinessPanel } from "../components/achievements/AchievementCacheReadinessPanel";
import { AchievementHostedHydrationContractPanel } from "../components/achievements/AchievementHostedHydrationContractPanel";
import {
  getErrorMessage,
  getGameIconCandidates,
  formatLastPlayed,
  formatPlayTime,
  normalizeLauncherKey,
} from "../lib/formatters";
import { createVerifyAchievementCacheReadiness } from "../lib/achievement-cache-readiness";
import { createVerifyAchievementHostedHydrationContract } from "../lib/achievement-hosted-hydration-contract";
import { groupGames, type GameGroup, type GroupedAchievement } from "../lib/game-groups";
import { listInstalledGames, openAchievementCacheFolder } from "../lib/launcher";
import { hydrateGamesWithRemoteAchievements } from "../lib/supabase/achievements";
import type { Game } from "../lib/types";
import { PlatformSourceIcon } from "../components/library/PlatformIcons";
import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  getAchievementProviderDisplayName,
  getAchievementProviderStatusMessage,
} from "../lib/achievement-status";
import {
  hasPendingAchievementArchiveSync,
  syncAchievementArchiveGames,
} from "../lib/achievement-archive-sync";

type GameTab = "recent" | "all" | "perfect" | "unfinished";
type GameSort = "playtime" | "name" | "completion";

type GameAchievementRow = {
  group: GameGroup;
  total: number;
  unlocked: number;
  completion: number;
  lastUnlockedAt: string | null;
  recentAchievements: GroupedAchievement[];
};

const TABS: { key: GameTab; label: string }[] = [
  { key: "recent", label: "Recently Played" },
  { key: "all", label: "All Games" },
  { key: "perfect", label: "Perfect Games" },
  { key: "unfinished", label: "Unfinished" },
];

const SORTS: { key: GameSort; label: string }[] = [
  { key: "playtime", label: "Playtime" },
  { key: "name", label: "Name" },
  { key: "completion", label: "Achievement Completion" },
];

function parseTime(value?: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function formatDate(value?: string | null): string {
  if (!value) return "Never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}

function readPlayerLabel(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildRow(group: GameGroup): GameAchievementRow {
  const achievements = group.achievements;
  const total = achievements.length;
  const unlocked = achievements.filter((achievement) => achievement.unlockedAt).length;
  const completion = total > 0 ? Math.round((unlocked / total) * 100) : 0;
  const lastUnlockedAt = achievements.reduce<string | null>((latest, achievement) => {
    if (!achievement.unlockedAt) return latest;
    return parseTime(achievement.unlockedAt) > parseTime(latest) ? achievement.unlockedAt : latest;
  }, null);
  const recentAchievements = [...achievements]
    .filter((achievement) => achievement.unlockedAt)
    .sort((left, right) => parseTime(right.unlockedAt) - parseTime(left.unlockedAt))
    .slice(0, 3);

  return {
    group,
    total,
    unlocked,
    completion,
    lastUnlockedAt,
    recentAchievements,
  };
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

function getRowArtworkStyle(group: GameGroup) {
  return getGameBannerStyle(group.primaryGame.coverUrl, {
    backgroundPosition: "center",
    backgroundSize: "cover",
  });
}

function SourceBadges({ group }: { group: GameGroup }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {group.variants.slice(0, 5).map((variant) => (
        <span
          key={variant.id}
          className="grid h-6 w-6 place-items-center border-2 border-black bg-[#fbf4e7] text-[#171411] shadow-[1px_1px_0_#171411]"
          title={variant.launcher ?? variant.title}
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

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <span className="neo-copy text-[9px] font-black text-[#5b403f] uppercase">Providers</span>
      {statuses.map((provider) => (
        <span
          key={provider.source}
          className={`neo-copy border-2 border-black px-1.5 py-0.5 text-[8px] font-black uppercase ${providerStatusClass(
            provider.status,
            provider.stability,
          )}`}
          title={getAchievementProviderStatusMessage(provider)}
        >
          {provider.source}: {provider.status}
        </span>
      ))}
    </div>
  );
}

function ArtworkPanel({ group }: { group: GameGroup }) {
  const iconCandidate = getGameIconCandidates(group.primaryGame).map(getGameAssetUrl).find(Boolean);

  return (
    <div
      className="relative h-[92px] min-h-[92px] overflow-hidden border-[3px] border-black bg-[#171411]"
      style={getRowArtworkStyle(group)}
    >
      {!group.primaryGame.coverUrl ? (
        <div className="grid h-full place-items-center bg-[#171411] text-[#fbf4e7]">
          {iconCandidate ? (
            <img alt="" className="h-full w-full object-cover" src={iconCandidate} />
          ) : (
            <Gamepad2 className="h-9 w-9" />
          )}
        </div>
      ) : null}
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

function GameRow({ row }: { row: GameAchievementRow }) {
  const { group, total, unlocked, completion, recentAchievements } = row;
  const isPerfect = total > 0 && unlocked === total;
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
                    Basis: {group.achievementBasisSource}
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

          {total === 0 || attentionStatus ? (
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
            <Link
              className="neo-copy mt-3 inline-flex border-2 border-black bg-[#171411] px-2 py-1 text-[9px] font-black text-[#fbf4e7] uppercase shadow-[2px_2px_0_#171411] hover:-translate-y-0.5"
              to={`/library?game=${encodeURIComponent(libraryGameId)}`}
            >
              View Full List
            </Link>
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
  const [activeTab, setActiveTab] = useState<GameTab>("all");
  const [sortMode, setSortMode] = useState<GameSort>("completion");
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const playerLabel =
    readPlayerLabel(user?.user_metadata.display_name) ??
    readPlayerLabel(user?.user_metadata.full_name) ??
    readPlayerLabel(user?.user_metadata.username) ??
    readPlayerLabel(user?.email?.split("@", 1)[0]) ??
    "Local Player";

  useEffect(() => {
    let mounted = true;
    setLocalGames(null);
    setGames([]);
    setError(null);
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
        const allGames = listedGames.map((game) => {
          const launcher = normalizeLauncherKey(game.launcher, game.id);
          return launcher === game.launcher ? game : { ...game, launcher };
        });
        if (mounted) {
          setLocalGames(allGames);
          setGames(allGames);
        }

        if (!shouldSkipRemoteHydration && hasPendingAchievementArchiveSync(allGames) && mounted) {
          setIsProviderSyncing(true);
          void syncAchievementArchiveGames(allGames)
            .then((syncedGames) => {
              if (mounted) {
                setLocalGames(syncedGames);
                setGames(syncedGames);
              }
            })
            .catch((err) => {
              console.warn("[OG-Launcher] Achievement provider refresh skipped:", err);
            })
            .finally(() => {
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
    };
  }, [shouldSkipRemoteHydration]);

  useEffect(() => {
    if (!localGames) {
      setIsHydrating(false);
      return;
    }

    setGames(localGames);
    const userId = user?.id ?? null;
    if (shouldSkipRemoteHydration || isAuthLoading || !userId || localGames.length === 0) {
      setIsHydrating(false);
      return;
    }

    let mounted = true;
    setIsHydrating(true);
    void hydrateGamesWithRemoteAchievements(localGames, { userId })
      .then((hydratedGames) => {
        if (mounted) setGames(hydratedGames);
      })
      .catch((err) => {
        console.warn("[OG-Launcher] Remote achievement hydration skipped:", err);
      })
      .finally(() => {
        if (mounted) setIsHydrating(false);
      });

    return () => {
      mounted = false;
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
        .map(buildRow),
    [games],
  );

  const stats = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const unlocked = rows.reduce((sum, row) => sum + row.unlocked, 0);
    const perfect = rows.filter((row) => row.total > 0 && row.total === row.unlocked).length;
    const pct = total > 0 ? Math.round((unlocked / total) * 100) : 0;
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
      perfect: rows.filter((row) => row.total > 0 && row.total === row.unlocked).length,
      unfinished: rows.filter((row) => row.unlocked < row.total).length,
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
      next = next.filter((row) => row.total > 0 && row.total === row.unlocked);
    } else if (activeTab === "unfinished") {
      next = next.filter((row) => row.unlocked < row.total);
    }

    next = [...next];
    if (sortMode === "name") {
      next.sort((left, right) => left.group.title.localeCompare(right.group.title));
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

  const handleOpenAchievementCacheFolder = async () => {
    try {
      const folder = await openAchievementCacheFolder();
      setStatusMessage(`Achievement cache folder opened: ${folder}`);
    } catch (err) {
      setStatusMessage(`Could not open achievement cache folder: ${getErrorMessage(err)}`);
    }
  };

  if (error) {
    return (
      <section className="neo-dots space-y-6">
        <div className="border-4 border-[#b7102a] bg-[#f5d6d9] p-4 text-sm font-bold text-[#77101f] shadow-[4px_4px_0_#171411]">
          Failed to load achievements: {error}
        </div>
      </section>
    );
  }

  return (
    <section className="neo-dots space-y-5">
      <div className="mx-auto max-w-[980px] border-4 border-black bg-[#fbf4e7] shadow-[6px_6px_0_#171411]">
        <div className="flex flex-wrap items-center gap-4 border-b-4 border-black bg-[#171411] px-4 py-3 text-[#fbf4e7]">
          <div className="grid h-14 w-14 place-items-center border-[3px] border-black bg-[#c20b2f] text-white shadow-[3px_3px_0_#000]">
            <Trophy className="h-8 w-8" />
          </div>
          <div className="min-w-0">
            <p className="neo-copy text-[10px] font-black tracking-[0.14em] text-[#8cf5e4] uppercase">
              Player Archive
            </p>
            <h1 className="neo-title truncate text-4xl leading-none">
              {playerLabel} <span className="text-xl text-[#8cf5e4]">/ Games</span>
            </h1>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void handleOpenAchievementCacheFolder();
              }}
              className="neo-copy inline-flex items-center gap-2 border-[3px] border-black bg-[#fbf4e7] px-3 py-2 text-[10px] font-black text-[#171411] uppercase shadow-[3px_3px_0_#000] transition hover:-translate-y-0.5"
              title="Open achievement cache folder"
            >
              <FolderOpen className="h-4 w-4" />
              Cache Folder
            </button>
            <StatCard label="Total" value={stats.total} tone="paper" />
            <StatCard label="Unlocked" value={stats.unlocked} tone="teal" />
            <StatCard label="Perfect" value={stats.perfect} tone="red" />
            <StatCard label="Complete" value={`${stats.pct}%`} tone="ink" />
          </div>
        </div>

        {statusMessage ? (
          <div className="neo-copy border-b-4 border-black bg-[#087d6d] px-4 py-2 text-[10px] font-black text-white uppercase">
            {statusMessage}
          </div>
        ) : null}

        {isHydrating ? (
          <div
            aria-label="Refreshing cloud achievements"
            aria-live="polite"
            className="neo-copy flex items-center gap-2 border-b-4 border-black bg-[#8cf5e4] px-4 py-2 text-[10px] font-black text-[#171411] uppercase"
            role="status"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cloud archive updating / Local games ready
          </div>
        ) : null}

        {isProviderSyncing ? (
          <div
            aria-label="Refreshing provider achievements"
            aria-live="polite"
            className="neo-copy flex items-center gap-2 border-b-4 border-black bg-[#f6edd8] px-4 py-2 text-[10px] font-black text-[#171411] uppercase"
            role="status"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Xbox / GOG / Epic / EA / Ubisoft / Battle.net archive updating
          </div>
        ) : null}

        <div className="border-b-4 border-black bg-[#f6edd8] px-4 pt-3">
          <div className="flex flex-wrap gap-4">
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
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
          <label className="flex h-10 min-w-0 items-center gap-2 border-[3px] border-black bg-[#fbf4e7] px-3 shadow-[2px_2px_0_#171411]">
            <Search className="h-4 w-4 text-[#5b403f]" />
            <input
              className="neo-copy min-w-0 flex-1 bg-transparent text-[12px] font-black text-[#171411] uppercase outline-none placeholder:text-[#655f58]"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Find a game"
              type="search"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Settings className="h-4 w-4 text-[#5b403f]" />
            {SORTS.map((sort) => (
              <button
                key={sort.key}
                type="button"
                onClick={() => setSortMode(sort.key)}
                className={`neo-copy border-2 border-black px-2 py-1 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] ${
                  sortMode === sort.key ? "bg-[#087d6d] text-white" : "bg-[#fbf4e7] text-[#171411]"
                }`}
              >
                {sort.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            <span className="neo-copy text-[10px] font-black text-[#5b403f] uppercase">Source</span>
            {["all", ...sourceFilters].map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => setSourceFilter(source)}
                className={`neo-copy border-2 border-black px-2 py-1 text-[10px] font-black uppercase shadow-[2px_2px_0_#171411] ${
                  sourceFilter === source
                    ? "bg-[#b7102a] text-white"
                    : "bg-[#fbf4e7] text-[#171411]"
                }`}
              >
                {source}
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
          visibleRows.map((row) => <GameRow key={row.group.id} row={row} />)
        )}
      </div>
    </section>
  );
}
