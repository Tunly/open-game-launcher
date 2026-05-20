import { HardDriveDownload, ListFilter } from "lucide-react";
import { useState } from "react";

import { DownloadCard } from "../components/launcher/DownloadCard";
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
          return { ...item, speed: "Pausiert", status: "paused" };
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

  const activeCount = items.filter((item) => item.status === "downloading").length;
  const pausedCount = items.filter((item) => item.status === "paused").length;
  const completedCount = items.filter((item) => item.status === "completed").length;
  const totalProgress = items.length
    ? Math.round(
        items.reduce((sum, item) => sum + item.progress, 0) / items.length,
      )
    : 0;

  return (
    <section>
      <div className="mb-8 border-b-4 border-black pb-4">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="neo-copy inline-flex border-2 border-black bg-[#087d6d] px-3 py-1 text-xs font-bold uppercase text-white shadow-[3px_3px_0_#171411]">
              Transfer aktiv
            </span>
            <h1 className="neo-title mt-2 max-w-[520px] text-7xl leading-[0.82] text-[#171411] sm:text-8xl">
              Download Queue
            </h1>
            <p className="neo-copy mt-3 text-xs font-bold uppercase text-[#55504a]">
              {activeCount} aktive Transfers // {pausedCount} pausiert //{" "}
              {completedCount} abgeschlossen
            </p>
          </div>

          <button
            className="neo-copy flex h-10 w-fit items-center gap-3 border-2 border-black bg-[#f5eedf] px-5 text-xs font-bold uppercase shadow-[2px_2px_0_#171411]"
            type="button"
          >
            <ListFilter className="h-4 w-4" />
            Queue filtern
          </button>
        </div>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="border-4 border-black bg-[#f5eedf] p-5 shadow-[4px_4px_0_#171411]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="neo-copy text-xs font-bold uppercase text-[#55504a]">
                Gesamtauslastung
              </p>
              <p className="mt-1 text-4xl font-black uppercase text-[#171411]">
                {totalProgress}%
              </p>
            </div>
            <HardDriveDownload className="h-12 w-12 text-[#c20b2f]" />
          </div>
          <div className="mt-5 h-4 border-2 border-black bg-[#efe6d4]">
            <div
              className="h-full bg-[#c20b2f]"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 border-4 border-black bg-[#171411] text-center text-[#f5eedf] shadow-[4px_4px_0_#171411] lg:grid-cols-1">
          {[
            ["Aktiv", activeCount],
            ["Pause", pausedCount],
            ["Fertig", completedCount],
          ].map(([label, value]) => (
            <div
              key={label}
              className="border-[#f5eedf] p-3 not-last:border-r lg:not-last:border-b lg:not-last:border-r-0"
            >
              <p className="text-3xl font-black">{value}</p>
              <p className="neo-copy text-[10px] font-bold uppercase">
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {items.length > 0 ? (
          items.map((item, index) => (
            <DownloadCard
              key={item.id}
              index={index}
              item={item}
              onCancel={handleCancel}
              onPauseToggle={handlePauseToggle}
            />
          ))
        ) : (
          <div className="neo-copy border-4 border-black bg-[#f5eedf] p-8 text-center text-xs font-bold uppercase text-[#55504a] shadow-[4px_4px_0_#171411]">
            Keine aktiven Downloads.
          </div>
        )}
      </div>
    </section>
  );
}
