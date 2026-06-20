import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  readActivePerformanceGameContext,
  resolvePerformanceAttribution,
} from "../lib/performance-context";
import {
  ACTIVE_GAME_PERFORMANCE_POLL_INTERVAL_MS,
  shouldPollPerformanceMetrics,
} from "../lib/performance-polling";
import { createBrowserPreviewMetrics } from "../lib/performance-preview";
import type { RealtimeMetrics } from "../lib/types/performance";

export function FpsHudPage() {
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null);
  const [isBrowserPreview, setIsBrowserPreview] = useState(() => !isTauri());
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(Date.now());
  const [performanceAttribution] = useState(() =>
    resolvePerformanceAttribution(readActivePerformanceGameContext()),
  );
  const shouldPollNativeMetrics = shouldPollPerformanceMetrics(performanceAttribution);

  useEffect(() => {
    const runsInTauri = isTauri();
    const applyBrowserPreview = () => {
      const elapsedSeconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setIsBrowserPreview(true);
      setMetrics(createBrowserPreviewMetrics(elapsedSeconds));
    };

    const tick = () => {
      if (!runsInTauri) {
        applyBrowserPreview();
        return;
      }

      invoke<RealtimeMetrics>("poll_performance_metrics")
        .then((m) => {
          setIsBrowserPreview(false);
          setMetrics(m);
        })
        .catch(() => {});
    };

    if (!shouldPollNativeMetrics) {
      applyBrowserPreview();
      return;
    }

    tick();
    const iv = setInterval(tick, ACTIVE_GAME_PERFORMANCE_POLL_INTERVAL_MS);

    const reportLoop = () => {
      invoke("report_frame_rendered").catch(() => {});
      rafRef.current = requestAnimationFrame(reportLoop);
    };
    if (runsInTauri) {
      rafRef.current = requestAnimationFrame(reportLoop);
    }

    return () => {
      clearInterval(iv);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [shouldPollNativeMetrics]);

  if (!metrics) {
    return (
      <div className="neo-copy flex h-full items-center justify-center text-[10px] font-black uppercase text-[#655f58]">
        •••
      </div>
    );
  }

  const color = metrics.fps >= 55 ? "#087d6d" : metrics.fps >= 30 ? "#f56c2d" : "#b7102a";

  return (
    <div className="neo-copy neo-dots flex h-full items-center gap-1.5 border-[3px] border-[#171411] bg-[#fbf8ef] px-2 py-1 text-[11px] font-black uppercase shadow-[3px_3px_0_#1f1c0f]">
      {isBrowserPreview && (
        <>
          <span className="border-2 border-[#171411] bg-[#9fe7dc] px-1 py-0.5 text-[8px] leading-none text-[#171411] shadow-[1px_1px_0_#1f1c0f]">
            Browser Preview
          </span>
          <span className="text-[#655f58]">|</span>
        </>
      )}
      <span style={{ color }}>{Math.round(metrics.fps)} FPS</span>
      <span className="text-[#655f58]">|</span>
      <span className="text-[#171411]">{Math.round(metrics.cpuPercent)}% CPU</span>
      {metrics.gpuPercent != null && (
        <>
          <span className="text-[#655f58]">|</span>
          <span className="text-[#171411]">{Math.round(metrics.gpuPercent)}% GPU</span>
        </>
      )}
    </div>
  );
}
