import type { UserActivity } from "../../../lib/types/profile";
import { EmptyShowcaseText, ShowcasePanel } from "./ShowcasePanel";

export function ActivityShowcase({ activity }: { activity: UserActivity[] }) {
  return (
    <ShowcasePanel kicker="Feed" title="Activity">
      <div className="mt-4 space-y-3">
        {activity.length > 0 ? (
          activity.map((item) => (
            <div
              key={item.id}
              className="neo-copy border-l-[6px] border-[#007166] bg-[#f6edd8] px-3 py-2 text-[12px] font-black uppercase text-[#171411]"
            >
              {item.type.replace(/_/g, " ")}
            </div>
          ))
        ) : (
          <EmptyShowcaseText>No public activity yet.</EmptyShowcaseText>
        )}
      </div>
    </ShowcasePanel>
  );
}
