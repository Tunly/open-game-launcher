export type ControllerGyroHapticsStatus = "blocked" | "ready" | "warning";

export interface ControllerGyroHapticsCandidate {
  antiCheatSensitive: boolean;
  connected: boolean;
  controllerType: string;
  gyroRequested: boolean;
  gyroSensorDetected: boolean;
  hapticsActuatorDetected: boolean;
  hapticsRequested: boolean;
  /** Local safety-contract flag only; this is not a HID output success claim. */
  hidWriteReady: boolean;
  id: string;
  label: string;
  layoutReady: boolean;
  perGameProfileReady: boolean;
  rawInputFallbackReady: boolean;
  steamInputBridgeReady: boolean;
}

export interface ControllerGyroHapticsLane extends ControllerGyroHapticsCandidate {
  blockers: string[];
  capabilities: string[];
  score: number;
  status: ControllerGyroHapticsStatus;
  warnings: string[];
}

export interface ControllerGyroHapticsReadinessPlan {
  blockedCount: number;
  checklist: string[];
  guardCopy: string;
  guards: string[];
  lanes: ControllerGyroHapticsLane[];
  readyCount: number;
  recommended: ControllerGyroHapticsLane | null;
  summary: string;
  warningCount: number;
}

const LOCAL_ONLY_GUARDS = [
  "Gyro intent staged",
  "Haptics intent staged",
  "No driver install",
  "No Steam Input enablement",
  "No HID capability read",
  "No HID write",
  "No Windows SendInput proof",
  "No gyro output",
  "No haptics output",
  "No anti-cheat compatibility claim",
];

const LOCAL_ONLY_GUARD_COPY =
  "Local layout intent and runtime evidence only. No driver install, no Steam Input enablement, no HID capability read/write, no Windows SendInput proof, no gyro or haptics output, and no anti-cheat compatibility claim.";

export function buildControllerGyroHapticsReadinessPlan(
  candidates: ControllerGyroHapticsCandidate[],
): ControllerGyroHapticsReadinessPlan {
  const lanes = candidates.map(planLane).sort(sortLanes);
  const recommended = lanes.find((lane) => lane.status !== "blocked") ?? null;
  const readyCount = lanes.filter((lane) => lane.status === "ready").length;
  const warningCount = lanes.filter((lane) => lane.status === "warning").length;
  const blockedCount = lanes.filter((lane) => lane.status === "blocked").length;

  return {
    blockedCount,
    checklist: buildChecklist(lanes, recommended),
    guardCopy: LOCAL_ONLY_GUARD_COPY,
    guards: [...LOCAL_ONLY_GUARDS],
    lanes,
    readyCount,
    recommended,
    summary: buildSummary(lanes, recommended),
    warningCount,
  };
}

function planLane(candidate: ControllerGyroHapticsCandidate): ControllerGyroHapticsLane {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const capabilities: string[] = [];

  if (!candidate.connected) blockers.push("Controller is not connected");
  if (!candidate.layoutReady) blockers.push("No active controller layout is staged");
  if (candidate.gyroRequested && !candidate.gyroSensorDetected) {
    blockers.push("Gyro is requested, but no motion sensor evidence is available");
  }
  if (candidate.hapticsRequested && !candidate.hapticsActuatorDetected) {
    blockers.push("Haptics are requested, but no actuator evidence is available");
  }
  if (candidate.antiCheatSensitive && !candidate.rawInputFallbackReady) {
    blockers.push("Protected games need a raw-input fallback before motion routing");
  }

  if (!candidate.steamInputBridgeReady) warnings.push("Steam Input bridge is not connected");
  if (!candidate.hidWriteReady) warnings.push("HID write safety contract is not staged");
  if (!candidate.perGameProfileReady) warnings.push("Per-game native profile is not staged");
  if (candidate.antiCheatSensitive && candidate.rawInputFallbackReady) {
    warnings.push("Protected-game lane must stay on raw-input fallback");
  }

  if (candidate.gyroSensorDetected) capabilities.push("Gyro sensor");
  if (candidate.hapticsActuatorDetected) capabilities.push("Haptics actuator");
  if (candidate.rawInputFallbackReady) capabilities.push("Raw-input fallback");
  if (candidate.perGameProfileReady) capabilities.push("Per-game profile draft");

  const status = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready";

  return {
    ...candidate,
    blockers,
    capabilities,
    score: status === "blocked" ? 0 : scoreCandidate(candidate, warnings.length),
    status,
    warnings,
  };
}

function scoreCandidate(candidate: ControllerGyroHapticsCandidate, warningCount: number) {
  return Math.max(
    0,
    Math.round(
      (candidate.connected ? 24 : 0) +
        (candidate.layoutReady ? 20 : 0) +
        (candidate.gyroSensorDetected ? 18 : 0) +
        (candidate.hapticsActuatorDetected ? 18 : 0) +
        (candidate.steamInputBridgeReady ? 18 : 0) +
        (candidate.hidWriteReady ? 18 : 0) +
        (candidate.perGameProfileReady ? 14 : 0) +
        (candidate.rawInputFallbackReady ? 10 : 0) -
        (candidate.antiCheatSensitive ? 12 : 0) -
        warningCount * 7,
    ),
  );
}

function sortLanes(left: ControllerGyroHapticsLane, right: ControllerGyroHapticsLane) {
  const statusRank: Record<ControllerGyroHapticsStatus, number> = {
    ready: 0,
    warning: 1,
    blocked: 2,
  };
  return (
    statusRank[left.status] - statusRank[right.status] ||
    right.score - left.score ||
    left.label.localeCompare(right.label)
  );
}

function buildChecklist(
  lanes: ControllerGyroHapticsLane[],
  recommended: ControllerGyroHapticsLane | null,
) {
  if (lanes.length === 0) {
    return [
      "No gyro or haptics lanes staged",
      "Connect a controller and save a layout before motion review",
    ];
  }

  const gyroCount = lanes.filter((lane) => lane.gyroSensorDetected).length;
  const hapticsCount = lanes.filter((lane) => lane.hapticsActuatorDetected).length;
  const rawInputCount = lanes.filter((lane) => lane.rawInputFallbackReady).length;

  return [
    `${gyroCount} gyro evidence lane${gyroCount === 1 ? "" : "s"} staged`,
    `${hapticsCount} haptics evidence lane${hapticsCount === 1 ? "" : "s"} staged`,
    `${rawInputCount} raw-input fallback lane${rawInputCount === 1 ? "" : "s"} available`,
    recommended
      ? `${recommended.label} is the current local motion/haptics pick`
      : "No motion/haptics lane can be picked until blockers clear",
  ];
}

function buildSummary(
  lanes: ControllerGyroHapticsLane[],
  recommended: ControllerGyroHapticsLane | null,
) {
  if (lanes.length === 0) {
    return "Gyro/Haptics Readiness is waiting for controller evidence.";
  }

  if (!recommended) {
    return "Gyro/Haptics Readiness found lanes, but every motion route is blocked.";
  }

  if (recommended.status === "warning") {
    return `${recommended.label} can be reviewed locally, but native motion/haptics validation is still pending.`;
  }

  return `${recommended.label} has local motion and haptics evidence ready for staged review.`;
}
