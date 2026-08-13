// src/components/store/EmptyStorePanel.tsx
import { Package } from "lucide-react";

export function EmptyStorePanel({ label }: { label: string }) {
  return (
    <div className="neo-copy border-2 border-black bg-[#f6edd8] p-8 text-center shadow-[3px_3px_0_#171411]">
      <Package className="mx-auto mb-4 h-12 w-12 text-[#b7102a]" />
      <div className="text-xl font-black tracking-widest uppercase">No games found</div>
      <div className="mt-2 text-sm text-[#171411]">{label}</div>
    </div>
  );
}
