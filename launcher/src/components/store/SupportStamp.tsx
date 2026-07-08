export function SupportStamp({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b-2 border-black pb-1">
      <span>{label}</span>
      <span className="min-w-0 break-all text-right text-[#171411]">{value}</span>
    </div>
  );
}
