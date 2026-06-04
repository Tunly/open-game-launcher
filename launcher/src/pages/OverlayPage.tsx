import { useCallback, useEffect, useRef, useState } from "react";
import {
  X, Camera, MessageSquare, Trophy, Activity, Users, Send,
  Loader2, ShieldAlert, Zap, Monitor, Clock, Hash, Settings,
  Trash2, Upload, Image, CheckCircle2, Gamepad2, Swords,
  ChevronDown, ChevronUp, Award, Flame, Star, CircleDot, Lock,
  Grip, Pin, PinOff,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  getMyGroupChats, sendGroupMessage, subscribeToGroupMessages,
  type GroupChatInfo,
} from "../lib/supabase/social";
import { getSupabaseClient } from "../lib/supabase/client";
import { getVisiblePresence, subscribeToPresenceChanges } from "../lib/supabase/presence";
import { launchCrossPlayJoin, listInstalledGames } from "../lib/launcher";
import { listScreenshots, deleteScreenshot, captureScreenshot } from "../lib/overlay";
import { getMyScreenshots } from "../lib/supabase/screenshots";
import { getMyFriendLinks } from "../lib/supabase/friend-links";
import { sendGameInvite } from "../lib/supabase/social";
import type { UserPresence, ChatMessage } from "../lib/types/profile";
import type { Game, UnifiedAchievement } from "../lib/types";
import type { RealtimeMetrics } from "../lib/types/performance";
import type { ScreenshotMeta } from "../lib/types/overlay";
import type { Screenshot } from "../lib/types/screenshots";
import type { FriendLink } from "../lib/types/friends";

interface AntiCheatInfo {
  name: string;
  blocks_overlay: boolean;
  process_name: string;
}

type OverlayPanel = "friends" | "chat" | "achievements" | "perf" | "screenshots" | "settings";
type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface OverlayPanelState {
  height: number;
  pinned: boolean;
  width: number;
  x: number;
  y: number;
}

export function OverlayPage() {
  const sessionStartedAt = useRef(Date.now());
  const [openPanels, setOpenPanels] = useState<OverlayPanel[]>([]);
  const [panelStates, setPanelStates] = useState<Partial<Record<OverlayPanel, OverlayPanelState>>>({});
  const [acList, setAcList] = useState<AntiCheatInfo[]>([]);
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let mounted = true;
    invoke<AntiCheatInfo[]>("detect_anti_cheat_processes")
      .then((list) => {
        if (mounted) setAcList(list);
      })
      .catch((err) => {
        console.warn("[overlay] anti-cheat detection failed:", err);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const closeOverlay = useCallback(() => {
    const pinnedPanels = openPanels.filter((panel) => panelStates[panel]?.pinned);
    if (pinnedPanels.length > 0) {
      setOpenPanels(pinnedPanels);
      setIsChromeVisible(false);
      return;
    }

    void invoke("toggle_in_game_overlay").catch((err) => {
      console.error("[overlay] close failed:", err);
    });
  }, [openPanels, panelStates]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeOverlay();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeOverlay]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("overlay-global-toggle", () => {
      if (isChromeVisible) {
        closeOverlay();
      } else {
        setIsChromeVisible(true);
      }
    }).then((cleanup) => {
      unlisten = cleanup;
    }).catch((err) => {
      console.warn("[overlay] global toggle listener failed:", err);
    });

    return () => {
      unlisten?.();
    };
  }, [closeOverlay, isChromeVisible]);

  useEffect(() => {
    if (isChromeVisible) return;
    if (openPanels.some((panel) => panelStates[panel]?.pinned)) return;
    void invoke("toggle_in_game_overlay").catch((err) => {
      console.error("[overlay] close failed:", err);
    });
  }, [isChromeVisible, openPanels, panelStates]);

  const blocked = acList.some((ac) => ac.blocks_overlay);
  const sessionSeconds = Math.max(0, Math.floor((now.getTime() - sessionStartedAt.current) / 1000));

  const ensurePanelState = useCallback((panel: OverlayPanel) => {
    setPanelStates((current) => {
      if (current[panel]) return current;
      return {
        ...current,
        [panel]: createDefaultPanelState(panel, openPanels.length),
      };
    });
  }, [openPanels.length]);

  const focusPanel = useCallback((panel: OverlayPanel) => {
    setOpenPanels((current) => [...current.filter((item) => item !== panel), panel]);
  }, []);

  const openPanel = useCallback((panel: OverlayPanel) => {
    setIsChromeVisible(true);
    ensurePanelState(panel);
    setOpenPanels((current) => {
      if (current.includes(panel)) {
        return [...current.filter((item) => item !== panel), panel];
      }
      return [...current, panel];
    });
  }, [ensurePanelState]);

  const closePanel = useCallback((panel: OverlayPanel) => {
    setOpenPanels((current) => current.filter((item) => item !== panel));
  }, []);

  const togglePanelPinned = useCallback((panel: OverlayPanel) => {
    ensurePanelState(panel);
    setPanelStates((current) => {
      const state = current[panel] ?? createDefaultPanelState(panel, openPanels.length);
      return {
        ...current,
        [panel]: { ...state, pinned: !state.pinned },
      };
    });
    focusPanel(panel);
  }, [ensurePanelState, focusPanel, openPanels.length]);

  const updatePanelState = useCallback((panel: OverlayPanel, update: (state: OverlayPanelState) => OverlayPanelState) => {
    setPanelStates((current) => {
      const state = current[panel] ?? createDefaultPanelState(panel, openPanels.length);
      return {
        ...current,
        [panel]: clampPanelState(update(state)),
      };
    });
  }, [openPanels.length]);

  const dockItems: Array<
    | { type: "panel"; panel: OverlayPanel; label: string; icon: React.ElementType }
    | { type: "action"; id: string; label: string; icon: React.ElementType; onClick: () => void }
  > = [
    { type: "panel", panel: "friends", label: "Freunde", icon: Users },
    { type: "panel", panel: "chat", label: "Chat", icon: MessageSquare },
    { type: "panel", panel: "achievements", label: "Erfolge", icon: Trophy },
    { type: "panel", panel: "perf", label: "Performance", icon: Activity },
    { type: "panel", panel: "screenshots", label: "Screenshots", icon: Image },
    {
      type: "action",
      id: "capture",
      label: "Screenshot aufnehmen",
      icon: Camera,
      onClick: () => {
        void captureScreenshot()
          .then((meta) => console.log("[screenshot] saved:", meta.path))
          .catch(console.error);
      },
    },
    {
      type: "action",
      id: "fps",
      label: "FPS-HUD",
      icon: Monitor,
      onClick: () => {
        void invoke("toggle_fps_hud").catch((err) => {
          console.error("[fps-hud] toggle failed:", err);
        });
      },
    },
    { type: "panel", panel: "settings", label: "Einstellungen", icon: Settings },
  ];

  return (
    <div className={`relative h-screen w-screen overflow-hidden text-white ${isChromeVisible ? "bg-black/70" : "bg-transparent"}`}>
      {isChromeVisible && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(255,249,237,0.11)_1px,transparent_1px)] bg-[length:10px_10px] opacity-40" />
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_130px_rgba(0,0,0,0.75)]" />
        </>
      )}

      {isChromeVisible && (
        <>
          <div className="absolute left-6 top-5 z-20 neo-copy text-[11px] font-black uppercase leading-5 text-[#fff9ed] drop-shadow-[2px_2px_0_#171411]">
            <div className="text-lg leading-none">{now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</div>
            <div>{now.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })}</div>
            <div>{formatSessionTime(sessionSeconds)} Session</div>
          </div>

          <div className="absolute left-1/2 top-5 z-20 -translate-x-1/2 text-center">
            <div className="mx-auto mb-1 grid h-10 w-10 place-items-center border-[3px] border-[#171411] bg-[#b7102a] text-[#fff9ed] shadow-[4px_4px_0_#1f1c0f]">
              <Gamepad2 size={22} />
            </div>
            <div className="neo-title text-lg font-bold uppercase text-[#fff9ed] drop-shadow-[3px_3px_0_#171411]">
              OG-Launcher
            </div>
          </div>

          <div className="absolute right-6 top-5 z-20 flex items-center gap-2">
            <button
              onClick={closeOverlay}
              className="neo-copy border-2 border-[#fff9ed] bg-[#171411]/70 px-3 py-1.5 text-[11px] font-black uppercase text-[#fff9ed] shadow-[3px_3px_0_#000] hover:-translate-y-0.5 hover:bg-[#087d6d]"
            >
              Back to Game
            </button>
            <button
              onClick={closeOverlay}
              className="grid h-9 w-9 place-items-center border-2 border-[#fff9ed] bg-[#171411]/70 shadow-[3px_3px_0_#000] hover:-translate-y-0.5 hover:bg-[#b7102a]"
              title="Overlay schliessen"
            >
              <X size={18} />
            </button>
          </div>
        </>
      )}

      {isChromeVisible && (blocked || acList.length > 0) && (
        <div className={`absolute left-1/2 top-24 z-20 flex max-w-[min(760px,calc(100vw-32px))] -translate-x-1/2 items-center gap-2 border-[3px] border-[#171411] px-3 py-2 neo-copy text-[11px] font-black uppercase text-white shadow-[4px_4px_0_#000] ${blocked ? "bg-[#b7102a]" : "bg-[#087d6d]"}`}>
          <ShieldAlert size={15} />
          {blocked
            ? `Overlay blockiert: ${acList.filter((a) => a.blocks_overlay).map((a) => a.name).join(", ")}`
            : `AC erkannt: ${acList.map((a) => a.name).join(", ")}`}
        </div>
      )}

      {openPanels.map((panel, index) => {
        const state = panelStates[panel] ?? createDefaultPanelState(panel, index);
        return (
          <OverlayPanelShell
            key={panel}
            onClose={() => closePanel(panel)}
            onFocus={() => focusPanel(panel)}
            onPinnedChange={() => togglePanelPinned(panel)}
            onStateChange={(update) => updatePanelState(panel, update)}
            state={state}
            title={overlayPanelTitle(panel)}
            zIndex={20 + index}
          >
            {panel === "friends" && <OverlayFriendsTab />}
            {panel === "chat" && <OverlayChatTab />}
            {panel === "achievements" && <OverlayAchievementsTab />}
            {panel === "perf" && <OverlayPerfTab />}
            {panel === "screenshots" && <OverlayScreenshotsTab />}
            {panel === "settings" && <OverlaySettingsPanel onClose={() => closePanel(panel)} />}
          </OverlayPanelShell>
        );
      })}

      {isChromeVisible && (
      <nav className="absolute bottom-5 left-1/2 z-30 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-1 overflow-x-auto border-[3px] border-[#171411] bg-[#fff9ed] p-1.5 shadow-[5px_5px_0_#000]">
        {dockItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.type === "panel" && openPanels.includes(item.panel);
          const key = item.type === "panel" ? item.panel : item.id;
          return (
            <button
              key={key}
              onClick={() => {
                if (item.type === "panel") {
                  if (openPanels.includes(item.panel) && !panelStates[item.panel]?.pinned) {
                    closePanel(item.panel);
                  } else {
                    openPanel(item.panel);
                  }
                } else {
                  item.onClick();
                }
              }}
              className={`grid h-10 w-10 shrink-0 place-items-center border-2 border-[#171411] shadow-[2px_2px_0_#1f1c0f] transition-transform hover:-translate-y-0.5 ${
                isActive ? "bg-[#087d6d] text-white" : "bg-[#efe6d4] text-[#171411] hover:bg-[#f6edd8]"
              }`}
              title={item.label}
              aria-label={item.label}
            >
              <Icon size={18} />
            </button>
          );
        })}
      </nav>
      )}
    </div>
  );
}

function OverlayPanelShell({
  children,
  onClose,
  onFocus,
  onPinnedChange,
  onStateChange,
  state,
  title,
  zIndex,
}: {
  children: React.ReactNode;
  onClose: () => void;
  onFocus: () => void;
  onPinnedChange: () => void;
  onStateChange: (update: (state: OverlayPanelState) => OverlayPanelState) => void;
  state: OverlayPanelState;
  title: string;
  zIndex: number;
}) {
  const dragStart = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const resizeStart = useRef<{
    direction: ResizeDirection;
    height: number;
    pointerX: number;
    pointerY: number;
    width: number;
    x: number;
    y: number;
  } | null>(null);

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    onFocus();
    dragStart.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: state.x,
      y: state.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const start = dragStart.current;
    if (!start) return;
    onStateChange((current) => ({
      ...current,
      x: start.x + event.clientX - start.pointerX,
      y: start.y + event.clientY - start.pointerY,
    }));
  };

  const stopDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragStart.current) return;
    dragStart.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const startResize = (direction: ResizeDirection, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onFocus();
    resizeStart.current = {
      direction,
      height: state.height,
      pointerX: event.clientX,
      pointerY: event.clientY,
      width: state.width,
      x: state.x,
      y: state.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStart.current;
    if (!start) return;
    const deltaX = event.clientX - start.pointerX;
    const deltaY = event.clientY - start.pointerY;
    const fromWest = start.direction.includes("w");
    const fromEast = start.direction.includes("e");
    const fromNorth = start.direction.includes("n");
    const fromSouth = start.direction.includes("s");

    onStateChange((current) => {
      const nextWidth = start.width + (fromEast ? deltaX : 0) - (fromWest ? deltaX : 0);
      const nextHeight = start.height + (fromSouth ? deltaY : 0) - (fromNorth ? deltaY : 0);
      return {
        ...current,
        height: nextHeight,
        width: nextWidth,
        x: fromWest ? start.x + deltaX : current.x,
        y: fromNorth ? start.y + deltaY : current.y,
      };
    });
  };

  const stopResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStart.current) return;
    resizeStart.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <section
      className="absolute flex flex-col border-[3px] border-[#171411] bg-[#fbf8ef] text-[#171411] shadow-[7px_7px_0_#000] neo-dots"
      onMouseDown={onFocus}
      style={{
        height: state.height,
        left: state.x,
        top: state.y,
        width: state.width,
        zIndex,
      }}
    >
      <header
        className="flex cursor-move select-none items-center justify-between gap-3 border-b-[3px] border-[#171411] bg-[#fff9ed] px-3 py-2"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Grip size={16} className="shrink-0 text-[#655f58]" />
          <h2 className="truncate neo-title text-lg font-bold uppercase text-[#b7102a]">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onPinnedChange();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className={`grid h-8 w-8 place-items-center border-2 border-[#171411] shadow-[2px_2px_0_#1f1c0f] hover:-translate-y-0.5 ${state.pinned ? "bg-[#087d6d] text-white" : "bg-[#efe6d4] text-[#171411]"}`}
            title={state.pinned ? "Pin loesen" : "Panel pinnen"}
          >
            {state.pinned ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className="grid h-8 w-8 place-items-center border-2 border-[#171411] bg-[#b7102a] text-white shadow-[2px_2px_0_#1f1c0f] hover:-translate-y-0.5"
            title="Panel schliessen"
          >
            <X size={16} />
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-3">
        {children}
      </main>
      <OverlayPanelResizeHandles
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerStop={stopResize}
      />
    </section>
  );
}

function OverlayPanelResizeHandles({
  onPointerDown,
  onPointerMove,
  onPointerStop,
}: {
  onPointerDown: (direction: ResizeDirection, event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerStop: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const handles: Array<{ className: string; direction: ResizeDirection }> = [
    { direction: "n", className: "left-3 right-3 top-[-5px] h-3 cursor-ns-resize" },
    { direction: "s", className: "bottom-[-5px] left-3 right-3 h-3 cursor-ns-resize" },
    { direction: "e", className: "bottom-3 right-[-5px] top-3 w-3 cursor-ew-resize" },
    { direction: "w", className: "bottom-3 left-[-5px] top-3 w-3 cursor-ew-resize" },
    { direction: "ne", className: "right-[-6px] top-[-6px] h-5 w-5 cursor-nesw-resize" },
    { direction: "nw", className: "left-[-6px] top-[-6px] h-5 w-5 cursor-nwse-resize" },
    { direction: "se", className: "bottom-[-6px] right-[-6px] h-5 w-5 cursor-nwse-resize" },
    { direction: "sw", className: "bottom-[-6px] left-[-6px] h-5 w-5 cursor-nesw-resize" },
  ];

  return (
    <>
      {handles.map((handle) => (
        <div
          key={handle.direction}
          aria-hidden="true"
          className={`absolute z-10 ${handle.className}`}
          onPointerCancel={onPointerStop}
          onPointerDown={(event) => onPointerDown(handle.direction, event)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerStop}
        />
      ))}
    </>
  );
}

function overlayPanelTitle(panel: OverlayPanel) {
  const titles: Record<OverlayPanel, string> = {
    achievements: "Erfolge",
    chat: "Chat",
    friends: "Freunde",
    perf: "Performance",
    screenshots: "Screenshots",
    settings: "Overlay Einstellungen",
  };

  return titles[panel];
}

function formatSessionTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function createDefaultPanelState(panel: OverlayPanel, offsetIndex = 0): OverlayPanelState {
  const viewportWidth = Math.max(window.innerWidth || 1280, 360);
  const viewportHeight = Math.max(window.innerHeight || 720, 480);
  const width = panel === "chat" ? 700 : 640;
  const height = panel === "chat" ? 560 : 520;
  const offset = Math.min(offsetIndex * 28, 112);

  return clampPanelState({
    height: Math.min(height, viewportHeight - 120),
    pinned: false,
    width: Math.min(width, viewportWidth - 32),
    x: Math.round((viewportWidth - Math.min(width, viewportWidth - 32)) / 2 + offset),
    y: Math.round((viewportHeight - Math.min(height, viewportHeight - 120)) / 2 + offset),
  });
}

function clampPanelState(state: OverlayPanelState): OverlayPanelState {
  const viewportWidth = Math.max(window.innerWidth || 1280, 360);
  const viewportHeight = Math.max(window.innerHeight || 720, 480);
  const minWidth = 340;
  const minHeight = 260;
  const maxWidth = Math.max(minWidth, viewportWidth - 16);
  const maxHeight = Math.max(minHeight, viewportHeight - 96);
  const width = Math.min(Math.max(state.width, minWidth), maxWidth);
  const height = Math.min(Math.max(state.height, minHeight), maxHeight);
  const maxX = viewportWidth - 32;
  const maxY = viewportHeight - 74;

  return {
    ...state,
    height,
    width,
    x: Math.min(Math.max(state.x, 8 - width + 96), maxX),
    y: Math.min(Math.max(state.y, 8), maxY),
  };
}

/* ========== SETTINGS PANEL ========== */
function OverlaySettingsPanel({ onClose }: { onClose: () => void }) {
  const [hotkey, setHotkey] = useState("Shift+F1");
  const [opacity, setOpacity] = useState(95);
  const [pos, setPos] = useState<"top_left" | "top_right" | "bottom_left" | "bottom_right">("bottom_right");

  return (
    <div className="w-full border-[3px] border-[#171411] bg-[#f6edd8] p-3 shadow-[4px_4px_0_#1f1c0f]">
      <div className="mb-2 border-b-[3px] border-[#171411] pb-1 text-[11px] font-black uppercase text-[#b7102a] neo-title">Overlay-Einstellungen</div>
      <div className="space-y-2">
        <div>
          <label className="neo-copy text-[10px] font-bold text-[#655f58]">Hotkey</label>
          <input value={hotkey} onChange={(e) => setHotkey(e.target.value)} className="mt-1 w-full border-2 border-[#171411] bg-[#fff9ed] px-2 py-1 text-[11px] text-[#171411] neo-copy outline-none shadow-[2px_2px_0_#1f1c0f]" />
        </div>
        <div>
          <label className="neo-copy text-[10px] font-bold text-[#655f58]">Deckkraft {opacity}%</label>
          <input type="range" min="50" max="100" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="mt-1 w-full" />
        </div>
        <div>
          <label className="neo-copy text-[10px] font-bold text-[#655f58]">Position</label>
          <div className="mt-1 grid grid-cols-2 gap-1">
            {(["top_left","top_right","bottom_left","bottom_right"] as const).map((p) => (
              <button key={p} onClick={() => setPos(p)} className={`border-2 border-[#171411] px-1 py-0.5 text-[9px] font-black uppercase neo-copy shadow-[2px_2px_0_#1f1c0f] ${pos===p?"bg-[#087d6d] text-white":"bg-[#fff9ed] text-[#171411]"}`}>
                {p.replace("_"," ")}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <button onClick={onClose} className="border-2 border-[#171411] bg-[#087d6d] px-2 py-1 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#1f1c0f] hover:translate-y-[-1px] neo-copy">Fertig</button>
        </div>
      </div>
    </div>
  );
}

function OverlayLoadingState() {
  return (
    <div className="grid h-full place-items-center">
      <Loader2 className="animate-spin text-[#655f58]" size={20} />
    </div>
  );
}

function OverlayEmptyState({
  copy,
  icon: Icon,
  title,
}: {
  copy: string;
  icon: React.ElementType;
  title: string;
}) {
  return (
    <div className="grid h-full place-items-center">
      <div className="w-full border-[3px] border-[#171411] bg-[#fff9ed] p-3 shadow-[3px_3px_0_#1f1c0f]">
        <div className="mb-2 flex items-center gap-2 border-b-[3px] border-[#171411] pb-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-[#171411] bg-[#b7102a] text-white shadow-[2px_2px_0_#1f1c0f]">
            <Icon size={16} />
          </div>
          <div className="neo-title text-sm font-bold uppercase text-[#171411]">{title}</div>
        </div>
        <p className="neo-copy text-[11px] font-bold leading-5 text-[#655f58]">{copy}</p>
      </div>
    </div>
  );
}

/* ========== FRIENDS TAB ========== */
function OverlayFriendsTab() {
  const { isConfigured, isLoading: isAuthLoading, user } = useCurrentUser();
  const [presence, setPresence] = useState<Record<string, UserPresence>>({});
  const [links, setLinks] = useState<FriendLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLinks([]);
      setPresence({});
      setLoading(false);
      return;
    }
    let mounted = true;
    let unsubscribePresence: (() => void) | null = null;
    setLoading(true);

    getMyFriendLinks()
      .then((l) => {
        if (!mounted) return;
        setLinks(l);
        const friendIds = l.map((x) => x.matchedUserId).filter(Boolean) as string[];
        if (friendIds.length === 0) {
          setLoading(false);
          return;
        }
        getVisiblePresence(friendIds)
          .then((p) => {
            if (!mounted) return;
            setPresence(Object.fromEntries(p.map((x) => [x.userId, x])));
            setLoading(false);
          })
          .catch((err) => {
            if (mounted) {
              console.error("[overlay] getVisiblePresence failed:", err);
              setLoading(false);
            }
          });

        unsubscribePresence = subscribeToPresenceChanges(friendIds, (update) => {
          if (!mounted) return;
          setPresence((prev) => ({ ...prev, [update.userId]: update }));
        });
      })
      .catch((err) => {
        if (mounted) {
          console.error("[overlay] getMyFriendLinks failed:", err);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
      unsubscribePresence?.();
    };
  }, [user]);

  const handleJoin = async (friendId: string, gameTitle: string | null) => {
    if (!gameTitle) return;
    setJoining(friendId);
    try {
      await launchCrossPlayJoin("steam", gameTitle);
    } catch (err) {
      console.error(err);
    } finally {
      setJoining(null);
    }
  };

  const handleInvite = async (friendId: string) => {
    const gameTitle = window.prompt("Welches Spiel einladen?");
    if (!gameTitle) return;
    setInviting(friendId);
    try {
      await sendGameInvite({ receiverId: friendId, gameTitle });
    } catch (err) {
      console.error(err);
    } finally {
      setInviting(null);
    }
  };

  if (isAuthLoading) return <OverlayLoadingState />;
  if (!isConfigured) {
    return (
      <OverlayEmptyState
        icon={ShieldAlert}
        title="Social offline"
        copy="Supabase ist nicht konfiguriert. Das Overlay laeuft, aber Freunde und Chat sind in diesem Build deaktiviert."
      />
    );
  }
  if (!user) {
    return (
      <OverlayEmptyState
        icon={Users}
        title="Nicht eingeloggt"
        copy="Melde dich im Launcher an, um Freunde, Einladungen und Presence im Game-Overlay zu sehen."
      />
    );
  }
  if (loading) return <OverlayLoadingState />;

  const friends = links.filter((l) => l.matchedUserId);
  if (friends.length === 0) {
    return <div className="neo-copy text-sm text-[#655f58]">Keine Freunde verknÃ¼pft.</div>;
  }

  return (
    <div className="space-y-2">
      {friends.map((link) => {
        const p = link.matchedUserId ? presence[link.matchedUserId] : null;
        const statusColor = p?.status === "online" ? "bg-[#087d6d]" : p?.status === "busy" || p?.currentGameId ? "bg-[#f56c2d]" : "bg-[#655f58]";
        return (
          <div key={link.id} className="flex items-center justify-between border-2 border-[#171411] bg-[#fff9ed] px-2 py-1.5 text-[12px] shadow-[2px_2px_0_#1f1c0f]">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`h-2 w-2 shrink-0 border border-[#171411] ${statusColor}`} />
              <span className="truncate font-semibold text-[#171411]">{link.platformFriendName || link.matchedUserId?.slice(0,8)}</span>
              {p?.currentGameTitle && (
                <span className="truncate text-[10px] font-bold text-[#655f58] neo-copy">spielt {p.currentGameTitle}</span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {p?.currentGameTitle && (
                <button
                  onClick={() => handleJoin(link.matchedUserId!, p.currentGameTitle)}
                  disabled={!!joining}
                  className="flex items-center gap-1 border-2 border-[#171411] bg-[#087d6d] px-1.5 py-0.5 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#1f1c0f] hover:translate-y-[-1px] disabled:opacity-50 neo-copy"
                  title="Beitreten"
                >
                  <Swords size={10} />
                  {joining === link.matchedUserId ? "..." : "Beitreten"}
                </button>
              )}
              <button
                onClick={() => handleInvite(link.matchedUserId!)}
                disabled={!!inviting}
                className="flex items-center gap-1 border-2 border-[#171411] bg-[#b7102a] px-1.5 py-0.5 text-[10px] font-black uppercase text-white shadow-[2px_2px_0_#1f1c0f] hover:translate-y-[-1px] disabled:opacity-50 neo-copy"
                title="Einladen"
              >
                <Gamepad2 size={10} />
                {inviting === link.matchedUserId ? "..." : "Einladen"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ========== CHAT TAB ========== */
function OverlayChatTab() {
  const { isConfigured, isLoading: isAuthLoading, user } = useCurrentUser();
  const [rooms, setRooms] = useState<GroupChatInfo[]>([]);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      setRooms([]);
      setMessages([]);
      setActiveRoom(null);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    getMyGroupChats()
      .then((r) => {
        if (!mounted) return;
        setRooms(r);
        setLoading(false);
        if (r.length > 0 && !activeRoom) setActiveRoom(r[0].room.id);
      })
      .catch((err) => {
        if (mounted) {
          console.error("[overlay] getMyGroupChats failed:", err);
          setLoading(false);
        }
      });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!activeRoom) return;
    let mounted = true;
    setMessages([]);
    const unsub = subscribeToGroupMessages(activeRoom, (msg) => {
      if (!mounted) return;
      setMessages((prev) => [...prev, msg]);
    });
    return () => { mounted = false; unsub(); };
  }, [activeRoom]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = useCallback(async () => {
    if (!activeRoom || !input.trim() || !user) return;
    const content = input.trim();
    setInput("");
    try { await sendGroupMessage(activeRoom, content); } catch (err) { console.error(err); }
  }, [activeRoom, input, user]);

  if (isAuthLoading) return <OverlayLoadingState />;
  if (!isConfigured) {
    return (
      <OverlayEmptyState
        icon={ShieldAlert}
        title="Chat offline"
        copy="Supabase ist nicht konfiguriert. Das Overlay laeuft, aber Gruppenchats sind in diesem Build deaktiviert."
      />
    );
  }
  if (!user) {
    return (
      <OverlayEmptyState
        icon={MessageSquare}
        title="Nicht eingeloggt"
        copy="Melde dich im Launcher an, um Gruppenchats im Game-Overlay zu benutzen."
      />
    );
  }
  if (loading) return <OverlayLoadingState />;
  if (rooms.length === 0) return <div className="neo-copy text-sm text-[#655f58]">Keine Gruppenchats.</div>;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex gap-1 overflow-x-auto">
        {rooms.map((room) => (
          <button
            key={room.room.id}
            onClick={() => setActiveRoom(room.room.id)}
            className={`shrink-0 border-2 border-[#171411] px-2 py-1 text-[10px] font-black uppercase neo-copy shadow-[2px_2px_0_#1f1c0f] ${activeRoom === room.room.id ? "bg-[#087d6d] text-white" : "bg-[#efe6d4] text-[#171411]"}`}
          >
            <Hash size={10} className="inline" /> {room.room.name}
          </button>
        ))}
      </div>
      <div ref={scrollRef} className="flex-1 space-y-1.5 overflow-y-auto border-2 border-[#171411] bg-[#fff9ed] p-2 text-[11px] shadow-[2px_2px_0_#1f1c0f]">
        {messages.length === 0 && <div className="text-center text-[#655f58] neo-copy">Keine Nachrichten</div>}
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col">
            <span className="text-[9px] font-black uppercase text-[#b7102a] neo-copy">{msg.senderId === user?.id ? "Du" : msg.senderId.slice(0, 8)}</span>
            <span className="text-[#171411]">{msg.content}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Nachricht..."
          className="flex-1 border-2 border-[#171411] bg-[#fff9ed] px-2 py-1 text-[11px] text-[#171411] placeholder-[#655f58] outline-none neo-copy shadow-[2px_2px_0_#1f1c0f]"
        />
        <button onClick={send} className="border-2 border-[#171411] bg-[#087d6d] px-2 py-1 text-white shadow-[2px_2px_0_#1f1c0f] hover:translate-y-[-1px]">
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

/* ========== ACHIEVEMENTS TAB ========== */
function OverlayAchievementsTab() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGame, setExpandedGame] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    listInstalledGames()
      .then((g) => {
        if (mounted) {
          setGames(g.filter((game) => (game.achievements?.length ?? 0) > 0));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          console.error("[overlay] listInstalledGames failed:", err);
          setLoading(false);
        }
      });
    return () => { mounted = false; };
  }, []);

  if (loading) return <div className="grid h-full place-items-center"><Loader2 className="animate-spin text-[#655f58]" size={20} /></div>;
  if (games.length === 0) return <div className="space-y-2 text-sm text-[#655f58]"><Trophy size={32} className="mx-auto text-[#efe6d4]" /><p className="text-center neo-copy">Noch keine Erfolge synchronisiert.</p></div>;

  return (
    <div className="space-y-3">
      {games.map((game) => {
        const achs = game.achievements ?? [];
        const unlocked = achs.filter((a) => !!a.unlockedAt).length;
        const total = achs.length;
        const pct = total > 0 ? (unlocked / total) * 100 : 0;
        const isExpanded = expandedGame === game.id;
        return (
          <div key={game.id} className="border-[3px] border-[#171411] bg-[#fff9ed] shadow-[3px_3px_0_#1f1c0f]">
            <button
              onClick={() => setExpandedGame(isExpanded ? null : game.id)}
              className="flex w-full items-center justify-between p-2 text-left"
            >
              <div className="min-w-0">
                <span className="block text-[12px] font-bold text-[#171411]">{game.title}</span>
                <span className="text-[10px] font-black uppercase text-[#b7102a] neo-copy">{unlocked} / {total} Erfolge</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-20 overflow-hidden border border-[#171411] bg-[#efe6d4]">
                  <div className="h-full bg-[#b7102a]" style={{ width: `${pct}%` }} />
                </div>
                {isExpanded ? <ChevronUp size={14} className="text-[#171411]" /> : <ChevronDown size={14} className="text-[#171411]" />}
              </div>
            </button>
            {isExpanded && (
              <div className="space-y-1.5 border-t-[3px] border-[#171411] p-2">
                {achs.map((a) => (
                  <AchievementRow key={a.id} achievement={a} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AchievementRow({ achievement }: { achievement: UnifiedAchievement }) {
  const isUnlocked = !!achievement.unlockedAt;
  const rarity = achievement.rarity ?? 100;
  let rarityIcon = <CircleDot size={10} className="text-[#655f58]" />;
  let rarityColor = "text-[#655f58]";
  if (rarity <= 1) { rarityIcon = <Flame size={10} className="text-[#b7102a]" />; rarityColor = "text-[#b7102a]"; }
  else if (rarity <= 5) { rarityIcon = <Star size={10} className="text-[#f56c2d]" />; rarityColor = "text-[#f56c2d]"; }
  else if (rarity <= 15) { rarityIcon = <Award size={10} className="text-[#087d6d]" />; rarityColor = "text-[#087d6d]"; }

  return (
    <div className={`flex items-start gap-2 border-2 border-[#171411] p-1.5 shadow-[2px_2px_0_#1f1c0f] ${isUnlocked ? "bg-[#f6edd8]" : "bg-[#efe6d4] opacity-50"}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center border-2 border-[#171411] ${isUnlocked ? "bg-[#b7102a]/10" : "bg-[#efe6d4]"} shadow-[2px_2px_0_#1f1c0f]`}>
        {isUnlocked ? <CheckCircle2 size={14} className="text-[#b7102a]" /> : <Lock size={14} className="text-[#655f58]" />}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-bold text-[#171411]">{achievement.name}</span>
          <span className={rarityColor}>{rarityIcon}</span>
        </div>
        {achievement.description && (
          <p className="text-[10px] text-[#655f58] neo-copy">{achievement.description}</p>
        )}
        {isUnlocked && achievement.unlockedAt && (
          <p className="text-[9px] font-black uppercase text-[#087d6d] neo-copy">
            Freigeschaltet: {new Date(achievement.unlockedAt).toLocaleDateString("de-DE")}
          </p>
        )}
      </div>
    </div>
  );
}

/* ========== PERFORMANCE TAB ========== */
function OverlayPerfTab() {
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null);
  const [history, setHistory] = useState<RealtimeMetrics[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const tick = () => {
      invoke<RealtimeMetrics>("poll_performance_metrics")
        .then((m) => {
          if (!mounted) return;
          setMetrics(m);
          setHistory((prev) => [...prev.slice(-29), m]);
          setError(null);
        })
        .catch((err) => { if (mounted) setError(String(err)); });
    };
    tick();
    const iv = setInterval(tick, 2000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  if (error) return <div className="text-sm text-[#b7102a] neo-copy">{error}</div>;
  if (!metrics) return <div className="grid h-full place-items-center"><Loader2 className="animate-spin text-[#655f58]" size={20} /></div>;

  const latest = metrics;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <MetricCard label="CPU" value={`${latest.cpuPercent.toFixed(0)}%`} icon={Zap} color="#087d6d" />
        <MetricCard label="RAM" value={`${latest.ramMb.toFixed(0)} MB`} icon={Monitor} color="#007166" />
        <MetricCard label="FPS" value={`${latest.fps.toFixed(0)}`} icon={Activity} color="#b7102a" />
        <MetricCard label="Frame" value={`${latest.frameTimeMs.toFixed(1)} ms`} icon={Clock} color="#1f1c0f" />
        {latest.gpuPercent != null && (
          <MetricCard label="GPU" value={`${latest.gpuPercent.toFixed(0)}%`} icon={Zap} color="#087d6d" />
        )}
        {latest.gpuVramMb != null && (
          <MetricCard label="VRAM" value={`${(latest.gpuVramMb / 1024).toFixed(1)} GB`} icon={Monitor} color="#b7102a" />
        )}
        {latest.gpuTempC != null && (
          <MetricCard label="GPU Temp" value={`${latest.gpuTempC.toFixed(0)} Â°C`} icon={Flame} color="#f56c2d" />
        )}
      </div>
      <div className="border-2 border-[#171411] bg-[#fff9ed] p-2 shadow-[2px_2px_0_#1f1c0f]">
        <div className="mb-1 text-[10px] font-black uppercase text-[#655f58] neo-copy">CPU-Verlauf</div>
        <Sparkline data={history.map((h) => h.cpuPercent)} color="#087d6d" />
      </div>
      {latest.gpuPercent != null && (
        <div className="border-2 border-[#171411] bg-[#fff9ed] p-2 shadow-[2px_2px_0_#1f1c0f]">
          <div className="mb-1 text-[10px] font-black uppercase text-[#655f58] neo-copy">GPU-Verlauf</div>
          <Sparkline data={history.map((h) => h.gpuPercent ?? 0)} color="#087d6d" />
        </div>
      )}
      <div className="text-[10px] text-[#655f58] neo-copy">Uptime: {latest.uptime}</div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <div className="flex items-center gap-2 border-2 border-[#171411] bg-[#fff9ed] p-2 shadow-[2px_2px_0_#1f1c0f]">
      <Icon size={16} className="shrink-0" style={{ color }} />
      <div>
        <div className="text-[9px] font-black uppercase text-[#655f58] neo-copy">{label}</div>
        <div className="text-[13px] font-bold text-[#171411]" style={{ color }}>{value}</div>
      </div>
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div className="h-8" />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 100;
  const h = 40;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-full">
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} opacity={0.8} />
    </svg>
  );
}

/* ========== SCREENSHOTS TAB ========== */
function OverlayScreenshotsTab() {
  const [localShots, setLocalShots] = useState<ScreenshotMeta[]>([]);
  const [cloudShots, setCloudShots] = useState<Screenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScreenshotMeta | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const local = await listScreenshots();
      setLocalShots(local);
      try {
        const cloud = await getMyScreenshots();
        setCloudShots(cloud);
      } catch { /* ignore missing table */ }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (path: string) => {
    try {
      await deleteScreenshot(path);
      setLocalShots((prev) => prev.filter((s) => s.path !== path));
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpload = async (shot: ScreenshotMeta) => {
    if (!shot.base64_preview) return;
    setUploading(shot.id);
    try {
      const client = getSupabaseClient();
      if (!client) return;
      const { data: userData } = await client.auth.getUser();
      if (!userData.user) return;
      await client.from("screenshots").insert({
        user_id: userData.user.id,
        storage_path: shot.path,
        thumbnail_path: shot.base64_preview?.slice(0, 200) ?? null,
        caption: shot.file_name,
        width: shot.width,
        height: shot.height,
        size_bytes: shot.size_bytes,
        is_public: false,
      });
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(null);
    }
  };

  if (loading) return <div className="grid h-full place-items-center"><Loader2 className="animate-spin text-[#655f58]" size={20} /></div>;

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-black uppercase text-[#655f58] neo-copy">Lokal ({localShots.length})</div>
      <div className="grid grid-cols-3 gap-2">
        {localShots.map((shot) => (
          <div key={shot.id} className="group relative aspect-video border-2 border-[#171411] bg-[#fff9ed] shadow-[2px_2px_0_#1f1c0f]">
            {shot.base64_preview ? (
              <img src={`data:image/jpeg;base64,${shot.base64_preview}`} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center"><Image size={16} className="text-[#655f58]" /></div>
            )}
            <div className="absolute inset-0 hidden flex-col items-center justify-center gap-1 bg-[#171411]/80 group-hover:flex">
              <button onClick={() => setPreview(shot)} className="border-2 border-[#171411] bg-[#fff9ed] p-1 shadow-[2px_2px_0_#1f1c0f] hover:translate-y-[-1px]"><Camera size={12} className="text-[#171411]" /></button>
              <button onClick={() => handleUpload(shot)} disabled={!!uploading} className="border-2 border-[#171411] bg-[#087d6d] p-1 text-white shadow-[2px_2px_0_#1f1c0f] hover:translate-y-[-1px] disabled:opacity-50">
                <Upload size={12} />
              </button>
              <button onClick={() => handleDelete(shot.path)} className="border-2 border-[#171411] bg-[#b7102a] p-1 text-white shadow-[2px_2px_0_#1f1c0f] hover:translate-y-[-1px]">
                <Trash2 size={12} />
              </button>
            </div>
            {uploading === shot.id && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#171411]/60"><Loader2 size={14} className="animate-spin text-white" /></div>
            )}
          </div>
        ))}
      </div>

      {cloudShots.length > 0 && (
        <>
          <div className="text-[10px] font-black uppercase text-[#655f58] neo-copy">Cloud ({cloudShots.length})</div>
          <div className="grid grid-cols-3 gap-2">
            {cloudShots.map((shot) => (
              <div key={shot.id} className="aspect-video border-2 border-[#171411] bg-[#fff9ed] p-1 shadow-[2px_2px_0_#1f1c0f]">
                <div className="flex h-full items-center justify-center text-[9px] font-bold text-[#655f58] neo-copy">{shot.caption || "Screenshot"}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171411]/90 p-4" onClick={() => setPreview(null)}>
          <div className="max-h-full max-w-full border-[3px] border-[#171411] bg-[#fbf8ef] p-2 shadow-[6px_6px_0_#1f1c0f]">
            {preview.base64_preview && (
              <img src={`data:image/jpeg;base64,${preview.base64_preview}`} alt="" className="max-h-[70vh]" />
            )}
            <div className="mt-1 text-center text-[10px] font-bold text-[#655f58] neo-copy">{preview.file_name}</div>
          </div>
        </div>
      )}
    </div>
  );
}
