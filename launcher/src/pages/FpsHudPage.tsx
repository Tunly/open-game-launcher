import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RealtimeMetrics } from "../lib/types/performance";

export function FpsHudPage() {
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      invoke<RealtimeMetrics>("poll_performance_metrics")
        .then((m) => setMetrics(m))
        .catch(() => {});
    };
    tick();
    const iv = setInterval(tick, 1500);

    const reportLoop = () => {
      invoke("report_frame_rendered").catch(() => {});
      rafRef.current = requestAnimationFrame(reportLoop);
    };
    rafRef.current = requestAnimationFrame(reportLoop);

    return () => {
      clearInterval(iv);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!metrics) {
    return (
      <div className="neo-copy flex h-full items-center justify-center text-[10px] font-black uppercase text-[#655f58]">
        •••
      </div>
    );
  }

  const color = metrics.fps >= 55 ? "#087d6d" : metrics.fps >= 30 ? "#f56c2d" : "#b7102a";

  return (
    <div className="neo-copy flex h-full items-center gap-2 border-[3px] border-[#171411] bg-[#fbf8ef] px-2 py-1 text-[11px] font-black uppercase shadow-[3px_3px_0_#1f1c0f]">
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
