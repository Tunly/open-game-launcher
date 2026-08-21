import { useMemo, useState } from "react";
import { Lock, LockKeyholeOpen, Search, Trophy, X } from "lucide-react";
import type { UnifiedAchievement } from "../../lib/types";
import { filterAndSortAchievements } from "../../lib/achievement-view";
import { ModalDialog } from "../ui/ModalDialog";

interface AchievementViewerModalProps {
  gameTitle: string;
  achievements: UnifiedAchievement[];
  completionAchievements?: UnifiedAchievement[];
  onClose: () => void;
}

type ViewerTab = "my" | "global";

function formatUnlockDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function AchievementViewerModal({
  gameTitle,
  achievements,
  completionAchievements = achievements,
  onClose,
}: AchievementViewerModalProps) {
  const [tab, setTab] = useState<ViewerTab>("my");
  const [query, setQuery] = useState("");
  const titleId = "achievement-viewer-title";

  const unlockedCount = completionAchievements.filter((a) => Boolean(a.unlockedAt)).length;
  const totalCount = completionAchievements.length;
  const percent = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

  const visible = useMemo(
    () =>
      filterAndSortAchievements(achievements, {
        query,
        tab,
      }),
    [achievements, query, tab],
  );

  return (
    <ModalDialog
      labelledBy={titleId}
      onDismiss={onClose}
      backdropClassName="fixed inset-0 z-50 grid place-items-center bg-[#171411]/85 p-4"
      panelClassName="w-full max-w-[980px] border-4 border-black bg-[#fbf4e7] shadow-[8px_8px_0_#171411]"
    >
      {/* Steam-artiger Header: Spielname + Fortschrittsbalken */}
      <div className="border-b-4 border-black bg-[#171411] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[#e8c843]">
              <Trophy className="h-4 w-4" />
              <h2
                id={titleId}
                className="text-[15px] leading-none font-black tracking-wider uppercase"
              >
                Achievements
              </h2>
            </div>
            <p className="mt-1.5 truncate text-[11px] font-bold text-[#fbf4e7]/70 uppercase">
              {gameTitle}
            </p>
            <p className="mt-2 text-[11px] font-black text-[#fbf4e7] uppercase">
              {unlockedCount} of {totalCount} achievements earned{" "}
              <span className="text-[#e8c843]">({percent}%)</span>
            </p>
            <div className="mt-2 h-3 w-full max-w-[420px] border-2 border-black bg-[#0e0c0a]">
              <div
                className="h-full bg-[#e8c843] transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            aria-label="Close achievement viewer"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center border-2 border-black bg-[#b7102a] text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs + Suche */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black bg-[#efe6d4] px-5 py-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("my")}
            aria-pressed={tab === "my"}
            className={`neo-copy border-2 border-black px-3 py-1 text-[10px] font-black uppercase ${
              tab === "my"
                ? "bg-[#087d6d] text-white shadow-[2px_2px_0_#171411]"
                : "bg-[#fbf4e7] text-[#171411] shadow-[2px_2px_0_#171411]"
            }`}
          >
            My achievements
          </button>
          <button
            type="button"
            onClick={() => setTab("global")}
            aria-pressed={tab === "global"}
            className={`neo-copy border-2 border-black px-3 py-1 text-[10px] font-black uppercase ${
              tab === "global"
                ? "bg-[#087d6d] text-white shadow-[2px_2px_0_#171411]"
                : "bg-[#fbf4e7] text-[#171411] shadow-[2px_2px_0_#171411]"
            }`}
          >
            Global achievements
          </button>
        </div>
        <div className="flex items-center gap-2 border-2 border-black bg-[#fbf4e7] px-2 py-1 shadow-[2px_2px_0_#171411]">
          <Search className="h-3.5 w-3.5 text-[#8e877e]" />
          <input
            aria-label="Search achievements"
            className="w-44 bg-transparent text-[11px] font-bold text-[#171411] uppercase outline-none placeholder:text-[#8e877e]"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            type="text"
            value={query}
          />
        </div>
      </div>

      {/* Steam-artige Liste: Icon | Name+Beschreibung+% | Unlock-Datum */}
      <div className="max-h-[52vh] overflow-y-auto p-4">
        {visible.length === 0 ? (
          <p className="neo-copy p-6 text-center text-xs font-bold text-[#8e877e] uppercase">
            No achievements match your search.
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((achievement) => {
              const isUnlocked = Boolean(achievement.unlockedAt);
              return (
                <li
                  key={achievement.id}
                  className={`grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 border-2 border-black p-2.5 shadow-[3px_3px_0_#171411] ${
                    isUnlocked ? "bg-[#f3e8d7]" : "bg-[#e4d8c3] opacity-80"
                  }`}
                >
                  <div
                    className={`grid h-[52px] w-[52px] place-items-center overflow-hidden border-2 border-black ${
                      isUnlocked ? "bg-[#169b83]" : "bg-[#d8cbb7]"
                    }`}
                  >
                    {achievement.iconUrl ? (
                      <img
                        alt={achievement.name}
                        className={`h-full w-full object-cover ${isUnlocked ? "" : "grayscale"}`}
                        decoding="async"
                        height={52}
                        loading="lazy"
                        src={achievement.iconUrl}
                        width={52}
                      />
                    ) : (
                      <Trophy
                        className={`h-6 w-6 ${isUnlocked ? "text-white" : "text-[#171411]"}`}
                      />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p
                      className={`truncate text-[13px] leading-tight font-black uppercase ${
                        isUnlocked ? "text-[#171411]" : "text-[#55504a]"
                      }`}
                    >
                      {achievement.name}
                    </p>
                    {achievement.description ? (
                      <p className="neo-copy mt-0.5 line-clamp-2 text-[11px] leading-4 font-bold text-[#55504a]">
                        {achievement.description}
                      </p>
                    ) : null}
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] font-black text-[#087d6d]">
                      {isUnlocked ? (
                        <LockKeyholeOpen className="h-3 w-3" />
                      ) : (
                        <Lock className="h-3 w-3 text-[#8e877e]" />
                      )}
                      {typeof achievement.rarity === "number"
                        ? `${achievement.rarity.toFixed(1)}%`
                        : isUnlocked
                          ? "Unlocked"
                          : "Locked"}
                    </p>
                  </div>

                  <div className="hidden shrink-0 text-right sm:block">
                    {isUnlocked && achievement.unlockedAt ? (
                      <>
                        <p className="text-[9px] font-black text-[#8e877e] uppercase">Unlocked</p>
                        <p className="text-[11px] font-black text-[#171411] uppercase">
                          {formatUnlockDate(achievement.unlockedAt)}
                        </p>
                      </>
                    ) : (
                      <p className="text-[11px] font-black text-[#8e877e] uppercase">Locked</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ModalDialog>
  );
}
