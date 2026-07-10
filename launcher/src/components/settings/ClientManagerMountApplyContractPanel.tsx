import {
  Boxes,
  FileCheck2,
  FolderCheck,
  Gauge,
  HardDrive,
  MonitorCheck,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Waypoints,
} from "lucide-react";

import type {
  ClientManagerAutoApplyCapabilityCheck,
  ClientManagerMountApplyContract,
  ClientManagerMountApplyLane,
  ClientManagerProviderApplyPolicy,
  ClientManagerProviderApplyPolicyStatus,
  ClientManagerMountApplyStatus,
} from "../../lib/client-manager-mount-apply-contract";

export interface ClientManagerMountApplySandboxControls {
  busy: boolean;
  isDesktopRuntime: boolean;
  message: string | null;
  sourcePath: string;
  targetPath: string;
  onLoadFixture?: () => void;
  onRunProof: () => void | Promise<void>;
  onSourcePathChange: (value: string) => void;
  onTargetPathChange: (value: string) => void;
}

export function ClientManagerMountApplyContractPanel({
  contract,
  sandboxControls,
}: {
  contract: ClientManagerMountApplyContract;
  sandboxControls?: ClientManagerMountApplySandboxControls;
}) {
  const tone =
    contract.blockedCount > 0 ? "blocked" : contract.reviewCount > 0 ? "review" : "ready";

  return (
    <section
      aria-label="Client manager mount apply contract"
      className="neo-dots mb-6 border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div className="min-w-0">
          <p className="neo-copy text-[10px] font-black tracking-[0.22em] text-[#b7102a] uppercase">
            Provider Apply / OS Mount Review
          </p>
          <h2 className="neo-title mt-1 flex flex-wrap items-center gap-2 text-3xl leading-none text-[#171411] uppercase">
            <Boxes aria-hidden="true" className="h-8 w-8 shrink-0" />
            Mount Apply Contract
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs leading-5 font-bold [overflow-wrap:anywhere] text-[#5f574d] uppercase">
            {contract.summary}
          </p>
        </div>
        <span
          className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#171411] ${statusClass(
            tone,
          )}`}
        >
          {contract.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy text-[10px] font-black text-[#5f574d] uppercase">Contract Score</p>
          <p className="neo-title mt-1 text-5xl text-[#171411] uppercase">
            {contract.reviewCount}/{contract.lanes.length}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <ContractStat label="Review" value={contract.reviewCount} />
            <ContractStat label="Ready" value={contract.readyCount} />
            <ContractStat label="Blocked" value={contract.blockedCount} />
          </div>
          <p className="neo-copy mt-3 text-[10px] leading-5 font-black [overflow-wrap:anywhere] text-[#5f574d] uppercase">
            Next: {contract.nextAction}
          </p>
          <div className="mt-3 h-3 border-2 border-black bg-[#fff9ed]">
            <div className="h-full bg-[#087d6d]" style={{ width: `${contract.progress}%` }} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {contract.lanes.map((lane) => (
            <ClientManagerMountApplyLaneCard key={lane.id} lane={lane} />
          ))}
        </div>
      </div>

      {sandboxControls || contract.sandboxProof ? (
        <SandboxProofConsole contract={contract} controls={sandboxControls} />
      ) : null}

      <AutoApplyCapabilityMatrix contract={contract} />

      <ProviderPolicyMatrix contract={contract} />

      <div className="mt-4 border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
        <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#8cf5e4] uppercase">
          <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          Apply Guard
        </p>
        <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] leading-5 font-black [overflow-wrap:anywhere] uppercase">
          {contract.guardCopy}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {contract.guards.map((guard) => (
            <p
              className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] leading-5 font-black [overflow-wrap:anywhere] uppercase"
              key={guard}
            >
              {guard}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

function AutoApplyCapabilityMatrix({ contract }: { contract: ClientManagerMountApplyContract }) {
  return (
    <div
      aria-label="Client manager auto apply capability check"
      className="neo-dots mt-4 border-2 border-black bg-[#f5eedf] p-3 shadow-[3px_3px_0_#171411]"
      role="region"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black tracking-[0.16em] text-[#b7102a] uppercase">
            <Gauge aria-hidden="true" className="h-4 w-4" />
            Auto-Apply Capability Check
          </p>
          <p className="neo-copy mt-2 max-w-3xl text-[10px] leading-5 font-black [overflow-wrap:anywhere] text-[#5f574d] uppercase">
            {contract.autoApplyCapabilityCopy}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-3 py-2 text-[9px] font-black text-[#171411] uppercase shadow-[2px_2px_0_#171411]">
          {contract.autoApplyCapabilitySummary.ready + contract.autoApplyCapabilitySummary.review}/
          {contract.autoApplyCapabilitySummary.total} Local Gates
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {contract.autoApplyCapabilities.map((check) => (
          <AutoApplyCapabilityCard check={check} key={check.id} />
        ))}
      </div>
    </div>
  );
}

function AutoApplyCapabilityCard({ check }: { check: ClientManagerAutoApplyCapabilityCheck }) {
  return (
    <article
      className={`min-h-[150px] border-2 border-black p-3 shadow-[2px_2px_0_#171411] ${statusClass(
        check.status,
      )}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1.5 text-[10px] font-black tracking-[0.12em] [overflow-wrap:anywhere] text-[#171411] uppercase">
          <CapabilityIcon id={check.id} />
          <span>{check.label}</span>
        </h3>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black text-[#171411] uppercase">
          {check.status}
        </span>
      </div>
      <p className="neo-copy mt-3 text-[9px] leading-5 font-black [overflow-wrap:anywhere] text-[#5f574d] uppercase">
        {check.detail}
      </p>
      <p className="neo-copy mt-3 border-2 border-black bg-[#171411] px-2 py-1 text-[8px] leading-4 font-black [overflow-wrap:anywhere] text-[#fff9ed] uppercase">
        {check.action}
      </p>
    </article>
  );
}

function CapabilityIcon({ id }: { id: string }) {
  const className = "h-4 w-4 shrink-0";
  if (id === "desktop-runtime") return <MonitorCheck aria-hidden="true" className={className} />;
  if (id === "install-target") return <FolderCheck aria-hidden="true" className={className} />;
  if (id === "free-disk-space") return <HardDrive aria-hidden="true" className={className} />;
  return <ShieldQuestion aria-hidden="true" className={className} />;
}

function ProviderPolicyMatrix({ contract }: { contract: ClientManagerMountApplyContract }) {
  return (
    <div
      aria-label="Client manager provider policy matrix"
      className="mt-4 border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]"
      role="region"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black tracking-[0.16em] text-[#b7102a] uppercase">
            <ShieldAlert aria-hidden="true" className="h-4 w-4" />
            Provider Policy Matrix
          </p>
          <p className="neo-copy mt-2 max-w-3xl text-[10px] leading-5 font-black [overflow-wrap:anywhere] text-[#5f574d] uppercase">
            Provider-specific apply policy evidence only. Every provider remains limited to lookup,
            launch handoff, or official-client review until provider-approved launcher apply and
            terms approval exist.
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#efe3cf] px-3 py-2 text-[9px] font-black text-[#171411] uppercase shadow-[2px_2px_0_#171411]">
          {contract.providerPolicySummary.blocked}/{contract.providerPolicySummary.total} Blocked
        </span>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {contract.providerPolicyMatrix.map((policy) => (
          <ProviderPolicyCard key={policy.id} policy={policy} />
        ))}
      </div>
    </div>
  );
}

function ProviderPolicyCard({ policy }: { policy: ClientManagerProviderApplyPolicy }) {
  return (
    <article
      className={`border-2 border-black p-3 shadow-[2px_2px_0_#171411] ${policyStatusClass(
        policy.status,
      )}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="neo-copy text-[10px] font-black tracking-[0.12em] text-[#171411] uppercase">
          {policy.label}
        </h3>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black text-[#171411] uppercase">
          No provider-approved launcher apply
        </span>
      </div>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        <ProviderPolicyLine label="Terms" value="Terms not approved" />
        <ProviderPolicyLine label="Allowed" value={policy.allowedSurface} />
        <ProviderPolicyLine label="Risk" value={policy.risk} />
        <ProviderPolicyLine label="Next" value={policy.nextAction} />
      </div>
      <p className="neo-copy mt-2 border-2 border-black bg-[#171411] px-2 py-1 text-[8px] leading-4 font-black [overflow-wrap:anywhere] text-[#fff9ed] uppercase">
        {policy.terms}
      </p>
    </article>
  );
}

function ProviderPolicyLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black [overflow-wrap:anywhere] text-[#171411] uppercase">
      {label}: {value}
    </p>
  );
}

function SandboxProofConsole({
  contract,
  controls,
}: {
  contract: ClientManagerMountApplyContract;
  controls?: ClientManagerMountApplySandboxControls;
}) {
  const proof = contract.sandboxProof;

  return (
    <div
      aria-label="Client manager sandbox apply rollback proof"
      className="mt-4 border-2 border-black bg-[#f5eedf] p-3 shadow-[3px_3px_0_#171411]"
      role="region"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black tracking-[0.16em] text-[#b7102a] uppercase">
            <FileCheck2 aria-hidden="true" className="h-4 w-4" />
            Local Sandbox Proof
          </p>
          <h3 className="neo-title mt-1 text-2xl leading-none text-[#171411] uppercase">
            Apply / Rollback Rehearsal
          </h3>
          <p className="neo-copy mt-2 max-w-3xl text-[10px] leading-5 font-black [overflow-wrap:anywhere] text-[#5f574d] uppercase">
            Throwaway source and target paths only. Copies files, writes a local manifest, verifies
            hashes, then rolls back sandbox-owned files without provider folders, OS mounts,
            symlinks, junctions, admin elevation, or destructive client writes.
          </p>
        </div>
        <span
          className={`neo-copy border-2 border-black px-3 py-2 text-[9px] font-black uppercase shadow-[2px_2px_0_#171411] ${
            proof ? "bg-[#8cf5e4] text-[#171411]" : "bg-[#fff9ed] text-[#171411]"
          }`}
        >
          {proof ? "Sandbox Proof Ready" : "Awaiting Proof"}
        </span>
      </div>

      {controls ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="neo-copy min-w-0 text-[9px] font-black text-[#5f574d] uppercase">
            Source Path
            <textarea
              className="mt-1 block min-h-14 w-full resize-none border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] leading-4 font-black [overflow-wrap:anywhere] text-[#171411] uppercase shadow-[2px_2px_0_#171411]"
              rows={2}
              value={controls.sourcePath}
              onChange={(event) => controls.onSourcePathChange(event.currentTarget.value)}
            />
          </label>
          <label className="neo-copy min-w-0 text-[9px] font-black text-[#5f574d] uppercase">
            Target Path
            <textarea
              className="mt-1 block min-h-14 w-full resize-none border-2 border-black bg-[#fff9ed] px-3 py-2 text-[10px] leading-4 font-black [overflow-wrap:anywhere] text-[#171411] uppercase shadow-[2px_2px_0_#171411]"
              rows={2}
              value={controls.targetPath}
              onChange={(event) => controls.onTargetPathChange(event.currentTarget.value)}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[260px]">
            <button
              className="neo-copy inline-flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#087d6d] px-3 text-[9px] font-black text-white uppercase shadow-[3px_3px_0_#171411] disabled:opacity-60"
              disabled={
                controls.busy ||
                !controls.isDesktopRuntime ||
                !controls.sourcePath.trim() ||
                !controls.targetPath.trim()
              }
              type="button"
              onClick={() => void controls.onRunProof()}
            >
              <Play aria-hidden="true" className="h-4 w-4" />
              Run Proof
            </button>
            {controls.onLoadFixture ? (
              <button
                className="neo-copy inline-flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#fff9ed] px-3 text-[9px] font-black text-[#171411] uppercase shadow-[3px_3px_0_#171411]"
                disabled={controls.busy}
                type="button"
                onClick={controls.onLoadFixture}
              >
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                Load Fixture
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {controls?.message ? (
        <p className="neo-copy mt-3 border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[9px] leading-5 font-black [overflow-wrap:anywhere] text-[#171411] uppercase shadow-[2px_2px_0_#171411]">
          {controls.message}
        </p>
      ) : null}

      {proof ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            <ContractStat label="Files" value={proof.fileCount} />
            <ContractStat label="Verified" value={proof.verifiedFiles} />
            <ContractStat label="Bytes" value={proof.bytesCopied} />
            <ContractStat label="Rollback" value={proof.rollbackVerified ? 1 : 0} />
          </div>
          <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
            <p className="neo-copy text-[9px] font-black text-[#b7102a] uppercase">Proof Ledger</p>
            <p className="neo-copy mt-2 text-[9px] leading-5 font-black [overflow-wrap:anywhere] text-[#171411] uppercase">
              {proof.message}
            </p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              <ProofLine label="Proof ID" value={proof.proofId} />
              <ProofLine label="Manifest" value={proof.manifestPath} />
              <ProofLine label="Source" value={proof.sourcePath} />
              <ProofLine label="Target" value={proof.targetPath} />
              <ProofLine
                label="Provider Paths"
                value={proof.providerPathsTouched ? "touched" : "not touched"}
              />
              <ProofLine label="Mounts Created" value={proof.mountedPathsCreated ? "yes" : "no"} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ContractStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]">
      <span className="neo-copy block text-[8px] font-black text-[#b7102a] uppercase">{label}</span>
      <strong className="neo-title mt-1 block text-2xl leading-none text-[#171411] uppercase">
        {value}
      </strong>
    </div>
  );
}

function ProofLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="neo-copy border-2 border-black bg-[#efe3cf] px-2 py-1 text-[8px] leading-4 font-black [overflow-wrap:anywhere] text-[#171411] uppercase">
      {label}: {value}
    </p>
  );
}

function ClientManagerMountApplyLaneCard({ lane }: { lane: ClientManagerMountApplyLane }) {
  return (
    <article
      className={`min-h-[166px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${statusClass(
        lane.status,
      )}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black tracking-[0.16em] text-[#5f574d] uppercase">
            Apply Lane
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-base leading-tight font-black [overflow-wrap:anywhere] text-[#171411] uppercase">
            <Waypoints aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{lane.label}</span>
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black text-[#171411] uppercase">
          {lane.status}
        </span>
      </div>
      <p className="neo-copy mt-3 text-[10px] leading-5 font-black [overflow-wrap:anywhere] text-[#5f574d] uppercase">
        {lane.detail}
      </p>
      <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] leading-4 font-black [overflow-wrap:anywhere] text-[#171411] uppercase">
        {lane.action}
      </p>
    </article>
  );
}

function statusClass(status: ClientManagerMountApplyStatus) {
  if (status === "ready") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "review") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#efe3cf] text-[#171411]";
}

function policyStatusClass(status: ClientManagerProviderApplyPolicyStatus) {
  if (status === "review") return "bg-[#fff9ed] text-[#171411]";
  if (status === "manual-only") return "bg-[#f5eedf] text-[#171411]";
  return "bg-[#efe3cf] text-[#171411]";
}
