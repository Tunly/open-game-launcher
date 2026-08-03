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
              {achievement.iconUrl ? (
                <img
                  alt=""
                  className="h-14 w-14 shrink-0 border-[3px] border-black bg-[#b7102a] object-cover"
                  decoding="async"
                  loading="lazy"
                  src={achievement.iconUrl}
                />
              ) : (
                <div className="neo-title grid h-14 w-14 shrink-0 place-items-center border-[3px] border-black bg-[#b7102a] text-3xl leading-none text-white">
                  S
                </div>
              )}
              <div className="min-w-0">
                <p className="neo-title text-2xl leading-none text-[#171411]">{achievement.name}</p>
                <p className="neo-copy mt-1 text-[10px] font-black tracking-[0.12em] text-[#b7102a] uppercase">
                  {achievement.rarity} / {achievement.gameTitle ?? "Unknown game"}
                </p>
                {achievement.description ? (
                  <p className="mt-2 text-xs leading-5 font-semibold text-[#5b403f]">
                    {achievement.description}
                  </p>
                ) : null}
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
