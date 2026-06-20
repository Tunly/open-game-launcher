import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Award,
  ChevronDown,
  FolderOpen,
  Gamepad2,
  Loader2,
  MoreHorizontal,
  Search,
  Settings,
  Trophy,
} from "lucide-react";

import { getGameAssetUrl, getGameBannerStyle } from "../lib/assets";
import { AchievementCacheReadinessPanel } from "../components/achievements/AchievementCacheReadinessPanel";
import { AchievementHostedHydrationContractPanel } from "../components/achievements/AchievementHostedHydrationContractPanel";
import {
  getErrorMessage,
  getGameIconCandidates,
  formatLastPlayed,
  formatPlayTime,
} from "../lib/formatters";
import { createVerifyAchievementCacheReadiness } from "../lib/achievement-cache-readiness";
import { createVerifyAchievementHostedHydrationContract } from "../lib/achievement-hosted-hydration-contract";
import { groupGames, type GameGroup, type GroupedAchievement } from "../lib/game-groups";
import { listInstalledGames, openAchievementCacheFolder } from "../lib/launcher";
import { hydrateGamesWithRemoteAchievements } from "../lib/supabase/achievements";
import type { Game } from "../lib/types";
import { PlatformSourceIcon } from "../components/library/PlatformIcons";

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
      <span className="neo-copy text-[9px] font-black uppercase text-[#5b403f]">Providers</span>
      {statuses.map((provider) => (
        <span
          key={provider.source}
          className={`neo-copy border-2 border-black px-1.5 py-0.5 text-[8px] font-black uppercase ${providerStatusClass(
            provider.status,
            provider.stability,
          )}`}
          title={provider.message}
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
      <div className="absolute bottom-0 left-0 right-0 border-t-2 border-black bg-[#171411]/80 px-2 py-1">
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

  return (
    <article className="border-4 border-black bg-[#f6edd8] shadow-[5px_5px_0_#171411]">
      <div className="grid gap-3 p-2 md:grid-cols-[280px_minmax(0,1fr)_36px]">
        <ArtworkPanel group={group} />

        <div className="min-w-0 py-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-[18px] font-black leading-tight text-[#171411]">
                {group.title}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {isPerfect ? (
                  <span className="neo-copy border-2 border-black bg-[#087d6d] px-2 py-0.5 text-[9px] font-black uppercase text-white shadow-[1px_1px_0_#171411]">
                    Perfect
                  </span>
                ) : null}
                <span className="neo-copy border-2 border-black bg-[#fbf4e7] px-2 py-0.5 text-[9px] font-black uppercase">
                  {group.variants.length} variant{group.variants.length === 1 ? "" : "s"}
                </span>
                {group.achievementBasisSource ? (
                  <span className="neo-copy border-2 border-black bg-[#171411] px-2 py-0.5 text-[9px] font-black uppercase text-[#fbf4e7]">
                    Basis: {group.achievementBasisSource}
                  </span>
                ) : null}
              </div>
              <ProviderStatusBadges group={group} />
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[90px_90px_minmax(160px,1fr)]">
            <div>
              <p className="neo-copy text-[10px] font-black uppercase text-[#5b403f]">
                Total Played
              </p>
              <p className="text-[12px] font-black text-[#171411]">
                {formatPlayTime(group.playtimeMinutes)}
              </p>
            </div>
            <div>
              <p className="neo-copy text-[10px] font-black uppercase text-[#5b403f]">
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
                <p className="neo-copy text-[10px] font-black uppercase text-[#5b403f]">
                  Achievements
                </p>
                <p className="neo-copy text-[10px] font-black uppercase text-[#171411]">
                  {unlocked}/{total}
                </p>
              </div>
              <ProgressBar value={completion} />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="neo-copy inline-flex h-8 items-center gap-2 border-2 border-black bg-[#171411] px-3 text-[10px] font-black uppercase text-[#fbf4e7] shadow-[2px_2px_0_#171411]"
              type="button"
            >
              My Game Stats
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              className="neo-copy inline-flex h-8 items-center gap-2 border-2 border-black bg-[#fbf4e7] px-3 text-[10px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]"
              type="button"
            >
              My Game Content
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
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
        </div>

        <button
          type="button"
          className="grid h-8 w-8 place-items-center justify-self-end border-2 border-black bg-[#fbf4e7] text-[#171411] shadow-[2px_2px_0_#171411]"
          aria-label={`More actions for ${group.title}`}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
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
      <p className="neo-copy mt-1 text-[9px] font-black uppercase tracking-[0.12em]">{label}</p>
    </div>
  );
}

export function AchievementsPage() {
  const [searchParams] = useSearchParams();
  const verifyMode = searchParams.get("verify");
  const isAchievementCacheReadinessVerify = verifyMode === "achievement-cache-readiness";
  const isAchievementHostedHydrationContractVerify =
    verifyMode === "achievement-hosted-hydration-contract";
  const shouldSkipRemoteHydration =
    isAchievementCacheReadinessVerify || isAchievementHostedHydrationContractVerify;
  const [games, setGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<GameTab>("all");
  const [sortMode, setSortMode] = useState<GameSort>("completion");
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    void (async () => {
      try {
        const allGames = await listInstalledGames().catch((err) => {
          if (shouldSkipRemoteHydration) {
            console.warn("[OG-Launcher] Achievement verify route using empty local list:", err);
            return [];
          }
          throw err;
        });
        const hydratedGames = shouldSkipRemoteHydration
          ? allGames
          : await hydrateGamesWithRemoteAchievements(allGames).catch((err) => {
              console.warn("[OG-Launcher] Remote achievement hydration skipped:", err);
              return allGames;
            });
        if (mounted) setGames(hydratedGames);
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

  const rows = useMemo(
    () =>
      groupGames(games)
        .filter((group) => group.achievements.length > 0)
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
        new Set(rows.flatMap((row) => row.group.achievements.flatMap((a) => a.sourceLabels))),
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
      next = next.filter((row) =>
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
      next.sort((left, right) => right.group.playtimeMinutes - left.group.playtimeMinutes);
    } else {
      next.sort(
        (left, right) => right.completion - left.completion || right.unlocked - left.unlocked,
      );
    }

    if (activeTab === "recent" && sortMode !== "name") {
      next.sort(
        (left, right) => parseTime(right.group.lastPlayedAt) - parseTime(left.group.lastPlayedAt),
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
            <p className="neo-copy text-[10px] font-black uppercase tracking-[0.14em] text-[#8cf5e4]">
              Player Archive
            </p>
            <h1 className="neo-title truncate text-4xl leading-none">
              Daniel <span className="text-xl text-[#8cf5e4]">/ Games</span>
            </h1>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void handleOpenAchievementCacheFolder();
              }}
              className="neo-copy inline-flex items-center gap-2 border-[3px] border-black bg-[#fbf4e7] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#000] transition hover:-translate-y-0.5"
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
          <div className="neo-copy border-b-4 border-black bg-[#087d6d] px-4 py-2 text-[10px] font-black uppercase text-white">
            {statusMessage}
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
              className="neo-copy min-w-0 flex-1 bg-transparent text-[12px] font-black uppercase text-[#171411] outline-none placeholder:text-[#655f58]"
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
            <span className="neo-copy text-[10px] font-black uppercase text-[#5b403f]">Source</span>
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
          <div className="grid min-h-[260px] place-items-center border-4 border-black bg-[#fbf4e7] shadow-[5px_5px_0_#171411]">
            <Loader2 className="h-9 w-9 animate-spin text-[#5b403f]" />
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="grid min-h-[260px] place-items-center border-4 border-black bg-[#fbf4e7] p-6 text-center shadow-[5px_5px_0_#171411]">
            <div>
              <Trophy className="mx-auto h-14 w-14 text-[#5b403f]" />
              <p className="neo-copy mt-3 text-[13px] font-black uppercase text-[#5b403f]">
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
