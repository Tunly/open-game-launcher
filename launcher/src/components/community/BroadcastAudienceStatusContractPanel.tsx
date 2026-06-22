import { Activity, RadioTower, RotateCcw, ShieldCheck, Users } from "lucide-react";

import type {
  BroadcastAudienceStatusContract,
  BroadcastAudienceStatusContractItem,
  BroadcastAudienceStatusContractStatus,
} from "../../lib/broadcast-audience-status-contract";

export function BroadcastAudienceStatusContractPanel({
  contract,
}: {
  contract: BroadcastAudienceStatusContract;
}) {
  return (
    <section
      aria-label="Broadcasting audience status contract"
      className="neo-dots border-4 border-black bg-[#fff9ed] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div>
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.22em] text-[#b7102a]">
            Local Audience Contract
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl uppercase text-[#171411]">
            <Users aria-hidden="true" className="h-8 w-8" />
            Audience Status Contract
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs font-bold uppercase leading-5 text-[#5f574d]">
            {contract.summary}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-3 py-2 text-[10px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411]">
          {contract.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid items-start gap-3 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        <div className="grid gap-3">
          <AudienceStat label="Review lanes" value={`${contract.reviewCount}`} />
          <AudienceStat label="Blocked lanes" value={`${contract.blockedCount}`} />
        </div>

        <div className="grid items-start gap-3 md:grid-cols-2">
          {contract.items.map((item) => (
            <AudienceContractCard item={item} key={item.id} />
          ))}
        </div>

        <div className="self-start border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black uppercase text-[#8cf5e4]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Audience Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] font-black uppercase leading-5">
            {contract.guardCopy}
          </p>
          <div className="mt-3 grid gap-2">
            {contract.guards.map((guard) => (
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

function AudienceStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
      <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#b7102a]">
        {label}
      </p>
      <p className="neo-title mt-1 text-5xl leading-none text-[#171411]">{value}</p>
    </article>
  );
}

function AudienceContractCard({ item }: { item: BroadcastAudienceStatusContractItem }) {
  const Icon =
    item.id === "rollback-clear-status"
      ? RotateCcw
      : item.id === "provider-live-state-event"
        ? RadioTower
        : item.id === "audience-count-snapshot" || item.id === "chat-presence-merge"
          ? Users
          : Activity;

  return (
    <article
      className={`min-h-[188px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${statusClass(
        item.status,
      )}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.16em] text-[#5f574d]">
            Audience Lane
          </p>
          <h3 className="mt-1 flex items-center gap-1.5 text-base font-black uppercase leading-tight text-[#171411]">
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
          {item.status}
        </span>
      </div>
      <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] px-2 py-2 text-[9px] font-black uppercase leading-4 text-[#171411]">
        {item.evidence}
      </p>
      <p className="neo-copy mt-3 text-[10px] font-black uppercase leading-5 text-[#5f574d]">
        {item.detail}
      </p>
      <p className="neo-copy mt-3 border-2 border-black bg-[#171411] px-2 py-2 text-[9px] font-black uppercase leading-4 text-[#fff9ed]">
        {item.action}
      </p>
    </article>
  );
}

function statusClass(status: BroadcastAudienceStatusContractStatus) {
  if (status === "review") return "bg-[#8cf5e4] text-[#171411]";
  return "bg-[#efe3cf] text-[#171411]";
}
