import type { ProfileStatsPreview } from "../../../lib/types/profile";
import { ShowcasePanel } from "./ShowcasePanel";

export function StatsShowcase({ stats }: { stats: ProfileStatsPreview }) {
  return (
    <ShowcasePanel kicker="Readout" title="Stats">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["Games", stats.gamesOwned],
          ["Achievements", stats.achievementsUnlocked],
          ["Hours", Math.floor(stats.playtimeMinutes / 60)],
          ["Friends", stats.friendsCount],
        ].map(([label, value]) => (
          <div
            key={label}
            className="border-[3px] border-black bg-[#f6edd8] p-4 shadow-[3px_3px_0_#1f1c0f]"
          >
            <p className="neo-title text-4xl leading-none text-[#171411]">{value}</p>
            <p className="neo-copy mt-2 text-[10px] font-black tracking-[0.12em] text-[#5b403f] uppercase">
              {label}
            </p>
          </div>
        ))}
      </div>
    </ShowcasePanel>
  );
}
