import type { ControllerDevice, ControllerRuntimeStatus } from "./types/controllers";

export type LocalMultiplayerCoOpStatus = "blocked" | "ready" | "staged";
export type LocalMultiplayerSlotState = "empty" | "keyboard" | "ready" | "standby";

export interface LocalMultiplayerSlot {
  action: string;
  deviceId?: string;
  label: string;
  player: number;
  state: LocalMultiplayerSlotState;
  status: string;
}

export interface LocalMultiplayerHubModel {
  blockedCount: number;
  bridgeMode: string;
  bridgeStatus: "ready" | "setup" | "warning";
  checklist: string[];
  coOpStatus: LocalMultiplayerCoOpStatus;
  coOpStatusLabel: string;
  maxPlayers: number;
  minimumReadySeats: number;
  readySlots: number;
  recommendation: string;
  slots: LocalMultiplayerSlot[];
  standbySlots: number;
}

const MAX_LOCAL_PLAYERS = 4;
const MINIMUM_LOCAL_COOP_READY_SEATS = 2;

export function buildLocalMultiplayerHub(
  devices: ControllerDevice[],
  runtimeStatus: ControllerRuntimeStatus | null,
): LocalMultiplayerHubModel {
  const connectedDevices = devices.filter((device) => device.isConnected);
  const standbyDevices = devices.filter((device) => !device.isConnected);
  const slots: LocalMultiplayerSlot[] = [];

  for (const device of connectedDevices.slice(0, MAX_LOCAL_PLAYERS)) {
    slots.push({
      action: "Auto-config can bind the active layout to this seat.",
      deviceId: device.id,
      label: device.name,
      player: slots.length + 1,
      state: "ready",
      status: `${formatControllerType(device.controllerType)} ready`,
    });
  }

  if (runtimeStatus?.keyboardMouseEmulationReady && slots.length < MAX_LOCAL_PLAYERS) {
    slots.push({
      action: "Keyboard and mouse can fill a guest seat for games without native pad support.",
      label: "Keyboard/Mouse Host",
      player: slots.length + 1,
      state: "keyboard",
      status: "Mapped fallback ready",
    });
  }

  for (const device of standbyDevices.slice(0, MAX_LOCAL_PLAYERS - slots.length)) {
    slots.push({
      action: "Wake or reconnect this pad before starting couch co-op.",
      deviceId: device.id,
      label: device.name,
      player: slots.length + 1,
      state: "standby",
      status: `${formatControllerType(device.controllerType)} standby`,
    });
  }

  while (slots.length < MAX_LOCAL_PLAYERS) {
    slots.push({
      action: "Connect another controller or import a layout before launch.",
      label: "Open Seat",
      player: slots.length + 1,
      state: "empty",
      status: "Waiting for pad",
    });
  }

  const readySlots = slots.filter(
    (slot) => slot.state === "ready" || slot.state === "keyboard",
  ).length;
  const standbySlots = slots.filter((slot) => slot.state === "standby").length;
  const bridge = getBridgeMode(runtimeStatus);
  const coOp = getCoOpStatus(readySlots, standbySlots);

  return {
    blockedCount: coOp.blockedCount,
    bridgeMode: bridge.label,
    bridgeStatus: bridge.status,
    checklist: buildChecklist(runtimeStatus, connectedDevices.length, standbyDevices.length),
    coOpStatus: coOp.status,
    coOpStatusLabel: coOp.label,
    maxPlayers: MAX_LOCAL_PLAYERS,
    minimumReadySeats: MINIMUM_LOCAL_COOP_READY_SEATS,
    readySlots,
    recommendation: getRecommendation(readySlots, standbySlots),
    slots,
    standbySlots,
  };
}

function getCoOpStatus(
  readySlots: number,
  standbySlots: number,
): {
  blockedCount: number;
  label: string;
  status: LocalMultiplayerCoOpStatus;
} {
  const blockedCount = Math.max(0, MINIMUM_LOCAL_COOP_READY_SEATS - readySlots);
  if (readySlots >= MINIMUM_LOCAL_COOP_READY_SEATS) {
    return { blockedCount, label: "Co-op Ready", status: "ready" };
  }

  if (readySlots + standbySlots >= MINIMUM_LOCAL_COOP_READY_SEATS) {
    return { blockedCount, label: "Second Seat Staged", status: "staged" };
  }

  return { blockedCount, label: "Needs Second Seat", status: "blocked" };
}

function getBridgeMode(runtimeStatus: ControllerRuntimeStatus | null): {
  label: string;
  status: LocalMultiplayerHubModel["bridgeStatus"];
} {
  if (!runtimeStatus) {
    return { label: "Scanning bridge", status: "setup" };
  }

  if (runtimeStatus.nativePassthroughReady || runtimeStatus.vigemBusDetected) {
    return { label: "Native routing", status: "ready" };
  }

  if (runtimeStatus.keyboardMouseEmulationReady) {
    return { label: "Keyboard route", status: "ready" };
  }

  return { label: "Planning mode", status: "warning" };
}

function buildChecklist(
  runtimeStatus: ControllerRuntimeStatus | null,
  connectedCount: number,
  standbyCount: number,
) {
  const items = [
    connectedCount > 0
      ? `${connectedCount} live pad${connectedCount === 1 ? "" : "s"} detected`
      : "No live pads detected yet",
    standbyCount > 0
      ? `${standbyCount} standby pad${standbyCount === 1 ? "" : "s"} can be awakened`
      : "No standby pads in the rack",
  ];

  if (!runtimeStatus) {
    return [...items, "Runtime bridge is still scanning"];
  }

  if (runtimeStatus.vigemBusDetected) {
    items.push("ViGEm lane is available for virtual-pad routing");
  } else {
    items.push("ViGEm lane missing; native activation stays limited");
  }

  if (runtimeStatus.keyboardMouseEmulationReady) {
    items.push("Keyboard/mouse fallback can cover one guest seat");
  } else {
    items.push("Keyboard/mouse fallback is not active");
  }

  return items;
}

function getRecommendation(readySlots: number, standbySlots: number) {
  if (readySlots >= 2) {
    return "Launch local co-op with the ready seats, then assign per-player layouts.";
  }

  if (standbySlots > 0) {
    return "Wake one standby pad to unlock a 2-player couch-coop lane.";
  }

  return "Plug in one more pad to unlock a 2-player couch-coop lane.";
}

function formatControllerType(type: ControllerDevice["controllerType"]) {
  if (type === "playstation") return "PlayStation";
  return type.charAt(0).toUpperCase() + type.slice(1);
}
