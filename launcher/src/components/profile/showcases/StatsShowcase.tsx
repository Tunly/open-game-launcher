import type { ProfileStatsPreview } from "../../../lib/types/profile";

export function StatsShowcase({ stats }: { stats: ProfileStatsPreview }) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {[
        ["Games", stats.gamesOwned],
        ["Achievements", stats.achievementsUnlocked],
        ["Hours", Math.floor(stats.playtimeMinutes / 60)],
        ["Friends", stats.friendsCount],
      ].map(([label, value]) => (
        <div key={label} className="border border-white/10 bg-white/[0.05] p-4">
          <p className="text-2xl font-black text-white">{value}</p>
          <p className="mt-1 text-xs font-bold uppercase text-slate-400">{label}</p>
        </div>
      ))}
    </div>
  );
}
