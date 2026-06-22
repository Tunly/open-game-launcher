import type { ControllerDevice, ControllerRuntimeStatus } from "./types/controllers";

export type ControllerCapabilityEvidenceLevel = "inferred" | "none";
export type ControllerVirtualPadEvidence =
  | "keyboard-fallback"
  | "native-passthrough-flag"
  | "none"
  | "vigem-runtime-flag";
export type ControllerCapabilityConfidence = "low" | "medium";
export type ControllerRuntimeActivationSafetyStatus =
  | "local-status-only"
  | "native-claim-quarantined";

export interface ControllerRuntimeActivationSafetyContract {
  blockedClaims: string[];
  findings: string[];
  status: ControllerRuntimeActivationSafetyStatus;
}

export interface ControllerCapabilityEvidenceRow {
  blockedNativeClaims: string[];
  confidence: ControllerCapabilityConfidence;
  connected: boolean;
  controllerType: string;
  gyroEvidence: ControllerCapabilityEvidenceLevel;
  hapticsEvidence: ControllerCapabilityEvidenceLevel;
  id: string;
  label: string;
  sources: string[];
  virtualPadEvidence: ControllerVirtualPadEvidence;
}

export interface ControllerCapabilityEvidencePlan {
  guardCopy: string;
  guards: string[];
  inferredCount: number;
  rows: ControllerCapabilityEvidenceRow[];
  runtimeEvidence: string[];
  runtimeSafety: ControllerRuntimeActivationSafetyContract;
  summary: string;
}

const BLOCKED_NATIVE_CLAIMS = [
  "No OS input write proof",
  "No driver install",
  "No HID capability read",
  "No virtual HID device emission",
  "No raw HID write",
  "No SDL probe",
  "No Steam Input enablement",
  "No Windows SendInput proof",
  "No haptics output",
  "No anti-cheat compatibility claim",
];

const GUARD_COPY =
  "Capability evidence is inferred from controller type and runtime flags only. No OS input write proof, no driver install, no HID read/write, no SDL probe, no Steam Input enablement, no Windows SendInput proof, no haptics output, and no anti-cheat compatibility claim.";

const NATIVE_RUNTIME_SUCCESS_CLAIM_PATTERN =
  /\b(?:runtime is active via Windows SendInput|SendInput(?: output)? (?:active|ready|verified|proven)|ViGEmBus detected|virtual gamepad adapters can be added|virtual HID (?:emitted|ready|detected)|raw HID (?:written|ready)|HID (?:ready|detected|write enabled)|driver (?:installed|loaded|ready)|anti-cheat compatible|native passthrough is active)\b/i;

export function buildControllerCapabilityEvidence(
  devices: ControllerDevice[],
  runtimeStatus: ControllerRuntimeStatus | null,
): ControllerCapabilityEvidencePlan {
  const runtimeSafety = buildControllerRuntimeActivationSafetyContract(runtimeStatus);
  const runtimeEvidence = runtimeEvidenceLabels(runtimeStatus, runtimeSafety);
  const rows = devices.map((device) => buildEvidenceRow(device, runtimeStatus));
  const inferredCount = rows.filter(
    (row) =>
      row.gyroEvidence !== "none" ||
      row.hapticsEvidence !== "none" ||
      row.virtualPadEvidence !== "none",
  ).length;

  return {
    guardCopy: GUARD_COPY,
    guards: [...BLOCKED_NATIVE_CLAIMS],
    inferredCount,
    rows,
    runtimeEvidence,
    runtimeSafety,
    summary: buildSummary(rows, runtimeEvidence),
  };
}

export function buildControllerRuntimeActivationSafetyContract(
  runtimeStatus: ControllerRuntimeStatus | null,
): ControllerRuntimeActivationSafetyContract {
  const findings = [
    "Runtime activation safety contract: local config/status evidence only",
    "Runtime status cannot prove driver, HID, SendInput, haptics, or anti-cheat success",
  ];
  const hasQuarantinedClaim = Boolean(
    runtimeStatus?.driverMessage &&
    NATIVE_RUNTIME_SUCCESS_CLAIM_PATTERN.test(runtimeStatus.driverMessage),
  );

  if (!runtimeStatus) {
    findings.unshift("No runtime status snapshot");
  }

  if (hasQuarantinedClaim) {
    findings.push("Driver/native-output wording quarantined as status text, not proof");
  }

  return {
    blockedClaims: [...BLOCKED_NATIVE_CLAIMS],
    findings,
    status: hasQuarantinedClaim ? "native-claim-quarantined" : "local-status-only",
  };
}

export function createVerifyControllerCapabilityEvidence(): ControllerCapabilityEvidencePlan {
  return buildControllerCapabilityEvidence(
    [
      {
        controllerType: "playstation",
        id: "verify-dualsense-edge",
        isConnected: true,
        name: "DualSense Evidence Pad",
        powerLevel: "wired",
        productId: 0x0ce6,
        source: "verify-fixture",
        vendorId: 0x054c,
      },
      {
        controllerType: "xbox",
        id: "verify-xbox-series",
        isConnected: true,
        name: "Xbox Haptics Evidence Pad",
        powerLevel: "91%",
        productId: 0x0b13,
        source: "verify-fixture",
        vendorId: 0x045e,
      },
      {
        controllerType: "generic",
        id: "verify-generic-usb",
        isConnected: false,
        name: "Generic USB Evidence Gap",
        powerLevel: "standby",
        source: "verify-fixture",
      },
    ],
    {
      activeGameId: "verify-controller-capability-evidence",
      activeLayoutName: "Capability Evidence Snapshot",
      activeTemplate: "gamepadGyro",
      configPath: "verify:controller-capability-evidence",
      driverMessage:
        "Verification mode: runtime flags are evidence labels only. No native HID, SDL, Steam Input, haptics output, or anti-cheat validation is executed.",
      keyboardMouseEmulationReady: true,
      nativePassthroughReady: false,
      vigemBusDetected: true,
    },
  );
}

function buildEvidenceRow(
  device: ControllerDevice,
  runtimeStatus: ControllerRuntimeStatus | null,
): ControllerCapabilityEvidenceRow {
  const gyroEvidence = gyroEvidenceForType(device.controllerType);
  const hapticsEvidence = hapticsEvidenceForType(device.controllerType);
  const virtualPadEvidence = virtualPadEvidenceForRuntime(runtimeStatus);
  const sources = [
    device.source,
    "controller-type-heuristic",
    virtualPadEvidence === "none" ? "missing-native-proof" : "runtime-flag",
  ];

  return {
    blockedNativeClaims: [...BLOCKED_NATIVE_CLAIMS],
    confidence:
      device.isConnected && (gyroEvidence !== "none" || hapticsEvidence !== "none")
        ? "medium"
        : "low",
    connected: device.isConnected,
    controllerType: device.controllerType,
    gyroEvidence,
    hapticsEvidence,
    id: device.id,
    label: device.name,
    sources: Array.from(new Set(sources)),
    virtualPadEvidence,
  };
}

function gyroEvidenceForType(controllerType: ControllerDevice["controllerType"]) {
  return controllerType === "playstation" ||
    controllerType === "switch" ||
    controllerType === "steam"
    ? "inferred"
    : "none";
}

function hapticsEvidenceForType(controllerType: ControllerDevice["controllerType"]) {
  return controllerType === "playstation" || controllerType === "xbox" || controllerType === "steam"
    ? "inferred"
    : "none";
}

function virtualPadEvidenceForRuntime(
  runtimeStatus: ControllerRuntimeStatus | null,
): ControllerVirtualPadEvidence {
  if (runtimeStatus?.vigemBusDetected) return "vigem-runtime-flag";
  if (runtimeStatus?.nativePassthroughReady) return "native-passthrough-flag";
  if (runtimeStatus?.keyboardMouseEmulationReady) return "keyboard-fallback";
  return "none";
}

function runtimeEvidenceLabels(
  runtimeStatus: ControllerRuntimeStatus | null,
  runtimeSafety: ControllerRuntimeActivationSafetyContract,
) {
  if (!runtimeStatus) return runtimeSafety.findings;

  return [
    runtimeStatus.vigemBusDetected ? "ViGEm runtime flag present" : "ViGEm runtime flag missing",
    runtimeStatus.nativePassthroughReady
      ? "Native passthrough flag present"
      : "Native passthrough flag missing",
    runtimeStatus.keyboardMouseEmulationReady
      ? "Keyboard fallback flag present"
      : "Keyboard fallback flag missing",
    ...runtimeSafety.findings,
  ];
}

function buildSummary(rows: ControllerCapabilityEvidenceRow[], runtimeEvidence: string[]) {
  if (rows.length === 0) {
    return "Capability Evidence is waiting for controller rows.";
  }

  const inferredRows = rows.filter(
    (row) => row.gyroEvidence !== "none" || row.hapticsEvidence !== "none",
  ).length;
  const runtimeRows = rows.filter((row) => row.virtualPadEvidence !== "none").length;

  return `${inferredRows} controller-type inference lane${
    inferredRows === 1 ? "" : "s"
  } and ${runtimeRows} runtime flag lane${
    runtimeRows === 1 ? "" : "s"
  } staged; ${runtimeEvidence[0]}. Native capability claims remain blocked.`;
}
