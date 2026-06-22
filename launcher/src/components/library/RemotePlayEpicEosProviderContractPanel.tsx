import { Cloud, FileWarning, GitBranch, ShieldCheck } from "lucide-react";

import type {
  RemotePlayEpicEosFixtureReplay,
  RemotePlayEpicEosProviderContract,
  RemotePlayEpicEosProviderContractLane,
  RemotePlayEpicEosProviderContractStatus,
} from "../../lib/remote-play-epic-eos-provider-contract";

export function RemotePlayEpicEosProviderContractPanel({
  contract,
}: {
  contract: RemotePlayEpicEosProviderContract;
}) {
  return (
    <section
      aria-label="Epic/EOS Remote Play provider contract"
      className="neo-dots border-2 border-black bg-[#fff9ed] p-3 shadow-[3px_3px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-3">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.18em] text-[#b7102a]">
            Remote Play Provider Contract
          </p>
          <h3 className="neo-title mt-1 flex flex-wrap items-center gap-2 text-xl uppercase leading-none text-[#171411]">
            <Cloud aria-hidden="true" className="h-6 w-6 shrink-0" />
            Epic/EOS Provider States
          </h3>
          <p className="neo-copy mt-2 max-w-3xl text-[9px] font-black uppercase leading-4 text-[#5b403f]">
            {contract.summary}
          </p>
        </div>
        <span className="neo-copy border-2 border-black bg-[#b7102a] px-2 py-1 text-[8px] font-black uppercase text-white shadow-[2px_2px_0_#171411]">
          {contract.statusLabel}
        </span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="border-2 border-black bg-[#efe3cf] p-2 shadow-[2px_2px_0_#171411]">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#5f574d]">
            <FileWarning aria-hidden="true" className="h-4 w-4" />
            Fixture Packet
          </p>
          <div className="mt-2 grid gap-2">
            <ContractStat label="Packet" value={contract.packetId} />
            <ContractStat label="Created" value={contract.createdAt} />
            <ContractStat label="Pass" value={`${contract.passCount}`} />
            <ContractStat label="Review" value={`${contract.reviewCount}`} />
            <ContractStat label="Blocked" value={`${contract.blockedCount}`} />
          </div>
        </div>

        <div className="grid gap-2 xl:grid-cols-2">
          {contract.lanes.map((lane) => (
            <ProviderLaneCard key={lane.id} lane={lane} />
          ))}
        </div>

        <div className="border-2 border-black bg-[#f5eedf] p-2 shadow-[2px_2px_0_#171411] lg:col-span-2">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#5f574d]">
            <GitBranch aria-hidden="true" className="h-4 w-4" />
            Fixture State Replay
          </p>
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {contract.fixtureReplays.map((replay) => (
              <FixtureReplayCard key={replay.id} replay={replay} />
            ))}
          </div>
        </div>

        <div className="border-2 border-black bg-[#171411] p-2 text-[#fff9ed] shadow-[2px_2px_0_#b7102a] lg:col-span-2">
          <p className="neo-copy flex items-center gap-2 text-[9px] font-black uppercase text-[#8cf5e4]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Provider No-Claim Guard
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {contract.blockedClaims.map((claim) => (
              <p
                className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-2 py-1 text-[8px] font-black uppercase leading-4"
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

function FixtureReplayCard({ replay }: { replay: RemotePlayEpicEosFixtureReplay }) {
  return (
    <article className="border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]">
      <p className="neo-copy text-[8px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
        {replay.id}
      </p>
      <h4 className="neo-title mt-1 text-base uppercase leading-tight text-[#171411]">
        {replay.label}
      </h4>
      <p className="neo-copy mt-2 break-words border-2 border-black bg-[#efe3cf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
        {replay.from} -&gt; {replay.to}
      </p>
      <p className="neo-copy mt-2 break-words border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
        {replay.decision}
      </p>
      <p className="neo-copy mt-2 text-[8px] font-black uppercase leading-4 text-[#5b403f]">
        {replay.evidence}
      </p>
      <p className="neo-copy mt-2 break-words border-2 border-black bg-[#171411] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#fff9ed]">
        {replay.blockedClaim}
      </p>
    </article>
  );
}

function ContractStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]">
      <p className="neo-copy text-[8px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
        {label}
      </p>
      <p className="neo-copy mt-1 break-words text-[8px] font-black uppercase leading-4 text-[#171411]">
        {value}
      </p>
    </article>
  );
}

function ProviderLaneCard({ lane }: { lane: RemotePlayEpicEosProviderContractLane }) {
  return (
    <article
      className={`border-2 border-black p-2 shadow-[2px_2px_0_#171411] ${statusClass(lane.status)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[8px] font-black uppercase tracking-[0.14em] text-[#5f574d]">
            {lane.surface}
          </p>
          <h4 className="neo-title mt-1 text-base uppercase leading-tight text-[#171411]">
            {lane.label}
          </h4>
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
      <p className="neo-copy mt-2 break-words border-2 border-black bg-[#171411] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#fff9ed]">
        {lane.skipped}
      </p>
    </article>
  );
}

function statusClass(status: RemotePlayEpicEosProviderContractStatus) {
  if (status === "pass") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "blocked") return "bg-[#b7102a] text-white";
  return "bg-[#f5eedf] text-[#171411]";
}
