import type { ProfileShowcase, ProfileVisibility } from "../../lib/types/profile";

const visibilityOptions: ProfileVisibility[] = ["public", "friends_only", "private"];

export function ProfileCustomizeForm({
  onChange,
  showcases,
  onMove,
}: {
  onChange: (id: string, patch: Partial<ProfileShowcase>) => void;
  showcases: ProfileShowcase[];
  onMove: (id: string, direction: "up" | "down") => void;
}) {
  return (
    <div className="space-y-3">
      {showcases.map((showcase) => (
        <div key={showcase.id} className="grid gap-3 border border-white/10 bg-white/[0.05] p-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-center">
            <label className="min-w-0">
              <span className="text-xs font-bold uppercase text-slate-500">
                {showcase.type.replace(/_/g, " ")}
              </span>
              <input
                className="mt-1 h-10 w-full border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-sky-300"
                maxLength={80}
                placeholder="Showcase title"
                value={showcase.title ?? ""}
                onChange={(event) =>
                  onChange(showcase.id, { title: event.target.value || null })
                }
              />
            </label>
            <label>
              <span className="text-xs font-bold uppercase text-slate-500">
                Visibility
              </span>
              <select
                className="mt-1 h-10 w-full border border-white/10 bg-[#0f172a] px-3 text-sm text-white"
                value={showcase.visibility}
                onChange={(event) =>
                  onChange(showcase.id, {
                    visibility: event.target.value as ProfileVisibility,
                  })
                }
              >
                {visibilityOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-5 text-sm font-semibold text-slate-300">
              <input
                checked={showcase.isEnabled}
                type="checkbox"
                onChange={(event) =>
                  onChange(showcase.id, { isEnabled: event.target.checked })
                }
              />
              Enabled
            </label>
          </div>
          <div className="flex gap-2">
            <button className="border border-white/10 px-3 py-2 text-sm text-white hover:bg-white/[0.08]" type="button" onClick={() => onMove(showcase.id, "up")}>
              Up
            </button>
            <button className="border border-white/10 px-3 py-2 text-sm text-white hover:bg-white/[0.08]" type="button" onClick={() => onMove(showcase.id, "down")}>
              Down
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
