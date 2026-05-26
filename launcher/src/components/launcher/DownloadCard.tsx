import { Pause, Play, RotateCcw, X } from "lucide-react";

import type { DownloadItem, DownloadStatus } from "../../lib/types";

interface DownloadCardProps {
  index?: number;
  item: DownloadItem;
  onCancel: (id: string) => void;
  onPauseToggle: (id: string) => void;
}

const statusLabel: Record<DownloadStatus, string> = {
  completed: "Abgeschlossen",
  downloading: "Lauft",
  failed: "Fehler",
  paused: "Pausiert",
  cancelled: "Abgebrochen",
  error: "Fehler",
};

const statusClass: Record<DownloadStatus, string> = {
  completed: "bg-[#087d6d] text-white",
  downloading: "bg-[#c20b2f] text-white",
  failed: "bg-[#171411] text-white",
  paused: "bg-[#efe6d4] text-[#171411]",
  cancelled: "bg-[#171411] text-white",
  error: "bg-[#171411] text-white",
};

const platformColors: Record<string, string> = {
  "Steam": "bg-[#0b1c2e] text-[#66c0f4] border-[#66c0f4]",
  "Epic Games": "bg-[#1f1f1f] text-white border-white",
  "GOG Galaxy": "bg-[#4f0c6b] text-[#fbf0ff] border-[#fbf0ff]",
  "EA App": "bg-[#f54242] text-white border-[#f54242]",
  "Ubisoft Connect": "bg-[#0070b8] text-white border-[#0070b8]",
  "Xbox Game Pass": "bg-[#107c10] text-white border-[#107c10]",
  "OG Store": "bg-[#087d6d] text-white border-black",
};

export function DownloadCard({
  index = 0,
  item,
  onCancel,
  onPauseToggle,
}: DownloadCardProps) {
  const canControl = item.status === "downloading" || item.status === "paused";
  const isComplete = item.status === "completed";
  const queueNumber = String(index + 1).padStart(2, "0");

  return (
    <article className="grid overflow-hidden border-4 border-black bg-[#f5eedf] shadow-[4px_4px_0_#171411] lg:grid-cols-[96px_1fr_210px]">
      <div className="flex min-h-16 items-center justify-center border-b-4 border-black bg-[#171411] text-[#f5eedf] lg:min-h-24 lg:border-b-0 lg:border-r-4">
        <span className="neo-title text-4xl leading-none lg:text-5xl">
          {queueNumber}
        </span>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                Paket-ID: {item.gameId}
              </span>
              {item.platform && (
                <span className={`neo-copy border px-1.5 py-0.2 text-[8px] font-extrabold uppercase shadow-[1px_1px_0_#171411] ${platformColors[item.platform] || "bg-[#efe6d4] text-[#171411] border-black"}`}>
                  {item.platform}
                </span>
              )}
            </div>
            <h2 className="mt-1 text-[clamp(1.5rem,8vw,1.875rem)] font-black uppercase leading-none text-[#171411]">
              {item.title}
            </h2>
          </div>
          <span
            className={`neo-copy border-2 border-black px-3 py-1 text-xs font-bold uppercase shadow-[2px_2px_0_#171411] ${statusClass[item.status]}`}
          >
            {statusLabel[item.status]}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="neo-copy text-xs font-bold uppercase text-[#55504a]">
            {item.progress}% komplett
          </p>
          <p className="neo-copy text-xs font-bold uppercase text-[#55504a]">
            {item.speed}
          </p>
        </div>
        <div className="mt-3 h-4 border-2 border-black bg-[#efe6d4]">
          <div
            className={`h-full ${isComplete ? "bg-[#087d6d]" : "bg-[#c20b2f]"}`}
            style={{ width: `${item.progress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 border-t-4 border-black lg:grid-cols-1 lg:border-l-4 lg:border-t-0">
        {canControl ? (
          <button
            className="neo-copy flex min-h-14 items-center justify-center gap-2 border-r-2 border-black bg-[#f5eedf] px-4 text-xs font-bold uppercase hover:bg-[#efe6d4] lg:border-b-2 lg:border-r-0"
            type="button"
            onClick={() => onPauseToggle(item.id)}
          >
            {item.status === "downloading" ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
            {item.status === "downloading" ? "Pause" : "Weiter"}
          </button>
        ) : (
          <button
            className="neo-copy flex min-h-14 items-center justify-center gap-2 border-r-2 border-black bg-[#087d6d] px-4 text-xs font-bold uppercase text-white lg:border-b-2 lg:border-r-0"
            type="button"
          >
            <RotateCcw className="h-4 w-4" />
            Archiv
          </button>
        )}
        {item.status !== "completed" ? (
          <button
            className="neo-copy flex min-h-14 items-center justify-center gap-2 bg-[#c20b2f] px-4 text-xs font-bold uppercase text-white hover:bg-[#a50826]"
            type="button"
            onClick={() => onCancel(item.id)}
          >
            <X className="h-4 w-4" />
            Abbrechen
          </button>
        ) : (
          <button
            className="neo-copy min-h-14 bg-[#f5eedf] px-4 text-xs font-bold uppercase text-[#171411]"
            type="button"
          >
            Bereit
          </button>
        )}
      </div>
    </article>
  );
}
