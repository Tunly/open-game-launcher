import type { ReactNode } from "react";

export function Metric({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return (
    <div className="grid min-h-[64px] min-w-0 grid-cols-[28px_minmax(0,1fr)] items-center gap-2 border-4 border-black bg-[#fbf4e7] px-3 py-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden">{icon}</span>
      <div className="min-w-0 overflow-hidden">
        <div className="text-[11px] leading-[0.95] font-black uppercase sm:text-[12px]">
          {title}
        </div>
        <div className="neo-copy mt-1 truncate text-[11px] leading-none font-bold sm:text-[12px]">
          {value}
        </div>
      </div>
    </div>
  );
}
