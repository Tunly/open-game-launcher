import { Database, ShieldCheck, Trophy } from "lucide-react";

import type {
  AchievementHostedHydrationContract,
  AchievementHostedHydrationContractLane,
  AchievementHostedHydrationContractStatus,
} from "../../lib/achievement-hosted-hydration-contract";

export function AchievementHostedHydrationContractPanel({
  contract,
}: {
  contract: AchievementHostedHydrationContract;
}) {
  return (
    <section
      aria-label="Achievement hosted hydration contract"
      className="neo-dots mx-auto max-w-[980px] border-4 border-black bg-[#fff9ed] p-4 shadow-[6px_6px_0_#171411] [overflow-wrap:anywhere]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Hosted Hydration Contract
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <Database aria-hidden="true" className="h-8 w-8" />
            Hydration Contract
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
            {contract.summary}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411]">
          {contract.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid items-start gap-3 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
        <div className="grid gap-3">
          <HydrationStat label="Pass lanes" value={`${contract.passCount}`} />
          <HydrationStat label="Review lanes" value={`${contract.reviewCount}`} />
        </div>

        <div className="grid items-start gap-3 md:grid-cols-2">
          {contract.lanes.map((lane) => (
            <HydrationContractLaneCard lane={lane} key={lane.id} />
          ))}
        </div>

        <div className="self-start border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase text-[#8cf5e4]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Hydration Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5">
            {contract.guardCopy}
          </p>
          <div className="mt-3 grid gap-2">
            {contract.blockedClaims.map((claim) => (
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

function HydrationStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
      <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
        {label}
      </p>
      <p className="neo-title mt-1 text-5xl leading-none text-[#171411]">{value}</p>
    </article>
  );
}

function HydrationContractLaneCard({ lane }: { lane: AchievementHostedHydrationContractLane }) {
  return (
    <article
      className={`min-h-[178px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${statusClass(
        lane.status,
      )}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#5f574d]">
            Contract Lane
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-base font-black uppercase leading-tight text-[#171411]">
            <Trophy aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{lane.label}</span>
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
          {lane.status}
        </span>
      </div>
      <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] px-2 py-2 text-[9px] font-black uppercase leading-4 text-[#171411]">
        {lane.evidence}
      </p>
      <p className="neo-copy mt-3 text-[10px] font-black uppercase leading-5 text-[#5f574d]">
        {lane.detail}
      </p>
    </article>
  );
}

function statusClass(status: AchievementHostedHydrationContractStatus) {
  if (status === "pass") return "bg-[#8cf5e4] text-[#171411]";
  return "bg-[#efe3cf] text-[#171411]";
}
