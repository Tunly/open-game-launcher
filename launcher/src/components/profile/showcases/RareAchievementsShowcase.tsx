import type { AchievementPreviewItem } from "../../../lib/types/profile";

export function RareAchievementsShowcase({
  achievements,
}: {
  achievements: AchievementPreviewItem[];
}) {
  return (
    <div className="border border-white/10 bg-white/[0.05] p-5">
      <h3 className="text-lg font-bold text-white">Rare Achievements</h3>
      <div className="mt-4 space-y-3">
        {achievements.length > 0 ? (
          achievements.map((achievement) => (
            <div key={achievement.id} className="flex gap-3 border border-white/10 bg-black/20 p-3">
              <div className="h-10 w-10 bg-amber-400/20" />
              <div>
                <p className="font-bold text-white">{achievement.name}</p>
                <p className="text-xs uppercase text-amber-200">{achievement.rarity}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-400">No public achievements yet.</p>
        )}
      </div>
    </div>
  );
}
