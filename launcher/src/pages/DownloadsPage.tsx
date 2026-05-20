import { useState } from "react";

import { DownloadCard } from "../components/launcher/DownloadCard";
import { Badge } from "../components/ui/Badge";
import { downloads as mockDownloads } from "../lib/mock-data";
import type { DownloadItem } from "../lib/types";

export function DownloadsPage() {
  const [items, setItems] = useState<DownloadItem[]>(mockDownloads);

  function handlePauseToggle(id: string) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) {
          return item;
        }

        if (item.status === "downloading") {
          return { ...item, speed: "Paused", status: "paused" };
        }

        if (item.status === "paused") {
          return { ...item, speed: "12.8 MB/s", status: "downloading" };
        }

        return item;
      }),
    );
  }

  function handleCancel(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Badge variant="info">
          {items.filter((item) => item.status === "downloading").length} active
        </Badge>
        <Badge variant="warning">
          {items.filter((item) => item.status === "paused").length} paused
        </Badge>
        <Badge variant="success">
          {items.filter((item) => item.status === "completed").length} completed
        </Badge>
      </div>

      <div className="space-y-4">
        {items.length > 0 ? (
          items.map((item) => (
            <DownloadCard
              key={item.id}
              item={item}
              onCancel={handleCancel}
              onPauseToggle={handlePauseToggle}
            />
          ))
        ) : (
          <div className="rounded-lg border border-white/10 bg-launcher-panel p-8 text-center text-slate-400">
            No active downloads.
          </div>
        )}
      </div>
    </section>
  );
}
