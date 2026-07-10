import { RadioTower, ShieldCheck, Video } from "lucide-react";

import type {
  BroadcastProviderPolicyEvidence,
  BroadcastProviderPolicyRule,
  BroadcastProviderReadiness,
  BroadcastProviderReadinessGate,
  BroadcastProviderReadinessStatus,
} from "../../lib/broadcast-provider-readiness";

export function BroadcastProviderReadinessPanel({
  readiness,
}: {
  readiness: BroadcastProviderReadiness;
}) {
  const tone =
    readiness.blockedCount > 0 ? "blocked" : readiness.warningCount > 0 ? "warning" : "ready";

  return (
    <section
      aria-label="Broadcasting provider readiness"
      className="border-4 border-black bg-[#fff9ed] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black tracking-[0.22em] text-[#b7102a] uppercase">
            Hosted Provider Preflight
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl text-[#171411] uppercase">
            <RadioTower aria-hidden="true" className="h-8 w-8" />
            Broadcast Provider Live Readiness
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs leading-5 font-bold text-[#5f574d] uppercase">
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
          <p className="neo-copy text-[10px] font-black text-[#5f574d] uppercase">Provider Score</p>
          <p className="neo-title mt-1 text-5xl text-[#171411] uppercase">
            {readiness.readyCount}/{readiness.gates.length}
          </p>
          <p className="neo-copy mt-2 text-[10px] leading-5 font-black text-[#5f574d] uppercase">
            Next: {readiness.nextAction}
          </p>
          <div className="mt-3 h-3 border-2 border-black bg-[#fff9ed]">
            <div className="h-full bg-[#087d6d]" style={{ width: `${readiness.progress}%` }} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {readiness.gates.map((gate) => (
            <BroadcastProviderGateCard gate={gate} key={gate.id} />
          ))}
        </div>

        <div className="grid gap-3">
          {readiness.providerPolicyEvidence ? (
            <BroadcastProviderPolicyCard evidence={readiness.providerPolicyEvidence} />
          ) : null}

          <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
            <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#8cf5e4] uppercase">
              <ShieldCheck aria-hidden="true" className="h-4 w-4" />
              Provider Guard
            </p>
            <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] leading-5 font-black uppercase">
              {readiness.guardCopy}
            </p>
            <div className="mt-3 grid gap-2">
              {readiness.guards.map((guard) => (
                <p
                  className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] leading-5 font-black uppercase"
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

function BroadcastProviderPolicyCard({ evidence }: { evidence: BroadcastProviderPolicyEvidence }) {
  return (
    <article className="border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="neo-copy text-[9px] font-black tracking-[0.16em] text-[#b7102a] uppercase">
            Provider Policy Evidence
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-base leading-tight font-black text-[#171411] uppercase">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{evidence.label}</span>
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#efe3cf] px-2 py-1 text-[8px] font-black text-[#171411] uppercase">
          {evidence.status}
        </span>
      </div>
      <p className="neo-copy mt-3 text-[10px] leading-5 font-black text-[#5f574d] uppercase">
        {evidence.summary}
      </p>
      <div className="mt-3 grid gap-2">
        {evidence.guards.map((guard) => (
          <p
            className="neo-copy border-2 border-black bg-[#efe3cf] px-3 py-2 text-[9px] leading-5 font-black text-[#171411] uppercase"
            key={guard}
          >
            {guard}
          </p>
        ))}
      </div>
      <div className="mt-3 grid gap-2">
        {evidence.providerRules.map((rule) => (
          <BroadcastProviderPolicyRuleCard key={rule.provider} rule={rule} />
        ))}
      </div>
    </article>
  );
}

function BroadcastProviderPolicyRuleCard({ rule }: { rule: BroadcastProviderPolicyRule }) {
  return (
    <div className="border-2 border-black bg-[#f5eedf] p-2">
      <p className="neo-copy text-[9px] font-black text-[#b7102a] uppercase">{rule.provider}</p>
      <PolicyLine label="Scope" value={rule.scopeBoundary} />
      <PolicyLine label="Limit" value={rule.stagingLimit} />
      <PolicyLine label="Redaction" value={rule.redaction} />
      <PolicyLine label="Blocked" value={rule.blockedAutomation} />
    </div>
  );
}

function PolicyLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="neo-copy mt-1 text-[9px] leading-4 font-black text-[#5f574d] uppercase">
      <span className="text-[#171411]">{label}:</span> {value}
    </p>
  );
}

function BroadcastProviderGateCard({ gate }: { gate: BroadcastProviderReadinessGate }) {
  return (
    <article
      className={`min-h-[150px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${statusClass(
        gate.status,
      )}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black tracking-[0.16em] text-[#5f574d] uppercase">
            Live Gate
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-base leading-tight font-black text-[#171411] uppercase">
            <Video aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{gate.label}</span>
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black text-[#171411] uppercase">
          {gate.status}
        </span>
      </div>
      <p className="neo-copy mt-3 text-[10px] leading-5 font-black text-[#5f574d] uppercase">
        {gate.detail}
      </p>
      <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[9px] leading-4 font-black text-[#171411] uppercase">
        {gate.action}
      </p>
    </article>
  );
}

function statusClass(status: BroadcastProviderReadinessStatus) {
  if (status === "ready") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "warning") return "bg-[#fff9ed] text-[#171411]";
  return "bg-[#efe3cf] text-[#171411]";
}
