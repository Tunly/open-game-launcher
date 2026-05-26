import { HardDriveDownload, ListFilter } from "lucide-react";
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { DownloadCard } from "../components/launcher/DownloadCard";
import type { DownloadItem } from "../lib/types";
import {
  cancelDownload,
  getDownloadQueue,
  pauseDownload,
} from "../lib/launcher";

export function DownloadsPage() {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadQueue() {
      try {
        const queue = await getDownloadQueue();
        if (active) {
          setItems(queue);
        }
      } catch (err) {
        console.error("Failed to load download queue:", err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadQueue();

    // Listen to download progress events
    const unlistenPromise = listen<DownloadItem>(
      "download_progress",
      (event) => {
        if (!active) return;
        const payload = event.payload;

        setItems((current) => {
          const index = current.findIndex((item) => item.gameId === payload.gameId);
          if (index > -1) {
            // Update existing item
            const updated = [...current];
            updated[index] = {
              ...updated[index],
              progress: payload.progress,
              speed: payload.speed,
              status: payload.status,
              eta: payload.eta,
              // Keep title if payload has empty title
              title: payload.title || updated[index].title,
            };
            return updated;
          } else {
            // Add new item
            return [...current, payload];
          }
        });
      },
    );

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  async function handlePauseToggle(id: string) {
    const item = items.find((x) => x.id === id);
    if (!item) return;

    try {
      await pauseDownload(item.gameId);
    } catch (err) {
      console.error("Failed to toggle pause:", err);
    }
  }

  async function handleCancel(id: string) {
    const item = items.find((x) => x.id === id);
    if (!item) return;

    try {
      await cancelDownload(item.gameId);
      setItems((current) => current.filter((x) => x.id !== id));
    } catch (err) {
      console.error("Failed to cancel download:", err);
    }
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
          <div className="min-w-0">
            <span className="neo-copy inline-flex border-2 border-black bg-[#087d6d] px-3 py-1 text-xs font-bold uppercase text-white shadow-[3px_3px_0_#171411]">
              Transfer aktiv
            </span>
            <h1 className="neo-title mt-2 max-w-[680px] text-[clamp(3.4rem,15vw,6rem)] leading-[0.82] text-[#171411]">
              Download Queue
            </h1>
            <p className="neo-copy mt-3 text-xs font-bold uppercase text-[#55504a]">
              {activeCount} aktive Transfers // {pausedCount} pausiert //{" "}
              {completedCount} abgeschlossen
            </p>
          </div>

          <button
            className="neo-copy flex h-10 w-full items-center justify-center gap-3 border-2 border-black bg-[#f5eedf] px-5 text-xs font-bold uppercase shadow-[2px_2px_0_#171411] sm:w-fit"
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
              <p className="mt-1 text-[clamp(2rem,10vw,2.25rem)] font-black uppercase text-[#171411]">
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
        {loading ? (
          <div className="neo-copy border-4 border-black bg-[#f5eedf] p-8 text-center text-xs font-bold uppercase text-[#55504a] shadow-[4px_4px_0_#171411]">
            Lade Download-Warteschlange...
          </div>
        ) : items.length > 0 ? (
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
