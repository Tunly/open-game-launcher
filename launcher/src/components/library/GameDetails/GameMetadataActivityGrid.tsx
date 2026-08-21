import React, { useState } from "react";
import type { Game, UnifiedAchievement } from "../../../lib/types";
import { Award, LockKeyhole, LockKeyholeOpen } from "lucide-react";
import {
  getAchievementProviderStatusLabel,
  getAchievementProviderStatusMessage,
} from "../../../lib/achievement-status";
import { filterAndSortAchievements } from "../../../lib/achievement-view";
import { formatShortDate } from "../client-manager-labels";
import { useGameDetailVerify } from "../useGameDetailVerify";
import { AchievementViewerModal } from "../AchievementViewerModal";

const GameUpdateFeed = React.lazy(() =>
  import("../GameUpdateFeed").then((module) => ({ default: module.GameUpdateFeed })),
);

const PlaytimeEditorPanel = React.lazy(() =>
  import("./PlaytimeEditorPanel").then((m) => ({
    default: m.PlaytimeEditorPanel,
  })),
);

const HostedCommunityArtworkReadinessPanel = React.lazy(() =>
  import("./HostedCommunityArtworkReadinessPanel").then((m) => ({
    default: m.HostedCommunityArtworkReadinessPanel,
  })),
);

const HostedCommunityArtworkModeratorConsolePanel = React.lazy(() =>
  import("./HostedCommunityArtworkModeratorConsolePanel").then((m) => ({
    default: m.HostedCommunityArtworkModeratorConsolePanel,
  })),
);

const IgdbCrossPlayReadinessPanel = React.lazy(() =>
  import("./IgdbCrossPlayReadinessPanel").then((m) => ({
    default: m.IgdbCrossPlayReadinessPanel,
  })),
);

const CrossStoreSaveSyncPlanner = React.lazy(() =>
  import("./CrossStoreSaveSyncPlanner").then((m) => ({
    default: m.CrossStoreSaveSyncPlanner,
  })),
);

const CrossStoreSaveMigrationReadinessPanel = React.lazy(() =>
  import("./CrossStoreSaveMigrationReadinessPanel").then((m) => ({
    default: m.CrossStoreSaveMigrationReadinessPanel,
  })),
);

type AchievementWithSources = UnifiedAchievement & {
  sourceLabels?: string[];
  canonicalSource?: string;
  matchConfidence?: string;
  isAdditional?: boolean;
};

interface GameMetadataActivityGridProps {
  selectedVariant: Game | null;
  enrichedSelectedGame: Game | null;
  statusMessage: string | null;
  setStatusMessage: (message: string | null) => void;
  onPlaytimeChanged: ((gameId: string, nextMinutes: number) => void) | null;
  verifyMode: string | null | undefined;
}

export function GameMetadataActivityGrid({
  selectedVariant,
  enrichedSelectedGame,
  statusMessage,
  setStatusMessage,
  onPlaytimeChanged,
  verifyMode,
}: GameMetadataActivityGridProps) {
  const [achievementFilter, setAchievementFilter] = useState("all");
  const [achievementSort, setAchievementSort] = useState<"rarity" | "name" | "date">("rarity");
  const [achievementsViewerOpen, setAchievementsViewerOpen] = useState(false);

  const {
    crossStoreSaveMigrationReadiness,
    crossStoreSaveSyncPlan,
    hostedCommunityArtworkModerationConsole,
    hostedCommunityArtworkReadiness,
    igdbCrossPlayReadinessPlan,
  } = useGameDetailVerify(verifyMode, null, enrichedSelectedGame);

  const achievements = enrichedSelectedGame?.achievements ?? [];
  const achievementProviderStatuses =
    (
      enrichedSelectedGame as
        | (Game & {
            achievementProviderStatuses?: Array<{
              source: string;
              status: string;
              stability: string;
              message: string;
            }>;
          })
        | null
    )?.achievementProviderStatuses ?? [];
  const achievementSourceFilters = Array.from(
    new Set(
      achievements.flatMap(
        (achievement) => (achievement as AchievementWithSources).sourceLabels ?? [],
      ),
    ),
  );
  const achievementAttentionStatus = achievementProviderStatuses.find(
    (provider) => provider.status !== "available",
  );
  const achievementAttentionMessage = achievementAttentionStatus
    ? getAchievementProviderStatusMessage(achievementAttentionStatus)
    : undefined;
  const unlockedAchievementCount = achievements.filter(
    (achievement) => achievement.unlockedAt,
  ).length;
  const achievementProgressPercent =
    achievements.length === 0
      ? 0
      : Math.round((unlockedAchievementCount / achievements.length) * 100);

  return (
    <>
      {/* Game Metadata & Activity Grid */}
      <section className="px-3 py-3 sm:px-4">
        {statusMessage ? (
          <div
            className="neo-copy mb-3 border-2 border-black bg-[#e6dbc8] px-4 py-2 text-xs font-bold uppercase shadow-[2px_2px_0_#171411]"
            role="status"
          >
            {statusMessage}
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          {/* Left Column: Activity Feed */}
          <section className="min-w-0">
            <div className="mb-2">
              <h2 className="text-[15px] leading-none font-black uppercase">Activity</h2>
            </div>

            <React.Suspense
              fallback={
                <div className="neo-copy h-24 border-2 border-black bg-[#f6edd8] p-3 text-[10px] font-black uppercase">
                  Loading activity tape...
                </div>
              }
            >
              <GameUpdateFeed game={enrichedSelectedGame} />
            </React.Suspense>
            {selectedVariant && onPlaytimeChanged ? (
              <div className="mt-4">
                <React.Suspense fallback={null}>
                  <PlaytimeEditorPanel
                    game={selectedVariant}
                    onPlaytimeChanged={(nextMinutes) =>
                      onPlaytimeChanged(selectedVariant.id, nextMinutes)
                    }
                    onStatusMessage={setStatusMessage}
                  />
                </React.Suspense>
              </div>
            ) : null}
          </section>

          {/* Right Column: RICH METADATA & Hardware cards */}
          <aside className="space-y-4">
            {hostedCommunityArtworkReadiness ? (
              <React.Suspense fallback={null}>
                <HostedCommunityArtworkReadinessPanel readiness={hostedCommunityArtworkReadiness} />
              </React.Suspense>
            ) : null}

            {hostedCommunityArtworkModerationConsole ? (
              <React.Suspense fallback={null}>
                <HostedCommunityArtworkModeratorConsolePanel
                  initialConsole={hostedCommunityArtworkModerationConsole}
                />
              </React.Suspense>
            ) : null}

            {igdbCrossPlayReadinessPlan ? (
              <React.Suspense fallback={null}>
                <IgdbCrossPlayReadinessPanel plan={igdbCrossPlayReadinessPlan} />
              </React.Suspense>
            ) : null}

            <section className="border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]">
              <div className="flex items-center justify-between gap-2 border-b-2 border-black px-3 py-2">
                <h2 className="text-[15px] leading-none font-black uppercase">Achievements</h2>
                <div className="flex items-center gap-1.5">
                  <span className="neo-copy border-2 border-black bg-[#087d6d] px-2 py-0.5 text-[10px] font-black text-white uppercase">
                    {unlockedAchievementCount}/{achievements.length} · {achievementProgressPercent}%
                  </span>
                </div>
              </div>

              {achievementProviderStatuses.length > 0 ? (
                <div className="flex flex-wrap gap-1 border-b-2 border-black bg-[#efe6d4] px-2 py-1.5">
                  {achievementProviderStatuses.map((provider) => {
                    const hasAchievements = achievements.length > 0;
                    const showFailureColor =
                      (provider.status === "failed" || provider.status === "private") &&
                      !hasAchievements;
                    return (
                      <span
                        key={provider.source}
                        className={`neo-copy border-2 border-black px-1.5 py-0.5 text-[8px] font-black uppercase ${
                          provider.status === "available"
                            ? "bg-[#087d6d] text-white"
                            : showFailureColor
                              ? "bg-[#b7102a] text-white"
                              : "bg-[#fbf4e7] text-[#55504a]"
                        }`}
                        title={getAchievementProviderStatusMessage(provider)}
                      >
                        {getAchievementProviderStatusLabel(provider, hasAchievements)}
                      </span>
                    );
                  })}
                </div>
              ) : null}

              {achievements.length > 0 ? (
                <>
                  <div className="flex flex-wrap items-center gap-1.5 border-b-2 border-black bg-[#f3e8d7] px-2 py-1.5">
                    {[
                      "all",
                      "unlocked",
                      "locked",
                      ...achievementSourceFilters.map((source) => `source:${source}`),
                    ].map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setAchievementFilter(key)}
                        className={`neo-copy border-2 border-black px-2 py-0.5 text-[9px] font-black uppercase ${
                          achievementFilter === key
                            ? "bg-[#087d6d] text-white"
                            : "bg-[#fbf4e7] text-[#171411] hover:bg-[#efe3cf]"
                        }`}
                      >
                        {key.startsWith("source:") ? key.slice("source:".length) : key}
                      </button>
                    ))}
                    <div className="flex items-center gap-1">
                      <select
                        aria-label="Sort achievements"
                        value={achievementSort}
                        onChange={(e) =>
                          setAchievementSort(e.target.value as "rarity" | "name" | "date")
                        }
                        className="neo-copy border-2 border-black bg-[#fbf4e7] px-1.5 py-0.5 text-[9px] font-black uppercase"
                      >
                        <option value="rarity">Rarity</option>
                        <option value="name">Name</option>
                        <option value="date">Date</option>
                      </select>
                    </div>
                  </div>
                  <div className="max-h-[360px] space-y-2 overflow-y-auto p-3">
                    {filterAndSortAchievements(
                      achievements,
                      achievementFilter,
                      achievementSort,
                    ).map((achievement) => {
                      const isUnlocked = Boolean(achievement.unlockedAt);
                      const achievementMeta = achievement as AchievementWithSources;
                      const achievementSources = achievementMeta.sourceLabels ?? [];

                      return (
                        <button
                          key={achievement.id}
                          type="button"
                          onClick={() => setAchievementsViewerOpen(true)}
                          className={`grid w-full grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2 border-2 border-black p-2 text-left transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_#171411] ${
                            isUnlocked ? "bg-[#efe3cf]" : "bg-[#f6edd8] opacity-75"
                          }`}
                        >
                          <div
                            className={`grid h-[38px] w-[38px] place-items-center overflow-hidden border-2 border-black ${
                              isUnlocked ? "bg-[#169b83] text-white" : "bg-[#d8cbb7] text-[#171411]"
                            }`}
                          >
                            {achievement.iconUrl ? (
                              <img
                                alt=""
                                className="h-full w-full object-cover"
                                decoding="async"
                                height={38}
                                loading="lazy"
                                src={achievement.iconUrl}
                                width={38}
                              />
                            ) : (
                              <Award className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-[12px] leading-tight font-black uppercase">
                              {achievement.name}
                            </h3>
                            {achievement.description ? (
                              <p className="mt-1 line-clamp-2 text-[11px] leading-4 font-bold text-[#55504a]">
                                {achievement.description}
                              </p>
                            ) : null}
                            {typeof achievement.rarity === "number" ? (
                              <p className="mt-1 text-[10px] font-black text-[#087d6d] uppercase">
                                {achievement.rarity.toFixed(1)}% of players
                              </p>
                            ) : null}
                            {achievementSources.length > 0 ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {achievementSources.map((source) => (
                                  <span
                                    key={source}
                                    className="neo-copy border border-black bg-[#fbf4e7] px-1 py-0.5 text-[8px] font-black text-[#171411] uppercase"
                                  >
                                    {source}
                                  </span>
                                ))}
                                {achievementMeta.isAdditional ? (
                                  <span className="neo-copy border border-black bg-[#e8c843] px-1 py-0.5 text-[8px] font-black text-[#171411] uppercase">
                                    extra
                                  </span>
                                ) : null}
                                {achievementMeta.matchConfidence ? (
                                  <span className="neo-copy border border-black bg-[#171411] px-1 py-0.5 text-[8px] font-black text-[#fbf4e7] uppercase">
                                    {achievementMeta.matchConfidence}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {isUnlocked && achievement.unlockedAt ? (
                              <span className="neo-copy text-[9px] font-bold text-[#55504a] uppercase">
                                {formatShortDate(achievement.unlockedAt)}
                              </span>
                            ) : null}
                            <div
                              className="grid h-8 w-8 shrink-0 place-items-center"
                              title={isUnlocked ? "Unlocked" : "Locked"}
                            >
                              {isUnlocked ? (
                                <LockKeyholeOpen className="h-5 w-5 text-[#169b83]" />
                              ) : (
                                <LockKeyhole className="h-5 w-5 text-[#8e877e]" />
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {filterAndSortAchievements(achievements, achievementFilter, achievementSort)
                      .length === 0 ? (
                      <div className="py-4 text-center text-[11px] font-bold text-[#55504a] uppercase">
                        No achievements match this filter.
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="p-3 text-[12px] leading-5 font-bold text-[#55504a]">
                  {achievementAttentionMessage ??
                    "No achievements synced yet. Achievement auto-sync runs when a supported provider is available."}
                </div>
              )}
            </section>

            {/* Cross-store save planning */}
            {crossStoreSaveSyncPlan ? (
              <React.Suspense fallback={null}>
                <CrossStoreSaveSyncPlanner plan={crossStoreSaveSyncPlan} />
              </React.Suspense>
            ) : null}

            {crossStoreSaveMigrationReadiness ? (
              <React.Suspense fallback={null}>
                <CrossStoreSaveMigrationReadinessPanel
                  readiness={crossStoreSaveMigrationReadiness}
                />
              </React.Suspense>
            ) : null}
          </aside>
        </div>
      </section>
      {achievementsViewerOpen ? (
        <AchievementViewerModal
          gameTitle={enrichedSelectedGame?.title ?? "Unknown Game"}
          achievements={achievements}
          onClose={() => setAchievementsViewerOpen(false)}
        />
      ) : null}
    </>
  );
}
