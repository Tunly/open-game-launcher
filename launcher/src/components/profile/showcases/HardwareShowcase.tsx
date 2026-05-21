import type { UserHardware } from "../../../lib/types/profile";
import { EmptyShowcaseText, ShowcasePanel } from "./ShowcasePanel";

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
    <ShowcasePanel kicker="Setup" title="Hardware">
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {entries.length > 0 ? (
          entries.map(([label, value]) => (
            <div key={label} className="border-[3px] border-black bg-[#f6edd8] p-3">
              <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
                {label}
              </p>
              <p className="mt-1 text-sm font-black text-[#171411]">{value}</p>
            </div>
          ))
        ) : (
          <EmptyShowcaseText>No hardware setup shared.</EmptyShowcaseText>
        )}
      </div>
    </ShowcasePanel>
  );
}
