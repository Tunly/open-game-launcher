import { Copy, RadioTower, Search, ShieldCheck } from "lucide-react";

import type {
  LanTransferFirewallPlatformRule,
  LanTransferFirewallPolicyEvidence,
  LanTransferNativeCopyGate,
  LanTransferNativeCopyReadiness,
  LanTransferNativeCopyStatus,
  LanTransferPeerDiscoveryCandidate,
  LanTransferPeerDiscoveryPreflight,
} from "../../lib/lan-transfer-native-copy-readiness";

export function LanTransferNativeCopyReadinessPanel({
  readiness,
}: {
  readiness: LanTransferNativeCopyReadiness;
}) {
  const tone =
    readiness.blockedCount > 0 ? "blocked" : readiness.warningCount > 0 ? "warning" : "ready";

  return (
    <section
      aria-label="LAN transfer native readiness"
      className="border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Peer Copy Execution Preflight
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <Copy aria-hidden="true" className="h-8 w-8" />
            LAN Native Copy
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
            {readiness.summary}
          </p>
        </div>
        <span
          className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#171411] ${statusClass(
            tone,
          )}`}
        >
          {readiness.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy text-[10px] font-black uppercase text-[#5f574d]">Copy Score</p>
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
            <LanTransferNativeCopyGateCard gate={gate} key={gate.id} />
          ))}
        </div>

        <div className="grid gap-3">
          {readiness.peerDiscoveryPreflight ? (
            <LanTransferPeerDiscoveryCard evidence={readiness.peerDiscoveryPreflight} />
          ) : null}

          {readiness.firewallPolicyEvidence ? (
            <LanTransferFirewallPolicyCard evidence={readiness.firewallPolicyEvidence} />
          ) : null}

          <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
            <p className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase text-[#8cf5e4]">
              <ShieldCheck aria-hidden="true" className="h-4 w-4" />
              Copy Guard
            </p>
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
      </div>
    </section>
  );
}

function LanTransferPeerDiscoveryCard({
  evidence,
}: {
  evidence: LanTransferPeerDiscoveryPreflight;
}) {
  return (
    <article className="border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
            Discovery Contract
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-base font-black uppercase leading-tight text-[#171411]">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{evidence.label}</span>
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#efe3cf] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
          {evidence.status}
        </span>
      </div>
      <p className="neo-copy mt-3 text-[10px] font-black uppercase leading-5 text-[#5f574d]">
        {evidence.summary}
      </p>
      <div className="mt-3 grid gap-2">
        <PolicyLine label="Consent" value={evidence.consentOperation} />
        <PolicyLine label="Rate Limit" value={evidence.rateLimit} />
      </div>
      <div className="mt-3 grid gap-2">
        {evidence.candidates.map((candidate) => (
          <LanTransferPeerDiscoveryCandidateCard candidate={candidate} key={candidate.id} />
        ))}
      </div>
      <div className="mt-3 grid gap-2">
        {evidence.guards.map((guard) => (
          <p
            className="neo-copy border-2 border-black bg-[#efe3cf] px-3 py-2 text-[9px] font-black uppercase leading-5 text-[#171411]"
            key={guard}
          >
            {guard}
          </p>
        ))}
      </div>
    </article>
  );
}

function LanTransferPeerDiscoveryCandidateCard({
  candidate,
}: {
  candidate: LanTransferPeerDiscoveryCandidate;
}) {
  return (
    <div className="border-2 border-black bg-[#f5eedf] p-2">
      <p className="neo-copy text-[9px] font-black uppercase text-[#b7102a]">{candidate.label}</p>
      <PolicyLine label="Transport" value={candidate.transport} />
      <PolicyLine label="Endpoint" value={candidate.redactedEndpoint} />
      <PolicyLine label="Identity" value={candidate.identityProof} />
      <PolicyLine label="Selection" value={candidate.selectionPolicy} />
    </div>
  );
}

function LanTransferFirewallPolicyCard({
  evidence,
}: {
  evidence: LanTransferFirewallPolicyEvidence;
}) {
  return (
    <article className="border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
            Network Policy Evidence
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-base font-black uppercase leading-tight text-[#171411]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{evidence.label}</span>
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#efe3cf] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
          {evidence.status}
        </span>
      </div>
      <p className="neo-copy mt-3 text-[10px] font-black uppercase leading-5 text-[#5f574d]">
        {evidence.summary}
      </p>
      <div className="mt-3 grid gap-2">
        {evidence.guards.map((guard) => (
          <p
            className="neo-copy border-2 border-black bg-[#efe3cf] px-3 py-2 text-[9px] font-black uppercase leading-5 text-[#171411]"
            key={guard}
          >
            {guard}
          </p>
        ))}
      </div>
      <div className="mt-3 grid gap-2">
        {evidence.platformRules.map((rule) => (
          <LanTransferFirewallPlatformRuleCard key={rule.platform} rule={rule} />
        ))}
      </div>
    </article>
  );
}

function LanTransferFirewallPlatformRuleCard({ rule }: { rule: LanTransferFirewallPlatformRule }) {
  return (
    <div className="border-2 border-black bg-[#f5eedf] p-2">
      <p className="neo-copy text-[9px] font-black uppercase text-[#b7102a]">{rule.platform}</p>
      <PolicyLine label="Prompt" value={rule.prompt} />
      <PolicyLine label="Scope" value={rule.scope} />
      <PolicyLine label="Fallback" value={rule.fallback} />
      <PolicyLine label="Blocked" value={rule.blockedAutomation} />
    </div>
  );
}

function PolicyLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="neo-copy mt-1 text-[9px] font-black uppercase leading-4 text-[#5f574d]">
      <span className="text-[#171411]">{label}:</span> {value}
    </p>
  );
}

function LanTransferNativeCopyGateCard({ gate }: { gate: LanTransferNativeCopyGate }) {
  return (
    <article
      className={`min-h-[150px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${statusClass(
        gate.status,
      )}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#5f574d]">
            Transfer Gate
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-base font-black uppercase leading-tight text-[#171411]">
            <RadioTower aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{gate.label}</span>
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

function statusClass(status: LanTransferNativeCopyStatus) {
  if (status === "ready") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "warning") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#efe3cf] text-[#171411]";
}
