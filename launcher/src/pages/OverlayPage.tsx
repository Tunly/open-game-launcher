import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  MessageSquare,
  Trophy,
  Activity,
  Users,
  Send,
  Loader2,
  ShieldAlert,
  Zap,
  Monitor,
  Clock,
  Hash,
  Settings,
  CheckCircle2,
  Gamepad2,
  Swords,
  ChevronDown,
  ChevronUp,
  Award,
  Flame,
  Star,
  CircleDot,
  Lock,
  Grip,
  Pin,
  PinOff,
} from "lucide-react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  getGroupMessages,
  getMyGroupChats,
  sendGroupMessage,
  subscribeToGroupMessages,
  type GroupChatInfo,
} from "../lib/supabase/social";
import { getVisiblePresence, subscribeToPresenceChanges } from "../lib/supabase/presence";
import { launchCrossPlayJoin, listInstalledGames } from "../lib/launcher";
import { groupGames } from "../lib/game-groups";
import { hydrateGamesWithRemoteAchievements } from "../lib/supabase/achievements";
import {
  getOverlaySettings,
  saveOverlaySettings,
  setInGameOverlayClickThrough,
} from "../lib/overlay";
import { getMyFriendLinks } from "../lib/supabase/friend-links";
import { sendGameInvite } from "../lib/supabase/social";
import {
  savePerformanceSession,
  savePerformanceSnapshotFromMetrics,
} from "../lib/supabase/performance";
import {
  readActivePerformanceGameContext,
  resolvePerformanceAttribution,
} from "../lib/performance-context";
import {
  ACTIVE_GAME_PERFORMANCE_POLL_INTERVAL_MS,
  shouldPollPerformanceMetrics,
} from "../lib/performance-polling";
import { createBrowserPreviewMetrics } from "../lib/performance-preview";
import {
  PERFORMANCE_SESSION_FLUSH_EVENT,
  appendPerformanceSessionSample,
  requestPerformanceSessionFlush,
  type PerformanceSessionFlushDetail,
} from "../lib/performance-session-flush-contract";
import type { UserPresence, ChatMessage } from "../lib/types/profile";
import type { Game, UnifiedAchievement } from "../lib/types";
import type { RealtimeMetrics } from "../lib/types/performance";
import type { FriendLink } from "../lib/types/friends";
import type { NativeOverlaySettings } from "../lib/types/overlay";

interface AntiCheatInfo {
  name: string;
  blocks_overlay: boolean;
  process_name: string;
}

type OverlayPanel = "friends" | "chat" | "achievements" | "perf" | "settings";
type OverlayPosition = "top_left" | "top_right" | "bottom_left" | "bottom_right";
type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type PerformanceChartPoint = {
  sample: number;
  value: number | null;
};

function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
}

const PERFORMANCE_CHART_SAMPLE_LIMIT = 60;
const PERFORMANCE_SNAPSHOT_INTERVAL_MS = 5 * 60_000;
const OVERLAY_SETTINGS_PREVIEW_KEY = "og-launcher:overlay-settings-preview";
const OVERLAY_POSITIONS: OverlayPosition[] = [
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
];

interface OverlayPanelState {
  height: number;
  pinned: boolean;
  width: number;
  x: number;
  y: number;
}

interface RuntimeOverlaySettings {
  fpsHudEnabled: boolean;
  isEnabled: boolean;
  opacity: number;
  position: OverlayPosition;
  showGpu: boolean;
}

interface OverlayJoinTarget {
  gameId: string;
  platform: string;
}

const DEFAULT_RUNTIME_OVERLAY_SETTINGS: RuntimeOverlaySettings = {
  fpsHudEnabled: false,
  isEnabled: true,
  opacity: 0.95,
  position: "bottom_right",
  showGpu: true,
};

function normalizeRuntimeOverlaySettings(
  settings: NativeOverlaySettings | null | undefined,
): RuntimeOverlaySettings {
  const position = OVERLAY_POSITIONS.includes(settings?.position as OverlayPosition)
    ? (settings?.position as OverlayPosition)
    : DEFAULT_RUNTIME_OVERLAY_SETTINGS.position;
  const opacity =
    typeof settings?.opacity === "number" && Number.isFinite(settings.opacity)
      ? Math.min(1, Math.max(0.5, settings.opacity))
      : DEFAULT_RUNTIME_OVERLAY_SETTINGS.opacity;

  return {
    fpsHudEnabled: settings?.fpsHudEnabled ?? DEFAULT_RUNTIME_OVERLAY_SETTINGS.fpsHudEnabled,
    isEnabled: settings?.isEnabled ?? DEFAULT_RUNTIME_OVERLAY_SETTINGS.isEnabled,
    opacity,
    position,
    showGpu: settings?.showGpu ?? DEFAULT_RUNTIME_OVERLAY_SETTINGS.showGpu,
  };
}

function resolveOverlayJoinTarget(
  presence: UserPresence,
  fallbackPlatform: FriendLink["platform"],
): OverlayJoinTarget | null {
  const platform = presence.platform ?? fallbackPlatform;
  const gameId = presence.platformGameId?.trim() || presence.currentGameId?.trim();

  if (!platform || platform === "og" || !gameId) {
    return null;
  }

  return { gameId, platform };
}

export function OverlayPage() {
  const isPerformanceTelemetryVerify =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("verify") === "performance-system-telemetry";
  const sessionStartedAt = useRef(Date.now());
  const [openPanels, setOpenPanels] = useState<OverlayPanel[]>(() =>
    isPerformanceTelemetryVerify ? ["perf"] : [],
  );
  const [panelStates, setPanelStates] = useState<Partial<Record<OverlayPanel, OverlayPanelState>>>(
    () => (isPerformanceTelemetryVerify ? { perf: createDefaultPanelState("perf") } : {}),
  );
  const [acList, setAcList] = useState<AntiCheatInfo[]>([]);
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeOverlaySettings>(
    DEFAULT_RUNTIME_OVERLAY_SETTINGS,
  );

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const applySettings = (settings: NativeOverlaySettings) => {
      if (!cancelled) setRuntimeSettings(normalizeRuntimeOverlaySettings(settings));
    };

    if (isTauri()) {
      void getOverlaySettings()
        .then(applySettings)
        .catch((error) => {
          console.warn("[overlay] settings load failed:", error);
        });
      void listen<NativeOverlaySettings>("overlay-settings-updated", (event) => {
        applySettings(event.payload);
      })
        .then((cleanup) => {
          if (cancelled) {
            cleanup();
          } else {
            unlisten = cleanup;
          }
        })
        .catch((error) => {
          console.warn("[overlay] settings listener failed:", error);
        });
    } else {
      try {
        const stored = localStorage.getItem(OVERLAY_SETTINGS_PREVIEW_KEY);
        if (stored) applySettings(JSON.parse(stored) as NativeOverlaySettings);
      } catch {
        // Invalid browser preview state falls back to the safe defaults above.
      }
    }

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let mounted = true;
    invoke<AntiCheatInfo[]>("detect_anti_cheat_processes")
      .then((list) => {
        if (mounted) setAcList(list);
      })
      .catch((err) => {
        console.warn("[overlay] anti-cheat detection failed:", err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const closeOverlayWindow = useCallback(() => {
    void requestPerformanceSessionFlush()
      .then(() => invoke("toggle_in_game_overlay"))
      .catch((err) => {
        console.error("[overlay] close failed:", err);
      });
  }, []);

  const closeOverlay = useCallback(() => {
    const pinnedPanels = openPanels.filter((panel) => panelStates[panel]?.pinned);
    if (pinnedPanels.length > 0) {
      setOpenPanels(pinnedPanels);
      setIsChromeVisible(false);
      return;
    }

    closeOverlayWindow();
  }, [closeOverlayWindow, openPanels, panelStates]);

  const globalToggleHandlerRef = useRef<() => void>(() => undefined);
  globalToggleHandlerRef.current = () => {
    if (isChromeVisible) {
      closeOverlay();
    } else {
      setIsChromeVisible(true);
    }
  };

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
    if (!isTauri()) {
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen("overlay-global-toggle", () => {
      globalToggleHandlerRef.current();
    })
      .then((cleanup) => {
        if (cancelled) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      })
      .catch((err) => {
        console.warn("[overlay] global toggle listener failed:", err);
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const clampPanelsToViewport = () => {
      setPanelStates((current) =>
        Object.fromEntries(
          Object.entries(current).map(([panel, state]) => [
            panel,
            state ? clampPanelState(state) : state,
          ]),
        ),
      );
    };

    window.addEventListener("resize", clampPanelsToViewport);
    return () => window.removeEventListener("resize", clampPanelsToViewport);
  }, []);

  useEffect(() => {
    if (isChromeVisible) return;
    if (openPanels.some((panel) => panelStates[panel]?.pinned)) return;
    closeOverlayWindow();
  }, [closeOverlayWindow, isChromeVisible, openPanels, panelStates]);

  useEffect(() => {
    if (!isTauri()) return;

    const hasPinnedPanel = openPanels.some((panel) => panelStates[panel]?.pinned);
    const clickThrough = !isChromeVisible && hasPinnedPanel;
    void setInGameOverlayClickThrough(clickThrough).catch((error) => {
      console.warn("[overlay] pointer handling update failed:", error);
    });
  }, [isChromeVisible, openPanels, panelStates]);

  const blocked = acList.some((ac) => ac.blocks_overlay);
  const sessionSeconds = Math.max(0, Math.floor((now.getTime() - sessionStartedAt.current) / 1000));

  const ensurePanelState = useCallback(
    (panel: OverlayPanel) => {
      setPanelStates((current) => {
        if (current[panel]) return current;
        return {
          ...current,
          [panel]: createDefaultPanelState(panel, openPanels.length),
        };
      });
    },
    [openPanels.length],
  );

  const focusPanel = useCallback((panel: OverlayPanel) => {
    setOpenPanels((current) => [...current.filter((item) => item !== panel), panel]);
  }, []);

  const openPanel = useCallback(
    (panel: OverlayPanel) => {
      setIsChromeVisible(true);
      ensurePanelState(panel);
      setOpenPanels((current) => {
        if (current.includes(panel)) {
          return [...current.filter((item) => item !== panel), panel];
        }
        return [...current, panel];
      });
    },
    [ensurePanelState],
  );

  const closePanel = useCallback((panel: OverlayPanel) => {
    setOpenPanels((current) => current.filter((item) => item !== panel));
  }, []);

  const togglePanelPinned = useCallback(
    (panel: OverlayPanel) => {
      ensurePanelState(panel);
      setPanelStates((current) => {
        const state = current[panel] ?? createDefaultPanelState(panel, openPanels.length);
        return {
          ...current,
          [panel]: { ...state, pinned: !state.pinned },
        };
      });
      focusPanel(panel);
    },
    [ensurePanelState, focusPanel, openPanels.length],
  );

  const updatePanelState = useCallback(
    (panel: OverlayPanel, update: (state: OverlayPanelState) => OverlayPanelState) => {
      setPanelStates((current) => {
        const state = current[panel] ?? createDefaultPanelState(panel, openPanels.length);
        return {
          ...current,
          [panel]: clampPanelState(update(state)),
        };
      });
    },
    [openPanels.length],
  );

  const blockedAntiCheats = acList.filter((ac) => ac.blocks_overlay);

  const handleToggleFpsHud = useCallback(() => {
    void invoke("toggle_fps_hud").catch((err) => {
      console.error("[fps-hud] toggle failed:", err);
    });
  }, []);

  const dockItems: Array<
    | { type: "panel"; panel: OverlayPanel; label: string; icon: React.ElementType }
    | { type: "action"; id: string; label: string; icon: React.ElementType; onClick: () => void }
  > = [
    { type: "panel", panel: "friends", label: "Friends", icon: Users },
    { type: "panel", panel: "chat", label: "Chat", icon: MessageSquare },
    { type: "panel", panel: "achievements", label: "Achievements", icon: Trophy },
    { type: "panel", panel: "perf", label: "Performance", icon: Activity },
    ...(runtimeSettings.fpsHudEnabled
      ? [
          {
            type: "action" as const,
            id: "fps",
            label: "FPS-HUD",
            icon: Monitor,
            onClick: handleToggleFpsHud,
          },
        ]
      : []),
    { type: "panel", panel: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div
      className={`relative h-screen w-screen overflow-hidden text-white ${isChromeVisible ? "bg-black/70" : "bg-transparent"}`}
      data-overlay-position={runtimeSettings.position}
      style={{ opacity: runtimeSettings.opacity }}
    >
      {isChromeVisible && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(255,249,237,0.11)_1px,transparent_1px)] bg-[length:10px_10px] opacity-40" />
          <div className="pointer-events-none absolute inset-0 border-[10px] border-black/55" />
        </>
      )}

      {isChromeVisible && (
        <>
          <div className="neo-copy absolute top-5 left-6 z-20 text-[11px] leading-5 font-black text-[#fff9ed] uppercase drop-shadow-[2px_2px_0_#171411]">
            <div className="text-lg leading-none">
              {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div>
              {now.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}
            </div>
            <div>{formatSessionTime(sessionSeconds)} session</div>
          </div>

          <div className="absolute top-5 left-1/2 z-20 -translate-x-1/2 text-center">
            <div className="mx-auto mb-1 grid h-10 w-10 place-items-center border-[3px] border-[#171411] bg-[#b7102a] text-[#fff9ed] shadow-[4px_4px_0_#1f1c0f]">
              <Gamepad2 size={22} />
            </div>
            <div className="neo-title text-lg font-bold text-[#fff9ed] uppercase drop-shadow-[3px_3px_0_#171411]">
              OG-Launcher
            </div>
          </div>

          <div className="absolute top-5 right-6 z-20 flex items-center gap-2">
            <button
              onClick={closeOverlay}
              className="neo-copy border-2 border-[#fff9ed] bg-[#171411]/70 px-3 py-1.5 text-[11px] font-black text-[#fff9ed] uppercase shadow-[3px_3px_0_#000] hover:-translate-y-0.5 hover:bg-[#087d6d]"
            >
              Back to Game
            </button>
            <button
              onClick={closeOverlay}
              className="grid h-9 w-9 place-items-center border-2 border-[#fff9ed] bg-[#171411]/70 shadow-[3px_3px_0_#000] hover:-translate-y-0.5 hover:bg-[#b7102a]"
              title="Close overlay"
            >
              <X size={18} />
            </button>
          </div>
        </>
      )}

      {isChromeVisible && (blocked || acList.length > 0) && (
        <div
          className={`neo-copy absolute top-24 left-1/2 z-20 flex max-w-[min(760px,calc(100vw-32px))] -translate-x-1/2 items-center gap-2 border-[3px] border-[#171411] px-3 py-2 text-[11px] font-black text-white uppercase shadow-[4px_4px_0_#000] ${blocked ? "bg-[#b7102a]" : "bg-[#087d6d]"}`}
        >
          <ShieldAlert size={15} />
          {blocked
            ? `Overlay blocked: ${acList
                .filter((a) => a.blocks_overlay)
                .map((a) => a.name)
                .join(", ")}`
            : `Anti-cheat detected: ${acList.map((a) => a.name).join(", ")}`}
        </div>
      )}

      {isChromeVisible && blocked && (
        <OverlayFallbackDeck
          blockedAntiCheats={blockedAntiCheats}
          canToggleFpsHud={runtimeSettings.fpsHudEnabled}
          onBackToGame={closeOverlay}
          onToggleFpsHud={handleToggleFpsHud}
        />
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
            {panel === "perf" && <OverlayPerfTab showGpu={runtimeSettings.showGpu} />}
            {panel === "settings" && (
              <OverlaySettingsPanel
                onClose={() => closePanel(panel)}
                onSaved={(settings) =>
                  setRuntimeSettings(normalizeRuntimeOverlaySettings(settings))
                }
              />
            )}
          </OverlayPanelShell>
        );
      })}

      {isChromeVisible && (
        <nav
          className={`absolute z-30 flex max-w-[calc(100vw-24px)] items-center gap-1 overflow-x-auto border-[3px] border-[#171411] bg-[#fff9ed] p-1.5 shadow-[5px_5px_0_#000] ${overlayDockPositionClass(runtimeSettings.position)}`}
        >
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
                  isActive
                    ? "bg-[#087d6d] text-white"
                    : "bg-[#efe6d4] text-[#171411] hover:bg-[#f6edd8]"
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

function overlayDockPositionClass(position: OverlayPosition) {
  switch (position) {
    case "top_left":
      return "left-5 top-20";
    case "top_right":
      return "right-5 top-20";
    case "bottom_left":
      return "bottom-5 left-5";
    case "bottom_right":
      return "bottom-5 right-5";
  }
}

function OverlayFallbackDeck({
  blockedAntiCheats,
  canToggleFpsHud,
  onBackToGame,
  onToggleFpsHud,
}: {
  blockedAntiCheats: AntiCheatInfo[];
  canToggleFpsHud: boolean;
  onBackToGame: () => void;
  onToggleFpsHud: () => void;
}) {
  const blockedNames = blockedAntiCheats.map((ac) => ac.name).join(" / ");

  return (
    <section className="absolute top-[150px] left-1/2 z-20 max-h-[calc(100vh-230px)] w-[min(820px,calc(100vw-32px))] -translate-x-1/2 overflow-y-auto border-[4px] border-[#171411] bg-[#fff9ed] p-3 text-[#171411] shadow-[7px_7px_0_#000] md:max-h-none">
      <div className="grid gap-3 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:items-stretch">
        <div className="neo-dots border-[3px] border-[#171411] bg-[#f6edd8] p-3">
          <span className="neo-copy inline-flex items-center gap-2 border-2 border-[#171411] bg-[#b7102a] px-3 py-1 text-[10px] font-black tracking-[0.12em] text-white uppercase shadow-[3px_3px_0_#1f1c0f]">
            <ShieldAlert className="h-4 w-4" />
            Safety Fallback
          </span>
          <h2 className="neo-title mt-3 text-4xl leading-none text-[#171411]">Overlay Hold</h2>
          <p className="neo-copy mt-2 text-[10px] leading-5 font-black text-[#5b403f] uppercase">
            {blockedNames || "Anti-cheat"} is running. OG-Launcher keeps the transparent overlay
            restrained and exposes safe side actions instead of forcing an injected surface.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <FallbackMetric label="Blocked AC" value={String(blockedAntiCheats.length)} />
            <FallbackMetric label="Mode" value="External" />
          </div>
        </div>

        <div className="grid gap-2">
          <FallbackAction
            body="Return focus to the game and keep pinned overlay panels only if you already chose them."
            icon={X}
            label="Back to Game"
            tone="red"
            onClick={onBackToGame}
          />
          {canToggleFpsHud ? (
            <FallbackAction
              body="Use the lightweight FPS HUD path instead of a full overlay panel when AC pressure is high."
              icon={Monitor}
              label="Toggle FPS HUD"
              tone="teal"
              onClick={onToggleFpsHud}
            />
          ) : (
            <div className="neo-copy border-[3px] border-[#171411] bg-[#efe6d4] p-3 text-[9px] leading-4 font-black text-[#5b403f] uppercase shadow-[3px_3px_0_#1f1c0f]">
              FPS HUD is disabled. Enable it in Overlay Settings before using the anti-cheat
              fallback.
            </div>
          )}
        </div>
      </div>
      <div className="neo-copy mt-3 border-2 border-[#171411] bg-[#171411] px-3 py-2 text-[9px] leading-4 font-black text-[#fff9ed] uppercase">
        Fullscreen fallback: use Windowed/Borderless mode or the external HUD/notification path.
        OG-Launcher never injects into or attaches to the game process.
      </div>
    </section>
  );
}

function FallbackMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-[#171411] bg-[#fff9ed] p-2 text-center shadow-[2px_2px_0_#1f1c0f]">
      <p className="text-2xl leading-none font-black text-[#171411]">{value}</p>
      <p className="neo-copy mt-1 text-[8px] font-black text-[#5b403f] uppercase">{label}</p>
    </div>
  );
}

function FallbackAction({
  body,
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  body: string;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  tone: "red" | "teal" | "paper";
}) {
  const toneClass =
    tone === "red"
      ? "bg-[#b7102a] text-white"
      : tone === "teal"
        ? "bg-[#087d6d] text-white"
        : "bg-[#fff9ed] text-[#171411]";

  return (
    <button
      className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 border-[3px] border-[#171411] bg-[#f6edd8] p-2 text-left shadow-[3px_3px_0_#1f1c0f] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#1f1c0f]"
      type="button"
      onClick={onClick}
    >
      <span
        className={`grid h-10 w-10 place-items-center border-2 border-[#171411] shadow-[2px_2px_0_#1f1c0f] ${toneClass}`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="neo-title block text-xl leading-none text-[#171411]">{label}</span>
        <span className="neo-copy mt-1 block text-[9px] leading-4 font-black text-[#5b403f] uppercase">
          {body}
        </span>
      </span>
    </button>
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
  const dragStart = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(
    null,
  );
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
    // Draggable overlay panel — focus is a programmatic concern tied to the
    // pointer drag gesture, so the keyboard-event listener is intentionally
    // omitted for this native surface.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <section
      className="neo-dots absolute flex flex-col border-[3px] border-[#171411] bg-[#fbf8ef] text-[#171411] shadow-[7px_7px_0_#000]"
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
        className="flex cursor-move items-center justify-between gap-3 border-b-[3px] border-[#171411] bg-[#fff9ed] px-3 py-2 select-none"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Grip size={16} className="shrink-0 text-[#655f58]" />
          <h2 className="neo-title truncate text-lg font-bold text-[#b7102a] uppercase">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onPinnedChange();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className={`grid h-8 w-8 place-items-center border-2 border-[#171411] shadow-[2px_2px_0_#1f1c0f] hover:-translate-y-0.5 ${state.pinned ? "bg-[#087d6d] text-white" : "bg-[#efe6d4] text-[#171411]"}`}
            title={state.pinned ? "Unpin" : "Pin panel"}
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
            title="Close panel"
          >
            <X size={16} />
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-3">{children}</main>
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
    achievements: "Achievements",
    chat: "Chat",
    friends: "Friends",
    perf: "Performance",
    settings: "Overlay Settings",
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
function OverlaySettingsPanel({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (settings: NativeOverlaySettings) => void;
}) {
  const [hotkey, setHotkey] = useState("Shift+F1");
  const [opacity, setOpacity] = useState(95);
  const [pos, setPos] = useState<OverlayPosition>("bottom_right");
  const [isEnabled, setIsEnabled] = useState(true);
  const [fpsHudEnabled, setFpsHudEnabled] = useState(false);
  const [showGpu, setShowGpu] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState("Loading settings...");

  useEffect(() => {
    let cancelled = false;

    function applySettings(settings: NativeOverlaySettings) {
      const nextHotkey = settings.hotkey?.trim() || "Shift+F1";
      const rawOpacity = typeof settings.opacity === "number" ? settings.opacity : 0.95;
      const nextOpacity = rawOpacity <= 1 ? Math.round(rawOpacity * 100) : Math.round(rawOpacity);
      const nextPosition = OVERLAY_POSITIONS.includes(settings.position as OverlayPosition)
        ? (settings.position as OverlayPosition)
        : "bottom_right";

      setHotkey(nextHotkey);
      setOpacity(Math.min(100, Math.max(50, nextOpacity)));
      setPos(nextPosition);
      setIsEnabled(settings.isEnabled ?? true);
      setFpsHudEnabled(settings.fpsHudEnabled ?? false);
      setShowGpu(settings.showGpu ?? true);
    }

    async function loadSettings() {
      try {
        if (isTauri()) {
          applySettings(await getOverlaySettings());
          if (!cancelled) setStatus("Settings loaded from desktop config.");
          return;
        }

        const stored = localStorage.getItem(OVERLAY_SETTINGS_PREVIEW_KEY);
        if (stored) {
          applySettings(JSON.parse(stored) as NativeOverlaySettings);
        }
        if (!cancelled) setStatus("Settings loaded for preview.");
      } catch (error) {
        if (!cancelled) {
          setStatus(
            error instanceof Error
              ? `Settings load failed: ${error.message}`
              : "Settings load failed.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    const nextHotkey = hotkey.trim() || "Shift+F1";
    const settings = {
      fpsHudEnabled,
      hotkey: nextHotkey,
      isEnabled,
      opacity: opacity / 100,
      position: pos,
      showGpu,
    };

    setIsSaving(true);
    try {
      if (isTauri()) {
        const saved = await saveOverlaySettings(settings);
        const savedOpacity =
          typeof saved.opacity === "number" ? Math.round(saved.opacity * 100) : opacity;
        setHotkey(saved.hotkey ?? nextHotkey);
        setOpacity(Math.min(100, Math.max(50, savedOpacity)));
        setPos(saved.position ?? pos);
        setIsEnabled(saved.isEnabled ?? isEnabled);
        setFpsHudEnabled(saved.fpsHudEnabled ?? fpsHudEnabled);
        setShowGpu(saved.showGpu ?? showGpu);
        onSaved(saved);
      } else {
        localStorage.setItem(OVERLAY_SETTINGS_PREVIEW_KEY, JSON.stringify(settings));
        onSaved(settings);
      }

      setStatus(`Saved // ${nextHotkey} // ${opacity}% // ${pos.replace("_", " ")}`);
    } catch (error) {
      setStatus(error instanceof Error ? `Save failed: ${error.message}` : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="w-full border-[3px] border-[#171411] bg-[#f6edd8] p-3 shadow-[4px_4px_0_#1f1c0f]">
      <div className="mb-2 flex items-center justify-between gap-2 border-b-[3px] border-[#171411] pb-1">
        <div className="neo-title text-[11px] font-black text-[#b7102a] uppercase">
          Overlay Settings
        </div>
        <div
          role="status"
          className="neo-copy truncate text-[9px] font-black tracking-[0.08em] text-[#655f58] uppercase"
        >
          {status}
        </div>
      </div>
      <div className="space-y-2">
        <div>
          <span className="neo-copy text-[10px] font-bold text-[#655f58]">Hotkey</span>
          <input
            aria-label="Hotkey"
            value={hotkey}
            onChange={(e) => setHotkey(e.target.value)}
            className="neo-copy mt-1 w-full border-2 border-[#171411] bg-[#fff9ed] px-2 py-1 text-[11px] text-[#171411] shadow-[2px_2px_0_#1f1c0f] outline-none"
          />
        </div>
        <div>
          <span className="neo-copy text-[10px] font-bold text-[#655f58]">Opacity {opacity}%</span>
          <input
            aria-label="Opacity"
            type="range"
            min="50"
            max="100"
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </div>
        <div>
          <span className="neo-copy text-[10px] font-bold text-[#655f58]">Position</span>
          <div className="mt-1 grid grid-cols-2 gap-1">
            {OVERLAY_POSITIONS.map((p) => (
              <button
                key={p}
                aria-pressed={pos === p}
                className={`neo-copy border-2 border-[#171411] px-1 py-0.5 text-[9px] font-black uppercase shadow-[2px_2px_0_#1f1c0f] ${pos === p ? "bg-[#087d6d] text-white" : "bg-[#fff9ed] text-[#171411]"}`}
                type="button"
                onClick={() => setPos(p)}
              >
                {p.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            aria-pressed={fpsHudEnabled}
            className={`neo-copy border-2 border-[#171411] px-2 py-1 text-[9px] font-black uppercase shadow-[2px_2px_0_#1f1c0f] ${fpsHudEnabled ? "bg-[#087d6d] text-white" : "bg-[#fff9ed] text-[#171411]"}`}
            onClick={() => setFpsHudEnabled((enabled) => !enabled)}
            type="button"
          >
            FPS HUD {fpsHudEnabled ? "On" : "Off"}
          </button>
          <button
            aria-pressed={showGpu}
            className={`neo-copy border-2 border-[#171411] px-2 py-1 text-[9px] font-black uppercase shadow-[2px_2px_0_#1f1c0f] ${showGpu ? "bg-[#087d6d] text-white" : "bg-[#fff9ed] text-[#171411]"}`}
            onClick={() => setShowGpu((visible) => !visible)}
            type="button"
          >
            GPU {showGpu ? "Shown" : "Hidden"}
          </button>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            className="neo-copy border-2 border-[#171411] bg-[#b7102a] px-2 py-1 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#1f1c0f] hover:translate-y-[-1px] disabled:opacity-60"
            disabled={isLoading || isSaving}
            type="button"
            onClick={handleSave}
          >
            {isSaving ? "Saving" : "Save"}
          </button>
          <button
            className="neo-copy border-2 border-[#171411] bg-[#087d6d] px-2 py-1 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#1f1c0f] hover:translate-y-[-1px]"
            type="button"
            onClick={onClose}
          >
            Done
          </button>
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
          <div className="neo-title text-sm font-bold text-[#171411] uppercase">{title}</div>
        </div>
        <p className="neo-copy text-[11px] leading-5 font-bold text-[#655f58]">{copy}</p>
      </div>
    </div>
  );
}

/* ========== FRIENDS TAB ========== */
function OverlayFriendsTab() {
  const { isConfigured, isLoading: isAuthLoading, user } = useCurrentUser();
  const verifyMode = new URLSearchParams(window.location.search).get("verify");
  const isInviteVerify = verifyMode === "overlay-friend-invite";
  const [presence, setPresence] = useState<Record<string, UserPresence>>({});
  const [links, setLinks] = useState<FriendLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const [inviteDraftFriendId, setInviteDraftFriendId] = useState<string | null>(null);
  const [inviteGameTitle, setInviteGameTitle] = useState("");
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isInviteVerify) {
      const friendId = "overlay-invite-verify-friend";
      setLinks([
        {
          createdAt: "2026-06-22T00:00:00.000Z",
          dismissed: false,
          id: "overlay-invite-verify-link",
          matchMethod: "manual",
          matchedUserId: friendId,
          mergeGroupId: null,
          ownerId: "overlay-verify-user",
          platform: "steam",
          platformFriendAvatar: null,
          platformFriendId: "steam-overlay-verify-friend",
          platformFriendName: "Arcade Rival",
          updatedAt: "2026-06-22T00:00:00.000Z",
        },
      ]);
      setPresence({
        [friendId]: {
          customStatus: null,
          currentGameId: "overlay-verify-game",
          currentGameTitle: "Neon Drift",
          lastHeartbeatAt: "2026-06-22T00:00:00.000Z",
          platform: "steam",
          platformGameId: "steam-overlay-verify-game",
          platformLastPolledAt: "2026-06-22T00:00:00.000Z",
          platformSource: "steam",
          status: "online",
          updatedAt: "2026-06-22T00:00:00.000Z",
          userId: friendId,
        },
      });
      setInviteDraftFriendId(friendId);
      setInviteGameTitle("Neon Drift");
      setInviteMessage("Verify route rendered the inline invite form without native prompts.");
      setLoading(false);
      return;
    }

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
  }, [isInviteVerify, user]);

  const handleJoin = async (friendId: string, gameTitle: string, target: OverlayJoinTarget) => {
    setJoining(friendId);
    setInviteMessage(null);
    try {
      await launchCrossPlayJoin(target.platform, target.gameId);
      setInviteMessage(`Opening ${gameTitle} via ${target.platform}.`);
    } catch (err) {
      console.error(err);
      setInviteMessage(err instanceof Error ? `Join failed: ${err.message}` : "Join failed.");
    } finally {
      setJoining(null);
    }
  };

  const openInviteDraft = (friendId: string, gameTitle: string | null) => {
    setInviteDraftFriendId(friendId);
    setInviteGameTitle(gameTitle ?? "");
    setInviteMessage(null);
  };

  const closeInviteDraft = () => {
    setInviteDraftFriendId(null);
    setInviteGameTitle("");
    setInviteMessage(null);
  };

  const handleInvite = async (event: { preventDefault: () => void }, friendId: string) => {
    event.preventDefault();
    const gameTitle = inviteGameTitle.trim();
    if (!gameTitle) {
      setInviteMessage("Enter a game title before sending the invite.");
      return;
    }
    if (isInviteVerify) {
      setInviteMessage(`Local verify invite preview for ${gameTitle}. No Supabase invite sent.`);
      setInviteDraftFriendId(null);
      setInviteGameTitle("");
      return;
    }
    setInviting(friendId);
    setInviteMessage(null);
    try {
      await sendGameInvite({ receiverId: friendId, gameTitle });
      setInviteMessage(`Invite sent for ${gameTitle}.`);
      setInviteDraftFriendId(null);
      setInviteGameTitle("");
    } catch (err) {
      console.error(err);
      setInviteMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setInviting(null);
    }
  };

  if (isAuthLoading) return <OverlayLoadingState />;
  if (!isConfigured && !isInviteVerify) {
    return (
      <OverlayEmptyState
        icon={ShieldAlert}
        title="Social offline"
        copy="Supabase is not configured. The overlay runs, but friends and chat are disabled in this build."
      />
    );
  }
  if (!user && !isInviteVerify) {
    return (
      <OverlayEmptyState
        icon={Users}
        title="Not signed in"
        copy="Sign in to the launcher to see friends, invitations, and presence in the game overlay."
      />
    );
  }
  if (loading) return <OverlayLoadingState />;

  const friends = links.filter((l) => l.matchedUserId);
  if (friends.length === 0) {
    return <div className="neo-copy text-sm text-[#655f58]">No friends linked.</div>;
  }

  return (
    <div className="space-y-2">
      {inviteMessage ? (
        <p
          aria-live="polite"
          className="neo-copy border-2 border-[#171411] bg-[#8cf5e4] px-2 py-1.5 text-[10px] leading-4 font-black text-[#171411] uppercase shadow-[2px_2px_0_#1f1c0f]"
          role="status"
        >
          {inviteMessage}
        </p>
      ) : null}
      {friends.map((link) => {
        const p = link.matchedUserId ? presence[link.matchedUserId] : null;
        const friendId = link.matchedUserId!;
        const isInviteDraftOpen = inviteDraftFriendId === friendId;
        const inviteInputId = `overlay-invite-game-${friendId}`;
        const joinTarget = p ? resolveOverlayJoinTarget(p, link.platform) : null;
        const statusColor =
          p?.status === "online"
            ? "bg-[#087d6d]"
            : p?.status === "busy" || p?.currentGameId
              ? "bg-[#f56c2d]"
              : "bg-[#655f58]";
        return (
          <div key={link.id} className="space-y-1.5">
            <div className="flex items-center justify-between border-2 border-[#171411] bg-[#fff9ed] px-2 py-1.5 text-[12px] shadow-[2px_2px_0_#1f1c0f]">
              <div className="flex min-w-0 items-center gap-2">
                <div className={`h-2 w-2 shrink-0 border border-[#171411] ${statusColor}`} />
                <span className="truncate font-semibold text-[#171411]">
                  {link.platformFriendName || link.matchedUserId?.slice(0, 8)}
                </span>
                {p?.currentGameTitle && (
                  <span className="neo-copy truncate text-[10px] font-bold text-[#655f58]">
                    playing {p.currentGameTitle}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {p?.currentGameTitle && joinTarget && (
                  <button
                    onClick={() => handleJoin(friendId, p.currentGameTitle!, joinTarget)}
                    disabled={!!joining}
                    className="neo-copy flex items-center gap-1 border-2 border-[#171411] bg-[#087d6d] px-1.5 py-0.5 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#1f1c0f] hover:translate-y-[-1px] disabled:opacity-50"
                    title="Join"
                  >
                    <Swords size={10} />
                    {joining === friendId ? "..." : "Join"}
                  </button>
                )}
                <button
                  onClick={() => openInviteDraft(friendId, p?.currentGameTitle ?? null)}
                  disabled={!!inviting}
                  className="neo-copy flex items-center gap-1 border-2 border-[#171411] bg-[#b7102a] px-1.5 py-0.5 text-[10px] font-black text-white uppercase shadow-[2px_2px_0_#1f1c0f] hover:translate-y-[-1px] disabled:opacity-50"
                  title="Invite"
                >
                  <Gamepad2 size={10} />
                  {inviting === friendId ? "..." : "Invite"}
                </button>
              </div>
            </div>
            {isInviteDraftOpen ? (
              <form
                aria-label="Overlay game invite"
                className="space-y-2 border-2 border-[#171411] bg-[#f6edd8] p-2 shadow-[2px_2px_0_#1f1c0f]"
                onSubmit={(event) => void handleInvite(event, friendId)}
              >
                <label
                  className="neo-copy block text-[9px] font-black tracking-[0.12em] text-[#b7102a] uppercase"
                  htmlFor={inviteInputId}
                >
                  Game Invite Title
                </label>
                <input
                  className="neo-copy h-8 w-full border-2 border-[#171411] bg-[#fff9ed] px-2 text-[11px] font-black text-[#171411] uppercase outline-none focus:bg-[#8cf5e4]"
                  id={inviteInputId}
                  onChange={(event) => setInviteGameTitle(event.target.value)}
                  placeholder="Game title"
                  value={inviteGameTitle}
                />
                <div className="flex flex-wrap justify-end gap-1.5">
                  <button
                    className="neo-copy border-2 border-[#171411] bg-[#fff9ed] px-2 py-1 text-[9px] font-black text-[#171411] uppercase shadow-[2px_2px_0_#1f1c0f] hover:translate-y-[-1px]"
                    onClick={closeInviteDraft}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="neo-copy border-2 border-[#171411] bg-[#b7102a] px-2 py-1 text-[9px] font-black text-white uppercase shadow-[2px_2px_0_#1f1c0f] hover:translate-y-[-1px] disabled:bg-[#655f58]"
                    disabled={Boolean(inviting) || inviteGameTitle.trim().length === 0}
                    type="submit"
                  >
                    {inviting === friendId ? "Sending" : "Send Invite"}
                  </button>
                </div>
              </form>
            ) : null}
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
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
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
    setActiveRoom(null);
    setMessages([]);
    setSendError(null);
    getMyGroupChats()
      .then((r) => {
        if (!mounted) return;
        setRooms(r);
        setLoading(false);
        setActiveRoom(r[0]?.room.id ?? null);
      })
      .catch((err) => {
        if (mounted) {
          console.error("[overlay] getMyGroupChats failed:", err);
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!activeRoom) return;
    let mounted = true;
    setMessages([]);
    const unsub = subscribeToGroupMessages(activeRoom, (msg) => {
      if (!mounted) return;
      setMessages((current) => mergeChatMessages(current, [msg]));
    });
    void getGroupMessages(activeRoom)
      .then((history) => {
        if (mounted) setMessages((current) => mergeChatMessages(current, history));
      })
      .catch((error) => {
        if (mounted) console.error("[overlay] getGroupMessages failed:", error);
      });
    return () => {
      mounted = false;
      unsub();
    };
  }, [activeRoom]);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }, [messages]);

  const send = useCallback(async () => {
    if (!activeRoom || !input.trim() || !user || sending) return;
    const content = input.trim();
    setInput("");
    setSendError(null);
    setSending(true);
    try {
      await sendGroupMessage(activeRoom, content);
    } catch (err) {
      console.error(err);
      setInput((current) => current || content);
      setSendError(err instanceof Error ? err.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }, [activeRoom, input, sending, user]);

  if (isAuthLoading) return <OverlayLoadingState />;
  if (!isConfigured) {
    return (
      <OverlayEmptyState
        icon={ShieldAlert}
        title="Chat offline"
        copy="Supabase is not configured. The overlay runs, but group chats are disabled in this build."
      />
    );
  }
  if (!user) {
    return (
      <OverlayEmptyState
        icon={MessageSquare}
        title="Not signed in"
        copy="Sign in to the launcher to use group chats in the game overlay."
      />
    );
  }
  if (loading) return <OverlayLoadingState />;
  if (rooms.length === 0)
    return <div className="neo-copy text-sm text-[#655f58]">No group chats.</div>;

  return (
    <div className="flex h-full flex-col gap-2">
      {sendError ? (
        <p
          className="neo-copy border-2 border-[#171411] bg-[#b7102a] px-2 py-1 text-[9px] font-black text-white uppercase shadow-[2px_2px_0_#1f1c0f]"
          role="alert"
        >
          {sendError}
        </p>
      ) : null}
      <div className="flex gap-1 overflow-x-auto">
        {rooms.map((room) => (
          <button
            key={room.room.id}
            onClick={() => setActiveRoom(room.room.id)}
            className={`neo-copy shrink-0 border-2 border-[#171411] px-2 py-1 text-[10px] font-black uppercase shadow-[2px_2px_0_#1f1c0f] ${activeRoom === room.room.id ? "bg-[#087d6d] text-white" : "bg-[#efe6d4] text-[#171411]"}`}
          >
            <Hash size={10} className="inline" /> {room.room.name}
          </button>
        ))}
      </div>
      <div
        ref={scrollRef}
        className="flex-1 space-y-1.5 overflow-y-auto border-2 border-[#171411] bg-[#fff9ed] p-2 text-[11px] shadow-[2px_2px_0_#1f1c0f]"
      >
        {messages.length === 0 && (
          <div className="neo-copy text-center text-[#655f58]">No messages</div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col">
            <span className="neo-copy text-[9px] font-black text-[#b7102a] uppercase">
              {msg.senderId === user?.id ? "You" : msg.senderId.slice(0, 8)}
            </span>
            <span className="text-[#171411]">{msg.content}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message..."
          className="neo-copy flex-1 border-2 border-[#171411] bg-[#fff9ed] px-2 py-1 text-[11px] text-[#171411] placeholder-[#655f58] shadow-[2px_2px_0_#1f1c0f] outline-none"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="border-2 border-[#171411] bg-[#087d6d] px-2 py-1 text-white shadow-[2px_2px_0_#1f1c0f] hover:translate-y-[-1px] disabled:opacity-50"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

/* ========== ACHIEVEMENTS TAB ========== */
export function OverlayAchievementsTab() {
  const { isLoading: isAuthLoading, user } = useCurrentUser();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    if (isAuthLoading) {
      setGames([]);
      setError(null);
      setLoading(true);
      return () => {
        mounted = false;
      };
    }

    setGames([]);
    setError(null);
    setLoading(true);
    void (async () => {
      try {
        const localGames = await listInstalledGames();
        const hydratedGames = await hydrateGamesWithRemoteAchievements(localGames);
        const groupedGames = groupGames(hydratedGames)
          .filter((group) => group.achievements.length > 0)
          .map((group) => group.displayGame);
        if (mounted) setGames(groupedGames);
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isAuthLoading, reloadKey, user?.id]);

  if (loading)
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="animate-spin text-[#655f58]" size={20} />
      </div>
    );
  if (error)
    return (
      <div className="space-y-3 border-[3px] border-[#171411] bg-[#fff9ed] p-3 text-[#171411] shadow-[3px_3px_0_#1f1c0f]">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 shrink-0 text-[#b7102a]" size={18} />
          <div>
            <p className="neo-copy text-[10px] font-black text-[#b7102a] uppercase">
              Achievement load failed
            </p>
            <p className="mt-1 text-[11px] font-bold text-[#5b403f]">{error}</p>
          </div>
        </div>
        <button
          className="neo-copy border-2 border-[#171411] bg-[#b7102a] px-3 py-1 text-[9px] font-black text-white uppercase shadow-[2px_2px_0_#1f1c0f]"
          onClick={() => setReloadKey((current) => current + 1)}
          type="button"
        >
          Retry Achievement Load
        </button>
      </div>
    );
  if (games.length === 0)
    return (
      <div className="space-y-2 text-sm text-[#655f58]">
        <Trophy size={32} className="mx-auto text-[#efe6d4]" />
        <p className="neo-copy text-center">No achievements synced yet.</p>
      </div>
    );

  return (
    <div className="space-y-3">
      {games.map((game) => {
        const achs = game.achievements ?? [];
        const unlocked = achs.filter((a) => !!a.unlockedAt).length;
        const total = achs.length;
        const pct = total > 0 ? (unlocked / total) * 100 : 0;
        const isExpanded = expandedGame === game.id;
        return (
          <div
            key={game.id}
            className="border-[3px] border-[#171411] bg-[#fff9ed] shadow-[3px_3px_0_#1f1c0f]"
          >
            <button
              onClick={() => setExpandedGame(isExpanded ? null : game.id)}
              className="flex w-full items-center justify-between p-2 text-left"
            >
              <div className="min-w-0">
                <span className="block text-[12px] font-bold text-[#171411]">{game.title}</span>
                <span className="neo-copy text-[10px] font-black text-[#b7102a] uppercase">
                  {unlocked} / {total} achievements
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-20 overflow-hidden border border-[#171411] bg-[#efe6d4]">
                  <div className="h-full bg-[#b7102a]" style={{ width: `${pct}%` }} />
                </div>
                {isExpanded ? (
                  <ChevronUp size={14} className="text-[#171411]" />
                ) : (
                  <ChevronDown size={14} className="text-[#171411]" />
                )}
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
  if (rarity <= 1) {
    rarityIcon = <Flame size={10} className="text-[#b7102a]" />;
    rarityColor = "text-[#b7102a]";
  } else if (rarity <= 5) {
    rarityIcon = <Star size={10} className="text-[#f56c2d]" />;
    rarityColor = "text-[#f56c2d]";
  } else if (rarity <= 15) {
    rarityIcon = <Award size={10} className="text-[#087d6d]" />;
    rarityColor = "text-[#087d6d]";
  }

  return (
    <div
      className={`flex items-start gap-2 border-2 border-[#171411] p-1.5 shadow-[2px_2px_0_#1f1c0f] ${isUnlocked ? "bg-[#f6edd8]" : "bg-[#efe6d4] opacity-50"}`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center border-2 border-[#171411] ${isUnlocked ? "bg-[#b7102a]/10" : "bg-[#efe6d4]"} shadow-[2px_2px_0_#1f1c0f]`}
      >
        {isUnlocked ? (
          <CheckCircle2 size={14} className="text-[#b7102a]" />
        ) : (
          <Lock size={14} className="text-[#655f58]" />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-bold text-[#171411]">{achievement.name}</span>
          <span className={rarityColor}>{rarityIcon}</span>
        </div>
        {achievement.description && (
          <p className="neo-copy text-[10px] text-[#655f58]">{achievement.description}</p>
        )}
        {isUnlocked && achievement.unlockedAt && (
          <p className="neo-copy text-[9px] font-black text-[#087d6d] uppercase">
            Unlocked: {new Date(achievement.unlockedAt).toLocaleDateString("en-US")}
          </p>
        )}
      </div>
    </div>
  );
}

function OverlayPerfTab({ showGpu }: { showGpu: boolean }) {
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null);
  const [history, setHistory] = useState<RealtimeMetrics[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeGameContext] = useState(() => readActivePerformanceGameContext());
  const performanceAttribution = resolvePerformanceAttribution(activeGameContext);
  const performanceGameId = performanceAttribution.gameId;
  const shouldPollNativeMetrics = shouldPollPerformanceMetrics(performanceAttribution);
  const startedAtRef = useRef(Date.now());
  const lastPersistedAtRef = useRef(0);
  const sessionBufferRef = useRef<RealtimeMetrics[]>([]);
  const flushedSessionRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const flushSession = () => {
      if (!isTauri() || flushedSessionRef.current) {
        return null;
      }

      const samples = sessionBufferRef.current;
      if (samples.length === 0) {
        return null;
      }

      flushedSessionRef.current = true;
      sessionBufferRef.current = [];
      return savePerformanceSession({
        gameId: performanceGameId,
        samples,
        startedAt: new Date(startedAtRef.current).toISOString(),
        endedAt: new Date().toISOString(),
      }).catch((persistError) => {
        console.warn("[performance] session persist failed:", persistError);
        return false;
      });
    };
    const handleFlushRequest = (event: Event) => {
      const promise = flushSession();
      if (promise) {
        (event as CustomEvent<PerformanceSessionFlushDetail>).detail?.waitUntil(promise);
      }
    };
    const applyMetrics = (m: RealtimeMetrics, shouldPersist: boolean) => {
      if (!mounted) return;
      setMetrics(m);
      setHistory((prev) => [...prev.slice(-(PERFORMANCE_CHART_SAMPLE_LIMIT - 1)), m]);
      setError(null);
      const now = Date.now();
      if (shouldPersist) {
        flushedSessionRef.current = false;
        sessionBufferRef.current = appendPerformanceSessionSample(sessionBufferRef.current, m);
        if (now - lastPersistedAtRef.current > PERFORMANCE_SNAPSHOT_INTERVAL_MS) {
          lastPersistedAtRef.current = now;
          void savePerformanceSnapshotFromMetrics(m, {
            gameId: performanceGameId,
            durationSeconds: Math.round((now - startedAtRef.current) / 1000),
          }).catch((persistError) => {
            console.warn("[performance] snapshot persist failed:", persistError);
          });
        }
      }
    };

    window.addEventListener(PERFORMANCE_SESSION_FLUSH_EVENT, handleFlushRequest);
    const tick = () => {
      if (!isTauri()) {
        const elapsedSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
        applyMetrics(createBrowserPreviewMetrics(elapsedSeconds), false);
        return;
      }

      invoke<RealtimeMetrics>("poll_performance_metrics")
        .then((m) => applyMetrics(m, true))
        .catch((err) => {
          if (mounted) setError(String(err));
        });
    };
    if (!shouldPollNativeMetrics) {
      applyMetrics(createBrowserPreviewMetrics(0), false);
      return () => {
        mounted = false;
        window.removeEventListener(PERFORMANCE_SESSION_FLUSH_EVENT, handleFlushRequest);
      };
    }

    tick();
    const iv = setInterval(tick, ACTIVE_GAME_PERFORMANCE_POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(iv);
      window.removeEventListener(PERFORMANCE_SESSION_FLUSH_EVENT, handleFlushRequest);
      const flushPromise = flushSession();
      if (flushPromise) {
        void flushPromise;
      }
    };
  }, [performanceGameId, shouldPollNativeMetrics]);

  if (error) return <div className="neo-copy text-sm text-[#b7102a]">{error}</div>;
  if (!metrics)
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="animate-spin text-[#655f58]" size={20} />
      </div>
    );

  const latest = metrics;
  const chartSamples =
    history.length > 0 ? history.slice(-PERFORMANCE_CHART_SAMPLE_LIMIT) : [latest];
  const chartDataFor = (
    selector: (sample: RealtimeMetrics) => number | null | undefined,
  ): PerformanceChartPoint[] =>
    chartSamples.map((sample, index) => ({
      sample: index,
      value: selector(sample) ?? null,
    }));
  const allPerformanceCharts: Array<{
    color: string;
    data: PerformanceChartPoint[];
    fallbackDomain: [number, number];
    label: string;
    value: string;
  }> = [
    {
      color: "#087d6d",
      data: chartDataFor((sample) => sample.cpuPercent),
      fallbackDomain: [0, 100],
      label: "System CPU",
      value: `${latest.cpuPercent.toFixed(0)}%`,
    },
    {
      color: "#007166",
      data: chartDataFor((sample) => sample.gpuPercent),
      fallbackDomain: [0, 100],
      label: "System GPU",
      value: latest.gpuPercent != null ? `${latest.gpuPercent.toFixed(0)}%` : "N/A",
    },
    {
      color: "#b7102a",
      data: chartDataFor((sample) => sample.fps),
      fallbackDomain: [0, 120],
      label: "HUD FPS",
      value: `${latest.fps.toFixed(0)}`,
    },
    {
      color: "#1f1c0f",
      data: chartDataFor((sample) => sample.frameTimeMs),
      fallbackDomain: [0, 40],
      label: "HUD Frame",
      value: `${latest.frameTimeMs.toFixed(1)} ms`,
    },
  ];
  const performanceCharts = allPerformanceCharts.filter(
    (chart) => showGpu || chart.label !== "System GPU",
  );

  return (
    <div className="space-y-3">
      <div className="neo-dots border-2 border-[#171411] bg-[#fff9ed] p-2 shadow-[2px_2px_0_#1f1c0f]">
        <p className="neo-copy text-[9px] font-black text-[#655f58] uppercase">Sample Scope</p>
        <div className="mt-1 flex items-center gap-2">
          <Gamepad2 size={14} className="text-[#087d6d]" />
          <span className="truncate text-[12px] font-black text-[#171411] uppercase">
            {performanceAttribution.label}
          </span>
        </div>
        <p className="neo-copy mt-1 text-[8px] font-black text-[#655f58] uppercase">
          {performanceAttribution.detail}
        </p>
        <p className="neo-copy mt-2 border-t-2 border-[#171411] pt-2 text-[8px] font-black text-[#b7102a] uppercase">
          System telemetry // HUD FPS measures this launcher webview, not game FPS or a benchmark
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="System CPU"
          value={`${latest.cpuPercent.toFixed(0)}%`}
          icon={Zap}
          color="#087d6d"
        />
        <MetricCard
          label="System RAM"
          value={`${latest.ramMb.toFixed(0)} MB`}
          icon={Monitor}
          color="#007166"
        />
        <MetricCard
          label="HUD FPS"
          value={`${latest.fps.toFixed(0)}`}
          icon={Activity}
          color="#b7102a"
        />
        <MetricCard
          label="HUD Frame"
          value={`${latest.frameTimeMs.toFixed(1)} ms`}
          icon={Clock}
          color="#1f1c0f"
        />
        {showGpu && latest.gpuPercent != null && (
          <MetricCard
            label="System GPU"
            value={`${latest.gpuPercent.toFixed(0)}%`}
            icon={Zap}
            color="#087d6d"
          />
        )}
        {showGpu && latest.gpuVramMb != null && (
          <MetricCard
            label="System VRAM"
            value={`${(latest.gpuVramMb / 1024).toFixed(1)} GB`}
            icon={Monitor}
            color="#b7102a"
          />
        )}
        {showGpu && latest.gpuTempC != null && (
          <MetricCard
            label="System GPU Temp"
            value={`${latest.gpuTempC.toFixed(0)} °C`}
            icon={Flame}
            color="#b7102a"
          />
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {performanceCharts.map((chart) => (
          <PerformanceLineChart key={chart.label} {...chart} />
        ))}
      </div>
      <div className="neo-copy text-[10px] text-[#655f58]">Uptime: {latest.uptime}</div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 border-2 border-[#171411] bg-[#fff9ed] p-2 shadow-[2px_2px_0_#1f1c0f]">
      <Icon size={16} className="shrink-0" style={{ color }} />
      <div>
        <div className="neo-copy text-[9px] font-black text-[#655f58] uppercase">{label}</div>
        <div className="text-[13px] font-bold text-[#171411]" style={{ color }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function PerformanceLineChart({
  color,
  data,
  fallbackDomain,
  label,
  value,
}: {
  color: string;
  data: PerformanceChartPoint[];
  fallbackDomain: [number, number];
  label: string;
  value: string;
}) {
  const [isChartReady, setIsChartReady] = useState(false);
  const validPointCount = data.filter((point) => point.value != null).length;
  const domain = resolvePerformanceChartDomain(data, fallbackDomain);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsChartReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      aria-label={`${label} performance history: ${value}`}
      className="neo-dots border-2 border-[#171411] bg-[#fff9ed] p-2 shadow-[2px_2px_0_#1f1c0f]"
      role="img"
    >
      <div className="mb-1 flex h-5 items-center justify-between gap-2">
        <span className="neo-copy truncate text-[9px] font-black text-[#655f58] uppercase">
          {label} tape
        </span>
        <span
          className="neo-title shrink-0 text-[13px] leading-none text-[#171411]"
          style={{ color }}
        >
          {value}
        </span>
      </div>
      <div className="h-14 w-full overflow-hidden border-2 border-[#171411] bg-[#f6edd8]">
        {isChartReady ? (
          <ResponsiveContainer height="100%" minWidth={0} width="100%">
            <LineChart data={data} margin={{ bottom: 2, left: 2, right: 2, top: 4 }}>
              <CartesianGrid
                stroke="#171411"
                strokeDasharray="2 4"
                strokeOpacity={0.18}
                vertical={false}
              />
              <XAxis dataKey="sample" hide type="number" />
              <YAxis domain={domain} hide width={0} />
              <Line
                activeDot={false}
                connectNulls={false}
                dataKey="value"
                dot={
                  validPointCount < 2
                    ? { fill: color, r: 3, stroke: "#171411", strokeWidth: 2 }
                    : false
                }
                isAnimationActive={false}
                stroke={color}
                strokeWidth={3}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </div>
  );
}

function resolvePerformanceChartDomain(
  data: PerformanceChartPoint[],
  fallbackDomain: [number, number],
): [number, number] {
  const values = data
    .map((point) => point.value)
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (values.length === 0) {
    return fallbackDomain;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.1, 1);
    return [Math.max(0, min - padding), max + padding];
  }

  const padding = (max - min) * 0.2;
  return [Math.max(0, min - padding), max + padding];
}
