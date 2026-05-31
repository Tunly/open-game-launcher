import { HardDriveDownload, ListFilter } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { DownloadCard } from "../components/launcher/DownloadCard";
import type { DownloadItem } from "../lib/types";
import {
  archiveDownload,
  cancelDownload,
  getDownloadQueue,
  pauseDownload,
} from "../lib/launcher";
import { useDownloadStore } from "../stores/downloadStore";

type QueueFilter = "all" | "active" | "paused" | "done";

export function DownloadsPage() {
  const items = useDownloadStore((s) => s.items);
  const removeItem = useDownloadStore((s) => s.removeItem);
  const activeCount = useDownloadStore((s) => s.activeCount());
  const pausedCount = useDownloadStore((s) => s.pausedCount());
  const completedCount = useDownloadStore((s) => s.completedCount());
  const totalProgress = useDownloadStore((s) => s.totalProgress());
  const [filter, setFilter] = useState<QueueFilter>("all");

  useEffect(() => {
    let active = true;

    const unlistenPromise = listen<DownloadItem>(
      "download_progress",
      (event) => {
        if (!active) return;
        useDownloadStore.getState().upsertItem(event.payload);
      },
    );

    getDownloadQueue()
      .then((queue) => {
        if (active) {
          useDownloadStore.getState().setItems(queue);
        }
      })
      .catch(() => {});

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
      removeItem(item.gameId);
    } catch (err) {
      console.error("Failed to cancel download:", err);
    }
  }

  async function handleArchive(id: string) {
    const item = items.find((x) => x.id === id);
    if (!item) return;
    try {
      await archiveDownload(item.gameId);
      removeItem(item.gameId);
    } catch (err) {
      console.error("Failed to archive download:", err);
    }
  }

  const visibleItems = useMemo(() => {
    if (filter === "active") {
      return items.filter((item) => item.status === "downloading");
    }
    if (filter === "paused") {
      return items.filter((item) => item.status === "paused");
    }
    if (filter === "done") {
      return items.filter(
        (item) =>
          item.status === "completed" ||
          item.status === "failed" ||
          item.status === "cancelled" ||
          item.status === "error",
      );
    }
    return items;
  }, [filter, items]);

  return (
    <section>
      <div className="mb-8 border-b-4 border-black pb-4">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="neo-copy inline-flex border-2 border-black bg-[#087d6d] px-3 py-1 text-xs font-bold uppercase text-white shadow-[3px_3px_0_#171411]">
              Transfer active
            </span>
            <h1 className="neo-title mt-2 max-w-[680px] text-[clamp(3.4rem,15vw,6rem)] leading-[0.82] text-[#171411]">
              Download Queue
            </h1>
            <p className="neo-copy mt-3 text-xs font-bold uppercase text-[#55504a]">
              {activeCount} active transfers // {pausedCount} paused //{" "}
              {completedCount} completed
            </p>
          </div>

          <div className="grid w-full grid-cols-[40px_repeat(4,minmax(0,1fr))] border-2 border-black bg-[#f5eedf] shadow-[2px_2px_0_#171411] sm:w-fit">
            <span className="flex h-10 items-center justify-center">
              <ListFilter className="h-4 w-4" />
            </span>
            {[
              ["all", "All"],
              ["active", "Run"],
              ["paused", "Pause"],
              ["done", "Done"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={`neo-copy h-10 border-l-2 border-black px-3 text-[10px] font-bold uppercase sm:px-4 ${
                  filter === value
                    ? "bg-[#087d6d] text-white"
                    : "bg-[#f5eedf] text-[#171411] hover:bg-[#efe6d4]"
                }`}
                type="button"
                onClick={() => setFilter(value as QueueFilter)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="border-4 border-black bg-[#f5eedf] p-5 shadow-[4px_4px_0_#171411]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="neo-copy text-xs font-bold uppercase text-[#55504a]">
                Total load
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
            ["Active", activeCount],
            ["Pause", pausedCount],
            ["Complete", completedCount],
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
        {visibleItems.length > 0 ? (
          visibleItems.map((item, index) => (
            <DownloadCard
              key={item.id}
              index={index}
              item={item}
              onArchive={handleArchive}
              onCancel={handleCancel}
              onPauseToggle={handlePauseToggle}
            />
          ))
        ) : (
          <div className="neo-copy border-4 border-black bg-[#f5eedf] p-8 text-center text-xs font-bold uppercase text-[#55504a] shadow-[4px_4px_0_#171411]">
            No downloads in this stack.
          </div>
        )}
      </div>
    </section>
  );
}
