import type { AchievementPreviewItem } from "../../../lib/types/profile";
import { EmptyShowcaseText, ShowcasePanel } from "./ShowcasePanel";

export function RareAchievementsShowcase({
  achievements,
}: {
  achievements: AchievementPreviewItem[];
}) {
  return (
    <ShowcasePanel kicker="Trophy Case" title="Rare Achievements">
      <div className="mt-4 space-y-3">
        {achievements.length > 0 ? (
          achievements.map((achievement) => (
            <div
              key={achievement.id}
              className="flex gap-3 border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#1f1c0f]"
            >
              <div className="h-12 w-12 shrink-0 border-[3px] border-black bg-[#b7102a]" />
              <div>
                <p className="neo-title text-2xl leading-none text-[#171411]">
                  {achievement.name}
                </p>
                <p className="neo-copy mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
                  {achievement.rarity}
                </p>
              </div>
            </div>
          ))
        ) : (
          <EmptyShowcaseText>No public achievements yet.</EmptyShowcaseText>
        )}
      </div>
    </ShowcasePanel>
  );
}
