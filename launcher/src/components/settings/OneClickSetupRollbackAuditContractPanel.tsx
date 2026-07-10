import { ClipboardList, FileWarning, RotateCcw, ShieldCheck } from "lucide-react";

import type {
  OneClickSetupRollbackAuditContract,
  OneClickSetupRollbackAuditLane,
  OneClickSetupRollbackAuditStatus,
} from "../../lib/one-click-setup-rollback-audit-contract";

export function OneClickSetupRollbackAuditContractPanel({
  contract,
}: {
  contract: OneClickSetupRollbackAuditContract;
}) {
  return (
    <section
      aria-label="One-click setup rollback audit contract"
      className="neo-dots mb-6 border-4 border-black bg-[#fff9ed] p-4 shadow-[6px_6px_0_#171411]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-black pb-3">
        <div className="min-w-0">
          <p className="neo-copy text-[10px] font-black tracking-[0.22em] text-[#b7102a] uppercase">
            Rollback / Audit Rehearsal
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl leading-none text-[#171411] uppercase">
            <RotateCcw aria-hidden="true" className="h-8 w-8 shrink-0" />
            Setup Rollback Audit
          </h2>
          <p className="neo-copy mt-2 max-w-3xl text-xs leading-5 font-bold text-[#5f574d] uppercase">
            {contract.summary}
          </p>
        </div>
        <span
          className={`neo-copy border-2 border-black px-3 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#171411] ${statusClass(
            contract.blockedCount > 0 ? "blocked" : "pass",
          )}`}
        >
          {contract.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_280px]">
        <div className="border-2 border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#5f574d] uppercase">
            <ClipboardList aria-hidden="true" className="h-4 w-4" />
            Rehearsal Packet
          </p>
          <div className="mt-3 grid gap-2">
            <ContractStat label="Packet" value={contract.packetId} />
            <ContractStat label="Created" value={contract.createdAt} />
            <ContractStat label="Pass" value={`${contract.passCount}`} />
            <ContractStat label="Review" value={`${contract.reviewCount}`} />
            <ContractStat label="Blocked" value={`${contract.blockedCount}`} />
            <ContractStat label="Writes" value={`${contract.packet.writes.length}`} />
            <ContractStat label="Deletes" value={`${contract.packet.deletes.length}`} />
            <ContractStat label="Live Calls" value={`${contract.packet.liveCalls.length}`} />
          </div>
          <div className="mt-3 border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]">
            <p className="neo-copy flex items-center gap-2 text-[8px] font-black tracking-[0.14em] text-[#b7102a] uppercase">
              <FileWarning aria-hidden="true" className="h-3.5 w-3.5" />
              Failure Drill
            </p>
            <p className="neo-copy mt-2 text-[9px] leading-4 font-black break-words text-[#171411] uppercase">
              Step {contract.packet.auditEnvelope.stepId}
            </p>
            <p className="neo-copy mt-2 border-2 border-black bg-[#efe3cf] px-2 py-1 text-[8px] leading-4 font-black break-words text-[#171411] uppercase">
              {contract.packet.auditEnvelope.redactedError}
            </p>
            <p className="neo-copy mt-2 text-[8px] leading-4 font-black break-words text-[#5f574d] uppercase">
              Rollback executed {`${contract.packet.rollbackExecuted}`} / Audit persisted{" "}
              {`${contract.packet.auditPersisted}`}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {contract.lanes.map((lane) => (
            <RollbackLaneCard key={lane.id} lane={lane} />
          ))}
        </div>

        <div className="border-2 border-black bg-[#171411] p-3 text-[#fff9ed] shadow-[3px_3px_0_#b7102a]">
          <p className="neo-copy flex items-center gap-2 text-[10px] font-black text-[#8cf5e4] uppercase">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Rehearsal Guard
          </p>
          <p className="neo-copy mt-2 border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] leading-5 font-black uppercase">
            {contract.guardCopy}
          </p>
          <div className="mt-3 grid gap-2">
            {contract.packet.validationErrors.length > 0 ? (
              <p className="neo-copy border-2 border-[#fff9ed] bg-[#b7102a] px-3 py-2 text-[9px] leading-5 font-black text-white uppercase">
                {contract.packet.validationErrors.join(" / ")}
              </p>
            ) : (
              <p className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] leading-5 font-black uppercase">
                Validation errors 0
              </p>
            )}
            {contract.blockedClaims.map((claim) => (
              <p
                className="neo-copy border-2 border-[#fff9ed] bg-[#2a221b] px-3 py-2 text-[9px] leading-5 font-black uppercase"
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

function ContractStat({ label, value }: { label: string; value: string }) {
  return (
    <article className="border-2 border-black bg-[#fff9ed] p-2 shadow-[2px_2px_0_#171411]">
      <p className="neo-copy text-[8px] font-black tracking-[0.14em] text-[#b7102a] uppercase">
        {label}
      </p>
      <p className="neo-copy mt-1 text-[9px] leading-4 font-black break-words text-[#171411] uppercase">
        {value}
      </p>
    </article>
  );
}

function RollbackLaneCard({ lane }: { lane: OneClickSetupRollbackAuditLane }) {
  return (
    <article
      className={`min-h-[150px] border-2 border-black p-3 shadow-[3px_3px_0_#171411] ${statusClass(
        lane.status,
      )}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black tracking-[0.16em] text-[#5f574d] uppercase">
            {lane.surface}
          </p>
          <h3 className="neo-title mt-1 text-base leading-tight text-[#171411] uppercase">
            {lane.label}
          </h3>
        </div>
        <span className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black text-[#171411] uppercase">
          {lane.status}
        </span>
      </div>
      <p className="neo-copy mt-3 text-[10px] leading-5 font-black text-[#5f574d] uppercase">
        {lane.detail}
      </p>
      <p className="neo-copy mt-3 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] leading-4 font-black break-words text-[#171411] uppercase">
        {lane.evidence}
      </p>
      <p className="neo-copy mt-2 border-2 border-black bg-[#171411] px-2 py-1 text-[8px] leading-4 font-black break-words text-[#fff9ed] uppercase">
        {lane.skipped}
      </p>
    </article>
  );
}

function statusClass(status: OneClickSetupRollbackAuditStatus) {
  if (status === "pass") return "bg-[#8cf5e4] text-[#171411]";
  if (status === "blocked") return "bg-[#b7102a] text-white";
  return "bg-[#f5eedf] text-[#171411]";
}
