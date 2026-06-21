import {
  Activity,
  AlertTriangle,
  Cable,
  Cpu,
  Gamepad2,
  Keyboard,
  RefreshCw,
  Shield,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ControllerLayoutEditor } from "../components/controllers/ControllerLayoutEditor";
import { getControllerRuntimeStatus, listControllers } from "../lib/launcher";
import {
  buildLocalMultiplayerHub,
  type LocalMultiplayerHubModel,
  type LocalMultiplayerSlot,
} from "../lib/local-multiplayer-hub";
import {
  buildControllerGyroHapticsReadinessPlan,
  type ControllerGyroHapticsCandidate,
  type ControllerGyroHapticsLane,
  type ControllerGyroHapticsReadinessPlan,
} from "../lib/controller-gyro-haptics-readiness";
import {
  createVerifyControllerPerGameSafetyPolicyProof,
  type ControllerPerGameSafetyCase,
  type ControllerPerGameSafetyPolicyProof,
  type ControllerPerGameSafetyStatus,
} from "../lib/controller-per-game-safety-policy";
import {
  buildControllerCapabilityEvidence,
  createVerifyControllerCapabilityEvidence,
  type ControllerCapabilityEvidencePlan,
  type ControllerCapabilityEvidenceRow,
} from "../lib/controller-capability-evidence";
import {
  createVerifyHostedControllerLayoutReadiness,
  type HostedControllerLayoutGate,
  type HostedControllerLayoutReadiness,
  type HostedControllerLayoutRolloutBlocker,
  type HostedControllerLayoutStatus,
} from "../lib/hosted-controller-layout-readiness";
import {
  buildVirtualGamepadReadinessPlan,
  type VirtualGamepadLaneCandidate,
  type VirtualGamepadPlannedLane,
  type VirtualGamepadReadinessPlan,
} from "../lib/virtual-gamepad-readiness";
import type { ControllerDevice, ControllerRuntimeStatus } from "../lib/types/controllers";

export function ControllersPage() {
  const [devices, setDevices] = useState<ControllerDevice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocalFallback, setIsLocalFallback] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<ControllerRuntimeStatus | null>(null);
  const searchParams = new URLSearchParams(window.location.search);
  const isVirtualGamepadVerify = searchParams.get("verify") === "virtual-gamepad-readiness";
  const isGyroHapticsVerify = searchParams.get("verify") === "controller-gyro-haptics-readiness";
  const isHostedControllerLayoutsVerify =
    searchParams.get("verify") === "hosted-controller-layouts";
  const isControllerRuntimeActivationVerify =
    searchParams.get("verify") === "controller-runtime-activation";
  const isControllerCapabilityEvidenceVerify =
    searchParams.get("verify") === "controller-capability-evidence";
  const isControllerPerGameSafetyPolicyVerify =
    searchParams.get("verify") === "controller-per-game-safety-raw-input";
  const displayedRuntimeStatus = runtimeStatus;
  const localMultiplayerHub = buildLocalMultiplayerHub(devices, displayedRuntimeStatus);
  const virtualGamepadRuntimeStatus = isVirtualGamepadVerify
    ? createVirtualGamepadVerifyRuntimeStatus()
    : displayedRuntimeStatus;
  const hostedControllerLayoutReadiness = isHostedControllerLayoutsVerify
    ? createVerifyHostedControllerLayoutReadiness()
    : null;
  const virtualGamepadPlan = buildVirtualGamepadReadinessPlan(
    createVirtualGamepadLanes(devices, virtualGamepadRuntimeStatus, isVirtualGamepadVerify),
  );
  const gyroHapticsPlan = buildControllerGyroHapticsReadinessPlan(
    createGyroHapticsCandidates(devices, virtualGamepadRuntimeStatus, isGyroHapticsVerify),
  );
  const capabilityEvidencePlan = isControllerCapabilityEvidenceVerify
    ? createVerifyControllerCapabilityEvidence()
    : buildControllerCapabilityEvidence(devices, displayedRuntimeStatus);
  const perGameSafetyPolicyProof = isControllerPerGameSafetyPolicyVerify
    ? createVerifyControllerPerGameSafetyPolicyProof()
    : null;

  const refreshDevices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    if (isControllerRuntimeActivationVerify) {
      setDevices(createMockControllerDevices());
      setRuntimeStatus(createControllerRuntimeActivationVerifyStatus());
      setIsLocalFallback(true);
      setError(
        "Verification mode: local controller runtime activation preview. Desktop bridge commands are still required for live Apply/Clear.",
      );
      setIsLoading(false);
      return;
    }

    try {
      const [nextDevices, nextStatus] = await Promise.all([
        listControllers(),
        getControllerRuntimeStatus().catch(() => null),
      ]);
      if (!Array.isArray(nextDevices)) {
        throw new Error("Desktop controller bridge returned an invalid device list.");
      }
      setDevices(nextDevices);
      setRuntimeStatus(nextStatus);
      setIsLocalFallback(false);
    } catch (err) {
      setDevices(createMockControllerDevices());
      setRuntimeStatus(createMockControllerRuntimeStatus());
      setIsLocalFallback(true);
      setError(
        `Desktop controller bridge unavailable in this browser session; showing local controller preview devices. ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      setIsLoading(false);
    }
  }, [isControllerRuntimeActivationVerify]);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  return (
    <main className="neo-dots min-h-full p-4 text-[#171411] md:p-6">
      <div className="mx-auto max-w-[1220px]">
        <section className="mb-5 border-4 border-black bg-[#f6edd8] p-5 shadow-[8px_8px_0_#171411]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="neo-copy text-[11px] font-black uppercase tracking-[0.25em] text-[#b7102a]">
                OG-Launcher Input
              </p>
              <h1 className="neo-title mt-2 text-5xl uppercase leading-none">Controller Support</h1>
              <div className="neo-dots mt-3 h-2 w-16 bg-black" />
              <p className="neo-copy mt-4 max-w-3xl text-sm font-bold uppercase leading-6 text-[#5f574d]">
                Steam-like controller hub: device detection, global defaults, per-game profiles,
                community layouts, gyro and haptics flags.
              </p>
            </div>
            <button
              className="neo-copy flex h-12 items-center gap-2 border-2 border-black bg-[#8cf5e4] px-4 text-xs font-black uppercase shadow-[4px_4px_0_#171411] hover:bg-[#67e5d3]"
              disabled={isLoading}
              type="button"
              onClick={() => void refreshDevices()}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} /> Scan Pads
            </button>
          </div>
          {error ? (
            <p
              className={`neo-copy mt-4 border-2 border-black p-3 text-xs font-black uppercase shadow-[3px_3px_0_#171411] ${
                isLocalFallback ? "bg-[#8cf5e4] text-[#171411]" : "bg-[#b7102a] text-white"
              }`}
            >
              {error}
            </p>
          ) : null}
        </section>

        {displayedRuntimeStatus ? (
          <section className="mb-5 grid gap-3 border-4 border-black bg-[#fbf4e7] p-4 shadow-[6px_6px_0_#171411] md:grid-cols-4">
            <div>
              <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">
                Active Layout
              </p>
              <p className="neo-title mt-1 text-2xl uppercase">
                {displayedRuntimeStatus.activeLayoutName ?? "None"}
              </p>
            </div>
            <div>
              <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">Runtime</p>
              <p className="neo-copy mt-1 text-xs font-black uppercase">
                {displayedRuntimeStatus.activeTemplate ?? "Idle"} · ViGEm{" "}
                {displayedRuntimeStatus.vigemBusDetected ? "Ready" : "Missing"}
              </p>
            </div>
            <div>
              <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">Target</p>
              <p className="neo-copy mt-1 break-all text-xs font-black uppercase">
                {displayedRuntimeStatus.activeGameId ?? "No game"}
              </p>
            </div>
            <p className="neo-copy border-2 border-black bg-[#efe3cf] p-2 text-[10px] font-bold uppercase leading-5 text-[#5f574d] md:col-span-1">
              {displayedRuntimeStatus.driverMessage}
            </p>
          </section>
        ) : null}

        <ControllerCapabilityEvidencePanel plan={capabilityEvidencePlan} />

        <VirtualGamepadReadinessPanel
          plan={virtualGamepadPlan}
          runtimeStatus={virtualGamepadRuntimeStatus}
        />

        <ControllerGyroHapticsReadinessPanel plan={gyroHapticsPlan} />

        {perGameSafetyPolicyProof ? (
          <ControllerPerGameSafetyPolicyPanel proof={perGameSafetyPolicyProof} />
        ) : null}

        <LocalMultiplayerHubPanel hub={localMultiplayerHub} />

        {hostedControllerLayoutReadiness ? (
          <HostedControllerLayoutsReadinessPanel readiness={hostedControllerLayoutReadiness} />
        ) : null}

        <ControllerLayoutEditor
          devices={devices}
          gameId={isControllerRuntimeActivationVerify ? "verify-local-coop" : undefined}
          gameTitle={isControllerRuntimeActivationVerify ? "Runtime Activation Preview" : undefined}
          onRuntimeStatusChange={setRuntimeStatus}
          runtimeStatus={displayedRuntimeStatus}
        />
      </div>
    </main>
  );
}

function ControllerCapabilityEvidencePanel({ plan }: { plan: ControllerCapabilityEvidencePlan }) {
  return (
    <section
      aria-label="Controller capability evidence"
      className="mb-5 border-4 border-black bg-[#fbf4e7] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Input Capability Evidence
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <Shield aria-hidden="true" className="h-8 w-8" /> Capability Evidence
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
            {plan.summary}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411]">
          Inferred only
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">Evidence Rows</p>
          <p className="neo-title mt-1 text-5xl uppercase text-[#171411]">
            {plan.inferredCount}/{plan.rows.length}
          </p>
          <div className="mt-3 grid gap-2">
            {plan.runtimeEvidence.map((item) => (
              <p
                className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase leading-4 text-[#171411]"
                key={item}
              >
                {item}
              </p>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {plan.rows.map((row) => (
            <ControllerCapabilityEvidenceCard key={row.id} row={row} />
          ))}
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#8cf5e4]">Native Guard</p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5">
            {plan.guardCopy}
          </p>
          <div className="mt-3 grid gap-2">
            {plan.guards.map((guard) => (
              <p
                className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5"
                key={guard}
              >
                {guard}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ControllerCapabilityEvidenceCard({ row }: { row: ControllerCapabilityEvidenceRow }) {
  return (
    <article
      className={`min-h-[230px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${
        row.confidence === "medium" ? "bg-[#8cf5e4]" : "bg-[#fff9ed]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#5f574d]">
            {row.controllerType}
          </p>
          <h3 className="mt-1 text-lg font-black uppercase leading-tight text-[#171411]">
            {row.label}
          </h3>
        </div>
        {row.connected ? (
          <Gamepad2 aria-hidden="true" className="h-6 w-6 text-[#087d6d]" />
        ) : (
          <AlertTriangle aria-hidden="true" className="h-6 w-6 text-[#b7102a]" />
        )}
      </div>

      <p className="neo-copy mt-3 text-[9px] font-black uppercase text-[#5f574d]">
        {row.connected ? "connected" : "offline"} // {row.confidence} confidence
      </p>

      <div className="mt-3 grid gap-2">
        <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase leading-4 text-[#171411]">
          gyro {row.gyroEvidence}
        </p>
        <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase leading-4 text-[#171411]">
          haptics {row.hapticsEvidence}
        </p>
        <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase leading-4 text-[#171411]">
          virtual {row.virtualPadEvidence}
        </p>
      </div>

      <p className="neo-copy mt-3 text-[9px] font-black uppercase leading-4 text-[#5f574d]">
        Sources: {row.sources.join(" / ")}
      </p>
    </article>
  );
}

function HostedControllerLayoutsReadinessPanel({
  readiness,
}: {
  readiness: HostedControllerLayoutReadiness;
}) {
  const consentRollbackEvidence = readiness.consentRollbackEvidence;

  return (
    <section
      aria-label="Hosted controller community layouts readiness"
      className="mb-5 border-4 border-black bg-[#fbf4e7] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Community Layout Cloud Preflight
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <Users aria-hidden="true" className="h-8 w-8" /> Hosted Layouts Readiness
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
            {readiness.summary}
          </p>
        </div>
        <span
          className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#171411] ${getHostedLayoutStatusClass(
            readiness.blockedCount > 0
              ? "blocked"
              : readiness.warningCount > 0
                ? "warning"
                : "ready",
          )}`}
        >
          {readiness.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">Review Gates</p>
          <p className="neo-title mt-1 text-5xl uppercase text-[#171411]">
            {readiness.readyCount}/{readiness.gates.length}
          </p>
          <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-5 text-[#5f574d]">
            Next: {readiness.nextAction}
          </p>
          <div className="mt-3 h-3 border-2 border-black bg-[#fff9ed]">
            <div className="h-full bg-[#087d6d]" style={{ width: `${readiness.progress}%` }} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {readiness.gates.map((gate) => (
            <HostedControllerLayoutGateCard gate={gate} key={gate.id} />
          ))}
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#8cf5e4]">Hosted Guard</p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5">
            {readiness.guardCopy}
          </p>
          <div className="mt-3 grid gap-2">
            {readiness.guards.map((guard) => (
              <p
                className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5"
                key={guard}
              >
                {guard}
              </p>
            ))}
          </div>
        </div>
      </div>

      {consentRollbackEvidence ? (
        <div className="mt-4 border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-3">
            <div>
              <p className="neo-copy text-[10px] font-black uppercase tracking-[0.18em] text-[#b7102a]">
                Profile Consent Review
              </p>
              <p className="neo-copy mt-2 max-w-3xl text-[10px] font-black uppercase leading-5 text-[#5f574d]">
                {consentRollbackEvidence.storageScope}
              </p>
            </div>
            <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[9px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411]">
              Opt-in only
            </span>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
              <p className="neo-copy text-[9px] font-black uppercase text-[#b7102a]">
                Consent Gate
              </p>
              <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-5 text-[#171411]">
                {consentRollbackEvidence.consentLabel}
              </p>
            </div>
            <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
              <p className="neo-copy text-[9px] font-black uppercase text-[#b7102a]">
                Disable Switch
              </p>
              <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-5 text-[#171411]">
                {consentRollbackEvidence.disableSwitchLabel}
              </p>
            </div>
            <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
              <p className="neo-copy text-[9px] font-black uppercase text-[#8cf5e4]">
                Rollout Guard
              </p>
              <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-5">
                {consentRollbackEvidence.rolloutGuard}
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {consentRollbackEvidence.rollbackSteps.map((step) => (
              <p
                className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-black uppercase leading-5 text-[#171411]"
                key={step}
              >
                {step}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#fff9ed] pb-3">
          <div>
            <p className="neo-copy text-[10px] font-black uppercase tracking-[0.18em] text-[#8cf5e4]">
              Rollout Blockers
            </p>
            <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-5">
              8/8 review gates are staged; production release lanes stay blocked.
            </p>
          </div>
          <span className="neo-copy border-2 border-[#fff9ed] bg-[#b7102a] px-3 py-2 text-[9px] font-black uppercase text-white shadow-[3px_3px_0_#000]">
            {readiness.rolloutBlockedCount} blocked
          </span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {readiness.rolloutBlockers.map((blocker) => (
            <HostedControllerLayoutRolloutBlockerCard blocker={blocker} key={blocker.id} />
          ))}
        </div>
      </div>
    </section>
  );
}

function HostedControllerLayoutGateCard({ gate }: { gate: HostedControllerLayoutGate }) {
  return (
    <article
      className={`min-h-[160px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${getHostedLayoutStatusClass(
        gate.status,
      )}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#5f574d]">
            Hosted Layout Gate
          </p>
          <h3 className="mt-1 text-base font-black uppercase leading-tight text-[#171411]">
            {gate.label}
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
          {gate.status}
        </span>
      </div>
      <p className="neo-copy mt-3 text-[10px] font-black uppercase leading-5 text-[#5f574d]">
        {gate.detail}
      </p>
      <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase leading-4 text-[#171411]">
        {gate.action}
      </p>
    </article>
  );
}

function getHostedLayoutStatusClass(status: HostedControllerLayoutStatus) {
  if (status === "ready") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "warning") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#efe3cf] text-[#171411]";
}

function HostedControllerLayoutRolloutBlockerCard({
  blocker,
}: {
  blocker: HostedControllerLayoutRolloutBlocker;
}) {
  return (
    <article className="border-2 border-[#fff9ed] bg-[#2a221b] p-3 shadow-[3px_3px_0_#b7102a]">
      <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#8cf5e4]">
        Blocked Lane
      </p>
      <h3 className="mt-1 text-base font-black uppercase leading-tight text-[#fff9ed]">
        {blocker.label}
      </h3>
      <p className="neo-copy mt-3 text-[9px] font-black uppercase leading-5 text-[#efe3cf]">
        {blocker.detail}
      </p>
    </article>
  );
}

function ControllerGyroHapticsReadinessPanel({
  plan,
}: {
  plan: ControllerGyroHapticsReadinessPlan;
}) {
  return (
    <section
      aria-label="Controller gyro and haptics readiness"
      className="mb-5 border-4 border-black bg-[#fbf4e7] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Motion + Rumble Preflight
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <Activity aria-hidden="true" className="h-8 w-8" /> Gyro/Haptics Readiness
          </h2>
          <p className="neo-copy mt-2 max-w-2xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
            Review local controller motion, haptics, profile, raw-input, and provider bridge
            evidence before any native HID or Steam Input integration exists.
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411]">
          Local review only
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">Motion Score</p>
          <p className="neo-title mt-1 text-5xl uppercase text-[#171411]">
            {plan.readyCount}/{plan.lanes.length}
          </p>
          <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-5 text-[#5f574d]">
            {plan.summary}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {plan.lanes.slice(0, 3).map((lane) => (
            <ControllerGyroHapticsLaneCard key={lane.id} lane={lane} />
          ))}
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#8cf5e4]">Native Guard</p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5">
            {plan.guardCopy}
          </p>
          <div className="mt-3 grid gap-2">
            {plan.guards.map((guard) => (
              <p
                className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5"
                key={guard}
              >
                {guard}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
        <p className="neo-copy text-[10px] font-black uppercase tracking-[0.18em] text-[#b7102a]">
          Motion Checklist
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {plan.checklist.map((item) => (
            <p
              className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase leading-5 text-[#171411]"
              key={item}
            >
              {item}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

function ControllerGyroHapticsLaneCard({ lane }: { lane: ControllerGyroHapticsLane }) {
  return (
    <article
      className={`min-h-[210px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${getGyroLaneClass(
        lane.status,
      )}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#5f574d]">
            {lane.controllerType}
          </p>
          <h3 className="mt-1 text-lg font-black uppercase leading-tight text-[#171411]">
            {lane.label}
          </h3>
        </div>
        {lane.status === "blocked" ? (
          <AlertTriangle aria-hidden="true" className="h-6 w-6 text-[#b7102a]" />
        ) : (
          <Shield aria-hidden="true" className="h-6 w-6 text-[#087d6d]" />
        )}
      </div>
      <p className="neo-title mt-3 text-3xl uppercase text-[#171411]">{lane.score}</p>
      <p className="neo-copy text-[9px] font-black uppercase text-[#5f574d]">
        motion route // {lane.status}
      </p>
      <div className="mt-3 space-y-2">
        {lane.capabilities.slice(0, 2).map((item) => (
          <p
            className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase leading-4 text-[#171411]"
            key={item}
          >
            {item}
          </p>
        ))}
        {[...lane.blockers, ...lane.warnings].slice(0, 2).map((item) => (
          <p
            className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase leading-4 text-[#171411]"
            key={item}
          >
            {item}
          </p>
        ))}
      </div>
    </article>
  );
}

function getGyroLaneClass(status: ControllerGyroHapticsLane["status"]) {
  if (status === "ready") return "bg-[#8cf5e4]";
  if (status === "warning") return "bg-[#fff9ed]";
  return "bg-[#efe3cf]";
}

function ControllerPerGameSafetyPolicyPanel({
  proof,
}: {
  proof: ControllerPerGameSafetyPolicyProof;
}) {
  return (
    <section
      aria-label="Controller per-game safety raw-input policy"
      className="mb-5 border-4 border-black bg-[#fbf4e7] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Per-Game Safety Proof
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <Shield aria-hidden="true" className="h-8 w-8" /> Raw-Input Policy
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
            {proof.summary}
          </p>
        </div>
        <span
          className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#171411] ${getPerGameSafetyStatusClass(
            proof.blockedCount > 0 ? "blocked" : proof.reviewCount > 0 ? "review" : "pass",
          )}`}
        >
          {proof.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">Policy Lanes</p>
          <p className="neo-title mt-1 text-5xl uppercase text-[#171411]">
            {proof.reviewCount}/{proof.cases.length}
          </p>
          <div className="mt-3 grid gap-2">
            <p className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-black uppercase leading-4 text-[#171411]">
              {proof.passCount} pass / {proof.reviewCount} review / {proof.blockedCount} blocked
            </p>
            <p className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-black uppercase leading-4 text-[#171411]">
              Next: {proof.nextAction}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {proof.cases.map((item) => (
            <ControllerPerGameSafetyCaseCard item={item} key={item.gameId} />
          ))}
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#8cf5e4]">Safety Guard</p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5">
            {proof.guardCopy}
          </p>
          <div className="mt-3 grid gap-2">
            {proof.blockedClaims.map((claim) => (
              <p
                className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5"
                key={claim}
              >
                {claim}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ControllerPerGameSafetyCaseCard({ item }: { item: ControllerPerGameSafetyCase }) {
  return (
    <article
      className={`min-h-[250px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${getPerGameSafetyStatusClass(
        item.status,
      )}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy break-words text-[9px] font-black uppercase tracking-[0.16em] text-[#5f574d]">
            {item.gameId}
          </p>
          <h3 className="mt-1 text-base font-black uppercase leading-tight text-[#171411]">
            {item.title}
          </h3>
        </div>
        {item.status === "blocked" ? (
          <AlertTriangle aria-hidden="true" className="h-6 w-6 shrink-0 text-[#b7102a]" />
        ) : (
          <Keyboard aria-hidden="true" className="h-6 w-6 shrink-0 text-[#087d6d]" />
        )}
      </div>
      <p className="neo-copy mt-3 w-fit border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
        {item.status}
      </p>
      <p className="neo-copy mt-3 text-[9px] font-black uppercase leading-4 text-[#5f574d]">
        {item.layoutName} // {item.policyLabel}
      </p>
      <p className="neo-copy mt-2 text-[9px] font-black uppercase leading-4 text-[#5f574d]">
        Template: {item.selectedTemplate}
      </p>
      <div className="mt-3 grid gap-2">
        {[...item.blockers, ...item.warnings, ...item.evidence].slice(0, 4).map((detail) => (
          <p
            className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
            key={detail}
          >
            {detail}
          </p>
        ))}
      </div>
    </article>
  );
}

function getPerGameSafetyStatusClass(status: ControllerPerGameSafetyStatus) {
  if (status === "pass") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "review") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#efe3cf] text-[#171411]";
}

function VirtualGamepadReadinessPanel({
  plan,
  runtimeStatus,
}: {
  plan: VirtualGamepadReadinessPlan;
  runtimeStatus: ControllerRuntimeStatus | null;
}) {
  const runtimeCards = [
    {
      label: runtimeStatus?.vigemBusDetected ? "ViGEm bridge detected" : "ViGEm bridge missing",
      ready: Boolean(runtimeStatus?.vigemBusDetected),
    },
    {
      label: runtimeStatus?.keyboardMouseEmulationReady
        ? "Keyboard/mouse fallback ready"
        : "Keyboard/mouse fallback blocked",
      ready: Boolean(runtimeStatus?.keyboardMouseEmulationReady),
    },
    {
      label: runtimeStatus?.nativePassthroughReady
        ? "Native passthrough ready"
        : "Native passthrough blocked",
      ready: Boolean(runtimeStatus?.nativePassthroughReady),
    },
  ];

  return (
    <section
      aria-label="Virtual gamepad readiness"
      className="mb-5 border-4 border-black bg-[#fbf4e7] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Kernel Driver Preflight
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <Cpu aria-hidden="true" className="h-8 w-8" /> Virtual Gamepad Readiness
          </h2>
          <p className="neo-copy mt-2 max-w-2xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
            Rank local virtual-pad lanes from runtime evidence, layout state, signed-driver signals,
            and anti-cheat fallback review before any driver install exists.
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411]">
          Local readiness only
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <div className="grid gap-3 md:grid-cols-3">
          {runtimeCards.map((card) => (
            <div
              className={`border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${
                card.ready ? "bg-[#8cf5e4]" : "bg-[#fff9ed]"
              }`}
              key={card.label}
            >
              <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">
                Runtime Gate
              </p>
              <p className="neo-copy mt-2 text-[11px] font-black uppercase leading-5 text-[#171411]">
                {card.label}
              </p>
            </div>
          ))}
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#8cf5e4]">Driver Guard</p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[10px] font-black uppercase leading-5">
            {plan.guardCopy}
          </p>
          <div className="mt-3 grid gap-2">
            {plan.guards.map((guard) => (
              <p
                className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[10px] font-black uppercase leading-5"
                key={guard}
              >
                {guard}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[280px_minmax(0,1fr)]">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">
            Preflight Score
          </p>
          <p className="neo-title mt-1 text-5xl uppercase text-[#171411]">
            {plan.readyCount}/{plan.lanes.length}
          </p>
          <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-5 text-[#5f574d]">
            {plan.summary}
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {plan.lanes.map((lane) => (
            <VirtualGamepadLaneCard key={lane.id} lane={lane} />
          ))}
        </div>
      </div>

      <div className="mt-4 border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
        <p className="neo-copy text-[10px] font-black uppercase tracking-[0.18em] text-[#b7102a]">
          Readiness Checklist
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {plan.checklist.map((item) => (
            <p
              className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase leading-5 text-[#171411]"
              key={item}
            >
              {item}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

function VirtualGamepadLaneCard({ lane }: { lane: VirtualGamepadPlannedLane }) {
  return (
    <article
      className={`min-h-[190px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${getVirtualLaneClass(
        lane.status,
      )}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#5f574d]">
            {lane.target}
          </p>
          <h3 className="mt-1 text-lg font-black uppercase leading-tight text-[#171411]">
            {lane.label}
          </h3>
        </div>
        {lane.status === "blocked" ? (
          <AlertTriangle aria-hidden="true" className="h-6 w-6 text-[#b7102a]" />
        ) : (
          <Shield aria-hidden="true" className="h-6 w-6 text-[#087d6d]" />
        )}
      </div>
      <p className="neo-title mt-3 text-3xl uppercase text-[#171411]">{lane.score}</p>
      <p className="neo-copy text-[9px] font-black uppercase text-[#5f574d]">
        {lane.driverMode} route // {lane.status}
      </p>
      <div className="mt-3 space-y-2">
        {[...lane.blockers, ...lane.warnings].slice(0, 3).map((item) => (
          <p
            className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] font-black uppercase leading-4 text-[#171411]"
            key={item}
          >
            {item}
          </p>
        ))}
      </div>
    </article>
  );
}

function getVirtualLaneClass(status: VirtualGamepadPlannedLane["status"]) {
  if (status === "ready") return "bg-[#8cf5e4]";
  if (status === "warning") return "bg-[#fff9ed]";
  return "bg-[#efe3cf]";
}

function LocalMultiplayerHubPanel({ hub }: { hub: LocalMultiplayerHubModel }) {
  return (
    <section
      aria-label="Local multiplayer hub"
      className="mb-5 border-4 border-black bg-[#fbf4e7] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Couch Co-Op Auto Config
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <Users aria-hidden="true" className="h-8 w-8" /> Local Multiplayer Hub
          </h2>
          <p className="neo-copy mt-2 max-w-2xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
            Stage four local seats, detect standby pads, and prep a launch-ready controller lane
            before opening a split-screen game.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#171411] ${getCoOpBadgeClass(
              hub.coOpStatus,
            )}`}
          >
            {hub.coOpStatusLabel}
          </span>
          <span
            className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#171411] ${getBridgeBadgeClass(
              hub.bridgeStatus,
            )}`}
          >
            {hub.bridgeMode}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">Ready Seats</p>
          <p className="neo-title mt-1 text-4xl uppercase text-[#171411]">
            {hub.readySlots} / {hub.maxPlayers}
          </p>
        </div>
        <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">Standby Pads</p>
          <p className="neo-title mt-1 text-4xl uppercase text-[#171411]">{hub.standbySlots}</p>
        </div>
        <div
          className={`border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${getCoOpCardClass(
            hub.coOpStatus,
          )}`}
        >
          <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">Co-op Status</p>
          <p className="neo-title mt-1 text-2xl uppercase text-[#171411]">{hub.coOpStatusLabel}</p>
          <p className="neo-copy mt-2 text-[10px] font-black uppercase leading-5 text-[#5f574d]">
            Minimum {hub.minimumReadySeats} ready seats // {hub.blockedCount}{" "}
            {hub.blockedCount === 1 ? "blocker" : "blockers"}
          </p>
        </div>
        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#8cf5e4]">Next Move</p>
          <p className="neo-copy mt-2 text-[11px] font-black uppercase leading-5">
            {hub.recommendation}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {hub.slots.map((slot) => (
          <article
            className={`min-h-[150px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${getSlotClass(
              slot.state,
            )}`}
            key={slot.player}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="neo-title text-3xl uppercase">P{slot.player}</span>
              {getSlotIcon(slot)}
            </div>
            <h3 className="mt-3 text-sm font-black uppercase text-[#171411]">{slot.label}</h3>
            <p className="neo-copy mt-1 text-[10px] font-black uppercase text-[#5f574d]">
              {slot.status}
            </p>
            <p className="neo-copy mt-3 text-[10px] font-bold uppercase leading-5 text-[#5f574d]">
              {slot.action}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-4 border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
        <p className="neo-copy text-[10px] font-black uppercase tracking-[0.18em] text-[#b7102a]">
          Auto-Config Checklist
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {hub.checklist.map((item) => (
            <p
              className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] font-black uppercase leading-5 text-[#171411]"
              key={item}
            >
              {item}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

function getBridgeBadgeClass(status: LocalMultiplayerHubModel["bridgeStatus"]) {
  if (status === "ready") return "bg-[#087d6d] text-white";
  if (status === "setup") return "bg-[#8cf5e4] text-[#171411]";
  return "bg-[#b7102a] text-white";
}

function getCoOpBadgeClass(status: LocalMultiplayerHubModel["coOpStatus"]) {
  if (status === "ready") return "bg-[#087d6d] text-white";
  if (status === "staged") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#b7102a] text-white";
}

function getCoOpCardClass(status: LocalMultiplayerHubModel["coOpStatus"]) {
  if (status === "ready") return "bg-[#fff9ed]";
  if (status === "staged") return "bg-[#fff9ed]";
  return "bg-[#efe3cf]";
}

function getSlotClass(state: LocalMultiplayerSlot["state"]) {
  if (state === "ready") return "bg-[#8cf5e4]";
  if (state === "keyboard") return "bg-[#fff9ed]";
  if (state === "standby") return "bg-[#f4ead8]";
  return "bg-[#efe3cf]";
}

function getSlotIcon(slot: LocalMultiplayerSlot) {
  const className = "h-7 w-7 text-[#171411]";
  if (slot.state === "keyboard") return <Keyboard aria-hidden="true" className={className} />;
  if (slot.state === "empty") return <Cable aria-hidden="true" className={className} />;
  return <Gamepad2 aria-hidden="true" className={className} />;
}

function createVirtualGamepadLanes(
  devices: ControllerDevice[],
  runtimeStatus: ControllerRuntimeStatus | null,
  verifyMode: boolean,
): VirtualGamepadLaneCandidate[] {
  if (verifyMode) {
    return [
      {
        adminApproved: true,
        antiCheatSensitive: false,
        connected: true,
        driverMode: "vigem",
        gyroDriverReady: true,
        gyroRequested: true,
        hapticsDriverReady: true,
        hapticsRequested: true,
        id: "verify-vigem-bridge",
        label: "ViGEm Bridge Lane",
        layoutReady: true,
        rawInputFallbackReady: true,
        signedDriverReady: true,
        target: "Split-Screen Arcade",
        virtualDriverReady: true,
      },
      {
        adminApproved: false,
        antiCheatSensitive: true,
        connected: true,
        driverMode: "vigem",
        gyroDriverReady: false,
        gyroRequested: true,
        hapticsDriverReady: true,
        hapticsRequested: true,
        id: "verify-protected-game",
        label: "Protected Game Review",
        layoutReady: true,
        rawInputFallbackReady: true,
        signedDriverReady: true,
        target: "Anti-Cheat Title",
        virtualDriverReady: true,
      },
      {
        adminApproved: false,
        antiCheatSensitive: true,
        connected: false,
        driverMode: "keyboard",
        gyroDriverReady: false,
        gyroRequested: false,
        hapticsDriverReady: false,
        hapticsRequested: false,
        id: "verify-driver-install",
        label: "Driver Install Slot",
        layoutReady: false,
        rawInputFallbackReady: false,
        signedDriverReady: false,
        target: "Kernel Route",
        virtualDriverReady: false,
      },
    ];
  }

  const connectedDevices = devices.filter((device) => device.isConnected);
  const primaryDevice = connectedDevices[0];
  const hasLayout = Boolean(runtimeStatus?.activeLayoutName);
  const hasVirtualBridge = Boolean(
    runtimeStatus?.vigemBusDetected || runtimeStatus?.nativePassthroughReady,
  );

  return [
    {
      adminApproved: Boolean(runtimeStatus?.nativePassthroughReady),
      antiCheatSensitive: false,
      connected: Boolean(primaryDevice),
      driverMode: runtimeStatus?.vigemBusDetected
        ? "vigem"
        : runtimeStatus?.nativePassthroughReady
          ? "native"
          : "keyboard",
      gyroDriverReady: Boolean(runtimeStatus?.nativePassthroughReady),
      gyroRequested: true,
      hapticsDriverReady: Boolean(runtimeStatus?.nativePassthroughReady),
      hapticsRequested: true,
      id: primaryDevice?.id ?? "local-pad-lane",
      label: primaryDevice?.name ?? "Local Pad Lane",
      layoutReady: hasLayout,
      rawInputFallbackReady: Boolean(runtimeStatus?.keyboardMouseEmulationReady),
      signedDriverReady: Boolean(runtimeStatus?.vigemBusDetected),
      target: "Local Gamepad",
      virtualDriverReady: hasVirtualBridge,
    },
    {
      adminApproved: false,
      antiCheatSensitive: true,
      connected: connectedDevices.length > 0,
      driverMode: "keyboard",
      gyroDriverReady: false,
      gyroRequested: false,
      hapticsDriverReady: false,
      hapticsRequested: false,
      id: "raw-input-fallback",
      label: "Raw-Input Fallback",
      layoutReady: hasLayout,
      rawInputFallbackReady: Boolean(runtimeStatus?.keyboardMouseEmulationReady),
      signedDriverReady: false,
      target: "Protected Games",
      virtualDriverReady: Boolean(runtimeStatus?.keyboardMouseEmulationReady),
    },
  ];
}

function createGyroHapticsCandidates(
  devices: ControllerDevice[],
  runtimeStatus: ControllerRuntimeStatus | null,
  verifyMode: boolean,
): ControllerGyroHapticsCandidate[] {
  if (verifyMode) {
    return [
      {
        antiCheatSensitive: false,
        connected: true,
        controllerType: "DualSense",
        gyroRequested: true,
        gyroSensorDetected: true,
        hapticsActuatorDetected: true,
        hapticsRequested: true,
        hidWriteReady: false,
        id: "verify-dualsense-motion",
        label: "DualSense Motion Preview",
        layoutReady: true,
        perGameProfileReady: true,
        rawInputFallbackReady: true,
        steamInputBridgeReady: false,
      },
      {
        antiCheatSensitive: false,
        connected: true,
        controllerType: "Xbox",
        gyroRequested: false,
        gyroSensorDetected: false,
        hapticsActuatorDetected: true,
        hapticsRequested: true,
        hidWriteReady: false,
        id: "verify-xbox-haptics",
        label: "Xbox Haptics Preview",
        layoutReady: true,
        perGameProfileReady: true,
        rawInputFallbackReady: true,
        steamInputBridgeReady: false,
      },
      {
        antiCheatSensitive: true,
        connected: true,
        controllerType: "Protected Game",
        gyroRequested: true,
        gyroSensorDetected: true,
        hapticsActuatorDetected: true,
        hapticsRequested: true,
        hidWriteReady: false,
        id: "verify-protected-motion",
        label: "Protected Motion Lane",
        layoutReady: true,
        perGameProfileReady: false,
        rawInputFallbackReady: false,
        steamInputBridgeReady: false,
      },
    ];
  }

  const layoutReady = Boolean(runtimeStatus?.activeLayoutName);
  const rawInputFallbackReady = Boolean(runtimeStatus?.keyboardMouseEmulationReady);
  const gyroRequested = runtimeStatus?.activeTemplate?.toLowerCase().includes("gyro") ?? false;
  const connectedDevices = devices.filter((device) => device.isConnected);

  if (connectedDevices.length === 0) {
    return [
      {
        antiCheatSensitive: false,
        connected: false,
        controllerType: "Unknown",
        gyroRequested,
        gyroSensorDetected: false,
        hapticsActuatorDetected: false,
        hapticsRequested: true,
        hidWriteReady: false,
        id: "local-motion-empty",
        label: "No Controller Lane",
        layoutReady,
        perGameProfileReady: false,
        rawInputFallbackReady,
        steamInputBridgeReady: false,
      },
    ];
  }

  return connectedDevices.slice(0, 3).map((device) => {
    const controllerType = device.controllerType ?? "unknown";
    const supportsGyro = controllerType === "playstation";
    const supportsHaptics = controllerType === "playstation" || controllerType === "xbox";

    return {
      antiCheatSensitive: false,
      connected: device.isConnected,
      controllerType,
      gyroRequested,
      gyroSensorDetected: supportsGyro,
      hapticsActuatorDetected: supportsHaptics,
      hapticsRequested: true,
      hidWriteReady: false,
      id: `gyro-haptics-${device.id}`,
      label: `${device.name} Motion Lane`,
      layoutReady,
      perGameProfileReady: layoutReady,
      rawInputFallbackReady,
      steamInputBridgeReady: false,
    };
  });
}

function createMockControllerDevices(): ControllerDevice[] {
  return [
    {
      controllerType: "xbox",
      id: "local-xbox-pad",
      isConnected: true,
      name: "Local Xbox Pad",
      powerLevel: "83%",
      productId: 0x02ff,
      source: "browser preview",
      vendorId: 0x045e,
    },
    {
      controllerType: "playstation",
      id: "local-dualsense-pad",
      isConnected: false,
      name: "DualSense Docked",
      powerLevel: "standby",
      productId: 0x0ce6,
      source: "browser preview",
      vendorId: 0x054c,
    },
  ];
}

function createMockControllerRuntimeStatus(): ControllerRuntimeStatus {
  return {
    activeGameId: null,
    activeLayoutName: "Local Preview Only",
    activeTemplate: null,
    configPath: "localStorage:og-launcher:controller-layouts:v1",
    driverMessage:
      "Browser fallback: no native controller bridge. Layout editing is local; activation requires the desktop app.",
    keyboardMouseEmulationReady: false,
    nativePassthroughReady: false,
    vigemBusDetected: false,
  };
}

function createVirtualGamepadVerifyRuntimeStatus(): ControllerRuntimeStatus {
  return {
    activeGameId: "verify-local-coop",
    activeLayoutName: "Signed ViGEm Local Preview",
    activeTemplate: "gamepadGyro",
    configPath: "verify:virtual-gamepad-readiness",
    driverMessage:
      "Verification mode: deterministic local readiness evidence only. No driver install or anti-cheat compatibility claim is made.",
    keyboardMouseEmulationReady: true,
    nativePassthroughReady: false,
    vigemBusDetected: true,
  };
}

function createControllerRuntimeActivationVerifyStatus(): ControllerRuntimeStatus {
  return {
    activeGameId: "verify-local-coop",
    activeLayoutName: "Runtime Activation Preview",
    activeTemplate: "keyboardMouse",
    configPath: "verify:controller-runtime-activation",
    driverMessage:
      "Verification mode: local runtime config is staged. No driver install, gyro/haptics output, or anti-cheat compatibility claim is made.",
    keyboardMouseEmulationReady: true,
    nativePassthroughReady: false,
    vigemBusDetected: false,
  };
}
