import {
  createOverlaySessionFlushLocalProof,
  type OverlaySessionFlushLocalProof,
} from "./performance-session-flush-contract";

export type OverlayE2EReadinessStatus = "blocked" | "ready" | "warning";

export interface OverlayE2EReadinessInput {
  activityCrossFilterReady: boolean;
  antiCheatFallbackReady: boolean;
  externalOverlayWindowReady: boolean;
  localPerformanceHistoryReady: boolean;
  longRunningNativeSessionReady: boolean;
  overlayRuntimeAttributionReady: boolean;
  sessionFlushReady: boolean;
  supabaseSessionE2EReady: boolean;
}

export interface OverlayE2EReadinessGate {
  action: string;
  detail: string;
  id: string;
  label: string;
  status: OverlayE2EReadinessStatus;
}

export interface OverlayE2EReadiness {
  blockedCount: number;
  gates: OverlayE2EReadinessGate[];
  guardCopy: string;
  guards: string[];
  nextAction: string;
  progress: number;
  readyCount: number;
  sessionFlushProof: OverlaySessionFlushLocalProof | null;
  statusLabel: string;
  summary: string;
  warningCount: number;
}

const OVERLAY_E2E_GUARDS = [
  "Local readiness only",
  "No live overlay E2E",
  "No external window proof",
  "No long-running native session",
  "No Supabase write/read proof",
  "No anti-cheat compatibility claim",
];

const OVERLAY_E2E_GUARD_COPY =
  "Overlay E2E readiness is a local review only. This panel does not open a live external overlay window, persist a long-running native session, write or read Supabase performance rows, verify anti-cheat compatibility, or claim production overlay E2E.";

export function buildOverlayE2EReadiness(input: OverlayE2EReadinessInput): OverlayE2EReadiness {
  const sessionFlushProof = input.sessionFlushReady ? createOverlaySessionFlushLocalProof() : null;
  const gates: OverlayE2EReadinessGate[] = [
    {
      action: input.overlayRuntimeAttributionReady
        ? "Keep standalone overlay sessions attributed to overlay-runtime."
        : "Restore overlay-runtime attribution before live overlay staging.",
      detail: input.overlayRuntimeAttributionReady
        ? "Standalone overlay samples can be distinguished from launched game sessions."
        : "Standalone overlay sessions cannot be traced without a fallback game id.",
      id: "overlay-runtime-attribution",
      label: "Overlay Runtime Attribution",
      status: input.overlayRuntimeAttributionReady ? "ready" : "blocked",
    },
    {
      action: input.localPerformanceHistoryReady
        ? "Use local preview rows as the visual regression baseline."
        : "Restore local performance history rows before E2E staging.",
      detail: input.localPerformanceHistoryReady
        ? "Perf History renders local sessions and samples without Supabase configuration."
        : "No local performance preview evidence is available.",
      id: "local-performance-history",
      label: "Local Perf History",
      status: input.localPerformanceHistoryReady ? "ready" : "blocked",
    },
    {
      action: input.activityCrossFilterReady
        ? "Keep Activity-to-Performance links attached to every recap/top-game route."
        : "Restore activity cross-filter query handling before hosted E2E.",
      detail: input.activityCrossFilterReady
        ? "Range, game, bucket, source, and playtime-detail anchor parameters are handled locally."
        : "Activity cross-filter query parameters are not verified.",
      id: "activity-cross-filter",
      label: "Activity Cross-Filter",
      status: input.activityCrossFilterReady ? "ready" : "blocked",
    },
    {
      action: input.sessionFlushReady
        ? "Keep the local flush contract bounded until external-overlay window E2E exists."
        : "Stage overlay session flush proof with capped buffers and close/toggle handling.",
      detail: input.sessionFlushReady
        ? "A local close/toggle flush contract proves capped buffers and promise settlement; live native persistence still needs review."
        : "No overlay close/toggle session flush proof is staged.",
      id: "session-flush",
      label: "Session Flush Contract",
      status: input.sessionFlushReady ? "warning" : "blocked",
    },
    {
      action: input.externalOverlayWindowReady
        ? "Keep external window evidence attached to desktop-only routes."
        : "Run a desktop external-overlay window E2E with frame, focus, and close proof.",
      detail: input.externalOverlayWindowReady
        ? "External window evidence exists, but this panel does not open one."
        : "No live external overlay window E2E has been captured.",
      id: "external-overlay-window",
      label: "External Overlay Window E2E",
      status: input.externalOverlayWindowReady ? "warning" : "blocked",
    },
    {
      action: input.longRunningNativeSessionReady
        ? "Keep long-run proof tied to resource and buffer limits."
        : "Run a long native overlay session with 300-sample flush and reload proof.",
      detail: input.longRunningNativeSessionReady
        ? "Long-running native evidence exists, but production rollout still needs review."
        : "No long-running native overlay session has been verified.",
      id: "long-running-native-session",
      label: "Long Native Session",
      status: input.longRunningNativeSessionReady ? "warning" : "blocked",
    },
    {
      action: input.supabaseSessionE2EReady
        ? "Keep Supabase proof scoped to staging credentials and RLS review."
        : "Run write/read E2E against a real Supabase project with RLS and session rows.",
      detail: input.supabaseSessionE2EReady
        ? "Supabase session evidence exists, but this panel does not write rows."
        : "No real Supabase performance session write/read E2E has passed.",
      id: "supabase-session-e2e",
      label: "Supabase Session E2E",
      status: input.supabaseSessionE2EReady ? "warning" : "blocked",
    },
    {
      action: input.antiCheatFallbackReady
        ? "Keep anti-cheat fallback proof separated from compatibility claims."
        : "Capture protected-title fallback proof without claiming overlay compatibility.",
      detail: input.antiCheatFallbackReady
        ? "Blocked-title fallback UI evidence is attached; compatibility is still not claimed."
        : "No anti-cheat fallback E2E proof is attached to this readiness state.",
      id: "anti-cheat-fallback",
      label: "Anti-Cheat Fallback E2E",
      status: input.antiCheatFallbackReady ? "warning" : "blocked",
    },
  ];
  const readyCount = gates.filter((gate) => gate.status === "ready").length;
  const warningCount = gates.filter((gate) => gate.status === "warning").length;
  const blockedCount = gates.filter((gate) => gate.status === "blocked").length;
  const nextGate =
    gates.find((gate) => gate.status === "blocked") ??
    gates.find((gate) => gate.status === "warning") ??
    null;

  return {
    blockedCount,
    gates,
    guardCopy: OVERLAY_E2E_GUARD_COPY,
    guards: [...OVERLAY_E2E_GUARDS],
    nextAction: nextGate?.action ?? "Overlay E2E can enter controlled staging.",
    progress: Math.round((readyCount / gates.length) * 100),
    readyCount,
    sessionFlushProof,
    statusLabel:
      blockedCount > 0 ? "Local only" : warningCount > 0 ? "Needs staging" : "Review ready",
    summary:
      blockedCount > 0
        ? input.sessionFlushReady
          ? input.antiCheatFallbackReady
            ? "Overlay performance history has local attribution, cross-filter, session-flush, and anti-cheat fallback evidence, but live external overlay, long native session, and Supabase write/read E2E remain open."
            : "Overlay performance history has local attribution, cross-filter, and session-flush contract evidence, but live external overlay, long native session, Supabase write/read, and anti-cheat fallback E2E remain open."
          : "Overlay performance history has local attribution and cross-filter evidence, but live external overlay, long native session, Supabase write/read, and anti-cheat fallback E2E remain open."
        : warningCount > 0
          ? "Overlay E2E staging evidence exists, but live window and hosted session proof still need review."
          : "Overlay E2E can enter controlled staging.",
    warningCount,
  };
}

export function createVerifyOverlayE2EReadiness(): OverlayE2EReadiness {
  return buildOverlayE2EReadiness({
    activityCrossFilterReady: true,
    antiCheatFallbackReady: true,
    externalOverlayWindowReady: false,
    localPerformanceHistoryReady: true,
    longRunningNativeSessionReady: false,
    overlayRuntimeAttributionReady: true,
    sessionFlushReady: true,
    supabaseSessionE2EReady: false,
  });
}
