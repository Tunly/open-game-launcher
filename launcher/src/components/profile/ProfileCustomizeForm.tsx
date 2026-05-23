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
        <div
          key={showcase.id}
          className="grid gap-3 border-[3px] border-black bg-[#fff9ed] p-4 shadow-[4px_4px_0_#1f1c0f] lg:grid-cols-[1fr_auto] lg:items-center"
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-center">
            <label className="min-w-0">
              <span className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
                {showcase.type.replace(/_/g, " ")}
              </span>
              <input
                className="mt-1 h-10 w-full border-2 border-black bg-[#f6edd8] px-3 text-sm font-black text-[#171411] shadow-[2px_2px_0_#1f1c0f] outline-none focus:bg-[#8cf5e4]"
                maxLength={80}
                placeholder="Showcase title"
                value={showcase.title ?? ""}
                onChange={(event) =>
                  onChange(showcase.id, { title: event.target.value || null })
                }
              />
            </label>
            <label>
              <span className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                Visibility
              </span>
              <select
                className="neo-copy mt-1 h-10 w-full border-2 border-black bg-[#f6edd8] px-3 text-[11px] font-black uppercase tracking-[0.08em] text-[#171411] shadow-[2px_2px_0_#1f1c0f] outline-none focus:bg-[#8cf5e4]"
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
            <label className="neo-copy flex items-center gap-2 pt-5 text-[11px] font-black uppercase tracking-[0.1em] text-[#171411]">
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
            <button className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[2px_2px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]" type="button" onClick={() => onMove(showcase.id, "up")}>
              Up
            </button>
            <button className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[2px_2px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]" type="button" onClick={() => onMove(showcase.id, "down")}>
              Down
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
