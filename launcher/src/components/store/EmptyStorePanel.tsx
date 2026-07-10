export function EmptyStorePanel({ label }: { label: string }) {
  return (
    <div className="neo-copy border-[3px] border-dashed border-black bg-[#f5eedf] p-6 text-center text-[12px] font-black tracking-[0.12em] text-[#655f58] uppercase">
      {label}
    </div>
  );
}
