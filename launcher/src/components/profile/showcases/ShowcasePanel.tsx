import type { ReactNode } from "react";

export function ShowcasePanel({
  children,
  kicker = "Showcase",
  title,
}: {
  children: ReactNode;
  kicker?: string;
  title: string;
}) {
  return (
    <section className="min-h-full border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#1f1c0f]">
      <div className="mb-4 flex flex-wrap items-center gap-3 border-b-[3px] border-black pb-3">
        <span className="neo-copy border-2 border-black bg-[#b7102a] px-2 py-1 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[2px_2px_0_#1f1c0f]">
          {kicker}
        </span>
        <h3 className="neo-title text-2xl leading-none text-[#171411]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function EmptyShowcaseText({ children }: { children: ReactNode }) {
  return (
    <p className="neo-copy border-2 border-dashed border-black bg-[#f6edd8] p-3 text-[12px] leading-5 font-bold text-[#655f58] uppercase">
      {children}
    </p>
  );
}
