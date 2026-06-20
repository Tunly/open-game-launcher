export type VirtualGamepadDriverMode = "keyboard" | "native" | "vigem";
export type VirtualGamepadLaneStatus = "blocked" | "ready" | "warning";

export interface VirtualGamepadLaneCandidate {
  adminApproved: boolean;
  antiCheatSensitive: boolean;
  connected: boolean;
  driverMode: VirtualGamepadDriverMode;
  gyroDriverReady: boolean;
  gyroRequested: boolean;
  hapticsDriverReady: boolean;
  hapticsRequested: boolean;
  id: string;
  label: string;
  layoutReady: boolean;
  rawInputFallbackReady: boolean;
  signedDriverReady: boolean;
  target: string;
  virtualDriverReady: boolean;
}

export interface VirtualGamepadPlannedLane extends VirtualGamepadLaneCandidate {
  blockers: string[];
  score: number;
  status: VirtualGamepadLaneStatus;
  warnings: string[];
}

export interface VirtualGamepadReadinessPlan {
  blockedCount: number;
  checklist: string[];
  guardCopy: string;
  guards: string[];
  lanes: VirtualGamepadPlannedLane[];
  readyCount: number;
  recommended: VirtualGamepadPlannedLane | null;
  summary: string;
  warningCount: number;
}

const VIRTUAL_GAMEPAD_GUARD_COPY =
  "Virtual Gamepad Readiness is local runtime-flag, layout, signed-driver-review, and raw-input fallback review only. It does not install drivers, emit virtual HID devices, write raw HID, enable Steam Input, dispatch or prove Windows SendInput, output gyro or haptics, validate protected titles, or change launch routing.";

const VIRTUAL_GAMEPAD_GUARDS = [
  "No kernel driver install",
  "No ViGEm/DS4Windows install",
  "No virtual HID device emission",
  "No raw HID write",
  "No Steam Input enablement",
  "No gyro output",
  "No haptics output",
  "No Windows SendInput dispatch",
  "No Windows SendInput proof",
  "No anti-cheat compatibility claim",
  "No protected-title validation",
  "No automatic launch routing change",
];

export function buildVirtualGamepadReadinessPlan(
  lanes: VirtualGamepadLaneCandidate[],
): VirtualGamepadReadinessPlan {
  const planned = lanes.map(planLane).sort(sortLanes);
  const recommended = planned.find((lane) => lane.status !== "blocked") ?? null;
  const readyCount = planned.filter((lane) => lane.status === "ready").length;
  const warningCount = planned.filter((lane) => lane.status === "warning").length;
  const blockedCount = planned.filter((lane) => lane.status === "blocked").length;

  return {
    blockedCount,
    checklist: buildChecklist(planned, recommended),
    guardCopy: VIRTUAL_GAMEPAD_GUARD_COPY,
    guards: [...VIRTUAL_GAMEPAD_GUARDS],
    lanes: planned,
    readyCount,
    recommended,
    summary: buildSummary(planned, recommended),
    warningCount,
  };
}

function planLane(lane: VirtualGamepadLaneCandidate): VirtualGamepadPlannedLane {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!lane.connected) blockers.push("Controller is not connected");
  if (!lane.layoutReady) blockers.push("No active controller layout is staged");
  if (!lane.virtualDriverReady) blockers.push("Virtual gamepad bridge is not detected");
  if (!lane.signedDriverReady) blockers.push("Signed-driver review record is missing");
  if (lane.antiCheatSensitive && !lane.rawInputFallbackReady) {
    blockers.push("Anti-cheat sensitive game needs a raw-input fallback review");
  }

  if (!lane.adminApproved) warnings.push("Admin or driver consent needs a desktop review");
  if (lane.driverMode === "keyboard") {
    warnings.push("Keyboard fallback only; no kernel virtual-pad lane is active");
  }
  if (lane.gyroRequested && !lane.gyroDriverReady) {
    warnings.push("Gyro request is staged, but no gyro driver evidence is available");
  }
  if (lane.hapticsRequested && !lane.hapticsDriverReady) {
    warnings.push("Haptics request is staged, but no haptics driver evidence is available");
  }
  if (lane.antiCheatSensitive && lane.rawInputFallbackReady) {
    warnings.push("Use raw-input fallback for protected games; do not force injection");
  }

  const status = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning" : "ready";

  return {
    ...lane,
    blockers,
    score: status === "blocked" ? 0 : scoreLane(lane, warnings.length),
    status,
    warnings,
  };
}

function scoreLane(lane: VirtualGamepadLaneCandidate, warningCount: number) {
  const modeScore: Record<VirtualGamepadDriverMode, number> = {
    keyboard: 12,
    native: 35,
    vigem: 45,
  };

  return Math.round(
    modeScore[lane.driverMode] +
      (lane.connected ? 30 : 0) +
      (lane.layoutReady ? 25 : 0) +
      (lane.virtualDriverReady ? 35 : 0) +
      (lane.signedDriverReady ? 20 : 0) +
      (lane.adminApproved ? 16 : 0) +
      (lane.gyroRequested && lane.gyroDriverReady ? 8 : 0) +
      (lane.hapticsRequested && lane.hapticsDriverReady ? 8 : 0) -
      (lane.antiCheatSensitive ? 10 : 0) -
      warningCount * 8,
  );
}

function sortLanes(left: VirtualGamepadPlannedLane, right: VirtualGamepadPlannedLane) {
  const statusRank: Record<VirtualGamepadLaneStatus, number> = {
    ready: 0,
    warning: 0,
    blocked: 2,
  };
  const byStatus = statusRank[left.status] - statusRank[right.status];
  if (byStatus !== 0) return byStatus;

  const byScore = right.score - left.score;
  if (byScore !== 0) return byScore;

  return left.label.localeCompare(right.label);
}

function buildChecklist(
  lanes: VirtualGamepadPlannedLane[],
  recommended: VirtualGamepadPlannedLane | null,
) {
  if (lanes.length === 0) {
    return [
      "No virtual gamepad lanes staged",
      "Connect a controller or enable keyboard fallback before driver review",
    ];
  }

  const usableCount = lanes.filter((lane) => lane.status !== "blocked").length;
  const driverCount = lanes.filter((lane) => lane.virtualDriverReady).length;
  const signedCount = lanes.filter((lane) => lane.signedDriverReady).length;
  const protectedCount = lanes.filter((lane) => lane.antiCheatSensitive).length;

  return [
    `${usableCount} usable virtual lane${usableCount === 1 ? "" : "s"} staged`,
    `${driverCount} runtime bridge flag record${driverCount === 1 ? "" : "s"} present`,
    `${signedCount} signed-driver review record${signedCount === 1 ? "" : "s"} present`,
    `${protectedCount} protected-game review lane${protectedCount === 1 ? "" : "s"} flagged`,
    recommended
      ? `${recommended.label} is the current virtual gamepad pick`
      : "No virtual gamepad lane can be picked until blockers clear",
  ];
}

function buildSummary(
  lanes: VirtualGamepadPlannedLane[],
  recommended: VirtualGamepadPlannedLane | null,
) {
  if (lanes.length === 0) {
    return "Virtual Gamepad Readiness is waiting for controller evidence.";
  }

  if (!recommended) {
    return "Virtual Gamepad Readiness found lanes, but every driver route is blocked.";
  }

  if (recommended.status === "warning") {
    return `${recommended.label} can be staged locally, but driver safety review is still pending.`;
  }

  return `${recommended.label} can be staged through local runtime-flag review.`;
}
