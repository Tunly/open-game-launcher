import type { ReactNode } from "react";

export function StoreMetric({
  icon,
  label,
  onClick,
  value,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  value: number;
}) {
  const content = (
    <>
      <div className="neo-copy flex items-center gap-2 text-[10px] font-black tracking-[0.12em] text-[#b7102a] uppercase">
        {icon}
        {label}
      </div>
      <p className="neo-title mt-2 text-3xl leading-none text-[#171411]">{value}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        aria-label={`Open ${label}`}
        className="border-[3px] border-black bg-[#fff9ed] p-4 text-left shadow-[4px_4px_0_#171411] transition-transform hover:-translate-y-0.5"
        type="button"
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="border-[3px] border-black bg-[#fff9ed] p-4 shadow-[4px_4px_0_#171411]">
      {content}
    </div>
  );
}
