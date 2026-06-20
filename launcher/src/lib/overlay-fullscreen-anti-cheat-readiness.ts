export type OverlayFullscreenAntiCheatReadinessStatus = "blocked" | "review";

export interface OverlayFullscreenAntiCheatReadinessInput {
  antiCheatFallbackDeckReady: boolean;
  compatibilityCertificationReady: boolean;
  desktopOverlaySettingsReady: boolean;
  externalOverlayWindowProofReady: boolean;
  fullscreenInjectionStaged: boolean;
  fullscreenModeInventoryReady: boolean;
  gameCaptureProofReady: boolean;
  kernelDriverInstallStaged: boolean;
  liveTitleValidationReady: boolean;
  protectedProcessAttachStaged: boolean;
}

export interface OverlayFullscreenAntiCheatReadinessLane {
  action: string;
  detail: string;
  evidence: string;
  id: string;
  label: string;
  status: OverlayFullscreenAntiCheatReadinessStatus;
}

export interface OverlayFullscreenAntiCheatReadiness {
  blockedCount: number;
  guardCopy: string;
  guards: string[];
  lanes: OverlayFullscreenAntiCheatReadinessLane[];
  reviewCount: number;
  statusLabel: string;
  summary: string;
}

const OVERLAY_FULLSCREEN_ANTI_CHEAT_GUARDS = [
  "Local research packet only",
  "No fullscreen injection",
  "No anti-cheat bypass",
  "No kernel/driver install",
  "No protected-process attach",
  "No game capture proof",
  "No compatibility certification",
  "No live title validation",
  "No external overlay window proof",
  "No E2E success claim",
  "No real game process access",
];

const OVERLAY_FULLSCREEN_ANTI_CHEAT_GUARD_COPY =
  "Fullscreen and anti-cheat readiness is a local research packet only. It reviews overlay settings, fallback UI, and mode inventory without injecting into fullscreen games, bypassing anti-cheat, installing drivers, attaching to protected processes, proving capture, certifying compatibility, validating live titles, opening an external overlay window, claiming E2E success, or accessing a real game process.";

export function buildOverlayFullscreenAntiCheatReadiness(
  input: OverlayFullscreenAntiCheatReadinessInput,
): OverlayFullscreenAntiCheatReadiness {
  const lanes: OverlayFullscreenAntiCheatReadinessLane[] = [
    {
      action: input.fullscreenModeInventoryReady
        ? "Keep fullscreen modes as a research matrix until desktop validation is approved."
        : "Restore the fullscreen mode inventory before anti-cheat research review.",
      detail: input.fullscreenModeInventoryReady
        ? "The packet names windowed, borderless, exclusive, and fallback HUD modes without touching game windows."
        : "No local fullscreen mode inventory is available.",
      evidence: input.fullscreenModeInventoryReady
        ? "windowed // borderless // exclusive // fallback HUD"
        : "missing",
      id: "fullscreen-mode-inventory",
      label: "Fullscreen mode inventory",
      status: input.fullscreenModeInventoryReady ? "review" : "blocked",
    },
    {
      action: input.desktopOverlaySettingsReady
        ? "Use existing overlay settings as static configuration evidence only."
        : "Restore overlay settings persistence before fullscreen research review.",
      detail: input.desktopOverlaySettingsReady
        ? "Hotkey, opacity, and position settings exist, but this packet does not open an overlay over a title."
        : "Overlay settings evidence is missing.",
      evidence: input.desktopOverlaySettingsReady ? "hotkey // opacity // position" : "missing",
      id: "desktop-overlay-settings",
      label: "Desktop overlay settings",
      status: input.desktopOverlaySettingsReady ? "review" : "blocked",
    },
    {
      action: input.antiCheatFallbackDeckReady
        ? "Keep the anti-cheat fallback deck separate from compatibility or bypass claims."
        : "Restore the blocked-title fallback deck before protected-title review.",
      detail: input.antiCheatFallbackDeckReady
        ? "Fallback UI can tell the user the overlay is blocked and route to safe actions."
        : "No local anti-cheat fallback deck is staged.",
      evidence: input.antiCheatFallbackDeckReady
        ? "blocked banner // fallback actions // no bypass"
        : "missing",
      id: "anti-cheat-fallback-deck",
      label: "Anti-cheat fallback deck",
      status: input.antiCheatFallbackDeckReady ? "review" : "blocked",
    },
    {
      action: input.fullscreenInjectionStaged
        ? "Keep fullscreen injection behind legal, provider, and anti-cheat review."
        : "Block fullscreen injection until a safe desktop research plan exists.",
      detail: input.fullscreenInjectionStaged
        ? "Fullscreen injection evidence exists, but this panel does not execute it."
        : "No fullscreen injection path is staged.",
      evidence: input.fullscreenInjectionStaged ? "research note only" : "blocked",
      id: "fullscreen-injection",
      label: "Fullscreen injection",
      status: input.fullscreenInjectionStaged ? "review" : "blocked",
    },
    {
      action: input.protectedProcessAttachStaged
        ? "Keep protected-process access behind compliance and user-safety review."
        : "Block protected-process attach for anti-cheat-sensitive titles.",
      detail: input.protectedProcessAttachStaged
        ? "Protected-process attach evidence exists, but this panel never attaches to a process."
        : "No protected-process attach path is staged.",
      evidence: input.protectedProcessAttachStaged ? "compliance note only" : "blocked",
      id: "protected-process-attach",
      label: "Protected-process attach",
      status: input.protectedProcessAttachStaged ? "review" : "blocked",
    },
    {
      action: input.kernelDriverInstallStaged
        ? "Keep driver work behind signed-driver, uninstall, and security review."
        : "Block kernel or driver installation for overlay readiness.",
      detail: input.kernelDriverInstallStaged
        ? "Driver evidence exists, but this launcher state does not install or load drivers."
        : "No kernel or driver install path is staged.",
      evidence: input.kernelDriverInstallStaged ? "driver checklist only" : "blocked",
      id: "kernel-driver-install",
      label: "Kernel/driver install",
      status: input.kernelDriverInstallStaged ? "review" : "blocked",
    },
    {
      action: input.externalOverlayWindowProofReady
        ? "Keep external-window evidence attached to desktop-only review."
        : "Block external overlay window proof until desktop E2E capture exists.",
      detail: input.externalOverlayWindowProofReady
        ? "External overlay window evidence exists, but this packet does not open one."
        : "No external overlay window proof is attached.",
      evidence: input.externalOverlayWindowProofReady ? "desktop E2E note only" : "blocked",
      id: "external-overlay-window-proof",
      label: "External overlay window proof",
      status: input.externalOverlayWindowProofReady ? "review" : "blocked",
    },
    {
      action: input.gameCaptureProofReady
        ? "Keep capture evidence scoped to approved test titles and redacted media."
        : "Block game capture proof until safe test-title capture is staged.",
      detail: input.gameCaptureProofReady
        ? "Capture evidence exists, but this packet does not capture a running game."
        : "No game capture proof is staged.",
      evidence: input.gameCaptureProofReady ? "capture checklist only" : "blocked",
      id: "game-capture-proof",
      label: "Game capture proof",
      status: input.gameCaptureProofReady ? "review" : "blocked",
    },
    {
      action: input.liveTitleValidationReady
        ? "Keep live-title validation behind explicit title allowlists and consent."
        : "Block live title validation until approved test titles are selected.",
      detail: input.liveTitleValidationReady
        ? "Live-title validation evidence exists, but this packet uses no live title."
        : "No live title validation is staged.",
      evidence: input.liveTitleValidationReady ? "title allowlist only" : "blocked",
      id: "live-title-validation",
      label: "Live title validation",
      status: input.liveTitleValidationReady ? "review" : "blocked",
    },
    {
      action: input.compatibilityCertificationReady
        ? "Keep certification evidence behind vendor and title-owner review."
        : "Block compatibility certification claims until external review exists.",
      detail: input.compatibilityCertificationReady
        ? "Certification evidence exists, but this local packet does not certify compatibility."
        : "No compatibility certification is attached.",
      evidence: input.compatibilityCertificationReady ? "review checklist only" : "blocked",
      id: "compatibility-certification",
      label: "Compatibility certification",
      status: input.compatibilityCertificationReady ? "review" : "blocked",
    },
  ];

  const reviewCount = lanes.filter((lane) => lane.status === "review").length;
  const blockedCount = lanes.filter((lane) => lane.status === "blocked").length;

  return {
    blockedCount,
    guardCopy: OVERLAY_FULLSCREEN_ANTI_CHEAT_GUARD_COPY,
    guards: [...OVERLAY_FULLSCREEN_ANTI_CHEAT_GUARDS],
    lanes,
    reviewCount,
    statusLabel: blockedCount > 0 ? "Research only" : "Review staged",
    summary:
      "Overlay fullscreen and anti-cheat readiness reviews local mode inventory, overlay settings, and blocked-title fallback UX while fullscreen injection, anti-cheat bypass, protected-process access, game capture proof, live title validation, external overlay window proof, compatibility certification, E2E success, and real game process access stay blocked.",
  };
}

export function createVerifyOverlayFullscreenAntiCheatReadiness(): OverlayFullscreenAntiCheatReadiness {
  return buildOverlayFullscreenAntiCheatReadiness({
    antiCheatFallbackDeckReady: true,
    compatibilityCertificationReady: false,
    desktopOverlaySettingsReady: true,
    externalOverlayWindowProofReady: false,
    fullscreenInjectionStaged: false,
    fullscreenModeInventoryReady: true,
    gameCaptureProofReady: false,
    kernelDriverInstallStaged: false,
    liveTitleValidationReady: false,
    protectedProcessAttachStaged: false,
  });
}
