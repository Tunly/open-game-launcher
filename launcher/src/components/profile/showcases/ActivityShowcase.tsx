import type { UserActivity } from "../../../lib/types/profile";

export function ActivityShowcase({ activity }: { activity: UserActivity[] }) {
  return (
    <div className="border border-white/10 bg-white/[0.05] p-5">
      <h3 className="text-lg font-bold text-white">Activity</h3>
      <div className="mt-4 space-y-3">
        {activity.length > 0 ? (
          activity.map((item) => (
            <div key={item.id} className="border-l-2 border-sky-400 pl-3 text-sm text-slate-300">
              {item.type.replace(/_/g, " ")}
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-400">No public activity yet.</p>
        )}
      </div>
    </div>
  );
}
