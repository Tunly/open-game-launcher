import { ChevronDown, ChevronUp } from "lucide-react";

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
      {showcases.map((showcase, index) => (
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
                onChange={(event) => onChange(showcase.id, { title: event.target.value || null })}
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
            <div className="pt-5">
              <button
                aria-pressed={showcase.isEnabled}
                className={`neo-copy h-10 w-full border-2 border-black px-3 text-[10px] font-black uppercase tracking-[0.12em] shadow-[2px_2px_0_#1f1c0f] transition hover:-translate-y-0.5 ${
                  showcase.isEnabled
                    ? "bg-[#007166] text-white hover:bg-[#b7102a]"
                    : "bg-[#efe6d4] text-[#655f58] hover:bg-[#8cf5e4] hover:text-[#171411]"
                }`}
                type="button"
                onClick={() => onChange(showcase.id, { isEnabled: !showcase.isEnabled })}
              >
                {showcase.isEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              aria-label={`Move ${showcase.title ?? showcase.type} up`}
              className="inline-flex h-10 w-10 items-center justify-center border-2 border-black bg-[#fff9ed] text-[#171411] shadow-[2px_2px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#efe6d4] disabled:text-[#655f58] disabled:hover:translate-y-0"
              disabled={index === 0}
              title="Move up"
              type="button"
              onClick={() => onMove(showcase.id, "up")}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              aria-label={`Move ${showcase.title ?? showcase.type} down`}
              className="inline-flex h-10 w-10 items-center justify-center border-2 border-black bg-[#fff9ed] text-[#171411] shadow-[2px_2px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4] disabled:cursor-not-allowed disabled:bg-[#efe6d4] disabled:text-[#655f58] disabled:hover:translate-y-0"
              disabled={index === showcases.length - 1}
              title="Move down"
              type="button"
              onClick={() => onMove(showcase.id, "down")}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
