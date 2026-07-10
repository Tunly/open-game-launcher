import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
import type { NativeOverlaySettings } from "../lib/types/overlay";

export function FpsHudPage() {
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null);
  const [isBrowserPreview, setIsBrowserPreview] = useState(() => !isTauri());
  const [fpsHudEnabled, setFpsHudEnabled] = useState(() => !isTauri());
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(Date.now());
  const [performanceAttribution] = useState(() =>
    resolvePerformanceAttribution(readActivePerformanceGameContext()),
  );
  const [displaySettings, setDisplaySettings] = useState({ opacity: 0.95, showGpu: true });
  const shouldPollNativeMetrics = shouldPollPerformanceMetrics(performanceAttribution);

  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;
    let mounted = true;
    const applySettings = (settings: NativeOverlaySettings) => {
      if (!mounted) return;
      const isEnabled = settings.fpsHudEnabled === true;
      setFpsHudEnabled(isEnabled);
      if (!isEnabled) {
        setMetrics(null);
        const currentWindow = getCurrentWindow();
        if (currentWindow.label === "fps_hud") {
          void currentWindow.close().catch(() => {});
        }
        return;
      }
      setDisplaySettings({
        opacity:
          typeof settings.opacity === "number"
            ? Math.min(1, Math.max(0.5, settings.opacity))
            : 0.95,
        showGpu: settings.showGpu ?? true,
      });
    };

    void invoke<NativeOverlaySettings>("get_overlay_settings")
      .then(applySettings)
      .catch(() => {});
    void listen<NativeOverlaySettings>("overlay-settings-updated", (event) => {
      applySettings(event.payload);
    }).then((cleanup) => {
      if (mounted) {
        unlisten = cleanup;
      } else {
        cleanup();
      }
    });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const runsInTauri = isTauri();
    if (runsInTauri && !fpsHudEnabled) return;

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
  }, [fpsHudEnabled, shouldPollNativeMetrics]);

  if (!fpsHudEnabled) return null;

  if (!metrics) {
    return (
      <div className="neo-copy flex h-full items-center justify-center text-[10px] font-black text-[#655f58] uppercase">
        •••
      </div>
    );
  }

  const color = metrics.fps >= 55 ? "#087d6d" : metrics.fps >= 30 ? "#f56c2d" : "#b7102a";

  return (
    <div
      className="neo-copy neo-dots flex h-full items-center gap-1.5 border-[3px] border-[#171411] bg-[#fbf8ef] px-2 py-1 text-[11px] font-black uppercase shadow-[3px_3px_0_#1f1c0f]"
      style={{ opacity: displaySettings.opacity }}
    >
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
      {displaySettings.showGpu && metrics.gpuPercent != null && (
        <>
          <span className="text-[#655f58]">|</span>
          <span className="text-[#171411]">{Math.round(metrics.gpuPercent)}% GPU</span>
        </>
      )}
    </div>
  );
}
