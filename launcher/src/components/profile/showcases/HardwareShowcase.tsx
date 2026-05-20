import type { UserHardware } from "../../../lib/types/profile";

export function HardwareShowcase({ hardware }: { hardware: UserHardware | null }) {
  const entries = hardware
    ? [
        ["CPU", hardware.cpu],
        ["GPU", hardware.gpu],
        ["RAM", hardware.ram],
        ["Monitor", hardware.monitor],
        ["Keyboard", hardware.keyboard],
        ["Mouse", hardware.mouse],
      ].filter(([, value]) => Boolean(value))
    : [];

  return (
    <div className="border border-white/10 bg-white/[0.05] p-5">
      <h3 className="text-lg font-bold text-white">Hardware Setup</h3>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {entries.length > 0 ? (
          entries.map(([label, value]) => (
            <div key={label} className="border border-white/10 bg-black/20 p-3">
              <p className="text-xs uppercase text-slate-500">{label}</p>
              <p className="mt-1 text-sm font-bold text-white">{value}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-400">No hardware setup shared.</p>
        )}
      </div>
    </div>
  );
}
