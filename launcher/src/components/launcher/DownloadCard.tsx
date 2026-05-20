import { Pause, Play, X } from "lucide-react";

import { Badge, type BadgeVariant } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import type { DownloadItem, DownloadStatus } from "../../lib/types";

interface DownloadCardProps {
  item: DownloadItem;
  onCancel: (id: string) => void;
  onPauseToggle: (id: string) => void;
}

const statusVariant: Record<DownloadStatus, BadgeVariant> = {
  downloading: "info",
  paused: "warning",
  completed: "success",
  failed: "danger",
};

export function DownloadCard({
  item,
  onCancel,
  onPauseToggle,
}: DownloadCardProps) {
  const canControl = item.status === "downloading" || item.status === "paused";

  return (
    <article className="rounded-lg border border-white/10 bg-launcher-panel p-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-bold text-white">{item.title}</h2>
            <Badge variant={statusVariant[item.status]}>{item.status}</Badge>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>{item.progress}% complete</span>
              <span>{item.speed}</span>
            </div>
            <ProgressBar value={item.progress} />
          </div>
        </div>

        <div className="flex gap-2">
          {canControl ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onPauseToggle(item.id)}
            >
              {item.status === "downloading" ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {item.status === "downloading" ? "Pause" : "Resume"}
            </Button>
          ) : null}
          {item.status !== "completed" ? (
            <Button size="sm" variant="danger" onClick={() => onCancel(item.id)}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
