import { cn } from "../../lib/utils";

interface ToggleProps {
  checked: boolean;
  label: string;
  description?: string;
  onChange: (checked: boolean) => void;
}

export function Toggle({
  checked,
  label,
  description,
  onChange,
}: ToggleProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{label}</p>
        {description ? (
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        ) : null}
      </div>
      <button
        aria-checked={checked}
        aria-label={label}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border transition",
          checked
            ? "border-sky-300/50 bg-sky-400"
            : "border-white/10 bg-white/[0.08]",
        )}
        role="switch"
        type="button"
        onClick={() => onChange(!checked)}
      >
        <span
          className={cn(
            "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition",
            checked ? "left-6" : "left-1",
          )}
        />
      </button>
    </div>
  );
}
