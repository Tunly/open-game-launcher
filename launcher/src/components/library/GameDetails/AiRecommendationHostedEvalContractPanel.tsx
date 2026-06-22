import { BrainCircuit, ClipboardCheck, FlaskConical, RotateCcw, ShieldCheck } from "lucide-react";

import type {
  AiRecommendationHostedEvalContract,
  AiRecommendationHostedEvalContractLane,
  AiRecommendationHostedEvalContractStatus,
} from "../../../lib/ai-recommendation-hosted-eval-contract";

export function AiRecommendationHostedEvalContractPanel({
  contract,
}: {
  contract: AiRecommendationHostedEvalContract;
}) {
  return (
    <section
      aria-label="AI recommendation hosted eval contract"
      className="neo-dots border-4 border-black bg-[#fbf4e7] shadow-[3px_3px_0_#171411]"
    >
      <div className="border-b-2 border-black bg-[#171411] px-3 py-2 text-[#fbf4e7]">
        <p className="neo-copy text-[9px] font-black uppercase tracking-[0.14em] text-[#8cf5e4]">
          Local Hosted-Eval Review
        </p>
        <h2 className="mt-1 flex items-center gap-2 text-[15px] font-black uppercase leading-none">
          <FlaskConical aria-hidden="true" className="h-4 w-4" />
          AI Hosted Eval Contract
        </h2>
      </div>

      <div className="space-y-3 p-3">
        <div className="grid gap-2 border-2 border-black bg-[#efe3cf] p-3 shadow-[2px_2px_0_#171411]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="neo-copy text-[9px] font-black uppercase text-[#b7102a]">
                {contract.statusLabel}
              </p>
              <p className="neo-copy mt-1 break-words text-[8px] font-black uppercase leading-4 text-[#5b403f]">
                {contract.packetId}
              </p>
            </div>
            <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411]">
              {contract.createdAt}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <ContractStat label="Pass" value={`${contract.passCount}`} />
            <ContractStat label="Review" value={`${contract.reviewCount}`} />
            <ContractStat label="Blocked" value={`${contract.blockedCount}`} />
          </div>

          <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
            {contract.summary}
          </p>
        </div>

        <HostedEvalEvidenceLedger contract={contract} />

        <div className="grid gap-2">
          {contract.lanes.map((lane) => (
            <HostedEvalLaneCard lane={lane} key={lane.id} />
          ))}
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fbf4e7] shadow-[2px_2px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#8cf5e4]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Hosted Eval No-Claim Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4">
            {contract.guardCopy}
          </p>
          <div className="mt-2 grid gap-1.5">
            {contract.guards.map((guard) => (
              <p
                className="neo-copy border-2 border-[#fbf4e7] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4"
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

function HostedEvalEvidenceLedger({ contract }: { contract: AiRecommendationHostedEvalContract }) {
  return (
    <div className="border-2 border-black bg-[#fff9ed] p-3 shadow-[2px_2px_0_#171411]">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-black pb-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
            Local Contract Evidence
          </p>
          <h3 className="mt-1 text-sm font-black uppercase leading-none text-[#171411]">
            No-Write Gateway / Eval Ledger
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411]">
          Hash Pinned
        </span>
      </div>

      <dl className="mt-2 grid gap-1.5">
        <EvidenceFact label="Baseline" value={contract.evidence.deterministicBaselineHash} />
        <EvidenceFact label="Prompt" value={contract.evidence.promptRegressionSampleHash} />
        <EvidenceFact
          label="Provider"
          value={`${contract.evidence.blockedProviderTelemetryReplay.status}: ${contract.evidence.blockedProviderTelemetryReplay.replayId}`}
        />
        <EvidenceFact
          label="Rollback"
          value={`${contract.evidence.rollbackReadiness.rollbackAction}; ${contract.evidence.rollbackReadiness.fallback}`}
        />
      </dl>

      <div className="mt-2 grid gap-1.5">
        {contract.evidence.noWriteLedger.map((item) => (
          <article className="border-2 border-black bg-[#efe3cf] p-2" key={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[11px] font-black uppercase leading-none text-[#171411]">
                {item.label}
              </h4>
              <span className="neo-copy border-2 border-black bg-[#fff9ed] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411] shadow-[1px_1px_0_#171411]">
                {item.value}
              </span>
            </div>
            <p className="neo-copy mt-1 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
              {item.detail}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

function EvidenceFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-2 border-2 border-black bg-[#fbf4e7] px-2 py-1">
      <dt className="neo-copy text-[8px] font-black uppercase text-[#5b403f]">{label}</dt>
      <dd className="neo-copy break-words text-[8px] font-black uppercase leading-4 text-[#171411]">
        {value}
      </dd>
    </div>
  );
}

function ContractStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="border-2 border-black bg-[#fff9ed] p-2 shadow-[1px_1px_0_#171411]">
      <p className="neo-copy text-[8px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
        {label}
      </p>
      <p className="neo-title mt-1 text-2xl leading-none text-[#171411]">{value}</p>
    </article>
  );
}

function HostedEvalLaneCard({ lane }: { lane: AiRecommendationHostedEvalContractLane }) {
  return (
    <article
      className={`border-2 border-black p-2 shadow-[2px_2px_0_#171411] ${statusClass(lane.status)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.1em] text-[#5b403f]">
            {lane.status === "blocked" ? (
              <BrainCircuit aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            ) : lane.id === "rollout-rollback-gate" ? (
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ClipboardCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            )}
            {lane.surface}
          </p>
          <h3 className="mt-1 text-sm font-black uppercase leading-tight text-[#171411]">
            {lane.label}
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
          {lane.status}
        </span>
      </div>
      <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
        {lane.detail}
      </p>
      <p className="neo-copy mt-2 break-words border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
        {lane.evidence}
      </p>
      <p className="neo-copy mt-2 break-words border-2 border-black bg-[#171411] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#fbf4e7]">
        {lane.skipped}
      </p>
    </article>
  );
}

function statusClass(status: AiRecommendationHostedEvalContractStatus) {
  if (status === "pass") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "blocked") return "bg-[#b7102a] text-white";
  return "bg-[#f5eedf] text-[#171411]";
}
