import type { DownloadItem } from "../../lib/types";

interface DownloadInspectorProps {
  item: DownloadItem;
}

function formatBytes(bytes: number | null | undefined) {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 2)} GB`;
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

function relativeTime(timestamp: number | undefined) {
  if (!timestamp) return "N/A";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const rows: { label: string; getValue: (item: DownloadItem) => string; isError?: boolean }[] = [
  { label: "Provider", getValue: (item) => item.provider || "unknown" },
  { label: "Raw Status", getValue: (item) => item.rawStatus || item.status },
  { label: "Normalized Status", getValue: (item) => item.status },
  { label: "Progress Source", getValue: (item) => item.progressSource || "unknown" },
  {
    label: "Bytes",
    getValue: (item) => {
      const dl = formatBytes(item.bytesDownloaded);
      const total = formatBytes(item.bytesTotal);
      return item.bytesTotal ? `${dl} / ${total}` : dl;
    },
  },
  { label: "Last Update", getValue: (item) => relativeTime(item.lastUpdatedAt) },
  { label: "Error", getValue: (item) => item.error || "None", isError: true },
];

export function DownloadInspector({ item }: DownloadInspectorProps) {
  return (
    <div className="border-t-4 border-black bg-[#171411] p-4">
      <p className="neo-copy mb-3 text-[9px] font-bold text-[#087d6d] uppercase">Debug Inspector</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {rows.map((row) => {
          const value = row.getValue(item);
          return (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 border border-[#333] bg-[#1f1c17] px-3 py-2"
            >
              <span className="neo-copy text-[8px] font-bold text-[#8a8378] uppercase">
                {row.label}
              </span>
              <span
                className={`neo-copy max-w-[180px] truncate text-[9px] font-bold uppercase ${
                  row.isError && value !== "None" ? "text-[#c20b2f]" : "text-[#f5eedf]"
                }`}
                title={value}
              >
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
