export type ControllerPerGameSafetyRoute = "blocked" | "raw-input-keyboard" | "vigem-review";
export type ControllerPerGameSafetyStatus = "blocked" | "pass" | "review";

export interface ControllerPerGameSafetyCaseInput {
  antiCheatSensitive: boolean;
  gameId: string;
  layoutId: string;
  layoutName: string;
  perGameProfileStaged: boolean;
  protectedTitle: boolean;
  rawInputFallbackReady: boolean;
  requestedCapabilities: string[];
  route: ControllerPerGameSafetyRoute;
  selectedTemplate: string;
  title: string;
}

export interface ControllerPerGameSafetyCase extends ControllerPerGameSafetyCaseInput {
  blockers: string[];
  evidence: string[];
  policyLabel: string;
  status: ControllerPerGameSafetyStatus;
  warnings: string[];
}

export interface ControllerPerGameSafetyPolicyProof {
  blockedClaims: string[];
  blockedCount: number;
  cases: ControllerPerGameSafetyCase[];
  guardCopy: string;
  nextAction: string;
  passCount: number;
  reviewCount: number;
  statusLabel: string;
  summary: string;
}

const CONTROLLER_PER_GAME_BLOCKED_CLAIMS = [
  "No controller injection claim",
  "No kernel driver install",
  "No raw HID write",
  "No Steam Input enablement",
  "No haptics output",
  "No anti-cheat compatibility claim",
  "No automatic launch routing change",
];

const CONTROLLER_PER_GAME_GUARD_COPY =
  "Per-game controller safety policy evidence is local review only. Protected-title rows require raw-input/keyboard fallback before launch activation; this proof does not inject input, install drivers, write HID reports, enable Steam Input, output haptics, or validate anti-cheat compatibility.";

export function buildControllerPerGameSafetyPolicyProof(
  cases: ControllerPerGameSafetyCaseInput[],
): ControllerPerGameSafetyPolicyProof {
  const plannedCases = cases.map(planSafetyCase);
  const passCount = plannedCases.filter((item) => item.status === "pass").length;
  const reviewCount = plannedCases.filter((item) => item.status === "review").length;
  const blockedCount = plannedCases.filter((item) => item.status === "blocked").length;
  const nextCase =
    plannedCases.find((item) => item.status === "blocked") ??
    plannedCases.find((item) => item.status === "review") ??
    null;

  return {
    blockedClaims: [...CONTROLLER_PER_GAME_BLOCKED_CLAIMS],
    blockedCount,
    cases: plannedCases,
    guardCopy: CONTROLLER_PER_GAME_GUARD_COPY,
    nextAction:
      nextCase?.blockers[0] ??
      nextCase?.warnings[0] ??
      "Per-game controller safety policy can enter staged desktop review.",
    passCount,
    reviewCount,
    statusLabel:
      blockedCount > 0 ? "Policy blocked" : reviewCount > 0 ? "Raw-input review" : "Policy pass",
    summary:
      blockedCount > 0
        ? "Per-game controller safety proof keeps protected-title routes review-only and blocks layouts without raw-input fallback before any launch activation."
        : reviewCount > 0
          ? "Per-game controller safety proof has local raw-input fallback evidence, but native routing remains review-only."
          : "Per-game controller safety proof has local policy evidence for every staged route.",
  };
}

export function createVerifyControllerPerGameSafetyPolicyProof(): ControllerPerGameSafetyPolicyProof {
  return buildControllerPerGameSafetyPolicyProof([
    {
      antiCheatSensitive: true,
      gameId: "akira-revenge",
      layoutId: "layout-akira-raw-input",
      layoutName: "Akira Raw-Input Safety Draft",
      perGameProfileStaged: true,
      protectedTitle: true,
      rawInputFallbackReady: true,
      requestedCapabilities: ["keyboard", "mouse", "raw-input fallback"],
      route: "raw-input-keyboard",
      selectedTemplate: "keyboardMouse",
      title: "Akira's Revenge",
    },
    {
      antiCheatSensitive: false,
      gameId: "neo-tokyo-drift",
      layoutId: "layout-neo-vigem-review",
      layoutName: "Neo Drift Virtual Pad Review",
      perGameProfileStaged: true,
      protectedTitle: false,
      rawInputFallbackReady: true,
      requestedCapabilities: ["virtual pad", "button remap"],
      route: "vigem-review",
      selectedTemplate: "gamepad",
      title: "Neo-Tokyo Drift",
    },
    {
      antiCheatSensitive: true,
      gameId: "mech-warrior-beta",
      layoutId: "layout-mech-motion-draft",
      layoutName: "Mech Motion Draft",
      perGameProfileStaged: true,
      protectedTitle: true,
      rawInputFallbackReady: false,
      requestedCapabilities: ["gyro intent", "haptics intent"],
      route: "blocked",
      selectedTemplate: "gamepadGyro",
      title: "Mech Warrior - Beta Access",
    },
  ]);
}

function planSafetyCase(input: ControllerPerGameSafetyCaseInput): ControllerPerGameSafetyCase {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const evidence: string[] = [
    `game ${input.gameId}`,
    `layout ${input.layoutId}`,
    `template ${input.selectedTemplate}`,
  ];

  if (!input.perGameProfileStaged) blockers.push("No per-game profile is staged for this title");
  if ((input.protectedTitle || input.antiCheatSensitive) && !input.rawInputFallbackReady) {
    blockers.push("Protected title is missing a raw-input fallback");
  }
  if ((input.protectedTitle || input.antiCheatSensitive) && input.route !== "raw-input-keyboard") {
    blockers.push(
      "Protected title cannot use virtual-pad or motion routing without fallback review",
    );
  }

  if (input.protectedTitle || input.antiCheatSensitive) {
    warnings.push("Protected-title policy stays review-only; no anti-cheat compatibility claim");
  }
  if (input.route === "vigem-review") {
    warnings.push(
      "Virtual-pad route needs driver, launch, and anti-cheat review before activation",
    );
  }
  if (input.requestedCapabilities.some((capability) => /gyro|haptics/i.test(capability))) {
    warnings.push("Gyro/haptics capability stays intent-only with no HID output");
  }

  if (input.rawInputFallbackReady) evidence.push("raw-input fallback staged");
  if (input.perGameProfileStaged) evidence.push("per-game profile staged");
  if (input.protectedTitle) evidence.push("protected-title classification");

  const status = blockers.length > 0 ? "blocked" : warnings.length > 0 ? "review" : "pass";

  return {
    ...input,
    blockers,
    evidence,
    policyLabel: policyLabelForRoute(input.route),
    status,
    warnings,
  };
}

function policyLabelForRoute(route: ControllerPerGameSafetyRoute) {
  if (route === "raw-input-keyboard") return "Raw-input fallback only";
  if (route === "vigem-review") return "Virtual-pad review only";
  return "Blocked before launch";
}
